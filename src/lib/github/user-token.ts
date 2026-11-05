import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import * as v from 'valibot';
import { installMessages } from '../../i18n/messages/install/index.ts';
import { SESSION_DAYS } from '../session-core.ts';

/**
 * PT'nin GitHub kullanıcı anahtarı (GitHub uygulaması modu) — saf çekirdek; çerezi ve ağı `user-auth.ts`
 * bağlar. Kişisel hesapta kurulum anahtarı repo açamaz; repo açma/silme PT'nin GitHub girişinden gelen bu
 * anahtarla yapılır. Anahtar sunucuda saklanmaz: şifreli, httpOnly bir çerezde durur.
 *
 * - Şifre: AES-256-GCM, her mühürde yeni 12 baytlık IV; çerezin adı ek doğrulanan veri (AAD). Anahtar
 *   `AUTH_SECRET`'tan HKDF-SHA256 ile türetilir (oturum imzasıyla aynı sır, ayrı amaç için ayrı anahtar).
 * - Kurcalanmış ya da başka sırla mühürlenmiş çerez açılmaz (null): "yeniden giriş yap" denir.
 * - GitHub'ın anahtarı 8 saat, yenileme anahtarı 6 ay geçerli; yenilemede ikisi de değişir, eskiler geçersizleşir.
 */

export const USER_TOKEN_COOKIE = 'pc_github';
/** Türkçe metin (eski çağrılar); hata `reauthError()`'da dile göre. */
export const REAUTH_MESSAGE = installMessages('tr').github.reauth;

export type UserToken = {
  /** Anahtarın sahibi (GitHub kullanıcı adı): yalnız `GITHUB_OWNER` ise kullanılır. */
  login: string;
  accessToken: string;
  /** Erişim anahtarının bittiği an (ms); süresiz anahtarda null. */
  expiresAt: number | null;
  refreshToken: string | null;
  refreshExpiresAt: number | null;
};

const VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;
/** Bitmesine bu kadar kalmış anahtar yenilenir: istek yoldayken süresi dolmasın. */
const REFRESH_MARGIN_MS = 5 * 60_000;
const SESSION_SECONDS = SESSION_DAYS * 24 * 60 * 60;

const TOKEN = v.pipe(v.string(), v.regex(/^[A-Za-z0-9_.-]{1,500}$/));
const SECONDS = v.pipe(v.number(), v.integer(), v.minValue(1));
const grantSchema = v.object({
  access_token: TOKEN,
  expires_in: v.optional(SECONDS),
  refresh_token: v.optional(TOKEN),
  refresh_token_expires_in: v.optional(SECONDS),
});
const storedSchema = v.object({
  login: v.pipe(v.string(), v.regex(/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i)),
  accessToken: TOKEN,
  expiresAt: v.nullable(v.number()),
  refreshToken: v.nullable(TOKEN),
  refreshExpiresAt: v.nullable(v.number()),
});

/** GitHub'ın anahtar yanıtı (giriş ya da yenileme) → saklanacak anahtar; geçersizse null. */
export function userTokenFromGrant(json: unknown, login: string, now: Date): UserToken | null {
  const parsed = v.safeParse(grantSchema, json);
  if (!parsed.success) return null;
  const grant = parsed.output;
  const at = (seconds: number | undefined) => (seconds ? now.getTime() + seconds * 1000 : null);
  const token = {
    login,
    accessToken: grant.access_token,
    expiresAt: at(grant.expires_in),
    refreshToken: grant.refresh_token ?? null,
    refreshExpiresAt: grant.refresh_token ? at(grant.refresh_token_expires_in) : null,
  };
  return v.is(storedSchema, token) ? token : null;
}

function key(secret: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, 'axon-fit', 'github-user-token/v1', 32));
}

export function sealUserToken(token: UserToken, secret: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key(secret), iv);
  cipher.setAAD(Buffer.from(USER_TOKEN_COOKIE));
  const body = Buffer.concat([cipher.update(JSON.stringify(token), 'utf8'), cipher.final()]);
  return `${VERSION}.${Buffer.concat([iv, body, cipher.getAuthTag()]).toString('base64url')}`;
}

export function openUserToken(value: string | undefined, secret: string): UserToken | null {
  if (!value?.startsWith(`${VERSION}.`)) return null;
  const raw = value.slice(VERSION.length + 1);
  if (!/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  const bytes = Buffer.from(raw, 'base64url');
  if (bytes.length <= IV_BYTES + TAG_BYTES) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key(secret), bytes.subarray(0, IV_BYTES));
    decipher.setAAD(Buffer.from(USER_TOKEN_COOKIE));
    decipher.setAuthTag(bytes.subarray(bytes.length - TAG_BYTES));
    const text = Buffer.concat([decipher.update(bytes.subarray(IV_BYTES, bytes.length - TAG_BYTES)), decipher.final()]).toString('utf8');
    const parsed = v.safeParse(storedSchema, JSON.parse(text));
    return parsed.success ? parsed.output : null;
  } catch {
    return null;
  }
}

/** Anahtar kullanılabilir mi, yenilenmeli mi, yoksa PT yeniden mi girmeli. */
export function userTokenStep(token: UserToken, now: Date): 'use' | 'refresh' | 'login' {
  if (token.expiresAt === null || token.expiresAt - REFRESH_MARGIN_MS > now.getTime()) return 'use';
  if (token.refreshToken && (token.refreshExpiresAt === null || token.refreshExpiresAt > now.getTime())) return 'refresh';
  return 'login';
}

/** Çerezin ömrü (sn): kullanılabileceği süre kadar, ama PT oturumundan (30 gün) uzun değil. */
export function userTokenCookieMaxAge(token: UserToken, now: Date): number {
  const until = token.refreshToken ? token.refreshExpiresAt : token.expiresAt;
  if (until === null) return SESSION_SECONDS;
  return Math.max(60, Math.min(SESSION_SECONDS, Math.floor((until - now.getTime()) / 1000)));
}

/**
 * Yenileme (GitHub: `grant_type=refresh_token`). Başarısızlıkta null: sebep (yanıt, anahtar) yukarı
 * taşınmaz; çağıran "yeniden giriş yap" der. Yenileme anahtarı tek kullanımlık: aynı anda iki yenileme
 * gelirse biri düşer, o istek de yeniden giriş ister.
 */
export async function refreshUserToken(
  token: UserToken,
  app: { clientId: string; clientSecret: string },
  now: Date,
  fetcher: typeof fetch = fetch,
): Promise<UserToken | null> {
  if (!token.refreshToken) return null;
  try {
    const response = await fetcher('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: app.clientId, client_secret: app.clientSecret, grant_type: 'refresh_token', refresh_token: token.refreshToken }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return null;
    return userTokenFromGrant(await response.json(), token.login, now);
  } catch {
    return null;
  }
}
