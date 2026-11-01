import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';
import { EXERCISE_LIBRARY } from '../data/exercise-library.ts';
import { seededRandom } from './demo-history.ts';
import { DEMO_PROGRAM, DEMO_PROGRAM_SEED, demoProgramRecord } from './demo-program.ts';
import { programIdSource } from './program-plan.ts';
import { programSchema } from './schemas/program.ts';
import { DEFAULT_REST_SECONDS } from './template-plan.ts';

const library = new Map(EXERCISE_LIBRARY.map((exercise) => [exercise.id, exercise]));
const NOW = new Date('2026-11-01T09:00:00.000Z');
const ids = () => programIdSource([], seededRandom(DEMO_PROGRAM_SEED).bytes);

describe('deneme programı', () => {
  test('üç program, kendi günlerine atanmış, hareketler sırayla; şemaya uyar', () => {
    const result = demoProgramRecord(library, ids(), NOW);
    assert.ok('program' in result);
    const days = result.program.phases[0]?.days ?? [];
    assert.deepEqual(days.map((day) => [day.name, day.weekdays]), [['Alt vücut', [2]], ['Üst vücut', [4]], ['Tüm vücut', [7]]]);
    assert.deepEqual(days[0]?.blocks.flatMap((block) => block.rows.map((row) => row.exerciseId)), [...DEMO_PROGRAM[0].exerciseIds]);
    assert.deepEqual(days[2]?.blocks.flatMap((block) => block.rows.map((row) => row.exerciseId)), [...DEMO_PROGRAM[2].exerciseIds]);
    assert.deepEqual(result.program.schedule?.weekdays, [2, 4, 7]);
    assert.equal(result.program.clientSchedule, undefined);
    assert.equal(result.program.clientTargets, undefined);
    assert.deepEqual(result.program.rotation, {});
    assert.equal(result.program.revision, 1);
    assert.equal(result.program.phased, false);
    assert.equal(v.safeParse(programSchema, result.program).success, true);
  });

  test('her hareket tek blok: türünün dinlenmesi ve varsayılan setleri (süreli plank saniyeyle)', () => {
    const result = demoProgramRecord(library, ids(), NOW);
    assert.ok('program' in result);
    const blocks = result.program.phases[0]?.days.flatMap((day) => day.blocks) ?? [];
    assert.equal(blocks.length, 18);
    for (const block of blocks) {
      const exercise = library.get(block.rows[0]?.exerciseId ?? '');
      assert.ok(exercise);
      assert.deepEqual([block.kind, block.rows.length, block.restSeconds], ['single', 1, DEFAULT_REST_SECONDS[exercise.category]]);
      assert.equal(block.rows[0]?.sets.length, 3);
    }
  });

  test('aynı tohum aynı kimlikler (yeniden tohumlama gün kimliklerini değiştirmez)', () => {
    const first = demoProgramRecord(library, ids(), NOW);
    const second = demoProgramRecord(library, ids(), new Date('2026-12-01T09:00:00.000Z'));
    assert.ok('program' in first && 'program' in second);
    assert.deepEqual(first.program.phases, second.program.phases);
    assert.equal(first.program.current.phaseId, second.program.current.phaseId);
  });

  test('kütüphanede olmayan hareket varsa program kurulmaz', () => {
    const partial = new Map([...library].filter(([id]) => id !== 'plank'));
    assert.deepEqual(demoProgramRecord(partial, ids(), NOW), { missing: ['plank'] });
  });
});
