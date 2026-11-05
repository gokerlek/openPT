import { DEFAULT_LOCALE, type Locale } from '../i18n/locale.ts';
import { catalogMessages } from '../i18n/messages/catalog/index.ts';

/**
 * Programların hafta günlerine atanması (Faz 3) — saf; yalnız sözlüğü içe aktarır (`program-plan.ts` ve `training-days.ts`
 * ikisi de okur). Evrenin her programı (günü) bir ya da birkaç ISO hafta gününe atanır (1 = Pazartesi … 7 = Pazar);
 * bir hafta günü evrede en çok bir programa. `weekdays` alanı yoksa program atanmamış; boş dizi düzenleyicide
 * "bütün günler kaldırıldı" demektir, dosyaya yazılmaz. Hafta günü sabitleri ve metinleri de burada.
 */

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** Kısa gün adları: "Pzt" / "Mon". */
export function weekdayShortLabels(locale: Locale = DEFAULT_LOCALE): Record<Weekday, string> {
  return catalogMessages(locale).weekdays.short;
}

/** Gün adları: "Pazartesi" / "Monday". */
export function weekdayLabels(locale: Locale = DEFAULT_LOCALE): Record<Weekday, string> {
  return catalogMessages(locale).weekdays.long;
}

/** Türkçe adlar (eski çağrılar); arayüz `weekdayShortLabels(locale)` / `weekdayLabels(locale)` kullanır. */
export const WEEKDAY_SHORT: Record<Weekday, string> = weekdayShortLabels('tr');
export const WEEKDAY_NAMES: Record<Weekday, string> = weekdayLabels('tr');

/**
 * Atanabilir gün (program). Alanı yazan işlevler `D & AssignableDay` döner: alanı olmayan bir gün türü verilse de
 * sonuçta `weekdays` okunabilsin (eski biçim, eski sekme).
 */
export type AssignableDay = { id: string; name: string; weekdays?: readonly number[] | undefined };

export function isWeekday(value: unknown): value is Weekday {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 7;
}

/** Geçerli günler, her biri bir kez, pazartesiden pazara; tür `Weekday` (metinler sabitlere bununla bakar). */
function sortedWeekdays(list: readonly unknown[] | undefined): Weekday[] {
  return [...new Set((list ?? []).filter(isWeekday))].sort((a, b) => a - b);
}

/** Geçerli günler, her biri bir kez, pazartesiden pazara; alan yoksa boş. */
export function cleanWeekdays(list: readonly unknown[] | undefined): number[] {
  return sortedWeekdays(list);
}

/**
 * İki gün listesi aynı küme mi (sıra, tekrar ve geçersiz değer fark etmez). Bütün karşılaştırmalar bundan: atama,
 * eski gövdenin "açılıştaki günler" denetimi, danışanın gün seçimi.
 */
export function sameWeekdays(a: readonly unknown[] | undefined, b: readonly unknown[] | undefined): boolean {
  const left = cleanWeekdays(a);
  const right = cleanWeekdays(b);
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** "Pzt, Çar, Cum"; boşsa boş metin. */
export function weekdaysText(list: readonly number[], locale: Locale = DEFAULT_LOCALE): string {
  const short = weekdayShortLabels(locale);
  return sortedWeekdays(list)
    .map((day) => short[day])
    .join(', ');
}

/** Program geçmişinin cümlesi (yazanın dilinde saklanır): "Antrenman günleri: Pzt, Çar, Cum → Sal, Per, Cmt". */
export function weekdaysChangeText(before: readonly number[], after: readonly number[], locale: Locale = DEFAULT_LOCALE): string {
  const t = catalogMessages(locale).weekdays;
  const from = weekdaysText(before, locale);
  const to = weekdaysText(after, locale);
  if (!from) return t.set(to);
  if (!to) return t.removed(from);
  return t.changed(from, to);
}

/** Evrenin atanmış günlerinin birleşimi, pazartesiden sıralı (`schedule.weekdays` bundan türer). */
export function phaseWeekdays(days: readonly AssignableDay[]): number[] {
  return cleanWeekdays(days.flatMap((day) => day.weekdays ?? []));
}

/** Evrede en az bir program bir güne atanmış mı ("atamalı" evre). */
export function hasAssignments(days: readonly AssignableDay[]): boolean {
  return phaseWeekdays(days).length > 0;
}

/** O hafta gününe atanmış program; yoksa null (bozuk kayıtta iki program varsa ilki). */
export function dayOnWeekday<D extends AssignableDay>(days: readonly D[], weekday: number): D | null {
  return days.find((day) => cleanWeekdays(day.weekdays).includes(weekday)) ?? null;
}

/** Pazartesiden pazara hafta günü → program (iki güne atanan iki kez). */
export function weekAssignments<D extends AssignableDay>(days: readonly D[]): { weekday: number; day: D }[] {
  return WEEKDAYS.flatMap((weekday) => {
    const day = dayOnWeekday(days, weekday);
    return day ? [{ weekday, day }] : [];
  });
}

/** Hafta günü → programın adı (şerit). */
export function weekdayNames(days: readonly AssignableDay[]): Partial<Record<number, string>> {
  return Object.fromEntries(weekAssignments(days).map(({ weekday, day }): [number, string] => [weekday, day.name]));
}

/** Evrede iki programa atanmış hafta günleri, sıralı (temiz evrede boş; şemanın denetimi). */
export function weekdayConflicts(days: readonly AssignableDay[]): number[] {
  const seen = new Set<number>();
  const twice = new Set<number>();
  for (const day of days) {
    for (const weekday of cleanWeekdays(day.weekdays)) {
      if (seen.has(weekday)) twice.add(weekday);
      seen.add(weekday);
    }
  }
  return cleanWeekdays([...twice]);
}

/** Bu programın dışında atanmış günler → sahibinin adı, pazartesiden sıralı: düzenleyicide kapalı çipler. */
export function takenWeekdays(days: readonly AssignableDay[], dayId: string): Map<number, string> {
  // Sahiplik önce bütün günlerde belirlenir, sonra bu programınkiler düşer: bozuk kayıtta iki programa atanmış gün
  // `dayOnWeekday` gibi ilkinindir; ilki düzenlenirken açık, ikincisi düzenlenirken kapalı görünür.
  return new Map(
    weekAssignments(days)
      .filter(({ day }) => day.id !== dayId)
      .map(({ weekday, day }): [number, string] => [weekday, day.name]),
  );
}

/**
 * Programın günlerini yazar (temizlenmiş; başka programın günleri atılır). Değişmediyse aynı dizi. Boş seçim alanı
 * boş dizi olarak tutar: eski gövdenin okunması (`upgradeAssignments`) alan görünce yeniden türetmesin.
 */
export function assignWeekdays<D extends AssignableDay>(days: readonly D[], dayId: string, weekdays: readonly number[]): (D & AssignableDay)[] {
  const target = days.find((day) => day.id === dayId);
  if (!target) return days as D[];
  const taken = takenWeekdays(days, dayId);
  const next = cleanWeekdays(weekdays).filter((weekday) => !taken.has(weekday));
  if (sameWeekdays(next, target.weekdays)) return days as D[];
  return days.map((day) => (day.id === dayId ? { ...day, weekdays: next } : day));
}

/**
 * Formun programa yazacağı gün alanı (PT düzenleyicisi, kendi program formu). Boş seçimde, programın formdaki başlangıç
 * değerinde alan yoksa alan yazılmaz: bir günü açıp kapamak formu açılıştaki hâlinden farklı (kirli) bırakmasın.
 * Başlangıçta alan varken boş dizi kalır: kayıt "bütün günleri kaldırıldı"yı günleri göndermeyen eski gövdeden
 * ayırır (`keepStoredAssignments`).
 */
export function weekdaysInput(weekdays: readonly number[] | undefined, startedWithField: boolean): number[] | undefined {
  if (weekdays === undefined) return undefined;
  return weekdays.length > 0 || startedWithField ? [...weekdays] : undefined;
}

/** Seçili günlerin programlara sırayla dağılımı: sıra → günler. Gün programdan fazlaysa başa sarar. */
function slotsInOrder(count: number, selected: readonly number[]): Map<number, number[]> {
  if (count === 0) return new Map();
  const byIndex = new Map<number, number[]>();
  selected.forEach((weekday, index) => {
    const at = index % count;
    byIndex.set(at, [...(byIndex.get(at) ?? []), weekday]);
  });
  return byIndex;
}

/**
 * Eski programın ataması (gün başına alan yokken): programlar sırayla seçili günlere (A → ilk gün, B → ikinci…).
 * Gün programdan fazlaysa başa sarar: birleşim seçili günlerin aynısı kalır. Program günden fazlaysa sondakiler
 * atanmasız (alan yok). Gün yoksa aynı dizi.
 */
export function deriveAssignments<D extends AssignableDay>(days: readonly D[], weekdays: readonly number[]): (D & AssignableDay)[] {
  const selected = cleanWeekdays(weekdays);
  if (selected.length === 0 || days.length === 0) return days as D[];
  const byIndex = slotsInOrder(days.length, selected);
  return days.map((day, index) => {
    const assigned = byIndex.get(index);
    return assigned ? { ...day, weekdays: assigned } : day;
  });
}

/**
 * Alanı olmayan günlere kayıttaki aynı kimlikli günün ataması (kendi programın eski sekmesi). Ön koşul: `days`'te
 * atanmış gün yok (eski sekme alanı hiç göndermez); olsaydı korunan atama onun gününe çakışabilirdi. Alanı olan gün
 * (boş dizi de) olduğu gibi kalır.
 */
export function keepAssignments<D extends AssignableDay>(days: readonly D[], stored: readonly AssignableDay[]): (D & AssignableDay)[] {
  const byId = new Map(stored.map((day): [string, number[]] => [day.id, cleanWeekdays(day.weekdays)]));
  return days.map((day) => {
    if (day.weekdays !== undefined) return day;
    const kept = byId.get(day.id) ?? [];
    return kept.length > 0 ? { ...day, weekdays: kept } : day;
  });
}

/**
 * Ham evrelerde herhangi bir günde `weekdays` alanı var mı (varsa yeni biçim; türetme yok). `undefined` değerli
 * anahtar alan sayılmaz: `keepAssignments` gibi.
 */
export function hasAssignmentField(phases: unknown): boolean {
  return (
    Array.isArray(phases) &&
    phases.some((phase) => isRecord(phase) && Array.isArray(phase.days) && phase.days.some((day) => isRecord(day) && day.weekdays !== undefined))
  );
}

/**
 * Okurken ve eski gövdede: hiçbir günde alan yoksa ve `weekdays` geçerli, boş olmayan bir günler listesiyse her
 * evrenin günleri `deriveAssignments`'tan geçer. Ham veride hoşgörülü (dizi olmayan evre ya da gün olduğu gibi
 * kalır, şema düşürür). Türetme yoksa girdi aynen döner (aynı başvuru).
 */
export function upgradeAssignments(phases: unknown, weekdays: unknown): unknown {
  if (!Array.isArray(phases) || !Array.isArray(weekdays) || hasAssignmentField(phases)) return phases;
  const selected = cleanWeekdays(weekdays);
  if (selected.length === 0) return phases;
  const next = phases.map((phase: unknown) => {
    if (!isRecord(phase) || !Array.isArray(phase.days) || phase.days.length === 0) return phase;
    const source: unknown[] = phase.days;
    // Sıra `deriveAssignments`'ınki; nesne olmayan gün yerini tutar ama alan almaz (şema onu zaten düşürür).
    const byIndex = slotsInOrder(source.length, selected);
    const days = source.map((day, index) => {
      const assigned = byIndex.get(index);
      return assigned && isRecord(day) ? { ...day, weekdays: assigned } : day;
    });
    return days.every((day, index) => day === source[index]) ? phase : { ...phase, days };
  });
  return next.every((phase, index) => phase === phases[index]) ? phases : next;
}
