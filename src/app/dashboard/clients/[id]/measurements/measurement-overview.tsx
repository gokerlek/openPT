import Link from 'next/link';
import { ArrowDown, ArrowUp, CheckCircle, Ruler, WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { Equals } from '@/components/line-icons';
import { ProgressChart, type ProgressSeries } from '@/components/progress-chart';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';
import type { Locale } from '@/i18n/locale';
import { measurementsMessages } from '@/i18n/messages/measurements';
import { getFormat } from '@/lib/format';
import { measurementDays, valueMax } from '@/lib/measurement-log';
import {
  lineOutlook,
  lineVerdicts,
  measurementsInRange,
  type LineKey,
  type MeasurementIndicators,
  type MeasurementLine,
  type MeasurementTrend,
} from '@/lib/measurement-trends';
import { MEASUREMENT_GROUPS, measurementDefs } from '@/lib/measurements';
import type { HealthRecord } from '@/lib/schemas/health';
import { forecastAsOf } from '@/lib/trend';
import {
  describeForecast,
  describeRule,
  describeSideBridge,
  describeSitToStand,
  describeWaistHip,
  latestChangeView,
  noRuleText,
  trendView,
  type VerdictTone,
  type VerdictView,
} from './measurement-text';

/**
 * Ölçümlerin genel bakışı: katalog grubuna göre ölçüm başına grafik kartı (seyir, son değer,
 * değişimin gerçek olup olmadığı, yorum satırları) ve tam genişlikte ölçüm günleri.
 */
export function MeasurementOverview({
  record,
  base,
  from,
  to,
  today,
  locale,
}: {
  record: HealthRecord;
  base: string;
  locale: Locale;
  /** Uygulamanın saat dilimindeki gün: son günü geçmişte kalan tahmin çizilmez (`forecastAsOf`). */
  today: string;
  /**
   * Tarih süzgeci (uçlar dahil); grafikler, tahmin ve göstergeler bu aralıkla hesaplanır. Değişim
   * aralığın son ölçümünü ondan öncekiyle karşılaştırır, eğilim aralık başından önceki çapayı da görür
   * (`measurementsInRange`).
   */
  from?: string;
  to?: string;
}) {
  const messages = measurementsMessages(locale);
  const t = messages.page;
  if (record.measurements.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Ruler weight="fill" />
          </EmptyMedia>
          <EmptyTitle>{t.emptyTitle}</EmptyTitle>
          <EmptyDescription>{t.emptyDescription}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const { entries: inRange, trends, indicators } = measurementsInRange(record.measurements, record.sex, from, to, locale);
  const defs = measurementDefs(locale);
  if (inRange.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Ruler weight="fill" />
          </EmptyMedia>
          <EmptyTitle>{t.emptyRangeTitle}</EmptyTitle>
          <EmptyDescription>{t.emptyRangeDescription}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const groups = MEASUREMENT_GROUPS
    .map((group) => ({ group, trends: trends.filter((trend) => defs[trend.id].group === group) }))
    .filter((entry) => entry.trends.length > 0);
  const days = measurementDays(inRange);

  return (
    <>
      {groups.map(({ group, trends: items }) => (
        <section key={group} aria-labelledby={`group-${group}`} className="flex flex-col gap-3">
          <h2 id={`group-${group}`} className="font-heading text-lg font-semibold">
            {messages.groups[group].title}
          </h2>
          <div className="grid gap-6 lg:grid-cols-2">
            {items.map((trend) => (
              <TrendCard key={trend.id} trend={trend} indicators={indicators} from={from} today={today} locale={locale} />
            ))}
          </div>
        </section>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>{t.daysTitle}</CardTitle>
          <CardDescription>{t.daysDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <ItemGroup className="gap-2 sm:grid sm:grid-cols-2 lg:grid-cols-3">
            {days.map((day) => {
              const labels = day.ids.map((measurement) => defs[measurement].label);
              const shown = labels.slice(0, 3).join(', ');
              return (
                <Item key={day.date} variant="outline" size="sm" render={<Link href={`${base}/${day.date}/edit`} />}>
                  <ItemContent>
                    <ItemTitle>{getFormat(locale).day(day.date)}</ItemTitle>
                    <ItemDescription>{labels.length > 3 ? t.dayMore(shown, labels.length - 3) : shown}</ItemDescription>
                  </ItemContent>
                </Item>
              );
            })}
          </ItemGroup>
        </CardContent>
      </Card>
    </>
  );
}

/** Çizginin adı: tek değer ya da taraf. */
function lineLabels(locale: Locale): Record<LineKey, string> {
  const t = measurementsMessages(locale);
  return { value: t.page.lineValue, ...t.sides };
}

/**
 * Grafiğin değer ekseni en az hata payının iki katını kapsar: gürültü içindeki oynama
 * (kalça 100 → 99 cm) uçurum gibi görünmesin. Eşiği olmayan ölçümde veri aralığı.
 */
function noiseSpan(trend: MeasurementTrend): number | undefined {
  const rule = trend.rule;
  if (!rule) return undefined;
  if (!rule.relative) return rule.threshold * 2;
  const values = trend.lines.flatMap((line) => line.points.map((point) => point.value));
  const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  return rule.threshold * 2 * mean;
}

function TrendCard({
  trend,
  indicators,
  from,
  today,
  locale,
}: {
  trend: MeasurementTrend;
  indicators: MeasurementIndicators;
  locale: Locale;
  /** Seçili aralığın başı: eğilim ondan önceki ölçümleri kullanıyorsa kart bunu yazar. */
  from?: string;
  today: string;
}) {
  const messages = measurementsMessages(locale);
  const t = messages.page;
  const format = getFormat(locale);
  const LINE_LABELS = lineLabels(locale);
  const def = measurementDefs(locale)[trend.id];
  const unit = messages.units[def.unit];
  const sided = trend.lines.some((line) => line.key !== 'value');
  const charted = trend.lines.some((line) => line.points.length > 1);
  // Tahmin kayıt şemasının sınırlarında kalır: ölçüm negatif olamaz, anket 100'ü aşmaz.
  const bounds = { min: 0, max: valueMax(trend.id) };
  // Tahmin tek çizgili ölçümde ve yalnız grafikteki noktalardan: sol/sağda iki bant grafiği okunmaz kılar.
  const single = trend.lines.length === 1 ? trend.lines[0] : undefined;
  const singleForecast = single ? lineOutlook(single.points, trend.rule, bounds, single.history).forecast : undefined;
  // Son tahmin günü geçmişte kalmışsa grafik kesikli çizgiyi çizmez; metin nedenini söyler.
  const drawn = singleForecast ? forecastAsOf(singleForecast, today) : undefined;
  const series = trend.lines.slice(0, 2).map(
    (line): ProgressSeries => ({ key: line.key, label: LINE_LABELS[line.key], points: line.points }),
  ) as [ProgressSeries] | [ProgressSeries, ProgressSeries];

  const notes: string[] = [trend.rule ? describeRule(trend.rule, unit, locale) : noRuleText(locale)];
  // Göstergeler kartın geri kalanıyla aynı tarih aralığından.
  if (trend.id === 'waist_girth' && indicators.waistHip) notes.push(describeWaistHip(indicators.waistHip, locale));
  if (trend.id === 'sit_to_stand_5x' && indicators.sitToStand) notes.push(describeSitToStand(indicators.sitToStand, locale));
  if (trend.id === 'side_bridge_endurance' && indicators.sideBridge) notes.push(describeSideBridge(indicators.sideBridge, locale));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{def.label}</CardTitle>
        <CardDescription>{t.lastMeasured(format.day(trend.lastDate))}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className={sided ? 'grid gap-4 sm:grid-cols-2' : 'flex flex-col gap-3'}>
          {trend.lines.map((line) => {
            // İki ayrı hüküm, ayrı adla: son iki ölçümün farkı ve 4 haftalık eğilim (`lineVerdicts`).
            const verdicts = lineVerdicts(line, trend.rule, from);
            const views = [
              verdicts.latest ? latestChangeView(verdicts.latest, unit, trend.rule?.relative ?? false, locale) : null,
              verdicts.trend ? trendView(verdicts.trend, unit, locale) : null,
            ].filter((view) => view !== null);
            return (
              <LatestValue key={line.key} line={line} unit={unit} label={sided ? LINE_LABELS[line.key] : t.latestValue} views={views} locale={locale} />
            );
          })}
        </dl>

        {/* Tek ölçümde grafik yok: "ilk ölçüm" notu yeterli. */}
        {charted ? (
          <ProgressChart
            title={def.label}
            unit={unit}
            series={series}
            minSpan={noiseSpan(trend)}
            forecast={drawn?.kind === 'current' ? drawn.forecast.points : undefined}
          />
        ) : null}
        {singleForecast && single && single.points.length > 1 ? (
          <p className="text-sm text-muted-foreground">{describeForecast(singleForecast, unit, today, locale)}</p>
        ) : null}

        <ul className="flex list-disc flex-col gap-1 pl-4 text-sm text-muted-foreground">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function LatestValue({ line, unit, label, views, locale }: { line: MeasurementLine; unit: string; label: string; views: VerdictView[]; locale: Locale }) {
  const latest = line.points.at(-1);
  if (!latest) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="flex flex-col gap-2">
        <span className="text-2xl font-semibold tabular-nums">{getFormat(locale).withUnit(latest.value, unit)}</span>
        {views.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {views.map((view) => (
              <VerdictRow key={view.label} view={view} />
            ))}
          </ul>
        ) : (
          <span className="text-xs text-muted-foreground">{measurementsMessages(locale).page.firstMeasurement}</span>
        )}
      </dd>
    </div>
  );
}

/**
 * Tek hükmün satırı: "Son iki ölçüm: −0,7 cm [ölçüm hatası içinde]" ya da "4 haftalık eğilim: −2,8 cm
 * [gerçek gelişme]". İki satır aynı biçimde; altında hangi ölçümlerden hesaplandığı.
 */
function VerdictRow({ view }: { view: VerdictView }) {
  return (
    <li className="flex flex-col gap-0.5 text-sm">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-muted-foreground">{view.label}:</span>
        <span className="font-medium tabular-nums">{view.amount}</span>
        {view.verdict ? <VerdictBadge tone={view.tone} text={view.verdict} title={`${view.text}. ${view.detail}`} /> : null}
      </span>
      <span className="text-xs text-muted-foreground">{view.detail}</span>
    </li>
  );
}

function VerdictBadge({ text, tone, title }: { text: string; tone: VerdictTone; title: string }) {
  const icon =
    tone === 'good' ? (
      <CheckCircle weight="fill" data-icon="inline-start" />
    ) : tone === 'bad' ? (
      <WarningCircle weight="fill" data-icon="inline-start" />
    ) : tone === 'up' ? (
      <ArrowUp weight="fill" data-icon="inline-start" />
    ) : tone === 'down' ? (
      <ArrowDown weight="fill" data-icon="inline-start" />
    ) : (
      <Equals data-icon="inline-start" />
    );
  const variant = tone === 'good' ? 'default' : tone === 'bad' ? 'destructive' : tone === 'flat' ? 'outline' : 'secondary';
  return (
    <Badge variant={variant} title={title}>
      {icon}
      {text}
    </Badge>
  );
}
