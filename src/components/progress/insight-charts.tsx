'use client';

import { useState } from 'react';
import { WarningCircle } from '@phosphor-icons/react';
import { ProgressBars } from '@/components/progress-bars';
import { ProgressChart, type ProgressSeries } from '@/components/progress-chart';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useLocale } from '@/i18n/client';
import type { Locale } from '@/i18n/locale';
import { clientProgressMessages } from '@/i18n/messages/client-progress';
import { getFormat } from '@/lib/format';
import type { WeekView } from '@/lib/progress';
import type { Gated, ProgressInsights } from '@/lib/progress-insights';
import { adherenceText, progressCopy, recentAverage, waterSummary, weekLabel, type ProgressViewer } from '@/lib/progress-text';
import { ProgressCard } from './progress-card';

/**
 * İlerleme'nin grafik bölümü (SPEC §7.6): haftalık toplam ağırlık ve çalışma seti, antrenman düzeni
 * (haftada gün ve plan), onay varsa hazır oluşluk ve ağrı, seans zorluğu, son 30 günün suyu. Noktalar
 * sunucuda hesaplanır (`progress-insights.ts`); sağlık grafikleri onay yoksa hiç gelmez (`off`). Her
 * grafiğin boş durumu ne kadar veri gerektiğini söyler. Dokununca değer, altında tablo. Danışan ve PT
 * aynı kartları kullanır (`viewer`, metinler `progressCopy`'den).
 */

/** Grafik için en az bu kadar nokta (`CHART_MIN_POINTS`; sunucu modülü tarayıcıya taşınmasın diye burada da). */
const MIN_POINTS = 2;

type Audience = { viewer: ProgressViewer; name?: string };

function Note({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">{children}</p>;
}

function Unavailable({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
      <WarningCircle weight="fill" className="mt-0.5 size-4 shrink-0" aria-hidden />
      {text}
    </p>
  );
}

const weekName = (weeks: readonly Pick<WeekView, 'weekStart' | 'weekEnd'>[], locale: Locale) => {
  const labels = new Map(weeks.map((week) => [week.weekStart, weekLabel(week.weekStart, week.weekEnd, locale)]));
  return (date: string) => labels.get(date) ?? getFormat(locale).day(date);
};

type LoadMetric = 'volume' | 'sets';

/** Haftalık yük: toplam ağırlık ya da çalışma seti, son 12 hafta; bu hafta sürüyor. */
export function WeeklyLoadCard({ viewer, weeks, today }: Audience & { weeks: WeekView[]; today: string }) {
  const locale = useLocale();
  const t = clientProgressMessages(locale).charts;
  const copy = progressCopy(viewer, undefined, locale);
  const [metric, setMetric] = useState<LoadMetric>('volume');
  const current = weeks.at(-1);
  if (!current) return null;
  const lifted = weeks.some((week) => week.volumeKg > 0);
  const bars = weeks.map((week) => ({ date: week.weekStart, value: metric === 'volume' ? week.volumeKg : week.sets, partial: week.weekEnd >= today }));
  const label = metric === 'volume' ? t.totalWeight : t.workingSets;

  return (
    <ProgressCard viewer={viewer} title={t.weeklyLoad} description={copy.weeklyLoadIntro}>
      <ToggleGroup
        variant="outline"
        spacing={0}
        value={[metric]}
        onValueChange={(value) => {
          const next = value[0] as LoadMetric | undefined;
          if (next) setMetric(next);
        }}
        aria-label={t.chartPick}
        className="w-full">
        <ToggleGroupItem value="volume" className="h-11 flex-1">
          {t.totalWeight}
        </ToggleGroupItem>
        <ToggleGroupItem value="sets" className="h-11 flex-1">
          {t.workingSets}
        </ToggleGroupItem>
      </ToggleGroup>
      {weeks.length < MIN_POINTS ? (
        <Note>{t.firstWeek(current.sessions, current.sets, current.volumeKg > 0 ? getFormat(locale).kg(current.volumeKg) : '')}</Note>
      ) : metric === 'volume' && !lifted ? (
        <Note>{t.noWeighted}</Note>
      ) : (
        <ProgressBars
          title={t.weekly(label)}
          unit={metric === 'volume' ? 'kg' : t.setUnit}
          bars={bars}
          dateLabel={weekName(weeks, locale)}
          pointNoun={t.weekNoun}
          yAxisWidth={metric === 'volume' ? 48 : 32}
        />
      )}
      <p className="text-xs text-muted-foreground">
        {metric === 'volume' ? t.volumeNote : copy.workingSetsNote} {t.partialWeek}
      </p>
    </ProgressCard>
  );
}

/** Antrenman düzeni: haftada antrenman günü ve plan (kesikli çizgi). */
export function AdherenceCard({ viewer, adherence }: Audience & { adherence: ProgressInsights['adherence'] }) {
  const locale = useLocale();
  const t = clientProgressMessages(locale).charts;
  const copy = progressCopy(viewer, undefined, locale);
  const weeks = adherence.weeks;
  if (weeks.length === 0) return null;
  const target = adherence.planned === null ? undefined : { value: adherence.planned, label: t.plan(adherence.planned) };
  return (
    <ProgressCard viewer={viewer} title={t.adherence} description={copy.adherenceIntro}>
      {adherence.recent ? <p className="text-sm font-medium tabular-nums">{adherenceText(adherence.recent, locale)}</p> : null}
      {weeks.length < MIN_POINTS ? (
        <Note>{t.firstAdherence(weeks.at(-1)!.days, adherence.planned)}</Note>
      ) : (
        <ProgressBars
          title={t.daysPerWeek}
          unit={t.dayUnit}
          bars={weeks.map((week) => ({ date: week.weekStart, value: week.days, partial: week.current }))}
          dateLabel={weekName(weeks, locale)}
          target={target}
          pointNoun={t.weekNoun}
          showValues
          valueLabel={(value) => t.days(getFormat(locale).number(value), value)}
          yAxisWidth={24}
        />
      )}
      <p className="text-xs text-muted-foreground">
        {adherence.planned === null ? copy.adherenceNoPlan : copy.adherencePlanNote} {copy.adherenceWeeksNote}
      </p>
    </ProgressCard>
  );
}

function healthNote<T>(section: Gated<T>, text: string): React.ReactNode | null {
  return section.state === 'unavailable' ? <Unavailable text={text} /> : null;
}

/** Hazır oluşluk puanı (20–100), onay varsa. */
export function ReadinessCard({ viewer, readiness, today, low }: Audience & { readiness: ProgressInsights['readiness']; today: string; low: number }) {
  const locale = useLocale();
  const t = clientProgressMessages(locale).charts;
  const copy = progressCopy(viewer, undefined, locale);
  if (readiness.state === 'off') return null;
  const points = readiness.state === 'ok' ? readiness.points : [];
  const recent = recentAverage(points, today);
  return (
    <ProgressCard viewer={viewer} title={t.readiness} description={t.readinessIntro}>
      {healthNote(readiness, copy.unavailable(copy.readinessWhat)) ??
        (points.length < MIN_POINTS ? (
          <Note>{t.readinessEmpty(points.length === 1 ? copy.readinessFirst(points[0]!.value) : '')}</Note>
        ) : (
          <>
            {recent ? (
              <p className="text-sm tabular-nums">
                {t.averageLead} <span className="font-medium">{getFormat(locale).number(recent.average)}</span> {t.answers(recent.count)}
              </p>
            ) : null}
            <ProgressChart
              title={t.readinessScore}
              unit={t.pointsUnit}
              series={[{ key: 'value', label: t.readiness, points }]}
              minSpan={40}
              pointNoun={t.workoutDayNoun}
            />
          </>
        ))}
      <p className="text-xs text-muted-foreground">{t.lowLimit(low)}</p>
    </ProgressCard>
  );
}

/** Ağrı (0–10): antrenman öncesi son 24 saat ve antrenmandaki en yüksek; onay varsa. */
export function PainCard({ viewer, name, pain }: Audience & { pain: ProgressInsights['pain'] }) {
  const locale = useLocale();
  const t = clientProgressMessages(locale).charts;
  const copy = progressCopy(viewer, name, locale);
  if (pain.state === 'off') return null;
  const before = pain.state === 'ok' ? pain.before : [];
  const peak = pain.state === 'ok' ? pain.peak : [];
  const series = [
    ...(before.length > 0 ? [{ key: 'before', label: t.painBefore, points: before }] : []),
    ...(peak.length > 0 ? [{ key: 'peak', label: t.painPeak, points: peak }] : []),
  ] as ProgressSeries[];
  const enough = before.length >= MIN_POINTS || peak.length >= MIN_POINTS;
  return (
    <ProgressCard viewer={viewer} title={t.pain} description={copy.painIntro}>
      {healthNote(pain, copy.unavailable(copy.painWhat)) ??
        (!enough || series.length === 0 ? (
          <Note>{t.painEmpty}</Note>
        ) : (
          <ProgressChart
            title={t.pain}
            unit={t.pointsUnit}
            series={series.length === 2 ? [series[0]!, series[1]!] : [series[0]!]}
            minSpan={4}
            pointNoun={t.workoutDayNoun}
          />
        ))}
      <p className="text-xs text-muted-foreground">{copy.painFootnote}</p>
    </ProgressCard>
  );
}

/** Seans zorluğu (CR-10): antrenman verisi, onaya bağlı değil. */
export function EffortCard({ viewer, name, rpe, today }: Audience & { rpe: ProgressInsights['rpe']; today: string }) {
  const locale = useLocale();
  const t = clientProgressMessages(locale).charts;
  const copy = progressCopy(viewer, name, locale);
  const recent = recentAverage(rpe, today);
  return (
    <ProgressCard viewer={viewer} title={t.effort} description={t.effortIntro}>
      {rpe.length < MIN_POINTS ? (
        <Note>{copy.effortEmpty}</Note>
      ) : (
        <>
          {recent ? (
            <p className="text-sm tabular-nums">
              {t.averageLead} <span className="font-medium">{getFormat(locale).number(recent.average)}</span> {t.effortTail(recent.count)}
            </p>
          ) : null}
          <ProgressChart
            title={t.effort}
            unit={t.pointsUnit}
            series={[{ key: 'value', label: t.effortLabel, points: rpe }]}
            minSpan={4}
            pointNoun={t.workoutDayNoun}
          />
        </>
      )}
    </ProgressCard>
  );
}

/** Su: son 30 gün, günde bardak; bugün sürüyor. */
export function WaterCard({ viewer, name, water, today }: Audience & { water: ProgressInsights['water']; today: string }) {
  const locale = useLocale();
  const t = clientProgressMessages(locale).charts;
  const f = getFormat(locale);
  const copy = progressCopy(viewer, name, locale);
  const days = water.state === 'ok' ? water.days : [];
  const summary = waterSummary(days);
  return (
    <ProgressCard viewer={viewer} title={t.water} description={copy.waterIntro}>
      {water.state === 'unavailable' ? (
        <Unavailable text={copy.unavailable(copy.waterWhat)} />
      ) : summary.recorded === 0 ? (
        <Note>{copy.waterEmpty}</Note>
      ) : (
        <>
          <p className="text-sm tabular-nums">
            {copy.waterDays(summary.recorded)} <span className="font-medium">{t.glasses(f.number(summary.average ?? 0), summary.average ?? 0)}</span>.
          </p>
          <ProgressBars
            title={t.dailyWater}
            unit={t.glassUnit}
            bars={days.map((day) => ({ date: day.date, value: day.glasses, partial: day.date === today }))}
            dateLabel={f.day}
            pointNoun={t.dayNoun}
            valueLabel={(value) => t.glasses(f.number(value), value)}
            yAxisWidth={24}
          />
        </>
      )}
    </ProgressCard>
  );
}
