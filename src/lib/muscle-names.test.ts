import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { searchExercises } from './exercise-search.ts';
import { muscleSearchNames } from './muscle-names.ts';

describe('kas adları (arama)', () => {
  test('kendi adı, ailesi ve bölgesi; tekrar yok', () => {
    assert.deepEqual(muscleSearchNames('lats_upper'), ['Üst kanat', 'Kanat', 'Sırt']);
    assert.deepEqual(muscleSearchNames('chest_upper'), ['Üst göğüs', 'Göğüs']);
    // Ailesi olmayan kas: yalnız kendi adı ve bölgesi.
    assert.deepEqual(muscleSearchNames('biceps'), ['Biceps', 'Kol']);
    // Bilinmeyen kimlik: kendisi.
    assert.deepEqual(muscleSearchNames('nope'), ['nope']);
  });

  test('Türkçe harfsiz yazım bulunur; kas adıyla da aranır', () => {
    const list = [
      { title: 'Dambıl Lunge', primaryMuscles: ['quadriceps'], secondaryMuscles: ['glutes'] },
      { title: 'Şınav', primaryMuscles: ['chest_lower'], secondaryMuscles: ['triceps_long'] },
    ];
    const titles = (query: string) => searchExercises(list, query, muscleSearchNames).map((item) => item.title);
    assert.deepEqual(titles('dambil'), ['Dambıl Lunge']);
    assert.deepEqual(titles('sinav'), ['Şınav']);
    assert.deepEqual(titles('gogus'), ['Şınav']);
  });
});
