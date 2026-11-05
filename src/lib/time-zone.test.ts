import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';
import { setupFormSchema } from './schemas/setup.ts';
import { isTimeZone, timeZoneOptions } from './time-zone.ts';

describe('saat dilimi', () => {
  test('IANA adları geçer; sabit fark, bilinmeyen ad ve metin dışı değer geçmez', () => {
    for (const zone of ['Europe/Istanbul', 'America/New_York', 'America/Argentina/Buenos_Aires', 'Asia/Kolkata', 'UTC', 'Etc/GMT+3']) {
      assert.equal(isTimeZone(zone), true, zone);
    }
    for (const value of ['', ' ', '+03:00', '-05:00', 'Mars/Olympus', 'Europe/', '/Istanbul', 'Europe/Istanbul ', 'x'.repeat(200), null, undefined, 3]) {
      assert.equal(isTimeZone(value), false, String(value));
    }
  });

  test('seçenekler Intl listesi; kayıtlı değer listede yoksa başta', () => {
    const options = timeZoneOptions('Europe/Istanbul');
    assert.deepEqual(options, Intl.supportedValuesOf('timeZone'));
    assert.ok(options.includes('America/New_York'));
    assert.deepEqual(timeZoneOptions('UTC').slice(0, 2), ['UTC', options[0]]);
  });

  test('kurulum formu saat dilimini taşır (isteğe bağlı)', () => {
    const form = { appName: 'Ece Kaya Training', accent: null, theme: 'dark', radius: 'subtle' };
    assert.equal(v.parse(setupFormSchema, { ...form, timeZone: 'America/New_York' }).timeZone, 'America/New_York');
    assert.equal('timeZone' in v.parse(setupFormSchema, form), false);
  });
});
