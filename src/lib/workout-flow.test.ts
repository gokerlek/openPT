import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';
import { sessionDocSchema, type SessionDoc } from './schemas/session.ts';
import { at, DAY_A, DAY_B, programFile, sessionDoc, sessionEntry, singleBlock, W1, workingSet } from './testing/session-fixtures.ts';
import { BENCH, CRUNCH, DB_PRESS, dayWithBlocks, DEVICES, PLANK, PUSH_UP, workoutDay } from './testing/workout-fixtures.ts';
import { mergeAll } from './session-merge.ts';
import { addExtraRound, afterLog, cursorOf, easyShortcut, ensureEntries, logSet, logWarmup, newSessionDoc, nextSet, setViews } from './workout-session.ts';
import { nextMemberLetter } from './workout-groups.ts';
import {
  addExercise,
  canSwap,
  dropAt,
  dropWithUndo,
  effectiveDay,
  finishRotation,
  firstSkippedKey,
  itemName,
  listView,
  listWindow,
  localWorkoutDay,
  moveUnit,
  moveUnitTo,
  nextUnitAfter,
  optionText,
  restoreAt,
  swapRow,
  undoSkip,
  undoSwitchPrep,
  validFocus,
  withExtraRounds,
  withFinishReason,
} from './workout-flow.ts';
import { addedRowFor, extraKey, rekeyExtra, swapRowFor, type ExtraRows, type WorkoutDay } from './workout-plan.ts';

/** Belirlenimli "rastgelelik": her çağrıda farklı baytlar, kimlikler çakışmaz (`from`: başka bir cihaz). */
function sequence(from = 0) {
  let n = from;
  return (size: number) => Uint8Array.from({ length: size }, () => (n++ * 7) % 252);
}

const stamp = (minute: number) => ({ at: at(minute), by: W1 });

function start(day: WorkoutDay): SessionDoc {
  return newSessionDoc(day, { today: '2026-09-26', now: new Date(at(0)), writer: W1, random: sequence() });
}

function logNext(day: WorkoutDay, doc: SessionDoc, minute: number, random = sequence()): SessionDoc {
  const next = nextSet(day, doc);
  if (!next) throw new Error('Set kalmadı.');
  return logSet(day, doc, { rowId: next.rowId, setIndex: next.setIndex, kg: next.kg, value: next.value, extra: next.extra === true, stamp: stamp(minute), random }).doc;
}

/** Liste + odak: odaktaki birimin sıradaki setini önceden dolu değerleriyle kaydeder. */
function logFocused(day: WorkoutDay, doc: SessionDoc, focus: string, minute: number): SessionDoc {
  const next = nextSet(day, doc, null, focus);
  if (!next) throw new Error('Odakta set kalmadı.');
  return logSet(day, doc, { rowId: next.rowId, setIndex: next.setIndex, kg: next.kg, value: next.value, stamp: stamp(minute), random: sequence() }).doc;
}

/** Gün A: Bench (3 set), Plank (2 × 30–45 sn), Goblet Squat (2 set). */
function threeDay(): WorkoutDay {
  return dayWithBlocks([
    { id: 'b_aaaaaa', kind: 'single', restSeconds: 90, rows: [{ id: 'r_aaaaaa', exerciseId: 'bench-press', sets: [{ min: 8, max: 10 }, { min: 8, max: 10 }, { min: 8, max: 10 }] }] },
    { id: 'b_bbbbbb', kind: 'single', restSeconds: 45, rows: [{ id: 'r_bbbbbb', exerciseId: 'plank', sets: [{ min: 30, max: 45 }, { min: 30, max: 45 }] }] },
    { id: 'b_dddddd', kind: 'single', restSeconds: 60, rows: [{ id: 'r_dddddd', exerciseId: 'goblet-squat', sets: [{ min: 10, max: 12 }, { min: 10, max: 12 }] }] },
  ]);
}

const valid = (doc: SessionDoc) => assert.equal(v.safeParse(sessionDocSchema, doc).success, true);
const nextRow = (day: WorkoutDay, doc: SessionDoc) => cursorOf(day, doc).next?.rowId;

describe('listenin satırları', () => {
  test('yapılış sırasında birimler: şu anki, sıradakiler; numara ve set sayıları', () => {
    const day = threeDay();
    const view = listView(day, logNext(day, start(day), 1));
    assert.deepEqual(
      view.items.map((item) => [item.members[0]?.number, item.members[0]?.title, item.state, `${item.done}/${item.planned}`]),
      [
        ['1', 'Bench Press', 'current', '1/3'],
        ['2', 'Plank', 'pending', '0/2'],
        ['3', 'Goblet Squat', 'pending', '0/2'],
      ],
    );
    assert.deepEqual([view.doneSets, view.plannedSets, view.items.filter((item) => item.state === 'skipped').length], [1, 7, 0]);
  });

  test('grupta üyeler "3a", "3b" ve türün adı', () => {
    const day = dayWithBlocks([
      { id: 'b_aaaaaa', kind: 'superset', restSeconds: 90, rows: [
        { id: 'r_aaaaaa', exerciseId: 'bench-press', sets: [{ min: 8, max: 10 }, { min: 8, max: 10 }] },
        { id: 'r_bbbbbb', exerciseId: 'goblet-squat', sets: [{ min: 8, max: 10 }, { min: 8, max: 10 }] },
      ] },
    ]);
    const item = listView(day, start(day)).items[0];
    assert.deepEqual(item?.members.map((member) => member.number), ['1a', '1b']);
    assert.equal(item?.kindLabel, 'Süperset');
    assert.equal(item?.planned, 4);
  });
});

describe('atlama ve geri alma', () => {
  test('atlanan sona iner, sıradaki hemen gelir; bütün satırların kaydı açılır (sıra kimliklerle)', () => {
    const day = threeDay();
    const result = dropWithUndo(day, start(day), 'b_aaaaaa', stamp(1), sequence());
    assert.ok(result);
    assert.equal(result.doc.entries.length, 3);
    assert.equal(nextRow(day, result.doc), 'r_bbbbbb');
    assert.deepEqual(listView(day, result.doc).items.map((item) => [item.key, item.state]), [
      ['b_bbbbbb', 'current'],
      ['b_dddddd', 'pending'],
      ['b_aaaaaa', 'skipped'],
    ]);
    assert.equal(firstSkippedKey(day, result.doc), 'b_aaaaaa');
    valid(result.doc);
  });

  test('son kalan hareket atlanırsa antrenman bitti sayılır', () => {
    const day = threeDay();
    let doc = logNext(day, logNext(day, start(day), 1), 2);
    doc = logNext(day, doc, 3);
    doc = logNext(day, logNext(day, doc, 4), 5);
    const last = dropAt(day, doc, 'b_dddddd', stamp(6));
    assert.equal(cursorOf(day, last).allDone, true);
  });

  test('"Geri al": sıra ve durum atlamadan önceki hâline; yeni saat eskiyi ezer', () => {
    const day = threeDay();
    const doc = logNext(day, start(day), 1);
    const result = dropWithUndo(day, doc, 'b_aaaaaa', stamp(2), sequence());
    assert.ok(result);
    const undone = undoSkip(day, result.doc, result.undo, stamp(3));
    assert.equal(nextRow(day, undone), 'r_aaaaaa');
    const bench = undone.entries.find((entry) => entry.rowId === 'r_aaaaaa');
    assert.deepEqual([bench?.status, bench?.skip, bench?.updatedAt], ['partial', undefined, at(3)]);
    assert.equal(undone.order?.updatedAt, at(3));
    assert.deepEqual(listView(day, undone).items.map((item) => item.key), ['b_aaaaaa', 'b_bbbbbb', 'b_dddddd']);
    valid(undone);
  });

  test('atlanan geri alınınca sonda kalır; "bilerek geçildi" işareti kalır', () => {
    const day = threeDay();
    const dropped = dropAt(day, start(day), 'b_aaaaaa', stamp(1), sequence());
    assert.deepEqual(listView(day, dropped).items.filter((item) => item.state === 'skipped').map((item) => item.key), ['b_aaaaaa']);
    assert.equal(cursorOf(day, dropped).progress.plannedSets, 4);
    const restored = restoreAt(day, dropped, 'b_aaaaaa', stamp(2));
    const view = listView(day, restored);
    assert.deepEqual(view.items.filter((item) => item.state === 'skipped'), []);
    assert.deepEqual(view.items.map((item) => [item.key, item.state]).at(-1), ['b_aaaaaa', 'pending']);
    assert.deepEqual(restored.entries.find((entry) => entry.rowId === 'r_aaaaaa')?.skip, { moved: true });
    assert.equal(cursorOf(day, restored).progress.plannedSets, 7);
  });

  test('grupta atlamak bütün grubu atlar', () => {
    const day = dayWithBlocks([
      { id: 'b_aaaaaa', kind: 'superset', restSeconds: 90, rows: [
        { id: 'r_aaaaaa', exerciseId: 'bench-press', sets: [{ min: 8, max: 10 }] },
        { id: 'r_bbbbbb', exerciseId: 'goblet-squat', sets: [{ min: 8, max: 10 }] },
      ] },
      { id: 'b_dddddd', kind: 'single', restSeconds: 60, rows: [{ id: 'r_dddddd', exerciseId: 'plank', sets: [{ min: 30, max: 45 }] }] },
    ]);
    const result = dropWithUndo(day, start(day), 'b_aaaaaa', stamp(1), sequence());
    assert.equal(nextRow(day, result?.doc as SessionDoc), 'r_dddddd');
    assert.equal(result?.doc.entries.filter((entry) => entry.status === 'skipped' && entry.skip?.moved).length, 2);
  });

  test('iki cihaz: birinde atlamanın açtığı boş kayıt, ötekinde aynı satırın seti; birleşimde tek kayıt, set görünür', () => {
    const day = threeDay();
    const server = logNext(day, start(day), 1);
    const skipped = dropWithUndo(day, server, 'b_bbbbbb', stamp(2), sequence(40));
    assert.ok(skipped);
    const logged = logSet(day, server, { rowId: 'r_dddddd', setIndex: 0, kg: 20, value: 10, stamp: stamp(3), random: sequence(90) }).doc;
    for (const merged of [mergeAll([skipped.doc, logged]), mergeAll([logged, skipped.doc])] as SessionDoc[]) {
      assert.equal(merged.entries.filter((entry) => entry.rowId === 'r_dddddd').length, 1);
      assert.equal(setViews(day, merged, 'r_dddddd')[0]?.logged?.reps, 10);
      valid(merged);
    }
  });
});

describe('"Değiştir" (muadil)', () => {
  const benchSwap = (day: WorkoutDay, exercise = DB_PRESS) => {
    const block = day.blocks[0];
    const row = block?.rows[0];
    if (!block || !row) throw new Error('Satır yok.');
    return swapRowFor({ row, blockId: block.id, original: BENCH, exercise, devices: DEVICES, history: [], firstForMuscle: true });
  };

  test('muadil satırın yerinde, kendi planıyla; kayıt `swappedFrom`, sıra ve imleç aynı', () => {
    const day = threeDay();
    const extra = benchSwap(day);
    const extras: ExtraRows = { [extraKey('r_aaaaaa', extra.exerciseId)]: extra };
    assert.equal(canSwap(day, start(day), 'r_aaaaaa'), true);
    const doc = swapRow(day, start(day), { rowId: 'r_aaaaaa', extra, stamp: stamp(1), random: sequence() });
    const entry = doc.entries[0];
    assert.deepEqual([entry?.swappedFrom, entry?.rowId, entry?.exerciseId, entry?.title, entry?.deviceId], ['r_aaaaaa', undefined, 'dumbbell-press', 'Dumbbell Press', 'dambil-seti']);
    const live = effectiveDay(day, doc, extras);
    assert.equal(live.rows.r_aaaaaa?.title, 'Dumbbell Press');
    assert.equal(live.blocks[0]?.rows[0]?.exerciseId, 'dumbbell-press');
    const next = nextSet(live, doc);
    assert.deepEqual([next?.rowId, next?.kg], ['r_aaaaaa', extra.row.plan.sets[0]?.weightKg]);
    const logged = logNext(live, doc, 2);
    assert.equal(logged.entries.length, 1);
    assert.equal(logged.entries[0]?.sets.length, 1);
    assert.equal(canSwap(live, logged, 'r_aaaaaa'), false);
    valid(logged);
  });

  test('asıl harekete dönmek aynı kaydı çevirir; eski hareketin ısınmaları silinir', () => {
    const day = threeDay();
    const extra = benchSwap(day);
    const warm = { ...start(day), entries: [] } as SessionDoc;
    const withWarmup: SessionDoc = {
      ...warm,
      entries: [
        { id: 'e_benchx', rowId: 'r_aaaaaa', blockId: 'b_aaaaaa', exerciseId: 'bench-press', title: 'Bench Press', status: 'pending', updatedAt: at(0), by: W1, sets: [workingSet('st_warm0001', 0, { type: 'warmup', setIndex: 0, kg: 20, reps: 10 })] },
      ],
    };
    const swapped = swapRow(day, withWarmup, { rowId: 'r_aaaaaa', extra, stamp: stamp(1) });
    assert.equal(swapped.entries[0]?.id, 'e_benchx');
    assert.deepEqual(swapped.entries[0]?.sets, []);
    assert.deepEqual(swapped.deletedSetIds, ['st_warm0001']);
    const back = swapRow(day, swapped, { rowId: 'r_aaaaaa', extra: null, stamp: stamp(2) });
    assert.deepEqual([back.entries[0]?.id, back.entries[0]?.rowId, back.entries[0]?.swappedFrom, back.entries[0]?.exerciseId], ['e_benchx', 'r_aaaaaa', undefined, 'bench-press']);
    assert.equal(effectiveDay(day, back, {}), day);
    // Aynı harekete "değiştirmek" bir şey yapmaz.
    assert.equal(swapRow(day, back, { rowId: 'r_aaaaaa', extra: null, stamp: stamp(3) }), back);
    valid(back);
  });

  test('set kaydedilmişse ve eklenen harekette açılmaz', () => {
    const day = threeDay();
    const doc = logNext(day, start(day), 1);
    assert.equal(canSwap(day, doc, 'r_aaaaaa'), false);
    assert.equal(swapRow(day, doc, { rowId: 'r_aaaaaa', extra: benchSwap(day), stamp: stamp(2) }), doc);
    assert.equal(canSwap(day, doc, 'e_abcdef'), false);
  });

  test('kayıt türü farklıysa (süre → tekrar) muadilin varsayılan hedefiyle aynı sayıda set', () => {
    const day = threeDay();
    const block = day.blocks[1];
    const row = block?.rows[0];
    assert.ok(block && row);
    const extra = swapRowFor({ row, blockId: block.id, original: PLANK, exercise: CRUNCH, devices: DEVICES, history: [], firstForMuscle: false });
    assert.equal(extra.template.sets.length, 2);
    assert.notDeepEqual(extra.template.sets[0], { min: 30, max: 45 });
    assert.equal(extra.row.trackingType, 'bodyweight_reps');
    const same = benchSwap(day);
    assert.deepEqual(same.template.sets, day.blocks[0]?.rows[0]?.sets);
  });

  test('plan gelmediyse muadil asıl satırın düzeniyle, kendi adıyla sürer', () => {
    const day = threeDay();
    const doc = swapRow(day, start(day), { rowId: 'r_aaaaaa', extra: benchSwap(day, PUSH_UP), stamp: stamp(1), random: sequence() });
    const live = effectiveDay(day, doc, {});
    assert.deepEqual([live.rows.r_aaaaaa?.title, live.rows.r_aaaaaa?.lastTime], ['Şınav', []]);
    assert.equal(nextSet(live, doc)?.rowId, 'r_aaaaaa');
  });

  test('muadil satırının alt metni', () => {
    const day = threeDay();
    const first = benchSwap(day);
    assert.match(optionText(first), /^8–10 tekrar · \d+(,\d+)? kg ile başla$/);
    assert.equal(optionText(benchSwap(day, PUSH_UP)), '8–10 tekrar');
    const block = day.blocks[1];
    const row = block?.rows[0];
    assert.ok(block && row);
    const plankLike = swapRowFor({ row, blockId: block.id, original: PLANK, exercise: PLANK, devices: DEVICES, history: [], firstForMuscle: false });
    assert.equal(optionText(plankLike), '30–45 sn');
  });
});

describe('"Hareket ekle"', () => {
  function added(day: WorkoutDay, doc: SessionDoc, entryId: string) {
    const extra = rekeyExtra(addedRowFor({ key: 'push-up', exercise: PUSH_UP, devices: DEVICES, history: [] }), entryId);
    return { extra, doc: addExercise(day, doc, { entryId, extra, stamp: stamp(5), random: sequence() }) };
  }

  test('yalnız bu antrenmana: kayıt hemen açılır, yapılacakların sonuna; kendi kimliğiyle satır', () => {
    const day = threeDay();
    const { extra, doc } = added(day, logNext(day, start(day), 1), 'e_added1');
    const entry = doc.entries.find((item) => item.id === 'e_added1');
    assert.deepEqual([entry?.added, entry?.rowId, entry?.plannedSets, entry?.title], [true, undefined, 3, 'Şınav']);
    const live = effectiveDay(day, doc, { [extraKey('e_added1', 'push-up')]: extra });
    assert.equal(live.rows.e_added1?.title, 'Şınav');
    const view = listView(live, doc);
    assert.deepEqual(view.items.map((item) => [item.members[0]?.number, item.key]).at(-1), ['4', 'e_added1']);
    assert.equal(view.plannedSets, 10);
    valid(doc);
  });

  test('atlananların önüne girer; "Şimdi yap" odağında hemen yapılır ve setleri kendi kaydına yazılır', () => {
    const day = threeDay();
    const dropped = dropAt(day, start(day), 'b_bbbbbb', stamp(1), sequence());
    const { extra, doc } = added(day, dropped, 'e_added1');
    const extras = { [extraKey('e_added1', 'push-up')]: extra };
    const live = effectiveDay(day, doc, extras);
    assert.deepEqual(listView(live, doc).items.map((item) => item.key), ['b_aaaaaa', 'b_dddddd', 'e_added1', 'b_bbbbbb']);
    // "Şimdi yap" odağı açar, sıra yazılmaz.
    assert.equal(nextSet(live, doc, null, 'e_added1')?.rowId, 'e_added1');
    const logged = logFocused(live, doc, 'e_added1', 7);
    assert.equal(logged.entries.find((item) => item.id === 'e_added1')?.sets.length, 1);
    assert.equal(logged.entries.length, 4);
    assert.deepEqual(logged.order, doc.order);
    valid(logged);
  });
});

describe('bitişte neden', () => {
  test('yapılmayan her harekete; ağrı seansa "diğer", ayrıntı yalnız programın satırları için', () => {
    const day = threeDay();
    const extra = rekeyExtra(addedRowFor({ key: 'push-up', exercise: PUSH_UP, devices: DEVICES, history: [] }), 'e_added1');
    let doc = addExercise(day, logNext(day, start(day), 1), { entryId: 'e_added1', extra, stamp: stamp(2), random: sequence() });
    const live = effectiveDay(day, doc, { [extraKey('e_added1', 'push-up')]: extra });
    const busy = withFinishReason(live, doc, 'busy', stamp(3));
    assert.deepEqual(busy.doc.entries.map((entry) => entry.skip?.reason), ['busy', 'busy', 'busy', 'busy']);
    assert.deepEqual(busy.skippedRows, []);
    doc = logNext(live, logNext(live, doc, 4), 5);
    const pain = withFinishReason(live, doc, 'pain', stamp(6));
    assert.deepEqual(pain.doc.entries.find((entry) => entry.rowId === 'r_aaaaaa')?.skip, undefined);
    assert.equal(pain.doc.entries.find((entry) => entry.rowId === 'r_bbbbbb')?.skip?.reason, 'other');
    assert.deepEqual(pain.skippedRows, [
      { rowId: 'r_bbbbbb', reason: 'pain' },
      { rowId: 'r_dddddd', reason: 'pain' },
    ]);
    valid(pain.doc);
  });
});

describe('"Antrenmanı değiştir" olmadı: hazırlık geri alınır', () => {
  /** Ekranın hazırlığı (`onSwitchWorkout`): bütün satırların kaydı açılır, yapılmayanlara "diğer" yazılır. */
  const prepare = (day: WorkoutDay, doc: SessionDoc, minute: number) =>
    withFinishReason(day, ensureEntries(day, doc, stamp(minute), sequence(100)), 'other', stamp(minute)).doc;
  const skips = (doc: SessionDoc) => Object.fromEntries(doc.entries.map((entry) => [entry.rowId, entry.skip]));

  test('istek sürerken belge değişmediyse değiştirmeden önceki belge (aynı nesne)', () => {
    const day = threeDay();
    const before = logNext(day, start(day), 1);
    const prepared = prepare(day, before, 2);
    assert.deepEqual(skips(prepared), { r_aaaaaa: { reason: 'other', moved: false }, r_bbbbbb: { reason: 'other', moved: false }, r_dddddd: { reason: 'other', moved: false } });
    assert.equal(undoSwitchPrep(prepared, before, prepared, stamp(3)), before);
  });

  test('o arada set yazıldıysa set kalır, hazırlığın nedeni kalkar', () => {
    const day = threeDay();
    const before = logNext(day, start(day), 1);
    const prepared = prepare(day, before, 2);
    const latest = logFocused(day, prepared, 'b_bbbbbb', 3);
    const back = undoSwitchPrep(latest, before, prepared, stamp(4));
    assert.deepEqual(skips(back), { r_aaaaaa: undefined, r_bbbbbb: undefined, r_dddddd: undefined });
    assert.deepEqual(back.entries.map((entry) => [entry.rowId, entry.sets.length]).sort(), [['r_aaaaaa', 1], ['r_bbbbbb', 1], ['r_dddddd', 0]]);
    assert.equal(back.entries.find((entry) => entry.rowId === 'r_bbbbbb')?.updatedAt, at(4), 'yeni saat hazırlığınkini ezer');
    valid(back);
  });

  test('önceki "bilerek geçildi" işareti geri gelir; o arada başka nedenle yazılan kayda dokunulmaz', () => {
    const day = threeDay();
    const dropped = dropWithUndo(day, logNext(day, start(day), 1), 'b_bbbbbb', stamp(2), sequence());
    assert.ok(dropped);
    const before = restoreAt(day, dropped.doc, 'b_bbbbbb', stamp(3));
    assert.deepEqual(skips(before).r_bbbbbb, { moved: true });
    const prepared = prepare(day, before, 4);
    assert.deepEqual(skips(prepared).r_bbbbbb, { reason: 'other', moved: true });
    const logged = logFocused(day, prepared, 'b_aaaaaa', 5);
    const latest = { ...logged, entries: logged.entries.map((entry) => (entry.rowId === 'r_dddddd' ? { ...entry, skip: { reason: 'tired' as const, moved: false } } : entry)) };
    const back = undoSwitchPrep(latest, before, prepared, stamp(6));
    assert.deepEqual(skips(back), { r_aaaaaa: undefined, r_bbbbbb: { moved: true }, r_dddddd: { reason: 'tired', moved: false } });
    assert.deepEqual(listView(day, back).items.map((item) => [item.key, item.state]), listView(day, logFocused(day, before, 'b_aaaaaa', 5)).items.map((item) => [item.key, item.state]));
    valid(back);
  });

  test('`ensureEntries`\'in açtığı kayıtlar kalır: setsiz ve nedensiz, liste değiştirmeden önceki gibi', () => {
    const day = threeDay();
    const before = logNext(day, start(day), 1);
    assert.equal(before.entries.length, 1);
    const prepared = prepare(day, before, 2);
    assert.equal(prepared.entries.length, 3);
    const latest = logFocused(day, prepared, 'b_aaaaaa', 3);
    const back = undoSwitchPrep(latest, before, prepared, stamp(4));
    const opened = back.entries.filter((entry) => entry.rowId !== 'r_aaaaaa');
    assert.deepEqual(opened.map((entry) => [entry.rowId, entry.status, entry.skip, entry.sets.length]).sort(), [['r_bbbbbb', 'pending', undefined, 0], ['r_dddddd', 'pending', undefined, 0]]);
    assert.deepEqual(listView(day, back).items.map((item) => [item.key, item.state]), listView(day, logFocused(day, before, 'b_aaaaaa', 3)).items.map((item) => [item.key, item.state]));
    assert.deepEqual(mergeAll([back]), back, 'kanonik biçimde (normalizeSession)');
    valid(back);
  });
});

describe('günün etkin planı', () => {
  test('muadil ve ekleme yoksa aynı gün (aynı nesne)', () => {
    const day = workoutDay();
    assert.equal(effectiveDay(day, start(day), {}), day);
  });
});

describe('bitişte rotasyon satırı (§2.7)', () => {
  const three = programFile({}, {});
  const withC = {
    ...three,
    phases: [{ ...three.phases[0], days: [...(three.phases[0]?.days ?? []), { id: 'd_cccccc', name: 'Gün C', blocks: [singleBlock('b_dddddd', 'r_dddddd', 2)] }] }],
  };

  test('hazır seçim planın yarısına göre; "sıradaki" bu günün arkasındaki, "sırada kalsın" sıradaki gün', () => {
    const day = workoutDay({ raw: withC });
    assert.equal(day.dayId, DAY_A);
    assert.deepEqual(finishRotation(day, { doneSets: 3, plannedSets: 5 }), { initial: 'advance', advance: 'Gün B', keep: 'Gün A' });
    assert.deepEqual(finishRotation(day, { doneSets: 2, plannedSets: 5 }), { initial: 'keep', advance: 'Gün B', keep: 'Gün A' });
  });

  test('başka gün seçildi: "sırada kalsın" asıl sıradaki gün; iki seçenek aynı güne çıkıyorsa satır yok', () => {
    const other = workoutDay({ raw: withC, dayId: DAY_B });
    assert.deepEqual(finishRotation(other, { doneSets: 1, plannedSets: 3 }), { initial: 'keep', advance: 'Gün C', keep: 'Gün A' });
    const twoDays = workoutDay({ dayId: DAY_B });
    assert.equal(finishRotation(twoDays, { doneSets: 1, plannedSets: 3 }), null);
    // Yeni antrenman sıradaki günün adını taşır (PT'nin bildirimi: "Gün A yerine Gün B yapıldı").
    assert.deepEqual(start(twoDays).program, { revision: 7, phaseId: 'p_aaaaaa', dayId: DAY_B, dayName: 'Gün B', plannedDayId: DAY_A, plannedDayName: 'Gün A' });
    assert.equal(start(workoutDay()).program?.plannedDayName, undefined, 'sıradaki gün yapılıyorsa ad yazılmaz');
  });

  test('eski anlık görüntüde gün listesi yok ya da gün evrede değil: satır yok', () => {
    const { rotationDays: _days, ...legacy } = workoutDay({ raw: withC });
    assert.equal(finishRotation(legacy, { doneSets: 1, plannedSets: 3 }), null);
    assert.equal(finishRotation({ ...legacy, rotationDays: [{ id: 'd_zzzzzz', name: 'Gün Z' }, { id: 'd_yyyyyy', name: 'Gün Y' }] }, { doneSets: 1, plannedSets: 3 }), null);
  });
});

describe('liste + odak: imleç', () => {
  test('odaktaki birimin sıradaki seti; sıra değişmez', () => {
    const day = threeDay();
    const doc = logNext(day, start(day), 1); // Bench 1/3
    const focused = nextSet(day, doc, null, 'b_dddddd');
    assert.equal(focused?.rowId, 'r_dddddd');
    assert.equal(focused?.position, 0);
    // Odaksız imleç Bench'te kalır; sıra yazılmaz.
    assert.equal(nextSet(day, doc)?.rowId, 'r_aaaaaa');
    assert.deepEqual(cursorOf(day, doc, 'b_dddddd').units.map((unit) => unit.key), ['b_aaaaaa', 'b_bbbbbb', 'b_dddddd']);
  });

  test('odaktaki birim bitince sıradaki set yok; dinlenme bütün antrenmana göre', () => {
    const day = threeDay();
    let doc = start(day);
    for (let minute = 1; minute <= 2; minute += 1) {
      const next = nextSet(day, doc, null, 'b_dddddd');
      assert.ok(next);
      // Başka birimlerde set kaldığı için son setin ardında da bloğun dinlenmesi var.
      assert.equal(next.restAfterSeconds, 60);
      doc = logSet(day, doc, { rowId: next.rowId, setIndex: next.setIndex, kg: next.kg, value: next.value, stamp: stamp(minute), random: sequence() }).doc;
    }
    assert.equal(nextSet(day, doc, null, 'b_dddddd'), null);
    assert.equal(cursorOf(day, doc, 'b_dddddd').next, null);
    assert.equal(cursorOf(day, doc, 'b_dddddd').allDone, false);
    // "Hareket 3/3" odaktaki birimin sırası kalır; odaksız imleç sıradaki bitmemiş birimde (Bench).
    assert.equal(cursorOf(day, doc, 'b_dddddd').progress.currentUnit, 3);
    assert.equal(cursorOf(day, doc).progress.currentUnit, 1);
  });

  test('antrenmanın son seti odakta da dinlenmesiz', () => {
    const day = threeDay();
    let doc = start(day);
    // Sıra Bench → Plank → Goblet; danışan sondan başlar: Goblet ve Plank odakta biter, Bench en son.
    for (let minute = 1; minute <= 2; minute += 1) doc = logFocused(day, doc, 'b_dddddd', minute);
    for (let minute = 3; minute <= 4; minute += 1) doc = logFocused(day, doc, 'b_bbbbbb', minute);
    // Biten odak sonda değilken de "Hareket 2/3" (yedek `open.length` 3 olurdu).
    assert.equal(cursorOf(day, doc, 'b_bbbbbb').progress.currentUnit, 2);
    const rests: (number | undefined)[] = [];
    const afters: ReturnType<typeof afterLog>[] = [];
    for (let minute = 5; minute <= 7; minute += 1) {
      rests.push(nextSet(day, doc, null, 'b_aaaaaa')?.restAfterSeconds);
      const logged = logFocused(day, doc, 'b_aaaaaa', minute);
      afters.push(afterLog(day, doc, logged, 'b_aaaaaa'));
      doc = logged;
    }
    assert.deepEqual(rests, [90, 90, 0]);
    // Bench'in son seti antrenmanın son seti: odakta da bitirme sorusu.
    assert.deepEqual(afters.at(-1), { kind: 'done' });
    assert.equal(cursorOf(day, doc).allDone, true);
  });

  test('grupta odak üyeler arasında turu izler; harf odaktan', () => {
    // Kimlikler fikstürün Gün B'siyle (b_cccccc, r_cccccc) çakışmaz: program şeması kimliklerin benzersizliğini ister.
    const day = dayWithBlocks([
      { id: 'b_aaaaaa', kind: 'single', restSeconds: 90, rows: [{ id: 'r_aaaaaa', exerciseId: 'bench-press', sets: [{ min: 8, max: 10 }] }] },
      {
        id: 'b_eeeeee',
        kind: 'superset',
        restSeconds: 90,
        rows: [
          { id: 'r_ffffff', exerciseId: 'goblet-squat', sets: [{ min: 10, max: 12 }, { min: 10, max: 12 }] },
          { id: 'r_eeeeee', exerciseId: 'push-up', sets: [{ min: 8, max: 12 }, { min: 8, max: 12 }] },
        ],
      },
    ]);
    let doc = start(day);
    const afters: ReturnType<typeof afterLog>[] = [];
    const log = (minute: number) => {
      const logged = logFocused(day, doc, 'b_eeeeee', minute);
      afters.push(afterLog(day, doc, logged, 'b_eeeeee'));
      doc = logged;
    };
    const first = nextSet(day, doc, null, 'b_eeeeee');
    assert.deepEqual([first?.rowId, first?.round, first?.restAfterSeconds], ['r_ffffff', 0, 0]); // tur içinde dinlenme yok
    assert.equal(nextMemberLetter(day, doc, 'b_eeeeee'), 'B');
    assert.equal(nextMemberLetter(day, doc), null); // odaksız imleç tek harekette
    log(1); // A, tur 0
    const second = nextSet(day, doc, null, 'b_eeeeee');
    // Tur sonu: blok dinlenmesi (Bench beklediği için antrenmanın son seti değil).
    assert.deepEqual([second?.rowId, second?.round, second?.restAfterSeconds], ['r_eeeeee', 0, 90]);
    assert.equal(nextMemberLetter(day, doc, 'b_eeeeee'), null);
    log(2); // B, tur 0
    const third = nextSet(day, doc, null, 'b_eeeeee');
    assert.deepEqual([third?.rowId, third?.round], ['r_ffffff', 1]);
    log(3); // A, tur 1
    log(4); // B, tur 1: grup biter, sıradaki Bench
    // Odaksız imleç Bench'te olsa da odakta üye geçişi ve tur dinlenmesi gruba göre.
    assert.deepEqual(afters, [
      { kind: 'member', transitionSeconds: 0 },
      { kind: 'same', restSeconds: 90 },
      { kind: 'member', transitionSeconds: 0 },
      { kind: 'next', restSeconds: 90 },
    ]);
    assert.equal(nextUnitAfter(day, doc, 'b_eeeeee'), 'b_aaaaaa');
  });

  test('"Kolaydı" kısayolu odaktaki birimin sıradaki setine bakar', () => {
    const day = threeDay();
    const next = nextSet(day, start(day), null, 'b_dddddd');
    assert.ok(next);
    // Goblet'in ilk seti aralığın tepesinde (12); odaksız imleç Bench'te.
    const { doc, setId } = logSet(day, start(day), { rowId: next.rowId, setIndex: next.setIndex, kg: next.kg, value: 12, stamp: stamp(1), random: sequence() });
    // Goblet'in sıradaki seti 4 → 6 kg (Bench'in ağırlığı değil).
    assert.deepEqual(easyShortcut(day, doc, setId, 'b_dddddd'), { kg: 6, taken: false });
    assert.equal(easyShortcut(day, doc, setId), null);
  });

  test('geçilen birime odak: set yok (önce "Geri al")', () => {
    const day = threeDay();
    const dropped = dropAt(day, start(day), 'b_bbbbbb', stamp(1));
    assert.equal(nextSet(day, dropped, null, 'b_bbbbbb'), null);
  });

  test('odakta birim bitince sıradaki birim: sırada ilk bitmemiş', () => {
    const day = threeDay();
    let doc = start(day);
    // Önce Goblet'i (3. birim) bitir; Bench ve Plank bekliyor.
    const afters: ReturnType<typeof afterLog>[] = [];
    for (let minute = 1; minute <= 2; minute += 1) {
      const next = nextSet(day, doc, null, 'b_dddddd');
      assert.ok(next);
      const logged = logSet(day, doc, { rowId: next.rowId, setIndex: next.setIndex, kg: next.kg, value: next.value, stamp: stamp(minute), random: sequence() }).doc;
      afters.push(afterLog(day, doc, logged, 'b_dddddd'));
      doc = logged;
    }
    // İlk set odakta "aynı hareket" (odaksız imleç Bench'te olsa da); ikincisi birimi bitirir.
    assert.deepEqual(afters, [
      { kind: 'same', restSeconds: 60 },
      { kind: 'next', restSeconds: 60 },
    ]);
    assert.equal(nextUnitAfter(day, doc, 'b_dddddd'), 'b_aaaaaa');
  });

  test('odakta son set "done"', () => {
    const day = threeDay();
    let doc = start(day);
    for (let minute = 1; minute <= 6; minute += 1) doc = logNext(day, doc, minute);
    const next = nextSet(day, doc, null, 'b_dddddd');
    assert.ok(next);
    const logged = logSet(day, doc, { rowId: next.rowId, setIndex: next.setIndex, kg: next.kg, value: next.value, stamp: stamp(7), random: sequence() }).doc;
    assert.deepEqual(afterLog(day, doc, logged, 'b_dddddd'), { kind: 'done' });
  });

  test('odaksız afterLog da birimin bittiğini söyler', () => {
    const day = threeDay();
    let doc = start(day);
    doc = logNext(day, logNext(day, doc, 1), 2);
    const logged = logNext(day, doc, 3); // Bench'in son seti
    assert.deepEqual(afterLog(day, doc, logged), { kind: 'next', restSeconds: 90 });
    assert.equal(nextUnitAfter(day, logged, 'b_aaaaaa'), 'b_bbbbbb');
  });
});

describe('liste + odak: liste', () => {
  test('durumlar: bitti, şu an (odak ya da imleç), sırada, atlandı; sıra yapılış sırası, atlanan sona iner', () => {
    const day = threeDay();
    let doc = start(day);
    for (let minute = 1; minute <= 3; minute += 1) doc = logNext(day, doc, minute); // Bench bitti
    doc = dropAt(day, doc, 'b_bbbbbb', stamp(4));
    const view = listView(day, doc);
    assert.deepEqual(
      view.items.map((item) => [item.key, item.state, `${item.done}/${item.planned}`]),
      [
        ['b_aaaaaa', 'done', '3/3'],
        ['b_dddddd', 'current', '0/2'],
        ['b_bbbbbb', 'skipped', '0/2'],
      ],
    );
    assert.equal(view.current, 'b_dddddd');
    assert.deepEqual([view.doneSets, view.plannedSets, view.allDone], [3, 5, false]);
    // Odak biten birimdeyse de satırı "bitti"; imlecin birimi "sırada".
    const focused = listView(day, doc, 'b_aaaaaa');
    assert.equal(focused.current, 'b_aaaaaa');
    assert.deepEqual(focused.items.map((item) => item.state), ['done', 'pending', 'skipped']);
  });

  test('geçersiz odak (günde olmayan ya da atlanan birim) yok sayılır', () => {
    const day = threeDay();
    let doc = logNext(day, start(day), 1); // Bench 1/3
    doc = dropAt(day, doc, 'b_bbbbbb', stamp(2));
    for (const focus of ['b_zzzzzz', 'b_bbbbbb']) {
      const view = listView(day, doc, focus);
      assert.equal(view.current, 'b_aaaaaa', focus);
      assert.deepEqual(view.items.map((item) => [item.key, item.state]), [['b_aaaaaa', 'current'], ['b_dddddd', 'pending'], ['b_bbbbbb', 'skipped']], focus);
    }
  });

  test('son ağırlık: bugün kaydedilen son çalışma seti; yoksa null', () => {
    const day = threeDay();
    const first = nextSet(day, start(day));
    assert.ok(first);
    let doc = logSet(day, start(day), { rowId: first.rowId, setIndex: first.setIndex, kg: 40, value: 10, stamp: stamp(1), random: sequence() }).doc;
    const second = nextSet(day, doc);
    assert.ok(second);
    doc = logSet(day, doc, { rowId: second.rowId, setIndex: second.setIndex, kg: 42.5, value: 10, stamp: stamp(2), random: sequence() }).doc;
    const [bench, plank] = listView(day, doc).items;
    assert.deepEqual([bench?.lastKg, bench?.lastFrom], [42.5, 'today']);
    assert.deepEqual([plank?.lastKg, plank?.lastFrom], [null, null]);
  });

  test('son ağırlık grupta ağırlığı olan ilk üyenin', () => {
    const day = dayWithBlocks([
      {
        id: 'b_eeeeee',
        kind: 'superset',
        restSeconds: 90,
        rows: [
          { id: 'r_eeeeee', exerciseId: 'push-up', sets: [{ min: 8, max: 12 }, { min: 8, max: 12 }] },
          { id: 'r_ffffff', exerciseId: 'goblet-squat', sets: [{ min: 10, max: 12 }, { min: 10, max: 12 }] },
        ],
      },
    ]);
    let doc = logNext(day, start(day), 1); // Şınav: ağırlıksız
    assert.deepEqual(listView(day, doc).items.map((item) => [item.lastKg, item.lastFrom]), [[null, null]]);
    doc = logSet(day, doc, { rowId: 'r_ffffff', setIndex: 0, kg: 16, value: 10, stamp: stamp(2), random: sequence() }).doc;
    assert.deepEqual(listView(day, doc).items.map((item) => [item.lastKg, item.lastFrom]), [[16, 'today']]);
  });

  test('son ağırlık: eklenen hareketin kendi kaydından', () => {
    const day = threeDay();
    const extra = rekeyExtra(addedRowFor({ key: 'dumbbell-press', exercise: DB_PRESS, devices: DEVICES, history: [] }), 'e_added1');
    let doc = addExercise(day, start(day), { entryId: 'e_added1', extra, stamp: stamp(1), random: sequence() });
    const live = effectiveDay(day, doc, { [extraKey('e_added1', extra.exerciseId)]: extra });
    const next = nextSet(live, doc, null, 'e_added1');
    assert.equal(next?.rowId, 'e_added1');
    doc = logSet(live, doc, { rowId: 'e_added1', setIndex: 0, kg: 12.5, value: 10, stamp: stamp(2), random: sequence() }).doc;
    // Etkin günde satırı kaydın kimliğiyle, düz günde plan dışı birim: ikisinde de kendi kaydı.
    for (const view of [listView(live, doc), listView(day, doc)]) {
      assert.deepEqual(view.items.map((item) => [item.key, item.lastKg, item.lastFrom]).at(-1), ['e_added1', 12.5, 'today']);
    }
  });

  test('son ağırlık bugün yoksa geçen antrenmanın son seti', () => {
    // Geçen antrenman: Bench 60, sonra 57,5. Gün A'nın iki satırı da Bench: "Önceki" ikisine de gelir.
    const history = [
      sessionDoc({
        id: 's_aaaaaaaa',
        status: 'finished',
        startedAt: at(-1000),
        finishedAt: at(-960),
        entries: [
          sessionEntry('e_aaaaaa', {
            rowId: 'r_aaaaaa',
            status: 'done',
            sets: [workingSet('st_aaaaaaaa', -999, { setIndex: 0, kg: 60 }), workingSet('st_bbbbbbbb', -998, { setIndex: 1, kg: 57.5 })],
          }),
        ],
      }),
    ];
    const day = workoutDay({ history });
    const pick = (doc: SessionDoc) => listView(day, doc).items.map((item) => [item.key, item.lastKg, item.lastFrom]);
    assert.deepEqual(pick(start(day)), [
      ['b_aaaaaa', 57.5, 'last'],
      ['b_bbbbbb', 57.5, 'last'],
    ]);
    const first = nextSet(day, start(day));
    assert.ok(first);
    const doc = logSet(day, start(day), { rowId: first.rowId, setIndex: first.setIndex, kg: 62.5, value: 10, stamp: stamp(1), random: sequence() }).doc;
    // Bugünkü set geçen antrenmanınkini geçer; öteki satır geçen antrenmanda kalır.
    assert.deepEqual(pick(doc), [
      ['b_aaaaaa', 62.5, 'today'],
      ['b_bbbbbb', 57.5, 'last'],
    ]);
  });

  test('"şu an" odak yoksa yarım bırakılan birim (son kaydedilen set); o bitince imleç', () => {
    const day = threeDay();
    let doc = logNext(day, start(day), 1); // Bench 1/3
    const goblet = nextSet(day, doc, null, 'b_dddddd');
    assert.ok(goblet);
    doc = logSet(day, doc, { rowId: goblet.rowId, setIndex: goblet.setIndex, kg: goblet.kg, value: goblet.value, stamp: stamp(2), random: sequence() }).doc;
    // Goblet yarım: listeye dönünce "Devam et" Goblet'i gösterir, Bench'i değil.
    assert.equal(listView(day, doc).current, 'b_dddddd');
    // İmlecin birimi (Bench) "şu an" değilse satırı "sırada".
    assert.deepEqual(listView(day, doc).items.map((item) => item.state), ['pending', 'pending', 'current']);
    const last = nextSet(day, doc, null, 'b_dddddd');
    assert.ok(last);
    doc = logSet(day, doc, { rowId: last.rowId, setIndex: last.setIndex, kg: last.kg, value: last.value, stamp: stamp(3), random: sequence() }).doc;
    assert.equal(listView(day, doc).current, 'b_aaaaaa');
  });

  test('"şu an" son set atlanan birimdeyse oraya dönmez', () => {
    const day = threeDay();
    let doc = logFocused(day, start(day), 'b_dddddd', 1); // Goblet 1/2
    assert.equal(listView(day, doc).current, 'b_dddddd');
    doc = dropAt(day, doc, 'b_dddddd', stamp(2));
    assert.equal(listView(day, doc).current, 'b_aaaaaa');
  });

  test('ısınma seti "son set" ve "son ağırlık" sayılmaz', () => {
    const base = threeDay();
    const goblet = base.rows.r_dddddd;
    assert.ok(goblet);
    const day: WorkoutDay = { ...base, rows: { ...base.rows, r_dddddd: { ...goblet, warmups: [{ kg: 2, reps: 10 }] } } };
    let doc = logNext(day, start(day), 1); // Bench 1/3
    doc = logWarmup(day, doc, { rowId: 'r_dddddd', index: 0, stamp: stamp(2), random: sequence() });
    const view = listView(day, doc);
    assert.equal(view.current, 'b_aaaaaa');
    assert.deepEqual(view.items.map((item) => [item.key, item.lastKg, item.lastFrom]).at(-1), ['b_dddddd', null, null]);
  });

  test('"şu an" bekleyen "+ Set ekle" setini saymaz; odaksız yalnız hepsi bitince null', () => {
    const base = threeDay();
    let doc = start(base);
    for (let minute = 1; minute <= 3; minute += 1) doc = logNext(base, doc, minute); // Bench bitti
    let day = withExtraRounds(base, addExtraRound(base, doc, 'b_aaaaaa'));
    // İmleç Bench'in fazladan setinde; "şu an" planı bitmemiş ilk birim (Bugün'ün kartıyla aynı).
    assert.deepEqual([nextSet(day, doc)?.rowId, nextSet(day, doc)?.extra], ['r_aaaaaa', true]);
    const view = listView(day, doc);
    assert.equal(view.current, 'b_bbbbbb');
    assert.deepEqual(view.items.map((item) => item.state), ['done', 'current', 'pending']);
    // Planın hepsi bitti, Bench'in fazladan seti bekliyor: "şu an" yok.
    for (let minute = 4; minute <= 7; minute += 1) doc = logNext(base, doc, minute);
    day = withExtraRounds(base, addExtraRound(base, doc, 'b_aaaaaa'));
    assert.equal(nextSet(day, doc)?.extra, true);
    const done = listView(day, doc);
    assert.deepEqual([done.current, done.allDone], [null, true]);
    assert.deepEqual(done.items.map((item) => item.state), ['done', 'done', 'done']);
  });
});

describe('liste + odak: geçerli odak ve sıradaki birim', () => {
  test('geçerli odak: günde ve atlanmamış birim; biten birim de geçerli', () => {
    const day = threeDay();
    let doc = start(day);
    for (let minute = 1; minute <= 3; minute += 1) doc = logNext(day, doc, minute); // Bench bitti
    doc = dropAt(day, doc, 'b_bbbbbb', stamp(4));
    assert.equal(validFocus(day, doc, 'b_aaaaaa'), 'b_aaaaaa');
    assert.equal(validFocus(day, doc, 'b_dddddd'), 'b_dddddd');
    assert.equal(validFocus(day, doc, 'b_bbbbbb'), null);
    assert.equal(validFocus(day, doc, 'b_zzzzzz'), null);
    assert.equal(validFocus(day, doc, null), null);
  });

  test('plan dışı kayıt (planda satırı yok) açılmaz: odak, "şu an", sıradaki ve "Geçileni yap" onu seçmez; listede setleriyle durur', () => {
    const day = threeDay();
    const extra = rekeyExtra(addedRowFor({ key: 'push-up', exercise: PUSH_UP, devices: DEVICES, history: [] }), 'e_added1');
    const extras = { [extraKey('e_added1', 'push-up')]: extra };
    let doc = addExercise(day, start(day), { entryId: 'e_added1', extra, stamp: stamp(1), random: sequence() });
    const live = effectiveDay(day, doc, extras);
    doc = logFocused(live, doc, 'e_added1', 2); // son set eklenen harekette
    // Plan verisi olan cihazda (etkin gün) satırı var: açılır ve "şu an" odur.
    assert.equal(validFocus(live, doc, 'e_added1'), 'e_added1');
    assert.equal(listView(live, doc).current, 'e_added1');
    // Plan verisi gelmeyen cihazda (düz gün) plan dışı kayıt: odak geçersiz, "şu an" planın ilk bitmemiş birimi.
    assert.equal(validFocus(day, doc, 'e_added1'), null);
    const view = listView(day, doc, 'e_added1');
    assert.equal(view.current, 'b_aaaaaa');
    assert.deepEqual(view.items.map((item) => [item.key, item.state, `${item.done}/${item.planned}`]).at(-1), ['e_added1', 'pending', '1/3']);
    assert.equal(nextUnitAfter(day, doc, 'b_aaaaaa'), 'b_bbbbbb');
    // Kalan yalnız plan dışı kayıtsa "şu an" ve sıradaki yok (alt çubukta "Antrenmanı bitir"), antrenman bitmiş sayılmaz.
    let rest = doc;
    for (let minute = 3; minute <= 9; minute += 1) rest = logNext(day, rest, minute); // planın 7 seti
    const left = listView(day, rest);
    assert.deepEqual([left.current, left.allDone], [null, false]);
    assert.equal(nextUnitAfter(day, rest, null), null);
    // "Geçileni yap" atlanan plan dışı kaydı geçer, sıradaki atlanan planlı birimi açar.
    const skipped = dropAt(day, dropAt(day, doc, 'e_added1', stamp(3)), 'b_bbbbbb', stamp(4));
    assert.equal(firstSkippedKey(day, skipped), 'b_bbbbbb');
    assert.equal(firstSkippedKey(effectiveDay(day, skipped, extras), skipped), 'e_added1');
  });

  test('biten, gruplu ve üyesi bitmiş birimin planda satırı var: odak geçerli', () => {
    const day = dayWithBlocks([
      { id: 'b_aaaaaa', kind: 'single', restSeconds: 90, rows: [{ id: 'r_aaaaaa', exerciseId: 'bench-press', sets: [{ min: 8, max: 10 }] }] },
      {
        id: 'b_eeeeee',
        kind: 'superset',
        restSeconds: 90,
        rows: [
          { id: 'r_ffffff', exerciseId: 'goblet-squat', sets: [{ min: 10, max: 12 }] },
          { id: 'r_eeeeee', exerciseId: 'push-up', sets: [{ min: 8, max: 12 }, { min: 8, max: 12 }] },
        ],
      },
    ]);
    let doc = logFocused(day, start(day), 'b_aaaaaa', 1); // Bench bitti
    doc = logFocused(day, doc, 'b_eeeeee', 2); // grubun tek setlik üyesi bitti, öteki sürüyor
    assert.deepEqual([validFocus(day, doc, 'b_aaaaaa'), validFocus(day, doc, 'b_eeeeee')], ['b_aaaaaa', 'b_eeeeee']);
    assert.equal(listView(day, doc).current, 'b_eeeeee');
    doc = logFocused(day, logFocused(day, doc, 'b_eeeeee', 3), 'b_eeeeee', 4); // grup da bitti
    assert.deepEqual([validFocus(day, doc, 'b_aaaaaa'), validFocus(day, doc, 'b_eeeeee')], ['b_aaaaaa', 'b_eeeeee']);
    assert.deepEqual(listView(day, doc, 'b_eeeeee').items.map((item) => item.state), ['done', 'done']);
  });

  test('biten birimden sonra sırada ilk bitmemiş; sona kalan birim başa döner', () => {
    const day = threeDay();
    let doc = logFocused(day, start(day), 'b_dddddd', 1);
    doc = logFocused(day, doc, 'b_dddddd', 2); // Goblet (3.) bitti; Bench ve Plank bekliyor
    assert.equal(nextUnitAfter(day, doc, 'b_dddddd'), 'b_aaaaaa');
    for (let minute = 3; minute <= 5; minute += 1) doc = logFocused(day, doc, 'b_aaaaaa', minute); // Bench bitti
    assert.equal(nextUnitAfter(day, doc, 'b_aaaaaa'), 'b_bbbbbb');
  });

  test('bekleyen "+ Set ekle" seti sıraya girmez; yalnız o kaldıysa null', () => {
    const base = threeDay();
    let doc = start(base);
    for (let minute = 1; minute <= 3; minute += 1) doc = logNext(base, doc, minute); // Bench bitti
    const day = withExtraRounds(base, addExtraRound(base, doc, 'b_aaaaaa'));
    doc = logFocused(day, doc, 'b_bbbbbb', 4);
    doc = logFocused(day, doc, 'b_bbbbbb', 5); // Plank bitti; imleç Bench'in fazladan setine dönerdi
    assert.equal(nextSet(day, doc)?.extra, true);
    assert.equal(nextUnitAfter(day, doc, 'b_bbbbbb'), 'b_dddddd');
    doc = logFocused(day, doc, 'b_dddddd', 6);
    doc = logFocused(day, doc, 'b_dddddd', 7);
    assert.equal(nextUnitAfter(day, doc, 'b_dddddd'), null);
  });

  test('geçilen (yarım) birim hariç: yarım bırakılan başka birim varsa o, yoksa sırada ilk öteki', () => {
    const day = threeDay();
    let doc = logFocused(day, start(day), 'b_dddddd', 1); // Goblet 1/2 (yarım)
    doc = logFocused(day, doc, 'b_aaaaaa', 2); // Bench 1/3: son set Bench'te
    // Bench'i geçen: Bench "şu an" (son set onda) ama hariç; sırada ilk öteki Plank.
    assert.equal(nextUnitAfter(day, doc, 'b_aaaaaa'), 'b_bbbbbb');
    // Plank'i geçen: yarım bırakılan Bench.
    assert.equal(nextUnitAfter(day, doc, 'b_bbbbbb'), 'b_aaaaaa');
    assert.equal(nextUnitAfter(day, doc, null), 'b_aaaaaa');
  });

  test('"Bu hareketi atla"nın ardından: belge ve `except` atlamanın kendisinden; atlanan birim hiç seçilmez', () => {
    const day = threeDay();
    let doc = logFocused(day, start(day), 'b_aaaaaa', 1); // Bench 1/3 (yarım)
    doc = logFocused(day, doc, 'b_bbbbbb', 2); // Plank 1/2: son set Plank'te
    // Odaktaki Plank atlandı: son set onda ama "şu an" atlanana dönmez; yarım bırakılan Bench (`dropAt` aynı belge).
    const plank = dropWithUndo(day, doc, 'b_bbbbbb', stamp(3), sequence());
    assert.ok(plank);
    assert.equal(nextUnitAfter(day, plank.doc, 'b_bbbbbb'), 'b_aaaaaa');
    assert.equal(nextUnitAfter(day, dropAt(day, doc, 'b_bbbbbb', stamp(3), sequence()), 'b_bbbbbb'), 'b_aaaaaa');
    // Ardından Bench de atlandı: önceki atlanan da seçilmez, sırada ilk bitmemiş Goblet.
    const bench = dropWithUndo(day, plank.doc, 'b_aaaaaa', stamp(4));
    assert.ok(bench);
    assert.equal(nextUnitAfter(day, bench.doc, 'b_aaaaaa'), 'b_dddddd');
    // Son bitmemiş birim atlandı: açılacak birim yok (ekran listeye döner).
    const goblet = dropWithUndo(day, bench.doc, 'b_dddddd', stamp(5));
    assert.ok(goblet);
    assert.equal(nextUnitAfter(day, goblet.doc, 'b_dddddd'), null);
    // "Geri al" atlanan birimi geri getirir: yeniden seçilebilir.
    const back = undoSkip(day, goblet.doc, goblet.undo, stamp(6));
    assert.equal(nextUnitAfter(day, back, null), 'b_dddddd');
  });
});

describe('liste + odak: sıra ve atlama', () => {
  test('bitmemiş birimler arasında yukarı/aşağı; biten ve atlanan yerinde', () => {
    const day = threeDay();
    let doc = start(day);
    for (let minute = 1; minute <= 3; minute += 1) doc = logNext(day, doc, minute); // Bench bitti
    const up = moveUnit(day, doc, 'b_dddddd', -1, stamp(4), sequence());
    assert.deepEqual(listView(day, up).items.map((item) => item.key), ['b_aaaaaa', 'b_dddddd', 'b_bbbbbb']);
    // En üstteki bitmemiş birim yukarı çıkamaz: üstünde yalnız biten var.
    assert.equal(moveUnit(day, up, 'b_dddddd', -1, stamp(5)), up);
    // Biten birim taşınmaz.
    assert.equal(moveUnit(day, up, 'b_aaaaaa', 1, stamp(5)), up);
    valid(up);
  });

  test('sürükleme: bırakılan bitmemiş birimin yerine; biten hedef olmaz', () => {
    const day = threeDay();
    const moved = moveUnitTo(day, start(day), 'b_dddddd', 'b_aaaaaa', stamp(1), sequence());
    assert.deepEqual(listView(day, moved).items.map((item) => item.key), ['b_dddddd', 'b_aaaaaa', 'b_bbbbbb']);
    // Kendi yerine bırakmak bir şey yazmaz.
    assert.equal(moveUnitTo(day, moved, 'b_dddddd', 'b_dddddd', stamp(2)), moved);
    let done = start(day);
    for (let minute = 1; minute <= 3; minute += 1) done = logNext(day, done, minute);
    assert.equal(moveUnitTo(day, done, 'b_dddddd', 'b_aaaaaa', stamp(4)), done);
    valid(moved);
  });

  test('"Bu hareketi atla": atlananlara; "Geri al" sırayı ve durumu geri getirir', () => {
    const day = threeDay();
    const doc = logNext(day, start(day), 1);
    const result = dropWithUndo(day, doc, 'b_bbbbbb', stamp(2), sequence());
    assert.ok(result);
    assert.deepEqual(
      listView(day, result.doc).items.map((item) => [item.key, item.state]),
      [['b_aaaaaa', 'current'], ['b_dddddd', 'pending'], ['b_bbbbbb', 'skipped']],
    );
    // `dropAt` ile aynı yazım: atlananlarda ve "bilerek geçildi" (`skip.moved`; geri bildirim bunu okur).
    const dropped = result.doc.entries.find((entry) => entry.rowId === 'r_bbbbbb');
    assert.deepEqual([dropped?.status, dropped?.skip?.moved], ['skipped', true]);
    assert.deepEqual(result.doc, dropAt(day, doc, 'b_bbbbbb', stamp(2), sequence()));
    valid(result.doc);
    const back = undoSkip(day, result.doc, result.undo, stamp(3));
    assert.deepEqual(listView(day, back).items.map((item) => item.key), ['b_aaaaaa', 'b_bbbbbb', 'b_dddddd']);
    const plank = back.entries.find((entry) => entry.rowId === 'r_bbbbbb');
    assert.equal(plank?.status, 'pending');
    assert.equal(plank?.skip, undefined);
    valid(back);
    // Zaten atlanmış birim yeniden atlanmaz.
    assert.equal(dropWithUndo(day, result.doc, 'b_bbbbbb', stamp(4)), null);
  });

  test('"Bu hareketi atla" biten birimde yok', () => {
    const day = threeDay();
    let doc = start(day);
    for (let minute = 1; minute <= 3; minute += 1) doc = logNext(day, doc, minute); // Bench bitti
    assert.equal(dropWithUndo(day, doc, 'b_aaaaaa', stamp(4)), null);
  });

  test('"Geri al" önceki geçme işaretini de geri getirir (atlanıp geri alınmış birim)', () => {
    const day = threeDay();
    const first = dropWithUndo(day, start(day), 'b_bbbbbb', stamp(1), sequence());
    assert.ok(first);
    const restored = restoreAt(day, first.doc, 'b_bbbbbb', stamp(2));
    const again = dropWithUndo(day, restored, 'b_bbbbbb', stamp(3));
    assert.ok(again);
    const back = undoSkip(day, again.doc, again.undo, stamp(4));
    const plank = back.entries.find((entry) => entry.rowId === 'r_bbbbbb');
    assert.deepEqual([plank?.status, plank?.skip?.moved], ['pending', true]);
    assert.deepEqual(listView(day, back).items.map((item) => [item.key, item.state]).at(-1), ['b_bbbbbb', 'pending']);
    valid(back);
  });
});

describe('liste + odak: Bugün\'ün kısa listesi', () => {
  /** `n` birim; `groups`'taki sıralarda iki üyeli grup. */
  const units = (n: number, groups: readonly number[] = []) =>
    Array.from({ length: n }, (_, index) => ({ key: `u${index}`, members: groups.includes(index) ? [{ title: `A${index}` }, { title: `B${index}` }] : [{ title: `A${index}` }] }));
  const keys = (list: { shown: { key: string }[] }) => list.shown.map((item) => item.key);

  test('pencere: şu an ilk sekizdeyse baştan; değilse kayar, şu an hep içinde (üstünde bir bağlam satırı)', () => {
    const items = units(20, [1, 18]);
    const head = listWindow(items, 'u7', 8);
    assert.deepEqual(keys(head), ['u0', 'u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7']);
    assert.deepEqual([head.before, head.after], [0, 13], 'alttaki 12 birim, biri iki üyeli grup');
    const middle = listWindow(items, 'u10', 8);
    assert.deepEqual(keys(middle), ['u9', 'u10', 'u11', 'u12', 'u13', 'u14', 'u15', 'u16']);
    assert.deepEqual([middle.before, middle.after], [10, 4], 'üstte 9 birim (biri grup), altta 3 (biri grup)');
    const tail = listWindow(items, 'u18', 8);
    assert.deepEqual(keys(tail), ['u12', 'u13', 'u14', 'u15', 'u16', 'u17', 'u18', 'u19'], 'sona yaslanır');
    assert.deepEqual([tail.before, tail.after], [13, 0]);
  });

  test('pencere: şu an yok ya da listede değil, liste kısa, tek satırlık pencere', () => {
    const items = units(12);
    for (const current of [null, 'u99']) {
      const list = listWindow(items, current, 8);
      assert.deepEqual([list.shown.length, list.before, list.after], [8, 0, 4], String(current));
    }
    assert.deepEqual(listWindow(units(5), 'u4', 8), { shown: units(5), before: 0, after: 0 });
    assert.deepEqual(keys(listWindow(items, 'u5', 1)), ['u5']);
  });

  test('satırın adı: tek harekette başlık, grupta "A + B"; boş başlık düşer', () => {
    assert.equal(itemName({ members: [{ title: 'Bench Press' }] }), 'Bench Press');
    assert.equal(itemName({ members: [{ title: 'Bench Press' }, { title: '' }, { title: 'Row' }] }), 'Bench Press + Row');
  });

  test('telefondaki antrenmanın günü: etkin plan ve istenen fazladan turlar', () => {
    const day = workoutDay();
    const doc = start(day);
    assert.equal(localWorkoutDay({ plan: day, extras: {}, extraRounds: {} }, doc), day, 'değişen yoksa aynı gün');
    const key = day.blocks[0]?.id ?? '';
    assert.deepEqual(localWorkoutDay({ plan: day, extras: {}, extraRounds: { [key]: 1, b_zzzzzz: 2 } }, doc).extraRounds, { [key]: 1 });
  });
});
