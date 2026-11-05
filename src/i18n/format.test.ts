import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDay, formatKg, formatRecent, formatWithUnit, getFormat } from '../lib/format.ts';

describe('getFormat: Türkçe eskisiyle aynı', () => {
  const tr = getFormat('tr');
  test('dışa açık fonksiyonlarla aynı çıktı', () => {
    assert.equal(tr.kg(2.5), formatKg(2.5));
    assert.equal(tr.withUnit(30, '%'), formatWithUnit(30, '%'));
    assert.equal(tr.day('2026-09-01'), formatDay('2026-09-01'));
    const now = new Date('2026-09-25T12:00:00Z');
    assert.equal(tr.recent('2026-09-25T08:05:00Z', 'Europe/Istanbul', now), formatRecent('2026-09-25T08:05:00Z', 'Europe/Istanbul', now));
  });
  test('saat', () => assert.equal(tr.time('2026-09-25T08:05:00Z', 'Europe/Istanbul'), '11:05'));
  test('aynı nesne (bir kez kurulur)', () => assert.equal(getFormat('tr'), tr));
});

describe('getFormat: İngilizce (en-GB)', () => {
  const en = getFormat('en');

  test('sayılar', () => {
    assert.equal(en.number(82.5), '82.5');
    assert.equal(en.number(1234.567), '1,234.57');
    assert.equal(en.kg(2.5), '2.5 kg');
    assert.equal(en.withUnit(82.5, 'cm'), '82.5 cm');
    assert.equal(en.withUnit(30, '%'), '30%');
    assert.equal(en.signedWithUnit(1.5, 'cm'), '+1.5 cm');
    assert.equal(en.signedWithUnit(-12, '%'), '−12%');
    assert.equal(en.signedWithUnit(0, 'kg'), '±0 kg');
  });

  test('takvim günü ve tarih', () => {
    assert.equal(en.day('2026-09-01'), '1 September 2026');
    assert.match(en.dayShort('2026-09-01'), /^1 Sept?$/);
    assert.match(en.dayShort('2026-09-01', true), /^1 Sept? 2026$/);
    assert.equal(en.date('2026-09-23T21:30:00Z', 'Europe/Istanbul'), '24 September 2026');
    assert.match(en.dateTime('2026-09-23T11:05:00Z', 'Europe/Istanbul'), /^23 September 2026(,| at) 14:05$/);
    assert.equal(en.time('2026-09-25T08:05:00Z', 'Europe/Istanbul'), '11:05');
  });

  test('yakın an', () => {
    const now = new Date('2026-09-25T12:00:00Z');
    const tz = 'Europe/Istanbul';
    assert.equal(en.recent('2026-09-25T11:59:40Z', tz, now), 'just now');
    assert.equal(en.recent('2026-09-25T11:59:00Z', tz, now), '1 minute ago');
    assert.equal(en.recent('2026-09-25T11:55:00Z', tz, now), '5 minutes ago');
    assert.equal(en.recent('2026-09-25T08:05:00Z', tz, now), 'today at 11:05');
    assert.equal(en.recent('2026-09-24T20:59:00Z', tz, now), 'yesterday at 23:59');
    assert.match(en.recent('2026-09-23T20:59:00Z', tz, now), /^23 September 2026(,| at) 23:59$/);
  });
});
