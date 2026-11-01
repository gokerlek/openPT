import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';
import { todayIn } from './format.ts';
import { applyProgramEdit } from './program-diff.ts';
import { programSchema } from './schemas/program.ts';
import { programFile } from './testing/session-fixtures.ts';
import { weekdayNames } from './day-assignments.ts';
import {
  addDays,
  assignedWeek,
  assignmentsText,
  dayShortName,
  effectiveSchedule,
  frequencyMismatch,
  isoWeekdayOf,
  nextTrainingDate,
  normalizeWeekdays,
  phaseFrequency,
  programWeekTarget,
  relativeDayText,
  resetClientSchedule,
  scheduleSince,
  todayAssigned,
  todayCardTitle,
  todayState,
  upcomingAssigned,
  weekDates,
  weekdayNamesText,
  weekdaysChangeText,
  weekdaysText,
  weekPlan,
  weekRotation,
  weekStrip,
  weekTarget,
} from './training-days.ts';

/** 26 Eylül 2026 cumartesi. */
const SATURDAY = '2026-09-26';
const NOW = new Date('2026-09-26T16:00:00.000Z');

function program(extra: Record<string, unknown> = {}) {
  const parsed = v.parse(programSchema, programFile({}, extra));
  return parsed;
}

describe('antrenman günleri: takvim', () => {
  test('ISO hafta günü, pazartesi başlayan hafta, gün ekleme', () => {
    assert.equal(isoWeekdayOf('2026-09-21'), 1);
    assert.equal(isoWeekdayOf(SATURDAY), 6);
    assert.equal(isoWeekdayOf('2026-09-27'), 7);
    assert.equal(isoWeekdayOf('1970-01-01'), 4);
    assert.deepEqual(weekDates(SATURDAY), ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27']);
    assert.equal(addDays('2026-09-30', 1), '2026-10-01');
    assert.equal(addDays('2026-03-28', 2), '2026-03-30', 'yaz saati geçişi günü atlatmaz');
  });

  test('günler tekilleşir, sıralanır; geçersizler düşer; kısa adlarla metin', () => {
    assert.deepEqual(normalizeWeekdays([5, 1, 3, 3, 0, 8, 2.5]), [1, 3, 5]);
    assert.equal(weekdaysText([5, 1, 3]), 'Pzt, Çar, Cum');
    assert.equal(weekdaysText([]), '');
  });

  test('gün şeridi: seçili, yapılan, kaçan (geçmiş ve yapılmamış seçili gün), bugün', () => {
    const strip = weekStrip({ today: '2026-09-24', weekdays: [1, 3, 5], doneDays: ['2026-09-21', '2026-09-22'] });
    assert.equal(strip.length, 7);
    const [mon, tue, wed, thu, fri] = strip;
    assert.deepEqual(mon, { date: '2026-09-21', weekday: 1, selected: true, done: true, missed: false, today: false });
    assert.equal(tue?.done, true, 'seçili olmayan günde yapılan antrenman da dolu');
    assert.equal(tue?.selected, false);
    assert.equal(wed?.missed, true, 'çarşamba seçiliydi, antrenman yok');
    assert.equal(thu?.today, true);
    assert.equal(fri?.missed, false, 'gelecek gün kaçmış sayılmaz');
  });

  test('gün şeridi: pencereden (program, günler, katılım) önceki seçili gün kaçmış sayılmaz', () => {
    // Pazar kurulan program: aynı haftanın pazartesi ve çarşambası "kaçırıldı" olmaz.
    const sunday = weekStrip({ today: '2026-09-27', weekdays: [1, 3, 5], doneDays: [], since: '2026-09-27' });
    assert.deepEqual(sunday.filter((day) => day.missed), []);
    // Çarşamba katıldı: pazartesi ve çarşamba sayılmaz, cuma kaçtı.
    const wednesday = weekStrip({ today: '2026-09-27', weekdays: [1, 3, 5], doneDays: [], since: '2026-09-23' });
    assert.deepEqual(wednesday.filter((day) => day.missed).map((day) => day.date), ['2026-09-25']);
    // Pencere yoksa (eski önbellek) eski davranış.
    assert.equal(weekStrip({ today: '2026-09-27', weekdays: [1, 3, 5], doneDays: [], since: null }).filter((day) => day.missed).length, 3);
  });

  test('pencerenin başı: program, PT\'nin günleri, ilk giriş ve durum değişiminin en yenisi; kayıtta danışanın katmanı varken şimdi', () => {
    const program = { createdAt: '2026-09-01T10:00:00.000Z', schedule: { weekdays: [1, 3, 5], at: '2026-09-10T10:00:00.000Z' } };
    const client = { access: {}, statusChangedAt: undefined };
    const now = new Date('2026-09-27T09:00:00.000Z');
    assert.equal(scheduleSince(program, client, now), '2026-09-10T10:00:00.000Z');
    assert.equal(scheduleSince({ ...program, clientSchedule: { weekdays: [2], at: '2026-09-12T10:00:00.000Z' } }, client, now), now.toISOString());
    assert.equal(scheduleSince(program, { access: { joinedAt: '2026-09-20T10:00:00.000Z', lastJoinAt: '2026-09-25T10:00:00.000Z' } }, now), '2026-09-20T10:00:00.000Z', 'ilk giriş, son giriş değil');
    assert.equal(scheduleSince(program, { access: { lastJoinAt: '2026-09-21T10:00:00.000Z' } }, now), '2026-09-21T10:00:00.000Z', 'eski kayıtta son giriş');
    assert.equal(scheduleSince(program, { access: {}, statusChangedAt: '2026-09-24T10:00:00.000Z' }, now), '2026-09-24T10:00:00.000Z', 'duraklatmadan dönüş');
    assert.equal(scheduleSince({}, { access: {} }, now), undefined);
  });
});

describe('antrenman günleri: Bugün kartının satırı', () => {
  test('sıradaki antrenman günü: bugünden sonra ilk seçili gün; bir hafta sonrası da', () => {
    assert.equal(nextTrainingDate(SATURDAY, [1, 3, 5]), '2026-09-28');
    assert.equal(nextTrainingDate('2026-09-21', [1, 3, 5]), '2026-09-23');
    assert.equal(nextTrainingDate('2026-09-21', [1]), '2026-09-28');
    assert.equal(nextTrainingDate('2026-09-21', [1], { includeToday: true }), '2026-09-21');
    assert.equal(nextTrainingDate(SATURDAY, []), null);
  });

  test('antrenman günü, dinlenme günü, bugün yapıldı, gün seçilmemiş', () => {
    assert.deepEqual(todayState({ today: '2026-09-23', weekdays: [1, 3, 5], doneToday: false }), { kind: 'training' });
    assert.deepEqual(todayState({ today: '2026-09-22', weekdays: [1, 3, 5], doneToday: false }), { kind: 'rest', next: '2026-09-23' });
    assert.deepEqual(todayState({ today: SATURDAY, weekdays: [3], doneToday: false }), { kind: 'rest', next: '2026-09-30' });
    assert.deepEqual(todayState({ today: '2026-09-23', weekdays: [3], doneToday: true }), { kind: 'done', next: '2026-09-30' });
    assert.deepEqual(todayState({ today: SATURDAY, weekdays: [], doneToday: true }), { kind: 'none' });
  });

  test('göreli gün: yarın, haftanın günü, bir hafta sonrası', () => {
    assert.equal(relativeDayText('2026-09-27', SATURDAY), 'yarın');
    assert.equal(relativeDayText('2026-09-28', SATURDAY), 'Pazartesi');
    assert.equal(relativeDayText('2026-09-30', '2026-09-23'), 'gelecek Çarşamba');
  });

  // 26 Ekim 2026 pazartesi.
  test('Bugün kartının başlığı: antrenmanın günü ve adı', () => {
    assert.equal(todayCardTitle({ today: '2026-10-26', weekdays: [1, 3], doneToday: false, dayName: 'Gün A' }), 'Pazartesi · Gün A');
    assert.equal(todayCardTitle({ today: '2026-10-26', weekdays: [1, 3], doneToday: true, dayName: 'Gün B' }), 'Çarşamba · Gün B');
    assert.equal(todayCardTitle({ today: '2026-10-27', weekdays: [1, 3], doneToday: false, dayName: 'Gün B' }), 'Çarşamba · Gün B');
    assert.equal(todayCardTitle({ today: '2026-10-26', weekdays: [], doneToday: false, dayName: 'Gün A' }), 'Gün A');
    // Tek gün seçili ve bugün yapıldı: bir hafta sonrası.
    assert.equal(todayCardTitle({ today: '2026-10-26', weekdays: [1], doneToday: true, dayName: 'Gün B' }), 'Pazartesi · Gün B');
  });

  test('"bu hafta x/y": y seçili gün sayısı, yoksa sıklık; sıklıktan farklıysa uyarı', () => {
    assert.equal(weekTarget([1, 3, 5, 6], 3), 4);
    assert.equal(weekTarget([], 3), 3);
    assert.equal(weekTarget([]), null);
    assert.equal(frequencyMismatch([1, 3, 5, 6], 3), true);
    assert.equal(frequencyMismatch([1, 3, 5], 3), false);
    assert.equal(frequencyMismatch([1, 3], undefined), false);
    assert.equal(frequencyMismatch([], 3), false);
  });

  test('programın haftalık hedefi (dondurma): geçerli gün sayısı, yoksa şu anki evrenin sıklığı', () => {
    const raw = programFile({}, { schedule: { weekdays: [2, 4] } });
    const stored = v.parse(programSchema, { ...raw, phases: raw.phases.map((phase) => ({ ...phase, daysPerWeek: 3 })) });
    assert.equal(programWeekTarget(stored), 2);
    // Eski programın ilk PT kaydı atamalı evrede sıklığı düşürür: sonraki yazımın dondurduğu hedef yine 2 (1 değil).
    const { daysPerWeek: _dropped, ...phase } = stored.phases[0]!;
    const saved = applyProgramEdit(stored, { phased: false, currentPhaseId: stored.current.phaseId, phases: [phase] }, { exercises: new Map(), devices: new Map() }, NOW);
    assert.ok(saved);
    assert.equal(saved.program.phases[0]?.daysPerWeek, undefined);
    assert.equal(programWeekTarget(saved.program), 2);
    // Gün yoksa sıklık; o da yoksa hedef yok.
    const plain = programFile();
    assert.equal(programWeekTarget(v.parse(programSchema, { ...plain, phases: plain.phases.map((item) => ({ ...item, daysPerWeek: 3 })) })), 3);
    assert.equal(programWeekTarget(program()), undefined);
  });
});

describe('hafta planı', () => {
  // 26 Ekim 2026 pazartesi.
  const rotation = { names: ['Gün A', 'Gün B', 'Gün C'], next: 1 };

  test('yapılanın adı, sıradaki ve dönüşe göre sonraki; seçili olmayan gün dinlenme', () => {
    const days = weekPlan({ today: '2026-10-28', weekdays: [1, 3, 5], sessions: [{ date: '2026-10-26', dayName: 'Gün A' }], since: null, rotation });
    assert.deepEqual(
      days.map((day) => [day.date, day.state, day.label]),
      [
        ['2026-10-26', 'done', 'Gün A'],
        ['2026-10-27', 'rest', null],
        ['2026-10-28', 'next', 'Gün B'],
        ['2026-10-29', 'rest', null],
        ['2026-10-30', 'planned', 'Gün C'],
        ['2026-10-31', 'rest', null],
        ['2026-11-01', 'rest', null],
      ],
    );
  });

  test('kaçan gün adsız; seçili olmayan günde yapılan da "yapıldı"; pencere öncesi kaçmış sayılmaz', () => {
    const days = weekPlan({
      today: '2026-10-30',
      weekdays: [1, 3, 5],
      sessions: [{ date: '2026-10-26', dayName: 'Gün A' }, { date: '2026-10-27', dayName: 'Gün B' }],
      since: null,
      rotation: { names: ['Gün A', 'Gün B', 'Gün C'], next: 2 },
    });
    assert.deepEqual(days.slice(0, 5).map((day) => [day.state, day.label]), [
      ['done', 'Gün A'],
      ['done', 'Gün B'],
      ['missed', null],
      ['rest', null],
      ['next', 'Gün C'],
    ]);
    const fresh = weekPlan({ today: '2026-10-30', weekdays: [1, 3, 5], sessions: [], since: '2026-10-28', rotation });
    assert.deepEqual(fresh.slice(0, 3).map((day) => day.state), ['rest', 'rest', 'rest']);
  });

  test('bugünkü antrenman yapıldıysa sıradaki sonraki seçili gün', () => {
    const days = weekPlan({ today: '2026-10-26', weekdays: [1, 3], sessions: [{ date: '2026-10-26', dayName: 'Gün A' }], since: null, rotation });
    assert.deepEqual(days.slice(0, 3).map((day) => [day.state, day.label]), [['done', 'Gün A'], ['rest', null], ['next', 'Gün B']]);
  });

  test('kenarlar: aynı gün iki oturum, adsız yapılan gün, gün yok, dönüş boş, sıra listenin dışında', () => {
    // Çarşamba bugün; Pzt geçti, Çar sırada, Cum planlı.
    const base = { today: '2026-10-28', weekdays: [1, 3, 5], sessions: [], since: null, rotation };
    const rest = ['rest', null];
    const cases: { name: string; input: Partial<Parameters<typeof weekPlan>[0]>; expected: (string | null)[][] }[] = [
      {
        name: 'aynı gün iki oturum: sonuncunun adı',
        input: { sessions: [{ date: '2026-10-26', dayName: 'Gün A' }, { date: '2026-10-26', dayName: 'Gün C' }] },
        expected: [['done', 'Gün C'], rest, ['next', 'Gün B'], rest, ['planned', 'Gün C'], rest, rest],
      },
      {
        name: 'yapılan günün oturumu yok (eski yanıt): yapıldı, adsız',
        input: { doneDays: ['2026-10-26'] },
        expected: [['done', null], rest, ['next', 'Gün B'], rest, ['planned', 'Gün C'], rest, rest],
      },
      {
        name: 'gün seçilmemiş: hepsi dinlenme, yapılan yine yapıldı',
        input: { weekdays: [], sessions: [{ date: '2026-10-27', dayName: 'Gün A' }] },
        expected: [rest, ['done', 'Gün A'], rest, rest, rest, rest, rest],
      },
      {
        name: 'dönüş boş: sıradaki ve planlı adsız',
        input: { rotation: { names: [], next: 0 } },
        expected: [['missed', null], rest, ['next', null], rest, ['planned', null], rest, rest],
      },
      {
        // Çağıranlar bulunamayan sıradaki günü 0'a çevirir (`training-week.tsx` → `planOf`); burada yalnız sarma.
        name: 'eksi sıra: sarılır',
        input: { rotation: { names: rotation.names, next: -1 } },
        expected: [['missed', null], rest, ['next', 'Gün C'], rest, ['planned', 'Gün A'], rest, rest],
      },
      {
        name: 'sıra listeden büyük (5 / 3 ad): sarılır',
        input: { rotation: { names: rotation.names, next: 5 } },
        expected: [['missed', null], rest, ['next', 'Gün C'], rest, ['planned', 'Gün A'], rest, rest],
      },
      {
        name: 'sıra sayı değil (NaN): baştan',
        input: { rotation: { names: rotation.names, next: Number.NaN } },
        expected: [['missed', null], rest, ['next', 'Gün A'], rest, ['planned', 'Gün B'], rest, rest],
      },
    ];
    for (const item of cases) {
      const days = weekPlan({ ...base, ...item.input });
      assert.deepEqual(
        days.map((day) => [day.state, day.label]),
        item.expected,
        item.name,
      );
    }
  });

  test('bugün başlamış yarım antrenman: şerit onun gününden sürer', () => {
    const pairs = (days: ReturnType<typeof weekPlan>) => days.map((day) => [day.state, day.label]);
    const rest = ['rest', null];
    // Çarşamba bugün, sıradaki Gün A ama "Başka gün seç"le Gün B başladı: bugün Gün B, cuma onun arkasından Gün C.
    assert.deepEqual(
      pairs(weekPlan({ today: '2026-10-28', weekdays: [1, 3, 5], sessions: [{ date: '2026-10-26', dayName: 'Gün C' }], since: null, rotation: { ...rotation, next: 0, active: 1 } })),
      [['done', 'Gün C'], rest, ['next', 'Gün B'], rest, ['planned', 'Gün C'], rest, rest],
    );
    // Dinlenme günü (salı) başlanan Gün B: bugünü kaplar, sıradaki seçili gün onun arkasındaki Gün C.
    assert.deepEqual(
      pairs(weekPlan({ today: '2026-10-27', weekdays: [1, 3, 5], sessions: [{ date: '2026-10-26', dayName: 'Gün A' }], since: null, rotation: { ...rotation, active: 1 } })),
      [['done', 'Gün A'], rest, ['next', 'Gün C'], rest, ['planned', 'Gün A'], rest, rest],
    );
    // Bugün bir antrenman bitti, ikincisi (Gün C) yarım: bugün yapıldı, cuma Gün C'nin arkasından Gün A.
    assert.deepEqual(
      pairs(weekPlan({ today: '2026-10-28', weekdays: [1, 3, 5], sessions: [{ date: '2026-10-28', dayName: 'Gün B' }], since: null, rotation: { ...rotation, active: 2 } })),
      [['missed', null], rest, ['done', 'Gün B'], rest, ['next', 'Gün A'], rest, rest],
    );
    // Yarım antrenman yok ya da sırası bozuk: `next`.
    for (const active of [null, undefined, Number.NaN, 1.5]) {
      assert.deepEqual(
        pairs(weekPlan({ today: '2026-10-28', weekdays: [1, 3, 5], sessions: [], since: null, rotation: { ...rotation, active } })).slice(2, 5),
        [['next', 'Gün B'], rest, ['planned', 'Gün C']],
        String(active),
      );
    }
  });

  test('şeridin dönüşü programın günlerinden: sıradaki gün, bugünkü yarım antrenmanın günü', () => {
    const days = [{ id: 'd_a', name: 'Gün A' }, { id: 'd_b', name: 'Gün B' }, { id: 'd_c', name: 'Gün C' }];
    const today = '2026-10-28';
    assert.deepEqual(weekRotation({ days, nextDayId: 'd_b', today }), { names: ['Gün A', 'Gün B', 'Gün C'], next: 1, active: null });
    assert.equal(weekRotation({ days, nextDayId: 'd_x', today }).next, 0, 'bulunamayan sıradaki gün: ilk gün');
    assert.equal(weekRotation({ days, nextDayId: null, today }).next, 0);
    assert.equal(weekRotation({ days, nextDayId: 'd_a', today, active: { dayId: 'd_c', date: today } }).active, 2);
    assert.equal(weekRotation({ days, nextDayId: 'd_a', today, active: { dayId: 'd_c', date: '2026-10-27' } }).active, null, 'dünden kalan yarım antrenman');
    assert.equal(weekRotation({ days, nextDayId: 'd_a', today, active: { dayId: 'd_x', date: today } }).active, null, 'başka evrenin ya da programın günü');
    assert.equal(weekRotation({ days, nextDayId: 'd_a', today, active: null }).active, null);
    assert.deepEqual(weekRotation({ days: [], nextDayId: null, today, active: { dayId: 'd_a', date: today } }), { names: [], next: 0, active: null });
  });

  test('kısa ad: "Program …" ve "Gün …" → ardından gelen her şey, ötekinde ilk sözcük', () => {
    assert.equal(dayShortName('Program A'), 'A');
    assert.equal(dayShortName('Program A 2'), 'A 2');
    assert.equal(dayShortName('Gün B'), 'B');
    assert.equal(dayShortName('Alt vücut'), 'Alt');
    assert.equal(dayShortName('Programım'), 'Programım');
    assert.equal(dayShortName('Gün A'), 'A');
    assert.equal(dayShortName('Gün A 2'), 'A 2');
    assert.equal(dayShortName('  gün  B  '), 'B');
    assert.equal(dayShortName('Üst vücut'), 'Üst');
    assert.equal(dayShortName('Bacak'), 'Bacak');
    assert.equal(dayShortName('Gün'), 'Gün');
  });
});

// Faz 3 (Karar 3): danışan günleri değiştirmez; kayıttaki eski katman okunur ama yok sayılır. Danışanın "Günlerini
// değiştir"i (`applyClientSchedule`) kalktı; PT'nin "Programdaki günlere dön"ü 15. göreve kadar çalışır.
describe('antrenman günleri: danışanın eski katmanı', () => {
  test('geçerli günler yalnız PT\'nin: kayıttaki katman yok sayılır', () => {
    assert.deepEqual(effectiveSchedule(program()), { weekdays: [], pt: [], client: null, source: null });
    const pt = program({ schedule: { weekdays: [5, 1, 3] } });
    assert.deepEqual(effectiveSchedule(pt).weekdays, [1, 3, 5]);
    assert.equal(effectiveSchedule(pt).source, 'pt');
    const own = program({ schedule: { weekdays: [1, 3, 5] }, clientSchedule: { weekdays: [2, 4, 6], at: '2026-09-25T10:00:00.000Z' } });
    assert.deepEqual(effectiveSchedule(own), { weekdays: [1, 3, 5], pt: [1, 3, 5], client: null, source: 'pt' });
  });

  test('"PT\'nin günlerine dön": katman silinir, revision artmaz; katman yoksa değişiklik yok', () => {
    const own = program({ schedule: { weekdays: [1, 3, 5] }, clientSchedule: { weekdays: [2, 4, 6], at: '2026-09-25T10:00:00.000Z' } });
    const result = resetClientSchedule(own, NOW);
    assert.ok(result);
    assert.equal('clientSchedule' in result.program, false);
    assert.deepEqual(result.program.schedule, { weekdays: [1, 3, 5], at: NOW.toISOString() });
    assert.equal(result.program.revision, own.revision);
    assert.equal(result.text, 'Danışanın günleri kaldırıldı (Sal, Per, Cmt); geçerli günler: Pzt, Çar, Cum');
    assert.equal(result.program.log[0]?.kind, 'edit');
    assert.equal(resetClientSchedule(program({ schedule: { weekdays: [1] } }), NOW), null);
  });
});

describe('Faz 3: atamalı hafta', () => {
  // 26 Ekim 2026 pazartesi.
  const phase = {
    id: 'p_aaaaaa',
    days: [
      { id: 'd_aaaaaa', name: 'Alt vücut', weekdays: [2] },
      { id: 'd_bbbbbb', name: 'Üst vücut', weekdays: [4] },
      { id: 'd_cccccc', name: 'Tüm vücut', weekdays: [7] },
    ],
  };
  const program = { phases: [phase], current: { phaseId: 'p_aaaaaa', startedAt: '2026-10-01T00:00:00.000Z' } };
  const names = weekdayNames(phase.days);
  const client = { access: {}, statusChangedAt: undefined };
  const rows = (days: ReturnType<typeof assignedWeek>) => days.map((day) => [day.state, day.label]);

  test('bugünün ve sıradaki atanmış program', () => {
    assert.equal(todayAssigned(phase.days, '2026-10-27')?.name, 'Alt vücut');
    assert.equal(todayAssigned(phase.days, '2026-10-28'), null);
    assert.deepEqual(upcomingAssigned(program, '2026-10-27'), { dayId: 'd_aaaaaa', date: '2026-10-27' });
    assert.deepEqual(upcomingAssigned(program, '2026-10-28'), { dayId: 'd_bbbbbb', date: '2026-10-29' });
    assert.deepEqual(upcomingAssigned(program, '2026-11-02'), { dayId: 'd_aaaaaa', date: '2026-11-03' });
    // Cuma: sıradaki pazar (7), aynı hafta.
    assert.deepEqual(upcomingAssigned(program, '2026-10-30'), { dayId: 'd_cccccc', date: '2026-11-01' });
    // Yalnız salı: çarşambadan 6 gün ileri, hafta sınırını geçer.
    const tuesdays = { phases: [{ id: 'p_aaaaaa', days: [{ id: 'd_aaaaaa', name: 'Alt vücut', weekdays: [2] }] }], current: program.current };
    assert.deepEqual(upcomingAssigned(tuesdays, '2026-10-28'), { dayId: 'd_aaaaaa', date: '2026-11-03' });
    const bare = { phases: [{ id: 'p_aaaaaa', days: [{ id: 'd_aaaaaa', name: 'Program A' }] }], current: program.current };
    assert.equal(upcomingAssigned(bare, '2026-10-27'), null);
  });

  test('pazartesi Alt vücut yapıldı: salı yine Alt vücut (kaydırma yok)', () => {
    const days = assignedWeek({ today: '2026-10-27', weekdays: [2, 4, 7], names, sessions: [{ date: '2026-10-26', dayName: 'Alt vücut' }], since: null });
    assert.deepEqual(rows(days), [
      ['done', 'Alt vücut'],
      ['planned', 'Alt vücut'],
      ['rest', null],
      ['planned', 'Üst vücut'],
      ['rest', null],
      ['rest', null],
      ['planned', 'Tüm vücut'],
    ]);
  });

  test('atanmış gün geçti, antrenman yok: kaçtı (adıyla); pencereden önce kaçmış sayılmaz', () => {
    const missed = assignedWeek({ today: '2026-10-29', weekdays: [2, 4, 7], names, sessions: [], since: null });
    assert.deepEqual(rows(missed).slice(1, 4), [['missed', 'Alt vücut'], ['rest', null], ['planned', 'Üst vücut']]);
    const fresh = assignedWeek({ today: '2026-10-29', weekdays: [2, 4, 7], names, sessions: [], since: '2026-10-28' });
    assert.equal(fresh[1]?.state, 'rest');
    assert.equal(fresh[1]?.selected, true);
  });

  test('aynı gün iki antrenman: sonuncusunun adı; atanmamış günde yapılan da "yapıldı"', () => {
    const days = assignedWeek({
      today: '2026-10-29',
      weekdays: [2, 4, 7],
      names,
      sessions: [{ date: '2026-10-28', dayName: 'Üst vücut' }, { date: '2026-10-28', dayName: 'Tüm vücut' }],
      since: null,
    });
    assert.deepEqual(days[2] && [days[2].state, days[2].label], ['done', 'Tüm vücut']);
  });

  test('geçerli günler yalnız PT\'nin: atamalıda birleşim, danışanın katmanı her zaman yok sayılır', () => {
    const layer = { weekdays: [1, 3], at: '2026-10-20T08:00:00.000Z' };
    assert.deepEqual(effectiveSchedule({ ...program, schedule: { weekdays: [2, 4, 7] }, clientSchedule: layer }), {
      weekdays: [2, 4, 7], pt: [2, 4, 7], client: null, source: 'pt',
    });
    const bare = { phases: [{ id: 'p_aaaaaa', days: [{ id: 'd_aaaaaa', name: 'Program A' }] }], current: program.current, clientSchedule: layer };
    assert.deepEqual(effectiveSchedule(bare), { weekdays: [], pt: [], client: null, source: null });
  });

  // Danışan katman kaydedilmişken yayına kadar kendi günlerini izliyordu: PT'nin o günleri "kaçtı" sayılmaz. Katman
  // kayıtta durdukça pencere bugünden başlar; ilk PT kaydı (ya da evre geçişi) katmanı düşürür ve `schedule.at`'i
  // şimdiye alır (`settleSchedule`), iki hâl aynı yere varır.
  test('kaçan gün penceresi: kayıtta danışanın katmanı varken bugünden; katman düşünce PT\'nin anından', () => {
    const stored = {
      ...program,
      createdAt: '2026-09-01T10:00:00.000Z',
      schedule: { weekdays: [2, 4, 7], at: '2026-09-05T10:00:00.000Z' },
      clientSchedule: { weekdays: [1, 3], at: '2026-10-20T08:00:00.000Z' },
    };
    const now = new Date('2026-10-29T09:00:00.000Z');
    assert.equal(scheduleSince(stored, client, now), now.toISOString());
    const since = todayIn('Europe/Istanbul', new Date(scheduleSince(stored, client, now) as string));
    const strip = assignedWeek({ today: '2026-10-29', weekdays: [2, 4, 7], names, sessions: [], since });
    assert.equal(strip.some((day) => day.state === 'missed'), false, 'salı Alt vücut kaçmış sayılmaz');
    const { clientSchedule: _layer, ...dropped } = stored;
    const settled = { ...dropped, schedule: { ...stored.schedule, at: '2026-10-28T08:00:00.000Z' } };
    assert.equal(scheduleSince(settled, client, now), '2026-10-28T08:00:00.000Z');
    assert.equal(scheduleSince(dropped, client, now), '2026-09-05T10:00:00.000Z');
  });

  test('haftalık hedef ve evrenin sıklığı: atanmış gün sayısı, yoksa daysPerWeek', () => {
    assert.equal(programWeekTarget({ ...program, schedule: { weekdays: [2, 4, 7] } }), 3);
    const bare = { id: 'p_aaaaaa', daysPerWeek: 2, days: [{ id: 'd_aaaaaa', name: 'Program A' }] };
    assert.equal(phaseFrequency(bare), 2);
    assert.equal(phaseFrequency(phase), 3);
    assert.equal(programWeekTarget({ phases: [bare], current: program.current }), 2);
  });

  test('metinler', () => {
    assert.equal(assignmentsText(phase.days), 'Sal · Alt vücut, Per · Üst vücut, Paz · Tüm vücut');
    assert.equal(assignmentsText([{ id: 'd_aaaaaa', name: 'Program A' }]), '');
    assert.equal(weekdayNamesText([4, 2]), 'Salı, Perşembe');
  });
});

// PT'nin kaydındaki günlerin testleri (`ptScheduleEdit`) Faz 3'te `settleSchedule`'a taşındı (`program-plan.test.ts`).
describe('antrenman günleri: geçmiş', () => {
  test('geçmişin cümlesi', () => {
    assert.equal(weekdaysChangeText([1, 3, 5], [2, 4, 6]), 'Antrenman günleri: Pzt, Çar, Cum → Sal, Per, Cmt');
  });
});
