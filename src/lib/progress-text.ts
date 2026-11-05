import { DEFAULT_LOCALE, type Locale } from '../i18n/locale.ts';
import { clientProgressMessages } from '../i18n/messages/client-progress/index.ts';
import { lower } from '../i18n/text.ts';
import { getFormat } from './format.ts';
import type { LineKey } from './measurement-trends.ts';
import { measurementDef } from './measurements.ts';
import { roleLabels } from './muscles.ts';
import type { CircumferenceChange, ExerciseStrength, MuscleRole, StrengthStatus } from './muscle-progress.ts';
import { E1RM_MAX_REPS, type RecordEvent, type RecordKind, type RecordMark } from './personal-records.ts';
import type { TrackingType } from './progression.ts';
import type { Achievement, AchievementId, ExercisePoint, Streak } from './progress.ts';
import { daysBetween, forecast, forecastAsOf, FORECAST_MIN_POINTS, FORECAST_MIN_SPAN_DAYS, shiftDay, type Forecast } from './trend.ts';

/**
 * İlerleme sekmesinin metinleri ve grafik seçimleri — saf, sunucu ve telefon ortak; danışanın İlerleme'si
 * ve PT'nin danışan sayfasındaki İlerleme sekmesi aynı metinleri kullanır.
 *
 * Danışanın dilinde (SPEC §6): "e1RM", "1RM", "tonaj", "hacim" gibi kısaltmalar yok; tahmini maksimum,
 * toplam ağırlık denir. Sayılar Türkçe (`format.ts`). Kime yazıldığı `ProgressViewer`: danışana ikinci
 * tekil ("kaldırdığın"), PT'ye danışanın adıyla ya da yansız ("Ayşe kaldırdı", "kaldırılan"). Adın
 * arkasına ek gelmez (ünlü uyumu addan bilinmez): ad yalnız özne olur.
 */

/** İlerleme ekranını kim görüyor: danışan kendi gidişatını, PT danışanınkini. */
export type ProgressViewer = 'client' | 'pt';

const FORECAST = { top: true, e1rm: true, volume: false, reps: true, total_reps: false, seconds: true, total_seconds: false } as const;
export type Metric = keyof typeof FORECAST;
export type MetricInfo = { label: string; short: string; unit: string; forecast: boolean };

/** Hareket grafiğinin değerleri okuyanın dilinde. `short`: 375 px'te yan yana üç düğmeye sığan ad. */
export function metricsOf(locale: Locale = DEFAULT_LOCALE): Record<Metric, MetricInfo> {
  const text = clientProgressMessages(locale).metrics;
  return Object.fromEntries((Object.keys(FORECAST) as Metric[]).map((metric) => [metric, { ...text[metric], forecast: FORECAST[metric] }])) as Record<
    Metric,
    MetricInfo
  >;
}

/** Türkçe değerler (eski çağrılar); arayüz `metricsOf(locale)` kullanır. */
export const METRICS: Record<Metric, MetricInfo> = metricsOf('tr');

/**
 * Kayıt türüne göre grafikler; ilki varsayılan. Toplamlarda tahmin çizilmez: set sayısıyla oynar,
 * ilerlemenin kendisi değildir.
 */
export const METRICS_OF: Record<TrackingType, readonly Metric[]> = {
  weight_reps: ['top', 'e1rm', 'volume'],
  bodyweight_reps: ['reps', 'total_reps'],
  duration: ['seconds', 'total_seconds'],
};

const tenth = (value: number) => Math.round(value * 10) / 10;

/** Grafiğin noktaları; değeri olmayan gün (ör. 12'den çok tekrarlı günün tahmini maksimumu) çizilmez. */
export function metricPoints(points: readonly ExercisePoint[], metric: Metric): { date: string; value: number }[] {
  const pick = (point: ExercisePoint): number | undefined => {
    switch (metric) {
      case 'top':
        return point.topKg;
      case 'e1rm':
        return point.e1rm === undefined ? undefined : tenth(point.e1rm);
      case 'volume':
        return point.volumeKg > 0 ? point.volumeKg : undefined;
      case 'reps':
        return point.bestReps;
      case 'total_reps':
        return point.totalReps > 0 ? point.totalReps : undefined;
      case 'seconds':
        return point.bestSeconds;
      case 'total_seconds':
        return point.totalSeconds > 0 ? point.totalSeconds : undefined;
    }
  };
  return points.flatMap((point) => {
    const value = pick(point);
    return value === undefined ? [] : [{ date: point.date, value }];
  });
}

/**
 * Değer ekseninin en az aralığı: 60 → 62,5 kg'lık bir adım uçurum gibi görünmesin. Ağırlıkta en büyük
 * değerin %10'u (en az 5 kg), tekrarda 4, sürede 20 sn; toplamlarda veri aralığı **[sentez]**.
 */
export function metricMinSpan(metric: Metric, values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  if (metric === 'top' || metric === 'e1rm') return Math.max(5, Math.max(...values) * 0.1);
  if (metric === 'reps') return 4;
  if (metric === 'seconds') return 20;
  return undefined;
}

/** Tahmin (Theil–Sen, `trend.ts`): yalnız ilerleme değerlerinde; negatif olamaz. */
export function metricForecast(metric: Metric, points: readonly { date: string; value: number }[]): Forecast | null {
  return METRICS[metric].forecast ? forecast(points, { min: 0 }) : null;
}

/** "45 sn", "1 dk 30 sn", "2 dk". */
export function formatSeconds(seconds: number, locale: Locale = DEFAULT_LOCALE): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  const text = clientProgressMessages(locale).duration;
  if (minutes === 0) return text('', String(rest), 'seconds');
  return rest === 0 ? text(String(minutes), '', 'minutes') : text(String(minutes), String(rest), 'both');
}

/**
 * Tahminin tek satırı, danışanın dilinde. Veri yetmiyorsa ne gerektiği; son kayıt tahminin ufkundan
 * eskiyse tahmin yazılmaz (geçmiş bir güne tahmin olmaz, `forecastAsOf`). Eğilim düz ya da aşağıysa
 * ileriye sayı verilmez: hafifletme ya da ara olabilir, düşüşü uzatmak yanıltır.
 */
export function describeTrend(result: Forecast, unit: string, today: string, locale: Locale = DEFAULT_LOCALE): string {
  const t = clientProgressMessages(locale).trend;
  const f = getFormat(locale);
  if (!result.ok) return result.reason === 'too_few_points' ? t.tooFewPoints : t.tooShortSpan;
  const view = forecastAsOf(result, today);
  if (view.kind === 'stale') return t.stale(view.daysSince);
  const slope = tenth(result.slopePerWeek);
  const trend = t.slope(f.signedWithUnit(slope, unit));
  if (slope <= 0 || result.bound) return trend;
  const end = result.points.at(-1)!;
  const weeks = Math.round(result.horizonDays / 7);
  const [low, high] = [tenth(end.low), tenth(end.high)];
  const range = low === high ? '' : t.range(f.number(low), f.withUnit(high, unit));
  return t.forecast(trend, weeks, f.day(end.date), f.withUnit(tenth(end.value), unit), range);
}

/**
 * Tahmini maksimum grafiğinin son noktasından sonraki, bütün setleri 12'den çok tekrarlı antrenman günleri
 * (yüklü set var, tahmini maksimum yok); `from`dan itibaren. Grafik bu günleri çizmez; hareket yapılmamış
 * sanılmasın ve "son kayıt … gün önce" denmesin diye sayılır.
 */
export function highRepDaysSince(points: readonly ExercisePoint[], from?: string): number {
  const shown = points.filter((point) => !from || point.date >= from);
  const last = shown.filter((point) => point.e1rm !== undefined).at(-1)?.date;
  return shown.filter((point) => (!last || point.date > last) && point.e1rm === undefined && point.topKg !== undefined).length;
}

/** Grafiğin altında: son günlerin neden çizilmediği ve nereye bakılacağı. */
export function highRepDaysText(count: number, viewer: ProgressViewer = 'client', locale: Locale = DEFAULT_LOCALE): string {
  return clientProgressMessages(locale).highRepDays(count, E1RM_MAX_REPS, viewer === 'pt');
}

/** Tahmini maksimumun açıklaması (grafiğin altında). */
export function e1rmNote(viewer: ProgressViewer = 'client', locale: Locale = DEFAULT_LOCALE): string {
  return clientProgressMessages(locale).e1rmNote(E1RM_MAX_REPS, viewer === 'pt');
}

/** Rekorun adı; vücut ağırlığında "en ağır" ek yüktür. */
export function recordLabel(kind: RecordKind, trackingType: TrackingType, locale: Locale = DEFAULT_LOCALE): string {
  const t = clientProgressMessages(locale).records;
  switch (kind) {
    case 'heaviest':
      return trackingType === 'bodyweight_reps' ? t.heaviestAdded : t.heaviest;
    case 'e1rm':
      return t.e1rm;
    case 'reps_at_weight':
      return t.repsAtWeight;
    case 'most_reps':
      return t.mostReps;
    case 'longest':
      return t.longest;
  }
}

/** Rekorun değeri: "62,5 kg × 8", "≈ 83,3 kg (62,5 kg × 10)", "15 tekrar", "1 dk 30 sn". */
export function recordValue(mark: Pick<RecordMark, 'kind' | 'value' | 'kg' | 'reps' | 'seconds'>, locale: Locale = DEFAULT_LOCALE): string {
  const f = getFormat(locale);
  switch (mark.kind) {
    case 'heaviest':
    case 'reps_at_weight':
      return `${f.kg(mark.kg ?? 0)} × ${mark.reps ?? 0}`;
    case 'e1rm':
      return `≈ ${f.kg(tenth(mark.value))} (${f.kg(mark.kg ?? 0)} × ${mark.reps ?? 0})`;
    case 'most_reps':
      return clientProgressMessages(locale).records.reps(mark.reps ?? mark.value);
    case 'longest':
      return formatSeconds(mark.seconds ?? mark.value, locale);
  }
}

/** Önceki en iyi: "önceki en iyi 60 kg × 8", tahminde "önceki ≈ 80 kg". */
export function recordPrevious(event: Pick<RecordEvent, 'kind' | 'previous'>, locale: Locale = DEFAULT_LOCALE): string {
  const previous = event.previous;
  const t = clientProgressMessages(locale).records;
  if (event.kind === 'e1rm') return t.previousEstimate(getFormat(locale).kg(tenth(previous.value)));
  return t.previousBest(recordValue(previous, locale));
}

/** Hafta: "21–27 Eyl", ay değişirse "28 Eyl–4 Eki", yıl değişirse yıllı. */
export function weekLabel(weekStart: string, weekEnd: string, locale: Locale = DEFAULT_LOCALE): string {
  const f = getFormat(locale);
  const withYear = weekStart.slice(0, 4) !== weekEnd.slice(0, 4);
  if (!withYear && weekStart.slice(0, 7) === weekEnd.slice(0, 7)) return `${Number(weekStart.slice(8))}–${f.dayShort(weekEnd)}`;
  return `${f.dayShort(weekStart, withYear)}–${f.dayShort(weekEnd, withYear)}`;
}

/** Başarıların adları okuyanın dilinde. */
export function achievementTitles(locale: Locale = DEFAULT_LOCALE): Record<AchievementId, string> {
  return clientProgressMessages(locale).achievements.titles;
}

/** Türkçe adlar (eski çağrılar); arayüz `achievementTitles(locale)` kullanır. */
export const ACHIEVEMENT_TITLES: Record<AchievementId, string> = achievementTitles('tr');

/** Başarının altındaki satır: kazanıldıysa günü, değilse ne gerektiği ve ilerleme. */
export function achievementDetail(achievement: Achievement, weeklyTarget: number, viewer: ProgressViewer = 'client', locale: Locale = DEFAULT_LOCALE): string {
  if (achievement.achievedOn) return getFormat(locale).day(achievement.achievedOn);
  const t = clientProgressMessages(locale).achievements;
  switch (achievement.id) {
    case 'first_workout':
      return t.firstWorkout(viewer === 'pt');
    case 'first_record':
      return t.firstRecord(viewer === 'pt');
    case 'streak_4':
    case 'streak_12':
      return t.streak(weeklyTarget, achievement.current, achievement.target);
    default:
      return t.workouts(achievement.current, achievement.target);
  }
}

/** Seri satırı: "3 hafta üst üste · en uzun 6 hafta"; seri yoksa bu haftanın durumu. */
export function streakText(streak: Streak, locale: Locale = DEFAULT_LOCALE): string {
  const t = clientProgressMessages(locale).streak;
  const week = t.week(streak.thisWeek, streak.target);
  if (streak.current === 0) return streak.best > 0 ? `${week}${t.bestStreak(streak.best)}` : week;
  const best = streak.best > streak.current ? t.best(streak.best) : '';
  return t.current(streak.current, best, week);
}

/* --- Gelişim (güç) --- */

/** Gelişim durumlarının adları okuyanın dilinde. */
export function strengthStatusLabels(locale: Locale = DEFAULT_LOCALE): Record<StrengthStatus, string> {
  return clientProgressMessages(locale).strengthStatus;
}

/** Türkçe adlar (eski çağrılar); arayüz `strengthStatusLabels(locale)` kullanır. */
export const STRENGTH_STATUS_LABELS: Record<StrengthStatus, string> = strengthStatusLabels('tr');

/** Oransal değişim: 0,084 → "+%8,4", −0,03 → "−%3"; binde bire yuvarlı. */
export function formatChangePct(ratio: number, locale: Locale = DEFAULT_LOCALE): string {
  return getFormat(locale).signedWithUnit(Math.round(ratio * 1000) / 10, '%');
}

/** Karar yoksa ne gerektiği: pencerede en az 4 antrenman günü ve 3 hafta (`FORECAST_MIN_*`). */
export function strengthMissingText(
  exercise: Pick<ExerciseStrength, 'missing'> & { points: readonly { date: string }[] },
  locale: Locale = DEFAULT_LOCALE,
): string {
  const t = clientProgressMessages(locale).strength;
  if (exercise.missing === 'too_short_span') {
    const days = daysBetween(exercise.points[0]!.date, exercise.points.at(-1)!.date);
    return t.shortSpan(FORECAST_MIN_SPAN_DAYS / 7, days);
  }
  return t.fewPoints(FORECAST_MIN_POINTS, exercise.points.length);
}

/**
 * Hareketin satırı: çizginin başı ve sonu, değişim ve olası aralığı. "≈ 62,1 → 68,4 kg (+%10,2) · olası
 * değişim +5,3 – +10,5 kg"; karar yoksa ne gerektiği.
 */
export function strengthDetail(
  exercise: Pick<ExerciseStrength, 'metric' | 'fit' | 'missing'> & { points: readonly { date: string }[] },
  locale: Locale = DEFAULT_LOCALE,
): string {
  const fit = exercise.fit;
  if (!fit) return strengthMissingText(exercise, locale);
  const f = getFormat(locale);
  const unit = metricsOf(locale)[exercise.metric].unit;
  const pct = fit.changePct === null ? '' : ` (${formatChangePct(fit.changePct, locale)})`;
  const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : '±'}${f.number(Math.abs(value))}`;
  const range = `${signed(tenth(fit.low))} – ${f.signedWithUnit(tenth(fit.high), unit)}`;
  return clientProgressMessages(locale).strength.detail(f.number(tenth(fit.start)), f.withUnit(tenth(fit.end), unit), pct, range);
}

/** Kasın rolü, grup satırında: hepsi aynıysa tek ad, değilse kas kas ("Hedef: alt göğüs · Yardımcı: üst göğüs"). */
export function groupRoleText(
  roles: readonly { muscle: string; role: MuscleRole }[],
  labelOf: (muscle: string) => string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const names = roleLabels(locale);
  const distinct = [...new Set(roles.map((item) => item.role))];
  if (distinct.length === 1) return names[distinct[0]!];
  return (['primary', 'secondary', 'stabilizer'] as const)
    .filter((role) => distinct.includes(role))
    .map((role) => `${names[role]}: ${roles.filter((item) => item.role === role).map((item) => lower(locale, labelOf(item.muscle))).join(', ')}`)
    .join(' · ');
}

/** Gelişim bölümünün yöntem notu (kas sheet'inin altında). */
export function strengthMethodNote(viewer: ProgressViewer = 'client', locale: Locale = DEFAULT_LOCALE): string[] {
  const t = clientProgressMessages(locale).strength;
  return [t.methodFirst(E1RM_MAX_REPS, viewer === 'pt'), ...t.methodRest(FORECAST_MIN_POINTS, FORECAST_MIN_SPAN_DAYS / 7)];
}

export const STRENGTH_METHOD_NOTE = strengthMethodNote('client');

/**
 * Çevre değişimi: "Kol çevresi (kasılı), sağ: +0,6 cm". Eşiği bilinen ölçümde (kalça) hata payı içindeyse
 * söylenir; eşiği olmayanda (kol, uyluk, baldır) yalnız fark: gelişme ya da gerileme denmez.
 */
export function circumferenceText(change: Pick<CircumferenceChange, 'id' | 'key' | 'delta' | 'kind'>, locale: Locale = DEFAULT_LOCALE): string {
  const t = clientProgressMessages(locale).circumference;
  const sides: Record<LineKey, string> = { value: '', left: t.left, right: t.right };
  const label = t.label(measurementDef(change.id, locale).label, sides[change.key]);
  const noise = change.kind === 'no_real_change' ? t.noise : '';
  return `${label}: ${getFormat(locale).signedWithUnit(change.delta, 'cm')}${noise}`;
}

/* --- grafik bölümü --- */

/** Son `days` günün (bugün dahil) ortalaması ve nokta sayısı; nokta yoksa null. */
export function recentAverage(points: readonly { date: string; value: number }[], today: string, days = 28): { average: number; count: number } | null {
  const from = shiftDay(today, -(days - 1));
  const recent = points.filter((point) => point.date >= from && point.date <= today);
  if (recent.length === 0) return null;
  return { average: tenth(recent.reduce((sum, point) => sum + point.value, 0) / recent.length), count: recent.length };
}

/** "Son 4 tamamlanan haftada 11/12 gün (%92)." — hafta başına plandan fazlası sayılmaz. */
export function adherenceText(recent: { done: number; planned: number; weeks: number }, locale: Locale = DEFAULT_LOCALE): string {
  const pct = Math.round((recent.done / recent.planned) * 100);
  return clientProgressMessages(locale).adherence(recent.weeks, recent.done, recent.planned, pct);
}

/** Su özeti: kayıtlı gün ve o günlerin ortalaması (bardak). */
export function waterSummary(days: readonly { glasses: number }[]): { recorded: number; average: number | null } {
  const recorded = days.filter((day) => day.glasses > 0);
  return {
    recorded: recorded.length,
    average: recorded.length > 0 ? tenth(recorded.reduce((sum, day) => sum + day.glasses, 0) / recorded.length) : null,
  };
}

/* --- kime yazıldığı --- */

/**
 * İlerleme bileşenlerinin kime göre değişen metinleri (`src/components/progress`): danışana ikinci tekil,
 * PT'ye danışanın adıyla ya da yansız. `name`: danışanın adı (PT'de; boşsa "Danışan"). Ad yalnız öznedir,
 * arkasına ek gelmez. Kime göre değişmeyen metinler bileşenlerde durur.
 */
export function progressCopy(viewer: ProgressViewer, name?: string, locale: Locale = DEFAULT_LOCALE) {
  const t = clientProgressMessages(locale);
  const f = getFormat(locale);
  const who = name?.trim() || t.client;
  const copy = t.copy(viewer === 'pt', who, FORECAST_MIN_POINTS, FORECAST_MIN_SPAN_DAYS / 7);
  return {
    ...copy,
    methodNote: strengthMethodNote(viewer, locale),
    recordSessions: (count: number) => copy.recordSessions(count, f.number(count)),
    e1rmNote: e1rmNote(viewer, locale),
    highRepDays: (count: number) => highRepDaysText(count, viewer, locale),
    readinessFirst: (score: number) => copy.readinessFirst(f.number(score)),
    waterDays: (days: number) => copy.waterDays(days, f.number(days)),
  };
}

export type ProgressCopy = ReturnType<typeof progressCopy>;
