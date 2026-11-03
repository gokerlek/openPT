import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { CLIENT_TABS, clientTabIndex, hasProgressTabs, PROGRESS_SECTIONS, progressSectionIndex, tabDirection } from './client-tabs.ts';

describe("clientTabIndex: dock'un etkin sekmesi", () => {
  test("sıra dock'taki sırayla aynı: Bugün · Program · İlerleme · Sağlık", () => {
    assert.deepEqual(CLIENT_TABS.map(({ label }) => label), ['Bugün', 'Program', 'İlerleme', 'Sağlık']);
    assert.equal(clientTabIndex('/me'), 0);
    assert.equal(clientTabIndex('/me/programlar'), 1);
    assert.equal(clientTabIndex('/me/ilerleme'), 2);
    assert.equal(clientTabIndex('/me/saglik'), 3);
  });

  test('Geçmiş İlerleme sekmesinin içinde; öteki sekmeler alt sayfalarında da etkin', () => {
    assert.equal(clientTabIndex('/me/gecmis'), 2);
    assert.equal(clientTabIndex('/me/gecmis/s_k2m9x4qa'), 2);
    assert.equal(clientTabIndex('/me/ilerleme/rekorlar'), 2);
    assert.equal(clientTabIndex('/me/programlar/op_k2m9x4qa/duzenle'), 1);
    assert.equal(clientTabIndex('/me/olcum'), 3);
    assert.equal(clientTabIndex('/me/ayarlar'), -1);
    assert.equal(clientTabIndex('/me/antrenman'), -1);
  });

  test('sondaki eğik çizgi yok sayılır; benzer önekli adres sekme sayılmaz', () => {
    assert.equal(clientTabIndex('/me/'), 0);
    assert.equal(clientTabIndex('/me/gecmis/'), 2);
    assert.equal(clientTabIndex('/me/gecmisler'), -1);
    assert.equal(clientTabIndex('/meler'), -1);
    assert.equal(clientTabIndex('/dashboard'), -1);
  });
});

describe('progressSectionIndex: İlerleme şeridinin etkin bölümü', () => {
  test('sıra şeritteki sırayla aynı: Özet · Geçmiş · Rekorlar', () => {
    assert.deepEqual(PROGRESS_SECTIONS.map(({ label }) => label), ['Özet', 'Geçmiş', 'Rekorlar']);
    assert.equal(progressSectionIndex('/me/ilerleme'), 0);
    assert.equal(progressSectionIndex('/me/gecmis'), 1);
    assert.equal(progressSectionIndex('/me/ilerleme/rekorlar'), 2);
  });

  test('Özet yalnız tam eşleşmede; Geçmiş ve Rekorlar alt sayfalarında da', () => {
    assert.equal(progressSectionIndex('/me/ilerleme/'), 0);
    assert.equal(progressSectionIndex('/me/ilerleme/baska'), -1);
    assert.equal(progressSectionIndex('/me/gecmis/abc'), 1);
    assert.equal(progressSectionIndex('/me/gecmis/abc/'), 1);
    assert.equal(progressSectionIndex('/me/ilerleme/rekorlar/'), 2);
    assert.equal(progressSectionIndex('/me/ilerleme/rekorlar/abc'), 2);
  });

  test('benzer önekli adres ve bölüm dışı sayfa: -1', () => {
    assert.equal(progressSectionIndex('/me/ilerleme/rekorlarX'), -1);
    assert.equal(progressSectionIndex('/me/gecmisler'), -1);
    assert.equal(progressSectionIndex('/me/ilerlemeler'), -1);
    assert.equal(progressSectionIndex('/me'), -1);
    assert.equal(progressSectionIndex('/me/saglik'), -1);
  });
});

describe('hasProgressTabs: başında İlerleme şeridi olan sayfa', () => {
  test('yalnız üç bölümün kendi sayfası; sondaki eğik çizgi yok sayılır', () => {
    assert.equal(hasProgressTabs('/me/ilerleme'), true);
    assert.equal(hasProgressTabs('/me/ilerleme/'), true);
    assert.equal(hasProgressTabs('/me/gecmis'), true);
    assert.equal(hasProgressTabs('/me/ilerleme/rekorlar'), true);
  });

  test('antrenmanın detayında ve öteki sekmelerde şerit yok', () => {
    assert.equal(hasProgressTabs('/me/gecmis/abc'), false);
    assert.equal(hasProgressTabs('/me/gecmisler'), false);
    assert.equal(hasProgressTabs('/me'), false);
    assert.equal(hasProgressTabs('/me/saglik'), false);
  });
});

describe('tabDirection: sekme değişiminde içeriğin geldiği yön', () => {
  test('sağdaki sekmeye geçince sağdan, soldakine geçince soldan', () => {
    assert.equal(tabDirection(0, 1), 1);
    assert.equal(tabDirection(0, 2), 1);
    assert.equal(tabDirection(2, 0), -1);
    assert.equal(tabDirection(1, 0), -1);
  });

  test('ilk çizim, aynı sekme ve sekme dışı sayfa: kayma yok', () => {
    assert.equal(tabDirection(null, 1), 0);
    assert.equal(tabDirection(1, 1), 0);
    assert.equal(tabDirection(-1, 2), 0);
    assert.equal(tabDirection(0, -1), 0);
  });
});
