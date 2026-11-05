import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OFFLINE_CACHE, OFFLINE_REFRESH_MESSAGE } from './offline-cache.ts';
import { offlineHtml } from './offline-page.ts';

describe('/offline sayfası', () => {
  test('kendi başına çalışan tek HTML: dış stil ya da betik dosyası yok', () => {
    const html = offlineHtml({ appName: 'openPT', accent: '#c4f000' });
    assert.match(html, /^<!doctype html>/);
    assert.match(html, /<html lang="tr">/);
    assert.match(html, /<title>Bağlantı yok · openPT<\/title>/);
    assert.match(html, /Yeniden dene/);
    assert.doesNotMatch(html, /<link[^>]+stylesheet/);
    assert.doesNotMatch(html, /<script[^>]+src=/);
  });

  test('uygulama adı kaçışlanır; renk yalnız #RRGGBB ise kullanılır', () => {
    const html = offlineHtml({ appName: '<b>"Fit" & Co</b>', accent: 'red;}</style><script>' });
    assert.match(html, /&lt;b&gt;&quot;Fit&quot; &amp; Co&lt;\/b&gt;/);
    assert.doesNotMatch(html, /<b>/);
    assert.doesNotMatch(html, /red;\}/);
    assert.match(offlineHtml({ appName: 'A', accent: null }), /--accent: #c4f000/);
    assert.match(offlineHtml({ appName: 'A', accent: '#123ABC' }), /--accent: #123ABC/);
  });

  test('danışanı rahatlatır: antrenmandaki setler telefonda durur, bağlantı gelince gönderilir', () => {
    const html = offlineHtml({ appName: 'openPT', accent: null });
    assert.match(html, /setler telefonda durur, bağlantı gelince gönderilir/);
    assert.match(html, /Yeniden dene/);
  });
});

describe('service worker /offline önbelleğini tazeler', () => {
  const worker = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');

  test('önbellek adı ve tazeleme mesajı kayıt bileşeniyle aynı', () => {
    assert.ok(worker.includes(`const CACHE = '${OFFLINE_CACHE}';`), 'sw.js önbellek adı');
    assert.ok(worker.includes(`'${OFFLINE_REFRESH_MESSAGE}'`), 'sw.js tazeleme mesajını dinlemiyor');
    assert.notEqual(OFFLINE_CACHE, 'axon-offline-v1', 'metin değişti: eski önbellek silinsin');
  });

  test('mesaj gelince /offline yeniden alınır; bozuk ya da yönlenmiş yanıt eskisinin yerine geçmez', () => {
    assert.match(worker, /addEventListener\('message'/);
    assert.match(worker, /response\.ok && !response\.redirected/);
  });
});
