import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { bodyMassOn, cardioKind, cardioText, distanceText, totalKcal, walkKcal } from './cardio.ts';
import type { MeasurementEntry } from './schemas/health.ts';

describe('cardioKind', () => {
  test('süreli kardiyo makine, yürüyüş/koşu işaretliyse yürüyüş', () => {
    assert.equal(cardioKind({ trackingType: 'duration', pattern: 'cardio' }), 'machine');
    assert.equal(cardioKind({ trackingType: 'duration', pattern: 'cardio', locomotion: true }), 'walk');
  });

  test('kardiyo olmayan ya da süresiz hareket kardiyo değil', () => {
    assert.equal(cardioKind({ trackingType: 'duration', pattern: 'core' }), null);
    assert.equal(cardioKind({ trackingType: 'duration' }), null);
    assert.equal(cardioKind({ trackingType: 'weight_reps', pattern: 'cardio', locomotion: true }), null);
  });
});

describe('walkKcal', () => {
  test('yürüme: 3000 m / 30 dk, %5, 75 kg', () => {
    assert.equal(walkKcal({ seconds: 1800, distanceM: 3000, inclinePct: 5 }, 75), 253);
  });

  test('koşu: 5000 m / 25 dk, %1, 70 kg', () => {
    assert.equal(walkKcal({ seconds: 1500, distanceM: 5000, inclinePct: 1 }, 70), 396);
  });

  test('eğim 0', () => {
    assert.equal(walkKcal({ seconds: 1800, distanceM: 3000, inclinePct: 0 }, 75), 152);
  });

  test('eğimsiz set, mesafe, süre ya da kilo yoksa kalori yok', () => {
    assert.equal(walkKcal({ seconds: 1800, distanceM: 3000 }, 75), null);
    assert.equal(walkKcal({ seconds: 1800, distanceM: 0, inclinePct: 5 }, 75), null);
    assert.equal(walkKcal({ seconds: 1800, inclinePct: 5 }, 75), null);
    assert.equal(walkKcal({ seconds: 0, distanceM: 3000, inclinePct: 5 }, 75), null);
    assert.equal(walkKcal({ seconds: 1800, distanceM: 3000, inclinePct: 5 }, undefined), null);
    assert.equal(walkKcal({ seconds: 1800, distanceM: 3000, inclinePct: 5 }, 0), null);
  });
});

describe('metinler', () => {
  test('mesafe: 1000 m altı metre, üstü km', () => {
    assert.equal(distanceText(800), '800 m');
    assert.equal(distanceText(1000), '1 km');
    assert.equal(distanceText(2500), '2,5 km');
    assert.equal(distanceText(3250), '3,25 km');
    assert.equal(distanceText(3333), '3,33 km');
  });

  test('kardiyo seti', () => {
    assert.equal(cardioText({ seconds: 1800, distanceM: 3000, inclinePct: 5 }, 253), '30:00 · 3 km · %5 · ≈ 253 kcal');
    assert.equal(cardioText({ seconds: 600 }), '10:00');
    assert.equal(cardioText({ seconds: 1800, distanceM: 0, inclinePct: 2.5 }), '30:00 · %2,5');
    assert.equal(cardioText({ seconds: 3725, distanceM: 8000 }, null), '1:02:05 · 8 km');
  });
});

describe('bodyMassOn', () => {
  const list: MeasurementEntry[] = [
    { date: '2026-09-01', id: 'body_mass', value: 80 },
    { date: '2026-10-01', id: 'waist_girth', value: 90 },
    { date: '2026-10-01', id: 'body_mass', value: 78 },
    { date: '2026-10-20', id: 'body_mass', value: 76.5 },
  ];

  test('tarihsiz en yeni kilo', () => {
    assert.equal(bodyMassOn(list), 76.5);
  });

  test('o gün ya da öncesindeki son kilo; öncesi yoksa en eski', () => {
    assert.equal(bodyMassOn(list, '2026-10-01'), 78);
    assert.equal(bodyMassOn(list, '2026-10-15'), 78);
    assert.equal(bodyMassOn(list, '2026-08-01'), 80);
  });

  test('kilo yoksa yok', () => {
    assert.equal(bodyMassOn([{ date: '2026-10-01', id: 'waist_girth', value: 90 }]), undefined);
    assert.equal(bodyMassOn([]), undefined);
  });
});

describe('totalKcal', () => {
  test('yalnız yürüyüş/koşu setleri toplanır', () => {
    const walk = { seconds: 1800, distanceM: 3000, inclinePct: 5 };
    assert.equal(totalKcal([walk, walk, { seconds: 600, distanceM: 4000 }], 75), 506);
    assert.equal(totalKcal([walk], undefined), 0);
  });
});
