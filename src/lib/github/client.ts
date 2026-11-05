import 'server-only';
import { Octokit } from 'octokit';
import type { LocalizedText } from '../../i18n/errors';
import { DEFAULT_LOCALE, type Locale } from '../../i18n/locale';
import { installMessages } from '../../i18n/messages/install';
import { CLIENT_REPO_PREFIX, serverEnv } from '../env';
import { installationProblems, installationSettingsUrl } from '../installation/github-app';
import { CLIENT_ID_PATTERN } from '../schemas/client';
import type { GithubAccess } from './access';
import { InstallationAccessError, installationAuthStrategy, installationInfo } from './app-auth';
import { GithubError, rateLimitOf } from './errors';

/** Hata tipi saf modülde (`errors.ts`): testlerdeki çekirdekler de aynı sınıfı kullanır. */
export { GithubError };

/**
 * GitHub erişiminin tek kapısı.
 *
 * KORUMA KURALI (SPEC §9.2): token hesap seviyesinde geniş yetkili olduğu için
 * uygulama YALNIZCA iki tür repoya dokunabilir:
 *   1. uygulama repo'su (APP_REPO)
 *   2. `client-` önekli danışan repoları
 * Başka bir repo adı buraya gelirse istek hiç çıkmaz. Bu kontrol tek noktada,
 * bilerek: bir hata ya da kötü girdi gidip başka bir repoyu silemesin. GitHub uygulaması
 * modunda da aynen geçerli: kurulum "All repositories" ile hesabın bütün repolarına erişir.
 *
 * Kimlik iki moddan biri (`serverEnv().githubAccess`): kişisel anahtar (PAT, eski kurulumlar,
 * davranış aynı) ya da GitHub uygulamasının kurulum anahtarı (`app-auth.ts`). Repo açma/silme
 * uygulama modunda PT'nin kullanıcı anahtarıyla yapılır (`user-auth.ts`, `repos.ts`).
 */

/** Octokit'in kimlik seçenekleri: kişisel anahtar olduğu gibi, uygulamada kurulum anahtarı stratejisi. */
function authOptions(): { auth: string } | { authStrategy: typeof installationAuthStrategy } {
  const access = serverEnv().githubAccess;
  return access.mode === 'token' ? { auth: access.token } : { authStrategy: installationAuthStrategy };
}

let client: Octokit | null = null;

export function gh(): Octokit {
  client ??= new Octokit({ ...authOptions(), userAgent: 'openpt' });
  return client;
}

let sessionClient: Octokit | null = null;

/**
 * Antrenman kayıtlarının (seans, index, bitiş commit'i) GitHub istemcisi (tasarım §4.3). Aynı token ve
 * aynı repo kapısı (`assertRepoAllowed`, çağıran dosya işlerinde); farkı yeniden deneme ve bekleme:
 * - 409 (sha çakışması) ve 429 hiç yeniden denenmez: 409'da çekirdek taze okuyup bir kez birleştirir;
 *   eski sha'yla üç kez daha denemek (1 + 4 + 9 sn) yalnız süre ve kota harcardı.
 * - 5xx bir kez yeniden denenir.
 * - Sınıra takılınca Route Handler'ın içinde `Retry-After` (ya da 60 sn) beklenmez: hata hemen döner,
 *   uç 429 + `Retry-After` verir, telefon veriyi tutup üstel bekler.
 */
export function sessionWriter(): Octokit {
  sessionClient ??= new Octokit({
    ...authOptions(),
    userAgent: 'openpt',
    retry: { doNotRetry: [400, 401, 403, 404, 409, 410, 422, 429, 451], retries: 1 },
    throttle: { onRateLimit: () => false, onSecondaryRateLimit: () => false },
  });
  return sessionClient;
}

export function clientRepoName(clientId: string): string {
  if (!CLIENT_ID_PATTERN.test(clientId)) {
    throw new GithubError((l) => installMessages(l).github.badClientId(clientId), 400);
  }
  return `${CLIENT_REPO_PREFIX}${clientId}`;
}

export function isClientRepo(repo: string): boolean {
  return repo.startsWith(CLIENT_REPO_PREFIX) && CLIENT_ID_PATTERN.test(repo.slice(CLIENT_REPO_PREFIX.length));
}

/** İzin verilen repo mu? Değilse istek hiç gönderilmez. */
export function assertRepoAllowed(repo: string): void {
  const { appRepo } = serverEnv();
  if (repo === appRepo || isClientRepo(repo)) return;
  throw new GithubError((l) => installMessages(l).github.repoNotAllowed(repo, appRepo, CLIENT_REPO_PREFIX), 403);
}

export function owner(): string {
  return serverEnv().owner;
}

/** Hangi kimlikle çalışılıyor: `token` (kişisel anahtar) ya da `app` (GitHub uygulaması). */
export function githubMode(): GithubAccess['mode'] {
  return serverEnv().githubAccess.mode;
}

export type GithubConnection = {
  mode: GithubAccess['mode'];
  /** Bağlı GitHub hesabı: kişisel anahtarın sahibi ya da uygulamanın kurulu olduğu hesap. */
  login: string;
  /** Uygulama kurulumunun sorunları (PT'ye söylenecek sırayla); kişisel anahtarda boş. */
  problems: string[];
  /** Uygulama modunda GitHub'daki kurulum ayarı. */
  settingsUrl?: string;
};

/**
 * Kurulum durumu ve Ayarlar uyarısı için GitHub bağlantısının özeti. Kişisel anahtarda anahtarın sahibi
 * (`GET /user`); uygulamada kurulumun hesabı ve sorunları ("All repositories", izinler, askı) — kurulum
 * anahtarı `GET /user`'ı çağıramaz.
 */
export async function githubConnection(locale: Locale = DEFAULT_LOCALE): Promise<GithubConnection> {
  if (githubMode() === 'token') {
    const user = await gh().rest.users.getAuthenticated();
    return { mode: 'token', login: user.data.login, problems: [] };
  }
  const info = await installationInfo();
  return { mode: 'app', login: info.account, problems: installationProblems(info, owner(), locale), settingsUrl: installationSettingsUrl(info.id) };
}

export function appRepo(): string {
  return serverEnv().appRepo;
}

/**
 * Octokit hatalarını tek tipe indirger; 409/422 çakışma olarak işaretlenir. İstek sınırı (429 ya da
 * sınır kaynaklı 403) 429 olur ve `retryAfter`, `remaining` başlıklarını taşır (`rateLimitOf`): uç
 * telefona ne kadar bekleyeceğini söyleyebilsin. İzin 403'ü 403 kalır. `context` yol ya da kimlikse (iki dilde aynı)
 * metin, söz öbeğiyse okuyanın dilinde verilir (`(l) => installMessages(l).github.repoList`).
 */
export function toGithubError(error: unknown, context: string | LocalizedText): GithubError {
  // GitHub uygulamasının kurulumuna erişilemiyor: mesajı zaten Türkçe ve ne yapılacağını söylüyor.
  if (error instanceof InstallationAccessError) return error;
  const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : 500;
  const response = typeof error === 'object' && error && 'response' in error ? (error.response as { headers?: Record<string, unknown> }) : undefined;
  const message = error instanceof Error ? error.message : '';
  const rate = rateLimitOf(status, response?.headers, message);
  const where = (l: Locale) => (typeof context === 'function' ? context(l) : context);
  if (rate.rateLimited) return new GithubError((l) => installMessages(l).github.rateLimited(where(l)), 429, rate);
  if (status === 409 || status === 422) {
    return new GithubError((l) => installMessages(l).github.conflict(where(l)), 409, rate);
  }
  if (status === 404) return new GithubError((l) => installMessages(l).github.notFound(where(l)), 404);
  if (status === 403) return new GithubError((l) => installMessages(l).github.forbidden(where(l)), 403, rate);
  if (status === 401) return new GithubError((l) => installMessages(l).github.badToken(where(l)), 401);
  return new GithubError((l) => installMessages(l).github.unreachable(where(l)), 502, rate);
}
