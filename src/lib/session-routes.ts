import { DEFAULT_LOCALE, type Locale } from '../i18n/locale.ts';
import { clientWorkoutMessages } from '../i18n/messages/client-workout/index.ts';
import { langConfig } from '../i18n/valibot.ts';
import * as v from 'valibot';
import { originGuard, postGuard } from './client-auth-routes.ts';
import { describeError, GithubError } from './github/errors.ts';
import type { Client } from './schemas/client.ts';
import { finishBodySchema, patchBodySchema, sessionDocSchema, sessionIdSchema } from './schemas/session.ts';
import {
  deleteSession,
  finishSession,
  patchSession,
  putSession,
  readIndex,
  readSession,
  type SessionRepo,
} from './session-files-core.ts';
import type { ClientSession } from './session-core.ts';

/**
 * Danışanın antrenman uçlarının ince çekirdeği (tasarım §4.7): `/api/me/sessions`,
 * `/api/me/sessions/[id]` (GET, PUT, PATCH, DELETE), `/api/me/sessions/[id]/finish`. Uçlar isteği okuyup
 * buraya verir, sonucu yanıta çevirir; kararlar burada ve test edilir.
 *
 * - Kimlik yalnız oturumdan (SPEC §5): kayıtla doğrulanmış danışan, yalnız kendi `client-` repo'su.
 * - Durum değiştiren istekler yalnız bu siteden ve JSON'la (`/api/giris` gibi); DELETE gövdesiz, köken yeter.
 * - Gövde şemadan geçer; bilinmeyen alanlar (sağlık ayrıntısı dahil) atılır. Sağlık ayrıntısı yalnız
 *   bitişte ve onay varken `health.json`'a gider.
 * - GitHub sınırı: 429 + `Retry-After` (Route Handler beklemez); kota azaldıysa yanıtta `slow: true`
 *   (telefon birleştirme penceresini büyütür). Tek commit iki kez çakışırsa 503 + `Retry-After`.
 * - Günlüğe yazma sayısı için yalnız iş ve kimlik yazılır, değer yazılmaz.
 */

export type SessionRouteResult = { status: number; body: Record<string, unknown>; headers?: Record<string, string> };

/** Kota bu sayının altına inince telefona yavaşlaması söylenir (tasarım §4.3). */
export const SLOW_REMAINING = 500;
/** `Retry-After` başlığı gelmezse. */
const DEFAULT_RETRY_AFTER = 60;

export type SessionRouteDeps = {
  /** Yanıt mesajlarının dili (`localeFromRequest`); yoksa Türkçe. */
  locale?: Locale;
  session: ClientSession | null;
  /** Oturumun hâlâ geçerli olduğu danışan kaydı (`sessionClient`); yoksa null. */
  loadClient(session: ClientSession): Promise<Client | null>;
  repo(clientId: string): SessionRepo;
  timeZone(): Promise<string>;
  now(): Date;
  log(message: string): void;
};

export type Authorized = { client: Client; repo: SessionRepo };

function textOf(deps: Pick<SessionRouteDeps, 'locale'>) {
  return clientWorkoutMessages(deps.locale ?? DEFAULT_LOCALE).errors;
}

function expired(deps: SessionRouteDeps): SessionRouteResult {
  return { status: 401, body: { error: textOf(deps).expired } };
}

function notFound(deps: SessionRouteDeps): SessionRouteResult {
  return { status: 404, body: { error: textOf(deps).notFound } };
}

function gone(deps: SessionRouteDeps): SessionRouteResult {
  return { status: 410, body: { error: textOf(deps).gone, reason: 'deleted' } };
}

/** Seansın programı sabittir (`docs/design/kendi-program.md` §5.4): başka cihazdan farklı programla gelen yazılmaz. */
function programMismatch(deps: SessionRouteDeps): SessionRouteResult {
  return { status: 400, body: { error: textOf(deps).programMismatch, reason: 'program' } };
}

/** Yazımın bağlamı: an, saat dilimi ve commit mesajlarının dili (yazanın). */
async function contextOf(deps: SessionRouteDeps): Promise<{ now: Date; timeZone: string; locale?: Locale }> {
  return { now: deps.now(), timeZone: await deps.timeZone(), ...(deps.locale ? { locale: deps.locale } : {}) };
}

async function authorize(deps: SessionRouteDeps): Promise<Authorized | SessionRouteResult> {
  if (!deps.session) return expired(deps);
  const client = await deps.loadClient(deps.session);
  if (!client) return expired(deps);
  return { client, repo: deps.repo(client.id) };
}

function fieldsOf(issues: readonly v.BaseIssue<unknown>[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path?.map((segment) => String(segment.key as PropertyKey)).join('.') ?? '';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

function invalid(deps: SessionRouteDeps, issues: readonly v.BaseIssue<unknown>[]): SessionRouteResult {
  return { status: 400, body: { error: textOf(deps).invalid, fields: fieldsOf(issues) } };
}

function slow(remaining: number | null): Record<string, unknown> {
  return remaining !== null && remaining < SLOW_REMAINING ? { slow: true } : {};
}

/** GitHub hataları yanıta: sınır 429 + Retry-After, çakışma 503 + Retry-After, geri kalanı durumuyla. */
function failure(deps: SessionRouteDeps, error: unknown, context: string): SessionRouteResult {
  deps.log(`[seans] ${context}: ${describeError(error)}`);
  if (error instanceof GithubError && error.rateLimited) {
    const seconds = error.retryAfter ?? DEFAULT_RETRY_AFTER;
    return {
      status: 429,
      body: { error: textOf(deps).busy, retryAfter: seconds },
      headers: { 'Retry-After': String(seconds) },
    };
  }
  if (error instanceof GithubError && error.status === 409) {
    const seconds = error.retryAfter ?? 5;
    // i18n-followup(T2): `GithubError`'ın mesajı Türkçe ve dile göre değil; çakışma metni burada dile göre seçilir.
    const message = (deps.locale ?? DEFAULT_LOCALE) === DEFAULT_LOCALE ? error.message : textOf(deps).conflict;
    return { status: 503, body: { error: message, retryAfter: seconds }, headers: { 'Retry-After': String(seconds) } };
  }
  const status = error instanceof GithubError && error.status >= 400 && error.status < 600 ? error.status : 502;
  return { status, body: { error: textOf(deps).sendFailed } };
}

/**
 * Ucun ortak kapısı: kimlik biçimi, oturum ve kayıt, GitHub hatalarının yanıta çevrilmesi. Antrenman
 * ekranının öteki uçları (`workout-routes.ts`: gün planı, su) da bununla çalışır.
 */
export async function run(
  deps: SessionRouteDeps,
  id: string | null,
  context: string,
  work: (auth: Authorized) => Promise<SessionRouteResult>,
): Promise<SessionRouteResult> {
  if (id !== null && !v.is(sessionIdSchema, id)) return notFound(deps);
  try {
    const auth = await authorize(deps);
    if ('status' in auth) return auth;
    return await work(auth);
  } catch (error) {
    return failure(deps, error, `${deps.session?.clientId ?? '?'} ${id ?? ''} ${context}`.trim());
  }
}

/* --- okuma --- */

/** Geçmiş listesi: `sessions/` ağacıyla onarılmış index. */
export function indexRoute(deps: SessionRouteDeps): Promise<SessionRouteResult> {
  return run(deps, null, 'index', async ({ repo }) => {
    const result = await readIndex(repo);
    return { status: 200, body: { index: result.index, repaired: result.changed } };
  });
}

export function getRoute(deps: SessionRouteDeps, id: string): Promise<SessionRouteResult> {
  return run(deps, id, 'get', async ({ repo }) => {
    const result = await readSession(repo, id);
    if (result.status === 'missing') return notFound(deps);
    if (result.status === 'deleted') return gone(deps);
    return { status: 200, body: { doc: result.doc } };
  });
}

/* --- yazma --- */

/** `PUT`: birleştir + yaz (idempotent); birleşmiş belgeyi döner. */
export function putRoute(deps: SessionRouteDeps, headers: Headers, origin: string, id: string, input: unknown): Promise<SessionRouteResult> {
  const blocked = postGuard(headers, origin, deps.locale);
  if (blocked) return Promise.resolve(blocked);
  return run(deps, id, 'put', async ({ client, repo }) => {
    const parsed = v.safeParse(sessionDocSchema, input, langConfig(deps.locale ?? DEFAULT_LOCALE));
    if (!parsed.success) return invalid(deps, parsed.issues);
    if (parsed.output.id !== id) return { status: 400, body: { error: textOf(deps).otherSession } };
    const result = await putSession(repo, await contextOf(deps), parsed.output);
    switch (result.status) {
      case 'deleted':
        return gone(deps);
      case 'mismatch':
        return programMismatch(deps);
      case 'program':
        return { status: 400, body: { error: textOf(deps).programMissing, reason: 'program' } };
      case 'finished':
        return { status: 409, body: { error: textOf(deps).finishedElsewhere, reason: 'finished', doc: result.doc } };
      case 'unchanged':
        return { status: 200, body: { doc: result.doc, unchanged: true } };
      default:
        deps.log(`[seans] ${client.id} ${id} put ${result.status}`);
        return { status: result.status === 'created' ? 201 : 200, body: { doc: result.doc, ...slow(result.remaining) } };
    }
  });
}

/**
 * Bitiş: tek commit (seans + index + danışanın program güncellemesi + öneriler + onaylı sağlık ayrıntısı). Faz 3'te
 * dönüş yok: gövdedeki `rotation` (eski telefon) okunmaz, yanıtta `rotation` yok (telefon okumuyordu).
 */
export function finishRoute(deps: SessionRouteDeps, headers: Headers, origin: string, id: string, input: unknown): Promise<SessionRouteResult> {
  const blocked = postGuard(headers, origin, deps.locale);
  if (blocked) return Promise.resolve(blocked);
  return run(deps, id, 'finish', async ({ client, repo }) => {
    const parsed = v.safeParse(finishBodySchema, input, langConfig(deps.locale ?? DEFAULT_LOCALE));
    if (!parsed.success) return invalid(deps, parsed.issues);
    if (parsed.output.doc.id !== id) return { status: 400, body: { error: textOf(deps).otherSession } };
    const result = await finishSession(repo, { ...(await contextOf(deps)), client }, parsed.output);
    if (result.status === 'deleted') return gone(deps);
    if (result.status === 'mismatch') return programMismatch(deps);
    if (result.status === 'already') return { status: 200, body: { doc: result.doc, already: true } };
    deps.log(`[seans] ${client.id} ${id} finish`);
    return {
      status: 200,
      body: { doc: result.doc, health: result.plan.health, feedback: result.plan.feedback, ...slow(result.remaining) },
    };
  });
}

/** Geçmişte düzeltme: silme (iz listeleri), seans zorluğu, su, başka cihazda bitirilen seansa set ekleme. */
export function patchRoute(deps: SessionRouteDeps, headers: Headers, origin: string, id: string, input: unknown): Promise<SessionRouteResult> {
  const blocked = postGuard(headers, origin, deps.locale);
  if (blocked) return Promise.resolve(blocked);
  return run(deps, id, 'patch', async ({ client, repo }) => {
    const parsed = v.safeParse(patchBodySchema, input, langConfig(deps.locale ?? DEFAULT_LOCALE));
    if (!parsed.success) return invalid(deps, parsed.issues);
    const result = await patchSession(repo, await contextOf(deps), id, parsed.output);
    if (result.status === 'missing') return notFound(deps);
    if (result.status === 'deleted') return gone(deps);
    if (result.status === 'unchanged') return { status: 200, body: { doc: result.doc, unchanged: true } };
    deps.log(`[seans] ${client.id} ${id} patch`);
    return { status: 200, body: { doc: result.doc, ...slow(result.remaining) } };
  });
}

/** Antrenmanın tamamını siler: iz dosyası + index, tek commit, genel mesaj. */
export function deleteRoute(deps: SessionRouteDeps, headers: Headers, origin: string, id: string): Promise<SessionRouteResult> {
  const blocked = originGuard(headers, origin, deps.locale);
  if (blocked) return Promise.resolve(blocked);
  return run(deps, id, 'delete', async ({ client, repo }) => {
    const result = await deleteSession(repo, await contextOf(deps), id);
    deps.log(`[seans] ${client.id} ${id} delete ${result.status}`);
    return { status: 200, body: { ok: true, ...(result.status === 'already' ? { already: true } : {}) } };
  });
}
