import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderLibraryTitles } from '../../scripts/generate-library-titles.ts';
import { EXERCISE_LIBRARY } from './exercise-library.ts';
import { EXERCISE_LIBRARY_EN } from './exercise-library.en.ts';
import { LIBRARY_TITLES } from './library-titles.ts';
import { localizedLibraryTitle } from './library-text.ts';

/** Adlar tablosu üretilmiş dosya: kütüphane ya da İngilizce tablo değişince yeniden üretilmeli. */
describe('hazır egzersiz adları tablosu', () => {
  test('üretilmiş dosya güncel (node --experimental-strip-types scripts/generate-library-titles.ts)', () => {
    assert.equal(readFileSync(new URL('./library-titles.ts', import.meta.url), 'utf8'), renderLibraryTitles());
  });

  test('her hazır egzersiz bir kez, iki dilde adıyla', () => {
    assert.equal(Object.keys(LIBRARY_TITLES).length, EXERCISE_LIBRARY.length);
    for (const exercise of EXERCISE_LIBRARY) {
      assert.deepEqual(LIBRARY_TITLES[exercise.id], [exercise.title, EXERCISE_LIBRARY_EN[exercise.id]?.title || exercise.title], exercise.id);
    }
  });

  test('kimlik tablonun kendi anahtarı olmalı (prototip adları bulunmaz)', () => {
    assert.equal(localizedLibraryTitle('constructor', 'Object', 'en'), 'Object');
    assert.equal(localizedLibraryTitle('__proto__', 'x', 'en'), 'x');
  });
});

describe('geçmişteki ad iki yönde', () => {
  const sample = EXERCISE_LIBRARY.slice(0, 20);

  test('Türkçe kaydedilmiş ad İngilizce okuyana İngilizce, Türkçe okuyana aynen', () => {
    for (const exercise of sample) {
      const en = EXERCISE_LIBRARY_EN[exercise.id]?.title || exercise.title;
      assert.equal(localizedLibraryTitle(exercise.id, exercise.title, 'en'), en, exercise.id);
      assert.equal(localizedLibraryTitle(exercise.id, exercise.title, 'tr'), exercise.title, exercise.id);
    }
  });

  test('İngilizce kaydedilmiş ad Türkçe okuyana Türkçe, İngilizce okuyana aynen', () => {
    for (const exercise of sample) {
      const en = EXERCISE_LIBRARY_EN[exercise.id]?.title || exercise.title;
      assert.equal(localizedLibraryTitle(exercise.id, en, 'tr'), exercise.title, exercise.id);
      assert.equal(localizedLibraryTitle(exercise.id, en, 'en'), en, exercise.id);
    }
  });

  test("PT'nin verdiği ya da değişen ad, silinmiş kimlik: kopya iki dilde de aynen", () => {
    const exercise = EXERCISE_LIBRARY[0]!;
    for (const locale of ['tr', 'en'] as const) {
      assert.equal(localizedLibraryTitle(exercise.id, 'Kendi hareketim', locale), 'Kendi hareketim');
      assert.equal(localizedLibraryTitle('silinmis-hareket', 'Eski ad', locale), 'Eski ad');
    }
  });

  test('bir hareketin adı başka bir hareketinkiyle karışmaz', () => {
    const [first, second] = EXERCISE_LIBRARY as [(typeof EXERCISE_LIBRARY)[number], (typeof EXERCISE_LIBRARY)[number]];
    assert.equal(localizedLibraryTitle(second.id, first.title, 'en'), first.title);
  });
});
