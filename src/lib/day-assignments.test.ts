import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assignWeekdays,
  cleanWeekdays,
  dayOnWeekday,
  deriveAssignments,
  hasAssignmentField,
  hasAssignments,
  keepAssignments,
  phaseWeekdays,
  takenWeekdays,
  upgradeAssignments,
  weekAssignments,
  weekdayConflicts,
  weekdayNames,
  weekdaysChangeText,
  weekdaysInput,
  weekdaysText,
} from './day-assignments.ts';

const plan = [
  { id: 'd_aaaaaa', name: 'Alt vücut', weekdays: [2] },
  { id: 'd_bbbbbb', name: 'Üst vücut', weekdays: [4] },
  { id: 'd_cccccc', name: 'Tüm vücut', weekdays: [7] },
];
const IDS = ['d_aaaaaa', 'd_bbbbbb', 'd_cccccc', 'd_dddddd'];
const bare = (n: number) => IDS.slice(0, n).map((id, index) => ({ id, name: `Gün ${'ABCD'.charAt(index)}` }));

describe('hafta günü atamaları', () => {
  test('birleşim, o günün programı, haftanın sırası, metinler', () => {
    assert.deepEqual(phaseWeekdays(plan), [2, 4, 7]);
    assert.equal(hasAssignments(plan), true);
    assert.equal(hasAssignments(bare(2)), false);
    assert.equal(dayOnWeekday(plan, 4)?.name, 'Üst vücut');
    assert.equal(dayOnWeekday(plan, 1), null);
    assert.deepEqual(weekAssignments(plan).map(({ weekday, day }) => [weekday, day.name]), [[2, 'Alt vücut'], [4, 'Üst vücut'], [7, 'Tüm vücut']]);
    assert.deepEqual(weekdayNames(plan), { 2: 'Alt vücut', 4: 'Üst vücut', 7: 'Tüm vücut' });
    assert.deepEqual(cleanWeekdays([7, 2, 2, 0, 8, 1.5, '3']), [2, 7]);
    assert.equal(weekdaysText([4, 2]), 'Sal, Per');
    assert.equal(weekdaysChangeText([2, 4], [2, 4, 5]), 'Antrenman günleri: Sal, Per → Sal, Per, Cum');
  });

  test('çakışan gün ve başka programın günleri', () => {
    assert.deepEqual(weekdayConflicts([...plan, { id: 'd_dddddd', name: 'Kardiyo', weekdays: [4, 5] }]), [4]);
    assert.deepEqual([...takenWeekdays(plan, 'd_aaaaaa')], [[4, 'Üst vücut'], [7, 'Tüm vücut']]);
    assert.deepEqual(weekdayConflicts([{ id: 'd_aaaaaa', name: 'Alt vücut', weekdays: [2, 2] }]), []);
    const twice = [{ id: 'd_aaaaaa', name: 'Alt vücut', weekdays: [2] }, { id: 'd_bbbbbb', name: 'Üst vücut', weekdays: [2] }];
    assert.deepEqual([[...takenWeekdays(twice, 'd_aaaaaa')], [...takenWeekdays(twice, 'd_bbbbbb')]], [[], [[2, 'Alt vücut']]]);
  });

  test('atama: başka programın günü alınmaz; değişmezse aynı dizi; boş atama alanı tutar', () => {
    assert.deepEqual(assignWeekdays(plan, 'd_aaaaaa', [5, 2, 4])[0]?.weekdays, [2, 5]);
    assert.equal(assignWeekdays(plan, 'd_aaaaaa', [2]), plan);
    assert.deepEqual(assignWeekdays(plan, 'd_aaaaaa', [])[0]?.weekdays, []);
    assert.equal(assignWeekdays(plan, 'd_zzzzzz', [1]), plan);
  });

  // Gün açıp kapamak formu kirli bırakmasın; başlangıçta günü olan programın boş seçimi "hepsi kaldırıldı" kalsın.
  test('formun gün alanı: boş seçimde başlangıçta alan yoksa alan yok, varsa boş dizi', () => {
    assert.deepEqual(weekdaysInput([2, 4], false), [2, 4]);
    assert.equal(weekdaysInput([], false), undefined);
    assert.deepEqual(weekdaysInput([], true), []);
    assert.equal(weekdaysInput(undefined, true), undefined);
  });

  test('eski program: sırayla; fazla gün başa sarar; fazla program atanmasız', () => {
    assert.deepEqual(deriveAssignments(bare(3), [2, 4, 7]).map((day) => day.weekdays), [[2], [4], [7]]);
    assert.deepEqual(deriveAssignments(bare(3), [6, 1, 3, 5]).map((day) => day.weekdays), [[1, 6], [3], [5]]);
    const more = deriveAssignments(bare(4), [2, 4]);
    assert.deepEqual(more.map((day) => day.weekdays), [[2], [4], undefined, undefined]);
    assert.equal('weekdays' in (more[2] ?? {}), false);
    const days = bare(2);
    assert.equal(deriveAssignments(days, []), days);
  });

  test('okurken: alan hiç yoksa her evre türetilir; varsa, gün yoksa ya da veri bozuksa dokunulmaz', () => {
    const raw = [{ id: 'p_aaaaaa', days: bare(2) }, { id: 'p_bbbbbb', days: bare(3) }];
    const upgraded = upgradeAssignments(raw, [1, 3, 5]) as { days: { weekdays?: number[] }[] }[];
    assert.deepEqual(upgraded.map((phase) => phase.days.map((day) => day.weekdays)), [[[1, 5], [3]], [[1], [3], [5]]]);
    assert.equal(hasAssignmentField(upgraded), true);
    assert.equal(hasAssignmentField(raw), false);
    assert.equal(upgradeAssignments(upgraded, [2]), upgraded);
    assert.equal(upgradeAssignments(raw, undefined), raw);
    assert.equal(upgradeAssignments(raw, 'Pzt'), raw);
    assert.equal(upgradeAssignments(raw, []), raw);
    const odd = [{ id: 'p_aaaaaa', days: 'bozuk' }, null];
    assert.deepEqual(upgradeAssignments(odd, [1]), odd);
    assert.deepEqual(upgradeAssignments([{ id: 'p_aaaaaa', days: [null, bare(1)[0]] }], [1, 3]), [{ id: 'p_aaaaaa', days: [null, { ...bare(1)[0], weekdays: [3] }] }]);
    assert.equal(hasAssignmentField([{ id: 'p_aaaaaa', days: [{ ...bare(1)[0], weekdays: undefined }] }]), false);
  });

  test('eski sekmenin günleri açılıştakiyle aynı: kayıttaki atamalar gün kimliğiyle korunur', () => {
    const sent = [{ id: 'd_aaaaaa', name: 'Alt vücut' }, { id: 'd_eeeeee', name: 'Yeni' }];
    assert.deepEqual(keepAssignments(sent, plan).map((day) => day.weekdays), [[2], undefined]);
    assert.deepEqual(keepAssignments([{ id: 'd_aaaaaa', name: 'Alt vücut', weekdays: [] }], plan)[0]?.weekdays, []);
  });
});
