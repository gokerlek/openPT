'use client';

import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { CaretDown, MagnifyingGlass } from '@phosphor-icons/react';
import { Check } from '@/components/line-icons';
import { ProgressChart } from '@/components/progress-chart';
import { Badge } from '@/components/ui/badge';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item';
import { SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useLocale } from '@/i18n/client';
import type { Locale } from '@/i18n/locale';
import { clientProgressMessages } from '@/i18n/messages/client-progress';
import { fold } from '@/lib/exercise-search';
import { getFormat } from '@/lib/format';
import type { RecordMark } from '@/lib/personal-records';
import type { ExerciseView } from '@/lib/progress';
import {
  describeTrend,
  highRepDaysSince,
  METRICS_OF,
  metricForecast,
  metricMinSpan,
  metricPoints,
  metricsOf,
  progressCopy,
  recordLabel,
  recordValue,
  type Metric,
  type ProgressCopy,
  type ProgressViewer,
} from '@/lib/progress-text';
import { forecastAsOf, rangeStart, type RangePreset } from '@/lib/trend';
import { cn } from '@/lib/utils';
import { ProgressCard, SubHeading } from './progress-card';
import { ProgressSheet, ProgressSheetContent } from './progress-sheet';

/** Grafiğin tarih aralıkları; 375 px'te tek satıra sığan kısa adlar sözlükte. */
const RANGES = ['3a', '6a', '1y', 'tumu'] as const satisfies readonly RangePreset[];
type Range = (typeof RANGES)[number];

/** Bir aralıkta en az bu kadar gün yoksa varsayılan "Tümü". */
const MIN_POINTS_IN_RANGE = 2;

/** Ağırlığa göre en çok tekrarın en çok bu kadar satırı (en ağırdan). */
const REPS_AT_WEIGHT_ROWS = 4;

function subtitle(exercise: ExerciseView, today: string, locale: Locale): string {
  const t = clientProgressMessages(locale).exercise;
  const parts = [
    exercise.deviceName ?? null,
    t.workouts(exercise.sessions),
    t.last(getFormat(locale).dayShort(exercise.lastDate, exercise.lastDate.slice(0, 4) !== today.slice(0, 4))),
    exercise.inLibrary ? null : t.notInLibrary,
  ];
  return parts.filter(Boolean).join(' · ');
}

/** Aralıklar yalnız seri 3 aydan eskiye uzanıyorsa; bir aralık ancak öncekinden fazlasını gösteriyorsa. */
function rangesFor(exercise: ExerciseView, today: string): Range[] {
  const useful = RANGES.filter((range) => {
    const from = rangeStart(range, today);
    return from === undefined || exercise.firstDate < from;
  });
  return useful.length > 1 ? useful : [];
}

function defaultRange(exercise: ExerciseView, today: string): Range {
  const from = rangeStart('3a', today);
  const inRange = exercise.points.filter((point) => !from || point.date >= from).length;
  return rangesFor(exercise, today).includes('3a') && inRange >= MIN_POINTS_IN_RANGE ? '3a' : 'tumu';
}

/**
 * Hareket başına ilerleme (tasarım §0, §8 satır 10): yapılan hareketlerden biri seçilir (aranabilir
 * liste, en son yapılan önce), altında kayıt türüne göre grafik — ağırlıklıda en ağır set, tahmini
 * maksimum ve toplam ağırlık; vücut ağırlığında tekrar; sürelide süre. Grafik ölçümlerinkiyle aynı
 * bileşen (dokununca değer, "tablo olarak göster"); ilerleme değerlerinde eğilim ve tahmin (Theil–Sen).
 * Altında o hareketin rekorları. Seçim adreste (`?hareket=`): sayfa yenilenince aynı hareket açılır.
 *
 * Danışan ve PT aynı bileşeni kullanır (`viewer`); kart geniş olunca (PT masaüstü, kap sorgusu) rekorlar
 * grafiğin sağında.
 */
export function ExerciseProgress({
  viewer,
  exercises,
  initialKey,
  today,
}: {
  viewer: ProgressViewer;
  exercises: ExerciseView[];
  initialKey: string | null;
  today: string;
}) {
  const locale = useLocale();
  const t = clientProgressMessages(locale).exercise;
  const f = getFormat(locale);
  const copy = progressCopy(viewer, undefined, locale);
  const metricText = metricsOf(locale);
  const [key, setKey] = useState(() => (exercises.some((item) => item.key === initialKey) ? initialKey! : (exercises[0]?.key ?? '')));
  const exercise = exercises.find((item) => item.key === key) ?? exercises[0];
  const [metric, setMetric] = useState<Metric>(() => METRICS_OF[exercise?.trackingType ?? 'weight_reps'][0]!);
  const [range, setRange] = useState<Range>(() => (exercise ? defaultRange(exercise, today) : 'tumu'));
  const [open, setOpen] = useState(false);

  if (!exercise) return null;
  const metrics = METRICS_OF[exercise.trackingType];
  const shown: Metric = metrics.includes(metric) ? metric : metrics[0]!;
  const ranges = rangesFor(exercise, today);
  const activeRange: Range = ranges.includes(range) ? range : 'tumu';

  function pick(next: ExerciseView) {
    setKey(next.key);
    setRange(defaultRange(next, today));
    if (!METRICS_OF[next.trackingType].includes(metric)) setMetric(METRICS_OF[next.trackingType][0]!);
    setOpen(false);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('hareket', next.key);
      window.history.replaceState(null, '', url);
    } catch {
      // Adres güncellenemezse seçim yine ekranda.
    }
  }

  const from = rangeStart(activeRange, today);
  const points = metricPoints(exercise.points, shown).filter((point) => !from || point.date >= from);
  const info = metricText[shown];
  const outlook = points.length > 1 ? metricForecast(shown, points) : null;
  const drawn = outlook ? forecastAsOf(outlook, today) : null;
  // Son günlerin bütün setleri 12'den çok tekrarlıysa grafik orada biter: "son kayıt … gün önce" yanıltır.
  const highRep = shown === 'e1rm' && points.length > 0 ? highRepDaysSince(exercise.points, from) : 0;
  const title = `${exercise.title} · ${info.label}`;

  return (
    <ProgressCard viewer={viewer} title={t.title} titleId="hareketler" description={copy.exerciseIntro} contentClassName="@container">
      <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] @3xl:gap-x-8">
        <div className="flex min-w-0 flex-col gap-4">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            className="flex min-h-14 w-full items-center gap-3 rounded-lg border border-input bg-transparent px-3 py-2 text-left outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-base font-medium">{exercise.title}</span>
              <span className="truncate text-xs text-muted-foreground">{subtitle(exercise, today, locale)}</span>
            </span>
            <CaretDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="sr-only">{t.change}</span>
          </button>

          {exercise.stage ? (
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="secondary">{exercise.stage}</Badge>
              <span>{copy.stageNote}</span>
            </p>
          ) : null}

          {metrics.length > 1 ? (
            <ToggleGroup
              variant="outline"
              spacing={0}
              value={[shown]}
              onValueChange={(value) => {
                const next = value[0] as Metric | undefined;
                if (next) setMetric(next);
              }}
              aria-label={t.chartPick}
              className="w-full">
              {metrics.map((item) => (
                <ToggleGroupItem key={item} value={item} className="h-10 flex-1" aria-label={metricText[item].label}>
                  {metricText[item].short}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          ) : null}

          <section aria-label={title} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <SubHeading viewer={viewer} className="text-sm font-medium">
                {info.label}
              </SubHeading>
              {ranges.length > 0 ? (
                <ToggleGroup
                  size="sm"
                  spacing={2}
                  value={[activeRange]}
                  onValueChange={(value) => {
                    const next = value[0] as Range | undefined;
                    if (next) setRange(next);
                  }}
                  aria-label={t.range}>
                  {RANGES.filter((item) => ranges.includes(item)).map((item) => (
                    <ToggleGroupItem key={item} value={item} className="px-2">
                      {t.ranges[item]}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              ) : null}
            </div>

            {points.length > 1 ? (
              <ProgressChart
                title={title}
                unit={info.unit}
                series={[{ key: 'value', label: info.label, points }]}
                minSpan={metricMinSpan(shown, points.map((point) => point.value))}
                forecast={drawn?.kind === 'current' ? drawn.forecast.points : undefined}
                pointNoun={t.workoutDayNoun}
                yAxisWidth={shown === 'volume' ? 48 : 40}
              />
            ) : points.length === 1 ? (
              <p className="rounded-lg bg-muted px-3 py-2.5 text-sm">
                {t.first} <span className="font-medium tabular-nums">{f.withUnit(points[0]!.value, info.unit)}</span>{' '}
                {t.firstTail(f.day(points[0]!.date))}
              </p>
            ) : (
              <p className="rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
                {shown === 'e1rm' ? t.noE1rm : t.noValue}
              </p>
            )}
            {highRep > 0 ? <p className="text-sm text-muted-foreground">{copy.highRepDays(highRep)}</p> : null}
            {outlook && !(highRep > 0 && drawn?.kind === 'stale') ? (
              <p className="text-sm text-muted-foreground">{describeTrend(outlook, info.unit, today, locale)}</p>
            ) : null}
            {shown === 'e1rm' ? <p className="text-xs text-muted-foreground">{copy.e1rmNote}</p> : null}
            {shown === 'volume' ? (
              <p className="text-xs text-muted-foreground">{t.volumeNote}</p>
            ) : null}
          </section>
        </div>

        <ExerciseRecords viewer={viewer} copy={copy} exercise={exercise} />
      </div>

      <ExercisePicker
        viewer={viewer}
        copy={copy}
        open={open}
        onOpenChange={setOpen}
        exercises={exercises}
        selected={exercise.key}
        today={today}
        onPick={pick}
      />
    </ProgressCard>
  );
}

/** Seçili hareketin en iyileri: tür başına bir satır; ağırlıkta tekrarda en ağır birkaç ağırlık. */
function ExerciseRecords({ viewer, copy, exercise }: { viewer: ProgressViewer; copy: ProgressCopy; exercise: ExerciseView }) {
  const locale = useLocale();
  const t = clientProgressMessages(locale).exercise;
  const singles = exercise.best.filter((mark) => mark.kind !== 'reps_at_weight');
  const atWeight = exercise.best.filter((mark) => mark.kind === 'reps_at_weight').slice(0, REPS_AT_WEIGHT_ROWS);
  // Hareket başına bir kutlama: aynı antrenmandaki rekorlar bir sayılır.
  const broken = new Set(exercise.events.map((event) => event.sessionId)).size;
  return (
    <section
      aria-labelledby="hareket-rekorlari"
      className="flex min-w-0 flex-col gap-2 border-t pt-4 @3xl:self-start @3xl:border-t-0 @3xl:border-l @3xl:pt-0 @3xl:pl-6">
      <div className="flex items-baseline justify-between gap-3">
        <SubHeading viewer={viewer} id="hareket-rekorlari" className="text-sm font-medium">
          {copy.bestTitle}
        </SubHeading>
        <span className="text-xs text-muted-foreground">{broken > 0 ? copy.recordSessions(broken) : t.firstIsStart}</span>
      </div>
      <dl className="flex flex-col divide-y">
        {singles.map((mark) => (
          <RecordRow key={mark.kind} label={recordLabel(mark.kind, exercise.trackingType, locale)} mark={mark} locale={locale} />
        ))}
        {atWeight.length > 0 ? (
          <div className="flex flex-col gap-1 py-2">
            <dt className="text-xs text-muted-foreground">{recordLabel('reps_at_weight', exercise.trackingType, locale)}</dt>
            <dd>
              <ul className="flex flex-col gap-1">
                {atWeight.map((mark) => (
                  <li key={mark.kg} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium tabular-nums">{recordValue(mark, locale)}</span>
                    <span className="text-xs text-muted-foreground">{getFormat(locale).dayShort(mark.date)}</span>
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

function RecordRow({ label, mark, locale }: { label: string; mark: RecordMark; locale: Locale }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="flex flex-col items-end text-right">
        <span className="text-sm font-medium tabular-nums">{recordValue(mark, locale)}</span>
        <span className="text-xs text-muted-foreground">{getFormat(locale).day(mark.date)}</span>
      </dd>
    </div>
  );
}

/**
 * Hareket seçici: yapılan hareketler, ada (ve cihaza) göre arama; Türkçe harfler katlanır ("gogus" →
 * "Göğüs"). Sıra en son yapılan önce. Seçili satırda ✓.
 */
function ExercisePicker({
  viewer,
  copy,
  open,
  onOpenChange,
  exercises,
  selected,
  today,
  onPick,
}: {
  viewer: ProgressViewer;
  copy: ProgressCopy;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exercises: ExerciseView[];
  selected: string;
  today: string;
  onPick: (exercise: ExerciseView) => void;
}) {
  const locale = useLocale();
  const t = clientProgressMessages(locale).exercise;
  const title = useRef<HTMLHeadingElement>(null);
  const [search, setSearch] = useState('');
  const deferred = useDeferredValue(search);
  const results = useMemo(() => {
    const tokens = fold(deferred).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return exercises;
    return exercises.filter((item) => {
      const text = fold(`${item.title} ${item.deviceName ?? ''}`);
      return tokens.every((token) => text.includes(token));
    });
  }, [exercises, deferred]);

  return (
    <ProgressSheet viewer={viewer} open={open} onOpenChange={onOpenChange} onOpenChangeComplete={(next) => (next ? undefined : setSearch(''))}>
      <ProgressSheetContent showCloseButton={false} initialFocus={title}>
        <SheetHeader className="gap-1 pt-5 pb-3">
          <SheetTitle ref={title} tabIndex={-1} className="text-lg font-semibold outline-none">
            {t.pick}
          </SheetTitle>
          <SheetDescription>{copy.pickerDescription}</SheetDescription>
          <InputGroup className="mt-2 h-11">
            <InputGroupAddon>
              <MagnifyingGlass />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              className="h-11 text-base"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.preventDefault();
              }}
              placeholder={t.search}
              aria-label={t.search}
              autoComplete="off"
              enterKeyHint="search"
            />
          </InputGroup>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
          {results.length === 0 ? (
            <Empty className="border-0 p-4">
              <EmptyHeader>
                <EmptyTitle>{t.noResults}</EmptyTitle>
                <EmptyDescription>{t.tryAnother}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div role="list" aria-label={copy.pickerList}>
              {results.map((item) => {
                const current = item.key === selected;
                return (
                  <div role="listitem" key={item.key}>
                    <Item
                      size="sm"
                      className="min-h-14 flex-nowrap rounded-none border-0 border-t border-border px-0 text-left hover:bg-muted"
                      render={<button type="button" aria-current={current ? 'true' : undefined} onClick={() => onPick(item)} />}>
                      <ItemContent className="min-w-0">
                        <ItemTitle className={cn('w-full truncate text-[0.9375rem]', current && 'text-primary-text')}>{item.title}</ItemTitle>
                        <ItemDescription className="truncate text-[0.8125rem]">{subtitle(item, today, locale)}</ItemDescription>
                      </ItemContent>
                      <ItemActions className="text-primary-text">
                        {current ? (
                          <>
                            <Check weight="bold" className="size-4" aria-hidden />
                            <span className="sr-only">{t.selected}</span>
                          </>
                        ) : null}
                      </ItemActions>
                    </Item>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </ProgressSheetContent>
    </ProgressSheet>
  );
}
