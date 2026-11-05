import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { commaToPoint, normalizeDecimal, pastedDecimal } from './decimal-text.ts';

/**
 * Plan §8 risk 8: Base UI NumberField'ın ondalık ayracı dile göre. Türkçede ("tr-TR") "2,5" ve "2.5" ikisi de 2,5 okunur;
 * `en-GB`'de virgül ondalık sayılmaz ("2,5" → 2). `Stepper` İngilizce ondalık kutusunda yazılan ve yapıştırılan virgülü
 * noktaya çevirir. Okuyucu Base UI'ın kendi ayrıştırıcısıdır (paketin dışa açmadığı dosya: sürüm değişince bu test uyarır).
 */
const PARSE = new URL('../../../node_modules/@base-ui/react/number-field/utils/parse.mjs', import.meta.url);
const { parseNumber } = (await import(PARSE.href)) as { parseNumber: (text: string, locale: string, options: Intl.NumberFormatOptions) => number | null };
const FORMAT = { useGrouping: false } as const;

describe('ondalık kutuda virgül (Base UI ayrıştırıcısıyla)', () => {
  test('Türkçe: virgül de nokta da ondalık', () => {
    assert.equal(parseNumber('2,5', 'tr-TR', FORMAT), 2.5);
    assert.equal(parseNumber('2.5', 'tr-TR', FORMAT), 2.5);
    assert.equal(parseNumber('57,5', 'tr-TR', FORMAT), 57.5);
  });

  test('İngilizce: Base UI virgülü ondalık saymaz, `commaToPoint` onu düzeltir', () => {
    assert.equal(parseNumber('2,5', 'en-GB', FORMAT), 2);
    assert.equal(parseNumber('2.5', 'en-GB', FORMAT), 2.5);
    assert.equal(parseNumber(commaToPoint('2,5'), 'en-GB', FORMAT), 2.5);
    assert.equal(parseNumber(commaToPoint('57,5'), 'en-GB', FORMAT), 57.5);
  });
});

describe('commaToPoint / normalizeDecimal', () => {
  test('virgülsüz metne dokunmaz', () => {
    assert.equal(commaToPoint('62.5'), '62.5');
    assert.equal(commaToPoint(''), '');
    assert.deepEqual(normalizeDecimal('62.5', 3), { text: '62.5', caret: 3 });
  });

  test('ilk virgül ondalık noktası olur', () => {
    assert.equal(commaToPoint('2,5'), '2.5');
    assert.equal(commaToPoint(',5'), '.5');
    assert.equal(commaToPoint('2,'), '2.');
  });

  test('nokta zaten varsa virgül düşer ("2.5" + virgül "2.5." (= 25) olmaz)', () => {
    assert.equal(commaToPoint('2.5,'), '2.5');
    assert.equal(commaToPoint('2,.5'), '2.5');
    assert.equal(commaToPoint('2,5,'), '2.5');
    assert.equal(commaToPoint('1,234.5'), '1234.5');
  });

  test('imleç, imleçten önce düşen virgül kadar geri gelir; çevrilen virgülde yerinde kalır', () => {
    assert.deepEqual(normalizeDecimal('2.5,', 4), { text: '2.5', caret: 3 });
    assert.deepEqual(normalizeDecimal('2,.5', 2), { text: '2.5', caret: 1 });
    assert.deepEqual(normalizeDecimal('2,.5', 0), { text: '2.5', caret: 0 });
    assert.deepEqual(normalizeDecimal('2,5', 2), { text: '2.5', caret: 2 });
  });
});

describe('yapıştırma (`pastedDecimal`)', () => {
  test('"2,5" boşa yapıştırılınca 2.5; imleç yapıştırılanın sonunda', () => {
    assert.deepEqual(pastedDecimal('', 0, 0, '2,5'), { text: '2.5', caret: 3 });
    assert.equal(parseNumber(pastedDecimal('', 0, 0, '2,5').text, 'en-GB', FORMAT), 2.5);
  });

  test('seçili metnin yerine geçer, öncesi ve sonrası korunur', () => {
    assert.deepEqual(pastedDecimal('10', 0, 2, '57,5'), { text: '57.5', caret: 4 });
    assert.deepEqual(pastedDecimal('12', 1, 1, '5'), { text: '152', caret: 2 });
  });

  test('kutuda nokta varken yapıştırılan virgül düşer', () => {
    assert.deepEqual(pastedDecimal('2.5', 3, 3, ',5'), { text: '2.55', caret: 4 });
  });
});
