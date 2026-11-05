import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { defineMessages, listText, plural, type Shape } from './define.ts';
import { compareText, lower, lowerFirst, upper, upperFirst } from './text.ts';

describe('defineMessages', () => {
  const tr = { title: 'Başlık', sets: (n: number) => `${n} set`, list: ['bir', 'iki'] };
  const en: Shape<typeof tr> = { title: 'Title', sets: (n: number) => plural('en', n, { one: `${n} set`, other: `${n} sets` }), list: ['one', 'two'] };
  const messages = defineMessages({ tr, en });

  test('dile göre sözlük; sözlükler dictionary’de', () => {
    assert.equal(messages('tr').title, 'Başlık');
    assert.equal(messages('en').title, 'Title');
    assert.equal(messages('tr'), tr);
    assert.deepEqual(messages.dictionary, { tr, en });
  });

  test('fonksiyonlar parametre alır', () => {
    assert.equal(messages('tr').sets(3), '3 set');
    assert.equal(messages('en').sets(1), '1 set');
    assert.equal(messages('en').sets(3), '3 sets');
  });
});

describe('plural', () => {
  const forms = { one: 'one', other: 'other' };
  test('İngilizce: yalnız 1 tekil', () => {
    assert.equal(plural('en', 1, forms), 'one');
    for (const n of [0, 2, 5, 1.5, 21]) assert.equal(plural('en', n, forms), 'other', String(n));
  });
  test('Türkçe: 1 tekil (sözlük iki biçimi aynı yazar)', () => {
    assert.equal(plural('tr', 1, forms), 'one');
    assert.equal(plural('tr', 3, forms), 'other');
  });
});

describe('listText', () => {
  test('ve / and', () => {
    assert.equal(listText('tr', ['göğüs', 'omuz', 'sırt']), 'göğüs, omuz ve sırt');
    assert.equal(listText('en', ['chest', 'shoulders', 'back']), 'chest, shoulders and back');
    assert.equal(listText('en', ['chest', 'back']), 'chest and back');
    assert.equal(listText('en', ['chest']), 'chest');
  });
  test('veya / or', () => {
    assert.equal(listText('tr', ['a', 'b'], 'disjunction'), 'a veya b');
    assert.equal(listText('en', ['a', 'b'], 'disjunction'), 'a or b');
  });
});

describe('harf ve sıra', () => {
  test('Türkçe kurallar yalnız Türkçede', () => {
    assert.equal(upper('tr', 'istanbul'), 'İSTANBUL');
    assert.equal(upper('en', 'istanbul'), 'ISTANBUL');
    assert.equal(lower('tr', 'IŞIK'), 'ışık');
    assert.equal(lower('en', 'INFO'), 'info');
  });
  test('ilk harf', () => {
    assert.equal(upperFirst('tr', 'iç bacak'), 'İç bacak');
    assert.equal(upperFirst('en', 'inner thigh'), 'Inner thigh');
    assert.equal(lowerFirst('tr', 'Iğdır'), 'ığdır');
    assert.equal(lowerFirst('en', 'Inner thigh'), 'inner thigh');
    assert.equal(upperFirst('en', ''), '');
  });
  test('sıralama dilin alfabesiyle', () => {
    assert.deepEqual(['Ölçüm', 'Omuz', 'Çene', 'Cep'].sort(compareText('tr')), ['Cep', 'Çene', 'Omuz', 'Ölçüm']);
    assert.deepEqual(['b', 'a', 'C'].sort(compareText('en')), ['a', 'b', 'C']);
  });
});
