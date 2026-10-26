import { MUSCLE_FAMILIES, MUSCLE_GROUPS, MUSCLE_LABELS, type Muscle } from './schemas/exercise.ts';

const FAMILY_OF = new Map<string, string>(
  MUSCLE_FAMILIES.flatMap((family) => family.muscles.map((muscle) => [muscle, family.label] as const)),
);
const GROUP_OF = new Map<string, string>(MUSCLE_GROUPS.flatMap((group) => group.muscles.map((muscle) => [muscle, group.label] as const)));

/**
 * Egzersiz aramasında bir kasın adları: kendi adı, ailesi ("Kanat"), bölgesi ("Sırt"); tekrarsız.
 * Kütüphane listesi ve düzenleyicinin seçicisi ortak kullanır (katlama ve sıra `exercise-search.ts`'te).
 */
export function muscleSearchNames(muscle: string): string[] {
  const names = [MUSCLE_LABELS[muscle as Muscle] ?? muscle, FAMILY_OF.get(muscle) ?? '', GROUP_OF.get(muscle) ?? ''];
  return [...new Set(names.filter(Boolean))];
}
