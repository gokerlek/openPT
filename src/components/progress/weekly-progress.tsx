'use client';

import { useState } from 'react';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { MuscleMap } from '@/components/muscle-map/muscle-map';
import { Button } from '@/components/ui/button';
import { formatKg, formatNumber } from '@/lib/format';
import { BODY_MUSCLES, type BodyMuscle } from '@/lib/muscles';
import { loadMapProps } from '@/lib/muscle-tiers';
import type { WeekView } from '@/lib/progress';
import { progressCopy, weekLabel, type ProgressViewer } from '@/lib/progress-text';
import { MUSCLE_LABELS } from '@/lib/schemas/exercise';
import { weeklySetBand, type WeeklySetBand } from '@/lib/template-plan';
import { ProgressCard } from './progress-card';

const BAND_LABELS: Record<Exclude<WeeklySetBand, 'none'>, string> = { low: 'az', enough: 'yeterli', high: 'fazla' };

/**
 * Haftanın kas yükü haftalık kademeyle (10 set ve üstü dolu, 5–9,75 çizgili, 5 altı noktalı). Açıklamada her kasın yanında
 * SPEC §7.4 sözcüğü (az / yeterli / fazla); "fazla" haritada ayrı renk almaz, açıklamada ikon ve sözcükle yazılır.
 */
function WeekMuscles({ load, label, hint }: { load: Record<string, number>; label: string; hint: string }) {
  const rows = BODY_MUSCLES.map((muscle) => {
    const sets = load[muscle] ?? 0;
    const band = weeklySetBand(sets);
    return band === 'none'
      ? { key: muscle, label: MUSCLE_LABELS[muscle], sets }
      : { key: muscle, label: MUSCLE_LABELS[muscle], sets, note: BAND_LABELS[band], warn: band === 'high' };
  });
  const describe = (muscle: BodyMuscle) => {
    const sets = load[muscle] ?? 0;
    const band = weeklySetBand(sets);
    return `${MUSCLE_LABELS[muscle]} · ${formatNumber(sets)} set${band === 'none' ? '' : ` · ${BAND_LABELS[band]}`}`;
  };

  return (
    <MuscleMap layout="split" bodyClassName="h-56" {...loadMapProps(load, 'weekly', label, { rows })} describe={describe} hint={hint} />
  );
}

/**
 * Haftalık kas yükü (tasarım §0): kas başına yapılan set (gerçekleşen yük; şablon haritasının hesabıyla,
 * hafta hafta geriye gidilir). Hafta pazartesi başlar. Haftalık toplam ağırlık ve set grafiği
 * `insight-charts.tsx`'te (Haftalık yük). Danışan ve PT aynı kartı kullanır (`viewer`).
 */
export function WeeklyProgress({ viewer, weeks }: { viewer: ProgressViewer; weeks: WeekView[] }) {
  const copy = progressCopy(viewer);
  const [index, setIndex] = useState(weeks.length - 1);
  const week = weeks[Math.min(index, weeks.length - 1)];
  if (!week) return null;
  const current = index >= weeks.length - 1;
  const range = weekLabel(week.weekStart, week.weekEnd);
  const heading = current ? 'Bu hafta' : range;

  return (
    <ProgressCard viewer={viewer} title="Kaslar" description={copy.musclesIntro} contentClassName="gap-4">
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="icon"
          className="size-11 shrink-0"
          disabled={index <= 0}
          onClick={() => setIndex((value) => Math.max(0, value - 1))}
          aria-label="Önceki hafta">
          <CaretLeft />
        </Button>
        <p className="flex min-w-0 flex-col items-center text-center" aria-live="polite">
          <span className="text-sm font-medium">{heading}</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {current ? `${range} · ` : ''}
            {week.sessions} antrenman · {week.sets} set
            {week.volumeKg > 0 ? ` · ${formatKg(week.volumeKg)}` : ''}
          </span>
        </p>
        <Button
          variant="outline"
          size="icon"
          className="size-11 shrink-0"
          disabled={current}
          onClick={() => setIndex((value) => Math.min(weeks.length - 1, value + 1))}
          aria-label="Sonraki hafta">
          <CaretRight />
        </Button>
      </div>

      {week.sessions === 0 ? (
        <p className="rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
          {current ? 'Bu hafta henüz antrenman yok.' : 'Bu hafta antrenman yok.'}
        </p>
      ) : (
        <WeekMuscles load={week.muscles} label={heading} hint={copy.musclesHint} />
      )}
      <p className="text-xs text-muted-foreground">
        Bir set hedef kasa 1, yardımcı kasa 0,5, dengeleyici kasa 0,25 sayılır; ısınma hareketleri sayılmaz. Kas başına haftada
        10–20 set yeterli aralıktır: altı az, üstü fazla.
      </p>
    </ProgressCard>
  );
}
