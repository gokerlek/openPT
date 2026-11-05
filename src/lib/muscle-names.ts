import { DEFAULT_LOCALE, type Locale } from '../i18n/locale.ts';
import { muscleFamilies, muscleGroups, muscleLabels, type Muscle } from './schemas/exercise.ts';

const lookups = new Map<Locale, { family: Map<string, string>; group: Map<string, string> }>();

/** Kas → aile ve bölge adı, dil başına bir kez kurulur (arama her tuşta çağırır). */
function lookup(locale: Locale): { family: Map<string, string>; group: Map<string, string> } {
  let found = lookups.get(locale);
  if (!found) {
    found = {
      family: new Map(muscleFamilies(locale).flatMap((family) => family.muscles.map((muscle) => [muscle, family.label] as const))),
      group: new Map(muscleGroups(locale).flatMap((group) => group.muscles.map((muscle) => [muscle, group.label] as const))),
    };
    lookups.set(locale, found);
  }
  return found;
}

/**
 * Egzersiz aramasında bir kasın adları: kendi adı, ailesi ("Kanat"), bölgesi ("Sırt"); tekrarsız.
 * Kütüphane listesi ve düzenleyicinin seçicisi ortak kullanır (katlama ve sıra `exercise-search.ts`'te).
 * `locales`: hangi dillerin adları; arayüz iki dilde de bulsun diye `LOCALES` verir (PT'nin adları her dilde olabilir).
 */
export function muscleSearchNames(muscle: string, locales: readonly Locale[] = [DEFAULT_LOCALE]): string[] {
  const names = locales.flatMap((locale) => {
    const { family, group } = lookup(locale);
    return [muscleLabels(locale)[muscle as Muscle] ?? muscle, family.get(muscle) ?? '', group.get(muscle) ?? ''];
  });
  return [...new Set(names.filter(Boolean))];
}
