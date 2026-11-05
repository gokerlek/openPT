import { DEFAULT_LOCALE, type Locale } from '../i18n/locale.ts';
import { clientProgramsMessages } from '../i18n/messages/client-programs/index.ts';
import { langConfig } from '../i18n/valibot.ts';
import * as v from 'valibot';
import { originGuard, postGuard } from './client-auth-routes.ts';
import { blockedText } from './exercise-caution.ts';
import { deleteOwnProgram, saveOwnProgram, selectOwnActive, shareOwnProgram, type OwnGuard, type OwnLibrary, type OwnSaveResult } from './own-program-files.ts';
import { isOwnProgramId, OWN_PROGRAM_LIMITS } from './own-programs.ts';
import type { DiffContext } from './program-diff.ts';
import type { Client } from './schemas/client.ts';
import { ownProgramActiveSchema, ownProgramSaveSchema, ownProgramShareSchema } from './schemas/own-program.ts';
import { run, type SessionRouteDeps, type SessionRouteResult } from './session-routes.ts';

/**
 * Danışanın kendi program uçlarının ince çekirdeği (`docs/design/kendi-program.md` §6): `PUT` ve `DELETE
 * /api/me/programs/[pid]`, `POST /api/me/programs/[pid]/share`, `POST /api/me/programs/active`. Uçlar isteği
 * okuyup buraya verir; kararlar burada ve test edilir.
 *
 * - Kimlik yalnız oturumdan (`run()`: oturum, kayıt, GitHub hataları → 429/503). Durum değiştirenler yalnız bu
 *   siteden ve JSON'la (`postGuard`); DELETE gövdesiz, köken yeter (`originGuard`).
 * - `pid` yol kurulmadan önce `^op_[a-z0-9]{8}$` ile denetlenir; uymazsa 404 (dosya adı yalnız kimlikten).
 * - Kayıtta kısıt denetimi (`guard`): kütüphaneden eklenen izinsiz yasaklı hareket 400, satırın alanında
 *   "Bu hareket şu an sana önerilmiyor; antrenörüne sor." (409 değil: istemci 409'u bir kez yeniden dener).
 */

export type OwnRouteDeps = SessionRouteDeps & {
  /** Kütüphane denetimi (egzersiz ve cihaz kimlikleri) ve geçmişin cümleleri için adlar. */
  library(): Promise<{ library: OwnLibrary; ctx: DiffContext }>;
  /** Danışanın kısıtları (`conditions` onayıyla): kayıtta eklenen yasaklı hareketi reddetmek için; yoksa null. */
  guard?(client: Client): Promise<OwnGuard | null>;
};

function missing(locale: Locale = DEFAULT_LOCALE): SessionRouteResult {
  return { status: 404, body: { error: clientProgramsMessages(locale).errors.missing } };
}

function badRequest(locale: Locale = DEFAULT_LOCALE): SessionRouteResult {
  return { status: 400, body: { error: clientProgramsMessages(locale).errors.badRequest } };
}

function fieldsOf(issues: readonly v.BaseIssue<unknown>[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path?.map((segment) => String(segment.key as PropertyKey)).join('.') ?? '';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

/** Kaydın sonucu yanıta (danışan ve PT uçları ortak). */
export function saveResponse(result: OwnSaveResult, by: 'client' | 'pt', locale: Locale = DEFAULT_LOCALE): SessionRouteResult {
  const t = clientProgramsMessages(locale).errors;
  switch (result.status) {
    case 'created':
      return {
        status: 201,
        body: { id: result.program.id, revision: result.program.revision, droppedDevices: result.droppedDevices, ...(result.activated ? { activated: true } : {}) },
      };
    case 'saved':
      return { status: 200, body: { id: result.program.id, revision: result.program.revision, droppedDevices: result.droppedDevices } };
    case 'unchanged':
      return { status: 200, body: { id: result.program.id, revision: result.program.revision, unchanged: true, droppedDevices: result.droppedDevices } };
    case 'invalid':
      return { status: 400, body: { error: t.check, fields: result.errors } };
    case 'blocked':
      return { status: 400, body: { error: blockedText(locale), reason: 'blocked', fields: result.errors } };
    case 'missing':
      return { status: 404, body: { error: t.deleted, reason: 'missing' } };
    case 'stale':
      return { status: 412, body: { error: by === 'pt' ? t.staleForPt : t.stale } };
    case 'exists':
      return { status: 409, body: { error: t.exists, reason: 'exists' } };
    case 'limit':
      return { status: 409, body: { error: t.limit(OWN_PROGRAM_LIMITS.programs), reason: 'limit' } };
    case 'forbidden':
      return { status: 403, body: { error: t.unshared, reason: 'unshared' } };
  }
}

/** Oluştur (`baseRevision: null`) ya da kaydet; ad oluştururken zorunlu. */
export function saveOwnRoute(deps: OwnRouteDeps, headers: Headers, origin: string, pid: string, input: unknown): Promise<SessionRouteResult> {
  const locale = deps.locale ?? DEFAULT_LOCALE;
  const t = clientProgramsMessages(locale);
  const blocked = postGuard(headers, origin, locale);
  if (blocked) return Promise.resolve(blocked);
  if (!isOwnProgramId(pid)) return Promise.resolve(missing(locale));
  return run(deps, null, 'own-program', async ({ client, repo }) => {
    const parsed = v.safeParse(ownProgramSaveSchema, input, langConfig(locale));
    if (!parsed.success) return { status: 400, body: { error: t.errors.check, fields: fieldsOf(parsed.issues) } };
    if (parsed.output.baseRevision === null && parsed.output.name === undefined) return { status: 400, body: { error: t.errors.check, fields: { name: t.name.empty } } };
    const [{ library, ctx }, guard] = await Promise.all([deps.library(), deps.guard ? deps.guard(client) : null]);
    const result = await saveOwnProgram(repo, { id: pid, body: parsed.output, by: 'client', library, ctx: { ...ctx, locale }, now: deps.now(), guard });
    if (result.status === 'created' || result.status === 'saved') deps.log(`[kendi program] ${client.id} ${result.status}`);
    return saveResponse(result, 'client', locale);
  });
}

/** Sil; yarım antrenman bu programdansa 409 ve seansın kimliği ([Yarım antrenmanı sil]). */
export function deleteOwnRoute(deps: SessionRouteDeps, headers: Headers, origin: string, pid: string): Promise<SessionRouteResult> {
  const locale = deps.locale ?? DEFAULT_LOCALE;
  const blocked = originGuard(headers, origin, locale);
  if (blocked) return Promise.resolve(blocked);
  if (!isOwnProgramId(pid)) return Promise.resolve(missing(locale));
  return run(deps, null, 'own-program-delete', async ({ client, repo }) => {
    const result = await deleteOwnProgram(repo, pid, deps.now(), locale);
    if (result.status === 'missing') return missing(locale);
    if (result.status === 'active_session') {
      return { status: 409, body: { error: clientProgramsMessages(locale).errors.activeSession, reason: 'active_session', sessionId: result.sessionId } };
    }
    deps.log(`[kendi program] ${client.id} silindi`);
    return { status: 200, body: { ok: true } };
  });
}

/** Paylaş ya da kapat (`{ shared }`); revision artmaz. */
export function shareOwnRoute(deps: SessionRouteDeps, headers: Headers, origin: string, pid: string, input: unknown): Promise<SessionRouteResult> {
  const locale = deps.locale ?? DEFAULT_LOCALE;
  const blocked = postGuard(headers, origin, locale);
  if (blocked) return Promise.resolve(blocked);
  if (!isOwnProgramId(pid)) return Promise.resolve(missing(locale));
  return run(deps, null, 'own-program-share', async ({ repo }) => {
    const parsed = v.safeParse(ownProgramShareSchema, input);
    if (!parsed.success) return badRequest(locale);
    const result = await shareOwnProgram(repo, pid, parsed.output.shared, deps.now(), locale);
    if (result.status === 'missing') return missing(locale);
    if (result.status === 'invalid') return { status: 409, body: { error: clientProgramsMessages(locale).errors.unavailable } };
    return { status: 200, body: { shared: Boolean(result.program.shared), ...(result.status === 'unchanged' ? { unchanged: true } : {}) } };
  });
}

/** Bugün'ün programı (kalıcı seçim): kendi programın kimliği ya da null (PT'nin programı). Yarım antrenman engellemez. */
export function activeOwnRoute(deps: SessionRouteDeps, headers: Headers, origin: string, input: unknown): Promise<SessionRouteResult> {
  const locale = deps.locale ?? DEFAULT_LOCALE;
  const blocked = postGuard(headers, origin, locale);
  if (blocked) return Promise.resolve(blocked);
  return run(deps, null, 'own-program-active', async ({ repo }) => {
    const parsed = v.safeParse(ownProgramActiveSchema, input);
    if (!parsed.success) return badRequest(locale);
    const result = await selectOwnActive(repo, parsed.output.programId, deps.now(), locale);
    if (result.status === 'missing') return missing(locale);
    return { status: 200, body: { active: parsed.output.programId, ...(result.status === 'unchanged' ? { unchanged: true } : {}) } };
  });
}
