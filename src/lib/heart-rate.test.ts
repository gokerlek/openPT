import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ageHeartLimits,
  calmText,
  DEFAULT_HEART_LIMITS,
  fakeHeartRate,
  HEART_ALERT_IDLE,
  heartAlertStep,
  heartAlertText,
  heartZone,
  HOLD_SEEN_STEP_MS,
  parseHeartRateMeasurement,
  READING_STALE_MS,
  readingBpm,
  resolveHeartLimits,
  REST_CALM_MS,
  REST_EXTEND_MAX_MS,
  restHoldStep,
  takeReading,
  type HeartAlertState,
  type RestHold,
} from './heart-rate.ts';

/** Bayrak baytı ve ardından gelen baytlar: bandın gönderdiği ölçüm (0x2A37). */
const measurement = (...bytes: number[]) => new DataView(new Uint8Array(bytes).buffer);

const T0 = 1_000_000;
const s = (seconds: number) => T0 + seconds * 1000;

describe('nabız ölçümü (0x2A37) çözümleme', () => {
  test('8 bit: bayrağın 0. biti kapalı, değer 1. baytta', () => {
    assert.equal(parseHeartRateMeasurement(measurement(0x00, 72)), 72);
    assert.equal(parseHeartRateMeasurement(measurement(0x00, 255)), 255);
  });

  test('16 bit: bayrağın 0. biti açık, değer küçük uçlu iki baytta', () => {
    assert.equal(parseHeartRateMeasurement(measurement(0x01, 0x8c, 0x00)), 140);
    assert.equal(parseHeartRateMeasurement(measurement(0x01, 0x2c, 0x01)), 300);
  });

  test('enerji ve RR alanları değeri değiştirmez', () => {
    // 0x18: enerji (2 bayt) ve RR aralıkları var; nabız yine 1. baytta.
    assert.equal(parseHeartRateMeasurement(measurement(0x18, 128, 0x10, 0x00, 0x00, 0x04)), 128);
  });

  test('ten teması desteklenip yoksa, değer 0 ya da veri eksikse ölçüm yok', () => {
    // 0x04: temas algılama destekli, temas yok.
    assert.equal(parseHeartRateMeasurement(measurement(0x04, 90)), null);
    // 0x06: destekli ve temas var.
    assert.equal(parseHeartRateMeasurement(measurement(0x06, 90)), 90);
    assert.equal(parseHeartRateMeasurement(measurement(0x00, 0)), null);
    assert.equal(parseHeartRateMeasurement(measurement(0x00)), null);
    assert.equal(parseHeartRateMeasurement(measurement(0x01, 0x8c)), null);
    assert.equal(parseHeartRateMeasurement(measurement()), null);
  });
});

describe('nabız sınırları: PT → yaş → genel', () => {
  test('PT\'nin girdiği sınırlar önce gelir', () => {
    assert.deepEqual(resolveHeartLimits({ pt: { recovery: 110, alert: 160 }, age: 30 }), { recovery: 110, alert: 160, source: 'pt' });
  });

  test('PT sınırı yoksa yaştan: en yüksek nabız 208 − 0,7 × yaş; toparlanma %65, uyarı %90', () => {
    // 30 yaş: 187 → 121,55 ve 168,3.
    assert.deepEqual(ageHeartLimits(30), { recovery: 122, alert: 168 });
    assert.deepEqual(resolveHeartLimits({ pt: null, age: 30 }), { recovery: 122, alert: 168, source: 'age' });
    // 60 yaş: 166 → 107,9 ve 149,4.
    assert.deepEqual(resolveHeartLimits({ age: 60 }), { recovery: 108, alert: 149, source: 'age' });
  });

  test('ikisi de yoksa genel değerler: toparlanma 120, uyarı 170', () => {
    assert.deepEqual(DEFAULT_HEART_LIMITS, { recovery: 120, alert: 170 });
    assert.deepEqual(resolveHeartLimits({}), { recovery: 120, alert: 170, source: 'default' });
  });

  test('anlamsız PT sınırı ya da yaş atlanır (elle bozulmuş kayıt)', () => {
    assert.equal(resolveHeartLimits({ pt: { recovery: 170, alert: 160 } }).source, 'default');
    assert.equal(resolveHeartLimits({ pt: { recovery: 40, alert: 160 }, age: 40 }).source, 'age');
    assert.equal(resolveHeartLimits({ age: 3 }).source, 'default');
    assert.equal(resolveHeartLimits({ age: Number.NaN }).source, 'default');
  });

  test('bölge: toparlanma ve altı sakin, uyarının üstü yüksek, arası çalışma', () => {
    const limits = { recovery: 120, alert: 170 };
    assert.equal(heartZone(120, limits), 'calm');
    assert.equal(heartZone(121, limits), 'work');
    assert.equal(heartZone(170, limits), 'work');
    assert.equal(heartZone(171, limits), 'high');
  });
});

describe('dinlenme: nabız toparlanma sınırına inene kadar uzar', () => {
  const RECOVERY = 120;

  test('temel süre bittiğinde nabız sınırda ya da altındaysa uzamaz', () => {
    assert.deepEqual(restHoldStep(null, 120, RECOVERY, s(90), s(90)), { kind: 'end', at: s(90), high: false });
  });

  test('nabız yoksa bugünkü sayaç: uzamaz; uzarken nabız kesildiyse bekleme nabzın son görüldüğü an biter, tavanı geçmez', () => {
    assert.deepEqual(restHoldStep(null, null, RECOVERY, s(90), s(90)), { kind: 'end', at: s(90), high: false });
    const hold: RestHold = { since: s(90), calmSince: null, seenAt: s(100) };
    assert.deepEqual(restHoldStep(hold, null, RECOVERY, s(90), s(100)), { kind: 'end', at: s(100), high: false });
    // Sayfa yenilendi ya da telefon kilitliyken bant koptu, çok sonra dönüldü: bitiş o an değil, nabzın son görüldüğü an.
    assert.deepEqual(restHoldStep(hold, null, RECOVERY, s(90), s(700)), { kind: 'end', at: s(100), high: false });
    assert.deepEqual(restHoldStep({ ...hold, seenAt: s(250) }, null, RECOVERY, s(90), s(700)), { kind: 'end', at: s(210), high: false });
  });

  test('üstündeyse uzar; 3 sn boyunca sınırın altında kalınca biter', () => {
    let step = restHoldStep(null, 135, RECOVERY, s(90), s(90));
    assert.deepEqual(step, { kind: 'hold', hold: { since: s(90), calmSince: null, seenAt: s(90) } });
    if (step.kind !== 'hold') return;
    step = restHoldStep(step.hold, 119, RECOVERY, s(90), s(100));
    assert.deepEqual(step, { kind: 'hold', hold: { since: s(90), calmSince: s(100), seenAt: s(100) } });
    if (step.kind !== 'hold') return;
    // 2 sn sonra yeniden yükseldi: sayım baştan.
    step = restHoldStep(step.hold, 125, RECOVERY, s(90), s(102));
    assert.deepEqual(step, { kind: 'hold', hold: { since: s(90), calmSince: null, seenAt: s(102) } });
    if (step.kind !== 'hold') return;
    step = restHoldStep(step.hold, 118, RECOVERY, s(90), s(104));
    if (step.kind !== 'hold') return assert.fail('uzamalıydı');
    assert.equal(restHoldStep(step.hold, 117, RECOVERY, s(90), s(104) + REST_CALM_MS - 1).kind, 'hold');
    assert.deepEqual(restHoldStep(step.hold, 117, RECOVERY, s(90), s(104) + REST_CALM_MS), { kind: 'end', at: s(107), high: false });
  });

  test('değişmeyen bekleme aynı nesne kalır (kare kare kayıt yazılmasın); nabzın görüldüğü an saniyede bir yazılır', () => {
    const hold: RestHold = { since: s(90), calmSince: null, seenAt: s(90) };
    const step = restHoldStep(hold, 140, RECOVERY, s(90), s(90) + HOLD_SEEN_STEP_MS - 1);
    assert.equal(step.kind === 'hold' && step.hold, hold);
    assert.deepEqual(restHoldStep(hold, 140, RECOVERY, s(90), s(90) + HOLD_SEEN_STEP_MS), {
      kind: 'hold',
      hold: { ...hold, seenAt: s(90) + HOLD_SEEN_STEP_MS },
    });
    assert.ok(HOLD_SEEN_STEP_MS < 2000, 'canlı kopmada bitiş sesli kalsın (LATE_MS)');
  });

  test('en çok 120 sn uzar, sonra "nabız hâlâ yüksek" notuyla biter', () => {
    const hold: RestHold = { since: s(90), calmSince: null, seenAt: s(90) };
    assert.equal(restHoldStep(hold, 140, RECOVERY, s(90), s(90) + REST_EXTEND_MAX_MS - 1).kind, 'hold');
    assert.deepEqual(restHoldStep(hold, 140, RECOVERY, s(90), s(90) + REST_EXTEND_MAX_MS), { kind: 'end', at: s(210), high: true });
    // Geç fark edildiyse (sekme arkadaydı) bitiş anı sınırın kendisi.
    assert.deepEqual(restHoldStep(hold, 140, RECOVERY, s(90), s(400)), { kind: 'end', at: s(210), high: true });
  });

  test('sınıra gelindiğinde nabız inmiş ama 3 sn dolmamışsa not yok', () => {
    const hold: RestHold = { since: s(90), calmSince: s(209), seenAt: s(209) };
    assert.deepEqual(restHoldStep(hold, 115, RECOVERY, s(90), s(210)), { kind: 'end', at: s(210), high: false });
    // 3 sn sınırdan önce dolduysa bitiş o an.
    assert.deepEqual(restHoldStep({ since: s(90), calmSince: s(200), seenAt: s(200) }, 115, RECOVERY, s(90), s(260)), { kind: 'end', at: s(203), high: false });
  });

  test('tavan temel sürenin ilk bittiği andan sayılır (+15 sonrası yeni bekleme de)', () => {
    // İlk bekleme 60. sn'de başladı, +15'le temel süre 85'e uzadı: yeni beklemenin tavanı yine 60 + 120.
    const step = restHoldStep(null, 140, RECOVERY, s(85), s(85), s(60));
    assert.deepEqual(step, { kind: 'hold', hold: { since: s(60), calmSince: null, seenAt: s(85) } });
    if (step.kind !== 'hold') return;
    assert.deepEqual(restHoldStep(step.hold, 140, RECOVERY, s(85), s(180), s(60)), { kind: 'end', at: s(180), high: true });
    // Temel süre tavandan sonraya uzatıldıysa yeniden uzamaz; nabız yüksekse not yazılır.
    assert.deepEqual(restHoldStep(null, 140, RECOVERY, s(185), s(185), s(60)), { kind: 'end', at: s(185), high: true });
    assert.deepEqual(restHoldStep(null, 110, RECOVERY, s(185), s(185), s(60)), { kind: 'end', at: s(185), high: false });
  });

  test('geç fark edildiyse de tavan dolmadıysa bekler; dolduysa bitiş anı tavan', () => {
    assert.deepEqual(restHoldStep(null, 140, RECOVERY, s(60), s(100)), { kind: 'hold', hold: { since: s(60), calmSince: null, seenAt: s(100) } });
    assert.deepEqual(restHoldStep(null, 140, RECOVERY, s(60), s(300)), { kind: 'end', at: s(180), high: true });
  });

  test('metin: sınırın kendisi ve yönelme eki ("Nabzın 120\'ye inince devam")', () => {
    assert.equal(calmText(120), "Nabzın 120'ye inince devam");
    assert.equal(calmText(126), "Nabzın 126'ya inince devam");
    assert.equal(calmText(125), "Nabzın 125'e inince devam");
    assert.equal(calmText(100), "Nabzın 100'e inince devam");
    assert.equal(calmText(90), "Nabzın 90'a inince devam");
  });
});

describe('uyarı: 5 sn boyunca uyarı sınırının üstünde', () => {
  const ALERT = 170;
  /** Okumaları sırayla verir; uyarının çaldığı anları (sn) toplar. */
  function run(readings: [number, number | null][], start: HeartAlertState = HEART_ALERT_IDLE) {
    let state = start;
    const fired: number[] = [];
    for (const [second, bpm] of readings) {
      const step = heartAlertStep(state, bpm, ALERT, s(second));
      state = step.state;
      if (step.fire) fired.push(second);
    }
    return { state, fired };
  }

  test('5 sn üstünde kalınca bir kez uyarır; sınırda kalmak üstünde sayılmaz', () => {
    assert.deepEqual(run([[0, 170], [6, 170]]).fired, []);
    assert.deepEqual(run([[0, 175], [2, 178], [4, 176], [5, 175], [8, 180], [20, 182]]).fired, [5]);
  });

  test('arada inerse sayım baştan', () => {
    assert.deepEqual(run([[0, 175], [3, 168], [4, 175], [8, 176], [9, 176]]).fired, [9]);
  });

  test('sınırın 5 altına inene kadar yeniden uyarmaz', () => {
    const { fired } = run([[0, 175], [5, 175], [6, 168], [7, 175], [12, 175], [13, 165], [14, 175], [19, 175]]);
    assert.deepEqual(fired, [5, 19]);
  });

  test('ölçüm yoksa (bağlantı kesildi, koptu ya da 5 sn ölçüm yok) sayım durur, çalmış uyarı düşer (şerit kalkar)', () => {
    assert.deepEqual(run([[0, 175], [3, null], [4, 175], [8, 175], [9, 175]]).fired, [9]);
    const { fired, state } = run([[0, 175], [5, 175], [6, null]]);
    assert.deepEqual([fired, state], [[5], HEART_ALERT_IDLE]);
    // Bağlantı dönünce yeniden sayılır.
    assert.deepEqual(run([[0, 175], [5, 175], [6, null], [7, 175], [12, 175]]).fired, [5, 12]);
  });

  test('metin', () => {
    assert.equal(heartAlertText(175), 'Nabzın çok yüksek (175). Tempoyu düşür ve dinlen.');
  });
});

describe('okumalar: boş ölçüm hemen silmez, 5 sn sonra bayatlar', () => {
  test('geçerli ölçüm alınır; boş ölçüm (ten teması yok, 0) son geçerli ölçümü bırakır', () => {
    let last = takeReading(null, 140, s(0));
    assert.deepEqual(last, { bpm: 140, at: s(0) });
    last = takeReading(last, null, s(1));
    assert.deepEqual(last, { bpm: 140, at: s(0) });
    assert.equal(readingBpm(last, s(1)), 140);
    assert.equal(readingBpm(last, s(0) + READING_STALE_MS - 1), 140);
    assert.equal(readingBpm(last, s(0) + READING_STALE_MS), null);
    assert.equal(readingBpm(takeReading(last, 120, s(4)), s(8)), 120);
    assert.equal(readingBpm(null, s(0)), null);
  });
});

describe('deneme nabzı (yalnız geliştirmede)', () => {
  test('sette yükselir, dinlenmede düşer; sınırların içinde kalır', () => {
    let bpm = 95;
    for (let second = 0; second < 40; second++) bpm = fakeHeartRate(bpm, false, 1000);
    assert.ok(bpm > 165, `sette yükselmeliydi: ${bpm}`);
    const peak = bpm;
    for (let second = 0; second < 60; second++) bpm = fakeHeartRate(bpm, true, 1000);
    assert.ok(bpm < peak - 20 && bpm > 120, `dinlenmede inmeli ama hemen değil: ${bpm}`);
    for (let second = 0; second < 600; second++) bpm = fakeHeartRate(bpm, true, 1000);
    assert.ok(bpm >= 60 && bpm < 100, `dinlenmede sakinleşmeli: ${bpm}`);
  });
});

describe('nabız metinleri İngilizce (en)', () => {
  test('dinlenmenin "inince devam" metni ve uyarı: Türkçe ek yok', () => {
    assert.equal(calmText(120, 'en'), 'Continue once your heart rate drops to 120');
    assert.equal(calmText(90, 'en'), 'Continue once your heart rate drops to 90');
    assert.equal(heartAlertText(175, 'en'), 'Your heart rate is very high (175). Slow down and rest.');
  });
});
