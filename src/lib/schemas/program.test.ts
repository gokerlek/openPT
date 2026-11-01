import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';
import { hasAssignmentField } from '../day-assignments.ts';
import { upgradeProgramBody, type ProgramBody, type ProgramDay, type ProgramLogEntry, type ProgramPhase, type ProgramState } from '../program-plan.ts';
import { uniformSets } from '../set-plan.ts';
import type { TemplateBlock } from '../template-plan.ts';
import { programFile } from '../testing/session-fixtures.ts';
import { programFormSchema, programPhaseSwitchSchema, programSaveSchema, programSchema } from './program.ts';

const at = '2026-09-24T09:00:00.000Z';

function block(tail: string): TemplateBlock {
  return {
    id: `b_${tail}`,
    kind: 'single',
    restSeconds: 120,
    rows: [{ id: `r_${tail}`, exerciseId: 'goblet-squat', sets: uniformSets({ min: 8, max: 12 }, 3) }],
  };
}

function day(tail: string, name: string, fields: Partial<ProgramDay> = {}): ProgramDay {
  return { id: `d_${tail}`, name, blocks: [block(tail)], ...fields };
}

/** Kimlikleri benzersiz evreler: her evrede verilen sayıda gün. */
function phases(counts: number[]): ProgramPhase[] {
  let n = 0;
  return counts.map((days, index) => ({
    id: `p_ph${String(index).padStart(4, '0')}`,
    name: `Evre ${index + 1}`,
    days: Array.from({ length: days }, (_, j) => day(`dy${String(n++).padStart(4, '0')}`, `Gün ${j + 1}`)),
  }));
}

const log: ProgramLogEntry = { at, revision: 1, kind: 'create', changes: [{ text: 'Program oluşturuldu' }] };

function program(fields: Partial<ProgramState> = {}): ProgramState {
  return {
    version: 2,
    phased: true,
    revision: 1,
    createdAt: at,
    updatedAt: at,
    phases: [
      { id: 'p_uyum01', name: 'Uyum', weeks: 2, days: [day('aaaaaa', 'Gün A'), day('bbbbbb', 'Gün B')] },
      { id: 'p_guc001', name: 'Güç', days: [day('cccccc', 'Gün A')] },
    ],
    current: { phaseId: 'p_uyum01', startedAt: at },
    rotation: {},
    log: [log],
    ...fields,
  };
}

function paths(result: { issues?: readonly v.BaseIssue<unknown>[] | undefined }): string[] {
  return (result.issues ?? []).map((issue) => issue.path?.map((segment) => String(segment.key)).join('.') ?? '');
}

describe('program şeması', () => {
  test('geçerli program okunur; bilinmeyen alanlar atılır', () => {
    const base = program();
    const withExtra = {
      ...base,
      clientName: 'Ayşe',
      phases: base.phases.map((phase) => ({ ...phase, secret: 'x' })),
    };
    const parsed = v.safeParse(programSchema, withExtra);
    assert.equal(parsed.success, true, parsed.issues?.[0]?.message ?? '');
    assert.equal(parsed.success && 'clientName' in parsed.output, false);
    assert.equal(parsed.success && 'secret' in (parsed.output.phases[0] ?? {}), false);
  });

  test('boş gün kaydedilmez; hata günün bloklarında', () => {
    const base = program();
    const empty = { ...base, phases: [{ ...base.phases[0], days: [{ id: 'd_aaaaaa', name: 'Gün A', blocks: [] }] }, base.phases[1]] };
    const parsed = v.safeParse(programSchema, empty);
    assert.equal(parsed.success, false);
    const issue = parsed.issues?.find((item) => item.message === 'Programa en az bir hareket ekle.');
    assert.ok(issue);
    assert.equal(issue.path?.map((segment) => String(segment.key)).join('.'), 'phases.0.days.0.blocks');
  });

  test('günsüz evre olmaz', () => {
    const base = program();
    assert.equal(v.safeParse(programSchema, { ...base, phases: [{ ...base.phases[0], days: [] }, base.phases[1]] }).success, false);
  });

  test('evrede aynı adda iki gün olmaz; farklı evrelerde olur', () => {
    const base = program();
    const same = { ...base, phases: [{ ...base.phases[0], days: [day('aaaaaa', 'Gün A'), day('bbbbbb', 'gün a ')] }, base.phases[1]] };
    assert.equal(v.safeParse(programSchema, same).success, false);
    // Örnek programda "Gün A" iki evrede de var.
    assert.equal(v.safeParse(programSchema, base).success, true);
  });

  test('iki günde aynı satır kimliği olmaz', () => {
    const base = program();
    const second = day('bbbbbb', 'Gün B', {
      blocks: [{ ...block('bbbbbb'), rows: [{ id: 'r_aaaaaa', exerciseId: 'leg-press', sets: uniformSets({ min: 8, max: 12 }, 3) }] }],
    });
    const dup = { ...base, phases: [{ ...base.phases[0], days: [day('aaaaaa', 'Gün A'), second] }, base.phases[1]] };
    const parsed = v.safeParse(programSchema, dup);
    assert.equal(parsed.success, false);
    assert.ok(parsed.issues?.some((issue) => issue.message === 'Evre, gün, blok ve satır kimlikleri benzersiz olmalı.'));
  });

  test('şu anki evre programda olmalı; formda hata şu anki evre alanında', () => {
    assert.equal(v.safeParse(programSchema, program({ current: { phaseId: 'p_yok000', startedAt: at } })).success, false);
    const form = v.safeParse(programFormSchema, { phased: true, currentPhaseId: 'p_yok000', phases: program().phases });
    assert.equal(form.success, false);
    assert.deepEqual(paths(form), ['currentPhaseId']);
  });

  test('süre 1–52 tam hafta ya da yok', () => {
    const withWeeks = (weeks: number | undefined) => {
      const base = program();
      return { ...base, phases: [{ ...base.phases[0], weeks }, base.phases[1]] };
    };
    assert.equal(v.safeParse(programSchema, withWeeks(0)).success, false);
    assert.equal(v.safeParse(programSchema, withWeeks(53)).success, false);
    assert.equal(v.safeParse(programSchema, withWeeks(2.5)).success, false);
    assert.equal(v.safeParse(programSchema, withWeeks(undefined)).success, true);
    assert.equal(v.safeParse(programSchema, withWeeks(52)).success, true);
  });

  test('en fazla 12 evre ve toplam 28 gün', () => {
    const twelve = phases(Array.from({ length: 12 }, () => 1));
    assert.equal(v.safeParse(programSchema, program({ phases: twelve, current: { phaseId: twelve[0]?.id ?? '', startedAt: at } })).success, true);
    const thirteen = phases(Array.from({ length: 13 }, () => 1));
    assert.equal(v.safeParse(programSchema, program({ phases: thirteen, current: { phaseId: thirteen[0]?.id ?? '', startedAt: at } })).success, false);
    const full = phases([7, 7, 7, 7]);
    assert.equal(v.safeParse(programSchema, program({ phases: full, current: { phaseId: full[0]?.id ?? '', startedAt: at } })).success, true);
    const over = phases([7, 7, 7, 7, 1]);
    const parsed = v.safeParse(programSchema, program({ phases: over, current: { phaseId: over[0]?.id ?? '', startedAt: at } }));
    assert.equal(parsed.success, false);
    assert.ok(parsed.issues?.some((issue) => issue.message === 'Programda en fazla 28 gün olur.'));
  });

  test('geçmiş en fazla 200 kayıt', () => {
    const entries = (n: number) => Array.from({ length: n }, () => log);
    assert.equal(v.safeParse(programSchema, program({ log: entries(200) })).success, true);
    assert.equal(v.safeParse(programSchema, program({ log: entries(201) })).success, false);
  });

  test('kayıt ucu: baseRevision null (yeni) ya da 1 ve üstü', () => {
    const body = { phased: true, currentPhaseId: 'p_uyum01', phases: program().phases };
    assert.equal(v.safeParse(programSaveSchema, { ...body, baseRevision: null }).success, true);
    assert.equal(v.safeParse(programSaveSchema, { ...body, baseRevision: 7 }).success, true);
    assert.equal(v.safeParse(programSaveSchema, { ...body, baseRevision: 0 }).success, false);
  });

  test('kayıt ucu ve evre geçişi: oluşturulma anı (baseCreatedAt) isteğe bağlı, varsa geçerli bir an', () => {
    const body = { phased: true, currentPhaseId: 'p_uyum01', phases: program().phases, baseRevision: 7 };
    const withAt = v.safeParse(programSaveSchema, { ...body, baseCreatedAt: '2026-09-24T09:00:00.000Z' });
    assert.ok(withAt.success);
    assert.equal(withAt.output.baseCreatedAt, '2026-09-24T09:00:00.000Z');
    // Eski sekme göndermez: yalnız revision denetlenir.
    assert.equal(v.safeParse(programSaveSchema, body).success, true);
    assert.equal(v.safeParse(programSaveSchema, { ...body, baseCreatedAt: 'dün' }).success, false);
    const phase = { phaseId: 'p_guc001', baseRevision: 7 };
    assert.equal(v.safeParse(programPhaseSwitchSchema, phase).success, true);
    assert.equal(v.safeParse(programPhaseSwitchSchema, { ...phase, baseCreatedAt: '2026-09-24T09:00:00.000Z' }).success, true);
    assert.equal(v.safeParse(programPhaseSwitchSchema, { ...phase, baseCreatedAt: 42 }).success, false);
  });
});

describe('evresiz program, sıklık ve eski dosyalar', () => {
  /** Sürüm 1: blokta set sayısı, satırda tek hedef, `phased` yok. */
  function legacyBlock(tail: string) {
    return { id: `b_${tail}`, kind: 'single', sets: 4, restSeconds: 120, rows: [{ id: `r_${tail}`, exerciseId: 'goblet-squat', target: { min: 5, max: 8 } }] };
  }
  function legacy(phaseList: Record<string, unknown>[]) {
    return {
      version: 1,
      revision: 1,
      createdAt: at,
      updatedAt: at,
      phases: phaseList,
      current: { phaseId: 'p_uyum01', startedAt: at },
      rotation: {},
      log: [log],
    };
  }
  const onePhase = (fields: Record<string, unknown> = {}) => ({
    id: 'p_uyum01',
    name: 'Evre 1',
    days: [{ id: 'd_aaaaaa', name: 'Gün A', blocks: [legacyBlock('aaaaaa')] }],
    ...fields,
  });

  test('sürüm 1, tek süresiz evre: evresiz sürüm 2, satırlar sete çevrilir', () => {
    const parsed = v.safeParse(programSchema, legacy([onePhase()]));
    assert.equal(parsed.success, true, parsed.issues?.[0]?.message ?? '');
    if (!parsed.success) return;
    assert.equal(parsed.output.version, 2);
    assert.equal(parsed.output.phased, false);
    assert.deepEqual(parsed.output.phases[0]?.days[0]?.blocks[0]?.rows[0]?.sets, uniformSets({ min: 5, max: 8 }, 4));
    assert.equal('sets' in (parsed.output.phases[0]?.days[0]?.blocks[0] ?? {}), false);
  });

  test('sürüm 1: iki evre ya da süreli tek evre evreli', () => {
    const two = legacy([
      onePhase(),
      { id: 'p_guc001', name: 'Güç', days: [{ id: 'd_bbbbbb', name: 'Gün A', blocks: [legacyBlock('bbbbbb')] }] },
    ]);
    const parsedTwo = v.safeParse(programSchema, two);
    assert.equal(parsedTwo.success && parsedTwo.output.phased, true);
    const timed = v.safeParse(programSchema, legacy([onePhase({ weeks: 2 })]));
    assert.equal(timed.success && timed.output.phased, true);
  });

  test('evresiz programda tek, süresiz evre olur', () => {
    const two = v.safeParse(programSchema, program({ phased: false }));
    assert.equal(two.success, false);
    assert.deepEqual(
      two.issues?.map((issue) => [issue.path?.map((segment) => String(segment.key)).join('.'), issue.message]),
      [['phases', 'Evresiz programda tek, süresiz gün listesi olur.']],
    );
    const base = program();
    const timed = { ...base, phased: false, phases: [base.phases[0]] };
    assert.deepEqual(paths(v.safeParse(programSchema, timed)), ['phases']);
    const open = { ...base, phased: false, phases: [{ ...base.phases[0], weeks: undefined }] };
    assert.equal(v.safeParse(programSchema, open).success, true);
  });

  test('sürüm 2 dosyada evre seçimi zorunlu (onarılmaz)', () => {
    const { phased: _phased, ...rest } = program();
    assert.equal(v.safeParse(programSchema, rest).success, false);
  });

  test('haftada en fazla 7 gün', () => {
    const base = program();
    const withFrequency = (daysPerWeek: number) => ({ ...base, phases: [{ ...base.phases[0], daysPerWeek }, base.phases[1]] });
    assert.equal(v.safeParse(programSchema, withFrequency(3)).success, true);
    const parsed = v.safeParse(programSchema, withFrequency(8));
    assert.deepEqual(
      parsed.issues?.map((issue) => [issue.path?.map((segment) => String(segment.key)).join('.'), issue.message]),
      [['phases.0.daysPerWeek', 'En fazla 7 gün.']],
    );
    assert.equal(v.safeParse(programSchema, withFrequency(0)).success, false);
  });

  test('kayıt ucu: evre seçimi yoksa evrelerden; eski bloklar çevrilir', () => {
    const body = {
      currentPhaseId: 'p_uyum01',
      phases: [{ id: 'p_uyum01', name: 'Evre 1', days: [{ id: 'd_aaaaaa', name: 'Gün A', blocks: [legacyBlock('aaaaaa')] }] }],
      baseRevision: 1,
    };
    const parsed = v.safeParse(programSaveSchema, body);
    assert.equal(parsed.success, true, parsed.issues?.[0]?.message ?? '');
    if (!parsed.success) return;
    assert.equal(parsed.output.phased, false);
    assert.equal(parsed.output.phases[0]?.days[0]?.blocks[0]?.rows[0]?.sets.length, 4);
  });

  test('düzenleyicinin şeması evre seçimini ister', () => {
    const { phased: _phased, ...rest } = { phased: true, currentPhaseId: 'p_uyum01', phases: program().phases };
    assert.equal(v.safeParse(programFormSchema, rest).success, false);
    assert.equal(v.safeParse(programFormSchema, { ...rest, phased: 'evet' }).success, false);
    assert.equal(v.safeParse(programFormSchema, { ...rest, phased: true }).success, true);
  });
});

/** Dosyadan düzenleyicinin gövdesi (eski sekmenin gönderdiği gibi). */
function bodyOf(file: ReturnType<typeof programFile>) {
  return { phased: file.phased, currentPhaseId: file.current.phaseId, phases: file.phases };
}

describe('Faz 3: atamalar', () => {
  test('eski dosya okunurken atanır (başa sararak); ikinci okuma aynı; schedule aynen', () => {
    const parsed = v.parse(programSchema, programFile({}, { schedule: { weekdays: [1, 3, 5] } }));
    assert.deepEqual(parsed.phases[0]?.days.map((day) => day.weekdays), [[1, 5], [3]]);
    assert.deepEqual(v.parse(programSchema, parsed), parsed);
    assert.deepEqual(parsed.schedule?.weekdays, [1, 3, 5]);
  });

  test('gün seçilmemiş eski dosya atanmaz', () => {
    const parsed = v.parse(programSchema, programFile());
    assert.equal(parsed.phases[0]?.days.some((day) => 'weekdays' in day), false);
  });

  test('aynı gün iki programda: dosya okunmaz', () => {
    const raw = programFile();
    const phases = raw.phases.map((phase) => ({ ...phase, days: phase.days.map((day, index) => ({ ...day, weekdays: index === 0 ? [2] : [2, 4] })) }));
    const result = v.safeParse(programSchema, { ...raw, phases });
    assert.equal(result.success, false);
    assert.equal(result.issues?.[0]?.message, 'Aynı gün iki programa atanmış.');
  });

  test('eski sekmenin gövdesi: program düzeyindeki günler atanır; kendi programda açılıştaki günler türetilmez', () => {
    const body = v.parse(programSaveSchema, { ...bodyOf(programFile()), weekdays: [2, 4], baseRevision: 7 });
    assert.deepEqual(body.phases[0]?.days.map((day) => day.weekdays), [[2], [4]]);
    const untouched = upgradeProgramBody({ ...bodyOf(programFile()), weekdays: [4, 2], baseWeekdays: [2, 4] }) as ProgramBody;
    assert.equal(hasAssignmentField(untouched.phases), false);
  });

  test('sürüm 1 dosya da schedule\'dan atanır', () => {
    const v1 = { ...programFile({}, { schedule: { weekdays: [2, 4] } }), version: 1, phased: undefined };
    const parsed = v.parse(programSchema, v1);
    assert.equal(parsed.version, 2);
    assert.deepEqual(parsed.phases[0]?.days.map((day) => day.weekdays), [[2], [4]]);
  });

  test('aynı hafta günü iki ayrı evrede olabilir', () => {
    const [uyum, guc] = phases([2, 1]);
    const result = v.safeParse(programSchema, program({
      phases: [
        { ...uyum!, days: uyum!.days.map((item, index) => ({ ...item, weekdays: index === 0 ? [2] : [4] })) },
        { ...guc!, days: guc!.days.map((item) => ({ ...item, weekdays: [2, 4] })) },
      ],
      current: { phaseId: uyum!.id, startedAt: at },
    }));
    assert.equal(result.success, true, result.issues?.[0]?.message ?? '');
  });

  test('okuma girdiyi değiştirmez', () => {
    const raw = programFile({}, { schedule: { weekdays: [1, 3, 5] } });
    const before = structuredClone(raw);
    v.parse(programSchema, raw);
    assert.deepEqual(raw, before);
    const body = { ...bodyOf(programFile()), weekdays: [2, 4], baseRevision: 7 };
    const bodyBefore = structuredClone(body);
    v.parse(programSaveSchema, body);
    assert.deepEqual(body, bodyBefore);
  });
});
