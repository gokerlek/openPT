import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';
import { addToGroupHint, addToGroupTitle, bulkMessage, combineMessage, deviceChangeMessage, dropTargetLabel, edgeMessage, groupWorkText, groupedMessage, moveMessage, rowWorkText, selectionStatus } from '../lib/edit-messages.ts';
import { targetLabel } from '../lib/client-targets.ts';
import { RULES, evaluateExercise, filterGroupLabels } from '../lib/exercise-filter.ts';
import { applyProposal, approvalNote, outcomeLabels, proposalKindLabels, type Proposal } from '../lib/proposals.ts';
import { commitMessage, diffDay, diffProgram, type DiffContext } from '../lib/program-diff.ts';
import type { ProgramBody, ProgramDay, ProgramPhase } from '../lib/program-plan.ts';
import { exerciseFormSchema } from '../lib/schemas/exercise.ts';
import { programSchema } from '../lib/schemas/program.ts';
import { templateSchema } from '../lib/schemas/template.ts';
import { resizeSets, uniformSets } from '../lib/set-plan.ts';
import type { TemplateBlock, TemplateRow } from '../lib/template-plan.ts';
import { exerciseFilterMessages } from './messages/exercise-filter/index.ts';
import { programValidationMessages } from './messages/program-validation/index.ts';
import { programLogMessages } from './messages/program-log/index.ts';
import { langConfig } from './valibot.ts';

/** T1 (kütüphane ve program düzenleyici) metinlerinin İngilizcesi: saf işlevlerin çıktısı, saklanan geçmiş cümleleri. */

const ctx: DiffContext = {
  locale: 'en',
  exercises: new Map([
    ['squat', { title: 'Squat', trackingType: 'weight_reps' as const }],
    ['bench', { title: 'Bench Press', trackingType: 'weight_reps' as const }],
    ['plank', { title: 'Plank', trackingType: 'duration' as const }],
  ]),
  devices: new Map([['smith', { name: 'Smith machine' }]]),
};
const trCtx: DiffContext = { ...ctx, locale: 'tr' };

function row(id: string, exerciseId: string, min = 8, max = 12, fields: Partial<TemplateRow> = {}): TemplateRow {
  return { id, exerciseId, sets: uniformSets({ min, max }, 3), ...fields };
}
function single(id: string, r: TemplateRow, sets = 3, restSeconds = 120): TemplateBlock {
  return { id, kind: 'single', restSeconds, rows: [{ ...r, sets: resizeSets(r.sets, sets) }] };
}
function day(id: string, name: string, blocks: TemplateBlock[]): ProgramDay {
  return { id, name, blocks };
}

describe('program geçmişi İngilizce yazılır', () => {
  const before = day('d_aaaaaa', 'Day A', [single('b_squat', row('r_squat', 'squat')), single('b_bench', row('r_bench', 'bench'))]);

  test('satır cümleleri', () => {
    const after = day('d_aaaaaa', 'Day A', [
      single('b_squat', row('r_squat', 'squat', 10, 12, { note: 'Slow tempo' })),
      single('b_bench', row('r_bench', 'bench'), 3, 90),
      single('b_plank', row('r_plank', 'plank', 30, 60)),
    ]);
    assert.deepEqual(diffDay(before, after, ctx), [
      'Squat 3×8–12 → 3×10–12',
      'Squat note: “Slow tempo”',
      'Bench Press rest 2 min → 1 min 30 s',
      'Plank added',
    ]);
    assert.deepEqual(diffDay(before, after, trCtx), [
      'Squat 3×8–12 → 3×10–12',
      'Squat notu: “Slow tempo”',
      'Bench Press dinlenme 2 dk → 1 dk 30 sn',
      'Plank eklendi',
    ]);
  });

  test('egzersiz çıkarma ve sıra değişimi', () => {
    const swapped = day('d_aaaaaa', 'Day A', [single('b_bench', row('r_bench', 'bench')), single('b_squat', row('r_squat', 'squat'))]);
    assert.deepEqual(diffDay(before, swapped, ctx), ['Exercise order changed']);
    const removed = day('d_aaaaaa', 'Day A', [single('b_squat', row('r_squat', 'squat'))]);
    assert.deepEqual(diffDay(before, removed, ctx), ['Bench Press removed']);
  });

  test('evre ve gün cümleleri', () => {
    const phase = (name: string, days: ProgramDay[], extra: Partial<ProgramPhase> = {}): ProgramPhase => ({ id: 'p_aaaaaa', name, days, ...extra });
    const a: ProgramBody = { phased: false, currentPhaseId: 'p_aaaaaa', phases: [phase('Phase 1', [before])] };
    const b: ProgramBody = {
      phased: false,
      currentPhaseId: 'p_aaaaaa',
      phases: [phase('Phase 1', [{ ...before, name: 'Upper' }, day('d_bbbbbb', 'Day B', before.blocks.map((block) => ({ ...block, id: `${block.id}2`, rows: block.rows.map((r) => ({ ...r, id: `${r.id}2` })) })))], { daysPerWeek: 3 })],
    };
    const changes = diffProgram(a, b, ctx).map((change) => change.text);
    assert.ok(changes.includes("Day name: 'Day A' → 'Upper'"), changes.join(' | '));
    assert.ok(changes.includes('Day B added'), changes.join(' | '));
    assert.ok(changes.includes('Frequency: 3 days a week'), changes.join(' | '));
    const turkish = diffProgram(a, b, trCtx).map((change) => change.text);
    assert.ok(turkish.includes('Sıklık: haftada 3 gün'), turkish.join(' | '));
  });

  test('commit mesajı: önek iki dilde "Program: ", özet yazanın dilinde', () => {
    const changes = [{ scope: 'Day A', text: 'Squat 3×8–12 → 3×10–12' }];
    assert.equal(commitMessage('edit', changes, 'en'), 'Program: Day A: Squat 3×8–12 → 3×10–12');
    assert.equal(commitMessage('edit', [], 'en'), 'Program updated');
    assert.equal(commitMessage('create', [], 'en'), 'Program created');
    assert.equal(commitMessage('edit', [], 'tr'), 'Program güncellendi');
    assert.equal(commitMessage('create', [], 'tr'), 'Program oluşturuldu');
    const many = [changes[0]!, { text: 'Bench Press removed' }];
    assert.match(commitMessage('edit', many, 'en'), /^Program: .*\n\n- Day A: Squat 3×8–12 → 3×10–12\n- Bench Press removed$/s);
  });
});

describe('düzenleyici cümleleri İngilizce', () => {
  const titles: Record<string, string> = { squat: 'Squat', bench: 'Bench Press', row: 'Cable Row' };
  const titleOf = (id: string) => titles[id] ?? 'Deleted exercise';
  const blocks: TemplateBlock[] = [
    single('b_1', row('r_1', 'squat')),
    { id: 'b_2', kind: 'superset', restSeconds: 90, rows: [row('r_2', 'bench'), row('r_3', 'row')] },
  ];

  test('taşıma, uç, seçim ve toplu işlem', () => {
    const moved = [blocks[1]!, blocks[0]!];
    assert.equal(moveMessage(blocks, moved, 'r_1', titleOf, 'en'), 'Squat moved to position 2');
    assert.equal(edgeMessage(blocks, 'r_1', true, titleOf, 'en'), 'Squat is already first');
    assert.equal(edgeMessage(blocks, 'r_3', false, titleOf, 'en'), 'Cable Row is already last in the group');
    assert.equal(selectionStatus(0, 'superset', 'touch', 'en'), 'Tap the cards to select · pick 2 exercises for a superset');
    assert.equal(selectionStatus(3, 'circuit', 'touch', 'en'), '3 selected · becomes a circuit');
    assert.equal(selectionStatus(1, 'too_few', 'touch', 'en'), '1 selected · select at least 2 exercises to group');
    assert.equal(bulkMessage(1, 'copied', 'en'), '1 exercise copied');
    assert.equal(bulkMessage(3, 'removed', 'en'), '3 exercises deleted');
    assert.equal(groupedMessage(blocks, new Set(['b_1']), 'circuit', titleOf, 'en'), 'Circuit created (1 exercise)');
    assert.equal(addToGroupTitle('superset', 1, 'en'), 'Add to Superset 2');
    assert.equal(addToGroupTitle('superset', 1), "Süperset 2'ye ekle");
  });

  test('cihaz değişimi, bırakma etiketi, dinlenme ve grup özeti', () => {
    assert.equal(deviceChangeMessage({ kind: 'swapped', device: 'Cable station 2', from: 'Lat Pulldown', to: 'Seated Row' }, 'en'), 'Cable station 2 → Seated Row (instead of Lat Pulldown)');
    assert.equal(deviceChangeMessage({ kind: 'device', device: 'Smith machine', title: 'Bench Press' }, 'en'), 'Bench Press · equipment: Smith machine');
    assert.equal(deviceChangeMessage({ kind: 'reset', device: null, title: 'Bench Press' }, 'en'), 'Bench Press · no equipment');
    assert.equal(dropTargetLabel(blocks, 'r_1', 'superset', titleOf, 'en'), 'Make superset: Squat');
    assert.equal(dropTargetLabel(blocks, 'b_2', 'join', titleOf, 'en'), 'Add to group: Superset 2');
    assert.equal(dropTargetLabel(blocks, 'b_2', 'full', titleOf, 'en'), 'Group full (8)');
    assert.equal(rowWorkText(uniformSets({ min: 8, max: 12 }, 3), 'weight_reps', 90, null, 'en'), '3×8–12 · 90 s');
    assert.equal(rowWorkText(uniformSets({ min: 30, max: 30 }, 3), 'duration', 0, null, 'en'), '3×30 s · no rest');
    assert.equal(groupWorkText({ kind: 'circuit', restSeconds: 90, transitionSeconds: 15, rows: [1, 2] }, 3, 'en'), '2 exercises · 3 rounds · 90 s after the round · station 15 s');
    assert.equal(groupWorkText({ kind: 'superset', restSeconds: 0, rows: [1] }, 1, 'en'), '1 exercise · 1 round · no rest after the round');
    assert.deepEqual(addToGroupHint('full', 'en'), { blocked: 'Group full (8)', hint: '' });
    assert.deepEqual(addToGroupHint('becomes_circuit', 'en'), { blocked: null, hint: 'Adding it makes this a circuit' });
    assert.equal(combineMessage(blocks, blocks, 'r_1', 'r_2', 'becomes_circuit', titleOf, 'en'), 'Superset became a circuit');
  });
});

describe('danışanın hedefi ve öneriler İngilizce', () => {
  test('targetLabel', () => {
    assert.equal(targetLabel(uniformSets({ min: 10, max: 14 }, 3), 'weight_reps', 'en'), '10–14');
    assert.equal(targetLabel(uniformSets({ min: 40, max: 60 }, 3), 'duration', 'en'), '40–60 s');
    assert.equal(targetLabel(uniformSets({ min: 40, max: 60 }, 3), 'duration'), '40–60 sn');
  });

  test('karar etiketleri danışanın dilinde, tür adları, onay notu', () => {
    assert.deepEqual(outcomeLabels('en'), {
      approved: 'Your trainer approved your suggestion',
      declined: 'Your trainer declined your suggestion',
      stale: "Your suggestion couldn't be applied because the program changed",
    });
    assert.equal(outcomeLabels().approved, 'Antrenörün önerini onayladı');
    assert.equal(proposalKindLabels('en').algo_sets, 'Set increase · suggestion engine');
    assert.equal(approvalNote({ text: 'Leg Press 3 → 4 sets' }, 'en'), "Client's suggestion: Leg Press 3 → 4 sets");
    assert.equal(approvalNote({ text: 'Leg Press 3 → 4 set' }), 'Danışanın önerisi: Leg Press 3 → 4 set');
  });

  test('uygulanamayan öneri nedeni', () => {
    const proposal: Proposal = {
      id: 'pr_aaaaaa',
      at: '2026-11-05T10:00:00.000Z',
      sessionId: 's_20261105_1000_aaaaaa',
      dayId: 'd_aaaaaa',
      rowId: 'r_gone01',
      exerciseId: 'squat',
      title: 'Squat',
      kind: 'sets',
      from: 3,
      to: 4,
      text: 'Squat 3 → 4 sets',
      status: 'pending',
    };
    const ids = (prefix: string) => `${prefix}_zzzzzz`;
    const result = applyProposal({ phases: [] }, proposal, ids as never, 'en');
    assert.deepEqual(result, { status: 'stale', reason: 'This exercise is no longer in the program.' });
    assert.deepEqual(applyProposal({ phases: [] }, proposal, ids as never), { status: 'stale', reason: 'Bu hareket programda artık yok.' });
  });
});

describe('kısıt süzgeci İngilizce', () => {
  test('her kuralın gerekçesi iki dilde var', () => {
    for (const locale of ['tr', 'en'] as const) {
      const rules: Record<string, string> = exerciseFilterMessages(locale).exerciseFilter.rules;
      for (const rule of RULES) assert.ok((rules[rule.id] ?? '').length > 10, `${locale}: ${rule.id}`);
    }
  });

  test('manuel yasak ve bulgu İngilizce', () => {
    const result = evaluateExercise(
      { contraindications: ['lumbar_disc_herniation'], spinalAlignment: 'flexion_with_rotation', axialLoading: 'high' },
      [{ id: 'lumbar_disc_herniation' }],
      { locale: 'en' },
    );
    assert.equal(result.decision, 'block');
    assert.match(result.findings[0]!.message, /^Marked for .+: blocked for this exercise\.$/);
    assert.deepEqual(filterGroupLabels('en'), { blocked: 'blocked', warned: 'warning', clear: 'suitable', untagged: 'not checked', unassessed: 'missing info' });
  });
});

describe('şema mesajları isteğin dilinde', () => {
  test('egzersiz formu', () => {
    const bad = { title: 'x', primaryMuscles: [] };
    const en = v.safeParse(exerciseFormSchema, bad, langConfig('en'));
    assert.ok(!en.success);
    const messages = en.issues.map((issue) => issue.message);
    assert.ok(messages.includes('The exercise name is too short.'), messages.join(' | '));
    assert.ok(messages.includes('Choose at least one primary muscle.'), messages.join(' | '));
    const tr = v.safeParse(exerciseFormSchema, bad);
    assert.ok(!tr.success);
    assert.ok(tr.issues.map((issue) => issue.message).includes('Egzersiz adı çok kısa.'));
  });

  test('şablon ve program', () => {
    const template = v.safeParse(templateSchema, { id: 't_aaaaaaaa', name: 'x', blocks: [] }, langConfig('en'));
    assert.ok(!template.success);
    const messages = template.issues.map((issue) => issue.message);
    assert.ok(messages.includes('The template name is too short.'), messages.join(' | '));
    assert.ok(messages.includes('Add at least one exercise.'), messages.join(' | '));
    const program = v.safeParse(programSchema, {}, langConfig('en'));
    assert.ok(!program.success);
  });

  test('sözlükler: sayıya bağlı çoğul ve süre birimi', () => {
    const t = programLogMessages('en').diff;
    assert.equal(t.weeks(1, '1'), '1 week');
    assert.equal(t.weeks(6, '6'), '6 weeks');
    assert.equal(t.perWeek(1, '1'), '1 day a week');
    assert.equal(programValidationMessages('en').programSchema.units.weeks(1), ' week');
    assert.equal(programValidationMessages('tr').programSchema.units.weeks(1), ' hafta');
  });
});
