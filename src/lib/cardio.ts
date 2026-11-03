import type { TrackingType } from './progression.ts';
import type { MeasurementEntry } from './schemas/health.ts';

/**
 * Kardiyo hedefleri (tasarım `docs/plans/2026-11-02-kardiyo-hedefleri-design.md`).
 *
 * Kardiyo hareketi: süreyle izlenen ve deseni kardiyo olan hareket; hedefi ve seti mesafe taşır (`machine`).
 * Yürüyüş/koşu (`locomotion` işaretli, ör. koşu bandı) ayrıca eğim taşır ve kalorisi hesaplanır (`walk`).
 *
 * Kalori kaydedilmez, gösterilirken hesaplanır: set değerleri seansta, kilo `health.json`'da (sağlık verisi
 * seans dosyasına girmez). Yürüyüş/koşu seti eğimi hep taşır (girilmediyse 0): kalori yalnız eğimi olan sette,
 * böylece geçmiş seansta egzersiz kaydına bakmadan bulunur. Saf ve değiştirmez.
 */

export type CardioKind = 'machine' | 'walk';

/**
 * Girişin sınırları. Eğim girişte en fazla %15 (koşu bantlarının üst sınırı); kayıtta %30'a kadar okunur (`inclineReadMax`:
 * bu sınırdan önce yazılan kayıt ve şablon okunamaz olmasın).
 */
export const CARDIO_LIMITS = { distanceMax: 100_000, inclineMax: 15, inclineReadMax: 30, inclineStep: 0.5, distanceStep: 100 } as const;

/** İnsan sınırı: yürüyüş ve koşuda en fazla 40 km/sa (insanın ulaşabildiği en yüksek hız), öteki kardiyo makinelerinde 80 km/sa. */
export const CARDIO_SPEED_MAX_KMH: Record<CardioKind, number> = { walk: 40, machine: 80 };

export type CardioValues = { seconds?: number | undefined; distanceM?: number | undefined; inclinePct?: number | undefined };

/** Setin kardiyo alanları olmadan: hareket başka kardiyo türüne (ya da kardiyo olmayana) geçince hedef taşınmaz. */
export function withoutCardio<T extends { distanceM?: number | undefined; inclinePct?: number | undefined }>(set: T): Omit<T, 'distanceM' | 'inclinePct'> {
  const { distanceM: _distance, inclinePct: _incline, ...rest } = set;
  return rest;
}

export function cardioKind(exercise: {
  trackingType: TrackingType;
  pattern?: string | undefined;
  locomotion?: boolean | undefined;
}): CardioKind | null {
  if (exercise.trackingType !== 'duration' || exercise.pattern !== 'cardio') return null;
  return exercise.locomotion === true ? 'walk' : 'machine';
}

/** Yürüme ile koşunun sınırı (m/dk, 6 km/sa). */
const WALK_MAX_SPEED = 100;

/**
 * ACSM metabolik denklemleri: hız `S` m/dk, eğim `G` = % / 100. Yürüme `VO2 = 0,1·S + 1,8·S·G + 3,5`, koşu
 * `VO2 = 0,2·S + 0,9·S·G + 3,5` (ml/kg/dk); `kcal = VO2 × kg / 1000 × 5 × dk`. Eğimsiz (yürüyüş/koşu olmayan) sette,
 * mesafe, süre ya da kilo yoksa kalori yok.
 */
export function walkKcal(set: CardioValues, bodyMassKg: number | undefined): number | null {
  const { seconds, distanceM, inclinePct } = set;
  if (inclinePct === undefined || !seconds || !distanceM || !bodyMassKg || seconds <= 0 || distanceM <= 0 || bodyMassKg <= 0) return null;
  const minutes = seconds / 60;
  const speed = distanceM / minutes;
  const grade = inclinePct / 100;
  const vo2 = speed <= WALK_MAX_SPEED ? 0.1 * speed + 1.8 * speed * grade + 3.5 : 0.2 * speed + 0.9 * speed * grade + 3.5;
  return Math.round(((vo2 * bodyMassKg) / 1000) * 5 * minutes);
}

/**
 * Mesafe bu sürede yapılabilir mi (insan sınırı, `CARDIO_SPEED_MAX_KMH`): yapılamıyorsa nedeni, yapılabiliyorsa null.
 * Mesafe yoksa denetim yok; mesafe varken süre 0 olamaz. "1 saniyede 1000 metre" yazılmasın.
 */
export function cardioSpeedIssue(kind: CardioKind, set: Pick<CardioValues, 'seconds' | 'distanceM'>): string | null {
  const { seconds, distanceM } = set;
  if (!distanceM || distanceM <= 0) return null;
  if (!seconds || seconds <= 0) return 'Mesafe için süre de girilmeli.';
  const max = CARDIO_SPEED_MAX_KMH[kind];
  // km/sa = m / sn × 3,6; tam sınır geçer (çarpımla: kayan nokta yuvarlaması sınırı aşmış saymasın).
  if (distanceM * 3600 <= max * 1000 * seconds) return null;
  return `${distanceText(distanceM)} bu sürede olmaz: ${kind === 'walk' ? 'yürüyüş ve koşuda' : 'kardiyoda'} hız en fazla ${max} km/sa.`;
}

/** Setlerin toplam kalorisi (yürüyüş/koşu olmayanlar 0). */
export function totalKcal(sets: readonly CardioValues[], bodyMassKg: number | undefined): number {
  return sets.reduce((sum, set) => sum + (walkKcal(set, bodyMassKg) ?? 0), 0);
}

function decimal(value: number, digits: number): string {
  return value.toLocaleString('tr-TR', { maximumFractionDigits: digits, useGrouping: false });
}

/** "800 m"; 1000 m'den sonra km, en çok iki ondalık: "3 km", "2,5 km", "3,25 km". */
export function distanceText(meters: number): string {
  return meters < 1000 ? `${decimal(meters, 0)} m` : `${decimal(meters / 1000, 2)} km`;
}

/** "%5", "%2,5". */
export function inclineText(pct: number): string {
  return `%${decimal(pct, 1)}`;
}

/** Saniye → dakika (en çok bir ondalık): hedef ve giriş yürüyüş/koşuda dakikadır. */
export function minutesOf(seconds: number): number {
  return Math.round((seconds / 60) * 10) / 10;
}

/** Süre saati: 1800 → "30:00", 3725 → "1:02:05". */
export function durationClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

/** Mesafe ve eğim parçaları; 0 ya da olmayan mesafe yazılmaz, eğim 0 da yazılmaz. */
export function cardioParts(set: Pick<CardioValues, 'distanceM' | 'inclinePct'>): string[] {
  return [
    ...(set.distanceM ? [distanceText(set.distanceM)] : []),
    ...(set.inclinePct ? [inclineText(set.inclinePct)] : []),
  ];
}

/** Kardiyo setinin metni: "30:00 · 3 km · %5 · ≈ 253 kcal"; olmayan parça yazılmaz. */
export function cardioText(set: CardioValues, kcal?: number | null): string {
  return [
    ...(set.seconds !== undefined ? [durationClock(set.seconds)] : []),
    ...cardioParts(set),
    ...(kcal ? [`≈ ${kcal} kcal`] : []),
  ].join(' · ');
}

/**
 * Vücut ağırlığı (`body_mass`): tarihsiz en yeni ölçüm; tarihli o gün ya da öncesindeki son ölçüm, öncesi yoksa en
 * eski ölçüm. Ölçüm yoksa yok. Liste yalnız ölçüm onayı sürdükçe okunur (çağıran denetler).
 */
export function bodyMassOn(measurements: readonly MeasurementEntry[], date?: string): number | undefined {
  const masses = measurements.filter((item) => item.id === 'body_mass').sort((a, b) => a.date.localeCompare(b.date));
  if (masses.length === 0) return undefined;
  if (date === undefined) return masses[masses.length - 1]?.value;
  const before = masses.filter((item) => item.date <= date);
  return (before[before.length - 1] ?? masses[0])?.value;
}
