import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';
import { LocalizedError, messageOf } from './errors.ts';
import { langConfig, msg } from './valibot.ts';

describe('LocalizedError', () => {
  const error = new LocalizedError((l) => (l === 'en' ? 'Not found.' : 'Bulunamadı.'), { cause: 'x' });

  test('.message Türkçe kalır (kayıtlar ve testler)', () => {
    assert.equal(error.message, 'Bulunamadı.');
    assert.equal(error.cause, 'x');
    assert.ok(error instanceof Error);
  });

  test('messageOf dile göre; düz hata kendi mesajıyla; hata değilse null', () => {
    assert.equal(messageOf(error, 'en'), 'Not found.');
    assert.equal(messageOf(error, 'tr'), 'Bulunamadı.');
    assert.equal(messageOf(new Error('düz'), 'en'), 'düz');
    assert.equal(messageOf({ localized: () => 'nesne' }, 'en'), 'nesne');
    assert.equal(messageOf('metin', 'en'), null);
    assert.equal(messageOf(null, 'en'), null);
  });
});

describe('valibot mesajları', () => {
  const schema = v.pipe(v.string(), v.minLength(2, msg((l, issue) => (l === 'en' ? `At least ${issue.requirement}.` : `En az ${issue.requirement}.`))));

  test('dil yoksa Türkçe', () => {
    const result = v.safeParse(schema, 'a');
    assert.equal(result.issues?.[0]?.message, 'En az 2.');
  });

  test('yapılandırmadaki dil', () => {
    assert.equal(v.safeParse(schema, 'a', langConfig('en')).issues?.[0]?.message, 'At least 2.');
    assert.equal(v.safeParse(schema, 'a', langConfig('tr')).issues?.[0]?.message, 'En az 2.');
  });

  test('bilinmeyen dil Türkçeye düşer', () => {
    assert.equal(v.safeParse(schema, 'a', { lang: 'de' }).issues?.[0]?.message, 'En az 2.');
  });
});
