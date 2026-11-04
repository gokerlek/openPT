import 'server-only';
import { createAppAuth } from '@octokit/auth-app';
import { serverEnv } from '../env';
import { githubAppApi, GithubAppError } from '../installation/github-app-api';
import { installationSettingsUrl, type InstallationInfo } from '../installation/github-app';
import type { GithubAccess } from './access';
import { appJwt } from './app-jwt';
import { GithubError } from './errors';

/**
 * GitHub uygulaması modunun kurulum anahtarı (installation token) — tasarım B1.
 *
 * Okuma/yazmanın hepsi (veri reposu, danışan repoları, kod reposu güncellemeleri) kurulum anahtarıyla:
 * `@octokit/auth-app` anahtarı alır, önbellekte tutar ve süresi bitmeden yeniler. Kurulum kimliği env'de
 * yoksa (`GITHUB_APP_INSTALLATION_ID`) bir kez sahibin kurulumundan bulunur. Repo koruması (`assertRepoAllowed`)
 * bundan bağımsız, aynen çalışır: anahtar hangisi olursa olsun izin verilmeyen repoya istek çıkmaz.
 */

type AppAccess = Extract<GithubAccess, { mode: 'app' }>;
type AppAuth = ReturnType<typeof createAppAuth>;

const INFO_TTL_MS = 60_000;

function appAccess(): AppAccess {
  const access = serverEnv().githubAccess;
  if (access.mode !== 'app') throw new Error('GitHub uygulaması modu kapalı.');
  return access;
}

const api = () => githubAppApi(appJwt);

/**
 * Kuruluma erişilemiyor (uygulama kaldırılmış, kurulum kimliği eskimiş, anahtar yanlış). Durum 503: veri
 * katmanı 404'ü "dosya yok" sayar, 401'i giriş anahtarına bağlar; kurulum sorunu ikisine de karışmamalı.
 * `toGithubError` bunu olduğu gibi geçirir (Türkçe, sırsız mesaj kaybolmasın). Kişisel anahtarda oluşmaz.
 */
export class InstallationAccessError extends GithubError {
  constructor(message: string) {
    super(message, 503);
    this.name = 'InstallationAccessError';
  }
}

/** GitHub uygulaması hatasını veri katmanının hata tipine çevirir (mesaj Türkçe, sırsız). */
function asGithubError(error: unknown): unknown {
  if (!(error instanceof GithubAppError)) return error;
  return error.status === 404 || error.status === 401 || error.status === 400 ? new InstallationAccessError(error.message) : new GithubError(error.message, error.status);
}

/**
 * Kurulum anahtarı alınamadı (`POST /app/installations/{id}/access_tokens`). 404/401 kurulum ya da uygulama
 * kimliği sorunudur: istenen dosyanın 404'ü gibi görünmesin. Diğer hatalar (ağ, sınır) olduğu gibi kalır.
 */
function tokenError(error: unknown): unknown {
  const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : 0;
  if (status === 404) return new InstallationAccessError('GitHub uygulamasının kurulumuna erişilemiyor (kaldırılmış ya da kurulum kimliği eski olabilir). Uygulamayı GitHub’da yeniden kur; GITHUB_APP_INSTALLATION_ID’yi kontrol et.');
  if (status === 401) return new InstallationAccessError('GitHub uygulamasının kimliği doğrulanamadı. GITHUB_APP_ID ve GITHUB_APP_PRIVATE_KEY değerlerini kontrol et.');
  return error;
}

let installationIdPromise: Promise<number> | null = null;

function installationId(access: AppAccess): Promise<number> {
  if (access.installationId) return Promise.resolve(access.installationId);
  installationIdPromise ??= (async () => {
    const owner = serverEnv().owner;
    const found = await api().userInstallation(access.appId, access.privateKey, owner).catch((error) => {
      throw asGithubError(error);
    });
    if (!found) {
      throw new InstallationAccessError(`GitHub uygulaması ${owner} hesabına kurulu değil. GitHub → Settings → Applications ekranından uygulamayı kur ya da GITHUB_APP_INSTALLATION_ID ekle.`);
    }
    return found.id;
  })().catch((error) => {
    installationIdPromise = null;
    throw error;
  });
  return installationIdPromise;
}

let installationAuthPromise: Promise<AppAuth> | null = null;

function installationAuth(access: AppAccess): Promise<AppAuth> {
  installationAuthPromise ??= installationId(access)
    .then((id) => createAppAuth({ appId: access.appId, privateKey: access.privateKey, installationId: id }))
    .catch((error) => {
      installationAuthPromise = null;
      throw error;
    });
  return installationAuthPromise;
}

/** Kurulum anahtarı (`@octokit/auth-app` önbellekte tutar, bitmeden yeniler); alınamazsa `tokenError`. */
async function installationToken(app: AppAuth) {
  return app({ type: 'installation' }).catch((error: unknown) => {
    throw tokenError(error);
  });
}

/**
 * Octokit için kimlik stratejisi: her istek kurulum anahtarıyla gider (`@octokit/auth-app`'in kancası:
 * anahtar alma, önbellek, yeni anahtarın 401'inde yeniden deneme). Kurulum kimliği ilk istekte çözülür,
 * böylece `gh()` eşzamanlı kalır. Anahtar kancadan önce alınır (kanca önbellekten okur): alınamazsa hata
 * isteğin kendi 404'ü sanılmasın.
 */
export function installationAuthStrategy() {
  const access = appAccess();
  const auth = async () => installationToken(await installationAuth(access));
  return Object.assign(auth, {
    hook: async (...args: Parameters<AppAuth['hook']>) => {
      const app = await installationAuth(access);
      await installationToken(app);
      return app.hook(...args);
    },
  });
}

/** `fetch` ile giden istekler (güncellemeler) için anahtar: kişisel anahtar ya da kurulum anahtarı. */
export async function githubAccessToken(): Promise<string> {
  const access = serverEnv().githubAccess;
  if (access.mode === 'token') return access.token;
  return (await installationToken(await installationAuth(access))).token;
}

let infoCache: { at: number; value: Promise<InstallationInfo> } | null = null;

/** Kurulumun hesabı, repo seçimi ve izinleri (60 sn önbellekte; hata önbelleğe girmez). */
export function installationInfo(): Promise<InstallationInfo> {
  const access = appAccess();
  if (!infoCache || Date.now() - infoCache.at > INFO_TTL_MS) {
    const value = installationId(access).then((id) =>
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
 * Repo açmadan önce (uygulama modu): kurulum "All repositories" değilse yeni repo kurulum anahtarına
 * görünmez ve açıldıktan sonra yazılamaz. Repo hiç açılmadan, ne yapılacağını söyleyen hata.
 */
export async function requireAllRepositories(): Promise<void> {
  if (serverEnv().githubAccess.mode !== 'app') return;
  const info = await installationInfo();
  if (info.selection !== 'all') {
    throw new GithubError(
      `GitHub uygulaması yalnız seçili repolara erişiyor; yeni repo ona görünmez. GitHub’daki kurulum ayarında “All repositories” seç: ${installationSettingsUrl(info.id)}`,
      409,
    );
  }
}
