import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { HOME_SCREEN_LABEL_MAX, panelManifest, panelShortName } from './panel-manifest.ts';

describe('panel simgesi danışan simgesinden ayırt edilir', () => {
  test('kısa ad sığıyorsa "<ad> Panel"', () => {
    assert.equal(HOME_SCREEN_LABEL_MAX, 12);
    assert.equal(panelShortName('openPT'), 'openPT Panel');
    assert.equal(panelShortName('Fit'), 'Fit Panel');
    assert.equal(panelShortName('  Güçlü  '), 'Güçlü Panel');
  });

  test('sığmıyorsa ilk kelime + Panel; o da sığmıyorsa ilk kelime kısaltılır', () => {
    assert.equal(panelShortName('openPT Studio'), 'openPT Panel');
    assert.equal(panelShortName('Güçlü Adım Kulübü'), 'Güçlü Panel');
    assert.equal(panelShortName('PulseCoach'), 'Pulse… Panel');
    for (const name of ['openPT', 'openPT Studio', 'PulseCoach', 'Çağdaş Spor Merkezi', 'Ş']) {
      const label = panelShortName(name);
      assert.ok(Array.from(label).length <= HOME_SCREEN_LABEL_MAX, label);
      assert.ok(label.endsWith(' Panel'), label);
    }
  });

  test('manifest: tam ad, ayırt edici kısa ad, panel kimliği ve açılışı', () => {
    const manifest = panelManifest({ appName: 'openPT Studio' });
    assert.equal(manifest.id, '/dashboard');
    assert.equal(manifest.start_url, '/dashboard');
    assert.equal(manifest.name, 'openPT Studio Panel');
    assert.equal(manifest.short_name, 'openPT Panel');
    assert.equal(manifest.scope, '/');
  });
});
