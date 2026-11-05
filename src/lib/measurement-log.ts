import { DEFAULT_LOCALE, type Locale } from '../i18n/locale.ts';
import { healthMessages } from '../i18n/messages/health/index.ts';
import { measurementsMessages } from '../i18n/messages/measurements/index.ts';
import { healthFieldState } from './client-status.ts';
import { MEASUREMENTS, MEASUREMENT_IDS, type MeasurementId } from './measurements.ts';
import { healthFieldInfo, type Client, type HealthField } from './schemas/client.ts';
import type { MeasurementEntry } from './schemas/health.ts';

/**
 * Periyodik ölçüm kaydının düzenlenmesi — `health.json`'daki `measurements` dizisi üzerinde
 * saf işlemler (sunucu ve tarayıcı ortak, SPEC §7.5).
 *
 * Kayıt düz bir listedir: her satır bir gün, bir ölçüm ve gerekiyorsa bir taraf. Bir günde
 * aynı ölçümün aynı tarafı bir kez bulunur; yeni değer eskisinin yerine geçer. Liste tarih,
 * katalog ve taraf sırasıyla tutulur ki git farkları okunaklı kalsın.
 */

export const SIDES = ['left', 'right'] as const;
export type Side = (typeof SIDES)[number];
/** Türkçe adlar (eski çağrılar); arayüz `sideLabels(locale)` kullanır. */
export const SIDE_LABELS: Record<Side, string> = measurementsMessages('tr').sides;

/** Bir günün tek değeri; tarih ayrı taşınır. */
export type MeasurementValue = { id: MeasurementId; value: number; side?: Side | undefined };

/* --- form alanları --- */

/** Formdaki alanın anahtarı: "waist_girth" ya da "calf_girth:left" (nokta içermez: hata yolu noktayla bölünür). */
export function slotKey(id: MeasurementId, side?: Side): string {
  return side ? `${id}:${side}` : id;
}

export function isSided(id: MeasurementId): boolean {
  const def = MEASUREMENTS[id];
  return 'sided' in def && def.sided === true;
}

export type MeasurementSlot = { key: string; id: MeasurementId; side?: Side };

/** Katalog sırasıyla bütün giriş alanları; iki taraflı ölçümde sol ve sağ ayrı alan. */
export const MEASUREMENT_SLOTS: readonly MeasurementSlot[] = MEASUREMENT_IDS.flatMap((id): MeasurementSlot[] =>
  isSided(id) ? SIDES.map((side) => ({ key: slotKey(id, side), id, side })) : [{ key: id, id }],
);

/** Anketler yüzde ya da 0–100 puan; diğerleri şemanın genel üst sınırı. */
export function valueMax(id: MeasurementId): number {
  return MEASUREMENTS[id].group === 'questionnaire' ? 100 : 1000;
}

/** Formdaki alanlardan yalnız doldurulanlar (boş alan kayda girmez). */
export function valuesFromSlots(slots: Readonly<Record<string, number | null | undefined>>): MeasurementValue[] {
  return MEASUREMENT_SLOTS.flatMap(({ key, id, side }) => {
    const value = slots[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) return [];
    return [side ? { id, value, side } : { id, value }];
  });
}

/** Kayıttaki değerlerden form alanları (düzenleme sayfası). */
export function slotsFromValues(values: readonly Pick<MeasurementEntry, 'id' | 'value' | 'side'>[]): Record<string, number> {
  const slots: Record<string, number> = {};
  for (const { id, value, side } of values) slots[slotKey(id, side)] = value;
  return slots;
}

/**
 * Sunucu denetimi: taraf kuralı, aralık ve tekrar. Hatalar formdaki alan anahtarıyla döner
 * (sunucu `values.<anahtar>` olarak iletir, alanın altında görünür).
 */
export function checkValues(
  values: readonly MeasurementValue[],
  locale: Locale = DEFAULT_LOCALE,
): { values: MeasurementValue[]; errors: Record<string, string> } {
  const t = measurementsMessages(locale).validation;
  const common = healthMessages(locale).validation;
  const errors: Record<string, string> = {};
  const seen = new Set<string>();
  const clean: MeasurementValue[] = [];
  for (const { id, value, side } of values) {
    const key = slotKey(id, side);
    if (isSided(id) && !side) {
      errors[slotKey(id, 'left')] ??= t.sideRequired;
      continue;
    }
    if (!isSided(id) && side) {
      errors[slotKey(id)] ??= t.noSide;
      continue;
    }
    if (seen.has(key)) {
      errors[key] ??= t.duplicate;
      continue;
    }
    seen.add(key);
    if (!Number.isFinite(value) || value < 0) {
      errors[key] = common.nonNegative;
      continue;
    }
    if (value > valueMax(id)) {
      errors[key] = common.max(valueMax(id));
      continue;
    }
    clean.push(side ? { id, value, side } : { id, value });
  }
  return { values: sortValues(clean), errors };
}

/* --- kayıt listesi --- */

function sideRank(side: Side | undefined): number {
  return side === 'left' ? 1 : side === 'right' ? 2 : 0;
}

function compareValues(a: MeasurementValue, b: MeasurementValue): number {
  return MEASUREMENT_IDS.indexOf(a.id) - MEASUREMENT_IDS.indexOf(b.id) || sideRank(a.side) - sideRank(b.side);
}

function sortValues<T extends MeasurementValue>(values: readonly T[]): T[] {
  return [...values].sort(compareValues);
}

/** Tarih, katalog ve taraf sırası. */
export function sortMeasurements(list: readonly MeasurementEntry[]): MeasurementEntry[] {
  return [...list].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : compareValues(a, b)));
}

function toEntry(date: string, { id, value, side }: MeasurementValue): MeasurementEntry {
  return side ? { date, id, value, side } : { date, id, value };
}

const sameSlot = (a: MeasurementValue, b: MeasurementValue) => a.id === b.id && (a.side ?? null) === (b.side ?? null);

/** Güne ekler: aynı gün aynı ölçümün aynı tarafı varsa yenisi yerine geçer, diğerleri kalır. */
export function addMeasurements(list: readonly MeasurementEntry[], date: string, values: readonly MeasurementValue[]): MeasurementEntry[] {
  const kept = list.filter((entry) => entry.date !== date || !values.some((value) => sameSlot(entry, value)));
  return sortMeasurements([...kept, ...values.map((value) => toEntry(date, value))]);
}

/** Günün bütün değerlerini verilenlerle değiştirir (düzenlemede boşaltılan alan kayıttan çıkar). */
export function replaceMeasurements(list: readonly MeasurementEntry[], date: string, values: readonly MeasurementValue[]): MeasurementEntry[] {
  return sortMeasurements([...list.filter((entry) => entry.date !== date), ...values.map((value) => toEntry(date, value))]);
}

export function removeMeasurementDate(list: readonly MeasurementEntry[], date: string): MeasurementEntry[] {
  return list.filter((entry) => entry.date !== date);
}

export function measurementsOn(list: readonly MeasurementEntry[], date: string): MeasurementEntry[] {
  return sortMeasurements(list.filter((entry) => entry.date === date));
}

export type MeasurementDay = { date: string; ids: MeasurementId[]; count: number };

/** Ölçüm günleri, en yenisi önce; her günde hangi ölçümler var (katalog sırasıyla). */
export function measurementDays(list: readonly MeasurementEntry[]): MeasurementDay[] {
  const days = new Map<string, MeasurementEntry[]>();
  for (const entry of list) days.set(entry.date, [...(days.get(entry.date) ?? []), entry]);
  return [...days.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, entries]) => ({
      date,
      ids: MEASUREMENT_IDS.filter((id) => entries.some((entry) => entry.id === id)),
      count: entries.length,
    }));
}

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "2026-09-01" gerçek bir takvim günü mü (30 Şubat değil). */
export function isCalendarDate(value: string): boolean {
  const match = value.match(CALENDAR_DATE);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/* --- kayıt izni --- */

/** Sağlık parçası neden yazılamıyor (ve okunmuyor); yazılabiliyorsa null. */
export type HealthLock = 'off' | 'not_selected' | 'pending' | 'declined' | 'outdated';
/** Ölçüm neden yazılamıyor; yazılabiliyorsa null. */
export type MeasurementLock = HealthLock;

/**
 * Parça yalnız sağlık modülü açık, parça seçili ve danışanın onayı onu güncel sürümüyle kapsıyorsa yazılır ve
 * okunur (`canRecordHealth`, SPEC §4; tasarım `kisit-tarama.md` §1). Kilit parça başınadır: kısıtların onayı
 * yenilenecekken ölçümler açık kalır. Sunucu her yazmada bunu yeniden denetler.
 */
export function healthLock(client: Pick<Client, 'modules' | 'consents'>, field: HealthField): HealthLock | null {
  const state = healthFieldState(client, field);
  return state === 'granted' ? null : state;
}

export function measurementLock(client: Pick<Client, 'modules' | 'consents'>): MeasurementLock | null {
  return healthLock(client, 'measurements');
}

/** Kilidin başlığı ve ne yapılacağı, parçanın adıyla (okuyanın dilinde). */
export function healthLockInfo(field: HealthField, lock: HealthLock, locale: Locale = DEFAULT_LOCALE): { title: string; description: string } {
  return healthMessages(locale).record.lock(field, lock, healthFieldInfo(locale)[field].label);
}

export const MEASUREMENT_LOCK_INFO: Record<MeasurementLock, { title: string; description: string }> = {
  off: healthLockInfo('measurements', 'off'),
  not_selected: healthLockInfo('measurements', 'not_selected'),
  pending: healthLockInfo('measurements', 'pending'),
  declined: healthLockInfo('measurements', 'declined'),
  outdated: healthLockInfo('measurements', 'outdated'),
};

/** Tarafların adları okuyanın dilinde. */
export function sideLabels(locale: Locale = DEFAULT_LOCALE): Record<Side, string> {
  return measurementsMessages(locale).sides;
}
