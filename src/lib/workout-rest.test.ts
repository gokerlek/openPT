import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { WORKOUT } from './motion.ts';
import { REST_EXTEND_MAX_MS } from './heart-rate.ts';
import { acknowledgeRest, adjustRest, alarmPending, LATE_MS, startRest, tickRest, type RestHeart, type RestTimer } from './workout-rest.ts';

const T0 = 1_000_000;
const s = (seconds: number) => T0 + seconds * 1000;

/** Sayacı `times` anlarında sırayla ilerletir; olayları (an → olaylar) toplar. */
function run(timer: RestTimer, times: number[]) {
  const events: string[] = [];
  let current = timer;
  for (const now of times) {
    const tick = tickRest(current, now);
    current = tick.timer;
    for (const event of tick.events) events.push(`${(now - T0) / 1000}:${event}`);
  }
  return { timer: current, events };
}

describe('dinlenme sayacı', () => {
  test('zaman damgasından: kalan, halka, durum', () => {
    const timer = startRest('st_aaaaaaaa', 90, T0);
    const tick = tickRest(timer, s(30));
    assert.equal(tick.remainingMs, 60_000);
    assert.equal(tick.state, 'running');
    assert.ok(Math.abs(tick.fraction - 60 / 90) < 1e-9);
    assert.equal(tickRest(timer, s(85)).state, 'warn');
  });

  test('son 10 sn tek bip; bitişte 3 bip, 15 sn\'de bir en çok 3 kez yinelenir', () => {
    const times = [79, 80, 81, 89, 90, 91, 104, 105, 120, 135, 150, 200].map(s);
    const { timer, events } = run(startRest('st_aaaaaaaa', 90, T0), times);
    assert.deepEqual(events, ['80:warn', '90:end', '105:alarm', '120:alarm', '135:alarm']);
    assert.equal(timer.alarms, WORKOUT.alarmRepeats);
    assert.equal(alarmPending(timer), false);
  });

  test('dokununca alarm susar', () => {
    const ended = run(startRest('st_aaaaaaaa', 30, T0), [s(30)]).timer;
    assert.equal(alarmPending(ended), true);
    const { events } = run(acknowledgeRest(ended), [s(45), s(60)]);
    assert.deepEqual(events, []);
  });

  test('geç fark edilen an sessiz: sayfaya bittikten sonra dönülürse bip yok, aşım yazılır', () => {
    const late = tickRest(startRest('st_aaaaaaaa', 60, T0), s(60) + LATE_MS + 500);
    assert.deepEqual(late.events, []);
    assert.equal(late.state, 'ended');
    assert.equal(late.overrunMs, LATE_MS + 500);
    assert.deepEqual(run(late.timer, [s(90), s(120)]).events, []);
    // Son 10 sn'ye arkadayken girildiyse uyarı da sessiz.
    assert.deepEqual(tickRest(startRest('st_aaaaaaaa', 60, T0), s(55)).events, []);
  });

  test('±15: yalnız bu dinlenme; bitiş en erken 1 sn sonra; uzayınca uyarı ve bitmişse alarm yeniden', () => {
    const timer = startRest('st_aaaaaaaa', 60, T0);
    const warned = run(timer, [s(52)]).timer;
    const longer = adjustRest(warned, 15, s(52));
    assert.equal(longer.endsAt, s(75));
    assert.equal(longer.warned, false);
    assert.equal(adjustRest(timer, -15, s(50)).endsAt, s(51));
    const ended = run(timer, [s(60)]).timer;
    const again = adjustRest(ended, 15, s(62));
    assert.equal(again.endedAt, null);
    assert.equal(again.total, 60);
    assert.deepEqual(run(again, [s(74), s(75)]).events, ['75:end']);
    assert.equal(adjustRest(timer, 60, T0).total, 120);
  });
});

/** Sayacı `[an, nabız]` okumalarıyla ilerletir (toparlanma 120); olayları ve son tık'ı verir. */
function runHeart(timer: RestTimer, readings: [number, number | null][], recovery = 120) {
  const events: string[] = [];
  let current = timer;
  let last: ReturnType<typeof tickRest> | null = null;
  for (const [second, bpm] of readings) {
    const heart: RestHeart = { bpm, recovery };
    last = tickRest(current, s(second), heart);
    current = last.timer;
    for (const event of last.events) events.push(`${second}:${event}`);
  }
  return { timer: current, events, last };
}

describe('dinlenme sayacı: nabızla uzama', () => {
  test('nabız verilmezse ya da ölçüm yoksa bugünkü sayaç', () => {
    const timer = startRest('st_aaaaaaaa', 60, T0);
    assert.deepEqual(runHeart(timer, [[60, null]]).events, ['60:end']);
    assert.deepEqual(tickRest(timer, s(60)).events, ['end']);
  });

  test('temel süre bitince nabız yüksekse uzar (sessiz), 3 sn sınırın altında kalınca bip ile biter', () => {
    const timer = startRest('st_aaaaaaaa', 60, T0);
    const { timer: held, events, last } = runHeart(timer, [[50, 150], [60, 140], [70, 130]]);
    assert.deepEqual(events, ['50:warn', '60:hold']);
    assert.equal(last?.state, 'hold');
    assert.equal(held.endedAt, null);
    assert.deepEqual(held.hold, { since: s(60), calmSince: null });
    // Bitiş anı nabzın 3 sn altında kaldığı an: aşım oradan sayılır.
    const done = runHeart(held, [[80, 118], [82, 117], [83, 116], [84, 116]]);
    assert.deepEqual(done.events, ['83:end']);
    assert.equal(done.timer.endsAt, s(83));
    assert.equal(done.timer.hold, undefined);
    assert.equal(done.timer.heartHigh, undefined);
    assert.equal(done.last?.overrunMs, 1000);
    // Bitişten sonra alarm bugünkü gibi yinelenir.
    assert.deepEqual(runHeart(done.timer, [[98, 110], [113, 110]]).events, ['98:alarm', '113:alarm']);
  });

  test('değişmeyen bekleme aynı nesne (kare kare kayıt yazılmaz)', () => {
    const held = runHeart(startRest('st_aaaaaaaa', 60, T0), [[60, 140]]).timer;
    assert.equal(tickRest(held, s(61), { bpm: 141, recovery: 120 }).timer, held);
  });

  test('en çok 120 sn uzar, sonra "nabız hâlâ yüksek" notuyla biter', () => {
    const held = runHeart(startRest('st_aaaaaaaa', 60, T0), [[60, 140]]).timer;
    const { events, timer } = runHeart(held, [[60 + REST_EXTEND_MAX_MS / 1000 - 1, 140], [60 + REST_EXTEND_MAX_MS / 1000, 140]]);
    assert.deepEqual(events, ['180:end']);
    assert.equal(timer.heartHigh, true);
    assert.equal(timer.endsAt, s(180));
  });

  test('uzarken bağlantı koparsa o an biter', () => {
    const held = runHeart(startRest('st_aaaaaaaa', 60, T0), [[60, 140]]).timer;
    assert.deepEqual(runHeart(held, [[75, null]]).events, ['75:end']);
    // Nabız hiç verilmezse de (bağlı değil) aynı.
    const tick = tickRest(held, s(75));
    assert.deepEqual([tick.events, tick.state, tick.timer.endsAt], [['end'], 'ended', s(75)]);
  });

  test('temel bitiş geç fark edildiyse uzamaz (sekme arkadaydı): bugünkü gibi sessiz', () => {
    const late = runHeart(startRest('st_aaaaaaaa', 60, T0), [[60 + LATE_MS / 1000 + 1, 150]]);
    assert.deepEqual(late.events, []);
    assert.equal(late.last?.state, 'ended');
  });

  test('uzama sınırı geç fark edildiyse bitiş sessiz', () => {
    const held = runHeart(startRest('st_aaaaaaaa', 60, T0), [[60, 140]]).timer;
    const { events, last } = runHeart(held, [[300, 140]]);
    assert.deepEqual(events, []);
    assert.equal(last?.state, 'ended');
    assert.equal(last?.timer.heartHigh, true);
  });

  test('uzarken ±15 şimdiden sayılır; bitmiş dinlenme uzatılınca not düşer', () => {
    const held = runHeart(startRest('st_aaaaaaaa', 60, T0), [[60, 140]]).timer;
    const longer = adjustRest(held, 15, s(70));
    assert.equal(longer.endsAt, s(85));
    assert.equal(longer.hold, undefined);
    assert.equal(adjustRest(held, -15, s(70)).endsAt, s(71));
    const high = runHeart(held, [[180, 140]]).timer;
    const again = adjustRest(high, 15, s(185));
    assert.equal(again.heartHigh, undefined);
    assert.equal(again.endedAt, null);
  });
});
