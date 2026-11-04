import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { githubAccessFrom } from './access.ts';

const { privateKey: pem } = generateKeyPairSync('rsa', {
  modulusLength: 1024,
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

describe('GitHub erişim modu (tek yerde seçilir)', () => {
  test('bugünkü kurulumlar: yalnız GITHUB_TOKEN varsa kişisel anahtar modu, değer olduğu gibi', () => {
    assert.deepEqual(githubAccessFrom({ GITHUB_TOKEN: 'ghp_test' }), { mode: 'token', token: 'ghp_test' });
  });

  test('GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY varsa uygulama modu; GITHUB_TOKEN da olsa uygulama seçilir', () => {
    const escaped = pem.trimEnd().replace(/\n/g, '\\n');
    assert.deepEqual(githubAccessFrom({ GITHUB_APP_ID: ' 12345 ', GITHUB_APP_PRIVATE_KEY: escaped, GITHUB_TOKEN: 'ghp_old' }), {
      mode: 'app',
      appId: '12345',
      privateKey: pem,
      installationId: null,
    });
    assert.equal(githubAccessFrom({ GITHUB_APP_ID: '1', GITHUB_APP_PRIVATE_KEY: pem, GITHUB_APP_INSTALLATION_ID: '987' }).mode, 'app');
    const access = githubAccessFrom({ GITHUB_APP_ID: '1', GITHUB_APP_PRIVATE_KEY: pem, GITHUB_APP_INSTALLATION_ID: '987' });
    assert.equal(access.mode === 'app' && access.installationId, 987);
  });

  test('ikisi de yoksa iki yolu da adıyla söyleyen açık hata', () => {
    assert.throws(() => githubAccessFrom({}), /GITHUB_APP_ID.*GITHUB_APP_PRIVATE_KEY.*GITHUB_TOKEN/);
    assert.throws(() => githubAccessFrom({ GITHUB_TOKEN: '' }), /GITHUB_TOKEN/);
  });

  test('yarım ya da bozuk uygulama ayarı sessizce kişisel anahtara düşmez', () => {
    assert.throws(() => githubAccessFrom({ GITHUB_APP_ID: '1', GITHUB_TOKEN: 'ghp_test' }), /birlikte/);
    assert.throws(() => githubAccessFrom({ GITHUB_APP_PRIVATE_KEY: pem, GITHUB_TOKEN: 'ghp_test' }), /birlikte/);
    assert.throws(() => githubAccessFrom({ GITHUB_APP_ID: 'abc', GITHUB_APP_PRIVATE_KEY: pem }), /GITHUB_APP_ID/);
    assert.throws(() => githubAccessFrom({ GITHUB_APP_ID: '1', GITHUB_APP_PRIVATE_KEY: 'not-a-key' }), /PEM/);
    assert.throws(() => githubAccessFrom({ GITHUB_APP_ID: '1', GITHUB_APP_PRIVATE_KEY: pem, GITHUB_APP_INSTALLATION_ID: '12a' }), /GITHUB_APP_INSTALLATION_ID/);
  });
});
