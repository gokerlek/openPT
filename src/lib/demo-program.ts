import { createProgramRecord, DEFAULT_PHASE_NAME, type ProgramBody, type ProgramDay, type ProgramIdSource, type ProgramState } from './program-plan.ts';
import { DEFAULT_REST_SECONDS, defaultSets, type PlanExercise, type TemplateBlock } from './template-plan.ts';

/**
 * Deneme programı — YALNIZ geliştirme (kullanıcının kararı 6): test danışanına güne atanmış üç programlı bir PT
 * programı kurulsun ki Faz 3'ün ekranları (Bugün'ün atanmış günü, hafta şeridi, "Değiştir", "başka program"
 * bildirimi) gerçek bir danışan beklemeden gözden geçirilebilsin. Saf; yazımı `/api/dev/seed-program` yapar.
 *
 * Kimlikler sabit tohumdan (`DEMO_PROGRAM_SEED`, `programIdSource` + `seededRandom`): yeniden tohumlama aynı gün,
 * blok ve satır kimliklerini verir, telefondaki plan ve geçmişteki seanslar aynı programa bağlı kalır.
 */

/** Programların kimliklerini belirleyen tohum (yeniden tohumlama aynı kimlikleri versin). */
export const DEMO_PROGRAM_SEED = 'seed-program';

/** Deneme programı (YALNIZ geliştirme): üç program, her biri tek güne atanmış (ISO; 2 = Salı, 4 = Perşembe, 7 = Pazar). */
export const DEMO_PROGRAM = [
  {
    name: 'Alt vücut',
    weekday: 2,
    exerciseIds: ['halter-back-squat', 'romanian-deadlift', 'bulgarian-split-squat', 'leg-press', 'yuzustu-leg-curl', 'ayakta-calf-raise'],
  },
  {
    name: 'Üst vücut',
    weekday: 4,
    exerciseIds: ['halter-bench-press', 'halter-bent-over-row', 'ayakta-halter-omuz-press', 'lat-pulldown', 'dambil-yana-acis', 'triceps-halat-pushdown'],
  },
  {
    name: 'Tüm vücut',
    weekday: 7,
    exerciseIds: ['deadlift', 'goblet-squat', 'egimli-dambil-press', 'tek-kol-dambil-row', 'dambil-lunge', 'plank'],
  },
] as const;

type DemoExercise = Pick<PlanExercise, 'category' | 'trackingType' | 'progression'>;

/**
 * Taze program kaydı (`createProgramRecord`, revision 1): evresiz, her hareket tek blok (`kind: 'single'`, dinlenme
 * `DEFAULT_REST_SECONDS[category]`, setler `defaultSets(exercise)`). Taze kayıtta danışanın eski gün katmanı
 * (`clientSchedule`), hedefleri (`clientTargets`) ve dönüş (`rotation`) yoktur; `schedule` atamaların birleşimi.
 * Kütüphanede olmayan hareket varsa kayıt yok, eksikler döner (sessizce eksik program yazılmaz).
 */
export function demoProgramRecord(
  exercises: ReadonlyMap<string, DemoExercise>,
  ids: ProgramIdSource,
  now: Date,
): { program: ProgramState } | { missing: string[] } {
  const missing = [...new Set(DEMO_PROGRAM.flatMap((spec) => spec.exerciseIds.filter((id) => !exercises.has(id))))];
  if (missing.length > 0) return { missing };
  // Kimlikler hep aynı sırayla çekilir (evre, sonra gün gün: gün, blok, satır): aynı tohum aynı kimlikler.
  const phaseId = ids('p');
  const days = DEMO_PROGRAM.map((spec): ProgramDay => {
    const id = ids('d');
    const blocks = spec.exerciseIds.map((exerciseId): TemplateBlock => {
      const exercise = exercises.get(exerciseId) as DemoExercise;
      return { id: ids('b'), kind: 'single', restSeconds: DEFAULT_REST_SECONDS[exercise.category], rows: [{ id: ids('r'), exerciseId, sets: defaultSets(exercise) }] };
    });
    return { id, name: spec.name, weekdays: [spec.weekday], blocks };
  });
  const body: ProgramBody = { phased: false, currentPhaseId: phaseId, phases: [{ id: phaseId, name: DEFAULT_PHASE_NAME, days }] };
  return { program: createProgramRecord(body, now) };
}
