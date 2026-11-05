import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';
import { GEMINI_KEY_ERRORS, geminiKeyError, geminiKeySchema } from './gemini-key-input.ts';
const key = 'AIza_test_only_fake_key_123456789012345678';
test('authorization keys with an AQ prefix preserve their separator', () => {
  const authKey = 'AQ.test_only_fake_key_123456789012345678';
  assert.equal(v.parse(geminiKeySchema, ` ${authKey}\n`), authKey);
  assert.equal(geminiKeyError(authKey), '');
});
test('complete keys accept surrounding whitespace and preserve the exact internal value', () => {
  assert.equal(v.parse(geminiKeySchema, ` \n${key}\t `), key);
  assert.equal(geminiKeyError(key), '');
});
test('short values get an incomplete-key error instead of claiming whitespace', () => {
  assert.equal(geminiKeyError('test@short'), GEMINI_KEY_ERRORS.incomplete);
  assert.equal(geminiKeyError(''), GEMINI_KEY_ERRORS.incomplete);
});
test('masked previews, embedded whitespace and other invalid characters are distinguished', () => {
  assert.equal(geminiKeyError('AIza…1234'), GEMINI_KEY_ERRORS.masked);
  assert.equal(geminiKeyError('AIza********1234'), GEMINI_KEY_ERRORS.masked);
  assert.equal(geminiKeyError(key.slice(0, 10) + '\n' + key.slice(10)), GEMINI_KEY_ERRORS.spaces);
  assert.equal(geminiKeyError(key + '@'), GEMINI_KEY_ERRORS.characters);
  assert.equal(geminiKeyError('x'.repeat(201)), GEMINI_KEY_ERRORS.long);
});
test('errors never include supplied credentials, even with unexpected input types', () => {
  for (const input of [null, {}, 123, key + '@', `${key}\ninvalid`]) {
    assert.ok(!geminiKeyError(input).includes(key));
  }
});

/** Türkçe metinler dil desteğinden önceki koddan (openpt 98f852e) harfi harfine; sözlük sabitlerine karşı değil, düz metne karşı. */
const GOLDEN = {
  incomplete: 'Girilen değer çok kısa. Google AI Studio’dan API anahtarının tamamını kopyala; anahtar adını değil.',
  long: 'Girilen değer API anahtarı için çok uzun. Yalnız anahtarın kendisini yapıştır.',
  masked: 'Bu kısaltılmış veya gizlenmiş bir anahtar. Google AI Studio’daki kopyalama düğmesiyle tam anahtarı al.',
  spaces: 'Anahtarın içinde boşluk veya satır sonu var. Google AI Studio’daki kopyalama düğmesiyle tam anahtarı al.',
  characters: 'Girilen değer API anahtarı biçiminde değil. Yalnız anahtarı yapıştır; adres, kod veya anahtar adı kullanma.',
};
test('Türkçe anahtar hata metinleri harfi harfine eski metinler', () => {
  assert.deepEqual({ ...GEMINI_KEY_ERRORS }, { ...GOLDEN, fallback: 'Gemini API anahtarını kontrol et.' });
  assert.equal(geminiKeyError('test@short'), GOLDEN.incomplete);
  assert.equal(geminiKeyError('AIza…1234'), GOLDEN.masked);
  assert.equal(geminiKeyError(key.slice(0, 10) + '\n' + key.slice(10)), GOLDEN.spaces);
  assert.equal(geminiKeyError(key + '@'), GOLDEN.characters);
  assert.equal(geminiKeyError('x'.repeat(201)), GOLDEN.long);
  assert.equal(geminiKeyError(null), 'Gemini API anahtarını kontrol et.');
  assert.equal(geminiKeyError(123), 'Gemini API anahtarını kontrol et.');
});
test('geçerli anahtarda hata yok, her dilde', () => {
  assert.equal(geminiKeyError(key, 'tr'), '');
  assert.equal(geminiKeyError(key, 'en'), '');
});
