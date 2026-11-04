import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { offlineHtml } from './offline-page.ts';

describe('/offline sayfası', () => {
  test('kendi başına çalışan tek HTML: dış stil ya da betik dosyası yok', () => {
    const html = offlineHtml({ appName: 'Axon Fit', accent: '#c4f000' });
    assert.match(html, /^<!doctype html>/);
    assert.match(html, /<html lang="tr">/);
    assert.match(html, /<title>Bağlantı yok · Axon Fit<\/title>/);
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
});
