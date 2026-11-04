/**
 * Axon Fit — tek komutla kurulum (`kur`).
 *
 *   node --input-type=module -e "$(curl -fsSL https://raw.githubusercontent.com/gokerlek/axon-fit/main/kur/kur.mjs)"
 *
 * Tek dosya, bağımlılıksız (yalnız Node yerleşikleri), Node 20+, macOS ve Linux. `-e` ile ESM olarak
 * değerlendirilir: başka dosya import etmez, `import.meta.url` ve `process.argv[1]`e dayanmaz.
 * Saf parçalar dışa aktarılır ve `kur/kur.test.mjs` ile sınanır; `AXON_KUR_TEST=1` iken ana akış başlamaz.
 *
 * Sırlar (GitHub uygulamasının özel anahtarı ve client secret'ı, AUTH_SECRET, Vercel ve GitHub
 * anahtarları) yalnız bellekte durur: ekrana, dosyaya ya da URL'ye yazılmaz, yalnız Vercel env'ine gider.
 *
 * Doğrulanan belgeler (2026-11-05):
 * - GitHub App manifest akışı: docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest
 * - "Request user authorization (OAuth) during installation" seçiliyken Setup URL kullanılamaz; kullanıcı
 *   ilk Callback URL'e döner (creating-a-github-app, generating-a-user-access-token-for-a-github-app).
 * - Vercel REST: POST /v11/projects, POST /v10/projects/{id}/env, POST /v13/deployments,
 *   GET /v13/deployments/{id}, GET /v9/projects/{id}, GET /v9/projects/{id}/domains, GET /v2/user, GET /v2/teams.
 * - Vercel CLI anahtar dosyası: <veri klasörü>/com.vercel.cli/auth.json, alanlar token / expiresAt (saniye).
 */
import http from 'node:http';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const VERCEL_CLI_VERSION = '65.11.0';
export const DEFAULT_SOURCE = 'gokerlek/axon-fit';
export const MIN_NODE_MAJOR = 20;
export const STEP_COUNT = 8;
export const SECRET_ENV_KEYS = Object.freeze(['AUTH_SECRET', 'GITHUB_APP_PRIVATE_KEY', 'GITHUB_CLIENT_SECRET']);

const GITHUB_API = 'https://api.github.com';
const VERCEL_API = 'https://api.vercel.com';
const USER_AGENT = 'axon-fit-kur';
const VERCEL_TOKENS_URL = 'https://vercel.com/account/settings/tokens';
const VERCEL_GITHUB_INSTALL_URL = 'https://github.com/apps/vercel/installations/new';
const BROWSER_WAIT_MS = 30 * 60 * 1000;
const DEPLOY_WAIT_MS = 20 * 60 * 1000;
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

export class KurCancelled extends Error {
  constructor() {
    super('Kurulum durduruldu.');
    this.name = 'KurCancelled';
  }
}

/** GitHub/Vercel'in hata yanıtı. Yanıtın gövdesi saklanmaz (sır taşıyabilir); yalnız kod ve mesaj. */
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
    ? data.errors.map((item) => text(item?.message) ?? text(item?.code)).filter(Boolean).join('; ')
    : '';
  const message = [text(data.message), extra].filter(Boolean).join(' — ');
  return { code: text(typeof data.error === 'string' ? data.error : undefined), message: message || undefined };
}

// ---------------------------------------------------------------------------------------------
// Saf yardımcılar
// ---------------------------------------------------------------------------------------------

export function nodeMajor(version) {
  return Number.parseInt(String(version).replace(/^v/, '').split('.')[0], 10) || 0;
}

export function checkNodeVersion(version) {
  if (nodeMajor(version) < MIN_NODE_MAJOR) {
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
  const match = /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100})$/.exec(String(value ?? '').trim());
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
    return typeof data?.currentTeam === 'string' && data.currentTeam ? data.currentTeam : null;
  } catch {
    return null;
  }
}

/** `<ad>.vercel.app` boş mu: Vercel boş alt alan için 404 DEPLOYMENT_NOT_FOUND döner. */
export function isDeploymentNotFound(status, headers, bodyText) {
  if (status !== 404) return false;
  const header = typeof headers?.get === 'function' ? headers.get('x-vercel-error') : null;
  return header === 'DEPLOYMENT_NOT_FOUND' || /DEPLOYMENT_NOT_FOUND/.test(bodyText ?? '');
}

/** Vercel'in GitHub uygulaması repoyu göremiyor (Vercel CLI'nin `git connect` kontrolüyle aynı). */
export function isVercelGitAccessError(error) {
  if (!(error instanceof ApiError) || error.service !== 'Vercel') return false;
  if (error.action === 'Install GitHub App' || error.code === 'repo_not_found') return true;
  // Yedek: belgelenmemiş başka bir kodla gelirse mesajdan tanı.
  return /install[^.]*github|github (app|integration)/i.test(error.message);
}

export function isVercelLoginConnectionError(error) {
  return error instanceof ApiError && error.service === 'Vercel' && error.action === 'Add a Login Connection';
}

/** Yalnız github.com / vercel.com https bağlantıları açılır. */
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

export function githubApi(fetchImpl) {
  return async function github(pathname, { token, method = 'GET', body } = {}) {
    const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': USER_AGENT };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let response;
    try {
      response = await fetchImpl(`${GITHUB_API}${pathname}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new KurError("GitHub'a ulaşılamadı.", 'İnternet bağlantını kontrol edip yeniden dene.');
    }
    return { status: response.status, data: await readJson(response) };
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
      throw new KurError("Vercel'e ulaşılamadı.", 'İnternet bağlantını kontrol edip yeniden dene.');
    }
    return { status: response.status, data: await readJson(response) };
  };
}

function expect(result, statuses, service, what) {
  if (!statuses.includes(result.status)) throw new ApiError(service, result.status, result.data, what);
  return result.data;
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
    throw new KurError(`${name}.vercel.app adresine bakılamadı.`, 'İnternet bağlantını kontrol edip yeniden dene.');
  }
  const body = response.status === 404 ? await response.text().catch(() => '') : '';
  return isDeploymentNotFound(response.status, response.headers, body);
}

export async function convertManifestCode(fetchImpl, code) {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(code ?? '')) throw new KurError('GitHub geçersiz bir dönüş kodu gönderdi.', 'Komutu yeniden çalıştır.');
  const result = await githubApi(fetchImpl)(`/app-manifests/${encodeURIComponent(code)}/conversions`, { method: 'POST' });
  const data = expect(result, [201], 'GitHub', 'GitHub uygulamasının bilgilerini alma');
  if (!data?.id || !data.slug || !data.client_id || !data.client_secret || !data.pem) {
    throw new KurError('GitHub uygulamasının bilgileri eksik geldi.', 'Komutu yeniden çalıştır.');
  }
  return {
    id: data.id,
    slug: data.slug,
    name: typeof data.name === 'string' ? data.name : data.slug,
    clientId: data.client_id,
    clientSecret: data.client_secret,
    pem: data.pem,
    ownerLogin: typeof data.owner?.login === 'string' ? data.owner.login : null,
  };
}

/** Kurulumdaki yetkilendirme kodunu kullanıcı anahtarına çevirir (client id/secret ile). */
export async function exchangeUserCode(fetchImpl, { clientId, clientSecret, code }) {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(code ?? '')) throw new KurError('GitHub geçersiz bir yetki kodu gönderdi.');
  let response;
  try {
    response = await fetchImpl('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new KurError("GitHub'a ulaşılamadı.", 'İnternet bağlantını kontrol edip yeniden dene.');
  }
  const data = await readJson(response);
  if (!response.ok || typeof data?.access_token !== 'string' || !data.access_token) {
    const reason = typeof data?.error === 'string' && /^[a-z_]{1,60}$/.test(data.error) ? ` (${data.error})` : '';
    throw new KurError(`GitHub kullanıcı yetkisi alınamadı${reason}.`);
  }
  return data.access_token;
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
    const url = new URL(req.url ?? '/', base);

    if (url.pathname === '/') {
      if (app) return sendHtml(res, 200, resultPage('GitHub uygulaması hazır', 'Kuruluma devam et.', { href: installUrl(app.slug), label: 'Uygulamayı kur' }));
      return sendHtml(res, 200, manifestPage({ manifest, state: appState }));
    }

    if (url.pathname === '/github/app-created') {
      if (url.searchParams.get('state') !== appState) {
        return sendHtml(res, 400, resultPage('Geçersiz istek', 'Bu bağlantı bu kuruluma ait değil. Terminaldeki adımları izle.'));
      }
      if (!app) {
        converting ??= convertManifestCode(ctx.fetch, url.searchParams.get('code'));
        try {
          app = await converting;
        } catch (error) {
          sendHtml(res, 502, resultPage('GitHub uygulaması alınamadı', 'Terminale dön; ne yapacağın orada yazıyor.'));
          return finish(error);
        }
        ctx.created.githubApp = { name: app.name, slug: app.slug, settingsUrl: `https://github.com/settings/apps/${app.slug}` };
        ctx.io.say(`  ✓ GitHub uygulaması oluşturuldu: ${app.name}`);
        ctx.io.say('  → Şimdi tarayıcıda "Install" düğmesine bas ("All repositories" seçili kalsın), sorulursa "Authorize" de.');
        ctx.io.say(`    Kurulumdan sonra tarayıcı buraya dönmezse şu adresi aç: ${authorizeUrl()}`);
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
    server.closeAllConnections?.();
  }
}

// ---------------------------------------------------------------------------------------------
// Adımlar
// ---------------------------------------------------------------------------------------------

async function showUrl(ctx, url) {
  let opened = false;
  try {
    opened = await ctx.open(url);
  } catch {
    opened = false;
  }
  if (!opened) ctx.io.say(`  Tarayıcı açılamadı. Bu adresi kendin aç: ${url}`);
  return opened;
}

/** Kaynak repo şablon mu? GitHub uygulaması oluşmadan önce, anahtarsız bakılır (herkese açık repo). */
export async function preflightSource(ctx, source) {
  const result = await githubApi(ctx.fetch)(`/repos/${source}`);
  if (result.status === 200 && result.data?.is_template !== true) {
    throw new KurError(
      'Kaynak repo şablon olarak işaretli değil.',
      `${source} reposunun sahibi GitHub'da Settings → General → "Template repository" kutusunu işaretlemeli. Sonra komutu yeniden çalıştır.`,
    );
  }
  return result.status === 200;
}

function readVercelAuthFile(ctx) {
  for (const dir of vercelConfigDirs({ platform: ctx.platform, home: ctx.home, env: ctx.env })) {
    const text = ctx.readText(path.join(dir, 'auth.json'));
    if (!text) continue;
    const auth = parseVercelAuth(text, ctx.nowSeconds());
    if (!auth) continue;
    return { ...auth, currentTeam: parseVercelCurrentTeam(ctx.readText(path.join(dir, 'config.json')) ?? '') };
  }
  return null;
}

async function vercelUser(ctx, token) {
  const result = await vercelApi(ctx.fetch, { token })('/v2/user');
  if (result.status !== 200 || typeof result.data?.user?.username !== 'string') return null;
  return { username: result.data.user.username, defaultTeamId: result.data.user.defaultTeamId ?? null };
}

async function runVercelLogin(ctx) {
  ctx.io.say('  → Tarayıcıda Vercel açılacak; orada girişi onayla. (Vercel aracı ilk seferde indirilir, biraz sürebilir.)');
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
    ctx.io.say('  ! Bu anahtar Vercel\'de geçmedi. Tamamını kopyalayıp yeniden yapıştır.');
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
  session.teamId = team?.id ?? null;
  ctx.io.say(`  ✓ Vercel hesabı: ${login.user.username}${team ? ` (ekip: ${team.slug})` : ''}`);
  return { session, user: login.user, team };
}

async function chooseVercelTeam(ctx, session, user, currentTeam) {
  const result = await vercelApi(ctx.fetch, { token: session.token })('/v2/teams', { query: { limit: 100 } });
  const teams = expect(result, [200], 'Vercel', 'Vercel ekiplerini okuma')?.teams ?? [];
  const usable = teams.filter((team) => typeof team?.id === 'string' && typeof team?.slug === 'string');
  if (usable.length <= 1) return usable[0] ?? null;
  const preferred = usable.findIndex((team) => team.id === (currentTeam ?? user.defaultTeamId));
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
  const fresh = (await loginFromCli(ctx)) ?? (await loginFromPaste(ctx));
  if (fresh.user.username !== vercel.user.username) {
    throw new KurError(`Vercel'e başka bir hesapla (${fresh.user.username}) giriş yapıldı.`, `"${vercel.user.username}" hesabıyla giriş yapıp komutu yeniden çalıştır.`);
  }
  session.token = fresh.auth.token;
  session.expiresAt = fresh.auth.expiresAt;
}

/** 3. adım: ad seçimi; `<ad>.vercel.app` boş olmalı, Vercel hesabında aynı adlı proje olmamalı. */
export async function chooseProjectName(ctx, vercel) {
  const api = vercelApi(ctx.fetch, vercel.session);
  for (;;) {
    const answer = (await ctx.io.ask('  Uygulamanın adı (adresin https://<ad>.vercel.app olur)', defaultProjectName(ctx.randomInt))).trim().toLowerCase();
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
    ctx.io.say(`  ✓ Adres boş: https://${answer}.vercel.app`);
    return answer;
  }
}

/** 4. adım: GitHub uygulaması, kullanıcı anahtarı ve kurulum. */
export async function setupGithub(ctx, { productionUrl }) {
  const { app, userToken, installationIdHint } = await runGithubAppFlow(ctx, { appName: githubAppName(ctx.randomInt), productionUrl });
  const github = githubApi(ctx.fetch);
  const user = expect(await github('/user', { token: userToken }), [200], 'GitHub', 'GitHub hesabını okuma');
  const login = user?.login;
  if (typeof login !== 'string') throw new KurError('GitHub hesabı okunamadı.', 'Komutu yeniden çalıştır.');
  if (app.ownerLogin && app.ownerLogin.toLowerCase() !== login.toLowerCase()) {
    throw new KurError(
      `GitHub uygulaması "${app.ownerLogin}" hesabında, yetki ise "${login}" hesabından verildi.`,
      'Tarayıcıda GitHub\'a tek hesapla giriş yapıp komutu yeniden çalıştır.',
    );
  }
  ctx.io.say(`  ✓ GitHub hesabın: ${login}`);
  const installation = await ensureInstallation(ctx, app, login, installationIdHint);
  return { app, userToken, login, installation };
}

async function ensureInstallation(ctx, app, login, installationIdHint) {
  const github = githubApi(ctx.fetch);
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
      ctx.io.say('  ! GitHub\'ın döndüğü kurulum kimliği eşleşmedi; hesabındaki kurulum kullanılacak.');
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
    'Kod reposu GitHub\'da hazırlanırken süre doldu.',
    `https://github.com/${fullName} sayfasında dosyalar görünüyorsa GitHub uygulamasının "All repositories" erişimiyle kurulu olduğunu kontrol et, sonra komutu yeniden çalıştır.`,
  );
}

/** Şablondan üretim GitHub'da izinle reddedilirse: aynı şablondan tarayıcıda elle oluşturma. */
async function manualTemplateRepo(ctx, github, token, { source, login, name, status }) {
  ctx.io.say(`  ! GitHub kod reposunu otomatik oluşturmaya izin vermedi (${status}). Tarayıcıda elle oluşturalım:`);
  ctx.io.say('    1) Açılan sayfada "Use this template" → "Create a new repository" seç.');
  ctx.io.say(`    2) Owner: ${login}, Repository name: ${name}, görünürlük: Private.`);
  ctx.io.say('    3) "Create repository" de.');
  await showUrl(ctx, `https://github.com/${source}`);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await ctx.io.pause('  Repo oluşunca Enter\'a bas.');
    const result = await github(`/repos/${login}/${name}`, { token });
    if (result.status === 200 && result.data?.private === true) return result.data;
    if (result.status === 200) ctx.io.say(`  ! ${login}/${name} herkese açık. Repo ayarlarında (Settings → Danger Zone) Private yap.`);
    else ctx.io.say(`  ! ${login}/${name} henüz görünmüyor.`);
  }
  throw new KurError(`${login}/${name} özel repo olarak bulunamadı.`, 'Repoyu özel olarak oluşturup komutu yeniden çalıştır.');
}

/** 5. adım: kod reposu (şablondan, özel) ve veri reposu (özel, README'li). */
export async function createRepos(ctx, { source, sourceVerified = false, login, token, projectName }) {
  const github = githubApi(ctx.fetch);
  if (!sourceVerified) {
    // Hazırlıkta anahtarsız bakılamadıysa (ör. özel kaynak ya da istek sınırı) şimdi kullanıcı anahtarıyla.
    const sourceRepo = await github(`/repos/${source}`, { token });
    if (sourceRepo.status === 404) throw new KurError(`Kaynak repo bulunamadı: ${source}.`, 'AXON_KUR_SOURCE değerini kontrol et ya da kaldırıp yeniden dene.');
    if (expect(sourceRepo, [200], 'GitHub', 'Kaynak repoyu okuma')?.is_template !== true) {
      throw new KurError('Kaynak repo şablon olarak işaretli değil.', `${source} reposunun sahibi GitHub'da Settings → General → "Template repository" kutusunu işaretlemeli.`);
    }
  }

  let codeName = projectName;
  let code;
  for (;;) {
    const existing = await github(`/repos/${login}/${codeName}`, { token });
    if (existing.status === 200) {
      codeName = await askRepoName(ctx, `  ${login}/${codeName} zaten var. Kod reposu için başka bir ad`, `${codeName}-2`);
      continue;
    }
    expect(existing, [404], 'GitHub', 'Repo adına bakma');
    const generated = await github(`/repos/${source}/generate`, {
      token,
      method: 'POST',
      body: { owner: login, name: codeName, description: 'Axon Fit — kendi kopyam (kod)', include_all_branches: false, private: true },
    });
    if (generated.status === 201) {
      code = generated.data;
      break;
    }
    if (generated.status === 422 && /already exists/i.test(apiErrorDetail(generated.data).message ?? '')) {
      codeName = await askRepoName(ctx, `  ${login}/${codeName} zaten var. Kod reposu için başka bir ad`, `${codeName}-2`);
      continue;
    }
    if (generated.status === 403 || generated.status === 404) {
      code = await manualTemplateRepo(ctx, github, token, { source, login, name: codeName, status: generated.status });
      break;
    }
    throw new ApiError('GitHub', generated.status, generated.data, 'Kod reposunu oluşturma');
  }
  const codeFullName = `${login}/${codeName}`;
  ctx.created.codeRepo = `https://github.com/${codeFullName}`;
  const branch = typeof code?.default_branch === 'string' && code.default_branch ? code.default_branch : 'main';
  await waitForBranch(ctx, github, token, codeFullName, branch);
  ctx.io.say(`  ✓ Kod reposu (özel): https://github.com/${codeFullName}`);

  let dataName = dataRepoName(codeName);
  let dataCreated = false;
  for (;;) {
    const existing = await github(`/repos/${login}/${dataName}`, { token });
    if (existing.status === 200) {
      if (existing.data?.private === true && existing.data?.fork !== true) {
        if (await ctx.io.confirm(`  ${login}/${dataName} zaten var (özel). Veri reposu olarak bu kullanılsın mı?`, true)) break;
      } else {
        ctx.io.say(`  ! ${login}/${dataName} herkese açık ya da fork; veri reposu olamaz.`);
      }
      dataName = await askRepoName(ctx, '  Veri reposu için başka bir ad', `${dataName}-2`, { forbidden: [codeName] });
      continue;
    }
    expect(existing, [404], 'GitHub', 'Repo adına bakma');
    const created = await github('/user/repos', {
      token,
      method: 'POST',
      body: { name: dataName, description: 'Axon Fit verileri (özel)', private: true, auto_init: true },
    });
    if (created.status === 201) {
      dataCreated = true;
      break;
    }
    if (created.status === 422) {
      ctx.io.say(`  ! ${login}/${dataName} açılamadı (${apiErrorDetail(created.data).message ?? 'ad kullanılıyor'}).`);
      dataName = await askRepoName(ctx, '  Veri reposu için başka bir ad', `${dataName}-2`, { forbidden: [codeName] });
      continue;
    }
    throw new ApiError('GitHub', created.status, created.data, 'Veri reposunu oluşturma');
  }
  if (dataCreated) ctx.created.dataRepo = `https://github.com/${login}/${dataName}`;
  ctx.io.say(`  ✓ Veri reposu (özel): https://github.com/${login}/${dataName}`);
  return { codeName, codeFullName, codeRepoId: code?.id ?? null, branch, dataName };
}

function linkedTo(project, fullName) {
  const link = project?.link;
  return link?.type === 'github' && typeof link.org === 'string' && typeof link.repo === 'string' && `${link.org}/${link.repo}`.toLowerCase() === fullName.toLowerCase();
}

/** 6. adım: Vercel projesi, GitHub kod reposuna bağlı. Vercel'in GitHub uygulaması repoyu görmüyorsa kurdurur. */
export async function ensureVercelProject(ctx, vercel, { name, repoFullName }) {
  const api = vercelApi(ctx.fetch, vercel.session);
  const getProject = async (idOrName) => {
    const result = await api(`/v9/projects/${encodeURIComponent(idOrName)}`);
    if (result.status === 404) return null;
    return expect(result, [200], 'Vercel', 'Vercel projesini okuma');
  };
  for (let attempt = 1; ; attempt += 1) {
    try {
      let project = await getProject(name);
      if (project && !linkedTo(project, repoFullName)) {
        if (project.link) throw new KurError(`Vercel'deki "${name}" projesi başka bir repoya bağlı.`, 'Komutu yeniden çalıştırıp başka bir ad seç.');
        // Proje var ama bağlı değil (yarım kalmış deneme): Vercel CLI'nin `git connect` ucuyla bağla.
        expect(await api(`/v9/projects/${encodeURIComponent(project.id)}/link`, { method: 'POST', body: { type: 'github', repo: repoFullName } }), [200, 201], 'Vercel', 'Vercel projesini repoya bağlama');
        project = await getProject(project.id);
      }
      if (!project) {
        const created = await api('/v11/projects', {
          method: 'POST',
          body: { name, framework: 'nextjs', gitRepository: { type: 'github', repo: repoFullName } },
        });
        const data = expect(created, [200, 201], 'Vercel', 'Vercel projesini açma');
        project = await getProject(data?.id ?? name);
      }
      if (!project?.id) throw new KurError('Vercel projesi okunamadı.', 'Komutu yeniden çalıştır.');
      ctx.created.vercelProject = `https://vercel.com/${vercel.team?.slug ?? vercel.user.username}/${project.name ?? name}`;
      if (!linkedTo(project, repoFullName)) throw new KurError('Vercel projesi GitHub reposuna bağlanamadı.', `${ctx.created.vercelProject}/settings/git adresinden ${repoFullName} reposunu bağla, sonra komutu yeniden çalıştır.`);
      ctx.io.say(`  ✓ Vercel projesi: ${ctx.created.vercelProject} (${repoFullName} reposuna bağlı)`);
      return project;
    } catch (error) {
      if (attempt >= 8) throw error;
      if (isVercelGitAccessError(error)) {
        // Yeni açılan repoyu Vercel birkaç saniye sonra görebilir: önce kendiliğinden yeniden dene.
        if (attempt <= 2) {
          await ctx.sleep(5000);
          continue;
        }
        ctx.io.say(`  ! Vercel'in GitHub uygulaması ${repoFullName} reposunu göremiyor.`);
        ctx.io.say('    Açılan sayfada Vercel\'i kendi GitHub hesabına kur ("All repositories" ya da bu repoyu seç) ve kaydet.');
        await showUrl(ctx, safeLink(error.link, ['github.com']) ?? VERCEL_GITHUB_INSTALL_URL);
        await ctx.io.pause('  Tamam olunca Enter\'a bas.');
        continue;
      }
      if (isVercelLoginConnectionError(error)) {
        ctx.io.say('  ! Vercel hesabın GitHub hesabına bağlı değil. Açılan sayfada GitHub bağlantısını ekle.');
        const link = safeLink(error.link);
        if (link) await showUrl(ctx, link);
        await ctx.io.pause('  Tamam olunca Enter\'a bas.');
        continue;
      }
      throw error;
    }
  }
}

/** 7a: env yazımı (upsert) ve geri okuma. Hata mesajında değer yok, yalnız anahtar adları. */
export async function writeEnv(ctx, vercel, projectId, items) {
  const api = vercelApi(ctx.fetch, vercel.session);
  const result = await api(`/v10/projects/${encodeURIComponent(projectId)}/env`, { method: 'POST', query: { upsert: 'true' }, body: items });
  if (result.status !== 200 && result.status !== 201) throw new ApiError('Vercel', result.status, result.data, 'Ayarları Vercel\'e yazma');
  const failed = Array.isArray(result.data?.failed) ? result.data.failed : [];
  if (failed.length) {
    const keys = failed.map((item) => `${item?.error?.key ?? item?.error?.envVarKey ?? '?'}${item?.error?.code ? ` (${item.error.code})` : ''}`).join(', ');
    throw new KurError(`Bazı ayarlar Vercel'e yazılamadı: ${keys}.`, 'Komutu yeniden çalıştırmadan önce Vercel projesinin Settings → Environment Variables ekranına bak.');
  }
  const saved = expect(await api(`/v10/projects/${encodeURIComponent(projectId)}/env`), [200], 'Vercel', 'Ayarları geri okuma');
  const envs = Array.isArray(saved?.envs) ? saved.envs : [];
  const missing = items.filter((item) => !envs.some((env) => env?.key === item.key && (Array.isArray(env.target) ? env.target.includes('production') : env.target === 'production')));
  if (missing.length) throw new KurError(`Vercel'de görünmeyen ayarlar: ${missing.map((item) => item.key).join(', ')}.`, 'Vercel projesinin Settings → Environment Variables ekranına bak.');
  ctx.created.env = true;
  ctx.io.say(`  ✓ ${items.length} ayar Production ortamına yazıldı (sırlar gizli tutuluyor).`);
}

/** 7b: Production yayını (gitSource) ve hazır olana dek bekleme. */
export async function deployAndWait(ctx, vercel, { project, repoId, branch, timeoutMs = DEPLOY_WAIT_MS }) {
  const api = vercelApi(ctx.fetch, vercel.session);
  const numericRepoId = Number(project.link?.repoId ?? repoId);
  const gitSource = Number.isSafeInteger(numericRepoId) && numericRepoId > 0
    ? { type: 'github', repoId: numericRepoId, ref: branch }
    : { type: 'github', org: project.link?.org, repo: project.link?.repo, ref: branch };
  const created = await api('/v13/deployments', {
    method: 'POST',
    query: { skipAutoDetectionConfirmation: '1' },
    body: { name: project.name, project: project.id, target: 'production', gitSource, projectSettings: { framework: 'nextjs' } },
  });
  let deployment = expect(created, [200, 201], 'Vercel', 'Yayını başlatma');
  if (!deployment?.id) throw new KurError('Vercel yayını başlatılamadı.', 'Vercel projesinde "Redeploy" ile yayını kendin başlat.');
  ctx.io.say('  → Yayın başladı; hazır olması genelde 2-5 dakika sürer.');
  const started = Date.now();
  let lastState = null;
  for (;;) {
    const state = deployment.readyState;
    if (state && state !== lastState) {
      ctx.io.say(`    Yayın durumu: ${DEPLOY_STATES[state] ?? state}`);
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
    if (Date.now() - started > timeoutMs) {
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
  const names = domains.status === 200 && Array.isArray(domains.data?.domains) ? domains.data.domains.map((domain) => domain?.name).filter((name) => typeof name === 'string') : [];
  if (names.includes(expectedHost)) return expectedHost;
  return names.find((name) => name.endsWith('.vercel.app')) ?? names[0] ?? expectedHost;
}

// ---------------------------------------------------------------------------------------------
// Ana akış
// ---------------------------------------------------------------------------------------------

export async function kur(ctx) {
  const { io } = ctx;
  const step = (n, text) => io.say(`\n[${n}/${STEP_COUNT}] ${text}`);

  step(1, 'Hazırlık: Node sürümü ve kaynak kontrol ediliyor…');
  checkNodeVersion(ctx.nodeVersion);
  const source = parseSource(ctx.env.AXON_KUR_SOURCE || DEFAULT_SOURCE);
  const sourceVerified = await preflightSource(ctx, source);
  io.say(`  ✓ Node ${ctx.nodeVersion}, kaynak: ${source}`);

  step(2, 'Vercel hesabına giriş…');
  const vercel = await vercelLogin(ctx);

  step(3, 'Uygulamanın adı ve adresi…');
  const name = await chooseProjectName(ctx, vercel);
  const expectedHost = `${name}.vercel.app`;
  const productionUrl = `https://${expectedHost}`;

  step(4, 'GitHub uygulaması (giriş ve veri erişimi) oluşturuluyor…');
  const github = await setupGithub(ctx, { productionUrl });

  step(5, 'GitHub\'da kod ve veri repoların açılıyor…');
  const repos = await createRepos(ctx, { source, sourceVerified, login: github.login, token: github.userToken, projectName: name });

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
  const host = await productionDomain(ctx, vercel, { project, deployment, expectedHost });
  const siteUrl = `https://${host}`;
  if (host !== expectedHost) {
    io.say(`  ! Vercel adresi beklenenden farklı çıktı: ${siteUrl}`);
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
  if (error instanceof KurCancelled) {
    io.say('\nKurulum durduruldu.');
  } else {
    const known = error instanceof KurError || error instanceof ApiError;
    const detail = `${error?.name ?? 'Error'}: ${String(error?.message ?? '').slice(0, 200)}`;
    io.say(`\nKurulum tamamlanamadı: ${known ? error.message : `beklenmeyen bir hata oluştu (${detail}).`}`);
    if (error instanceof KurError && error.hint) io.say(`Ne yapmalı: ${error.hint}`);
    else io.say('Ne yapmalı: İnternet bağlantını kontrol edip komutu yeniden çalıştır. Sorun sürerse bu çıktıyla birlikte GitHub\'da konu aç.');
  }
  const lines = describeCreated(ctx.created);
  if (lines.length === 0) {
    io.say('Henüz hiçbir şey oluşturulmadı.');
    return;
  }
  io.say('Şu ana kadar oluşturulanlar (yerinde duruyor):');
  for (const line of lines) io.say(`  - ${line}`);
  io.say('Komutu yeniden çalıştırırsan yeni bir GitHub uygulaması açılır ve yeni ad sorulur; yukarıdakileri istersen silebilirsin.');
}

export async function main(ctx, { handleSigint = false } = {}) {
  const onSigint = () => {
    reportFailure(ctx, new KurCancelled());
    process.exit(130);
  };
  if (handleSigint) process.once('SIGINT', onSigint);
  ctx.io.say('Axon Fit kurulumu — her adımda ne olduğunu yazacağım. Durdurmak için Ctrl+C.');
  try {
    await kur(ctx);
    return 0;
  } catch (error) {
    reportFailure(ctx, error);
    return error instanceof KurCancelled ? 130 : 1;
  } finally {
    if (handleSigint) process.off('SIGINT', onSigint);
  }
}

// ---------------------------------------------------------------------------------------------
// Gerçek terminal, tarayıcı ve komut çalıştırıcı
// ---------------------------------------------------------------------------------------------

function terminalIo() {
  const say = (line = '') => process.stdout.write(`${line}\n`);
  async function prompt(text) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const controller = new AbortController();
    rl.on('SIGINT', () => controller.abort());
    try {
      return await rl.question(text, { signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) throw new KurCancelled();
      throw error;
    } finally {
      rl.close();
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
  function askSecret(question) {
    const { stdin, stdout } = process;
    if (!stdin.isTTY) return prompt(question);
    stdout.write(question);
    return new Promise((resolve, reject) => {
      let value = '';
      const cleanup = () => {
        stdin.off('data', onData);
        stdin.setRawMode(false);
        stdin.pause();
      };
      const onData = (chunk) => {
        for (const char of String(chunk).replace(/\x1b\[20[01]~/g, '')) {
          if (char === '\r' || char === '\n') {
            cleanup();
            stdout.write('\n');
            return resolve(value);
          }
          if (char === '\u0003') {
            cleanup();
            stdout.write('\n');
            return reject(new KurCancelled());
          }
          if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
          else if (char >= ' ' && char !== '\u001b') value += char;
        }
      };
      stdin.setRawMode(true);
      stdin.setEncoding('utf8');
      stdin.resume();
      stdin.on('data', onData);
    });
  }
  return { say, ask, confirm, pause, askSecret };
}

function openBrowser(url) {
  const command = browserCommand(process.platform);
  if (!command) return Promise.resolve(false);
  return new Promise((resolve) => {
    const child = spawn(command, [url], { stdio: 'ignore', detached: true });
    child.once('error', () => resolve(false));
    child.once('spawn', () => {
      child.unref();
      resolve(true);
    });
  });
}

function runCommand(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.once('error', () => resolve(-1));
    child.once('exit', (code) => resolve(code ?? 1));
  });
}

export function realContext() {
  return {
    fetch: globalThis.fetch,
    io: terminalIo(),
    open: openBrowser,
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
    created: {},
  };
}

if (process.env.AXON_KUR_TEST !== '1') {
  if (typeof globalThis.fetch !== 'function') {
    process.stdout.write(`Bu kurulum en az Node ${MIN_NODE_MAJOR} ister (bilgisayarındaki: ${process.versions.node}). https://nodejs.org adresinden güncelle.\n`);
    process.exitCode = 1;
  } else {
    main(realContext(), { handleSigint: true }).then((code) => {
      process.exitCode = code;
    });
  }
}
