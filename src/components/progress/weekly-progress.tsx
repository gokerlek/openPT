'use client';

import { useState } from 'react';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { MuscleMap } from '@/components/muscle-map/muscle-map';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/i18n/client';
import type { Locale } from '@/i18n/locale';
import { clientProgressMessages } from '@/i18n/messages/client-progress';
import { getFormat } from '@/lib/format';
import { BODY_MUSCLES, type BodyMuscle } from '@/lib/muscles';
import { loadMapProps } from '@/lib/muscle-tiers';
import type { WeekView } from '@/lib/progress';
import { progressCopy, weekLabel, type ProgressViewer } from '@/lib/progress-text';
import { muscleLabels } from '@/lib/schemas/exercise';
import { weeklySetBand } from '@/lib/template-plan';
import { ProgressCard } from './progress-card';

/**
 * Haftanın kas yükü haftalık kademeyle (10 set ve üstü dolu, 5–9,75 çizgili, 5 altı noktalı). Açıklamada her kasın yanında
 * SPEC §7.4 sözcüğü (az / yeterli / fazla); "fazla" haritada ayrı renk almaz, açıklamada ikon ve sözcükle yazılır.
 */
function WeekMuscles({ load, label, hint, locale }: { load: Record<string, number>; label: string; hint: string; locale: Locale }) {
  const t = clientProgressMessages(locale).cards;
  const labels = muscleLabels(locale);
  const rows = BODY_MUSCLES.map((muscle) => {
    const sets = load[muscle] ?? 0;
    const band = weeklySetBand(sets);
    return band === 'none'
      ? { key: muscle, label: labels[muscle], sets }
      : { key: muscle, label: labels[muscle], sets, note: t.bands[band], warn: band === 'high' };
  });
  const describe = (muscle: BodyMuscle) => {
    const sets = load[muscle] ?? 0;
    const band = weeklySetBand(sets);
    return t.muscleSets(labels[muscle], getFormat(locale).number(sets), sets, band === 'none' ? null : t.bands[band]);
  };

  return (
    <MuscleMap
      layout="split"
      bodyClassName="h-56"
      {...loadMapProps(load, 'weekly', label, { rows }, locale)}
      describe={describe}
      hint={hint}
    />
  );
}

/**
 * Haftalık kas yükü (tasarım §0): kas başına yapılan set (gerçekleşen yük; şablon haritasının hesabıyla,
 * hafta hafta geriye gidilir). Hafta pazartesi başlar. Haftalık toplam ağırlık ve set grafiği
 * `insight-charts.tsx`'te (Haftalık yük). Danışan ve PT aynı kartı kullanır (`viewer`).
 */
export function WeeklyProgress({ viewer, weeks }: { viewer: ProgressViewer; weeks: WeekView[] }) {
  const locale = useLocale();
  const t = clientProgressMessages(locale).cards;
  const copy = progressCopy(viewer, undefined, locale);
  const [index, setIndex] = useState(weeks.length - 1);
  const week = weeks[Math.min(index, weeks.length - 1)];
  if (!week) return null;
  const current = index >= weeks.length - 1;
  const range = weekLabel(week.weekStart, week.weekEnd, locale);
  const heading = current ? t.thisWeek : range;

  return (
    <ProgressCard viewer={viewer} title={t.muscles} description={copy.musclesIntro} contentClassName="gap-4">
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="icon"
          className="size-11 shrink-0"
          disabled={index <= 0}
          onClick={() => setIndex((value) => Math.max(0, value - 1))}
          aria-label={t.previousWeek}>
          <CaretLeft />
        </Button>
        <p className="flex min-w-0 flex-col items-center text-center" aria-live="polite">
          <span className="text-sm font-medium">{heading}</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {current ? `${range} · ` : ''}
            {t.weekLine(week.sessions, week.sets)}
            {week.volumeKg > 0 ? ` · ${getFormat(locale).kg(week.volumeKg)}` : ''}
          </span>
        </p>
        <Button
          variant="outline"
          size="icon"
          className="size-11 shrink-0"
          disabled={current}
          onClick={() => setIndex((value) => Math.min(weeks.length - 1, value + 1))}
          aria-label={t.nextWeek}>
          <CaretRight />
        </Button>
      </div>

      {week.sessions === 0 ? (
        <p className="rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
          {current ? t.noWorkoutThisWeek : t.noWorkoutThatWeek}
        </p>
      ) : (
        <WeekMuscles load={week.muscles} label={heading} hint={copy.musclesHint} locale={locale} />
      )}
      <p className="text-xs text-muted-foreground">{t.musclesNote}</p>
    </ProgressCard>
  );
}
