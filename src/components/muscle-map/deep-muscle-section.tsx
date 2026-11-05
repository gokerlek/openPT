'use client';

import { useId } from 'react';
import { Plus } from '@/components/line-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useLocale, useMessages } from '@/i18n/client';
import { uiMessages } from '@/i18n/messages/ui';
import { deepMuscleLabels, DEEP_MUSCLE_MAX, deepMuscleNotes, DEEP_MUSCLES, deepMusclesByRegion, type DeepMuscle } from '@/lib/deep-muscles';
import { getFormat } from '@/lib/format';

/**
 * Kas bileşeninin "Derin kaslar" bölümü (haritanın altında; çizimi yok). Seçerken (`onToggle`) bütün derin kaslar bölge
 * başlıklarıyla çiptir, dokununca seçilir; en çok `DEEP_MUSCLE_MAX`. Gösterirken yalnız seçililer; hiç yoksa bölüm çizilmez.
 * Derin kasın kademesi yoktur ve hacme sayılmaz.
 */
export function DeepMuscleSection({ selected, onToggle }: { selected: readonly DeepMuscle[]; onToggle?: (muscle: DeepMuscle) => void }) {
  const id = useId();
  const locale = useLocale();
  const t = useMessages(uiMessages).muscleMap;
  const labels = deepMuscleLabels(locale);
  const notes = deepMuscleNotes(locale);
  const groups = deepMusclesByRegion(onToggle ? DEEP_MUSCLES : selected, locale);
  if (groups.length === 0) return null;
  const full = selected.length >= DEEP_MUSCLE_MAX;

  return (
    <section aria-labelledby={id} className="flex w-full flex-col gap-2 border-t pt-3 text-sm">
      <div className="flex flex-col gap-0.5">
        <h4 id={id} className="font-medium">
          {t.deepTitle}
        </h4>
        <p className="text-xs text-muted-foreground">{t.deepNote}</p>
      </div>
      {groups.map((group) => (
        <div key={group.region} className="flex flex-wrap items-center gap-1.5">
          <span className="w-28 shrink-0 text-xs text-muted-foreground">{group.label}</span>
          {group.muscles.map((muscle) => {
            if (!onToggle) {
              return (
                <Badge key={muscle} variant="outline" title={notes[muscle]}>
                  {labels[muscle]}
                </Badge>
              );
            }
            const on = selected.includes(muscle);
            return (
              <Button
                key={muscle}
                type="button"
                variant={on ? 'secondary' : 'outline'}
                size="xs"
                aria-pressed={on}
                disabled={!on && full}
                title={notes[muscle]}
                onClick={() => onToggle(muscle)}>
                {on ? null : <Plus data-icon="inline-start" />}
                {labels[muscle]}
              </Button>
            );
          })}
        </div>
      ))}
      {onToggle && full ? <p className="text-xs text-muted-foreground">{t.deepMax(getFormat(locale).number(DEEP_MUSCLE_MAX))}</p> : null}
    </section>
  );
}
