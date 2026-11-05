import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { commaToPoint } from './decimal-text.ts';

/**
 * Plan §8 risk 8: Base UI NumberField'ın ondalık ayracı dile göre. Türkçede ("tr-TR") "2,5" ve "2.5" ikisi de 2,5 okunur;
 * `en-GB`'de virgül ondalık sayılmaz ("2,5" → 2). `Stepper` İngilizce ondalık kutusunda yazılan virgülü noktaya çevirir.
 * Okuyucu Base UI'ın kendi ayrıştırıcısıdır (paketin dışa açmadığı dosya: sürüm değişince bu test uyarır).
 */
const PARSE = new URL('../../../node_modules/@base-ui/react/number-field/utils/parse.mjs', import.meta.url);
const { parseNumber } = (await import(PARSE.href)) as { parseNumber: (text: string, locale: string, options: Intl.NumberFormatOptions) => number | null };
const FORMAT = { useGrouping: false } as const;

describe('ondalık kutuda virgül', () => {
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

  test('`commaToPoint` virgülsüz metne dokunmaz', () => {
    assert.equal(commaToPoint('62.5'), '62.5');
    assert.equal(commaToPoint(''), '');
  });
});
