import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AttentionFacts } from './attention.ts';
import { clientCardExtras, lastWorkoutText, type CardExtrasRow } from './client-card-extras.ts';

const ctx = { now: new Date('2026-10-26T10:00:00.000Z'), timeZone: 'Europe/Istanbul' };

function facts(overrides: Partial<AttentionFacts> = {}): AttentionFacts {
  return { active: true, access: 'joined', schedule: null, sessionDays: [], stalls: [], phase: null, proposals: null, measurements: [], ...overrides };
}

const row = (id: string, overrides: Partial<CardExtrasRow> = {}): CardExtrasRow => ({ id, ok: true, status: 'active', access: 'joined', ...overrides });

describe('danışan kartının son antrenman satırı', () => {
  test('özetteki (son 35 gün) en yeni gün yazılır; sıra bozuk olsa da', () => {
    assert.equal(lastWorkoutText({ sessionDays: ['2026-10-20', '2026-10-23', '2026-10-21'] }, true), 'Son antrenman 23 Eki');
    // Antrenman beklenmese de (duraklatılmış) yapılan gün söylenir.
    assert.equal(lastWorkoutText({ sessionDays: ['2026-10-01'] }, false), 'Son antrenman 1 Eki');
  });

  test('35 günde antrenman yoksa yalnız antrenman beklenirken söylenir', () => {
    assert.equal(lastWorkoutText({ sessionDays: [] }, true), 'Son 35 günde antrenman yok');
    assert.equal(lastWorkoutText({ sessionDays: [] }, false), null);
  });
});

describe('danışan kartlarının alt satırları', () => {
  test('aktif ve giriş yapmış (eski kayıtta kullanılmış davet de) danışanda antrenmansızlık söylenir; davet bekleyende ve duraklatılmışta değil', () => {
    const all = new Map([
      ['katildi', facts()],
      ['eski', facts({ access: 'used' })],
      ['bekliyor', facts({ access: 'pending' })],
      ['duraklatildi', facts({ active: false })],
    ]);
    const extras = clientCardExtras(
      [row('katildi'), row('eski', { access: 'used' }), row('bekliyor', { access: 'pending' }), row('duraklatildi', { status: 'paused' })],
      all,
      ctx,
    );
    assert.equal(extras.katildi?.lastWorkout, 'Son 35 günde antrenman yok');
    assert.equal(extras.eski?.lastWorkout, 'Son 35 günde antrenman yok');
    assert.equal(extras.bekliyor?.lastWorkout, null);
    assert.equal(extras.duraklatildi?.lastWorkout, null);
  });

  test('yakın günde antrenman varsa günü yazılır', () => {
    const extras = clientCardExtras([row('a')], new Map([['a', facts({ sessionDays: ['2026-10-24'] })]]), ctx);
    assert.equal(extras.a?.lastWorkout, 'Son antrenman 24 Eki');
  });

  test('dikkat maddelerinin sayısı; kırmızı madde varsa acil', () => {
    const extras = clientCardExtras(
      [row('sakin'), row('acil'), row('bos')],
      new Map([
        ['sakin', facts({ proposals: { count: 2, at: '2026-10-25T10:00:00.000Z' } })],
        [
          'acil',
          facts({
            proposals: { count: 1, at: '2026-10-25T10:00:00.000Z' },
            constraints: { urgent: [], refer: [{ id: 'k_1', title: 'Sol diz' }], waiting: [], reports: [], changes: [], conflicts: [] },
          }),
        ],
        ['bos', facts()],
      ]),
      ctx,
    );
    assert.deepEqual(extras.sakin?.attention, { count: 1, urgent: false });
    assert.deepEqual(extras.acil?.attention, { count: 2, urgent: true });
    assert.deepEqual(extras.bos?.attention, { count: 0, urgent: false });
  });

  test('özeti olmayan, kaydı okunamayan ya da arşivdeki danışanda satır yok', () => {
    const extras = clientCardExtras(
      [row('ozetsiz'), row('bozuk', { ok: false, access: null }), row('arsiv', { status: 'archived' })],
      new Map([
        ['bozuk', facts()],
        ['arsiv', facts()],
      ]),
      ctx,
    );
    assert.deepEqual(extras, {});
  });
});
