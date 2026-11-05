import * as v from 'valibot';
import { DEFAULT_LOCALE, type Locale } from '../i18n/locale.ts';
import { authMessages } from '../i18n/messages/auth/index.ts';
import { langConfig } from '../i18n/valibot.ts';
import { INVITE_CODE_LENGTH, normalizeInviteCode, PASSWORD_MAX_LENGTH } from './client-status.ts';
import type { loginWithPassword, redeemInvite, setClientPassword } from './clients-core.ts';
import { describeError } from './github/errors.ts';
import { passwordProblem } from './password-rules.ts';
import { setPasswordSchema } from './schemas/auth.ts';
import { clientIdSchema } from './schemas/client.ts';
import type { ClientSession } from './session-core.ts';

/**
 * Danışan giriş uçlarının ince çekirdeği (SPEC §5): `/api/join`, `/api/giris`, `/api/me/password`.
 * Uçlar yalnız isteği okuyup buraya verir ve sonucu yanıta çevirir; kararlar (tek tip yanıt,
 * bilinmeyen kimliğin GitHub'a gitmemesi, oturumun taşıdığı alanlar, köken denetimi) burada ve test
 * edilir. Şifre ne yanıta ne günlüğe yazılır.
 */

// i18n-followup(T3): `api/me/**` uçları (`/api/me/password`, oturum/antrenman/kısıt uçları) `originGuard`/`postGuard`'a ve
// `setPasswordRoute`'un `deps.locale`'ine `localeFromRequest(request)`'i geçirmeli; şimdilik yanıtları Türkçe.
export type RouteResult = { status: number; body: Record<string, unknown> };

type Log = (message: string) => void;
type CreateSession = (session: ClientSession) => Promise<void>;

function refererOrigin(referer: string | null): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

/**
 * Yalnız bu siteden: köken başlığı yoksa Referer'ın kökeni; ikisi de yoksa ya da başka bir kökense 403.
 * Gövdesiz durum değiştiren istekler (DELETE) yalnız buna bakar.
 */
export function originGuard(headers: Headers, expectedOrigin: string, locale: Locale = DEFAULT_LOCALE): RouteResult | null {
  const source = headers.get('origin') ?? refererOrigin(headers.get('referer'));
  return source === expectedOrigin ? null : { status: 403, body: { error: authMessages(locale).routes.foreignOrigin } };
}

/**
 * Durum değiştiren danışan POST'ları yalnız bu siteden ve JSON'la (giriş CSRF'sine karşı; çerezin
 * SameSite=Lax'ı tek savunma kalmasın). Köken başlığı yoksa Referer'ın kökeni; ikisi de yoksa ya da
 * başka bir kökense 403. JSON değilse 415: `text/plain` form gönderimi de ayrıştırılmasın.
 */
export function postGuard(headers: Headers, expectedOrigin: string, locale: Locale = DEFAULT_LOCALE): RouteResult | null {
  const blocked = originGuard(headers, expectedOrigin, locale);
  if (blocked) return blocked;
  const type = headers.get('content-type')?.trim().toLowerCase() ?? '';
  if (type !== 'application/json' && !type.startsWith('application/json;')) {
    return { status: 415, body: { error: authMessages(locale).routes.jsonRequired } };
  }
  return null;
}

/* --- /api/join --- */

function joinReasons(locale: Locale): Record<string, string> {
  return authMessages(locale).routes.join;
}

const joinBody = v.object({ clientId: v.string(), code: v.string() });

/**
 * Kare kodla giriş, birinci adım. Oturum kodun kullanıldığı anı taşır (`joinedAt`): yalnız bu oturum,
 * 60 dk içinde, şifre belirleyebilir. Bilinmeyen kimlik ile davetsiz danışan aynı yanıtı alır.
 */
export async function joinRoute(
  deps: {
    isKnownClient(id: string): Promise<boolean>;
    redeem(id: string, code: string): ReturnType<typeof redeemInvite>;
    createSession: CreateSession;
    log: Log;
    /** Yanıt mesajlarının dili (`localeFromRequest`); yoksa Türkçe. */
    locale?: Locale;
  },
  input: unknown,
): Promise<RouteResult> {
  const locale = deps.locale ?? DEFAULT_LOCALE;
  const t = authMessages(locale).routes;
  const reasons = joinReasons(locale);
  const body = v.safeParse(joinBody, input);
  if (!body.success || !v.is(clientIdSchema, body.output.clientId)) return { status: 400, body: { error: reasons.none } };
  const code = normalizeInviteCode(body.output.code);
  if (!new RegExp(`^\\d{${INVITE_CODE_LENGTH}}$`).test(code)) {
    const message = t.codeLength(INVITE_CODE_LENGTH);
    return { status: 400, body: { error: message, fields: { code: message } } };
  }
  const { clientId } = body.output;
  try {
    // Listede olmayan kimlik GitHub'a hiç gitmez; davetsiz danışanla aynı yanıtı alır.
    if (!(await deps.isKnownClient(clientId))) return { status: 410, body: { error: reasons.none } };
    const result = await deps.redeem(clientId, code);
    if (!result.ok) return { status: result.reason === 'invalid' ? 401 : 410, body: { error: reasons[result.reason] } };
    await deps.createSession({
      role: 'client',
      clientId: result.client.id,
      accessVersion: result.client.access.version,
      joinedAt: result.joinedAt,
    });
    return { status: 200, body: { ok: true } };
  } catch (error) {
    // GitHub'a ulaşılamadı ya da istek sınırı doldu: "kod yanlış" denmez. Kod günlüğe yazılmaz.
    deps.log(`[katil] ${clientId}: ${describeError(error)}`);
    return { status: 502, body: { error: t.unavailable } };
  }
}

/* --- /api/giris --- */

/**
 * Kilitli, yanlış, şifresiz, erişimi kapalı, arşivde ya da bilinmeyen kimlik: hepsi aynı yanıt
 * (durum ve metin). Yanıttan hesabın durumu anlaşılmasın.
 */
export const LOGIN_DENIED = authMessages('tr').routes.loginDenied;

const loginBody = v.object({ clientId: v.string(), password: v.string() });

/**
 * Şifreyle giriş. Doğruysa oturum kayıttaki kuşakla açılır ve kare kod anı TAŞIMAZ: şifreyle açılan
 * oturum şifre değiştiremez. Listede olmayan ya da bozuk kimlik, sınırı aşan şifre GitHub'a gitmez.
 */
export async function passwordLoginRoute(
  deps: {
    isKnownClient(id: string): Promise<boolean>;
    login(id: string, password: string): ReturnType<typeof loginWithPassword>;
    createSession: CreateSession;
    log: Log;
    /** Yanıt mesajlarının dili (`localeFromRequest`); yoksa Türkçe. */
    locale?: Locale;
  },
  input: unknown,
): Promise<RouteResult> {
  const t = authMessages(deps.locale ?? DEFAULT_LOCALE).routes;
  const denied = { status: 401, body: { error: t.loginDenied } };
  const body = v.safeParse(loginBody, input);
  if (!body.success) return { status: 400, body: { error: t.invalidRequest } };
  const { clientId, password } = body.output;
  if (!password) return { status: 400, body: { error: t.passwordRequired, fields: { password: t.passwordRequired } } };
  // Sınırı aşan şifre doğru olamaz (UTF-16'da karakter başına en çok 2 birim): deneme de sayılmaz.
  if (!v.is(clientIdSchema, clientId) || password.length > PASSWORD_MAX_LENGTH * 2) return denied;
  try {
    if (!(await deps.isKnownClient(clientId))) return denied;
    const result = await deps.login(clientId, password);
    if (!result.ok) return denied;
    await deps.createSession({ role: 'client', clientId, accessVersion: result.client.access.version });
    return { status: 200, body: { ok: true } };
  } catch (error) {
    // GitHub'a ulaşılamadı ya da aynı anda başka bir deneme sayacı yazdı: "şifre yanlış" denmez.
    deps.log(`[giris] ${clientId}: ${describeError(error)}`);
    return { status: 502, body: { error: t.unavailable } };
  }
}

/* --- /api/me/password --- */

/**
 * Şifre belirleme: kimlik yalnız oturumdan. İzin oturuma bağlı (`canSetPassword`): izinsiz oturum 409,
 * geçersiz oturum 401. Kural hataları alanın altında (400, `fields`).
 */
export async function setPasswordRoute(
  deps: {
    session: ClientSession | null;
    setPassword(session: ClientSession, password: string): ReturnType<typeof setClientPassword>;
    log: Log;
    /** Yanıt mesajlarının dili (`localeFromRequest`); yoksa Türkçe. */
    locale?: Locale;
  },
  input: unknown,
): Promise<RouteResult> {
  const { session } = deps;
  const locale = deps.locale ?? DEFAULT_LOCALE;
  const t = authMessages(locale).routes;
  if (!session) return { status: 401, body: { error: t.sessionClosed } };
  const body = v.safeParse(setPasswordSchema, input, langConfig(locale));
  if (!body.success) {
    const fields: Record<string, string> = {};
    for (const issue of body.issues) {
      const key = issue.path?.map((segment) => String(segment.key as PropertyKey)).join('.');
      if (key && !fields[key]) fields[key] = issue.message;
    }
    return { status: 400, body: { error: fields.password ?? fields.confirm ?? t.invalidRequest, fields } };
  }
  try {
    const result = await deps.setPassword(session, body.output.password);
    if (result.ok) return { status: 200, body: { ok: true } };
    if (result.reason === 'weak') {
      const problem = passwordProblem(body.output.password, locale) ?? result.problem;
      return { status: 400, body: { error: problem, fields: { password: problem } } };
    }
    if (result.reason === 'session') return { status: 401, body: { error: t.sessionEnded } };
    return { status: 409, body: { error: t.passwordNotAllowed } };
  } catch (error) {
    // GitHub'a ulaşılamadı ya da iki sekme aynı anda yazdı: danışan yeniden dener.
    deps.log(`[sifre] ${session.clientId}: ${describeError(error)}`);
    return { status: 502, body: { error: t.passwordNotSaved } };
  }
}
