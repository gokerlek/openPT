import 'server-only';
import { createAppAuth } from '@octokit/auth-app';
import { LocalizedError } from '../../i18n/errors';
import type { Locale } from '../../i18n/locale';
import { installMessages } from '../../i18n/messages/install';
import { serverEnv } from '../env';
import { githubAppApi, GithubAppError } from '../installation/github-app-api';
import { installationSettingsUrl, type InstallationInfo } from '../installation/github-app';
import type { GithubAccess } from './access';
import { appJwt } from './app-jwt';
import { GithubError } from './errors';
import { installationTokens } from './installation-tokens';

/**
 * GitHub uygulaması modunun kurulum anahtarı (installation token) — tasarım B1.
 *
 * Okuma/yazmanın hepsi (veri reposu, danışan repoları, kod reposu güncellemeleri) kurulum anahtarıyla:
 * `@octokit/auth-app` anahtarı alır, önbellekte tutar ve süresi bitmeden yeniler. Kurulum kimliği env'de
 * yoksa (`GITHUB_APP_INSTALLATION_ID`) bir kez sahibin kurulumundan bulunur; anahtar alınırken 404/401
 * gelirse bir kez yeniden bulunur (`installation-tokens.ts`). Repo koruması (`assertRepoAllowed`)
 * bundan bağımsız, aynen çalışır: anahtar hangisi olursa olsun izin verilmeyen repoya istek çıkmaz.
 */

type AppAccess = Extract<GithubAccess, { mode: 'app' }>;
type AppAuth = ReturnType<typeof createAppAuth>;

const INFO_TTL_MS = 60_000;

function appAccess(): AppAccess {
  const access = serverEnv().githubAccess;
  if (access.mode !== 'app') throw new LocalizedError((l) => installMessages(l).github.appMode);
  return access;
}

const api = () => githubAppApi(appJwt);

/**
 * Kuruluma erişilemiyor (uygulama kaldırılmış, kurulum kimliği eskimiş, anahtar yanlış). Durum 503: veri
 * katmanı 404'ü "dosya yok" sayar, 401'i giriş anahtarına bağlar; kurulum sorunu ikisine de karışmamalı.
 * `toGithubError` bunu olduğu gibi geçirir (Türkçe, sırsız mesaj kaybolmasın). Kişisel anahtarda oluşmaz.
 */
export class InstallationAccessError extends GithubError {
  constructor(message: string | ((locale: Locale) => string)) {
    super(message, 503);
    this.name = 'InstallationAccessError';
  }
}

/** GitHub uygulaması hatasını veri katmanının hata tipine çevirir (mesaj Türkçe, sırsız). */
function asGithubError(error: unknown): unknown {
  if (!(error instanceof GithubAppError)) return error;
  return error.status === 404 || error.status === 401 || error.status === 400
    ? new InstallationAccessError((l) => error.localized(l))
    : new GithubError((l) => error.localized(l), error.status);
}

/**
 * Kurulum anahtarı alınamadı (`POST /app/installations/{id}/access_tokens`). 404/401 kurulum ya da uygulama
 * kimliği sorunudur: istenen dosyanın 404'ü gibi görünmesin. Diğer hatalar (ağ, sınır) olduğu gibi kalır.
 */
function tokenError(error: unknown): unknown {
  const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : 0;
  if (status === 404) return new InstallationAccessError((l) => installMessages(l).github.installationGone);
  if (status === 401) return new InstallationAccessError((l) => installMessages(l).github.appUnauthorized);
  return error;
}

/** Hata, kurulum kimliğinin eskidiğini gösterebilir mi (anahtar alınırken 404/401). */
function staleInstallation(error: unknown): boolean {
  const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : 0;
  return status === 404 || status === 401;
}

let tokens: ReturnType<typeof installationTokens<AppAuth>> | null = null;

/**
 * Kurulum kimliği ve anahtarı (`installation-tokens.ts`, test edilir): kimlik env'den ya da bir kez sahibin
 * kurulumundan; anahtar alınırken 404/401 gelirse kimlik bir kez yeniden bulunur (uygulama yeniden kurulmuş).
 */
function installation(access: AppAccess) {
  tokens ??= installationTokens<AppAuth>({
    fixedId: access.installationId,
    findId: async () => {
      const owner = serverEnv().owner;
      const found = await api()
        .userInstallation(access.appId, access.privateKey, owner)
        .catch((error) => {
          throw asGithubError(error);
        });
      if (!found) {
        throw new InstallationAccessError((l) => installMessages(l).github.notInstalledFor(owner));
      }
      return found.id;
    },
    create: (id) => createAppAuth({ appId: access.appId, privateKey: access.privateKey, installationId: id }),
    // `refresh`: `@octokit/auth-app` önbelleği atlanır, yeni anahtar alınıp önbelleğe yazılır.
    mint: async (auth, refresh) => (await auth({ type: 'installation', ...(refresh ? { refresh: true } : {}) })).token,
    stale: staleInstallation,
  });
  return tokens;
}

/** Kurulum anahtarı; alınamazsa `tokenError` (kurulum sorunu isteğin kendi 404'ü sanılmasın). */
function installationToken(access: AppAccess, refresh = false): Promise<string> {
  return installation(access)
    .token(refresh)
    .catch((error: unknown) => {
      throw tokenError(error);
    });
}

/**
 * Octokit için kimlik stratejisi: her istek kurulum anahtarıyla gider (`@octokit/auth-app`'in kancası:
 * anahtar alma, önbellek, yeni anahtarın 401'inde yeniden deneme). Kurulum kimliği ilk istekte çözülür,
 * böylece `gh()` eşzamanlı kalır. Anahtar kancadan önce alınır (kanca önbellekten okur): alınamazsa hata
 * isteğin kendi 404'ü sanılmasın; kimlik yeniden bulunduysa kanca yeni kurulumla çalışır.
 */
export function installationAuthStrategy() {
  const access = appAccess();
  const auth = async () => ({ type: 'token' as const, token: await installationToken(access) });
  return Object.assign(auth, {
    hook: async (...args: Parameters<AppAuth['hook']>) => {
      await installationToken(access);
      return (await installation(access).auth()).hook(...args);
    },
  });
}

/** `fetch` ile giden istekler (güncellemeler) için anahtar: kişisel anahtar ya da kurulum anahtarı. */
export async function githubAccessToken(): Promise<string> {
  const access = serverEnv().githubAccess;
  if (access.mode === 'token') return access.token;
  return installationToken(access);
}

/**
 * Yeni açılan repoya ilk yazma 404 verince (uygulama modu): önbellekteki kurulum anahtarı repo açılmadan
 * önce alınmış ve yeni repoyu görmüyor olabilir; yeniden denemeden önce anahtar zorla yenilenir.
 * Kişisel anahtar modunda hiçbir şey yapmaz.
 */
export async function refreshInstallationToken(): Promise<void> {
  const access = serverEnv().githubAccess;
  if (access.mode === 'app') await installationToken(access, true);
}

let infoCache: { at: number; value: Promise<InstallationInfo> } | null = null;

/** Kurulumun hesabı, repo seçimi ve izinleri (60 sn önbellekte; `fresh` önbelleği atlar; hata önbelleğe girmez). */
export function installationInfo({ fresh = false }: { fresh?: boolean } = {}): Promise<InstallationInfo> {
  const access = appAccess();
  if (fresh || !infoCache || Date.now() - infoCache.at > INFO_TTL_MS) {
    const value = installation(access).id().then((id) =>
      api()
        .installation(access.appId, access.privateKey, id)
        .catch((error) => {
          throw asGithubError(error);
        }),
    );
    const entry = { at: Date.now(), value };
    infoCache = entry;
    value.catch(() => {
      if (infoCache === entry) infoCache = null;
    });
  }
  return infoCache.value;
}

/**
 * Repo açmadan ve silmeden önce (uygulama modu, `repo-admin.ts`): kurulum "All repositories" mı, TAZE
 * bakılır (önbellekteki eski "all" yanıtı silmede 404'ü "zaten silinmiş" saydırmasın). Değilse yeni repo
 * kurulum anahtarına görünmez, var olan repo da silinemez; iş başlamadan ne yapılacağını söyleyen hata.
 */
export async function requireAllRepositories(): Promise<void> {
  if (serverEnv().githubAccess.mode !== 'app') return;
  const info = await installationInfo({ fresh: true });
  if (info.selection !== 'all') {
    throw new GithubError((l) => installMessages(l).github.selectedOnlyRepos(installationSettingsUrl(info.id)), 409);
  }
}
