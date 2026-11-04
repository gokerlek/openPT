import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateKey, generateKeyPairSync } from 'node:crypto';
import { escapePrivateKey, isPrivateKey, normalizePrivateKey } from './private-key.ts';

const { privateKey: pem } = generateKeyPairSync('rsa', {
  modulusLength: 1024,
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

describe('GitHub uygulamasının özel anahtarı (PEM)', () => {
  test('olduğu gibi gelen PEM aynı kalır ve Node onu anahtar olarak okur', () => {
    assert.equal(normalizePrivateKey(pem), pem);
    assert.doesNotThrow(() => createPrivateKey(normalizePrivateKey(pem)));
  });

  test('Vercel / .env biçimleri düzelir: \\n kaçışı, CRLF, tırnak, tek satıra yapışmış gövde', () => {
    const escaped = pem.trimEnd().replace(/\n/g, '\\n');
    assert.equal(normalizePrivateKey(escaped), pem);
    assert.equal(normalizePrivateKey(`"${escaped}"`), pem);
    assert.equal(normalizePrivateKey(pem.replace(/\n/g, '\r\n')), pem);
    assert.equal(normalizePrivateKey(pem.replace(/\n/g, ' ')), pem);
    assert.equal(normalizePrivateKey(`  \n${pem}\n\n`), pem);
  });

  test('PKCS#8 başlığı ("PRIVATE KEY") da kabul edilir', () => {
    const pkcs8 = createPrivateKey(pem).export({ type: 'pkcs8', format: 'pem' }).toString();
    assert.equal(normalizePrivateKey(pkcs8.replace(/\n/g, '\\n')), pkcs8);
  });

  test('PEM olmayan ya da yarım değer reddedilir; hata mesajı değeri tekrarlamaz', () => {
    for (const value of ['', 'ghp_token', '-----BEGIN RSA PRIVATE KEY-----\nabc', '-----BEGIN RSA PRIVATE KEY-----\n-----END RSA PRIVATE KEY-----', '-----BEGIN RSA PRIVATE KEY-----\nab$c\n-----END RSA PRIVATE KEY-----', '-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----']) {
      assert.throws(() => normalizePrivateKey(value), (error: Error) => !error.message.includes('ab$c') && /PEM/.test(error.message));
      assert.equal(isPrivateKey(value), false);
    }
    assert.equal(isPrivateKey(pem), true);
  });

  test('.env satırı için tek satır: yalnız \\n kaçışı, satır sonu ya da = sonrası enjeksiyon yok', () => {
    const line = escapePrivateKey(pem);
    assert.ok(!line.includes('\n'));
    assert.match(line, /^-----BEGIN RSA PRIVATE KEY-----\\n[A-Za-z0-9+/=\\n]+\\n-----END RSA PRIVATE KEY-----$/);
    assert.equal(normalizePrivateKey(line), pem);
  });
});
