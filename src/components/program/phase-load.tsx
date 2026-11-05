'use client';

import { MuscleMap } from '@/components/muscle-map/muscle-map';
import { Progress, ProgressLabel } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLocale, useMessages } from '@/i18n/client';
import { programEditorMessages } from '@/i18n/messages/program-editor';
import { getFormat } from '@/lib/format';
import { loadMapProps } from '@/lib/muscle-tiers';
import type { LoadRow } from '@/lib/program-insights';
import { muscleLabels, type Muscle } from '@/lib/schemas/exercise';
import { weekdaysText } from '@/lib/training-days';

/** Program sayfasının haritaları haftalık ölçekte (10 set ve üstü dolu); "Bir tur" da. */
function WeekMap({ load, label }: { load: Record<string, number>; label: string }) {
  const locale = useLocale();
  return <MuscleMap layout="split" bodyClassName="h-56" {...loadMapProps(load, 'weekly', label, {}, locale)} />;
}

/**
 * Bu haftanın gerçekleşen yükü (`thisWeekLoad`): kas başına set, antrenman ve set sayısı, haftanın aralığı ve
 * planlanan haftalıkla karşılaştırma (`loadComparison`; sunucuda hesaplanır, sıklık yoksa null).
 */
export type DoneLoad = { load: Record<string, number>; sessions: number; sets: number; range: string; versus: LoadRow[] | null };

/**
 * Kas başına bu hafta yapılan set, planlanan haftalığın yanında: çubuk plana göre dolar, planı aşan kas dolu
 * kalır ve sayı yazar; planda olmayıp yapılan kas "planda yok".
 */
function LoadVersus({ rows }: { rows: readonly LoadRow[] }) {
  const locale = useLocale();
  const t = useMessages(programEditorMessages).phaseLoad;
  const format = getFormat(locale);
  if (rows.length === 0) return null;
  return (
    <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2" aria-label={t.versusAria}>
      {rows.map((row) => {
        const label = muscleLabels(locale)[row.muscle as Muscle] ?? row.muscle;
        const text = row.planned > 0 ? t.versusPlanned(format.number(row.done), format.number(row.planned), row.planned) : t.versusUnplanned(format.number(row.done), row.done);
        return (
          <li key={row.muscle}>
            <Progress value={row.planned > 0 ? Math.min(100, (row.done / row.planned) * 100) : 100} getAriaValueText={() => text} className="gap-1.5">
              <ProgressLabel className="min-w-0 font-normal text-muted-foreground [overflow-wrap:anywhere]">{label}</ProgressLabel>
              <span className="ml-auto text-sm tabular-nums">{text}</span>
            </Progress>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Evrenin (evresizde programın) kas yükü. Haftalık plan (varsayılan): evrede atama varsa her programın yükü × atandığı
 * gün sayısı (`assigned`: atanmış günler, Faz 3), yoksa sıklık varken bir tur × sıklık ÷ antrenman sayısı (ortalama;
 * dönüş yok). Bir tur: bütün antrenmanlar birer kez. `done` verilirse "Bu hafta" sekmesi: bu hafta yapılan setlerin
 * kas yükü (İlerleme sekmesiyle aynı hesap) ve haftalık planla yan yana, kas başına "yapılan / plan".
 */
export function PhaseLoad({
  cycle,
  weekly,
  factor,
  daysPerWeek,
  dayCount,
  assigned = [],
  label,
  done,
}: {
  cycle: Record<string, number>;
  weekly: Record<string, number> | null;
  factor: number | null;
  daysPerWeek?: number;
  dayCount: number;
  /** Evrenin atanmış günleri (`phaseMuscleLoad`); doluysa haftalık yük atamalardan. */
  assigned?: readonly number[];
  label: string;
  done?: DoneLoad | null;
}) {
  const locale = useLocale();
  const t = useMessages(programEditorMessages).phaseLoad;
  const format = getFormat(locale);
  const cycleCaption = t.cycleCaption(dayCount);
  const byAssignment = assigned.length > 0;
  const hasWeekly = Boolean(weekly && (byAssignment || (factor !== null && daysPerWeek !== undefined)));
  const weeklyCaption = byAssignment
    ? t.weeklyByAssignment(weekdaysText(assigned, locale))
    : t.weeklyByFrequency(daysPerWeek ?? 0, dayCount, format.number(factor ?? 0), factor ?? 0);
  // Haftalık görünümün yolu: programlara gün atamak ya da (atamasız evrede) haftalık sıklık. PT sayfalarında; PT metni
  // kişisiz (ürün beyaz etiket).
  const weeklyHint = t.weeklyHint;
  const doneTab = done ? (
    <TabsContent value="done" className="flex flex-col gap-4 pt-3">
      {done.sessions > 0 ? (
        <WeekMap load={done.load} label={t.doneAria(label)} />
      ) : (
        <p className="rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">{t.noneDone}</p>
      )}
      {hasWeekly && done.versus ? <LoadVersus rows={done.versus} /> : null}
      <p className="text-center text-xs text-muted-foreground">
        {t.doneSummary(done.range, done.sessions, done.sets, hasWeekly, weeklyHint)}
      </p>
    </TabsContent>
  ) : null;

  if (!hasWeekly || !weekly) {
    const cycleView = (
      <div className="flex flex-col gap-2">
        <WeekMap load={cycle} label={t.cycleAria(label)} />
        <p className="text-center text-xs text-muted-foreground">{t.cycleHint(cycleCaption, weeklyHint)}</p>
      </div>
    );
    if (!doneTab) return cycleView;
    return (
      <Tabs defaultValue="cycle">
        <TabsList variant="line" className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="cycle" className="flex-none">
            {t.tabCycle}
          </TabsTrigger>
          <TabsTrigger value="done" className="flex-none">
            {t.tabDone}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="cycle" className="pt-3">
          {cycleView}
        </TabsContent>
        {doneTab}
      </Tabs>
    );
  }
  return (
    <Tabs defaultValue="weekly">
      <TabsList variant="line" className="w-full justify-start overflow-x-auto">
        <TabsTrigger value="weekly" className="flex-none">
          {t.tabWeekly}
        </TabsTrigger>
        {doneTab ? (
          <TabsTrigger value="done" className="flex-none">
            {t.tabDone}
          </TabsTrigger>
        ) : null}
        <TabsTrigger value="cycle" className="flex-none">
          {t.tabCycle}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="weekly" className="flex flex-col gap-2 pt-3">
        <WeekMap load={weekly} label={t.weeklyAria(label)} />
        <p className="text-center text-xs text-muted-foreground">{t.weeklyFooter(weeklyCaption)}</p>
      </TabsContent>
      {doneTab}
      <TabsContent value="cycle" className="flex flex-col gap-2 pt-3">
        <WeekMap load={cycle} label={t.cycleAria(label)} />
        <p className="text-center text-xs text-muted-foreground">{cycleCaption}</p>
      </TabsContent>
    </Tabs>
  );
}
