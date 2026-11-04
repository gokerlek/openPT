/**
 * Axon Fit — tek komutla kurulum (`kur`).
 *
 *   node --input-type=module -e "$(curl -fsSL https://raw.githubusercontent.com/gokerlek/axon-fit/main/kur/kur.mjs)"
 *
 * Tek dosya, bağımlılıksız (yalnız Node yerleşikleri), Node 20+, macOS ve Linux. `-e` ile ESM olarak
 * değerlendirilir: başka dosya import etmez, `import.meta.url` ve `process.argv[1]`e dayanmaz.
 * Saf parçalar dışa aktarılır ve `kur/kur.test.mjs` ile sınanır; `AXON_KUR_TEST=1` iken ana akış başlamaz.
 * Eski Node'da da sürüm mesajı görünsün diye yalnız eski sürümlerde de olan modüller en üstte içe
 * aktarılır (`readline` sonra, dinamik) ve mantıksal atama gibi yeni sözdizimi kullanılmaz.
 *
 * Sırlar (GitHub uygulamasının özel anahtarı ve client secret'ı, AUTH_SECRET, Vercel ve GitHub
 * anahtarları) yalnız bellekte durur: ekrana, dosyaya ya da URL'ye yazılmaz, yalnız Vercel env'ine gider.
 *
 * Doğrulanan belgeler (2026-11-05):
 * - GitHub App manifest akışı: docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest
 * - "Request user authorization (OAuth) during installation" seçiliyken Setup URL kullanılamaz; kullanıcı
 *   ilk Callback URL'e döner (creating-a-github-app, generating-a-user-access-token-for-a-github-app).
 * - Git Data API: blobs (base64), trees (`content` ya da `sha`, `base_tree` ile birleştirme, kip 100755/120000),
 *   commits (`parents` boşsa kök commit), refs (PATCH, `force`). İkincil sınırlar: içerik oluşturan istek
 *   dakikada en çok 80; `retry-after` varsa o kadar, yoksa `x-ratelimit-reset`, yoksa en az 1 dk bekle.
 * - Vercel REST: POST /v11/projects (`gitRepository`), POST /v10/projects/{id}/env, POST /v13/deployments,
 *   GET /v13/deployments/{id}, GET /v9/projects/{id}, GET /v9/projects/{id}/domains, GET /v2/user, GET /v2/teams.
 * - Vercel CLI anahtar dosyası: <veri klasörü>/com.vercel.cli/auth.json, alanlar token / expiresAt (saniye).
 */
import http from 'node:http';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const VERCEL_CLI_VERSION = '65.11.0';
export const DEFAULT_SOURCE = 'gokerlek/axon-fit';
export const DEFAULT_CODE_REPO = 'axon-fit';
export const MIN_NODE_MAJOR = 20;
export const STEP_COUNT = 8;
export const SECRET_ENV_KEYS = Object.freeze(['AUTH_SECRET', 'GITHUB_APP_PRIVATE_KEY', 'GITHUB_CLIENT_SECRET']);
/** İçerik oluşturan GitHub istekleri arası en az bu kadar: dakikada en çok 60 (sınır 80). */
export const WRITE_GAP_MS = 1000;
/** Ağaç isteği başına en çok bu kadar JSON (yaklaşık). */
export const TREE_CHUNK_BYTES = 2_000_000;
/** Bundan büyük metin dosyaları ağaca gömülmez, blob olarak yüklenir. */
export const INLINE_TEXT_MAX_BYTES = 1_000_000;

const GITHUB_API = 'https://api.github.com';
const VERCEL_API = 'https://api.vercel.com';
const USER_AGENT = 'axon-fit-kur';
const VERCEL_TOKENS_URL = 'https://vercel.com/account/settings/tokens';
const VERCEL_GITHUB_INSTALL_URL = 'https://github.com/apps/vercel/installations/new';
/** Vercel belgesi (docs/accounts → Login methods and connections): hesap ayarları → Authentication. */
export const VERCEL_LOGIN_CONNECTIONS_URL = 'https://vercel.com/account/authentication';
/** Kaynağın kök `axon-release.json` dosyasında olması gereken yetenek (GitHub uygulaması modu). */
export const REQUIRED_CAPABILITY = 'github-app';
const NETWORK_HINT = 'İnternet bağlantını kontrol edip yeniden dene.';
const BROWSER_WAIT_MS = 30 * 60 * 1000;
const DEPLOY_WAIT_MS = 20 * 60 * 1000;
const MAX_ARCHIVE_BYTES = 300 * 1024 * 1024;
const MAX_RATE_WAIT_SECONDS = 300;
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const LOWER_DIGITS = `${LOWER}0123456789`;

// ---------------------------------------------------------------------------------------------
// Hatalar
// ---------------------------------------------------------------------------------------------

/** Kurulumu durduran, kullanıcıya gösterilecek hata. `hint`: ne yapmalı. */
export class KurError extends Error {
  constructor(message, hint = '') {
    super(message);
    this.name = 'KurError';
    this.hint = hint;
  }
}

/** Ağ hatası ya da zaman aşımı: yalnız bunda internet önerilir ve güvenli isteklerde yeniden denenir. */
export class NetworkError extends KurError {
  constructor(message) {
    super(message, NETWORK_HINT);
    this.name = 'NetworkError';
  }
}

/** `reason`: 'sigint' (Ctrl+C) ya da 'eof' (Ctrl+D / giriş kapandı). */
export class KurCancelled extends Error {
  constructor(reason = 'sigint') {
    super('Kurulum durduruldu.');
    this.name = 'KurCancelled';
    this.reason = reason;
  }
}

/** GitHub/Vercel'in hata yanıtı. Yanıtın gövdesi saklanmaz (sır taşıyabilir); yalnız kod, mesaj, öneri. */
export class ApiError extends Error {
  constructor(service, status, data, what = '') {
    const detail = apiErrorDetail(data);
    super(`${what || `${service} isteği`} başarısız oldu (${status}${detail.code ? `, ${detail.code}` : ''})${detail.message ? `: ${detail.message}` : ''}`);
    this.name = 'ApiError';
    this.service = service;
    this.status = status;
    this.code = detail.code;
    this.action = detail.action;
    this.link = detail.link;
    this.rateLimited = status === 429 || /rate limit/i.test(detail.message || '');
  }
}

/** Vercel `{ error: { code, message, action, link } }`, GitHub `{ message, errors: [{ message }] }`. */
export function apiErrorDetail(data) {
  if (!data || typeof data !== 'object') return {};
  // Uzun ya da denetim karakterli metin terminale olduğu gibi basılmaz.
  const text = (value) => (typeof value === 'string' && value.length <= 300 ? value.replace(/\p{Cc}/gu, ' ') : undefined);
  if (data.error && typeof data.error === 'object') {
    return { code: text(data.error.code), message: text(data.error.message), action: text(data.error.action), link: text(data.error.link) };
  }
  const extra = Array.isArray(data.errors)
    ? data.errors.map((item) => text(item && item.message) || text(item && item.code)).filter(Boolean).join('; ')
    : '';
  const message = [text(data.message), extra].filter(Boolean).join(' — ');
  return { code: text(typeof data.error === 'string' ? data.error : undefined), message: message || undefined };
}

/** Hata ipucu türe göre: ağ hatası değilse internet önerilmez; Vercel/GitHub'ın önerisi varsa yazılır. */
export function failureLines(error) {
  if (error instanceof KurCancelled) {
    return [error.reason === 'eof' ? 'Kurulum durduruldu: terminal girişi kapandı (Ctrl+D).' : 'Kurulum durduruldu.'];
  }
  if (error instanceof KurError) {
    return [`Kurulum tamamlanamadı: ${error.message}`, `Ne yapmalı: ${error.hint || 'Komutu yeniden çalıştır.'}`];
  }
  if (error instanceof ApiError) {
    const lines = [`Kurulum tamamlanamadı: ${error.message}`];
    const link = safeLink(error.link);
    if (error.action || link) lines.push(`${error.service} öneriyor: ${[error.action, link].filter(Boolean).join(' — ')}`);
    lines.push(`Ne yapmalı: ${apiHint(error)}`);
    return lines;
  }
  const detail = `${(error && error.name) || 'Error'}: ${String((error && error.message) || '').slice(0, 200)}`;
  return [
    `Kurulum tamamlanamadı: beklenmeyen bir hata oluştu (${detail}).`,
    "Ne yapmalı: Komutu yeniden çalıştır. Sorun sürerse bu çıktıyla birlikte GitHub'da konu aç.",
  ];
}

function apiHint(error) {
  if (error.rateLimited) return `${error.service} istek sınırına takıldın. Bir saat kadar bekleyip komutu yeniden çalıştır.`;
  if (error.status === 401) return `${error.service} oturumu geçersiz ya da süresi dolmuş. Komutu yeniden çalıştırıp yeniden giriş yap.`;
  if (error.status === 403) return `${error.service} bu işleme izin vermedi. Doğru hesapla giriş yaptığını ve izinleri kontrol et.`;
  if (error.status === 404) return `${error.service} istenen kaydı bulamadı. Adları kontrol edip komutu yeniden çalıştır.`;
  if (error.status === 409 || error.status === 422 || error.status === 400) {
    return isNameConflict(error)
      ? 'Bu ad kullanılıyor. Komutu yeniden çalıştırıp başka bir ad seç.'
      : 'İstek reddedildi; yukarıdaki mesaja göre düzeltip komutu yeniden çalıştır.';
  }
  if (error.status >= 500) return `${error.service} tarafında geçici bir sorun var. Birkaç dakika sonra komutu yeniden çalıştır.`;
  return 'Komutu yeniden çalıştır.';
}

/** Yalnız gerçek ad çakışması: GitHub "name already exists", Vercel proje adı "already exists". */
export function isNameConflict(error) {
  return error instanceof ApiError && [400, 409, 422].includes(error.status) && /already exists|already taken|name is taken/i.test(error.message);
}

function networkError(service) {
  return new NetworkError(`${service}'a ulaşılamadı.`);
}

// ---------------------------------------------------------------------------------------------
// Saf yardımcılar
// ---------------------------------------------------------------------------------------------

export function nodeMajor(version) {
  return Number.parseInt(String(version).replace(/^v/, '').split('.')[0], 10) || 0;
}

/** Her şeyden önce: Node çok eskiyse gösterilecek mesaj, değilse null. */
export function startupProblem(version) {
  if (nodeMajor(version) >= MIN_NODE_MAJOR) return null;
  return `Bilgisayarındaki Node sürümü (${version}) çok eski; en az Node ${MIN_NODE_MAJOR} gerekiyor. https://nodejs.org adresinden güncel LTS sürümünü kur, sonra komutu yeniden çalıştır.`;
}

export function checkNodeVersion(version) {
  if (startupProblem(version)) {
    throw new KurError(
      `Bilgisayarındaki Node sürümü (${version}) çok eski; en az Node ${MIN_NODE_MAJOR} gerekiyor.`,
      'https://nodejs.org adresinden güncel LTS sürümünü kur, sonra komutu yeniden çalıştır.',
    );
  }
}

export function randomString(length, alphabet, randomInt = crypto.randomInt) {
  let out = '';
  for (let i = 0; i < length; i += 1) out += alphabet[randomInt(alphabet.length)];
  return out;
}

/** Varsayılan ad: `axon-fit-` + 4 küçük harf/rakam. */
export function defaultProjectName(randomInt = crypto.randomInt) {
  return `axon-fit-${randomString(4, LOWER_DIGITS, randomInt)}`;
}

/** GitHub uygulamasının adı: GitHub'da benzersiz olmalı, en çok 34 karakter. */
export function githubAppName(randomInt = crypto.randomInt) {
  return `Axon Fit ${randomString(6, LOWER, randomInt)}`;
}

/** Vercel proje adı = `<ad>.vercel.app` alt alanı: DNS etiketi kuralları. Sorun yoksa null. */
export function validateProjectName(name) {
  if (typeof name !== 'string' || name.length === 0) return 'Bir ad yaz.';
  if (name.length > 63) return 'Ad en çok 63 karakter olabilir.';
  if (!/^[a-z0-9-]+$/.test(name)) return 'Yalnız küçük harf (a-z), rakam ve tire kullan; boşluk ve Türkçe harf olmaz.';
  if (name.startsWith('-') || name.endsWith('-')) return 'Ad tire ile başlayamaz ya da bitemez.';
  if (name.includes('---')) return 'Ad yan yana üç tire içeremez.';
  return null;
}

/** GitHub repo adı. Sorun yoksa null. */
export function validateRepoName(name) {
  if (typeof name !== 'string' || !/^[A-Za-z0-9._-]{1,100}$/.test(name) || name === '.' || name === '..') {
    return 'Repo adında yalnız harf, rakam, nokta, tire ve alt çizgi olabilir (en çok 100 karakter).';
  }
  return null;
}

/** Veri reposunun adı (bugünkü sihirbazla aynı kural). */
export function dataRepoName(codeRepo) {
  return codeRepo.toLowerCase() === 'axon-fit-data' ? 'axon-fit-private-data' : 'axon-fit-data';
}

/** `sahip/repo` biçimi; değilse KurError. */
export function parseSource(value) {
  const match = /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100})$/.exec(String(value == null ? '' : value).trim());
  if (!match) {
    throw new KurError(`Kaynak repo "${value}" geçerli değil.`, 'AXON_KUR_SOURCE değeri "sahip/repo" biçiminde olmalı ya da hiç verilmemeli.');
  }
  return `${match[1]}/${match[2]}`;
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatMegabytes(bytes) {
  return (bytes / 1024 / 1024).toFixed(1).replace('.', ',');
}

/**
 * GitHub App manifest'i. `callback_urls` sırası önemli: kurulumdaki kullanıcı yetkilendirmesi
 * (request_oauth_on_install) İLK adrese döner, yani yerel adres önce. Uygulamanın kendi girişi
 * `redirect_uri`'yi açıkça gönderdiği için ikinci adres yeter. Setup URL bu seçenekle kullanılamaz,
 * o yüzden yok. Webhook kapalı (url zorunlu alan, ama hiç çağrılmaz).
 */
export function buildManifest({ appName, productionUrl, localBase }) {
  return {
    name: appName,
    url: productionUrl,
    description: `Axon Fit kurulumun (${productionUrl}): PT girişi ve GitHub'daki verilerine erişim.`,
    hook_attributes: { url: `${productionUrl}/api/github/webhook`, active: false },
    redirect_url: `${localBase}/github/app-created`,
    callback_urls: [`${localBase}/github/callback`, `${productionUrl}/api/auth/github/callback`],
    public: false,
    request_oauth_on_install: true,
    default_permissions: {
      administration: 'write',
      contents: 'write',
      actions: 'write',
      workflows: 'write',
      metadata: 'read',
    },
    default_events: [],
  };
}

const PAGE_STYLE =
  'body{font:16px/1.5 system-ui,-apple-system,sans-serif;margin:0;background:#f6f7f9;color:#14171a}' +
  'main{max-width:34rem;margin:12vh auto;padding:0 16px}h1{font-size:1.4rem}' +
  'button,a.b{font:inherit;padding:.6rem 1rem;border-radius:.5rem;border:0;background:#14171a;color:#fff;text-decoration:none;cursor:pointer}' +
  '@media (prefers-color-scheme:dark){body{background:#101214;color:#eef0f2}button,a.b{background:#eef0f2;color:#101214}}';

function page(title, bodyHtml) {
  return (
    '<!doctype html><html lang="tr"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer">' +
    `<title>${escapeHtml(title)}</title><style>${PAGE_STYLE}</style></head><body><main>${bodyHtml}</main></body></html>`
  );
}

/** Manifest'i GitHub'a form ile kendiliğinden gönderen yerel sayfa. JSON öznitelikte kaçışlı durur. */
export function manifestPage({ manifest, state }) {
  const action = `https://github.com/settings/apps/new?state=${encodeURIComponent(state)}`;
  return page(
    'Axon Fit kurulumu',
    '<h1>GitHub uygulaması oluşturuluyor…</h1>' +
      '<p>GitHub birazdan açılacak. Orada <b>Create GitHub App</b> düğmesine bas.</p>' +
      `<form id="manifest-form" method="post" action="${escapeHtml(action)}">` +
      `<input type="hidden" name="manifest" value="${escapeHtml(JSON.stringify(manifest))}">` +
      '<button type="submit">GitHub\'a devam et</button></form>' +
      '<script>document.getElementById("manifest-form").submit()</script>',
  );
}

export function resultPage(title, message, link) {
  const action = link ? `<p><a class="b" href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></p>` : '';
  return page(title, `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>${action}`);
}

/** GitHub uygulaması JWT'si (RS256): iat 60 sn geri, exp en çok 10 dk ileri, iss = client id ya da app id. */
export function githubAppJwt({ issuer, pem, nowSeconds }) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const input = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iat: nowSeconds - 60, exp: nowSeconds + 9 * 60, iss: String(issuer) })}`;
  const signature = crypto.sign('sha256', Buffer.from(input), pem).toString('base64url');
  return `${input}.${signature}`;
}

/** 32 bayt rastgele veri, hex (64 karakter). */
export function generateAuthSecret(randomBytes = crypto.randomBytes) {
  const bytes = randomBytes(32);
  if (bytes.length !== 32) throw new Error('32 bayt rastgele veri gerekir.');
  return Buffer.from(bytes).toString('hex');
}

/** Vercel Production env'i (B1 anahtarları). Sırlar `sensitive`: Vercel'de bir daha okunamaz. */
export function buildEnvItems({ owner, codeRepo, dataRepo, branch, appId, privateKey, installationId, clientId, clientSecret, authSecret }) {
  const values = {
    GITHUB_OWNER: owner,
    APP_REPO: dataRepo,
    AUTH_SECRET: authSecret,
    AXON_CODE_REPO: `${owner}/${codeRepo}`,
    AXON_CODE_BRANCH: branch,
    GITHUB_APP_ID: appId === undefined || appId === null ? '' : String(appId),
    GITHUB_APP_PRIVATE_KEY: privateKey,
    GITHUB_APP_INSTALLATION_ID: installationId === undefined || installationId === null ? '' : String(installationId),
    GITHUB_CLIENT_ID: clientId,
    GITHUB_CLIENT_SECRET: clientSecret,
  };
  return Object.entries(values).map(([key, value]) => {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`${key} boş kaldı.`);
    return { key, value, type: SECRET_ENV_KEYS.includes(key) ? 'sensitive' : 'encrypted', target: ['production'] };
  });
}

/**
 * Vercel CLI'nin veri klasörü adayları, CLI ile aynı sırada: `com.vercel.cli` (xdg-app-paths veri klasörü:
 * macOS `~/Library/Application Support`, Linux `$XDG_DATA_HOME` ya da `~/.local/share`), sonra eski `~/.now`.
 */
export function vercelConfigDirs({ platform, home, env = {} }) {
  const dataHomes = [];
  if (env.XDG_DATA_HOME) dataHomes.push(env.XDG_DATA_HOME);
  dataHomes.push(platform === 'darwin' ? path.join(home, 'Library', 'Application Support') : path.join(home, '.local', 'share'));
  const dirs = [...dataHomes.map((dir) => path.join(dir, 'com.vercel.cli')), path.join(home, '.now'), ...dataHomes.map((dir) => path.join(dir, 'now'))];
  return [...new Set(dirs)];
}

/** `auth.json`: `{ token, expiresAt? (saniye), refreshToken? }`. Anahtar yoksa null. */
export function parseVercelAuth(text, nowSeconds) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data.token !== 'string' || data.token.length === 0) return null;
  const expiresAt = typeof data.expiresAt === 'number' ? data.expiresAt : null;
  return { token: data.token, expiresAt, expired: expiresAt !== null && expiresAt <= nowSeconds + 60 };
}

/** CLI'nin seçili ekibi (`config.json` → `currentTeam`). */
export function parseVercelCurrentTeam(text) {
  try {
    const data = JSON.parse(text);
    return data && typeof data.currentTeam === 'string' && data.currentTeam ? data.currentTeam : null;
  } catch {
    return null;
  }
}

/** `<ad>.vercel.app` boş mu: Vercel boş alt alan için 404 DEPLOYMENT_NOT_FOUND döner. */
export function isDeploymentNotFound(status, headers, bodyText) {
  if (status !== 404) return false;
  const header = headers && typeof headers.get === 'function' ? headers.get('x-vercel-error') : null;
  return header === 'DEPLOYMENT_NOT_FOUND' || /DEPLOYMENT_NOT_FOUND/.test(bodyText || '');
}

/** Vercel'in GitHub uygulaması repoyu göremiyor: Vercel CLI'nin `git connect` kontrolündeki kodlar. */
export function isVercelGitAccessError(error) {
  return error instanceof ApiError && error.service === 'Vercel' && (error.action === 'Install GitHub App' || error.code === 'repo_not_found');
}

export function isVercelLoginConnectionError(error) {
  return error instanceof ApiError && error.service === 'Vercel' && error.action === 'Add a Login Connection';
}

/** Yalnız github.com / vercel.com https bağlantıları açılır ya da yazılır. */
export function safeLink(value, hosts = ['github.com', 'vercel.com']) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && hosts.includes(url.hostname)) return url.toString();
  } catch {
    // geçersiz adres
  }
  return null;
}

export function describeCreated(created) {
  const lines = [];
  if (created.githubApp) lines.push(`GitHub uygulaması "${created.githubApp.name}": ${created.githubApp.settingsUrl}`);
  if (created.codeRepo) lines.push(`Kod reposu: ${created.codeRepo}`);
  if (created.dataRepo) lines.push(`Veri reposu: ${created.dataRepo}`);
  if (created.vercelProject) lines.push(`Vercel projesi: ${created.vercelProject}`);
  if (created.env) lines.push('Vercel projesinin Production ayarları (env) yazıldı.');
  return lines;
}

export function browserCommand(platform) {
  if (platform === 'darwin') return 'open';
  if (platform === 'linux') return 'xdg-open';
  return null;
}

/**
 * `open`/`xdg-open` ile açar. Çıkış kodu 0 değilse ya da komut yoksa başarısız. Bazı Linux masaüstlerinde
 * xdg-open tarayıcı kapanana dek bekler: süre dolarsa açılmış sayılır (adres her durumda ekrana yazılır).
 */
export function openWith(spawnImpl, platform, url, timeoutMs = 5000) {
  const command = browserCommand(platform);
  if (!command) return Promise.resolve(false);
  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    const done = (value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(value);
    };
    let child;
    try {
      child = spawnImpl(command, [url], { stdio: 'ignore', detached: true });
    } catch {
      done(false);
      return;
    }
    child.once('error', () => done(false));
    child.once('exit', (code) => done(code === 0));
    timer = setTimeout(() => {
      if (typeof child.unref === 'function') child.unref();
      done(true);
    }, timeoutMs);
  });
}

const DEPLOY_STATES = {
  QUEUED: 'sırada',
  INITIALIZING: 'hazırlanıyor',
  BUILDING: 'derleniyor',
  READY: 'hazır',
  ERROR: 'hata verdi',
  CANCELED: 'iptal edildi',
  BLOCKED: 'engellendi',
};

// ---------------------------------------------------------------------------------------------
// Kaynak arşivi: gzip + tar (ustar, pax x/g, GNU L/K), bellekte
// ---------------------------------------------------------------------------------------------

function corrupt(detail) {
  return new KurError(`Kaynak arşivi okunamadı (${detail}).`, 'Komutu yeniden çalıştır; sürerse GitHub\'da konu aç.');
}

function readCString(buffer, start, length) {
  const field = buffer.subarray(start, start + length);
  const end = field.indexOf(0);
  return (end === -1 ? field : field.subarray(0, end)).toString('utf8');
}

function readNumber(buffer, start, length) {
  const field = buffer.subarray(start, start + length);
  if (field[0] & 0x80) {
    // GNU base-256 kodlaması (çok büyük dosyalar).
    let value = field[0] & 0x7f;
    for (let i = 1; i < field.length; i += 1) value = value * 256 + field[i];
    return value;
  }
  const text = readCString(buffer, start, length).trim();
  if (text === '') return 0;
  if (!/^[0-7]+$/.test(text)) throw corrupt('sayı alanı');
  return Number.parseInt(text, 8);
}

function parsePax(data) {
  const records = {};
  let offset = 0;
  while (offset < data.length) {
    const space = data.indexOf(0x20, offset);
    if (space === -1) break;
    const length = Number.parseInt(data.toString('utf8', offset, space), 10);
    if (!Number.isSafeInteger(length) || length <= 0 || offset + length > data.length) throw corrupt('pax kaydı');
    const record = data.toString('utf8', space + 1, offset + length - 1);
    const equals = record.indexOf('=');
    if (equals > 0) records[record.slice(0, equals)] = record.slice(equals + 1);
    offset += length;
  }
  return records;
}

/**
 * Tar ayrıştırıcı (saf). Döner: `{ entries: [{ path, type: 'file'|'symlink', mode, data?, linkTarget? }], comment }`.
 * Klasör ve sabit bağ kayıtları atlanır; `comment` GitHub arşivlerinde kaynağın commit kimliğidir.
 */
export function parseTar(buffer) {
  const entries = [];
  let offset = 0;
  let pax = {};
  let globalPax = {};
  let longName = null;
  let longLink = null;
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    let sum = 0;
    for (let i = 0; i < 512; i += 1) sum += i >= 148 && i < 156 ? 0x20 : header[i];
    if (sum !== readNumber(header, 148, 8)) throw corrupt('başlık sağlaması');
    const typeflag = header[156] === 0 ? '0' : String.fromCharCode(header[156]);
    const size = typeflag !== 'x' && typeflag !== 'g' && pax.size !== undefined ? Number(pax.size) : readNumber(header, 124, 12);
    if (!Number.isSafeInteger(size) || size < 0) throw corrupt('boyut');
    const dataStart = offset + 512;
    if (dataStart + size > buffer.length) throw corrupt('eksik veri');
    const data = buffer.subarray(dataStart, dataStart + size);
    offset = dataStart + Math.ceil(size / 512) * 512;

    if (typeflag === 'x') {
      pax = parsePax(data);
      continue;
    }
    if (typeflag === 'g') {
      globalPax = { ...globalPax, ...parsePax(data) };
      continue;
    }
    if (typeflag === 'L') {
      longName = readCString(data, 0, data.length);
      continue;
    }
    if (typeflag === 'K') {
      longLink = readCString(data, 0, data.length);
      continue;
    }
    const posix = header.toString('latin1', 257, 263) === 'ustar\u0000';
    const prefix = posix ? readCString(header, 345, 155) : '';
    const shortName = readCString(header, 0, 100);
    const entryPath = pax.path !== undefined ? pax.path : longName !== null ? longName : prefix ? `${prefix}/${shortName}` : shortName;
    const linkTarget = pax.linkpath !== undefined ? pax.linkpath : longLink !== null ? longLink : readCString(header, 157, 100);
    const mode = readNumber(header, 100, 8);
    pax = {};
    longName = null;
    longLink = null;
    if (typeflag === '0' || typeflag === '7') entries.push({ path: entryPath, type: 'file', mode, data });
    else if (typeflag === '2') entries.push({ path: entryPath, type: 'symlink', mode, linkTarget });
  }
  return { entries, comment: typeof globalPax.comment === 'string' ? globalPax.comment : null };
}

/** GitHub arşivindeki tek üst klasörü (`repo-sürüm/`) atar; güvensiz yol varsa durur. */
export function stripTopFolder(entries) {
  let top = null;
  const out = [];
  for (const entry of entries) {
    const parts = entry.path.split('/');
    if (parts[parts.length - 1] === '') parts.pop();
    if (top === null) top = parts[0];
    if (parts[0] !== top) throw corrupt('birden çok üst klasör');
    const rest = parts.slice(1);
    if (rest.length === 0) continue;
    if (rest.some((part) => part === '' || part === '.' || part === '..') || entry.path.startsWith('/')) throw corrupt('güvensiz yol');
    if (rest[0] === '.git') continue;
    out.push({ ...entry, path: rest.join('/') });
  }
  return out;
}

/** Geçerli UTF-8 ve NUL içermiyorsa metin (BOM korunur), değilse null. */
export function decodeText(buffer) {
  if (buffer.includes(0)) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer);
  } catch {
    return null;
  }
}

export function gitMode(file) {
  if (file.type === 'symlink') return '120000';
  return file.mode & 0o111 ? '100755' : '100644';
}

/** Metin dosyaları ağaçta `content` ile; ikili ya da büyük dosyalar ayrı blob olarak yüklenir. */
export function planSourceTree(files, { inlineMaxBytes = INLINE_TEXT_MAX_BYTES } = {}) {
  const inline = [];
  const blobs = [];
  for (const file of files) {
    const mode = gitMode(file);
    if (file.type === 'symlink') {
      inline.push({ path: file.path, mode, type: 'blob', content: file.linkTarget });
      continue;
    }
    const text = file.data.length <= inlineMaxBytes ? decodeText(file.data) : null;
    if (text !== null) inline.push({ path: file.path, mode, type: 'blob', content: text });
    else blobs.push({ path: file.path, mode, data: file.data });
  }
  return { inline, blobs };
}

/** Ağaç girdilerini istek başına ~`maxBytes` JSON olacak parçalara böler (tek büyük girdi tek başına). */
export function chunkTreeEntries(entries, maxBytes = TREE_CHUNK_BYTES) {
  const chunks = [];
  let current = [];
  let size = 0;
  for (const entry of entries) {
    const entrySize = Buffer.byteLength(JSON.stringify(entry)) + 1;
    if (current.length > 0 && size + entrySize > maxBytes) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(entry);
    size += entrySize;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * GitHub sınır yanıtında beklenecek saniye; sınır değilse ya da çok uzunsa null.
 * Sıra: `retry-after`, sonra `x-ratelimit-remaining: 0` ise `x-ratelimit-reset`, sonra en az 1 dk (üstel).
 */
export function rateLimitWait({ status, headers, data }, nowSeconds, attempt = 0) {
  if (status !== 403 && status !== 429) return null;
  const header = (name) => (headers && typeof headers.get === 'function' ? headers.get(name) : null);
  const retryAfter = header('retry-after');
  const message = apiErrorDetail(data).message || '';
  let wait;
  if (retryAfter !== null && /^\d+$/.test(retryAfter.trim())) wait = Number(retryAfter);
  else if (header('x-ratelimit-remaining') === '0' && /^\d+$/.test(String(header('x-ratelimit-reset')))) wait = Math.max(1, Number(header('x-ratelimit-reset')) - nowSeconds);
  else if (status === 429 || /rate limit/i.test(message)) wait = 60 * 2 ** attempt;
  else return null;
  return wait > MAX_RATE_WAIT_SECONDS ? null : Math.ceil(wait);
}

// ---------------------------------------------------------------------------------------------
// HTTP istemcileri (fetch enjekte edilir; testler taklit verir)
// ---------------------------------------------------------------------------------------------

async function readJson(response) {
  const text = await response.text().catch(() => '');
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** İstek süresi gövde boyutuna göre: 60 sn + her 50 KB için 1 sn (7,7 MB blob ≈ 4 dk). */
export function requestTimeoutMs(bodyBytes) {
  return 60_000 + Math.ceil(Math.max(0, bodyBytes) / 51_200) * 1000;
}

/**
 * `ctx` verilirse (sleep/say/nowSeconds): GitHub'ın istek sınırında bekleyip yeniden dener; ağ hatası ya da
 * zaman aşımında GET'leri ve `retry: true` verilen (aynı sonucu veren) yazmaları 3 kez daha dener.
 */
export function githubApi(fetchImpl, ctx = null) {
  async function once(pathname, { token, method = 'GET', body } = {}) {
    const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': USER_AGENT };
    if (token) headers.Authorization = `Bearer ${token}`;
    const payload = body === undefined ? undefined : JSON.stringify(body);
    if (payload !== undefined) headers['Content-Type'] = 'application/json';
    let response;
    let data;
    try {
      response = await fetchImpl(`${GITHUB_API}${pathname}`, {
        method,
        headers,
        body: payload,
        signal: AbortSignal.timeout(requestTimeoutMs(payload === undefined ? 0 : Buffer.byteLength(payload))),
      });
      data = await readJson(response);
    } catch {
      throw networkError('GitHub');
    }
    return { status: response.status, headers: response.headers, data };
  }
  return async function github(pathname, options = {}) {
    const retryNetwork = Boolean(ctx) && ((options.method || 'GET') === 'GET' || options.retry === true);
    let networkFailures = 0;
    for (let attempt = 0; ; attempt += 1) {
      let result;
      try {
        result = await once(pathname, options);
      } catch (error) {
        if (!(error instanceof NetworkError) || !retryNetwork || networkFailures >= 3) throw error;
        networkFailures += 1;
        const wait = 2 ** networkFailures;
        ctx.io.say(`  … GitHub'a ulaşılamadı; ${wait} sn sonra yeniden deneniyor (${networkFailures}/3).`);
        await ctx.sleep(wait * 1000);
        continue;
      }
      const wait = ctx && attempt < 4 ? rateLimitWait(result, ctx.nowSeconds(), attempt) : null;
      if (wait === null) return result;
      ctx.io.say(`  … GitHub istek sınırı: ${wait} sn bekleniyor.`);
      await ctx.sleep(wait * 1000);
    }
  };
}

/** `session.token` ve `session.teamId` her istekte okunur (oturum yenilenebilir). */
export function vercelApi(fetchImpl, session) {
  return async function vercel(pathname, { method = 'GET', body, query = {} } = {}) {
    const url = new URL(pathname, VERCEL_API);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    if (session.teamId) url.searchParams.set('teamId', session.teamId);
    const headers = { Authorization: `Bearer ${session.token}`, 'User-Agent': USER_AGENT };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let response;
    try {
      response = await fetchImpl(url.toString(), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw networkError('Vercel');
    }
    return { status: response.status, data: await readJson(response) };
  };
}

function expect(result, statuses, service, what) {
  if (!statuses.includes(result.status)) throw new ApiError(service, result.status, result.data, what);
  return result.data;
}

function shaOf(result, what) {
  const data = expect(result, [200, 201], 'GitHub', what);
  if (!data || typeof data.sha !== 'string' || !/^[0-9a-f]{40,64}$/.test(data.sha)) throw new KurError(`${what}: GitHub beklenmeyen bir yanıt verdi.`, 'Komutu yeniden çalıştır.');
  return data.sha;
}

export async function vercelAppDomainFree(fetchImpl, name) {
  let response;
  try {
    response = await fetchImpl(`https://${name}.vercel.app/`, {
      method: 'GET',
      redirect: 'manual',
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new NetworkError(`${name}.vercel.app adresine bakılamadı.`);
  }
  const body = response.status === 404 ? await response.text().catch(() => '') : '';
  return isDeploymentNotFound(response.status, response.headers, body);
}

export async function convertManifestCode(fetchImpl, code) {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(code || '')) throw new KurError('GitHub geçersiz bir dönüş kodu gönderdi.', 'Komutu yeniden çalıştır.');
  const result = await githubApi(fetchImpl)(`/app-manifests/${encodeURIComponent(code)}/conversions`, { method: 'POST' });
  const data = expect(result, [201], 'GitHub', 'GitHub uygulamasının bilgilerini alma');
  if (!data || !data.id || !data.slug || !data.client_id || !data.client_secret || !data.pem) {
    throw new KurError('GitHub uygulamasının bilgileri eksik geldi.', 'Komutu yeniden çalıştır.');
  }
  return {
    id: data.id,
    slug: data.slug,
    name: typeof data.name === 'string' ? data.name : data.slug,
    clientId: data.client_id,
    clientSecret: data.client_secret,
    pem: data.pem,
    ownerLogin: data.owner && typeof data.owner.login === 'string' ? data.owner.login : null,
  };
}

/** Kurulumdaki yetkilendirme kodunu kullanıcı anahtarına çevirir (client id/secret ile). */
export async function exchangeUserCode(fetchImpl, { clientId, clientSecret, code }) {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(code || '')) throw new KurError('GitHub geçersiz bir yetki kodu gönderdi.');
  let response;
  try {
    response = await fetchImpl('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw networkError('GitHub');
  }
  const data = await readJson(response);
  if (!response.ok || !data || typeof data.access_token !== 'string' || !data.access_token) {
    const reason = data && typeof data.error === 'string' && /^[a-z_]{1,60}$/.test(data.error) ? ` (${data.error})` : '';
    throw new KurError(`GitHub kullanıcı yetkisi alınamadı${reason}.`, 'Tarayıcıdaki "Yeniden dene" düğmesine bas ya da komutu yeniden çalıştır.');
  }
  return data.access_token;
}

/**
 * Kurulacak sürüm GitHub uygulaması modunu biliyor mu: kök `axon-release.json` → `capabilities` dizisinde
 * `github-app`. Yoksa (ör. v0.2.1 yalnız GITHUB_TOKEN bilir) hiçbir şey oluşturulmadan durulur.
 */
export function checkSourceCapabilities(files, label = '') {
  const manifest = files.find((file) => file.path === 'axon-release.json' && file.type === 'file');
  let capabilities = [];
  try {
    const data = manifest ? JSON.parse(manifest.data.toString('utf8')) : null;
    if (data && Array.isArray(data.capabilities)) capabilities = data.capabilities;
  } catch {
    capabilities = [];
  }
  if (!capabilities.includes(REQUIRED_CAPABILITY)) {
    throw new KurError(
      `Axon Fit'in kurulacak sürümü${label ? ` (${label})` : ''} bu kurulum yolunu (GitHub uygulaması) henüz desteklemiyor.`,
      "Bu kurulum yolu Axon Fit'in yeni sürümüyle gelecek; şimdilik README'deki Deploy düğmesini kullan.",
    );
  }
}

/**
 * 1. adım: kaynağın son kararlı sürümü (yoksa varsayılan dal) kimliksiz bulunur, arşivi indirilip bellekte açılır
 * ve GitHub uygulaması modunu desteklediği denetlenir (hesaplarda hiçbir şey oluşturulmadan önce).
 * Döner: `{ ref, version, commit, files, totalBytes }`.
 */
export async function downloadSource(ctx, source) {
  const github = githubApi(ctx.fetch, ctx);
  let ref;
  let version = null;
  const release = await github(`/repos/${source}/releases/latest`);
  const tag = release.status === 200 && release.data && typeof release.data.tag_name === 'string' ? release.data.tag_name : '';
  if (tag) {
    ref = tag;
    version = tag;
  } else if (release.status === 404 || release.status === 200) {
    const repo = await github(`/repos/${source}`);
    if (repo.status === 404) throw new KurError(`Kaynak repo bulunamadı: ${source}.`, 'AXON_KUR_SOURCE değerini kontrol et ya da kaldırıp yeniden dene.');
    const data = expect(repo, [200], 'GitHub', 'Kaynak repoyu okuma');
    ref = data && typeof data.default_branch === 'string' && data.default_branch ? data.default_branch : 'main';
  } else {
    throw new ApiError('GitHub', release.status, release.data, 'Kaynağın son sürümünü okuma');
  }

  const url = `https://codeload.github.com/${source}/tar.gz/${ref.split('/').map(encodeURIComponent).join('/')}`;
  let compressed = null;
  for (let attempt = 1; compressed === null; attempt += 1) {
    try {
      const response = await ctx.fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(300_000) });
      if (response.status !== 200) throw new KurError(`Kaynak kodu indirilemedi (${response.status}).`, 'Biraz bekleyip komutu yeniden çalıştır.');
      const length = Number(response.headers.get('content-length'));
      if (Number.isFinite(length) && length > MAX_ARCHIVE_BYTES) throw corrupt('arşiv çok büyük');
      compressed = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (error instanceof KurError) throw error;
      if (attempt >= 3) throw new NetworkError('Kaynak kodu indirilemedi.');
      ctx.io.say(`  … Kaynak indirilemedi; ${2 ** attempt} sn sonra yeniden deneniyor (${attempt}/2).`);
      await ctx.sleep(2 ** attempt * 1000);
    }
  }
  if (compressed.length > MAX_ARCHIVE_BYTES) throw corrupt('arşiv çok büyük');
  let tar;
  try {
    tar = zlib.gunzipSync(compressed, { maxOutputLength: 4 * MAX_ARCHIVE_BYTES });
  } catch {
    throw corrupt('gzip');
  }
  const parsed = parseTar(tar);
  const files = stripTopFolder(parsed.entries);
  if (files.length === 0) throw corrupt('boş arşiv');
  checkSourceCapabilities(files, version || ref);
  if (!version) {
    const pkg = files.find((file) => file.path === 'package.json' && file.type === 'file');
    try {
      const value = pkg ? JSON.parse(pkg.data.toString('utf8')).version : null;
      if (typeof value === 'string' && /^[\w.+-]{1,40}$/.test(value)) version = `v${value}`;
    } catch {
      // sürüm bilinmiyor
    }
  }
  const totalBytes = files.reduce((sum, file) => sum + (file.data ? file.data.length : 0), 0);
  return { ref, version, commit: parsed.comment, files, totalBytes };
}

// ---------------------------------------------------------------------------------------------
// Yerel sunucu: GitHub App manifest akışı + kurulumdaki kullanıcı yetkilendirmesi
// ---------------------------------------------------------------------------------------------

function sendHtml(res, status, html) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(html);
}

/**
 * 127.0.0.1'de rastgele portta sunucu açar, tarayıcıda manifest sayfasını açtırır; uygulama oluşunca
 * kurulum sayfasına yönlendirir; kurulumdan sonra GitHub ilk callback adresine (bu sunucu) kodla döner.
 * Döner: `{ app, userToken, installationIdHint }`.
 */
export async function runGithubAppFlow(ctx, { appName, productionUrl, timeoutMs = BROWSER_WAIT_MS }) {
  const appState = Buffer.from(ctx.randomBytes(16)).toString('hex');
  const installState = Buffer.from(ctx.randomBytes(16)).toString('hex');
  let app = null;
  let converting = null;
  let finished = false;
  let resolveDone;
  let rejectDone;
  const done = new Promise((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });

  const server = http.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const manifest = buildManifest({ appName, productionUrl, localBase: base });
  const installUrl = (slug) => `https://github.com/apps/${encodeURIComponent(slug)}/installations/new`;
  const authorizeUrl = () => {
    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', app.clientId);
    url.searchParams.set('redirect_uri', `${base}/github/callback`);
    url.searchParams.set('state', installState);
    return url.toString();
  };

  const finish = (error, value) => {
    if (finished) return;
    finished = true;
    if (error) rejectDone(error);
    else resolveDone(value);
  };

  async function handle(req, res) {
    // DNS yeniden bağlama saldırısına karşı yalnız kendi adresimiz.
    if (req.headers.host !== `127.0.0.1:${port}`) return sendHtml(res, 421, resultPage('Geçersiz adres', 'Bu sayfa yalnız kurulum adresinden açılır.'));
    if (req.method !== 'GET') return sendHtml(res, 405, resultPage('Geçersiz istek', 'Bu sayfa yalnız açılabilir.'));
    const url = new URL(req.url || '/', base);

    if (url.pathname === '/') {
      if (app) return sendHtml(res, 200, resultPage('GitHub uygulaması hazır', 'Kuruluma devam et.', { href: installUrl(app.slug), label: 'Uygulamayı kur' }));
      return sendHtml(res, 200, manifestPage({ manifest, state: appState }));
    }

    if (url.pathname === '/github/app-created') {
      if (url.searchParams.get('state') !== appState) {
        return sendHtml(res, 400, resultPage('Geçersiz istek', 'Bu bağlantı bu kuruluma ait değil. Terminaldeki adımları izle.'));
      }
      if (!app) {
        if (!converting) converting = convertManifestCode(ctx.fetch, url.searchParams.get('code'));
        try {
          app = await converting;
        } catch (error) {
          sendHtml(res, 502, resultPage('GitHub uygulaması alınamadı', 'Terminale dön; ne yapacağın orada yazıyor.'));
          return finish(error);
        }
        ctx.created.githubApp = { name: app.name, slug: app.slug, settingsUrl: `https://github.com/settings/apps/${app.slug}` };
        ctx.io.say(`  ✓ GitHub uygulaması oluşturuldu: ${app.name}`);
        ctx.io.say('  → Şimdi tarayıcıda "Install" düğmesine bas ("All repositories" seçili kalsın), sorulursa "Authorize" de.');
        ctx.io.say(`    Kurulum sayfası açılmadıysa bu adresi aç: ${installUrl(app.slug)}`);
        ctx.io.say(`    Kurulumdan sonra tarayıcı buraya dönmezse bu adresi aç: ${authorizeUrl()}`);
      }
      res.writeHead(302, { Location: installUrl(app.slug), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
      return res.end();
    }

    if (url.pathname === '/github/callback') {
      if (!app) return sendHtml(res, 400, resultPage('Önce GitHub uygulaması', 'Terminaldeki adımları sırayla izle.'));
      const state = url.searchParams.get('state');
      // Kurulumdan dönüşte GitHub state göndermez; gönderildiyse bizimki olmalı.
      if (state !== null && state !== installState) return sendHtml(res, 400, resultPage('Geçersiz istek', 'Bu bağlantı bu kuruluma ait değil.'));
      if (finished) return sendHtml(res, 200, resultPage('Tamam', 'Terminale dönebilirsin.'));
      const retry = { href: authorizeUrl(), label: 'Yeniden dene' };
      const code = url.searchParams.get('code');
      if (!code) return sendHtml(res, 400, resultPage('Yetki verilmedi', 'Uygulamayı kurduktan sonra yetkiyi onayla.', retry));
      let userToken;
      try {
        userToken = await exchangeUserCode(ctx.fetch, { clientId: app.clientId, clientSecret: app.clientSecret, code });
      } catch (error) {
        ctx.io.say(`  ! ${error.message} Tarayıcıdaki "Yeniden dene" düğmesine bas.`);
        return sendHtml(res, 400, resultPage('GitHub yetkisi alınamadı', 'Bir kez daha dene.', retry));
      }
      sendHtml(res, 200, resultPage('GitHub bağlandı', 'Bu sekmeyi kapatıp terminale dönebilirsin.'));
      return finish(null, { app, userToken, installationIdHint: url.searchParams.get('installation_id') });
    }

    return sendHtml(res, 404, resultPage('Bulunamadı', 'Bu sayfa yok.'));
  }

  server.on('request', (req, res) => {
    handle(req, res).catch((error) => {
      if (!res.headersSent) sendHtml(res, 500, resultPage('Bir sorun çıktı', 'Terminale dön.'));
      finish(error);
    });
  });

  const timer = setTimeout(
    () => finish(new KurError('Tarayıcıdan dönüş beklenirken süre doldu.', 'Komutu yeniden çalıştır; GitHub adımlarını 30 dakika içinde tamamla.')),
    timeoutMs,
  );
  try {
    ctx.io.say('  → Tarayıcıda GitHub açılıyor. Sırayla:');
    ctx.io.say('    1) "Create GitHub App" düğmesine bas (ad alınmışsa sonuna bir harf ekle).');
    ctx.io.say('    2) Sonraki sayfada "Install" düğmesine bas; "All repositories" seçili kalsın.');
    ctx.io.say('    3) Sorulursa "Authorize" de, sonra terminale dön.');
    await showUrl(ctx, `${base}/`);
    return await done;
  } finally {
    clearTimeout(timer);
    server.close();
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  }
}

// ---------------------------------------------------------------------------------------------
// Adımlar
// ---------------------------------------------------------------------------------------------

/** Tarayıcıda açmayı dener; açılsa da açılmasa da adres HER ZAMAN ekrana yazılır. */
async function showUrl(ctx, url) {
  let opened = false;
  try {
    opened = await ctx.open(url);
  } catch {
    opened = false;
  }
  ctx.io.say(opened ? `  Tarayıcı açılmadıysa bu adresi aç: ${url}` : `  Tarayıcı açılamadı. Bu adresi aç: ${url}`);
  return opened;
}

function readVercelAuthFile(ctx) {
  for (const dir of vercelConfigDirs({ platform: ctx.platform, home: ctx.home, env: ctx.env })) {
    const text = ctx.readText(path.join(dir, 'auth.json'));
    if (!text) continue;
    const auth = parseVercelAuth(text, ctx.nowSeconds());
    if (!auth) continue;
    return { ...auth, currentTeam: parseVercelCurrentTeam(ctx.readText(path.join(dir, 'config.json')) || '') };
  }
  return null;
}

async function vercelUser(ctx, token) {
  const result = await vercelApi(ctx.fetch, { token })('/v2/user');
  const user = result.data && result.data.user;
  if (result.status !== 200 || !user || typeof user.username !== 'string') return null;
  return { username: user.username, defaultTeamId: user.defaultTeamId || null };
}

async function runVercelLogin(ctx) {
  ctx.io.say('  → Tarayıcıda Vercel açılacak; orada girişi onayla. (Vercel aracı ilk seferde indirilir, biraz sürebilir.)');
  ctx.io.say('    Vercel aracı bir adres yazarsa ve tarayıcı açılmazsa o adresi kendin aç.');
  const code = await ctx.run('npx', ['--yes', `vercel@${VERCEL_CLI_VERSION}`, 'login']);
  if (code !== 0) ctx.io.say('  ! Vercel girişi tamamlanamadı.');
  return code === 0;
}

async function loginFromCli(ctx) {
  if (!(await runVercelLogin(ctx))) return null;
  const auth = readVercelAuthFile(ctx);
  if (!auth || auth.expired) return null;
  const user = await vercelUser(ctx, auth.token);
  return user ? { auth, user } : null;
}

async function loginFromPaste(ctx) {
  ctx.io.say('  Vercel girişi otomatik okunamadı. Yedek yol: Vercel anahtarı.');
  ctx.io.say(`  1) ${VERCEL_TOKENS_URL} adresinde "Create" ile bir anahtar oluştur (kapsam: kendi hesabın, süre: 1 gün yeter).`);
  ctx.io.say('  2) Anahtarı buraya yapıştır. Yazdığın ekranda görünmez.');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = (await ctx.io.askSecret('  Vercel anahtarı: ')).trim();
    if (!token) continue;
    const user = await vercelUser(ctx, token);
    if (user) return { auth: { token, expiresAt: null, currentTeam: null }, user };
    ctx.io.say("  ! Bu anahtar Vercel'de geçmedi. Tamamını kopyalayıp yeniden yapıştır.");
  }
  throw new KurError('Vercel hesabına bağlanılamadı.', `${VERCEL_TOKENS_URL} adresinden yeni bir anahtar oluşturup komutu yeniden çalıştır.`);
}

/** 2. adım: Vercel girişi ve ekip seçimi. Döner: `{ session: { token, teamId, source, expiresAt }, user, team }`. */
export async function vercelLogin(ctx) {
  let login = null;
  const existing = readVercelAuthFile(ctx);
  if (existing && !existing.expired) {
    const user = await vercelUser(ctx, existing.token);
    if (user && (await ctx.io.confirm(`  Vercel'de "${user.username}" hesabıyla girişlisin. Bu hesapla devam edilsin mi?`, true))) {
      login = { auth: existing, user, source: 'file' };
    }
  }
  if (!login) {
    const fromCli = await loginFromCli(ctx);
    login = fromCli ? { ...fromCli, source: 'file' } : { ...(await loginFromPaste(ctx)), source: 'paste' };
  }
  const session = { token: login.auth.token, teamId: null, source: login.source, expiresAt: login.auth.expiresAt };
  const team = await chooseVercelTeam(ctx, session, login.user, login.auth.currentTeam);
  session.teamId = team ? team.id : null;
  ctx.io.say(`  ✓ Vercel hesabı: ${login.user.username}${team ? ` (ekip: ${team.slug})` : ''}`);
  return { session, user: login.user, team };
}

async function chooseVercelTeam(ctx, session, user, currentTeam) {
  const result = await vercelApi(ctx.fetch, { token: session.token })('/v2/teams', { query: { limit: 100 } });
  const data = expect(result, [200], 'Vercel', 'Vercel ekiplerini okuma');
  const teams = data && Array.isArray(data.teams) ? data.teams : [];
  const usable = teams.filter((team) => team && typeof team.id === 'string' && typeof team.slug === 'string');
  if (usable.length <= 1) return usable[0] || null;
  const preferred = usable.findIndex((team) => team.id === (currentTeam || user.defaultTeamId));
  ctx.io.say('  Vercel hesabında birden çok ekip var. Uygulama hangisinde dursun?');
  usable.forEach((team, index) => ctx.io.say(`    ${index + 1}) ${team.slug}${team.name && team.name !== team.slug ? ` (${team.name})` : ''}`));
  for (;;) {
    const answer = await ctx.io.ask('  Numara', String((preferred >= 0 ? preferred : 0) + 1));
    const index = Number.parseInt(answer, 10) - 1;
    if (usable[index]) return usable[index];
    ctx.io.say(`  ! 1 ile ${usable.length} arasında bir numara yaz.`);
  }
}

/** Uzun adımlardan önce: dosyadan gelen Vercel oturumunun süresi bitmek üzereyse yeniden giriş. */
export async function ensureFreshVercel(ctx, vercel) {
  const { session } = vercel;
  if (session.source !== 'file' || session.expiresAt === null || session.expiresAt - ctx.nowSeconds() > 300) return;
  ctx.io.say('  Vercel oturumunun süresi dolmak üzere; yeniden giriş yapılacak.');
  const fresh = (await loginFromCli(ctx)) || (await loginFromPaste(ctx));
  if (fresh.user.username !== vercel.user.username) {
    throw new KurError(`Vercel'e başka bir hesapla (${fresh.user.username}) giriş yapıldı.`, `"${vercel.user.username}" hesabıyla giriş yapıp komutu yeniden çalıştır.`);
  }
  session.token = fresh.auth.token;
  session.expiresAt = fresh.auth.expiresAt;
}

/** Boş bir ad sorar: DNS'e uygun, `<ad>.vercel.app` boş, Vercel hesabında aynı adlı proje yok. */
async function askFreeProjectName(ctx, api, question) {
  for (;;) {
    const answer = (await ctx.io.ask(question, defaultProjectName(ctx.randomInt))).trim().toLowerCase();
    const problem = validateProjectName(answer);
    if (problem) {
      ctx.io.say(`  ! ${problem}`);
      continue;
    }
    if (!(await vercelAppDomainFree(ctx.fetch, answer))) {
      ctx.io.say(`  ! ${answer}.vercel.app başka biri tarafından kullanılıyor. Başka bir ad seç.`);
      continue;
    }
    const existing = await api(`/v9/projects/${encodeURIComponent(answer)}`);
    if (existing.status === 200) {
      ctx.io.say(`  ! Vercel hesabında "${answer}" adlı bir proje zaten var. Başka bir ad seç.`);
      continue;
    }
    expect(existing, [404], 'Vercel', 'Vercel projesine bakma');
    return answer;
  }
}

/** 3. adım: ad seçimi (proje 6. adımda, repo hazır olunca açılır). */
export async function chooseProjectName(ctx, vercel) {
  const name = await askFreeProjectName(ctx, vercelApi(ctx.fetch, vercel.session), '  Uygulamanın adı (adresin https://<ad>.vercel.app olur)');
  ctx.io.say(`  ✓ Adres boş: https://${name}.vercel.app`);
  return name;
}

/** 4. adım: GitHub uygulaması, kullanıcı anahtarı ve kurulum. */
export async function setupGithub(ctx, { productionUrl }) {
  const { app, userToken, installationIdHint } = await runGithubAppFlow(ctx, { appName: githubAppName(ctx.randomInt), productionUrl });
  const github = githubApi(ctx.fetch, ctx);
  const user = expect(await github('/user', { token: userToken }), [200], 'GitHub', 'GitHub hesabını okuma');
  const login = user && user.login;
  if (typeof login !== 'string') throw new KurError('GitHub hesabı okunamadı.', 'Komutu yeniden çalıştır.');
  if (app.ownerLogin && app.ownerLogin.toLowerCase() !== login.toLowerCase()) {
    throw new KurError(
      `GitHub uygulaması "${app.ownerLogin}" hesabında, yetki ise "${login}" hesabından verildi.`,
      "Tarayıcıda GitHub'a tek hesapla giriş yapıp komutu yeniden çalıştır.",
    );
  }
  ctx.io.say(`  ✓ GitHub hesabın: ${login}`);
  const installation = await ensureInstallation(ctx, app, login, installationIdHint);
  return { app, userToken, login, installation };
}

async function ensureInstallation(ctx, app, login, installationIdHint) {
  const github = githubApi(ctx.fetch, ctx);
  const settingsUrl = (id) => `https://github.com/settings/installations/${id}`;
  for (let attempt = 1; ; attempt += 1) {
    const jwt = githubAppJwt({ issuer: app.clientId, pem: app.pem, nowSeconds: ctx.nowSeconds() });
    const result = await github(`/users/${encodeURIComponent(login)}/installation`, { token: jwt });
    if (result.status === 404) {
      if (attempt >= 3) throw new KurError('GitHub uygulaması hesabına kurulmadı.', `https://github.com/apps/${app.slug}/installations/new adresinden kendi hesabına kur, sonra komutu yeniden çalıştır.`);
      ctx.io.say(`  ! Uygulama "${login}" hesabına kurulmamış görünüyor (başka bir hesap seçilmiş olabilir).`);
      await showUrl(ctx, `https://github.com/apps/${app.slug}/installations/new`);
      await ctx.io.pause('  Kendi hesabına "Install" ile kurduktan sonra Enter\'a bas.');
      continue;
    }
    const data = expect(result, [200], 'GitHub', 'GitHub uygulamasının kurulumunu okuma');
    if (installationIdHint && String(data.id) !== String(installationIdHint)) {
      ctx.io.say("  ! GitHub'ın döndüğü kurulum kimliği eşleşmedi; hesabındaki kurulum kullanılacak.");
    }
    if (data.repository_selection === 'all') {
      ctx.io.say('  ✓ Uygulama hesabına kuruldu (tüm repolar).');
      return { id: data.id, repositorySelection: 'all' };
    }
    if (attempt >= 2) {
      ctx.io.say('  ! UYARI: Uygulama yalnız seçili repolara erişebiliyor. Yeni danışan repolarına erişemez;');
      ctx.io.say(`    sonra ${settingsUrl(data.id)} adresinde "All repositories" seçip kaydet.`);
      return { id: data.id, repositorySelection: data.repository_selection };
    }
    ctx.io.say('  ! Uygulama yalnız seçili repolarla kurulmuş. Axon Fit\'in yeni danışan repolarına erişebilmesi için "All repositories" gerekli.');
    await showUrl(ctx, settingsUrl(data.id));
    await ctx.io.pause('  Açılan sayfada "All repositories" seçip "Save" de, sonra Enter\'a bas.');
  }
}

async function askRepoName(ctx, question, suggestion, { forbidden = [] } = {}) {
  for (;;) {
    const answer = (await ctx.io.ask(question, suggestion)).trim();
    const problem = validateRepoName(answer);
    if (problem) {
      ctx.io.say(`  ! ${problem}`);
      continue;
    }
    if (forbidden.some((name) => name.toLowerCase() === answer.toLowerCase())) {
      ctx.io.say('  ! Bu ad kullanılamaz; başka bir ad yaz.');
      continue;
    }
    if (answer.toLowerCase().startsWith('client-')) {
      ctx.io.say('  ! "client-" ile başlayan adlar danışanlara ayrılmış; başka bir ad yaz.');
      continue;
    }
    return answer;
  }
}

async function waitForBranch(ctx, github, token, fullName, branch) {
  for (let i = 0; i < 45; i += 1) {
    const result = await github(`/repos/${fullName}/branches/${encodeURIComponent(branch)}`, { token });
    if (result.status === 200) return;
    await ctx.sleep(2000);
  }
  throw new KurError(
    "Yeni repo GitHub'da hazırlanırken süre doldu.",
    `https://github.com/${fullName} sayfası açılıyorsa GitHub uygulamasının "All repositories" erişimiyle kurulu olduğunu kontrol et, sonra komutu yeniden çalıştır.`,
  );
}

/** Özel repo açar (`auto_init`); ad doluysa yenisini sorar. Döner: `{ name, data, created }`. */
async function createPrivateRepo(ctx, github, token, { login, name, label, description, forbidden = [], allowExisting = false }) {
  let current = name;
  for (;;) {
    const existing = await github(`/repos/${login}/${current}`, { token });
    if (existing.status === 200) {
      if (allowExisting && existing.data && existing.data.private === true && existing.data.fork !== true) {
        if (await ctx.io.confirm(`  ${login}/${current} zaten var (özel). ${label} olarak bu kullanılsın mı?`, true)) return { name: current, data: existing.data, created: false };
      } else if (allowExisting) {
        ctx.io.say(`  ! ${login}/${current} herkese açık ya da fork; ${label.toLowerCase()} olamaz.`);
      }
      current = await askRepoName(ctx, `  ${login}/${current} kullanılamıyor. ${label} için başka bir ad`, `${current}-2`, { forbidden });
      continue;
    }
    expect(existing, [404], 'GitHub', 'Repo adına bakma');
    const created = await github('/user/repos', { token, method: 'POST', body: { name: current, description, private: true, auto_init: true } });
    if (created.status === 201) return { name: current, data: created.data || {}, created: true };
    if (created.status === 422) {
      ctx.io.say(`  ! ${login}/${current} açılamadı (${apiErrorDetail(created.data).message || 'ad kullanılıyor'}).`);
      current = await askRepoName(ctx, `  ${label} için başka bir ad`, `${current}-2`, { forbidden });
      continue;
    }
    throw new ApiError('GitHub', created.status, created.data, `${label} oluşturma`);
  }
}

/**
 * Kaynağı tek, ebeveynsiz commit olarak yükler (Git Data API): ikili/büyük dosyalar blob, metinler
 * ağaçta `content`; ağaç ~2 MB'lık parçalarla `base_tree` üzerine kurulur; dal `force` ile taşınır.
 * İçerik oluşturan istekler arasında en az WRITE_GAP_MS beklenir.
 */
export async function uploadSource(ctx, { github, token, fullName, branch, source }) {
  let last = null;
  const write = async (pathname, body, method = 'POST') => {
    if (last !== null) {
      const wait = last + WRITE_GAP_MS - ctx.nowMs();
      if (wait > 0) await ctx.sleep(wait);
    }
    last = ctx.nowMs();
    // Blob/ağaç içerikle adreslenir, ref `force` ile aynı yere taşınır: yeniden denemek güvenli.
    return github(pathname, { token, method, body, retry: true });
  };
  const plan = planSourceTree(source.files);
  ctx.io.say(`  → Kod yükleniyor: ${source.files.length} dosya (${formatMegabytes(source.totalBytes)} MB). Birkaç dakika sürebilir.`);
  const blobEntries = [];
  for (const blob of plan.blobs) {
    const result = await write(`/repos/${fullName}/git/blobs`, { content: blob.data.toString('base64'), encoding: 'base64' });
    blobEntries.push({ path: blob.path, mode: blob.mode, type: 'blob', sha: shaOf(result, `${blob.path} dosyasını yükleme`) });
  }
  const chunks = chunkTreeEntries([...plan.inline, ...blobEntries]);
  let tree = null;
  for (let i = 0; i < chunks.length; i += 1) {
    const result = await write(`/repos/${fullName}/git/trees`, tree ? { base_tree: tree, tree: chunks[i] } : { tree: chunks[i] });
    tree = shaOf(result, 'Kod ağacını kurma');
    ctx.io.say(`    Dosyalar: ${i + 1}/${chunks.length}`);
  }
  const title = `Axon Fit ${source.version || `(${source.ref})`}`;
  const message = source.commit ? `${title}\n\nKaynak: ${source.name}@${source.commit}` : title;
  const commit = shaOf(await write(`/repos/${fullName}/git/commits`, { message, tree, parents: [] }), 'Commit oluşturma');
  expect(await write(`/repos/${fullName}/git/refs/heads/${encodeURIComponent(branch)}`, { sha: commit, force: true }, 'PATCH'), [200], 'GitHub', `${branch} dalını güncelleme`);
  return { commit, tree, requests: plan.blobs.length + chunks.length + 2 };
}

/** 5. adım: kod reposu (kaynaktan tek commit, özel) ve veri reposu (özel, README'li). */
export async function createRepos(ctx, { login, token, source }) {
  const github = githubApi(ctx.fetch, ctx);
  const code = await createPrivateRepo(ctx, github, token, {
    login,
    name: DEFAULT_CODE_REPO,
    label: 'Kod reposu',
    description: 'Axon Fit — kendi kopyam (kod)',
  });
  const codeFullName = `${login}/${code.name}`;
  ctx.created.codeRepo = `https://github.com/${codeFullName}`;
  const branch = typeof code.data.default_branch === 'string' && code.data.default_branch ? code.data.default_branch : 'main';
  await waitForBranch(ctx, github, token, codeFullName, branch);
  await uploadSource(ctx, { github, token, fullName: codeFullName, branch, source });
  ctx.io.say(`  ✓ Kod reposu (özel, ${source.version || source.ref}): https://github.com/${codeFullName}`);

  const data = await createPrivateRepo(ctx, github, token, {
    login,
    name: dataRepoName(code.name),
    label: 'Veri reposu',
    description: 'Axon Fit verileri (özel)',
    forbidden: [code.name],
    allowExisting: true,
  });
  if (data.created) ctx.created.dataRepo = `https://github.com/${login}/${data.name}`;
  ctx.io.say(`  ✓ Veri reposu (özel): https://github.com/${login}/${data.name}`);
  return { codeName: code.name, codeFullName, codeRepoId: code.data.id || null, branch, dataName: data.name };
}

function linkedTo(project, fullName) {
  const link = project && project.link;
  return Boolean(link) && link.type === 'github' && typeof link.org === 'string' && typeof link.repo === 'string' && `${link.org}/${link.repo}`.toLowerCase() === fullName.toLowerCase();
}

/**
 * 6. adım: repo hazır olunca Vercel projesi `gitRepository` ile açılır (belgeli uç). Vercel'in GitHub uygulaması
 * repoyu görmüyorsa kurulum sayfası açılır, onaydan sonra yeniden denenir. Git erişim hatasında Vercel projeyi
 * bağlantısız açmış olabilir: sonraki deneme o adla çakışırsa ve proje BU çalıştırmada açıldıysa boş proje silinip
 * yeniden açılır (PT'ye yeni ad sorulmaz). Ad başka biri/başka bir projeyle dolduysa yeni ad sorulur.
 */
export async function ensureVercelProject(ctx, vercel, { name, repoFullName }) {
  const api = vercelApi(ctx.fetch, vercel.session);
  const getProject = async (idOrName) => {
    const result = await api(`/v9/projects/${encodeURIComponent(idOrName)}`);
    if (result.status === 404) return null;
    return expect(result, [200], 'Vercel', 'Vercel projesini okuma');
  };
  const projectUrl = (projectName) => `https://vercel.com/${vercel.team ? vercel.team.slug : vercel.user.username}/${projectName}`;
  const posted = new Set();
  let current = name;
  for (let attempt = 1; ; attempt += 1) {
    const postedBefore = posted.has(current);
    posted.add(current);
    const created = await api('/v11/projects', {
      method: 'POST',
      body: { name: current, framework: 'nextjs', gitRepository: { type: 'github', repo: repoFullName } },
    });
    let project = null;
    if (created.status === 200 || created.status === 201) {
      project = await getProject((created.data && created.data.id) || current);
    } else {
      const error = new ApiError('Vercel', created.status, created.data, 'Vercel projesini açma');
      if (attempt < 12 && isVercelGitAccessError(error)) {
        // Bağlantısız açılmış olabilir: başarısız biterse "oluşturulanlar" listesinde görünsün.
        if (await getProject(current)) ctx.created.vercelProject = `${projectUrl(current)} (GitHub'a bağlanmadı)`;
        // Yeni açılan repoyu Vercel birkaç saniye sonra görebilir: önce kendiliğinden yeniden dene.
        if (attempt <= 2) {
          await ctx.sleep(5000);
          continue;
        }
        ctx.io.say(`  ! Vercel'in GitHub uygulaması ${repoFullName} reposunu göremiyor.`);
        ctx.io.say('    Açılan sayfada Vercel\'i kendi GitHub hesabına kur ("All repositories" ya da bu repoyu seç) ve kaydet.');
        await showUrl(ctx, safeLink(error.link, ['github.com']) || VERCEL_GITHUB_INSTALL_URL);
        await ctx.io.pause("  Tamam olunca Enter'a bas.");
        continue;
      }
      if (attempt < 12 && isVercelLoginConnectionError(error)) {
        ctx.io.say('  ! Vercel hesabın GitHub hesabına bağlı değil. Vercel hesap ayarlarının "Authentication" bölümünde GitHub bağlantısını ekle.');
        await showUrl(ctx, safeLink(error.link) || VERCEL_LOGIN_CONNECTIONS_URL);
        await ctx.io.pause("  Tamam olunca Enter'a bas.");
        continue;
      }
      const existing = await getProject(current);
      if (existing && linkedTo(existing, repoFullName)) {
        project = existing; // önceki deneme aslında başarılı olmuş
      } else if (existing && !existing.link && postedBefore && attempt < 12) {
        ctx.io.say(`  → Önceki denemede GitHub'a bağlanmadan açılan "${current}" projesi silinip bağlı olarak yeniden açılıyor.`);
        expect(await api(`/v9/projects/${encodeURIComponent(existing.id)}`, { method: 'DELETE' }), [200, 204], 'Vercel', 'Bağlantısız projeyi silme');
        delete ctx.created.vercelProject;
        continue;
      } else if (existing) {
        ctx.io.say(`  ! "${current}" adı Vercel'de artık dolu.`);
        current = await askFreeProjectName(ctx, api, '  Uygulama için başka bir ad');
        continue;
      } else {
        throw error;
      }
    }
    if (!project || !project.id) throw new KurError('Vercel projesi okunamadı.', 'Komutu yeniden çalıştır.');
    ctx.created.vercelProject = projectUrl(project.name || current);
    if (!linkedTo(project, repoFullName)) {
      throw new KurError('Vercel projesi GitHub reposuna bağlanamadı.', `${ctx.created.vercelProject}/settings/git adresinden ${repoFullName} reposunu bağla, sonra Vercel'de "Redeploy" de.`);
    }
    ctx.io.say(`  ✓ Vercel projesi: ${ctx.created.vercelProject} (${repoFullName} reposuna bağlı)`);
    return project;
  }
}

/** 7a: env yazımı (upsert) ve geri okuma. Hata mesajında değer yok, yalnız anahtar adları. */
export async function writeEnv(ctx, vercel, projectId, items) {
  const api = vercelApi(ctx.fetch, vercel.session);
  const result = await api(`/v10/projects/${encodeURIComponent(projectId)}/env`, { method: 'POST', query: { upsert: 'true' }, body: items });
  if (result.status !== 200 && result.status !== 201) throw new ApiError('Vercel', result.status, result.data, "Ayarları Vercel'e yazma");
  const failed = result.data && Array.isArray(result.data.failed) ? result.data.failed : [];
  if (failed.length) {
    const keys = failed
      .map((item) => {
        const error = (item && item.error) || {};
        const key = /^[A-Z0-9_]{1,100}$/.test(error.key || '') ? error.key : /^[A-Z0-9_]{1,100}$/.test(error.envVarKey || '') ? error.envVarKey : '?';
        const code = /^[a-z0-9_]{1,60}$/.test(error.code || '') ? ` (${error.code})` : '';
        return `${key}${code}`;
      })
      .join(', ');
    throw new KurError(`Bazı ayarlar Vercel'e yazılamadı: ${keys}.`, 'Vercel projesinin Settings → Environment Variables ekranına bak; eksikleri ekleyip "Redeploy" de.');
  }
  const saved = expect(await api(`/v10/projects/${encodeURIComponent(projectId)}/env`), [200], 'Vercel', 'Ayarları geri okuma');
  const envs = saved && Array.isArray(saved.envs) ? saved.envs : [];
  const missing = items.filter((item) => !envs.some((env) => env && env.key === item.key && (Array.isArray(env.target) ? env.target.includes('production') : env.target === 'production')));
  if (missing.length) throw new KurError(`Vercel'de görünmeyen ayarlar: ${missing.map((item) => item.key).join(', ')}.`, 'Vercel projesinin Settings → Environment Variables ekranına bak.');
  ctx.created.env = true;
  ctx.io.say(`  ✓ ${items.length} ayar Production ortamına yazıldı (sırlar gizli tutuluyor).`);
}

/** 7b: Production yayını (gitSource) ve hazır olana dek bekleme. */
export async function deployAndWait(ctx, vercel, { project, repoId, branch, timeoutMs = DEPLOY_WAIT_MS }) {
  const api = vercelApi(ctx.fetch, vercel.session);
  const link = project.link || {};
  const numericRepoId = Number(link.repoId !== undefined && link.repoId !== null ? link.repoId : repoId);
  const gitSource = Number.isSafeInteger(numericRepoId) && numericRepoId > 0
    ? { type: 'github', repoId: numericRepoId, ref: branch }
    : { type: 'github', org: link.org, repo: link.repo, ref: branch };
  const created = await api('/v13/deployments', {
    method: 'POST',
    query: { skipAutoDetectionConfirmation: '1' },
    body: { name: project.name, project: project.id, target: 'production', gitSource, projectSettings: { framework: 'nextjs' } },
  });
  let deployment = expect(created, [200, 201], 'Vercel', 'Yayını başlatma');
  if (!deployment || !deployment.id) throw new KurError('Vercel yayını başlatılamadı.', 'Vercel projesinde "Redeploy" ile yayını kendin başlat.');
  ctx.io.say('  → Yayın başladı; hazır olması genelde 2-5 dakika sürer.');
  const started = ctx.nowMs();
  let lastState = null;
  for (;;) {
    const state = deployment.readyState;
    if (state && state !== lastState) {
      ctx.io.say(`    Yayın durumu: ${DEPLOY_STATES[state] || state}`);
      lastState = state;
    }
    if (state === 'READY') return deployment;
    if (state === 'ERROR' || state === 'CANCELED' || state === 'BLOCKED') {
      const where = safeLink(deployment.inspectorUrl, ['vercel.com']);
      throw new KurError(
        `Vercel yayını tamamlanamadı (${DEPLOY_STATES[state]}).`,
        `${where ? `Ayrıntı: ${where}. ` : ''}Ayarlar kaydedildi; sorun giderilince Vercel projesinde "Redeploy" yeterli.`,
      );
    }
    if (ctx.nowMs() - started > timeoutMs) {
      throw new KurError('Yayın beklenenden uzun sürdü.', 'Vercel projesinin Deployments ekranından durumu izle; hazır olunca adresini aç.');
    }
    await ctx.sleep(5000);
    deployment = expect(await api(`/v13/deployments/${encodeURIComponent(deployment.id)}`), [200], 'Vercel', 'Yayın durumunu okuma');
  }
}

/** Hazır yayının Production adresi. Beklenen `<ad>.vercel.app` değilse gerçek adres döner. */
export async function productionDomain(ctx, vercel, { project, deployment, expectedHost }) {
  const api = vercelApi(ctx.fetch, vercel.session);
  let current = deployment;
  for (let i = 0; i < 6 && current.aliasAssigned !== true; i += 1) {
    await ctx.sleep(3000);
    current = expect(await api(`/v13/deployments/${encodeURIComponent(deployment.id)}`), [200], 'Vercel', 'Yayın durumunu okuma');
  }
  if (Array.isArray(current.alias) && current.alias.includes(expectedHost)) return expectedHost;
  const domains = await api(`/v9/projects/${encodeURIComponent(project.id)}/domains`, { query: { production: 'true' } });
  const names = domains.status === 200 && domains.data && Array.isArray(domains.data.domains)
    ? domains.data.domains.map((domain) => domain && domain.name).filter((name) => typeof name === 'string')
    : [];
  if (names.includes(expectedHost)) return expectedHost;
  return names.find((name) => name.endsWith('.vercel.app')) || names[0] || expectedHost;
}

// ---------------------------------------------------------------------------------------------
// Ana akış
// ---------------------------------------------------------------------------------------------

export async function kur(ctx) {
  const { io } = ctx;
  const step = (n, text) => io.say(`\n[${n}/${STEP_COUNT}] ${text}`);

  // Kaynak, hesaplarda hiçbir şey oluşturulmadan (Vercel girişinden bile önce) indirilip denetlenir.
  step(1, 'Hazırlık: Node sürümü kontrol ediliyor, Axon Fit\'in son sürümü indirilip denetleniyor…');
  checkNodeVersion(ctx.nodeVersion);
  const sourceName = parseSource(ctx.env.AXON_KUR_SOURCE || DEFAULT_SOURCE);
  const source = { name: sourceName, ...(await downloadSource(ctx, sourceName)) };
  io.say(`  ✓ Node ${ctx.nodeVersion}; kaynak ${sourceName} ${source.version || source.ref} (${source.files.length} dosya, ${formatMegabytes(source.totalBytes)} MB)`);

  step(2, 'Vercel hesabına giriş…');
  const vercel = await vercelLogin(ctx);

  step(3, 'Uygulamanın adı ve adresi…');
  const name = await chooseProjectName(ctx, vercel);
  const callbackHost = `${name}.vercel.app`;
  const productionUrl = `https://${callbackHost}`;

  step(4, 'GitHub uygulaması (giriş ve veri erişimi) oluşturuluyor…');
  const github = await setupGithub(ctx, { productionUrl });

  step(5, "GitHub'da kod ve veri repoların açılıyor…");
  const repos = await createRepos(ctx, { login: github.login, token: github.userToken, source });

  step(6, 'Vercel projesi açılıyor ve kod reposuna bağlanıyor…');
  await ensureFreshVercel(ctx, vercel);
  const project = await ensureVercelProject(ctx, vercel, { name, repoFullName: repos.codeFullName });

  step(7, 'Ayarlar yazılıyor ve ilk yayın başlatılıyor…');
  await ensureFreshVercel(ctx, vercel);
  const items = buildEnvItems({
    owner: github.login,
    codeRepo: repos.codeName,
    dataRepo: repos.dataName,
    branch: repos.branch,
    appId: github.app.id,
    privateKey: github.app.pem,
    installationId: github.installation.id,
    clientId: github.app.clientId,
    clientSecret: github.app.clientSecret,
    authSecret: generateAuthSecret(ctx.randomBytes),
  });
  await writeEnv(ctx, vercel, project.id, items);
  const deployment = await deployAndWait(ctx, vercel, { project, repoId: repos.codeRepoId, branch: repos.branch });
  const host = await productionDomain(ctx, vercel, { project, deployment, expectedHost: `${project.name || name}.vercel.app` });
  const siteUrl = `https://${host}`;
  if (host !== callbackHost) {
    io.say(`  ! Adresin GitHub uygulamasına yazılandan farklı: ${siteUrl}`);
    io.say(`    GitHub ile girişin çalışması için ${ctx.created.githubApp.settingsUrl} sayfasında "Callback URL" listesine`);
    io.say(`    ${siteUrl}/api/auth/github/callback adresini ekleyip "Save changes" de.`);
  }

  step(8, 'Bitti.');
  io.say(`  Adresin: ${siteUrl}`);
  const opened = await showUrl(ctx, `${siteUrl}/login`);
  io.say(opened ? '  Tarayıcıda açıldı: GitHub ile giriş yap.' : '  Bu adreste "GitHub ile giriş yap" düğmesine bas.');
  io.say(`  GitHub uygulamanın ayarları: ${ctx.created.githubApp.settingsUrl}`);
  io.say(`  Vercel projen: ${ctx.created.vercelProject}`);
  if (github.installation.repositorySelection !== 'all') {
    io.say(`  Unutma: https://github.com/settings/installations/${github.installation.id} adresinde "All repositories" seç.`);
  }
  return { siteUrl };
}

export function reportFailure(ctx, error) {
  const { io } = ctx;
  io.say('');
  for (const line of failureLines(error)) io.say(line);
  const lines = describeCreated(ctx.created);
  if (lines.length === 0) {
    io.say('Henüz hiçbir şey oluşturulmadı.');
    return;
  }
  io.say('Şu ana kadar oluşturulanlar (yerinde duruyor):');
  for (const line of lines) io.say(`  - ${line}`);
  io.say('Komutu yeniden çalıştırırsan yeni bir GitHub uygulaması açılır ve yeni ad sorulur; yukarıdakileri istersen silebilirsin.');
}

/** Çıkış kodu: 0 başarı, 130 Ctrl+C, 1 diğer her şey (Ctrl+D / giriş kapanması dahil). */
export async function main(ctx, { handleSigint = false } = {}) {
  const onSigint = () => {
    reportFailure(ctx, new KurCancelled('sigint'));
    process.exit(130);
  };
  if (handleSigint) process.once('SIGINT', onSigint);
  ctx.io.say('Axon Fit kurulumu — her adımda ne olduğunu yazacağım. Durdurmak için Ctrl+C.');
  try {
    await kur(ctx);
    return 0;
  } catch (error) {
    reportFailure(ctx, error);
    return error instanceof KurCancelled && error.reason === 'sigint' ? 130 : 1;
  } finally {
    if (handleSigint) process.off('SIGINT', onSigint);
    if (typeof ctx.io.close === 'function') ctx.io.close();
  }
}

// ---------------------------------------------------------------------------------------------
// Gerçek terminal, tarayıcı ve komut çalıştırıcı
// ---------------------------------------------------------------------------------------------

/**
 * Terminal girişi: TEK readline arayüzü, okunan satırlar kuyruğa girer (yapıştırılan çok satırlı girdi
 * kaybolmaz, sıradaki sorulara gider). readline burada dinamik içe aktarılır (eski Node'da sürüm mesajından
 * önce çökmesin). Arayüz `terminal: false`: Ctrl+C gerçek SIGINT olarak gelir. Sorular arasında giriş
 * duraklatılır (Vercel aracı ve gizli giriş karışmasın). Giriş kapanırsa (Ctrl+D, boru bitti) her soru
 * `KurCancelled('eof')` ile biter.
 */
export function terminalIo({ input = process.stdin, output = process.stdout } = {}) {
  const say = (line = '') => output.write(`${line}\n`);
  const queue = [];
  let waiter = null;
  let rl = null;
  let opening = null;
  let closingOurselves = false;
  let ended = Boolean(input.readableEnded);
  input.once('end', () => {
    ended = true;
  });

  const settle = (error, line) => {
    const current = waiter;
    waiter = null;
    if (!current) return;
    if (error) current.reject(error);
    else current.resolve(line);
  };

  function open() {
    if (rl) return Promise.resolve(rl);
    if (!opening) {
      opening = import('node:readline').then(({ createInterface }) => {
        const iface = createInterface({ input, terminal: false, crlfDelay: Infinity });
        iface.on('line', (line) => {
          if (waiter) settle(null, line);
          else queue.push(line);
        });
        iface.on('close', () => {
          rl = null;
          opening = null;
          if (closingOurselves) {
            closingOurselves = false;
            return;
          }
          ended = true;
          settle(new KurCancelled('eof'));
        });
        rl = iface;
        return iface;
      });
    }
    return opening;
  }

  function closeInterface() {
    if (!rl) return;
    closingOurselves = true;
    rl.close();
  }

  async function prompt(text) {
    output.write(text);
    if (queue.length) return queue.shift();
    if (ended) throw new KurCancelled('eof');
    const iface = await open();
    if (queue.length) return queue.shift();
    if (ended) throw new KurCancelled('eof');
    try {
      return await new Promise((resolve, reject) => {
        waiter = { resolve, reject };
        iface.resume();
      });
    } finally {
      if (rl) rl.pause();
    }
  }
  async function ask(question, fallback = '') {
    const answer = await prompt(fallback ? `${question} [${fallback}]: ` : `${question}: `);
    return answer.trim() || fallback;
  }
  async function confirm(question, defaultYes = true) {
    for (;;) {
      const answer = (await ask(`${question} (${defaultYes ? 'E/h' : 'e/H'})`)).toLowerCase();
      if (!answer) return defaultYes;
      if (['e', 'evet', 'y', 'yes'].includes(answer)) return true;
      if (['h', 'hayır', 'hayir', 'n', 'no'].includes(answer)) return false;
      say('  "e" ya da "h" yaz.');
    }
  }
  async function pause(message) {
    await prompt(`${message} `);
  }
  async function askSecret(question) {
    if (!input.isTTY || typeof input.setRawMode !== 'function') return prompt(question);
    if (queue.length) {
      output.write(`${question}\n`);
      return queue.shift();
    }
    if (ended) throw new KurCancelled('eof');
    // Gizli girişi readline görmesin (satır olarak kuyruğa düşmesin): arayüz kapanır, sonra yeniden açılır.
    closeInterface();
    output.write(question);
    return new Promise((resolve, reject) => {
      let value = '';
      const cleanup = () => {
        input.off('data', onData);
        input.off('end', onEnd);
        input.setRawMode(false);
        input.pause();
      };
      const finish = (error, result) => {
        cleanup();
        output.write('\n');
        if (error) reject(error);
        else resolve(result);
      };
      const onEnd = () => finish(new KurCancelled('eof'));
      const onData = (chunk) => {
        for (const char of String(chunk).replace(/\x1b\[20[01]~/g, '')) {
          if (char === '\r' || char === '\n') return finish(null, value);
          if (char === '\u0003') return finish(new KurCancelled('sigint'));
          if (char === '\u0004') return finish(new KurCancelled('eof'));
          if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
          else if (char >= ' ' && char !== '\u001b') value += char;
        }
        return undefined;
      };
      input.setRawMode(true);
      input.setEncoding('utf8');
      input.resume();
      input.on('data', onData);
      input.once('end', onEnd);
    });
  }
  return { say, ask, confirm, pause, askSecret, close: closeInterface };
}

function runCommand(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.once('error', () => resolve(-1));
    child.once('exit', (code) => resolve(code === null ? 1 : code));
  });
}

export function realContext() {
  return {
    fetch: globalThis.fetch,
    io: terminalIo(),
    open: (url) => openWith(spawn, process.platform, url),
    run: runCommand,
    readText: (file) => {
      try {
        return fs.readFileSync(file, 'utf8');
      } catch {
        return null;
      }
    },
    platform: process.platform,
    env: process.env,
    home: os.homedir(),
    nodeVersion: process.versions.node,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    randomInt: crypto.randomInt,
    randomBytes: crypto.randomBytes,
    nowSeconds: () => Math.floor(Date.now() / 1000),
    nowMs: () => Date.now(),
    created: {},
  };
}

if (process.env.AXON_KUR_TEST !== '1') {
  // Sürüm denetimi her şeyden önce: eski Node'da başka hiçbir şey çalışmadan anlaşılır mesaj.
  const problem = startupProblem(process.versions.node);
  if (problem) {
    process.stdout.write(`${problem}\n`);
    process.exitCode = 1;
  } else {
    main(realContext(), { handleSigint: true }).then((code) => {
      process.exitCode = code;
    });
  }
}
