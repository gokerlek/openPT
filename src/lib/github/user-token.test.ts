import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { openUserToken, refreshUserToken, sealUserToken, userTokenCookieMaxAge, userTokenFromGrant, userTokenStep, type UserToken } from './user-token.ts';

const SECRET = 'a'.repeat(64);
const NOW = new Date('2026-11-05T10:00:00.000Z');
const HOUR = 3600_000;
const token: UserToken = {
  login: 'coach',
  accessToken: 'ghu_test',
  expiresAt: NOW.getTime() + 8 * HOUR,
  refreshToken: 'ghr_test',
  refreshExpiresAt: NOW.getTime() + 180 * 24 * HOUR,
};
const grant = { access_token: 'ghu_test', expires_in: 28800, refresh_token: 'ghr_test', refresh_token_expires_in: 15552000, token_type: 'bearer', scope: '' };

describe('GitHub kullanıcı anahtarının çerezi', () => {
  test('GitHub yanıtı süreleriyle saklanır; süresiz anahtar (yenileme kapalı) da kabul edilir', () => {
    assert.deepEqual(userTokenFromGrant(grant, 'coach', NOW), token);
    assert.deepEqual(userTokenFromGrant({ access_token: 'ghu_x', token_type: 'bearer', scope: '' }, 'coach', NOW), {
      login: 'coach', accessToken: 'ghu_x', expiresAt: null, refreshToken: null, refreshExpiresAt: null,
    });
    for (const broken of [null, {}, { error: 'bad_verification_code' }, { access_token: 'a b' }, { ...grant, expires_in: -1 }]) {
      assert.equal(userTokenFromGrant(broken, 'coach', NOW), null);
    }
  });

  test('AES-256-GCM: açılınca aynı; her mühür farklı; düz metinde anahtar görünmez', () => {
    const sealed = sealUserToken(token, SECRET);
    assert.deepEqual(openUserToken(sealed, SECRET), token);
    assert.notEqual(sealUserToken(token, SECRET), sealed);
    assert.ok(!sealed.includes('ghu_') && !sealed.includes('ghr_') && !sealed.includes('coach'));
    assert.match(sealed, /^v1\.[A-Za-z0-9_-]+$/);
  });

  test('kurcalanmış, başka sırla mühürlenmiş ya da bozuk çerez açılmaz (null, hata değil)', () => {
    const sealed = sealUserToken(token, SECRET);
    const body = Buffer.from(sealed.slice(3), 'base64url');
    body[body.length - 20]! ^= 1;
    assert.equal(openUserToken(`v1.${body.toString('base64url')}`, SECRET), null);
    assert.equal(openUserToken(sealed, 'b'.repeat(64)), null);
    for (const value of ['', 'v1.', 'v2.' + sealed.slice(3), 'v1.@@@', sealed.slice(0, 20), undefined]) assert.equal(openUserToken(value, SECRET), null);
  });

  test('yenileme kararı: 5 dk payla kullan; süresi geçtiyse yenile; yenileme anahtarı da bittiyse yeniden giriş', () => {
    assert.equal(userTokenStep(token, NOW), 'use');
    assert.equal(userTokenStep({ ...token, expiresAt: null }, NOW), 'use');
    assert.equal(userTokenStep({ ...token, expiresAt: NOW.getTime() + 4 * 60_000 }, NOW), 'refresh');
    assert.equal(userTokenStep({ ...token, expiresAt: NOW.getTime() - HOUR }, NOW), 'refresh');
    assert.equal(userTokenStep({ ...token, expiresAt: NOW.getTime() - HOUR, refreshExpiresAt: NOW.getTime() - 1 }, NOW), 'login');
    assert.equal(userTokenStep({ ...token, expiresAt: NOW.getTime() - HOUR, refreshToken: null, refreshExpiresAt: null }, NOW), 'login');
  });

  test('çerez ömrü PT oturumunu (30 gün) aşmaz; yenilenemeyen anahtarda anahtarın süresi kadar', () => {
    assert.equal(userTokenCookieMaxAge(token, NOW), 30 * 24 * 3600);
    assert.equal(userTokenCookieMaxAge({ ...token, refreshToken: null, refreshExpiresAt: null }, NOW), 8 * 3600);
    assert.equal(userTokenCookieMaxAge({ ...token, refreshExpiresAt: NOW.getTime() + HOUR }, NOW), 3600);
    assert.equal(userTokenCookieMaxAge({ ...token, expiresAt: null, refreshToken: null, refreshExpiresAt: null }, NOW), 30 * 24 * 3600);
  });

  test('yenileme: uygulamanın kimliğiyle refresh_token isteği; yeni çift döner, hatada null ve sır sızmaz', async () => {
    const requests: Record<string, string>[] = [];
    const fake: typeof fetch = async (input, init) => {
      assert.equal(String(input), 'https://github.com/login/oauth/access_token');
      assert.equal(new Headers(init?.headers).get('Accept'), 'application/json');
      requests.push(JSON.parse(String(init?.body)));
      return Response.json({ ...grant, access_token: 'ghu_new', refresh_token: 'ghr_new' });
    };
    const later = new Date(NOW.getTime() + 9 * HOUR);
    const refreshed = await refreshUserToken(token, { clientId: 'Iv23', clientSecret: 'test-secret' }, later, fake);
    assert.deepEqual(requests, [{ client_id: 'Iv23', client_secret: 'test-secret', grant_type: 'refresh_token', refresh_token: 'ghr_test' }]);
    assert.equal(refreshed?.accessToken, 'ghu_new');
    assert.equal(refreshed?.refreshToken, 'ghr_new');
    assert.equal(refreshed?.login, 'coach');
    assert.equal(refreshed?.expiresAt, later.getTime() + 8 * HOUR);
    assert.equal(await refreshUserToken(token, { clientId: 'Iv23', clientSecret: 's' }, later, async () => Response.json({ error: 'bad_refresh_token' })), null);
    assert.equal(await refreshUserToken(token, { clientId: 'Iv23', clientSecret: 's' }, later, async () => new Response('x', { status: 500 })), null);
    assert.equal(await refreshUserToken(token, { clientId: 'Iv23', clientSecret: 's' }, later, async () => { throw new Error('ağ'); }), null);
    assert.equal(await refreshUserToken({ ...token, refreshToken: null }, { clientId: 'Iv23', clientSecret: 's' }, later, fake), null);
  });
});
