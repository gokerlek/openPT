import 'server-only';
import { LocalizedError } from '../i18n/errors';
import { installMessages } from '../i18n/messages/install';
import { githubAccessFrom, type GithubAccess } from './github/access';

/**
 * Sunucu ortam değişkenleri — TEK okuma noktası.
 *
 * `server-only` bilerek en üstte: bu modül bir client bileşeninden import edilirse
 * derleme hatası verir, yani GITHUB_TOKEN ya da GitHub uygulamasının özel anahtarı yanlışlıkla
 * tarayıcı paketine giremez. Hiçbir değişken NEXT_PUBLIC_ ile başlamaz.
 */

class EnvError extends LocalizedError {}

/** Çerez imzasının sırrı en az bu kadar bayt (HS256 anahtarı). */
const AUTH_SECRET_MIN_BYTES = 32;

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new EnvError((l) => installMessages(l).env.missing(name));
  }
  return value;
}

function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

export type ServerEnv = {
  /** GitHub kullanıcı adı: uygulama ve danışan repolarının sahibi. */
  owner: string;
  /** Uygulama repo'sunun adı (kişisel veri içermez). */
  appRepo: string;
  /**
   * GitHub'a hangi kimlikle gidileceği (`github/access.ts`, seçim tek yerde): GitHub uygulaması
   * (`GITHUB_APP_ID` + `GITHUB_APP_PRIVATE_KEY`) ya da kişisel anahtar (`GITHUB_TOKEN`, eski kurulumlar).
   * Yalnız sunucuda; asla log'lanmaz.
   */
  githubAccess: GithubAccess;
  /** Yalnız yedek e-posta kodu yolu için; GitHub girişinde kullanılmaz. */
  ptEmail: string;
  /** Oturum çerezlerini imzalayan sır. */
  authSecret: string;
  /**
   * GitHub ile giriş (PT'nin asıl giriş yöntemi). Uygulama modunda bunlar GitHub uygulamasının kendi
   * giriş bilgileridir; kullanıcı anahtarının yenilenmesi de bunlarla yapılır.
   */
  github?: { clientId: string; clientSecret: string };
  /** Yalnız yedek e-posta kodu yolu için; yoksa o yol kapalıdır. */
  resendApiKey?: string;
};

let cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (cached) return cached;

  const githubClientId = optional('GITHUB_CLIENT_ID');
  const githubClientSecret = optional('GITHUB_CLIENT_SECRET');
  const resendApiKey = optional('RESEND_API_KEY');

  // Üretimde en az bir giriş yöntemi zorunlu. Yerel geliştirmede ikisi de yoksa
  // `/api/dev/login` kullanılır; giriş kodu hiçbir koşulda günlüğe yazılmaz.
  if (process.env.NODE_ENV === 'production' && !githubClientId && !resendApiKey) {
    throw new EnvError((l) => installMessages(l).env.noLogin);
  }
  if (Boolean(githubClientId) !== Boolean(githubClientSecret)) {
    throw new EnvError((l) => installMessages(l).env.oauthPair);
  }
  // Oturum çerezleri HS256 ile bu sırla imzalanır; kısa sır çevrimdışı kırılıp PT çerezi sahtelenebilir.
  const authSecret = required('AUTH_SECRET');
  if (Buffer.byteLength(authSecret, 'utf8') < AUTH_SECRET_MIN_BYTES) {
    throw new EnvError((l) => installMessages(l).env.secretShort(AUTH_SECRET_MIN_BYTES));
  }

  cached = {
    owner: required('GITHUB_OWNER'),
    appRepo: required('APP_REPO'),
    githubAccess: githubAccessFrom(process.env),
    ptEmail: (optional('PT_EMAIL') ?? '').trim().toLowerCase(),
    authSecret,
    ...(githubClientId && githubClientSecret
      ? { github: { clientId: githubClientId, clientSecret: githubClientSecret } }
      : {}),
    ...(resendApiKey ? { resendApiKey } : {}),
  };
  return cached;
}

/**
 * Yedek e-posta kodu yolu açık mı (SPEC §2, §5): yalnız `RESEND_API_KEY` tanımlıysa, ortam ne
 * olursa olsun. Giriş sayfası, kod isteme ve doğrulama uçları ve e-postayla açılmış PT oturumu
 * hep buna bakar; anahtar kaldırılınca yol bütünüyle kapanır.
 */
export function emailLoginEnabled(): boolean {
  return Boolean(optional('RESEND_API_KEY'));
}

/** Danışan repolarının adı hep bu önekle başlar (koruma kuralı, SPEC §9.2). */
export const CLIENT_REPO_PREFIX = 'client-';
