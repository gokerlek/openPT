'use client';

import { useMemo, useRef, useState } from 'react';
import { CaretRight, Ruler, TrendDown, TrendUp } from '@phosphor-icons/react';
import { Equals } from '@/components/line-icons';
import { MuscleMap } from '@/components/muscle-map/muscle-map';
import { statusLegend, statusMarks, type MuscleStatusTone } from '@/lib/muscle-tiers';
import { ProgressChart } from '@/components/progress-chart';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useLocale } from '@/i18n/client';
import type { Locale } from '@/i18n/locale';
import { clientProgressMessages } from '@/i18n/messages/client-progress';
import { lower } from '@/i18n/text';
import { summarizeMuscles, type BodyMuscle } from '@/lib/muscles';
import {
  exerciseStrength,
  flatGroups,
  improvedGroups,
  measurementsFor,
  muscleGroups,
  muscleStrength,
  STRENGTH_WINDOW_KEYS,
  strengthWindows,
  type CircumferenceChange,
  type ExerciseStrength,
  type MuscleGroup,
  type StrengthSource,
  type StrengthStatus,
  type StrengthWindow,
} from '@/lib/muscle-progress';
import type { ProgressInsights } from '@/lib/progress-insights';
import {
  circumferenceText,
  formatChangePct,
  groupRoleText,
  metricMinSpan,
  metricsOf,
  progressCopy,
  strengthDetail,
  strengthStatusLabels,
  type ProgressViewer,
} from '@/lib/progress-text';
import { muscleLabels } from '@/lib/schemas/exercise';
import { cn } from '@/lib/utils';
import { ProgressCard, SubHeading } from './progress-card';
import { ProgressSheet, ProgressSheetContent } from './progress-sheet';

/** Listelerde önce bu kadar satır; gerisi "Tümünü göster". */
const LIST_LIMIT = 5;

const STATUS_ICONS = { improved: TrendUp, stable: Equals, declined: TrendDown, insufficient: Equals } as const;

const groupId = (group: Pick<MuscleGroup, 'muscles'>) => group.muscles.join(',');
const groupLabel = (group: Pick<MuscleGroup, 'muscles'>, locale: Locale) => summarizeMuscles(group.muscles, locale).join(', ');
const labelOf = (locale: Locale) => (muscle: string) => muscleLabels(locale)[muscle as BodyMuscle] ?? muscle;

function toneOf(group: Pick<MuscleGroup, 'status' | 'strong'>): MuscleStatusTone | undefined {
  if (group.status === 'improved') return group.strong ? 'strong' : 'improved';
  if (group.status === 'stable' || group.status === 'declined') return group.status;
  return undefined;
}

/** Kararın kısa metni: "Gelişti · +%12,4", sabitte değişim yazılmaz (aralık sıfırı kapsıyor). */
function verdictText(group: Pick<MuscleGroup, 'status' | 'changePct'>, locale: Locale): string {
  const label = strengthStatusLabels(locale)[group.status];
  if (group.status === 'stable') return clientProgressMessages(locale).strengthCard.verdictStable(label);
  return group.changePct === null || group.status === 'insufficient' ? label : `${label} · ${formatChangePct(group.changePct, locale)}`;
}

function StatusIcon({ status, className }: { status: StrengthStatus; className?: string }) {
  const Icon = STATUS_ICONS[status];
  return <Icon weight="bold" className={cn('size-4 shrink-0', status === 'improved' && 'text-primary-text', className)} aria-hidden />;
}

/**
 * Gelişim (SPEC §7.6): hangi kasta güç kazanıldı. Hareket başına en iyi değerlerin eğilimi (Theil–Sen)
 * ve ≈%80 aralığıyla karar; kaslar rol paylarıyla (`muscle-progress.ts`). Harita kararla boyanır
 * (belirgin gelişme tam ton, gelişme orta ton, sabit gri, gerileme desen ve kenar), altında "En çok
 * gelişen" ve "Durağan / geriyen" listeleri ikon ve sözcükle. Kasa (ya da satıra) dokununca sheet:
 * kasın hareketleri, küçük grafikleri, onaylıysa çevre ölçümü ve yöntemin kısa açıklaması. Hesap
 * tarayıcıda, dönem değişince yeniden; seçim adreste (`?donem=`).
 *
 * Danışan (`viewer="client"`, telefon) ve PT (`"pt"`, danışanın İlerleme sekmesi) aynı bileşeni kullanır;
 * metinler `progressCopy`'den. Kart geniş olunca (PT masaüstü, kap sorgusu) harita solda, sayılar ve
 * listeler sağda; danışanın dar sütununda alt alta.
 */
export function StrengthProgress({
  viewer,
  name,
  exercises,
  today,
  initialWindow,
  circumference,
}: {
  viewer: ProgressViewer;
  /** Danışanın adı (PT metinlerinde). */
  name?: string;
  exercises: readonly StrengthSource[];
  today: string;
  initialWindow: StrengthWindow;
  circumference: ProgressInsights['circumference'];
}) {
  const locale = useLocale();
  const t = clientProgressMessages(locale).strengthCard;
  const labels = muscleLabels(locale);
  const windows = strengthWindows(locale);
  const copy = progressCopy(viewer, name, locale);
  const [range, setRange] = useState<StrengthWindow>(initialWindow);
  // Açık grup ve (kapanış animasyonu bitene dek içerik boşalmasın diye) son açılan grup.
  const [openId, setOpenId] = useState<string | null>(null);
  const [shownId, setShownId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState<{ up: boolean; flat: boolean }>({ up: false, flat: false });
  // Haritadaki kas bir SVG `g`; Base UI odağı yalnız HTML öğesine geri verir, kapanınca açan kasa biz döndürürüz.
  const opener = useRef<Element | null>(null);

  const { strengths, groups } = useMemo(() => {
    const strengths = exercises.map((source) => exerciseStrength(source, { today, window: range }));
    return { strengths, groups: muscleGroups(muscleStrength(strengths)) };
  }, [exercises, today, range]);

  const byKey = useMemo(() => new Map(strengths.map((item) => [item.key, item])), [strengths]);
  const groupOf = useMemo(() => new Map(groups.flatMap((group) => group.muscles.map((muscle) => [muscle, group] as const))), [groups]);
  const statuses: Partial<Record<BodyMuscle, MuscleStatusTone>> = {};
  const counts: Partial<Record<BodyMuscle, number>> = {};
  for (const group of groups) {
    const tone = toneOf(group);
    for (const muscle of group.muscles) {
      if (muscle === 'cardio') continue;
      if (tone) statuses[muscle] = tone;
      counts[muscle] = group.contributors.length;
    }
  }

  const up = improvedGroups(groups);
  const flat = flatGroups(groups);
  const unknown = groups.filter((group) => group.status === 'insufficient');
  const decided = up.length + flat.length;
  const count = (list: readonly MuscleGroup[]) => list.reduce((sum, group) => sum + group.muscles.length, 0);
  const open = groups.find((group) => groupId(group) === openId) ?? null;
  const shown = groups.find((group) => groupId(group) === shownId) ?? null;
  // "Son 8 hafta" (başlık) ve "Son 8 haftada" (cümle içi).
  const { period, periodIn } = windows[range];

  function openGroup(group: MuscleGroup) {
    opener.current = document.activeElement;
    setOpenId(groupId(group));
    setShownId(groupId(group));
  }

  function sheetFinalFocus() {
    const element = opener.current;
    if (element instanceof SVGElement && element.isConnected) {
      element.focus({ preventScroll: true });
      return false;
    }
    return true; // Liste düğmeleri (HTML): Base UI'ın varsayılanı.
  }

  function pickWindow(next: StrengthWindow) {
    setRange(next);
    try {
      const url = new URL(globalThis.location.href);
      url.searchParams.set('donem', next);
      globalThis.history.replaceState(null, '', url);
    } catch {
      // Adres güncellenemezse seçim yine ekranda.
    }
  }

  if (groups.length === 0) return null;

  return (
    <ProgressCard viewer={viewer} title={t.title} titleId="gelisim" description={copy.strengthIntro} contentClassName="@container gap-5">
      <ToggleGroup
        variant="outline"
        spacing={0}
        value={[range]}
        onValueChange={(value) => {
          const next = value[0] as StrengthWindow | undefined;
          if (next) pickWindow(next);
        }}
        aria-label={t.period}
        className="w-full @3xl:max-w-md">
        {STRENGTH_WINDOW_KEYS.map((key) => (
          <ToggleGroupItem key={key} value={key} className="h-11 flex-1 px-1">
            {windows[key].label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {decided === 0 ? (
        <p className="rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">{copy.strengthNoData(periodIn)}</p>
      ) : (
        // Dar kapta alt alta (sayılar, harita, listeler); genişte harita solda iki satır boyu, sağda sayılar ve listeler.
        // Dar kapta da sütun açıkça `grid-cols-1` (minmax(0, 1fr)): kısaltılan hareket adları sütunu kabın dışına itmesin.
        <div className="grid grid-cols-1 gap-5 @3xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] @3xl:grid-rows-[auto_1fr] @3xl:gap-x-8">
          <dl className="grid grid-cols-3 divide-x text-center @3xl:col-start-2 @3xl:row-start-1" aria-label={t.statsLabel(period)}>
            {[
              { key: 'improved', value: count(up), label: t.statImproved },
              { key: 'stable', value: count(flat.filter((group) => group.status === 'stable')), label: t.statStable },
              { key: 'declined', value: count(flat.filter((group) => group.status === 'declined')), label: t.statDeclined },
            ].map((stat) => (
              <div key={stat.key} className="flex flex-col-reverse gap-0.5 px-1">
                <dt className="text-xs text-muted-foreground">{stat.label}</dt>
                <dd className="font-heading text-2xl font-semibold tabular-nums">{stat.value}</dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-col items-center gap-3 @3xl:col-start-1 @3xl:row-span-2 @3xl:row-start-1">
            <MuscleMap
              layout="split"
              marks={statusMarks(statuses)}
              legend={statusLegend(statuses)}
              counts={counts}
              selected={open?.muscles.filter((muscle): muscle is BodyMuscle => muscle !== 'cardio') ?? []}
              onToggle={(muscle) => {
                const group = groupOf.get(muscle);
                if (group) openGroup(group);
              }}
              describe={(muscle) => {
                const group = groupOf.get(muscle);
                return group ? `${labels[muscle]} · ${verdictText(group, locale)}` : t.untrained(labels[muscle]);
              }}
              labelOf={(muscle) => {
                const group = groupOf.get(muscle);
                return t.muscleButton(labels[muscle], group ? verdictText(group, locale) : null);
              }}
              hint={copy.strengthHint}
              bodyClassName="h-56 @3xl:h-72"
              label={t.mapLabel(periodIn, up.length > 0 ? summarizeMuscles(up.flatMap((group) => group.muscles), locale).join(', ') : null)}
            />
          </div>

          <div className="flex flex-col gap-5 @3xl:col-start-2 @3xl:row-start-2">
            <GroupList
              viewer={viewer}
              title={t.upTitle}
              empty={t.upEmpty(periodIn)}
              groups={up}
              expanded={showAll.up}
              onExpand={() => setShowAll((value) => ({ ...value, up: true }))}
              onOpen={openGroup}
            />
            <GroupList
              viewer={viewer}
              title={t.flatTitle}
              empty={t.flatEmpty(periodIn)}
              groups={flat}
              expanded={showAll.flat}
              onExpand={() => setShowAll((value) => ({ ...value, flat: true }))}
              onOpen={openGroup}
            />
          </div>
        </div>
      )}

      {unknown.length > 0 ? (
        <p className="text-xs text-muted-foreground">{t.unknown(summarizeMuscles(unknown.flatMap((group) => group.muscles), locale).join(', '))}</p>
      ) : null}
      <p className="text-xs text-muted-foreground">{copy.strengthFootnote}</p>

      <MuscleSheet
        viewer={viewer}
        open={open !== null}
        group={open ?? shown}
        byKey={byKey}
        period={period}
        circumference={circumference.state === 'ok' ? circumference.byWindow[range] : circumference.state}
        measurementsUnavailable={copy.measurementsUnavailable}
        methodNote={copy.methodNote}
        onOpenChange={(next) => (next ? undefined : setOpenId(null))}
        finalFocus={sheetFinalFocus}
      />
    </ProgressCard>
  );
}

function GroupList({
  viewer,
  title,
  empty,
  groups,
  expanded,
  onExpand,
  onOpen,
}: {
  viewer: ProgressViewer;
  title: string;
  empty: string;
  groups: readonly MuscleGroup[];
  expanded: boolean;
  onExpand: () => void;
  onOpen: (group: MuscleGroup) => void;
}) {
  const locale = useLocale();
  const t = clientProgressMessages(locale).strengthCard;
  const statusLabels = strengthStatusLabels(locale);
  const shown = expanded ? groups : groups.slice(0, LIST_LIMIT);
  return (
    <section className="flex flex-col gap-1" aria-label={title}>
      <SubHeading viewer={viewer} className="text-sm font-medium">
        {title}
      </SubHeading>
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {shown.map((group) => {
            const voting = group.contributors.filter((item) => item.status !== 'insufficient');
            const names = voting.slice(0, 3).map((item) => item.title);
            return (
              <li key={groupId(group)}>
                <button
                  type="button"
                  onClick={() => onOpen(group)}
                  aria-haspopup="dialog"
                  className="flex min-h-14 w-full items-center gap-3 py-2 text-left outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50">
                  <StatusIcon status={group.status} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-medium">{groupLabel(group, locale)}</span>
                      {group.strong ? <Badge variant="secondary">{t.strong}</Badge> : null}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {names.join(', ')}
                      {voting.length > names.length ? ` +${voting.length - names.length}` : ''}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end text-right">
                    <span className="text-sm font-medium tabular-nums">
                      {group.status === 'stable' || group.changePct === null ? statusLabels[group.status] : formatChangePct(group.changePct, locale)}
                    </span>
                    {group.status !== 'stable' ? <span className="text-xs text-muted-foreground">{statusLabels[group.status]}</span> : null}
                  </span>
                  <CaretRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {!expanded && groups.length > LIST_LIMIT ? (
        <Button variant="ghost" className="h-11 self-start px-2 text-sm" onClick={onExpand}>
          {t.showAll(groups.length)}
        </Button>
      ) : null}
    </section>
  );
}

function MuscleSheet({
  viewer,
  open,
  group: shown,
  byKey,
  period,
  circumference,
  measurementsUnavailable,
  methodNote,
  onOpenChange,
  finalFocus,
}: {
  viewer: ProgressViewer;
  open: boolean;
  group: MuscleGroup | null;
  byKey: ReadonlyMap<string, ExerciseStrength>;
  period: string;
  circumference: CircumferenceChange[] | 'off' | 'unavailable';
  measurementsUnavailable: string;
  methodNote: readonly string[];
  onOpenChange: (open: boolean) => void;
  finalFocus: () => boolean;
}) {
  const locale = useLocale();
  const t = clientProgressMessages(locale).strengthCard;
  const statusLabels = strengthStatusLabels(locale);
  const metricText = metricsOf(locale);
  const title = useRef<HTMLHeadingElement>(null);
  const related = shown ? measurementsFor(shown.muscles) : [];
  const changes = Array.isArray(circumference) ? circumference.filter((change) => related.includes(change.id)) : [];

  return (
    <ProgressSheet viewer={viewer} open={open} onOpenChange={onOpenChange}>
      <ProgressSheetContent initialFocus={title} finalFocus={finalFocus}>
        {shown ? (
          <>
            <SheetHeader className="gap-1 pt-5 pb-3 pr-14">
              <SheetTitle ref={title} tabIndex={-1} className="flex items-center gap-2 text-lg font-semibold outline-none">
                <StatusIcon status={shown.status} className="size-5" />
                {groupLabel(shown, locale)}
              </SheetTitle>
              <SheetDescription>{t.sheetDescription(period, lower(locale, verdictText(shown, locale)), shown.strong)}</SheetDescription>
            </SheetHeader>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 pb-6">
              {related.length > 0 && circumference !== 'off' ? (
                <section aria-label={t.circumference} className="flex gap-2.5 rounded-lg bg-muted px-3 py-2.5 text-sm">
                  <Ruler className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="flex flex-col gap-0.5">
                    {circumference === 'unavailable' ? (
                      <p className="text-muted-foreground">{measurementsUnavailable}</p>
                    ) : changes.length === 0 ? (
                      <p className="text-muted-foreground">{t.noCircumference}</p>
                    ) : (
                      <>
                        {changes.map((change) => (
                          <p key={`${change.id}-${change.key}`} className="tabular-nums">
                            {circumferenceText(change, locale)}
                          </p>
                        ))}
                        <p className="text-xs text-muted-foreground">{t.circumferenceNote}</p>
                      </>
                    )}
                  </div>
                </section>
              ) : null}

              <ul className="flex flex-col divide-y">
                {shown.contributors.map((contributor) => {
                  const exercise = byKey.get(contributor.key);
                  if (!exercise) return null;
                  const info = metricText[exercise.metric];
                  const chartTitle = `${exercise.title} · ${info.label}`;
                  return (
                    <li key={contributor.key} className="flex flex-col gap-2 py-3 first:pt-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 flex-col">
                          <span className="font-medium">
                            {exercise.title}
                            {exercise.deviceName ? <span className="font-normal text-muted-foreground"> · {exercise.deviceName}</span> : null}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {groupRoleText(contributor.roles, labelOf(locale), locale)} · {lower(locale, info.label)}
                          </span>
                        </div>
                        <span className="flex shrink-0 items-center gap-1.5 text-sm font-medium">
                          <StatusIcon status={exercise.status} />
                          {statusLabels[exercise.status]}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground tabular-nums">{strengthDetail(exercise, locale)}</p>
                      {exercise.points.length > 1 ? (
                        <ProgressChart
                          title={chartTitle}
                          unit={info.unit}
                          series={[{ key: 'value', label: info.label, points: exercise.points }]}
                          minSpan={metricMinSpan(exercise.metric, exercise.points.map((point) => point.value))}
                          pointNoun={t.workoutDayNoun}
                          chartClassName="h-36"
                        />
                      ) : null}
                    </li>
                  );
                })}
              </ul>

              <section aria-labelledby="gelisim-yontem" className="flex flex-col gap-1.5 rounded-lg border px-3 py-2.5 text-xs text-muted-foreground">
                <h3 id="gelisim-yontem" className="text-sm font-medium text-foreground">
                  {t.method}
                </h3>
                {methodNote.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </section>
            </div>
          </>
        ) : null}
      </ProgressSheetContent>
    </ProgressSheet>
  );
}
