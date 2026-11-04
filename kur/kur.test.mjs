import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

// Ana akış başlamasın: import'tan ÖNCE ayarlanmalı (statik import yukarı taşınacağı için dinamik).
process.env.AXON_KUR_TEST = '1';
const kur = await import('./kur.mjs');

const realFetch = globalThis.fetch;
const NOW = 1_800_000_000;
const SOURCE_PATH = new URL('./kur.mjs', import.meta.url);

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

/** Taklit terminal: `answers` = [[soru parçası, yanıt ya da fonksiyon], …]; yanıtı olmayan soruya varsayılan döner. */
function fakeIo({ answers = [], secrets = [] } = {}) {
  const lines = [];
  const asked = [];
  const queue = [...answers];
  const take = (question) => {
    const index = queue.findIndex(([match]) => question.includes(match));
    if (index === -1) return undefined;
    const value = queue.splice(index, 1)[0][1];
    return typeof value === 'function' ? value() : value;
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
  const sleeps = [];
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
    sleeps,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    randomInt: () => 0,
    randomBytes: counterBytes(),
    nowSeconds: () => NOW,
    nowMs: () => NOW * 1000,
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

// --- Tar yapıcı (testler için; GitHub/git archive biçimi: ustar + pax) ---------------------------

function octal(value, length) {
  return `${value.toString(8).padStart(length - 1, '0')}\0`;
}

function tarHeader({ name, size = 0, mode = 0o644, type = '0', linkname = '', prefix = '' }) {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, 'utf8');
  header.write(octal(mode, 8), 100, 'latin1');
  header.write(octal(0, 8), 108, 'latin1');
  header.write(octal(0, 8), 116, 'latin1');
  header.write(octal(size, 12), 124, 'latin1');
  header.write(octal(0, 12), 136, 'latin1');
  header.fill(0x20, 148, 156);
  header.write(type, 156, 'latin1');
  header.write(linkname, 157, 100, 'utf8');
  header.write('ustar\0', 257, 'latin1');
  header.write('00', 263, 'latin1');
  header.write(prefix, 345, 155, 'utf8');
  let sum = 0;
  for (const byte of header) sum += byte;
  header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 'latin1');
  return header;
}

function padBlock(data) {
  const rest = data.length % 512;
  return rest ? Buffer.concat([data, Buffer.alloc(512 - rest)]) : data;
}

function paxData(records) {
  return Buffer.from(
    Object.entries(records)
      .map(([key, value]) => {
        const body = ` ${key}=${value}\n`;
        let length = Buffer.byteLength(body) + 1;
        while (String(length).length + Buffer.byteLength(body) !== length) length = String(length).length + Buffer.byteLength(body);
        return `${length}${body}`;
      })
      .join(''),
  );
}

/** items: { name, data?, mode?, type?, linkname?, prefix? } ya da { pax: 'x'|'g', records } ya da { gnuLong: 'L', value }. */
function makeTar(items) {
  const parts = [];
  for (const item of items) {
    if (item.pax) {
      const data = paxData(item.records);
      parts.push(tarHeader({ name: 'pax_header', size: data.length, type: item.pax }), padBlock(data));
    } else if (item.gnuLong) {
      const data = Buffer.from(`${item.value}\0`);
      parts.push(tarHeader({ name: '././@LongLink', size: data.length, type: item.gnuLong }), padBlock(data));
    } else {
      const data = item.data ? Buffer.from(item.data) : Buffer.alloc(0);
      parts.push(tarHeader({ ...item, size: data.length }), padBlock(data));
    }
  }
  parts.push(Buffer.alloc(1024));
  return Buffer.concat(parts);
}

const TOP = 'axon-fit-1.2.3';
const LONG_PATH = `${'derin/'.repeat(30)}uzun-ad-ğüş.txt`;
const SOURCE_COMMIT = 'a'.repeat(40);

function sampleArchiveItems() {
  return [
    { pax: 'g', records: { comment: SOURCE_COMMIT } },
    { name: `${TOP}/`, type: '5', mode: 0o755 },
    { name: `${TOP}/package.json`, data: '{"name":"axon","version":"1.2.3"}\n' },
    { name: `${TOP}/scripts/calistir.sh`, data: '#!/bin/sh\necho merhaba\n', mode: 0o755 },
    { pax: 'x', records: { path: `${TOP}/${LONG_PATH}` } },
    { name: `${TOP}/derin/kirpilmis`, data: 'uzun yol içeriği\n' },
    { name: 'icerik.md', prefix: `${TOP}/docs`, data: '# Başlık\r\nsatır\r\n' },
    { name: `${TOP}/kisayol`, type: '2', linkname: 'package.json' },
    { name: `${TOP}/public/logo.png`, data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x10]) },
    { name: `${TOP}/latin1.txt`, data: Buffer.from([0x63, 0xe7, 0x61]) },
    { name: `${TOP}/bom.txt`, data: Buffer.from('﻿merhaba\n', 'utf8') },
    { gnuLong: 'L', value: `${TOP}/gnu/uzun-gnu-adi.txt` },
    { name: `${TOP}/gnu/kisa`, data: 'gnu\n' },
    { name: `${TOP}/bos.txt`, data: '' },
  ];
}

const EXPECTED_FILES = {
  'package.json': { mode: '100644', data: Buffer.from('{"name":"axon","version":"1.2.3"}\n') },
  'scripts/calistir.sh': { mode: '100755', data: Buffer.from('#!/bin/sh\necho merhaba\n') },
  [LONG_PATH]: { mode: '100644', data: Buffer.from('uzun yol içeriği\n') },
  'docs/icerik.md': { mode: '100644', data: Buffer.from('# Başlık\r\nsatır\r\n') },
  kisayol: { mode: '120000', data: Buffer.from('package.json') },
  'public/logo.png': { mode: '100644', data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x10]) },
  'latin1.txt': { mode: '100644', data: Buffer.from([0x63, 0xe7, 0x61]) },
  'bom.txt': { mode: '100644', data: Buffer.from('﻿merhaba\n', 'utf8') },
  'gnu/uzun-gnu-adi.txt': { mode: '100644', data: Buffer.from('gnu\n') },
  'bos.txt': { mode: '100644', data: Buffer.alloc(0) },
};

/** Git Data API taklidi: blob/ağaç/commit/ref; `base_tree` birleştirmesi gerçek GitHub gibi. */
function fakeGitHost() {
  const blobs = new Map();
  const trees = new Map();
  const commits = new Map();
  const refs = new Map();
  const writes = [];
  let counter = 0;
  const nextSha = () => crypto.createHash('sha1').update(String((counter += 1))).digest('hex');
  function handle(method, rest, body) {
    if (method === 'POST' && rest === '/git/blobs') {
      assert.equal(body.encoding, 'base64');
      const sha = nextSha();
      blobs.set(sha, Buffer.from(body.content, 'base64'));
      writes.push({ kind: 'blob' });
      return json(201, { sha });
    }
    if (method === 'POST' && rest === '/git/trees') {
      if (body.base_tree) assert.ok(trees.has(body.base_tree), 'base_tree bilinmiyor');
      const merged = new Map(body.base_tree ? trees.get(body.base_tree) : []);
      for (const entry of body.tree) {
        assert.equal(entry.type, 'blob');
        assert.notEqual('sha' in entry, 'content' in entry, 'sha ve content birlikte olmaz');
        merged.set(entry.path, { mode: entry.mode, data: 'sha' in entry ? blobs.get(entry.sha) : Buffer.from(entry.content, 'utf8') });
      }
      const sha = nextSha();
      trees.set(sha, merged);
      writes.push({ kind: 'tree', bytes: Buffer.byteLength(JSON.stringify(body)), base: Boolean(body.base_tree) });
      return json(201, { sha });
    }
    if (method === 'POST' && rest === '/git/commits') {
      const sha = nextSha();
      commits.set(sha, body);
      writes.push({ kind: 'commit' });
      return json(201, { sha });
    }
    if (method === 'PATCH' && rest.startsWith('/git/refs/heads/')) {
      refs.set(rest.slice('/git/refs/heads/'.length), body);
      writes.push({ kind: 'ref' });
      return json(200, { object: { sha: body.sha } });
    }
    return null;
  }
  const filesOf = (branch) => trees.get(commits.get(refs.get(branch).sha).tree);
  return { handle, blobs, trees, commits, refs, writes, filesOf };
}

function assertTreeEquals(tree, expected) {
  assert.deepEqual([...tree.keys()].sort(), Object.keys(expected).sort());
  for (const [file, want] of Object.entries(expected)) {
    const got = tree.get(file);
    assert.equal(got.mode, want.mode, `${file} kipi`);
    assert.deepEqual(got.data, want.data, `${file} içeriği`);
  }
}

// ---------------------------------------------------------------------------------------------
// Saf yardımcılar
// ---------------------------------------------------------------------------------------------

test('Node sürümü her şeyden önce: 20 ve üstü geçer; readline statik içe aktarılmaz, yeni atama sözdizimi yok', () => {
  assert.equal(kur.nodeMajor('v22.3.0'), 22);
  assert.equal(kur.startupProblem('20.0.0'), null);
  assert.match(kur.startupProblem('16.20.2'), /en az Node 20/);
  assert.doesNotThrow(() => kur.checkNodeVersion('20.0.0'));
  assert.throws(() => kur.checkNodeVersion('18.19.1'), (error) => error instanceof kur.KurError && /nodejs\.org/.test(error.hint));
  const source = readFileSync(SOURCE_PATH, 'utf8');
  assert.doesNotMatch(source, /^import[^;]*['"]node:readline/m);
  assert.doesNotMatch(source, /\?\?=|\|\|=|&&=/);
  const bottom = source.slice(source.lastIndexOf("if (process.env.AXON_KUR_TEST !== '1')"));
  assert.ok(bottom.indexOf('startupProblem(') < bottom.indexOf('main('), 'sürüm denetimi main\'den önce');
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

test('veri reposu adı, kaynak repo biçimi, repo adı denetimi', () => {
  assert.equal(kur.dataRepoName('axon-fit'), 'axon-fit-data');
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
  assert.equal(unescapeHtml(/action="([^"]*)"/.exec(html)[1]), 'https://github.com/settings/apps/new?state=abc123');
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
    owner: 'coach', codeRepo: 'axon-fit', dataRepo: 'axon-fit-data', branch: 'main', appId: 42,
    privateKey: '-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----\n', installationId: 77,
    clientId: 'Iv1.abc', clientSecret: 'secret', authSecret,
  });
  const byKey = Object.fromEntries(items.map((item) => [item.key, item]));
  assert.deepEqual(Object.keys(byKey).sort(), [
    'APP_REPO', 'AUTH_SECRET', 'AXON_CODE_BRANCH', 'AXON_CODE_REPO', 'GITHUB_APP_ID', 'GITHUB_APP_INSTALLATION_ID',
    'GITHUB_APP_PRIVATE_KEY', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'GITHUB_OWNER',
  ]);
  assert.equal(byKey.AXON_CODE_REPO.value, 'coach/axon-fit');
  assert.equal(byKey.GITHUB_APP_ID.value, '42');
  assert.equal(byKey.GITHUB_APP_INSTALLATION_ID.value, '77');
  for (const item of items) {
    assert.deepEqual(item.target, ['production']);
    assert.equal(item.type, kur.SECRET_ENV_KEYS.includes(item.key) ? 'sensitive' : 'encrypted', item.key);
  }
  assert.throws(() => kur.buildEnvItems({ owner: 'coach', codeRepo: 'a', dataRepo: 'd', branch: 'main', appId: 1, privateKey: '', installationId: 1, clientId: 'a', clientSecret: 'b', authSecret }), /GITHUB_APP_PRIVATE_KEY/);
});

test('Vercel CLI klasörleri ve auth.json okuma', () => {
  assert.deepEqual(kur.vercelConfigDirs({ platform: 'darwin', home: '/Users/a', env: {} }), [
    '/Users/a/Library/Application Support/com.vercel.cli', '/Users/a/.now', '/Users/a/Library/Application Support/now',
  ]);
  assert.equal(kur.vercelConfigDirs({ platform: 'linux', home: '/home/a', env: {} })[0], '/home/a/.local/share/com.vercel.cli');
  assert.deepEqual(kur.vercelConfigDirs({ platform: 'linux', home: '/home/a', env: { XDG_DATA_HOME: '/data' } }).slice(0, 2), ['/data/com.vercel.cli', '/home/a/.local/share/com.vercel.cli']);
  assert.deepEqual(kur.parseVercelAuth('{"// Note":"x","token":"t1"}', NOW), { token: 't1', expiresAt: null, expired: false });
  assert.equal(kur.parseVercelAuth(JSON.stringify({ token: 't', expiresAt: NOW + 3600 }), NOW).expired, false);
  assert.equal(kur.parseVercelAuth(JSON.stringify({ token: 't', expiresAt: NOW + 10 }), NOW).expired, true);
  assert.equal(kur.parseVercelAuth('{"// Note":"x"}', NOW), null);
  assert.equal(kur.parseVercelAuth('bozuk', NOW), null);
  assert.equal(kur.parseVercelCurrentTeam('{"currentTeam":"team_1"}'), 'team_1');
  assert.equal(kur.parseVercelCurrentTeam('{}'), null);
});

test('<ad>.vercel.app boş mu: yalnız 404 DEPLOYMENT_NOT_FOUND boş sayılır; ağ hatasında internet ipucu', async () => {
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
  await assert.rejects(kur.vercelAppDomainFree(async () => { throw new TypeError('fetch failed'); }, 'salon'), (error) => error instanceof kur.KurError && /İnternet/.test(error.hint));
});

test('Vercel GitHub erişim hatası yalnız gerçek kodlarla tanınır', () => {
  const access = new kur.ApiError('Vercel', 400, { error: { code: 'repo_not_found', message: 'Repo not found', action: 'Install GitHub App' } });
  assert.equal(kur.isVercelGitAccessError(access), true);
  assert.equal(kur.isVercelGitAccessError(new kur.ApiError('Vercel', 400, { error: { code: 'bad_request', action: 'Install GitHub App' } })), true);
  assert.equal(kur.isVercelGitAccessError(new kur.ApiError('Vercel', 400, { error: { code: 'bad_request', message: 'Please install the GitHub integration' } })), false);
  assert.equal(kur.isVercelGitAccessError(new kur.ApiError('GitHub', 404, { message: 'Not Found' })), false);
  assert.equal(kur.isVercelLoginConnectionError(new kur.ApiError('Vercel', 400, { error: { code: 'x', action: 'Add a Login Connection' } })), true);
  assert.deepEqual(kur.apiErrorDetail({ message: 'Validation Failed', errors: [{ message: 'name already exists on this account' }] }), { code: undefined, message: 'Validation Failed — name already exists on this account' });
  assert.equal(kur.apiErrorDetail({ error: { code: 'x', message: 'a\u001b[31mb\nc' } }).message, 'a [31mb c');
  assert.equal(kur.safeLink('https://github.com/apps/vercel'), 'https://github.com/apps/vercel');
  assert.equal(kur.safeLink('http://github.com/x'), null);
  assert.equal(kur.safeLink('https://kotu.example/x'), null);
});

test('hata ipucu türe göre: Vercel önerisi yazılır, ağ hatası değilse internet önerilmez', () => {
  const vercel = kur.failureLines(new kur.ApiError('Vercel', 400, { error: { code: 'repo_not_found', message: 'Repository not found', action: 'Install GitHub App', link: 'https://github.com/apps/vercel/installations/new' } }, 'Vercel projesini açma'));
  assert.match(vercel.join('\n'), /Vercel öneriyor: Install GitHub App — https:\/\/github\.com\/apps\/vercel\/installations\/new/);
  assert.doesNotMatch(vercel.join('\n'), /İnternet/);
  const forged = kur.failureLines(new kur.ApiError('Vercel', 400, { error: { code: 'x', link: 'https://kotu.example/' } }));
  assert.doesNotMatch(forged.join('\n'), /kotu\.example/);
  assert.match(kur.failureLines(new kur.ApiError('GitHub', 403, { message: 'API rate limit exceeded' })).join('\n'), /istek sınırına/);
  assert.match(kur.failureLines(new kur.ApiError('GitHub', 403, { message: 'Resource not accessible by integration' })).join('\n'), /izin vermedi/);
  assert.match(kur.failureLines(new kur.ApiError('Vercel', 503, null)).join('\n'), /geçici bir sorun/);
  const unexpected = kur.failureLines(new TypeError('x is undefined')).join('\n');
  assert.match(unexpected, /beklenmeyen bir hata oluştu \(TypeError: x is undefined\)/);
  assert.doesNotMatch(unexpected, /İnternet/);
  assert.match(kur.failureLines(new kur.KurCancelled('eof')).join('\n'), /terminal girişi kapandı/);
});

// ---------------------------------------------------------------------------------------------
// Kaynak arşivi
// ---------------------------------------------------------------------------------------------

test('tar: ustar önek, pax x/g, GNU uzun ad, sembolik bağ, çalıştırılabilir kip; üst klasör atılır', () => {
  const { entries, comment } = kur.parseTar(makeTar(sampleArchiveItems()));
  assert.equal(comment, SOURCE_COMMIT);
  const files = kur.stripTopFolder(entries);
  const tree = new Map(files.map((file) => [file.path, { mode: kur.gitMode(file), data: file.type === 'symlink' ? Buffer.from(file.linkTarget) : Buffer.from(file.data) }]));
  assertTreeEquals(tree, EXPECTED_FILES);
});

test('tar: bozuk sağlama, eksik veri ve güvensiz yol reddedilir', () => {
  const archive = makeTar([{ name: `${TOP}/a.txt`, data: 'a' }]);
  const broken = Buffer.from(archive);
  broken[0] = 0x41;
  assert.throws(() => kur.parseTar(broken), (error) => error instanceof kur.KurError && /sağlama/.test(error.message));
  assert.throws(() => kur.parseTar(Buffer.concat([tarHeader({ name: `${TOP}/kesik`, size: 4096 }), Buffer.alloc(512)])), /eksik veri/);
  assert.throws(() => kur.stripTopFolder([{ path: `${TOP}/../disari.txt`, type: 'file', mode: 0o644, data: Buffer.alloc(0) }]), /güvensiz yol/);
  assert.throws(() => kur.stripTopFolder([{ path: 'a/x', type: 'file', mode: 0, data: Buffer.alloc(0) }, { path: 'b/y', type: 'file', mode: 0, data: Buffer.alloc(0) }]), /birden çok üst klasör/);
});

test('tar: gerçek `git archive` çıktısı git\'in kendi blob kimlikleriyle birebir aynı', (t) => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  let archive;
  let listing;
  try {
    archive = execFileSync('git', ['archive', '--format=tar', '--prefix=axon-fit-test/', 'HEAD'], { cwd: root, maxBuffer: 1024 * 1024 * 1024 });
    listing = execFileSync('git', ['ls-tree', '-r', '-z', '--full-tree', 'HEAD'], { cwd: root, maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
  } catch {
    t.skip('git ya da depo yok');
    return;
  }
  const expected = new Map();
  for (const record of listing.split('\0').filter(Boolean)) {
    const [meta, file] = record.split('\t');
    const [mode, type, sha] = meta.split(' ');
    if (type === 'blob') expected.set(file, { mode, sha });
  }
  const parsed = kur.parseTar(archive);
  assert.match(parsed.comment, /^[0-9a-f]{40}$/);
  const files = kur.stripTopFolder(parsed.entries);
  assert.equal(files.length, expected.size);
  for (const file of files) {
    const want = expected.get(file.path);
    assert.ok(want, `beklenmeyen dosya: ${file.path}`);
    const data = file.type === 'symlink' ? Buffer.from(file.linkTarget) : file.data;
    const sha = crypto.createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
    assert.equal(sha, want.sha, file.path);
    assert.equal(kur.gitMode(file), want.mode, file.path);
  }
});

test('metin/ikili ayrımı ve ağaç parçaları', () => {
  assert.equal(kur.decodeText(Buffer.from('çay\r\n')), 'çay\r\n');
  assert.equal(kur.decodeText(Buffer.from('﻿x')), '﻿x');
  assert.equal(kur.decodeText(Buffer.from([0x61, 0x00])), null);
  assert.equal(kur.decodeText(Buffer.from([0xe7])), null);
  const files = [
    { path: 'a.txt', type: 'file', mode: 0o644, data: Buffer.from('a') },
    { path: 'run', type: 'file', mode: 0o755, data: Buffer.from('#!/bin/sh') },
    { path: 'img', type: 'file', mode: 0o644, data: Buffer.from([0, 1]) },
    { path: 'big.txt', type: 'file', mode: 0o644, data: Buffer.alloc(11, 0x61) },
    { path: 'link', type: 'symlink', mode: 0o777, linkTarget: 'a.txt' },
  ];
  const plan = kur.planSourceTree(files, { inlineMaxBytes: 10 });
  assert.deepEqual(plan.inline, [
    { path: 'a.txt', mode: '100644', type: 'blob', content: 'a' },
    { path: 'run', mode: '100755', type: 'blob', content: '#!/bin/sh' },
    { path: 'link', mode: '120000', type: 'blob', content: 'a.txt' },
  ]);
  assert.deepEqual(plan.blobs.map((blob) => blob.path), ['img', 'big.txt']);
  const entries = Array.from({ length: 10 }, (_, i) => ({ path: `f${i}`, mode: '100644', type: 'blob', content: 'x'.repeat(100) }));
  const chunks = kur.chunkTreeEntries(entries, 350);
  assert.deepEqual(chunks.map((chunk) => chunk.length), [2, 2, 2, 2, 2]);
  assert.deepEqual(chunks.flat(), entries);
  assert.equal(kur.chunkTreeEntries([{ path: 'huge', content: 'x'.repeat(1000) }], 100).length, 1);
});

test('GitHub sınırı: retry-after, x-ratelimit-reset, en az 1 dk; izin hatası beklenmez', () => {
  const headers = (values) => new Headers(values);
  assert.equal(kur.rateLimitWait({ status: 403, headers: headers({ 'retry-after': '7' }), data: null }, NOW), 7);
  assert.equal(kur.rateLimitWait({ status: 429, headers: headers({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(NOW + 42) }), data: null }, NOW), 42);
  assert.equal(kur.rateLimitWait({ status: 403, headers: headers({}), data: { message: 'You have exceeded a secondary rate limit' } }, NOW), 60);
  assert.equal(kur.rateLimitWait({ status: 403, headers: headers({}), data: { message: 'You have exceeded a secondary rate limit' } }, NOW, 1), 120);
  assert.equal(kur.rateLimitWait({ status: 403, headers: headers({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(NOW + 3000) }), data: null }, NOW), null, 'çok uzun bekleme yok');
  assert.equal(kur.rateLimitWait({ status: 403, headers: headers({}), data: { message: 'Resource not accessible by integration' } }, NOW), null);
  assert.equal(kur.rateLimitWait({ status: 404, headers: headers({ 'retry-after': '1' }), data: null }, NOW), null);
});

test('kaynak indirme: son sürüm etiketi, kimliksiz istek, codeload arşivi', async () => {
  const gz = zlib.gzipSync(makeTar(sampleArchiveItems()));
  const requests = [];
  const ctx = baseContext({
    fetch: async (url, init = {}) => {
      requests.push(String(url));
      assert.equal(init.headers.Authorization, undefined, 'kimliksiz olmalı');
      if (url === 'https://api.github.com/repos/gokerlek/axon-fit/releases/latest') return json(200, { tag_name: 'v1.2.3' });
      if (url === 'https://codeload.github.com/gokerlek/axon-fit/tar.gz/v1.2.3') return new Response(gz, { status: 200 });
      throw new Error(`Beklenmeyen istek: ${url}`);
    },
  });
  const source = await kur.downloadSource(ctx, 'gokerlek/axon-fit');
  assert.equal(source.ref, 'v1.2.3');
  assert.equal(source.version, 'v1.2.3');
  assert.equal(source.commit, SOURCE_COMMIT);
  assert.equal(source.files.length, Object.keys(EXPECTED_FILES).length);
  assert.equal(requests.length, 2);
});

test('kaynak indirme: sürüm yoksa varsayılan dal, sürüm package.json\'dan; arşiv inmezse anlaşılır hata', async () => {
  const gz = zlib.gzipSync(makeTar(sampleArchiveItems()));
  const ctx = baseContext({
    fetch: async (url) => {
      if (url.endsWith('/releases/latest')) return json(404, { message: 'Not Found' });
      if (url === 'https://api.github.com/repos/baska/kopya') return json(200, { default_branch: 'gelistirme/ana' });
      if (url === 'https://codeload.github.com/baska/kopya/tar.gz/gelistirme/ana') return new Response(gz, { status: 200 });
      throw new Error(`Beklenmeyen istek: ${url}`);
    },
  });
  const source = await kur.downloadSource(ctx, 'baska/kopya');
  assert.equal(source.ref, 'gelistirme/ana');
  assert.equal(source.version, 'v1.2.3');
  const missing = baseContext({ fetch: async () => json(404, { message: 'Not Found' }) });
  await assert.rejects(kur.downloadSource(missing, 'yok/yok'), { message: 'Kaynak repo bulunamadı: yok/yok.' });
  const down = baseContext({
    fetch: async (url) => (url.includes('codeload') ? new Response('', { status: 502 }) : json(200, { tag_name: 'v1' })),
  });
  await assert.rejects(kur.downloadSource(down, 'gokerlek/axon-fit'), /Kaynak kodu indirilemedi \(502\)/);
});

test('kod yükleme: ikililer blob, metinler content, ~2 MB ağaç parçaları base_tree ile, kök commit, force; istekler aralıklı ve sınırda beklenir', async () => {
  const git = fakeGitHost();
  let throttled = false;
  const big = 'x'.repeat(900_000);
  const files = [
    ...Object.entries(EXPECTED_FILES).map(([file, value]) => (value.mode === '120000'
      ? { path: file, type: 'symlink', mode: 0o777, linkTarget: value.data.toString() }
      : { path: file, type: 'file', mode: value.mode === '100755' ? 0o755 : 0o644, data: value.data })),
    { path: 'buyuk/1.txt', type: 'file', mode: 0o644, data: Buffer.from(big) },
    { path: 'buyuk/2.txt', type: 'file', mode: 0o644, data: Buffer.from(big) },
    { path: 'buyuk/3.txt', type: 'file', mode: 0o644, data: Buffer.from(big) },
    { path: 'cok-buyuk.txt', type: 'file', mode: 0o644, data: Buffer.from('y'.repeat(1_500_000)) },
  ];
  const ctx = baseContext({
    fetch: async (url, init = {}) => {
      const { pathname } = new URL(url);
      const prefix = '/repos/coach/axon-fit';
      assert.ok(pathname.startsWith(prefix));
      assert.equal(init.headers.Authorization, 'Bearer ghu_x');
      if (!throttled) {
        throttled = true;
        return json(403, { message: 'You have exceeded a secondary rate limit' }, { 'retry-after': '7' });
      }
      return git.handle(init.method, pathname.slice(prefix.length), JSON.parse(init.body));
    },
  });
  const github = kur.githubApi(ctx.fetch, ctx);
  const source = { name: 'gokerlek/axon-fit', ref: 'v1.2.3', version: 'v1.2.3', commit: SOURCE_COMMIT, files, totalBytes: 0 };
  await kur.uploadSource(ctx, { github, token: 'ghu_x', fullName: 'coach/axon-fit', branch: 'main', source });

  const expected = { ...EXPECTED_FILES };
  for (const file of files.slice(Object.keys(EXPECTED_FILES).length)) expected[file.path] = { mode: '100644', data: file.data };
  assertTreeEquals(git.filesOf('main'), expected);
  const [commit] = git.commits.values();
  assert.deepEqual(commit.parents, []);
  assert.equal(commit.message, `Axon Fit v1.2.3\n\nKaynak: gokerlek/axon-fit@${SOURCE_COMMIT}`);
  assert.equal(git.refs.get('main').force, true);
  const trees = git.writes.filter((write) => write.kind === 'tree');
  assert.ok(trees.length >= 2, 'birden çok ağaç parçası');
  assert.equal(trees[0].base, false);
  assert.ok(trees.slice(1).every((write) => write.base), 'sonraki parçalar base_tree ile');
  assert.ok(trees.every((write) => write.bytes <= kur.TREE_CHUNK_BYTES + 1000), 'parça ~2 MB');
  assert.equal(git.writes.filter((write) => write.kind === 'blob').length, 3, 'png, latin1 (ikili) ve cok-buyuk (>1 MB) blob');
  assert.deepEqual(ctx.sleeps.filter((ms) => ms === 7000), [7000], 'retry-after kadar beklendi');
  assert.equal(ctx.sleeps.filter((ms) => ms === kur.WRITE_GAP_MS).length, git.writes.length - 1, 'yazmalar arası en az 1 sn');
});

// ---------------------------------------------------------------------------------------------
// Terminal ve tarayıcı
// ---------------------------------------------------------------------------------------------

test('tarayıcı açıcı: çıkış kodu 0 değilse başarısız; komut yoksa başarısız; beklerse açılmış sayılır', async () => {
  const fakeSpawn = (behaviour, calls = []) => (command, args) => {
    calls.push([command, ...args]);
    const child = new EventEmitter();
    child.unref = () => {
      child.unrefed = true;
    };
    setImmediate(() => behaviour(child));
    return child;
  };
  const calls = [];
  assert.equal(await kur.openWith(fakeSpawn((child) => child.emit('exit', 0), calls), 'darwin', 'https://x.test/'), true);
  assert.deepEqual(calls, [['open', 'https://x.test/']]);
  assert.equal(await kur.openWith(fakeSpawn((child) => child.emit('exit', 3)), 'linux', 'https://x.test/'), false);
  assert.equal(await kur.openWith(fakeSpawn((child) => child.emit('error', new Error('ENOENT'))), 'linux', 'https://x.test/'), false);
  assert.equal(await kur.openWith(fakeSpawn(() => {}), 'linux', 'https://x.test/', 20), true);
  assert.equal(await kur.openWith(() => { throw new Error('spawn'); }, 'linux', 'https://x.test/'), false);
  assert.equal(await kur.openWith(fakeSpawn(() => assert.fail('çalışmamalı')), 'win32', 'https://x.test/'), false);
});

test('terminal: yanıtlar okunur; giriş kapanınca (Ctrl+D) her soru iptal olur', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  output.resume();
  const io = kur.terminalIo({ input, output });
  const first = io.ask('Ad', 'x');
  input.write('salon\n');
  assert.equal(await first, 'salon');
  const second = io.ask('Ad', 'varsayilan');
  input.write('\n');
  assert.equal(await second, 'varsayilan');
  const third = io.ask('Ad');
  input.end();
  await assert.rejects(third, (error) => error instanceof kur.KurCancelled && error.reason === 'eof');
  await assert.rejects(io.confirm('Devam?'), (error) => error.reason === 'eof');
  await assert.rejects(io.askSecret('Gizli: '), (error) => error.reason === 'eof');
  await assert.rejects(io.pause('Enter'), (error) => error.reason === 'eof');
});

// ---------------------------------------------------------------------------------------------
// Yerel sunucu akışı
// ---------------------------------------------------------------------------------------------

test('yerel sunucu: state doğrulanır, kod bir kez çevrilir, adresler hep yazılır, kurulum dönüşü kullanıcı anahtarı verir', async () => {
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
  assert.equal(ctx.created.githubApp.settingsUrl, 'https://github.com/settings/apps/axon-fit-abc');
  const output = ctx.io.lines.join('\n');
  assert.match(output, /Tarayıcı açılmadıysa bu adresi aç: http:\/\/127\.0\.0\.1:\d+\//, 'açılsa da yerel adres yazılır');
  assert.match(output, /Kurulum sayfası açılmadıysa bu adresi aç: https:\/\/github\.com\/apps\/axon-fit-abc\/installations\/new/);
  assert.equal(output.includes('cs'), false);
});

test('yerel sunucu: tarayıcı açılamazsa adres yazılır; dönüş gelmezse süre dolar', async () => {
  const ctx = baseContext({ open: async () => false });
  await assert.rejects(kur.runGithubAppFlow(ctx, { appName: 'A', productionUrl: 'https://s.vercel.app', timeoutMs: 30 }), /süre doldu/);
  assert.ok(ctx.io.lines.some((line) => /Tarayıcı açılamadı\. Bu adresi aç: http:\/\/127\.0\.0\.1:\d+\//.test(line)));
});

// ---------------------------------------------------------------------------------------------
// Vercel adımları (taklit fetch)
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
  token = 'hic';
  await kur.ensureFreshVercel(ctx, vercel);
  assert.equal(vercel.session.token, 'yeni', 'süresi yetiyorsa dokunulmaz');
});

function vercelProjectContext({ failures = 0, takenByOther = false }) {
  const opened = [];
  const state = { project: null, posts: [], takenByOther };
  const ctx = baseContext({
    io: fakeIo({ answers: [['başka bir ad', 'salon-iki']] }),
    open: async (url) => {
      opened.push(url);
      return true;
    },
    fetch: async (url, init = {}) => {
      const parsed = new URL(url);
      if (parsed.hostname.endsWith('.vercel.app')) return new Response('DEPLOYMENT_NOT_FOUND', { status: 404 });
      assert.equal(parsed.searchParams.get('teamId'), 'team_1');
      const projectName = /^\/v9\/projects\/([^/]+)$/.exec(parsed.pathname);
      if (projectName) {
        if (state.project && [state.project.id, state.project.name].includes(projectName[1])) return json(200, state.project);
        if (state.takenByOther && projectName[1] === 'salon') return json(200, { id: 'prj_baska', name: 'salon', link: { type: 'github', org: 'baska', repo: 'x' } });
        return json(404, { error: { code: 'not_found' } });
      }
      if (parsed.pathname === '/v11/projects') {
        const body = JSON.parse(init.body);
        state.posts.push(body);
        assert.deepEqual(body.gitRepository, { type: 'github', repo: 'coach/axon-fit' });
        assert.equal(body.framework, 'nextjs');
        if (state.takenByOther && body.name === 'salon') return json(409, { error: { code: 'conflict', message: 'A project with this name already exists' } });
        if (failures-- > 0) return json(400, { error: { code: 'repo_not_found', message: 'Repository not found', action: 'Install GitHub App', link: 'https://github.com/apps/vercel/installations/new?state=x' } });
        state.project = { id: 'prj_1', name: body.name, link: { type: 'github', org: 'coach', repo: 'axon-fit', repoId: 9, productionBranch: 'main' } };
        return json(200, { id: 'prj_1', name: body.name });
      }
      throw new Error(`Beklenmeyen istek: ${url}`);
    },
  });
  const vercel = { session: { token: 'v', teamId: 'team_1' }, user: { username: 'coachv' }, team: { id: 'team_1', slug: 'coachv-projects' } };
  return { ctx, vercel, opened, state };
}

test('Vercel projesi repo hazır olunca gitRepository ile açılır; Vercel GitHub uygulaması repoyu göremezse kurulum sayfası', async () => {
  const { ctx, vercel, opened, state } = vercelProjectContext({ failures: 4 });
  const project = await kur.ensureVercelProject(ctx, vercel, { name: 'salon', repoFullName: 'coach/axon-fit' });
  assert.equal(project.id, 'prj_1');
  assert.equal(state.posts.length, 5);
  assert.deepEqual(opened, ['https://github.com/apps/vercel/installations/new?state=x', 'https://github.com/apps/vercel/installations/new?state=x']);
  assert.equal(ctx.io.asked.filter((question) => /Enter/.test(question)).length, 2);
  assert.ok(ctx.io.lines.some((line) => line.includes('Tarayıcı açılmadıysa bu adresi aç: https://github.com/apps/vercel/installations/new?state=x')));
  assert.equal(ctx.created.vercelProject, 'https://vercel.com/coachv-projects/salon');
});

test('Vercel projesi: ad o arada dolduysa anlaşılır mesaj ve yeni ad sorulur', async () => {
  const { ctx, vercel, state } = vercelProjectContext({ takenByOther: true });
  const project = await kur.ensureVercelProject(ctx, vercel, { name: 'salon', repoFullName: 'coach/axon-fit' });
  assert.equal(project.name, 'salon-iki');
  assert.deepEqual(state.posts.map((post) => post.name), ['salon', 'salon-iki']);
  assert.ok(ctx.io.lines.some((line) => line.includes('"salon" adı Vercel\'de artık dolu')));
});

test('env yazımı başarısızsa hata yalnız anahtar adlarını söyler, değeri değil', async () => {
  const ctx = baseContext({
    fetch: async (url, init) => {
      assert.equal(new URL(url).searchParams.get('upsert'), 'true');
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
      if (init.method === 'POST') {
        assert.equal(new URL(url).searchParams.get('skipAutoDetectionConfirmation'), '1');
        deployBody = JSON.parse(init.body);
        return json(200, { id: 'dpl_1', readyState: 'QUEUED' });
      }
      return json(200, { id: 'dpl_1', readyState: states.shift(), inspectorUrl: 'https://vercel.com/coach/salon/dpl_1' });
    },
  });
  const project = { id: 'prj_1', name: 'salon', link: { type: 'github', org: 'coach', repo: 'axon-fit', repoId: 9 } };
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

function createWorld({ envFails = false, codeRepoTaken = false, projectTaken = false, answers = [] } = {}) {
  const { privateKey, publicKey } = rsaKeys();
  const secrets = { pem: privateKey, clientSecret: 'cs_cok_gizli_deger', userToken: 'ghu_kullanici_anahtari', vercelToken: 'vercel_cli_anahtari' };
  const git = fakeGitHost();
  const archive = zlib.gzipSync(makeTar(sampleArchiveItems()));
  const state = {
    repos: new Set(codeRepoTaken ? ['axon-fit'] : []),
    project: null,
    projectTaken,
    envBody: null,
    deployBody: null,
    polls: 0,
    conversions: 0,
    gitFailures: 3,
    loggedIn: false,
    browserErrors: [],
  };
  async function fetchImpl(input, init = {}) {
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    if (url.hostname === '127.0.0.1') return realFetch(input, init);
    const auth = init.headers?.Authorization ?? '';
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    const p = url.pathname;
    if (url.hostname.endsWith('.vercel.app')) return new Response('DEPLOYMENT_NOT_FOUND', { status: 404, headers: { 'x-vercel-error': 'DEPLOYMENT_NOT_FOUND' } });
    if (url.origin === 'https://codeload.github.com') {
      assert.equal(p, '/gokerlek/axon-fit/tar.gz/v1.2.3');
      return new Response(archive, { status: 200 });
    }
    if (url.origin === 'https://github.com' && p === '/login/oauth/access_token') {
      assert.deepEqual(body, { client_id: 'Iv1.client', client_secret: secrets.clientSecret, code: 'user-code' });
      return json(200, { access_token: secrets.userToken, expires_in: 28800, refresh_token: 'ghr_x', token_type: 'bearer' });
    }
    if (url.origin === 'https://api.github.com') {
      if (method === 'GET' && p === '/repos/gokerlek/axon-fit/releases/latest') {
        assert.equal(auth, '');
        return json(200, { tag_name: 'v1.2.3' });
      }
      if (method === 'POST' && p === '/app-manifests/manifest-code/conversions') {
        state.conversions += 1;
        return json(201, { id: 4242, slug: 'axon-fit-abcdef', name: 'Axon Fit abcdef', client_id: 'Iv1.client', client_secret: secrets.clientSecret, webhook_secret: null, pem: secrets.pem, owner: { login: 'coach' } });
      }
      if (method === 'GET' && p === '/users/coach/installation') {
        const { payload } = verifyJwt(auth.slice('Bearer '.length), publicKey);
        assert.equal(payload.iss, 'Iv1.client');
        return json(200, { id: 77, repository_selection: 'all', account: { login: 'coach' } });
      }
      if (auth !== `Bearer ${secrets.userToken}`) throw new Error(`GitHub isteği kullanıcı anahtarı olmadan: ${method} ${p}`);
      if (method === 'GET' && p === '/user') return json(200, { login: 'coach', id: 1 });
      const gitCall = /^\/repos\/coach\/axon-fit(\/git\/.+)$/.exec(p);
      if (gitCall) {
        const response = git.handle(method, gitCall[1], body);
        if (response) return response;
      }
      const repo = /^\/repos\/coach\/([^/]+)$/.exec(p);
      if (method === 'GET' && repo) return state.repos.has(repo[1]) ? json(200, { private: true }) : json(404, { message: 'Not Found' });
      if (method === 'GET' && /^\/repos\/coach\/[^/]+\/branches\/main$/.test(p)) return json(200, { name: 'main' });
      if (method === 'POST' && p === '/user/repos') {
        assert.equal(body.private, true);
        assert.equal(body.auto_init, true);
        state.repos.add(body.name);
        return json(201, { id: body.name === 'axon-fit' ? 999 : 1000, private: true, default_branch: 'main' });
      }
    }
    if (url.origin === 'https://api.vercel.com') {
      assert.equal(auth, `Bearer ${secrets.vercelToken}`);
      if (p === '/v2/user') return json(200, { user: { username: 'coachv', defaultTeamId: 'team_1' } });
      if (p === '/v2/teams') return json(200, { teams: [{ id: 'team_1', slug: 'coachv-projects', name: 'coachv' }] });
      assert.equal(url.searchParams.get('teamId'), 'team_1', `${method} ${p} teamId`);
      const projectPath = /^\/v9\/projects\/([^/]+)$/.exec(p);
      if (method === 'GET' && projectPath) {
        if (state.project && [state.project.id, state.project.name].includes(projectPath[1])) return json(200, state.project);
        if (state.projectTaken && state.posted && projectPath[1] === 'salonum') return json(200, { id: 'prj_x', name: 'salonum', link: { type: 'github', org: 'baska', repo: 'x' } });
        return json(404, { error: { code: 'not_found', message: 'Project not found' } });
      }
      if (method === 'POST' && p === '/v11/projects') {
        state.posted = true;
        if (state.projectTaken && body.name === 'salonum') return json(409, { error: { code: 'conflict', message: 'Project already exists' } });
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
        return json(200, { id: 'dpl_1', readyState: ready ? 'READY' : 'BUILDING', alias: ready ? [`${state.project.name}.vercel.app`] : [], aliasAssigned: ready });
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
    io: fakeIo({ answers: [['Uygulamanın adı', 'Salonum'], ...answers] }),
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
  return { ctx, state, secrets, opened, git };
}

function assertNoSecrets(world, extra = []) {
  const output = [...world.ctx.io.lines, ...world.ctx.io.asked, ...world.opened].join('\n');
  const pemBody = world.secrets.pem.split('\n')[1];
  for (const secret of [pemBody, world.secrets.clientSecret, world.secrets.userToken, world.secrets.vercelToken, ...extra]) {
    assert.equal(output.includes(secret), false, `sır çıktıda: ${secret.slice(0, 12)}…`);
  }
}

test('uçtan uca: 8 adım; kod tek commit olarak yüklenir; env ve yayın doğru; sırlar hiçbir çıktıda yok', async () => {
  const world = createWorld();
  const result = await kur.kur(world.ctx);
  assert.deepEqual(world.state.browserErrors, []);
  assert.equal(result.siteUrl, 'https://salonum.vercel.app');
  assert.equal(world.state.conversions, 1);

  assertTreeEquals(world.git.filesOf('main'), EXPECTED_FILES);
  assert.deepEqual([...world.git.commits.values()][0].parents, []);
  assert.equal(world.git.refs.get('main').force, true);

  const env = Object.fromEntries(world.state.envBody.map((item) => [item.key, item]));
  assert.equal(env.GITHUB_OWNER.value, 'coach');
  assert.equal(env.APP_REPO.value, 'axon-fit-data');
  assert.equal(env.AXON_CODE_REPO.value, 'coach/axon-fit');
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

  assert.equal(world.opened[0].startsWith('http://127.0.0.1:'), true);
  assert.ok(world.opened.includes('https://github.com/apps/vercel/installations/new'));
  assert.equal(world.opened.at(-1), 'https://salonum.vercel.app/login');
  const output = world.ctx.io.lines.join('\n');
  for (let n = 1; n <= kur.STEP_COUNT; n += 1) assert.match(output, new RegExp(`\\[${n}/${kur.STEP_COUNT}\\]`));
  assert.match(output, /kaynak gokerlek\/axon-fit v1\.2\.3 \(10 dosya/);
  for (const url of world.opened) assert.ok(output.includes(`bu adresi aç: ${url}`), `adres yazılmadı: ${url}`);
  assert.match(output, /Adresin: https:\/\/salonum\.vercel\.app/);
  assert.match(output, /Tarayıcıda açıldı: GitHub ile giriş yap\./);
  assert.match(output, /GitHub uygulamanın ayarları: https:\/\/github\.com\/settings\/apps\/axon-fit-abcdef/);
  assert.doesNotMatch(output, /Callback URL/, 'adres değişmediyse uyarı yok');
  assertNoSecrets(world, [env.AUTH_SECRET.value]);
});

test('uçtan uca: Vercel adı o arada dolarsa yeni ad sorulur ve GitHub callback adresi için uyarı verilir', async () => {
  const world = createWorld({ projectTaken: true, answers: [['Uygulama için başka bir ad', 'salonum2']] });
  const result = await kur.kur(world.ctx);
  assert.equal(result.siteUrl, 'https://salonum2.vercel.app');
  const output = world.ctx.io.lines.join('\n');
  assert.match(output, /"salonum" adı Vercel'de artık dolu/);
  assert.match(output, /Adresin GitHub uygulamasına yazılandan farklı: https:\/\/salonum2\.vercel\.app/);
  assert.match(output, /https:\/\/salonum2\.vercel\.app\/api\/auth\/github\/callback/);
  assert.equal(world.opened.at(-1), 'https://salonum2.vercel.app/login');
});

test('uçtan uca hata: kod 1 döner, ne yapılacağı ve o ana kadar oluşturulanlar yazılır, sır yazılmaz', async () => {
  const world = createWorld({ envFails: true });
  const code = await kur.main(world.ctx);
  assert.equal(code, 1);
  const output = world.ctx.io.lines.join('\n');
  assert.match(output, /Kurulum tamamlanamadı: Bazı ayarlar Vercel'e yazılamadı: GITHUB_APP_PRIVATE_KEY \(env_conflict\)/);
  assert.match(output, /Ne yapmalı: Vercel projesinin Settings/);
  assert.match(output, /GitHub uygulaması "Axon Fit abcdef": https:\/\/github\.com\/settings\/apps\/axon-fit-abcdef/);
  assert.match(output, /Kod reposu: https:\/\/github\.com\/coach\/axon-fit/);
  assert.match(output, /Veri reposu: https:\/\/github\.com\/coach\/axon-fit-data/);
  assert.match(output, /Vercel projesi: https:\/\/vercel\.com\/coachv-projects\/salonum/);
  assert.equal(world.state.deployBody, null, 'env yazılamadıysa yayın başlamaz');
  assertNoSecrets(world);
});

test('uçtan uca: giriş kapanırsa (Ctrl+D) iptal; çıkış kodu 1 ve oluşturulanlar listelenir', async () => {
  const world = createWorld({
    codeRepoTaken: true,
    answers: [['Kod reposu için başka bir ad', () => { throw new kur.KurCancelled('eof'); }]],
  });
  const code = await kur.main(world.ctx);
  assert.equal(code, 1);
  const output = world.ctx.io.lines.join('\n');
  assert.match(output, /Kurulum durduruldu: terminal girişi kapandı \(Ctrl\+D\)\./);
  assert.match(output, /Şu ana kadar oluşturulanlar/);
  assert.match(output, /GitHub uygulaması "Axon Fit abcdef"/);
  assertNoSecrets(world);
});

test('betik `node --input-type=module -e` ile yüklenir; AXON_KUR_TEST=1 iken ana akış başlamaz', () => {
  const source = readFileSync(SOURCE_PATH, 'utf8');
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
    env: { ...process.env, AXON_KUR_TEST: '1' },
    encoding: 'utf8',
    timeout: 20_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});
