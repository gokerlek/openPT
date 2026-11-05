// Göreli ve uzantılı içe aktarma: metinler `node --test` ile de sınanır (`measurement-text.test.ts`).
import { DEFAULT_LOCALE, type Locale } from '../../../../../i18n/locale.ts';
import { measurementsMessages } from '../../../../../i18n/messages/measurements/index.ts';
import { getFormat } from '../../../../../lib/format.ts';
import type {
  ChangeKind,
  LatestChangeVerdict,
  NoiseRule,
  SideBridgeIndicator,
  SitToStandIndicator,
  TrendVerdict,
  WaistHipIndicator,
} from '@/lib/measurement-trends';
import { MEASUREMENT_SLOTS } from '../../../../../lib/measurement-log.ts';
import { MEASUREMENT_UNIT_LABELS, measurementDef, type MeasurementDef } from '../../../../../lib/measurements.ts';
import { forecastAsOf, type Forecast } from '../../../../../lib/trend.ts';

/** Ölçüm ekranlarının ortak metinleri (PT tarafı); hepsi okuyanın dilinde (`locale`, yoksa Türkçe). */

function text(locale: Locale) {
  return measurementsMessages(locale);
}

/** Katalog birimi → ekranda görünen ("s" Türkçede "sn"); tek yer `measurements.ts`. */
export const UNIT_LABELS: Record<MeasurementDef['unit'], string> = MEASUREMENT_UNIT_LABELS;

/** Grupların başlığı ve açıklaması okuyanın dilinde. */
export function groupInfo(locale: Locale = DEFAULT_LOCALE): Record<MeasurementDef['group'], { title: string; description: string }> {
  return text(locale).groups;
}

/** Türkçe gruplar (eski çağrılar); arayüz `groupInfo(locale)` kullanır. */
export const GROUP_INFO: Record<MeasurementDef['group'], { title: string; description: string }> = groupInfo('tr');

/**
 * Katlanmış bölümün özeti: dolu alan sayısı ve ilk üçü, yazıldığı gibi ("Vücut ağırlığı 81,5 kg ·
 * Bel çevresi 87,9 cm ve 2 değer daha"). Boşsa `count` 0.
 */
export function groupSummary(
  group: MeasurementDef['group'],
  slots: Readonly<Record<string, string | undefined>>,
  locale: Locale = DEFAULT_LOCALE,
): { count: number; text: string } {
  const t = text(locale);
  const filled = MEASUREMENT_SLOTS.filter((slot) => measurementDef(slot.id, locale).group === group && (slots[slot.key] ?? '').trim() !== '');
  const shown = filled.slice(0, 3).map(({ key, id, side }) => {
    const def = measurementDef(id, locale);
    const name = t.text.slotName(def.label, side ? t.sides[side] : null);
    return t.text.slotValue(name, (slots[key] ?? '').trim(), t.units[def.unit]);
  });
  return { count: filled.length, text: t.text.groupSummary(shown, filled.length - shown.length) };
}

/** Değişimin adı okuyanın dilinde. */
export function changeLabels(locale: Locale = DEFAULT_LOCALE): Record<ChangeKind, string> {
  return text(locale).text.changes;
}

export const CHANGE_LABELS: Record<ChangeKind, string> = changeLabels('tr');

/** Eşiğin ekrandaki açıklaması: "2 cm altındaki değişim gerçek sayılmaz (…)". */
export function describeRule(rule: NoiseRule, unit: string, locale: Locale = DEFAULT_LOCALE): string {
  const t = text(locale).text;
  const format = getFormat(locale);
  const size = rule.relative ? t.percent(format.number(rule.threshold * 100)) : format.withUnit(rule.threshold, unit);
  return t.rule(size, rule.source, rule.better);
}

/** Eşiği olmayan ölçümün notu okuyanın dilinde. */
export function noRuleText(locale: Locale = DEFAULT_LOCALE): string {
  return text(locale).text.noRule;
}

export const NO_RULE_TEXT = noRuleText('tr');

export function describeWaistHip(indicator: WaistHipIndicator, locale: Locale = DEFAULT_LOCALE): string {
  const t = text(locale).text;
  if (indicator.sex === null) return t.waistHipNoSex;
  const format = getFormat(locale);
  return t.waistHip(format.number(indicator.ratio), format.day(indicator.date), indicator.elevatedRisk, indicator.sex);
}

export function describeSitToStand(indicator: SitToStandIndicator, locale: Locale = DEFAULT_LOCALE): string {
  const t = text(locale);
  const value = getFormat(locale).withUnit(indicator.seconds, t.units.s);
  return t.text.sitToStand[indicator.flag](value);
}

export function describeSideBridge(indicator: SideBridgeIndicator, locale: Locale = DEFAULT_LOCALE): string {
  const format = getFormat(locale);
  return text(locale).text.sideBridge(format.number(indicator.differencePercent), format.day(indicator.date), indicator.flagged);
}

const tenth = (value: number) => Math.round(value * 10) / 10;

/** Rozetin rengi ve ikonu: iyi yönde gerçek değişim, kötü yönde, gürültü/durağan, yönsüz artış ya da azalma. */
export type VerdictTone = 'good' | 'bad' | 'flat' | 'up' | 'down';

/**
 * Kartta tek hükmün satırı: "Son iki ölçüm: −0,7 cm · ölçüm hatası içinde" ya da "4 haftalık eğilim:
 * gerçek gelişme (−2,8 cm)". `text` tam cümle (rozetin ipucu); `detail` hangi ölçümlerden hesaplandığı
 * (kartta görünür).
 */
export type VerdictView = {
  label: string;
  /** İşaretli fark, birimiyle. */
  amount: string;
  /** Rozetteki hüküm; eşiği olmayan ölçümde null (sınıflanmaz). */
  verdict: string | null;
  tone: VerdictTone;
  text: string;
  detail: string;
};

const CHANGE_TONES: Record<ChangeKind, VerdictTone> = {
  improved: 'good',
  declined: 'bad',
  increased: 'up',
  decreased: 'down',
  no_real_change: 'flat',
};

/** Tarih aralığı kısa biçimde; yıllar farklıysa yıllı: "11 Ağu–8 Eyl". */
function dayRange(from: string, to: string, locale: Locale): string {
  const withYear = from.slice(0, 4) !== to.slice(0, 4);
  const format = getFormat(locale);
  return `${format.dayShort(from, withYear)}–${format.dayShort(to, withYear)}`;
}

/** Son iki ölçüm arasındaki fark ve (eşiği varsa) ölçüm hatasına göre hükmü. */
export function latestChangeView(change: LatestChangeVerdict, unit: string, relative: boolean, locale: Locale = DEFAULT_LOCALE): VerdictView {
  const t = text(locale).text;
  const format = getFormat(locale);
  const percent = relative && change.ratio !== null ? t.signedPercent(change.ratio < 0, format.number(Math.abs(Math.round(change.ratio * 100)))) : '';
  const amount = `${format.signedWithUnit(change.delta, unit)}${percent}`;
  const verdict = change.kind ? t.verdictInline(t.changes[change.kind]) : null;
  const withYear = change.previous.date.slice(0, 4) !== change.latest.date.slice(0, 4);
  const days = `${format.dayShort(change.previous.date, withYear)} → ${format.dayShort(change.latest.date, withYear)}`;
  return {
    label: t.latestLabel,
    amount,
    verdict,
    tone: change.kind ? CHANGE_TONES[change.kind] : 'flat',
    text: t.latestText(amount, verdict),
    detail: change.previousBeforeRange ? t.previousBeforeRange(days) : days,
  };
}

const TREND_TONES: Record<TrendVerdict['kind'], VerdictTone> = {
  improving: 'good',
  declining: 'bad',
  plateau: 'flat',
  increased: 'up',
  decreased: 'down',
};

/**
 * Son ölçüme kadarki 4 haftanın eğilimi; son iki ölçümün farkından ayrı satır. Hangi ölçümlerden
 * hesaplandığını söyler; seçili aralığın başından önceki ölçümleri de kullanıyorsa bunu yazar
 * (grafik yalnız aralığı çizer). Eşiğin altındaki eğilim "durağan"dır, "gelişme" denmez.
 */
export function trendView(trend: TrendVerdict, unit: string, locale: Locale = DEFAULT_LOCALE): VerdictView {
  const t = text(locale).text;
  const verdict = t.trendWords[trend.kind];
  const amount = getFormat(locale).signedWithUnit(tenth(trend.change), unit);
  return {
    label: t.trendLabel,
    amount,
    verdict,
    tone: TREND_TONES[trend.kind],
    text: t.trendText(verdict, amount),
    detail: t.trendDetail(dayRange(trend.from, trend.to, locale), trend.points, trend.beforeRange),
  };
}

/** Aralık, birimiyle ve yüzde işareti her sayının başında: "%8–%12", "82,1–86,3 cm". */
export function formatRange(low: number, high: number, unit: string, locale: Locale = DEFAULT_LOCALE): string {
  const format = getFormat(locale);
  return text(locale).text.range(format.number(low), format.number(high), unit);
}

/**
 * Tahminin tek satırlık özeti; veri yetmiyorsa ne kadar gerektiği. Çizgi ölçümün sınırına (ODI'de %0,
 * ankette 100) değiyorsa kaç haftada değdiği yazılır, tek noktaya çökmüş "0–0" aralığı değil; bant
 * gürültüsüz veride de çökebilir, o zaman aralık hiç yazılmaz.
 *
 * `today` verilirse tahmin bugüne göre okunur (`forecastAsOf`): son tahmin günü geçmişte kalmışsa
 * tahmin yazılmaz (geçmiş bir güne "tahmin" olmaz), son ölçümün kaç gün önce olduğu söylenir; bugün
 * ufkun içindeyse bugünün tahmini de yazılır.
 */
export function describeForecast(forecast: Forecast, unit: string, today?: string, locale: Locale = DEFAULT_LOCALE): string {
  const t = text(locale).text.forecast;
  const format = getFormat(locale);
  if (!forecast.ok) return forecast.reason === 'too_few_points' ? t.tooFewPoints : t.tooShort;
  const trend = t.slope(format.signedWithUnit(tenth(forecast.slopePerWeek), unit));
  const view = today ? forecastAsOf(forecast, today) : null;
  if (view?.kind === 'stale') return t.stale(trend, view.daysSince, format.day(view.endDate));
  const end = forecast.points.at(-1)!;
  if (forecast.bound) {
    const down = forecast.slopePerWeek < 0;
    const bound = format.withUnit(forecast.bound.value, unit);
    if (forecast.bound.days === 0) return t.boundNow(trend, down, bound);
    const weeks = forecast.bound.days < 7 ? null : Math.round(forecast.bound.days / 7);
    return t.bound(trend, down, bound, weeks, format.day(end.date));
  }
  const estimate = view?.kind === 'current' ? view.today : null;
  const now = estimate ? t.today(format.day(estimate.date), format.withUnit(tenth(estimate.value), unit)) : '';
  const weeks = Math.round(forecast.horizonDays / 7);
  const [low, high] = [tenth(end.low), tenth(end.high)];
  const range = low === high ? '' : t.range(formatRange(low, high, unit, locale));
  return t.ahead(trend, now, weeks, format.day(end.date), format.withUnit(tenth(end.value), unit), range);
}
