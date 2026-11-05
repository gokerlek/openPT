import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ATTACHMENT_LIBRARY } from './attachment-library.ts';
import { ATTACHMENT_LIBRARY_EN } from './attachment-library.en.ts';
import { DEVICE_LIBRARY } from './device-library.ts';
import { DEVICE_LIBRARY_EN } from './device-library.en.ts';
import { EXERCISE_LIBRARY } from './exercise-library.ts';
import { EXERCISE_LIBRARY_EN } from './exercise-library.en.ts';

/** Türkçe'ye özgü harfler: İngilizce metinde bulunmaması, çevrilmemiş ya da yarım kalmış bir satırın işareti. */
const TURKISH_LETTERS = /[çğıİşöüÇĞŞÖÜ]/;

/** Bir metin alanının dolu olduğunu ve Türkçe harf içermediğini denetler. */
function assertEnglish(text: unknown, where: string): void {
  assert.equal(typeof text, 'string', `${where}: metin değil`);
  const value = text as string;
  assert.ok(value.trim().length > 0, `${where}: boş`);
  assert.equal(value, value.trim(), `${where}: baş ya da sonda boşluk var`);
  assert.ok(!TURKISH_LETTERS.test(value), `${where}: Türkçe harf içeriyor → ${value}`);
}

/** Her iki tablonun anahtarları aynı küme olmalı: eksik çeviri de, kaynağı olmayan fazla kayıt da hata. */
function assertSameIds(source: readonly { id: string }[], english: Readonly<Record<string, unknown>>, label: string): void {
  const sourceIds = source.map((item) => item.id);
  assert.equal(new Set(sourceIds).size, sourceIds.length, `${label}: kaynakta yinelenen kimlik var`);
  const missing = sourceIds.filter((id) => !(id in english));
  assert.deepEqual(missing, [], `${label}: İngilizcesi olmayan kimlikler`);
  const known = new Set(sourceIds);
  const extra = Object.keys(english).filter((id) => !known.has(id));
  assert.deepEqual(extra, [], `${label}: kaynakta olmayan fazla kimlikler`);
}

describe('egzersiz kütüphanesi İngilizce', () => {
  test('her egzersizin İngilizcesi var, fazla kimlik yok', () => {
    assertSameIds(EXERCISE_LIBRARY, EXERCISE_LIBRARY_EN, 'egzersiz');
  });

  test('açıklama ve ipuçları Türkçe kaynakla aynı varlıkta, ipucu sayıları eşit', () => {
    for (const exercise of EXERCISE_LIBRARY) {
      const en = EXERCISE_LIBRARY_EN[exercise.id];
      assert.ok(en, `${exercise.id}: İngilizcesi yok`);
      assert.equal(en.description !== undefined, exercise.description !== undefined, `${exercise.id}: description varlığı farklı`);
      assert.equal(en.cues !== undefined, exercise.cues !== undefined, `${exercise.id}: cues varlığı farklı`);
      assert.equal(en.cues?.length, exercise.cues?.length, `${exercise.id}: ipucu sayısı farklı`);
    }
  });

  test('hiçbir alan boş değil ve Türkçe harf içermiyor', () => {
    for (const [id, en] of Object.entries(EXERCISE_LIBRARY_EN)) {
      assertEnglish(en.title, `${id}.title`);
      if (en.description !== undefined) assertEnglish(en.description, `${id}.description`);
      en.cues?.forEach((cue, index) => assertEnglish(cue, `${id}.cues[${index}]`));
    }
  });

  test('metinler egzersiz şemasının uzunluk sınırlarına sığıyor', () => {
    for (const [id, en] of Object.entries(EXERCISE_LIBRARY_EN)) {
      assert.ok(en.title.length >= 2 && en.title.length <= 60, `${id}.title ${en.title.length} karakter`);
      assert.ok((en.description?.length ?? 0) <= 400, `${id}.description ${en.description?.length} karakter`);
      assert.ok((en.cues?.length ?? 0) <= 6, `${id}: ipucu sayısı fazla`);
      en.cues?.forEach((cue, index) => assert.ok(cue.length <= 120, `${id}.cues[${index}] ${cue.length} karakter`));
    }
  });

  test('ondalık ayracı nokta: sayılarda virgül kalmamış', () => {
    for (const [id, en] of Object.entries(EXERCISE_LIBRARY_EN)) {
      for (const text of [en.title, en.description ?? '', ...(en.cues ?? [])]) {
        assert.ok(!/\d,\d/.test(text), `${id}: virgüllü ondalık → ${text}`);
      }
    }
  });
});

describe('cihaz kataloğu İngilizce', () => {
  test('her cihazın İngilizcesi var, fazla kimlik yok', () => {
    assertSameIds(DEVICE_LIBRARY, DEVICE_LIBRARY_EN, 'cihaz');
  });

  test('not yalnız Türkçe kaynakta notu olan cihazda var', () => {
    for (const device of DEVICE_LIBRARY) {
      const en = DEVICE_LIBRARY_EN[device.id];
      assert.ok(en, `${device.id}: İngilizcesi yok`);
      assert.equal(en.notes !== undefined, device.notes !== undefined, `${device.id}: notes varlığı farklı`);
    }
  });

  test('hiçbir alan boş değil, Türkçe harf içermiyor, uzunluk sınırına sığıyor', () => {
    for (const [id, en] of Object.entries(DEVICE_LIBRARY_EN)) {
      assertEnglish(en.name, `${id}.name`);
      assert.ok(en.name.length >= 2 && en.name.length <= 60, `${id}.name ${en.name.length} karakter`);
      if (en.notes !== undefined) {
        assertEnglish(en.notes, `${id}.notes`);
        assert.ok(en.notes.length <= 300, `${id}.notes ${en.notes.length} karakter`);
        assert.ok(!/\d,\d/.test(en.notes), `${id}.notes: virgüllü ondalık → ${en.notes}`);
      }
    }
  });
});

describe('aparat havuzu İngilizce', () => {
  test('her aparatın İngilizcesi var, fazla kimlik yok', () => {
    assertSameIds(ATTACHMENT_LIBRARY, ATTACHMENT_LIBRARY_EN, 'aparat');
  });

  test('hiçbir ad boş değil ve Türkçe harf içermiyor', () => {
    for (const [id, en] of Object.entries(ATTACHMENT_LIBRARY_EN)) assertEnglish(en.name, `${id}.name`);
  });
});
