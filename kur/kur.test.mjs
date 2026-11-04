import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Ana akış başlamasın: import'tan ÖNCE ayarlanmalı (statik import yukarı taşınacağı için dinamik).
process.env.AXON_KUR_TEST = '1';
const kur = await import('./kur.mjs');

const realFetch = globalThis.fetch;
const NOW = 1_800_000_000;

function json(status, body, headers = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function unescapeHtml(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** Taklit terminal: `answers` = [[soru parçası, yanıt], …]; yanıtı olmayan soruya varsayılan döner. */
function fakeIo({ answers = [], secrets = [] } = {}) {
  const lines = [];
  const asked = [];
  const queue = [...answers];
  const take = (question) => {
    const index = queue.findIndex(([match]) => question.includes(match));
    if (index === -1) return undefined;
    return queue.splice(index, 1)[0][1];
  };
  return {
    lines,
    asked,
    say: (line = '') => lines.push(line),
    ask: async (question, fallback = '') => {
      asked.push(question);
      return take(question) ?? fallback;
    },
    confirm: async (question, defaultYes = true) => {
      asked.push(question);
      return take(question) ?? defaultYes;
    },
    pause: async (message) => {
      asked.push(message);
    },
    askSecret: async (question) => {
      asked.push(question);
      if (!secrets.length) throw new Error('askSecret beklenmiyordu');
      return secrets.shift();
    },
  };
}

function counterBytes() {
  let seed = 1;
  return (size) => Buffer.alloc(size, seed++);
}

function baseContext(overrides = {}) {
  return {
    fetch: async (url) => {
      throw new Error(`Beklenmeyen istek: ${url}`);
    },
    io: fakeIo(),
    open: async () => true,
    run: async () => 1,
    readText: () => null,
    platform: 'linux',
    env: {},
    home: '/home/coach',
    nodeVersion: '22.1.0',
    sleep: async () => {},
    randomInt: () => 0,
    randomBytes: counterBytes(),
    nowSeconds: () => NOW,
    created: {},
    ...overrides,
  };
}

function rsaKeys() {
  return crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
}

function verifyJwt(token, publicKey) {
  const [header, payload, signature] = token.split('.');
  const valid = crypto.verify('sha256', Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, 'base64url'));
  assert.equal(valid, true, 'JWT imzası geçersiz');
  return { header: JSON.parse(Buffer.from(header, 'base64url')), payload: JSON.parse(Buffer.from(payload, 'base64url')) };
}

// ---------------------------------------------------------------------------------------------
// Saf yardımcılar
// ---------------------------------------------------------------------------------------------

test('Node sürümü: 20 ve üstü geçer, eskisi Türkçe hata verir', () => {
  assert.equal(kur.nodeMajor('v22.3.0'), 22);
  assert.doesNotThrow(() => kur.checkNodeVersion('20.0.0'));
  assert.throws(() => kur.checkNodeVersion('18.19.1'), (error) => error instanceof kur.KurError && /en az Node 20/.test(error.message) && /nodejs\.org/.test(error.hint));
});

test('varsayılan ad axon-fit-<4> ve DNS kurallarına uyar; GitHub uygulaması adı 34 karakteri aşmaz', () => {
  for (let i = 0; i < 50; i += 1) {
    const name = kur.defaultProjectName();
    assert.match(name, /^axon-fit-[a-z0-9]{4}$/);
    assert.equal(kur.validateProjectName(name), null);
    const appName = kur.githubAppName();
    assert.match(appName, /^Axon Fit [a-z]{6}$/);
    assert.ok(appName.length <= 34);
  }
});

test('proje adı denetimi', () => {
  assert.equal(kur.validateProjectName('benim-salonum-2'), null);
  assert.equal(kur.validateProjectName('a'), null);
  assert.equal(kur.validateProjectName('x'.repeat(63)), null);
  for (const bad of ['', 'x'.repeat(64), 'Buyuk', 'alt_cizgi', 'nokta.li', 'boş luk', 'çay', '-basta', 'sonda-', 'uc---tire']) {
    assert.equal(typeof kur.validateProjectName(bad), 'string', bad);
  }
});

test('veri reposu adı ve kaynak repo biçimi', () => {
  assert.equal(kur.dataRepoName('axon-fit-k3x9'), 'axon-fit-data');
  assert.equal(kur.dataRepoName('Axon-Fit-Data'), 'axon-fit-private-data');
  assert.equal(kur.parseSource('gokerlek/axon-fit'), 'gokerlek/axon-fit');
  assert.equal(kur.parseSource(' baska/kopya.repo '), 'baska/kopya.repo');
  for (const bad of ['', 'axon-fit', 'a/b/c', 'https://github.com/a/b', '-x/y']) {
    assert.throws(() => kur.parseSource(bad), kur.KurError, bad);
  }
  assert.equal(kur.validateRepoName('axon-fit-data'), null);
  assert.equal(typeof kur.validateRepoName('..'), 'string');
  assert.equal(typeof kur.validateRepoName('boş luk'), 'string');
});

test('manifest: yerel dönüş önce, izinler, webhook kapalı, kurulumda yetki, Setup URL yok', () => {
  const manifest = kur.buildManifest({ appName: 'Axon Fit abcdef', productionUrl: 'https://salon.vercel.app', localBase: 'http://127.0.0.1:5123' });
  assert.equal(manifest.url, 'https://salon.vercel.app');
  assert.equal(manifest.redirect_url, 'http://127.0.0.1:5123/github/app-created');
  assert.deepEqual(manifest.callback_urls, ['http://127.0.0.1:5123/github/callback', 'https://salon.vercel.app/api/auth/github/callback']);
  assert.equal(manifest.request_oauth_on_install, true);
  assert.equal(manifest.public, false);
  assert.equal(manifest.hook_attributes.active, false);
  assert.match(manifest.hook_attributes.url, /^https:\/\/salon\.vercel\.app\//);
  assert.equal('setup_url' in manifest, false);
  assert.deepEqual(manifest.default_permissions, { administration: 'write', contents: 'write', actions: 'write', workflows: 'write', metadata: 'read' });
});

test('manifest sayfası: JSON öznitelikte güvenli kaçışla durur ve aynen geri okunur', () => {
  const manifest = kur.buildManifest({ appName: 'Ad "><img src=x onerror=alert(1)> & \'tek\'', productionUrl: 'https://salon.vercel.app', localBase: 'http://127.0.0.1:1' });
  const html = kur.manifestPage({ manifest, state: 'abc123' });
  assert.equal(html.includes('<img'), false);
  const value = /name="manifest" value="([^"]*)"/.exec(html)[1];
  assert.deepEqual(JSON.parse(unescapeHtml(value)), manifest);
  const action = unescapeHtml(/action="([^"]*)"/.exec(html)[1]);
  assert.equal(action, 'https://github.com/settings/apps/new?state=abc123');
  assert.match(html, /method="post"/);
});

test('uygulama JWT: RS256, iat 60 sn geri, exp 10 dk içinde, iss', () => {
  const { privateKey, publicKey } = rsaKeys();
  const token = kur.githubAppJwt({ issuer: 'Iv1.abc', pem: privateKey, nowSeconds: NOW });
  const { header, payload } = verifyJwt(token, publicKey);
  assert.deepEqual(header, { alg: 'RS256', typ: 'JWT' });
  assert.equal(payload.iss, 'Iv1.abc');
  assert.equal(payload.iat, NOW - 60);
  assert.ok(payload.exp > NOW && payload.exp <= NOW + 600);
});

test('env: B1 anahtarları, sırlar sensitive, hedef production, PAT yok', () => {
  const authSecret = kur.generateAuthSecret();
  assert.match(authSecret, /^[0-9a-f]{64}$/);
  const items = kur.buildEnvItems({
    owner: 'coach', codeRepo: 'salon', dataRepo: 'axon-fit-data', branch: 'main', appId: 42,
    privateKey: '-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----\n', installationId: 77,
    clientId: 'Iv1.abc', clientSecret: 'secret', authSecret,
  });
  const byKey = Object.fromEntries(items.map((item) => [item.key, item]));
  assert.deepEqual(Object.keys(byKey).sort(), [
    'APP_REPO', 'AUTH_SECRET', 'AXON_CODE_BRANCH', 'AXON_CODE_REPO', 'GITHUB_APP_ID', 'GITHUB_APP_INSTALLATION_ID',
    'GITHUB_APP_PRIVATE_KEY', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'GITHUB_OWNER',
  ]);
  assert.equal(byKey.AXON_CODE_REPO.value, 'coach/salon');
  assert.equal(byKey.GITHUB_APP_ID.value, '42');
  assert.equal(byKey.GITHUB_APP_INSTALLATION_ID.value, '77');
  for (const item of items) {
    assert.deepEqual(item.target, ['production']);
    assert.equal(item.type, kur.SECRET_ENV_KEYS.includes(item.key) ? 'sensitive' : 'encrypted', item.key);
  }
  assert.throws(() => kur.buildEnvItems({ owner: 'coach', codeRepo: 'salon', dataRepo: 'd', branch: 'main', appId: 1, privateKey: '', installationId: 1, clientId: 'a', clientSecret: 'b', authSecret }), /GITHUB_APP_PRIVATE_KEY/);
});

test('Vercel CLI klasörleri: macOS Application Support, Linux XDG ya da ~/.local/share, sonra ~/.now', () => {
  assert.deepEqual(kur.vercelConfigDirs({ platform: 'darwin', home: '/Users/a', env: {} }), [
    '/Users/a/Library/Application Support/com.vercel.cli', '/Users/a/.now', '/Users/a/Library/Application Support/now',
  ]);
  assert.deepEqual(kur.vercelConfigDirs({ platform: 'linux', home: '/home/a', env: {} })[0], '/home/a/.local/share/com.vercel.cli');
  assert.deepEqual(kur.vercelConfigDirs({ platform: 'linux', home: '/home/a', env: { XDG_DATA_HOME: '/data' } }).slice(0, 2), ['/data/com.vercel.cli', '/home/a/.local/share/com.vercel.cli']);
});

test('Vercel auth.json okuma', () => {
  assert.deepEqual(kur.parseVercelAuth('{"// Note":"x","token":"t1"}', NOW), { token: 't1', expiresAt: null, expired: false });
  assert.equal(kur.parseVercelAuth(JSON.stringify({ token: 't', expiresAt: NOW + 3600 }), NOW).expired, false);
  assert.equal(kur.parseVercelAuth(JSON.stringify({ token: 't', expiresAt: NOW + 10 }), NOW).expired, true);
  assert.equal(kur.parseVercelAuth('{"// Note":"x"}', NOW), null);
  assert.equal(kur.parseVercelAuth('bozuk', NOW), null);
  assert.equal(kur.parseVercelCurrentTeam('{"currentTeam":"team_1"}'), 'team_1');
  assert.equal(kur.parseVercelCurrentTeam('{}'), null);
});

test('<ad>.vercel.app boş mu: yalnız 404 DEPLOYMENT_NOT_FOUND boş sayılır', async () => {
  const respond = (response) => async (url, init) => {
    assert.equal(url, 'https://salon.vercel.app/');
    assert.equal(init.redirect, 'manual');
    return response();
  };
  assert.equal(await kur.vercelAppDomainFree(respond(() => new Response('x', { status: 404, headers: { 'x-vercel-error': 'DEPLOYMENT_NOT_FOUND' } })), 'salon'), true);
  assert.equal(await kur.vercelAppDomainFree(respond(() => new Response('404: NOT_FOUND\nCode: DEPLOYMENT_NOT_FOUND', { status: 404 })), 'salon'), true);
  assert.equal(await kur.vercelAppDomainFree(respond(() => new Response('ok', { status: 200 })), 'salon'), false);
  assert.equal(await kur.vercelAppDomainFree(respond(() => new Response('', { status: 401 })), 'salon'), false);
  assert.equal(await kur.vercelAppDomainFree(respond(() => new Response('Not found', { status: 404 })), 'salon'), false);
  await assert.rejects(kur.vercelAppDomainFree(async () => { throw new TypeError('fetch failed'); }, 'salon'), kur.KurError);
});

test('hata ayrıntısı ve Vercel GitHub erişim hatasının tanınması', () => {
  const access = new kur.ApiError('Vercel', 400, { error: { code: 'repo_not_found', message: 'Repo not found', action: 'Install GitHub App', link: 'https://github.com/apps/vercel/installations/new' } });
  assert.equal(kur.isVercelGitAccessError(access), true);
  assert.equal(kur.isVercelGitAccessError(new kur.ApiError('Vercel', 400, { error: { code: 'bad_request', action: 'Install GitHub App' } })), true);
  assert.equal(kur.isVercelGitAccessError(new kur.ApiError('Vercel', 400, { error: { code: 'bad_request', message: 'Invalid name' } })), false);
  assert.equal(kur.isVercelGitAccessError(new kur.ApiError('GitHub', 404, { message: 'Not Found' })), false);
  assert.equal(kur.isVercelLoginConnectionError(new kur.ApiError('Vercel', 400, { error: { code: 'x', action: 'Add a Login Connection' } })), true);
  assert.deepEqual(kur.apiErrorDetail({ message: 'Validation Failed', errors: [{ message: 'name already exists on this account' }] }), { code: undefined, message: 'Validation Failed — name already exists on this account' });
  assert.equal(kur.safeLink('https://github.com/apps/vercel'), 'https://github.com/apps/vercel');
  assert.equal(kur.safeLink('http://github.com/x'), null);
  assert.equal(kur.safeLink('https://kotu.example/x'), null);
  assert.equal(kur.browserCommand('darwin'), 'open');
  assert.equal(kur.browserCommand('linux'), 'xdg-open');
  assert.equal(kur.browserCommand('win32'), null);
});

test('hazırlık: kaynak şablon değilse uygulama oluşmadan Türkçe hata', async () => {
  const ctx = baseContext({ fetch: async () => json(200, { is_template: false }) });
  await assert.rejects(kur.preflightSource(ctx, 'gokerlek/axon-fit'), (error) => error.message === 'Kaynak repo şablon olarak işaretli değil.' && /Template repository/.test(error.hint));
  assert.equal(await kur.preflightSource(baseContext({ fetch: async () => json(200, { is_template: true }) }), 'gokerlek/axon-fit'), true);
  assert.equal(await kur.preflightSource(baseContext({ fetch: async () => json(403, { message: 'rate limit' }) }), 'gokerlek/axon-fit'), false);
});

// ---------------------------------------------------------------------------------------------
// Yerel sunucu akışı
// ---------------------------------------------------------------------------------------------

test('yerel sunucu: state doğrulanır, kod bir kez çevrilir, kurulum dönüşü kullanıcı anahtarı verir', async () => {
  const { privateKey } = rsaKeys();
  let conversions = 0;
  const fetchImpl = async (url, init = {}) => {
    if (String(url).startsWith('http://127.0.0.1')) return realFetch(url, init);
    if (url === 'https://api.github.com/app-manifests/mcode/conversions') {
      conversions += 1;
      return json(201, { id: 1, slug: 'axon-fit-abc', name: 'Axon Fit abc', client_id: 'Iv1.c', client_secret: 'cs', pem: privateKey, owner: { login: 'coach' } });
    }
    if (url === 'https://github.com/login/oauth/access_token') {
      const body = JSON.parse(init.body);
      if (body.code !== 'good') return json(200, { error: 'bad_verification_code' });
      assert.deepEqual(body, { client_id: 'Iv1.c', client_secret: 'cs', code: 'good' });
      return json(200, { access_token: 'ghu_token' });
    }
    throw new Error(`Beklenmeyen istek: ${url}`);
  };
  const checks = [];
  let browser;
  const ctx = baseContext({
    fetch: fetchImpl,
    open: async (url) => {
      browser = (async () => {
        const base = new URL(url).origin;
        const html = await realFetch(url).then((response) => response.text());
        const state = new URL(unescapeHtml(/action="([^"]*)"/.exec(html)[1])).searchParams.get('state');
        checks.push(['erken dönüş', (await realFetch(`${base}/github/callback?code=good`)).status, 400]);
        checks.push(['yanlış state', (await realFetch(`${base}/github/app-created?code=mcode&state=yanlis`)).status, 400]);
        const [first, second] = await Promise.all([
          realFetch(`${base}/github/app-created?code=mcode&state=${state}`, { redirect: 'manual' }),
          realFetch(`${base}/github/app-created?code=mcode&state=${state}`, { redirect: 'manual' }),
        ]);
        checks.push(['yönlendirme', first.status, 302], ['ikinci yönlendirme', second.status, 302]);
        checks.push(['kurulum adresi', first.headers.get('location'), 'https://github.com/apps/axon-fit-abc/installations/new']);
        checks.push(['yabancı state', (await realFetch(`${base}/github/callback?code=good&state=yabanci`)).status, 400]);
        checks.push(['kodsuz', (await realFetch(`${base}/github/callback`)).status, 400]);
        checks.push(['geçersiz kod', (await realFetch(`${base}/github/callback?code=bad`)).status, 400]);
        checks.push(['bilinmeyen yol', (await realFetch(`${base}/baska`)).status, 404]);
        checks.push(['başarı', (await realFetch(`${base}/github/callback?code=good&installation_id=9&setup_action=install`)).status, 200]);
      })();
      return true;
    },
  });
  const result = await kur.runGithubAppFlow(ctx, { appName: 'Axon Fit abc', productionUrl: 'https://salon.vercel.app', timeoutMs: 10_000 });
  await browser;
  for (const [label, actual, expected] of checks) assert.equal(actual, expected, label);
  assert.equal(conversions, 1);
  assert.equal(result.userToken, 'ghu_token');
  assert.equal(result.installationIdHint, '9');
  assert.equal(result.app.slug, 'axon-fit-abc');
  assert.equal(ctx.created.githubApp.settingsUrl, 'https://github.com/settings/apps/axon-fit-abc');
  assert.equal(ctx.io.lines.join('\n').includes('cs'), false);
});

test('yerel sunucu: tarayıcıdan dönüş gelmezse süre dolar', async () => {
  const ctx = baseContext({ open: async () => false });
  await assert.rejects(kur.runGithubAppFlow(ctx, { appName: 'A', productionUrl: 'https://s.vercel.app', timeoutMs: 30 }), /süre doldu/);
  assert.ok(ctx.io.lines.some((line) => /Tarayıcı açılamadı\. Bu adresi kendin aç: http:\/\/127\.0\.0\.1:\d+\//.test(line)));
});

// ---------------------------------------------------------------------------------------------
// Vercel ve GitHub adımları (taklit fetch)
// ---------------------------------------------------------------------------------------------

test('Vercel girişi: CLI okunamazsa anahtar yapıştırma; birden çok ekipte varsayılan ekip önerilir', async () => {
  const ctx = baseContext({
    io: fakeIo({ secrets: ['  vercel_yapistirilan  '] }),
    run: async () => 1,
    fetch: async (url, init) => {
      assert.equal(init.headers.Authorization, 'Bearer vercel_yapistirilan');
      const { pathname } = new URL(url);
      if (pathname === '/v2/user') return json(200, { user: { username: 'coachv', defaultTeamId: 'team_2' } });
      if (pathname === '/v2/teams') return json(200, { teams: [{ id: 'team_1', slug: 'birinci' }, { id: 'team_2', slug: 'ikinci' }] });
      throw new Error(`Beklenmeyen istek: ${url}`);
    },
  });
  const vercel = await kur.vercelLogin(ctx);
  assert.equal(vercel.session.token, 'vercel_yapistirilan');
  assert.equal(vercel.session.source, 'paste');
  assert.equal(vercel.session.teamId, 'team_2');
  assert.equal(ctx.io.lines.join('\n').includes('vercel_yapistirilan'), false);
});

test('Vercel oturumu bitmek üzereyse yeniden giriş yapılır', async () => {
  let token = 'yeni';
  const ctx = baseContext({
    run: async () => 0,
    readText: (file) => (file.endsWith('auth.json') ? JSON.stringify({ token, expiresAt: NOW + 7200 }) : null),
    fetch: async () => json(200, { user: { username: 'coachv' } }),
  });
  const vercel = { session: { token: 'eski', teamId: 't', source: 'file', expiresAt: NOW + 100 }, user: { username: 'coachv' } };
  await kur.ensureFreshVercel(ctx, vercel);
  assert.equal(vercel.session.token, 'yeni');
  assert.equal(vercel.session.expiresAt, NOW + 7200);
  token = 'hic';
  await kur.ensureFreshVercel(ctx, vercel);
  assert.equal(vercel.session.token, 'yeni', 'süresi yetiyorsa dokunulmaz');
});

test('kod reposu: kaynak şablon değilse anlaşılır hata', async () => {
  const ctx = baseContext({ fetch: async () => json(200, { is_template: false }) });
  await assert.rejects(kur.createRepos(ctx, { source: 'gokerlek/axon-fit', login: 'coach', token: 't', projectName: 'salon' }), { message: 'Kaynak repo şablon olarak işaretli değil.' });
});

test('kod reposu adı doluysa yeni ad sorulur; şablon izin vermezse tarayıcıdan elle oluşturma yolu', async () => {
  const opened = [];
  const ctx = baseContext({
    io: fakeIo({ answers: [['Kod reposu için başka bir ad', 'salon-yeni']] }),
    open: async (url) => {
      opened.push(url);
      return true;
    },
    fetch: async (url, init = {}) => {
      const { pathname } = new URL(url);
      const method = init.method ?? 'GET';
      if (pathname === '/repos/coach/salon') return json(200, { private: true });
      if (pathname === '/repos/coach/salon-yeni' && method === 'GET') return opened.length ? json(200, { id: 5, private: true, default_branch: 'main' }) : json(404, {});
      if (pathname === '/repos/gokerlek/axon-fit/generate') return json(403, { message: 'Resource not accessible by integration' });
      if (pathname === '/repos/coach/salon-yeni/branches/main') return json(200, {});
      if (pathname === '/repos/coach/axon-fit-data') return json(404, {});
      if (pathname === '/user/repos') {
        assert.deepEqual(JSON.parse(init.body), { name: 'axon-fit-data', description: 'Axon Fit verileri (özel)', private: true, auto_init: true });
        return json(201, {});
      }
      throw new Error(`Beklenmeyen istek: ${method} ${url}`);
    },
  });
  const repos = await kur.createRepos(ctx, { source: 'gokerlek/axon-fit', sourceVerified: true, login: 'coach', token: 't', projectName: 'salon' });
  assert.deepEqual(repos, { codeName: 'salon-yeni', codeFullName: 'coach/salon-yeni', codeRepoId: 5, branch: 'main', dataName: 'axon-fit-data' });
  assert.deepEqual(opened, ['https://github.com/gokerlek/axon-fit']);
  assert.ok(ctx.io.lines.some((line) => line.includes('Repository name: salon-yeni')));
});

test('veri reposu zaten varsa ve özelse kullanılır (yeni oluşturulmaz)', async () => {
  const ctx = baseContext({
    fetch: async (url, init = {}) => {
      const { pathname } = new URL(url);
      if (pathname === '/repos/coach/salon') return json(404, {});
      if (pathname === '/repos/gokerlek/axon-fit/generate') {
        const body = JSON.parse(init.body);
        assert.deepEqual(body, { owner: 'coach', name: 'salon', description: 'Axon Fit — kendi kopyam (kod)', include_all_branches: false, private: true });
        return json(201, { id: 9, default_branch: 'main' });
      }
      if (pathname === '/repos/coach/salon/branches/main') return json(200, {});
      if (pathname === '/repos/coach/axon-fit-data') return json(200, { private: true, fork: false });
      throw new Error(`Beklenmeyen istek: ${url}`);
    },
  });
  const repos = await kur.createRepos(ctx, { source: 'gokerlek/axon-fit', sourceVerified: true, login: 'coach', token: 't', projectName: 'salon' });
  assert.equal(repos.dataName, 'axon-fit-data');
  assert.equal(ctx.created.dataRepo, undefined, 'var olan repo "oluşturulanlar" listesine girmez');
  assert.equal(ctx.created.codeRepo, 'https://github.com/coach/salon');
});

test('Vercel GitHub uygulaması repoyu göremezse kurulum sayfası açılır, onaydan sonra yeniden denenir', async () => {
  let failures = 4;
  const opened = [];
  const project = { id: 'prj_1', name: 'salon', link: { type: 'github', org: 'coach', repo: 'salon', repoId: 9, productionBranch: 'main' } };
  let created = false;
  const ctx = baseContext({
    open: async (url) => {
      opened.push(url);
      return true;
    },
    fetch: async (url, init = {}) => {
      const parsed = new URL(url);
      assert.equal(parsed.searchParams.get('teamId'), 'team_1');
      if (parsed.pathname.startsWith('/v9/projects/')) return created ? json(200, project) : json(404, { error: { code: 'not_found' } });
      if (parsed.pathname === '/v11/projects') {
        assert.deepEqual(JSON.parse(init.body), { name: 'salon', framework: 'nextjs', gitRepository: { type: 'github', repo: 'coach/salon' } });
        if (failures-- > 0) return json(400, { error: { code: 'repo_not_found', message: 'Repository not found', action: 'Install GitHub App', link: 'https://github.com/apps/vercel/installations/new?state=x' } });
        created = true;
        return json(200, { id: 'prj_1', name: 'salon' });
      }
      throw new Error(`Beklenmeyen istek: ${url}`);
    },
  });
  const vercel = { session: { token: 'v', teamId: 'team_1' }, user: { username: 'coachv' }, team: { id: 'team_1', slug: 'coachv-projects' } };
  const result = await kur.ensureVercelProject(ctx, vercel, { name: 'salon', repoFullName: 'coach/salon' });
  assert.equal(result.id, 'prj_1');
  assert.deepEqual(opened, ['https://github.com/apps/vercel/installations/new?state=x', 'https://github.com/apps/vercel/installations/new?state=x']);
  assert.equal(ctx.io.asked.filter((question) => /Enter/.test(question)).length, 2);
  assert.equal(ctx.created.vercelProject, 'https://vercel.com/coachv-projects/salon');
});

test('env yazımı başarısızsa hata yalnız anahtar adlarını söyler, değeri değil', async () => {
  const ctx = baseContext({
    fetch: async (url, init) => {
      const parsed = new URL(url);
      assert.equal(parsed.searchParams.get('upsert'), 'true');
      const body = JSON.parse(init.body);
      return json(201, { created: [], failed: [{ error: { code: 'env_value_invalid_length', key: 'GITHUB_APP_PRIVATE_KEY', value: body[0].value, message: 'too long' } }] });
    },
  });
  const items = [{ key: 'GITHUB_APP_PRIVATE_KEY', value: 'COK-GIZLI-ANAHTAR', type: 'sensitive', target: ['production'] }];
  await assert.rejects(kur.writeEnv(ctx, { session: { token: 'v' } }, 'prj_1', items), (error) => {
    assert.match(error.message, /GITHUB_APP_PRIVATE_KEY \(env_value_invalid_length\)/);
    assert.equal(error.message.includes('COK-GIZLI'), false);
    return true;
  });
});

test('yayın: durumlar izlenir; hata verirse Vercel kayıt bağlantısıyla Türkçe hata', async () => {
  const states = ['BUILDING', 'ERROR'];
  let deployBody;
  const ctx = baseContext({
    fetch: async (url, init = {}) => {
      const parsed = new URL(url);
      if (init.method === 'POST') {
        assert.equal(parsed.searchParams.get('skipAutoDetectionConfirmation'), '1');
        deployBody = JSON.parse(init.body);
        return json(200, { id: 'dpl_1', readyState: 'QUEUED' });
      }
      return json(200, { id: 'dpl_1', readyState: states.shift(), inspectorUrl: 'https://vercel.com/coach/salon/dpl_1' });
    },
  });
  const project = { id: 'prj_1', name: 'salon', link: { type: 'github', org: 'coach', repo: 'salon', repoId: 9 } };
  await assert.rejects(kur.deployAndWait(ctx, { session: { token: 'v' } }, { project, repoId: 9, branch: 'main' }), (error) => {
    assert.match(error.message, /hata verdi/);
    assert.match(error.hint, /https:\/\/vercel\.com\/coach\/salon\/dpl_1/);
    return true;
  });
  assert.deepEqual(deployBody, { name: 'salon', project: 'prj_1', target: 'production', gitSource: { type: 'github', repoId: 9, ref: 'main' }, projectSettings: { framework: 'nextjs' } });
  assert.deepEqual(ctx.io.lines.filter((line) => line.includes('Yayın durumu')), ['    Yayın durumu: sırada', '    Yayın durumu: derleniyor', '    Yayın durumu: hata verdi']);
});

// ---------------------------------------------------------------------------------------------
// Uçtan uca (her şey taklit: ağ, tarayıcı, terminal, Vercel CLI)
// ---------------------------------------------------------------------------------------------

function createWorld({ envFails = false } = {}) {
  const { privateKey, publicKey } = rsaKeys();
  const secrets = { pem: privateKey, clientSecret: 'cs_cok_gizli_deger', userToken: 'ghu_kullanici_anahtari', vercelToken: 'vercel_cli_anahtari' };
  const state = { repos: new Set(), project: null, envBody: null, deployBody: null, polls: 0, conversions: 0, gitFailures: 3, loggedIn: false, browserErrors: [] };
  async function fetchImpl(input, init = {}) {
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    if (url.hostname === '127.0.0.1') return realFetch(input, init);
    const auth = init.headers?.Authorization ?? '';
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    const p = url.pathname;
    if (url.hostname.endsWith('.vercel.app')) return new Response('DEPLOYMENT_NOT_FOUND', { status: 404, headers: { 'x-vercel-error': 'DEPLOYMENT_NOT_FOUND' } });
    if (url.origin === 'https://github.com' && p === '/login/oauth/access_token') {
      assert.deepEqual(body, { client_id: 'Iv1.client', client_secret: secrets.clientSecret, code: 'user-code' });
      return json(200, { access_token: secrets.userToken, expires_in: 28800, refresh_token: 'ghr_x', token_type: 'bearer' });
    }
    if (url.origin === 'https://api.github.com') {
      if (method === 'GET' && p === '/repos/gokerlek/axon-fit') return json(200, { is_template: true, default_branch: 'main' });
      if (method === 'POST' && p === '/app-manifests/manifest-code/conversions') {
        state.conversions += 1;
        return json(201, { id: 4242, slug: 'axon-fit-abcdef', name: 'Axon Fit abcdef', client_id: 'Iv1.client', client_secret: secrets.clientSecret, webhook_secret: null, pem: secrets.pem, owner: { login: 'coach' } });
      }
      if (method === 'GET' && p === '/user' && auth === `Bearer ${secrets.userToken}`) return json(200, { login: 'coach', id: 1 });
      if (method === 'GET' && p === '/users/coach/installation') {
        const { payload } = verifyJwt(auth.slice('Bearer '.length), publicKey);
        assert.equal(payload.iss, 'Iv1.client');
        return json(200, { id: 77, repository_selection: 'all', account: { login: 'coach' } });
      }
      if (auth !== `Bearer ${secrets.userToken}`) throw new Error(`GitHub isteği kullanıcı anahtarı olmadan: ${method} ${p}`);
      const repo = /^\/repos\/coach\/([^/]+)$/.exec(p);
      if (method === 'GET' && repo) return state.repos.has(repo[1]) ? json(200, { private: true }) : json(404, { message: 'Not Found' });
      if (method === 'POST' && p === '/repos/gokerlek/axon-fit/generate') {
        assert.equal(body.private, true);
        assert.equal(body.include_all_branches, false);
        state.repos.add(body.name);
        return json(201, { id: 999, full_name: `coach/${body.name}`, default_branch: 'main', private: true });
      }
      if (method === 'GET' && /^\/repos\/coach\/[^/]+\/branches\/main$/.test(p)) return json(200, { name: 'main' });
      if (method === 'POST' && p === '/user/repos') {
        assert.equal(body.private, true);
        assert.equal(body.auto_init, true);
        state.repos.add(body.name);
        return json(201, { id: 1000, private: true });
      }
    }
    if (url.origin === 'https://api.vercel.com') {
      assert.equal(auth, `Bearer ${secrets.vercelToken}`);
      if (p === '/v2/user') return json(200, { user: { username: 'coachv', defaultTeamId: 'team_1' } });
      if (p === '/v2/teams') return json(200, { teams: [{ id: 'team_1', slug: 'coachv-projects', name: 'coachv' }] });
      assert.equal(url.searchParams.get('teamId'), 'team_1', `${method} ${p} teamId`);
      if (method === 'GET' && /^\/v9\/projects\/[^/]+$/.test(p)) return state.project ? json(200, state.project) : json(404, { error: { code: 'not_found', message: 'Project not found' } });
      if (method === 'POST' && p === '/v11/projects') {
        if (state.gitFailures > 0) {
          state.gitFailures -= 1;
          return json(400, { error: { code: 'repo_not_found', message: 'Repository not found', action: 'Install GitHub App' } });
        }
        const [org, repo] = body.gitRepository.repo.split('/');
        state.project = { id: 'prj_1', name: body.name, link: { type: 'github', org, repo, repoId: 999, productionBranch: 'main' } };
        return json(200, state.project);
      }
      if (method === 'POST' && p === '/v10/projects/prj_1/env') {
        assert.equal(url.searchParams.get('upsert'), 'true');
        state.envBody = body;
        if (envFails) return json(201, { created: [], failed: [{ error: { code: 'env_conflict', key: 'GITHUB_APP_PRIVATE_KEY', value: secrets.pem } }] });
        return json(201, { created: body, failed: [] });
      }
      if (method === 'GET' && p === '/v10/projects/prj_1/env') return json(200, { envs: state.envBody.map(({ key, target, type }) => ({ key, target, type })) });
      if (method === 'POST' && p === '/v13/deployments') {
        state.deployBody = body;
        return json(200, { id: 'dpl_1', readyState: 'QUEUED' });
      }
      if (method === 'GET' && p === '/v13/deployments/dpl_1') {
        state.polls += 1;
        const ready = state.polls >= 2;
        return json(200, { id: 'dpl_1', readyState: ready ? 'READY' : 'BUILDING', alias: ready ? ['salonum.vercel.app'] : [], aliasAssigned: ready });
      }
    }
    throw new Error(`Beklenmeyen istek: ${method} ${url}`);
  }

  async function simulateBrowser(url) {
    const html = await realFetch(url).then((response) => response.text());
    const manifest = JSON.parse(unescapeHtml(/name="manifest" value="([^"]*)"/.exec(html)[1]));
    const appState = new URL(unescapeHtml(/action="([^"]*)"/.exec(html)[1])).searchParams.get('state');
    assert.equal(manifest.url, 'https://salonum.vercel.app');
    assert.match(manifest.callback_urls[0], /^http:\/\/127\.0\.0\.1:\d+\/github\/callback$/);
    assert.equal(manifest.callback_urls[1], 'https://salonum.vercel.app/api/auth/github/callback');
    // GitHub: "Create GitHub App" → redirect_url; "Install" + yetki → ilk callback adresi.
    const created = await realFetch(`${manifest.redirect_url}?code=manifest-code&state=${appState}`, { redirect: 'manual' });
    assert.equal(created.status, 302);
    assert.equal(created.headers.get('location'), 'https://github.com/apps/axon-fit-abcdef/installations/new');
    const back = await realFetch(`${manifest.callback_urls[0]}?code=user-code&installation_id=77&setup_action=install`);
    assert.equal(back.status, 200);
  }

  const opened = [];
  const ctx = baseContext({
    fetch: fetchImpl,
    io: fakeIo({ answers: [['Uygulamanın adı', 'Salonum']] }),
    open: async (url) => {
      opened.push(url);
      if (url.startsWith('http://127.0.0.1')) simulateBrowser(url).catch((error) => state.browserErrors.push(error));
      return true;
    },
    run: async (command, args) => {
      assert.equal(command, 'npx');
      assert.deepEqual(args, ['--yes', `vercel@${kur.VERCEL_CLI_VERSION}`, 'login']);
      state.loggedIn = true;
      return 0;
    },
    readText: (file) => {
      if (state.loggedIn && file === '/home/coach/.local/share/com.vercel.cli/auth.json') {
        return JSON.stringify({ '// Note': 'This is your Vercel credentials file. DO NOT SHARE!', token: secrets.vercelToken, expiresAt: NOW + 3600, refreshToken: 'r' });
      }
      return null;
    },
  });
  return { ctx, state, secrets, opened };
}

function assertNoSecrets(world, extra = []) {
  const output = [...world.ctx.io.lines, ...world.ctx.io.asked, ...world.opened].join('\n');
  const pemBody = world.secrets.pem.split('\n')[1];
  for (const secret of [pemBody, world.secrets.clientSecret, world.secrets.userToken, world.secrets.vercelToken, ...extra]) {
    assert.equal(output.includes(secret), false, `sır çıktıda: ${secret.slice(0, 12)}…`);
  }
}

test('uçtan uca: 8 adım, env ve yayın doğru, sırlar hiçbir çıktıda yok', async () => {
  const world = createWorld();
  const result = await kur.kur(world.ctx);
  assert.deepEqual(world.state.browserErrors, []);
  assert.equal(result.siteUrl, 'https://salonum.vercel.app');
  assert.equal(world.state.conversions, 1);

  const env = Object.fromEntries(world.state.envBody.map((item) => [item.key, item]));
  assert.equal(env.GITHUB_OWNER.value, 'coach');
  assert.equal(env.APP_REPO.value, 'axon-fit-data');
  assert.equal(env.AXON_CODE_REPO.value, 'coach/salonum');
  assert.equal(env.AXON_CODE_BRANCH.value, 'main');
  assert.equal(env.GITHUB_APP_ID.value, '4242');
  assert.equal(env.GITHUB_APP_INSTALLATION_ID.value, '77');
  assert.equal(env.GITHUB_CLIENT_ID.value, 'Iv1.client');
  assert.equal(env.GITHUB_CLIENT_SECRET.value, world.secrets.clientSecret);
  assert.equal(env.GITHUB_APP_PRIVATE_KEY.value, world.secrets.pem);
  assert.match(env.AUTH_SECRET.value, /^[0-9a-f]{64}$/);
  for (const key of kur.SECRET_ENV_KEYS) assert.equal(env[key].type, 'sensitive', key);
  assert.equal('GITHUB_TOKEN' in env, false);

  assert.deepEqual(world.state.deployBody.gitSource, { type: 'github', repoId: 999, ref: 'main' });
  assert.equal(world.state.deployBody.target, 'production');
  assert.equal(world.state.deployBody.project, 'prj_1');

  assert.equal(world.opened[0].startsWith('http://127.0.0.1:'), true);
  assert.ok(world.opened.includes('https://github.com/apps/vercel/installations/new'));
  assert.equal(world.opened.at(-1), 'https://salonum.vercel.app/login');
  const output = world.ctx.io.lines.join('\n');
  for (let n = 1; n <= kur.STEP_COUNT; n += 1) assert.match(output, new RegExp(`\\[${n}/${kur.STEP_COUNT}\\]`));
  assert.match(output, /Adresin: https:\/\/salonum\.vercel\.app/);
  assert.match(output, /Tarayıcıda açıldı: GitHub ile giriş yap\./);
  assert.match(output, /GitHub uygulamanın ayarları: https:\/\/github\.com\/settings\/apps\/axon-fit-abcdef/);
  assertNoSecrets(world, [env.AUTH_SECRET.value]);
});

test('uçtan uca hata: kod 1 döner, ne yapılacağı ve o ana kadar oluşturulanlar yazılır, sır yazılmaz', async () => {
  const world = createWorld({ envFails: true });
  const code = await kur.main(world.ctx);
  assert.equal(code, 1);
  const output = world.ctx.io.lines.join('\n');
  assert.match(output, /Kurulum tamamlanamadı: Bazı ayarlar Vercel'e yazılamadı: GITHUB_APP_PRIVATE_KEY \(env_conflict\)/);
  assert.match(output, /Ne yapmalı: /);
  assert.match(output, /GitHub uygulaması "Axon Fit abcdef": https:\/\/github\.com\/settings\/apps\/axon-fit-abcdef/);
  assert.match(output, /Kod reposu: https:\/\/github\.com\/coach\/salonum/);
  assert.match(output, /Veri reposu: https:\/\/github\.com\/coach\/axon-fit-data/);
  assert.match(output, /Vercel projesi: https:\/\/vercel\.com\/coachv-projects\/salonum/);
  assert.equal(world.state.deployBody, null, 'env yazılamadıysa yayın başlamaz');
  assertNoSecrets(world);
});

test('betik `node --input-type=module -e` ile yüklenir; AXON_KUR_TEST=1 iken ana akış başlamaz', () => {
  const source = readFileSync(new URL('./kur.mjs', import.meta.url), 'utf8');
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
    env: { ...process.env, AXON_KUR_TEST: '1' },
    encoding: 'utf8',
    timeout: 20_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});
