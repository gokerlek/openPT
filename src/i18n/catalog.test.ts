import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { LOCALES } from './locale.ts';
import { catalogMessages } from './messages/catalog/index.ts';
import { MOVEMENT_PATTERNS } from '../lib/alternatives.ts';
import { CONDITION_IDS, CONDITION_QUALIFIERS, clientSafeLabel, conditionInfo, conditionLabel } from '../lib/conditions.ts';
import { WEEKDAYS, weekdaysChangeText, weekdaysText } from '../lib/day-assignments.ts';
import { DEEP_MUSCLES, POSTURAL_PATTERN_IDS, posturalPattern } from '../lib/deep-muscles.ts';
import { DEVICE_KINDS, describeDeviceLoads } from '../lib/device-loads.ts';
import { GRIP_WIDTHS, GRIPS, describeGrip } from '../lib/grips.ts';
import { muscleSearchNames } from '../lib/muscle-names.ts';
import { roleMapProps } from '../lib/muscle-tiers.ts';
import { summarizeMuscles } from '../lib/muscles.ts';
import { defaultPhaseName, nextDayName, nextPhaseName, phaseStatusLabel } from '../lib/program-plan.ts';
import { EFFORTS, PROGRESSION_SCHEMES, describeRule } from '../lib/progression.ts';
import { CLIENT_STATUSES, HEALTH_FIELDS, TRAINING_EXPERIENCES } from '../lib/schemas/client.ts';
import { CATEGORIES, EQUIPMENT, MUSCLES, muscleFamilies, muscleGroups } from '../lib/schemas/exercise.ts';
import { formatSets, setsText } from '../lib/set-plan.ts';
import { BLOCK_KINDS, describeBlock, formatRest } from '../lib/template-plan.ts';

/** Kodla saklanan her şeyin iki dilde adı var; İngilizce çıktı kodlarla değil adlarla kurulur. */
describe('katalog: her kodun iki dilde adı', () => {
  const lists: [string, readonly (string | number)[], (locale: 'tr' | 'en') => Record<string | number, unknown>][] = [
    ['MUSCLES', MUSCLES, (l) => catalogMessages(l).muscles],
    ['EQUIPMENT', EQUIPMENT, (l) => catalogMessages(l).equipment],
    ['CATEGORIES', CATEGORIES, (l) => catalogMessages(l).categories],
    ['CONDITION_IDS', CONDITION_IDS, (l) => catalogMessages(l).conditions],
    ['CONDITION_QUALIFIERS', CONDITION_QUALIFIERS, (l) => catalogMessages(l).conditionQualifiers],
    ['WEEKDAYS (kısa)', WEEKDAYS, (l) => catalogMessages(l).weekdays.short],
    ['WEEKDAYS', WEEKDAYS, (l) => catalogMessages(l).weekdays.long],
    ['DEEP_MUSCLES', DEEP_MUSCLES, (l) => catalogMessages(l).deepMuscles],
    ['POSTURAL_PATTERN_IDS', POSTURAL_PATTERN_IDS, (l) => catalogMessages(l).posturalPatterns],
    ['GRIPS', GRIPS, (l) => catalogMessages(l).grips],
    ['GRIP_WIDTHS', GRIP_WIDTHS, (l) => catalogMessages(l).gripWidths],
    ['MOVEMENT_PATTERNS', MOVEMENT_PATTERNS, (l) => catalogMessages(l).patterns],
    ['DEVICE_KINDS', DEVICE_KINDS, (l) => catalogMessages(l).deviceKinds],
    ['EFFORTS', [...EFFORTS, 'unknown'], (l) => catalogMessages(l).progression.efforts],
    ['PROGRESSION_SCHEMES', PROGRESSION_SCHEMES, (l) => catalogMessages(l).progression.schemes],
    ['BLOCK_KINDS', BLOCK_KINDS, (l) => catalogMessages(l).blocks.kinds],
    ['CLIENT_STATUSES', CLIENT_STATUSES, (l) => catalogMessages(l).clientStatuses],
    ['HEALTH_FIELDS', HEALTH_FIELDS, (l) => catalogMessages(l).healthFields],
    ['TRAINING_EXPERIENCES', TRAINING_EXPERIENCES, (l) => catalogMessages(l).trainingExperiences],
  ];
  for (const [name, codes, labels] of lists) {
    test(name, () => {
      for (const locale of LOCALES) {
        const map = labels(locale);
        const missing = codes.filter((code) => !map[code]);
        assert.deepEqual(missing, [], `${locale}: adı olmayan kod`);
        assert.equal(Object.keys(map).length, codes.length, `${locale}: kodu olmayan ad`);
      }
    });
  }

  test('kas bölgeleri ve aileleri her kası kapsar, iki dilde aynı yapı', () => {
    const covered = new Set(muscleGroups('en').flatMap((group) => group.muscles));
    assert.deepEqual(MUSCLES.filter((muscle) => !covered.has(muscle)), []);
    assert.deepEqual(
      muscleGroups('en').map((group) => [group.id, group.muscles]),
      muscleGroups('tr').map((group) => [group.id, group.muscles]),
    );
    assert.deepEqual(
      muscleFamilies('en').map((family) => family.muscles),
      muscleFamilies('tr').map((family) => family.muscles),
    );
  });

  test('kısıt sözlüğü: kurallar dilden bağımsız, yalnız ad ve not değişir', () => {
    for (const id of CONDITION_IDS) {
      const { label: trLabel, note: trNote, ...trRules } = conditionInfo(id, 'tr');
      const { label: enLabel, note: enNote, ...enRules } = conditionInfo(id, 'en');
      assert.deepEqual(enRules, trRules, id);
      assert.ok(enLabel && trLabel, id);
      assert.equal(enNote === undefined, trNote === undefined, id);
    }
  });

  test('danışanın göreceği tanı adı kararı dilden bağımsız', () => {
    for (const id of CONDITION_IDS) assert.equal(clientSafeLabel(id, 'en') === null, clientSafeLabel(id, 'tr') === null, id);
  });

  test('postür paterni: kaslar aynı, metin dilde', () => {
    for (const id of POSTURAL_PATTERN_IDS) {
      const { label: _tl, note: _tn, ...tr } = posturalPattern(id, 'tr');
      const { label: _el, note: _en, ...en } = posturalPattern(id, 'en');
      assert.deepEqual(en, tr, id);
    }
  });
});

describe('katalog: İngilizce çıktı', () => {
  test('kaslar ve haritalar', () => {
    assert.deepEqual(summarizeMuscles(['lats_upper', 'lats_mid', 'lats_lower', 'biceps'], 'en'), ['Lats', 'Biceps']);
    assert.equal(roleMapProps({ primaryMuscles: ['quadriceps'], secondaryMuscles: [] }, 'en').label, 'Muscles worked: Quadriceps');
    assert.equal(describeGrip('pronated', 'wide', 'en'), 'Wide pronated (palms down)');
  });

  test('arama iki dilde bulur', () => {
    assert.deepEqual(muscleSearchNames('lats_upper', LOCALES), ['Üst kanat', 'Kanat', 'Sırt', 'Upper lats', 'Lats', 'Back']);
    // Varsayılan yalnız Türkçe (eski çağrılar).
    assert.deepEqual(muscleSearchNames('lats_upper'), ['Üst kanat', 'Kanat', 'Sırt']);
  });

  test('hafta günleri', () => {
    assert.equal(weekdaysText([5, 1, 3], 'en'), 'Mon, Wed, Fri');
    assert.equal(weekdaysChangeText([1], [2, 4], 'en'), 'Workout days: Mon → Tue, Thu');
    assert.equal(weekdaysChangeText([1], [], 'en'), 'Workout days removed (was Mon)');
  });

  test('setler, dinlenme ve bloklar (çoğullar)', () => {
    const sets = [{ min: 8, max: 12 }, { min: 8, max: 12 }, { min: 8, max: 12, amrap: true }];
    assert.equal(formatSets(sets, 'weight_reps', 'pt', null, 'en'), '3 × 8–12 reps · last set AMRAP');
    assert.equal(formatSets(sets, 'weight_reps', 'client', null, 'en'), '3 × 8–12 reps · as many as you can on the last set');
    assert.equal(setsText(sets, 'weight_reps', null, 'en'), '3×8–12, last set AMRAP');
    const pyramid = [{ min: 12, max: 12, loadPct: 80 }, { min: 10, max: 10, loadPct: 90 }, { min: 8, max: 8 }];
    assert.equal(formatSets(pyramid, 'weight_reps', 'pt', null, 'en'), '12 / 10 / 8 reps · pyramid 80% → 100%');
    assert.equal(formatSets([{ min: 1, max: 1 }], 'weight_reps', 'pt', null, 'en'), '1 × 1 rep');
    assert.equal(formatRest(90, 'en'), '1 min 30 s');
    assert.equal(formatRest(0, 'en'), 'No rest');
    assert.equal(describeBlock({ kind: 'single', restSeconds: 60, sets: 1 }, 'en'), '1 set · 1 min rest');
    assert.equal(describeBlock({ kind: 'superset', restSeconds: 90, sets: 3 }, 'en'), '3 rounds · 1 min 30 s rest after each round');
  });

  test('ilerleme kuralı', () => {
    const spec = { trackingType: 'weight_reps' as const, loadStepKg: 2.5, minLoadKg: 20 };
    assert.equal(
      describeRule({ scheme: 'linear', targetMin: 5, targetMax: 5, targetRir: 1 }, spec, 'en'),
      'Target 5 reps. After every successful workout the weight goes up 2.5 kg. Below target, the weight stays the same; after 3 stalled workouts in a row it drops by 10%. Leave ~1 rep in reserve at the end of each set.',
    );
  });

  test('cihaz ağırlıkları', () => {
    assert.equal(describeDeviceLoads({ kind: 'barbell', baseKg: 20, stepKg: 1.25 }, 'en'), 'Bar 20 kg, smallest increment 1.25 kg');
    assert.equal(describeDeviceLoads({ kind: 'dumbbell', weightsKg: [2] }, 'en'), '1 weight: 2 kg–2 kg');
  });

  test('varsayılan adlar yazanın dilinde; çakışma her dilin adıyla', () => {
    assert.equal(defaultPhaseName('en'), 'Phase 1');
    assert.equal(nextPhaseName([{ name: 'Evre 1' }, { name: 'Phase 2' }], 'en'), 'Phase 3');
    assert.equal(nextPhaseName([{ name: 'Phase 1' }], 'tr'), 'Evre 2');
    assert.equal(nextDayName([{ name: 'Gün A' }], 'en'), 'Program B');
    assert.equal(phaseStatusLabel({ kind: 'ended', week: 7, weeks: 6, endsAt: '' }, 'en'), 'Ended (6 weeks)');
  });

  test('kısıt adı ve niteleyici', () => {
    assert.equal(conditionLabel({ id: 'knee_osteoarthritis', qualifier: 'severe' }, 'en'), 'Knee osteoarthritis (severe)');
    assert.equal(conditionLabel({ id: 'knee_osteoarthritis', qualifier: 'severe' }), 'Diz osteoartriti (şiddetli)');
  });
});
