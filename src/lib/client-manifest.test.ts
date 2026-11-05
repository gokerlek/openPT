import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { clientIdParam, clientManifest, clientManifestHref } from './client-manifest.ts';

describe('danışan manifest’i danışanı tanır', () => {
  test('kimlik yalnız geçerliyse alınır; değilse yok sayılır', () => {
    assert.equal(clientIdParam('c_abc123'), 'c_abc123');
    for (const bad of [null, undefined, '', 'C_ABC123', 'c_ab', 'c_abc123&x=1', '../c_abc123', 'c_abc123 ']) {
      assert.equal(clientIdParam(bad), null, String(bad));
    }
  });

  test('sayfanın bağlayacağı adres: kimlik varsa ?c= ile, yoksa yalın', () => {
    assert.equal(clientManifestHref('c_abc123'), '/manifest.webmanifest?c=c_abc123');
    assert.equal(clientManifestHref(null), '/manifest.webmanifest');
    assert.equal(clientManifestHref(undefined), '/manifest.webmanifest');
    // Geçersiz kimlik adrese hiç girmez.
    assert.equal(clientManifestHref('<script>'), '/manifest.webmanifest');
  });

  test('kimlik (id) her durumda "/": eski yüklemeler aynı uygulama sayılır', () => {
    assert.equal(clientManifest({ appName: 'openPT', clientId: 'c_abc123' }).id, '/');
    assert.equal(clientManifest({ appName: 'openPT', clientId: null }).id, '/');
  });

  test('başlangıç: kimlik varsa kimlikli giriş (oturum varsa oradan programa), yoksa /me', () => {
    assert.equal(clientManifest({ appName: 'openPT', clientId: 'c_abc123' }).start_url, '/giris?c=c_abc123');
    assert.equal(clientManifest({ appName: 'openPT', clientId: null }).start_url, '/me');
  });

  test('ad, kapsam ve simgeler kimlikten bağımsız; başka kişisel veri yok', () => {
    const withId = clientManifest({ appName: 'openPT', clientId: 'c_abc123' });
    const withoutId = clientManifest({ appName: 'openPT', clientId: null });
    assert.deepEqual({ ...withId, start_url: undefined }, { ...withoutId, start_url: undefined });
    assert.equal(withId.name, 'openPT');
    assert.equal(withId.short_name, 'openPT');
    assert.equal(withId.scope, '/');
    assert.equal(withId.display, 'standalone');
    assert.equal(JSON.stringify(withId).split('c_abc123').length - 1, 1);
  });
});
