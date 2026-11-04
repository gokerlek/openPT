import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { accusative, dative, genitive } from './turkish.ts';

describe('dative: serbest metin ada yönelme eki', () => {
  test('ünsüz ve ünlüyle biten, kalın ve ince', () => {
    assert.equal(dative('Evde'), "Evde'ye");
    assert.equal(dative('Tatil'), "Tatil'e");
    assert.equal(dative('Kardiyo'), "Kardiyo'ya");
    assert.equal(dative('Salon'), "Salon'a");
    assert.equal(dative('Üst vücut'), "Üst vücut'a");
    assert.equal(dative(' Güç '), "Güç'e");
    assert.equal(dative('Programım'), "Programım'a");
  });

  test('sayıyla ve ünlüsüz kısaltmayla biten', () => {
    assert.equal(dative('Programım 2'), "Programım 2'ye");
    assert.equal(dative('Programım 3'), "Programım 3'e");
    assert.equal(dative('Blok 6'), "Blok 6'ya");
    assert.equal(dative('Hafta 10'), "Hafta 10'a");
    assert.equal(dative('PPL'), "PPL'ye");
  });

  test('boş ad değişmez', () => {
    assert.equal(dative('  '), '');
  });
});

describe('accusative: serbest metin ada belirtme eki', () => {
  test('dörtlü uyum ve kaynaştırma', () => {
    assert.equal(accusative('Evde'), "Evde'yi");
    assert.equal(accusative('Tatil'), "Tatil'i");
    assert.equal(accusative('Kardiyo'), "Kardiyo'yu");
    assert.equal(accusative('Salon'), "Salon'u");
    assert.equal(accusative('Güç'), "Güç'ü");
    assert.equal(accusative('Programım'), "Programım'ı");
  });

  test('sayıyla ve ünlüsüz kısaltmayla biten', () => {
    assert.equal(accusative('Programım 2'), "Programım 2'yi");
    assert.equal(accusative('Programım 3'), "Programım 3'ü");
    assert.equal(accusative('Blok 6'), "Blok 6'yı");
    assert.equal(accusative('Hafta 10'), "Hafta 10'u");
    assert.equal(accusative('PPL'), "PPL'yi");
  });
});

describe('genitive: sayıya ve ada tamlayan eki', () => {
  test('nabız sınırları: okunuşa göre ("yüz yirmi bir" → 121\'in)', () => {
    assert.equal(genitive('121'), "121'in");
    assert.equal(genitive('126'), "126'nın");
    assert.equal(genitive('120'), "120'nin");
    assert.equal(genitive('130'), "130'un");
    assert.equal(genitive('140'), "140'ın");
    assert.equal(genitive('150'), "150'nin");
    assert.equal(genitive('170'), "170'in");
    assert.equal(genitive('190'), "190'ın");
    // "elli" ünlüyle, "seksen" ünsüzle biter.
    assert.equal(genitive('180'), "180'in");
    assert.equal(dative('Hafta 50'), "Hafta 50'ye");
    assert.equal(dative('Hafta 80'), "Hafta 80'e");
  });

  test('yüzler "yüz", binler "bin" diye okunur', () => {
    assert.equal(genitive('100'), "100'ün");
    assert.equal(genitive('200'), "200'ün");
    assert.equal(genitive('1000'), "1000'in");
    assert.equal(dative('Hafta 100'), "Hafta 100'e");
  });

  test('ad', () => {
    assert.equal(genitive('Evde'), "Evde'nin");
    assert.equal(genitive('Salon'), "Salon'un");
  });
});
