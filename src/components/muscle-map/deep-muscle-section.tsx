'use client';

import { useId } from 'react';
import { Plus } from '@/components/line-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DEEP_MUSCLE_LABELS, DEEP_MUSCLE_MAX, DEEP_MUSCLE_NOTES, DEEP_MUSCLES, deepMusclesByRegion, type DeepMuscle } from '@/lib/deep-muscles';

/**
 * Kas bileşeninin "Derin kaslar" bölümü (haritanın altında; çizimi yok). Seçerken (`onToggle`) bütün derin kaslar bölge
 * başlıklarıyla çiptir, dokununca seçilir; en çok `DEEP_MUSCLE_MAX`. Gösterirken yalnız seçililer; hiç yoksa bölüm çizilmez.
 * Derin kasın kademesi yoktur ve hacme sayılmaz.
 */
export function DeepMuscleSection({ selected, onToggle }: { selected: readonly DeepMuscle[]; onToggle?: (muscle: DeepMuscle) => void }) {
  const id = useId();
  const groups = deepMusclesByRegion(onToggle ? DEEP_MUSCLES : selected);
  if (groups.length === 0) return null;
  const full = selected.length >= DEEP_MUSCLE_MAX;

  return (
    <section aria-labelledby={id} className="flex w-full flex-col gap-2 border-t pt-3 text-sm">
      <div className="flex flex-col gap-0.5">
        <h4 id={id} className="font-medium">
          Derin kaslar
        </h4>
        <p className="text-xs text-muted-foreground">Derin kaslar kademe almaz, hacme sayılmaz.</p>
      </div>
      {groups.map((group) => (
        <div key={group.region} className="flex flex-wrap items-center gap-1.5">
          <span className="w-28 shrink-0 text-xs text-muted-foreground">{group.label}</span>
          {group.muscles.map((muscle) => {
            if (!onToggle) {
              return (
                <Badge key={muscle} variant="outline" title={DEEP_MUSCLE_NOTES[muscle]}>
                  {DEEP_MUSCLE_LABELS[muscle]}
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
                title={DEEP_MUSCLE_NOTES[muscle]}
                onClick={() => onToggle(muscle)}>
                {on ? null : <Plus data-icon="inline-start" />}
                {DEEP_MUSCLE_LABELS[muscle]}
              </Button>
            );
          })}
        </div>
      ))}
      {onToggle && full ? <p className="text-xs text-muted-foreground">En çok {DEEP_MUSCLE_MAX} derin kas seçilir.</p> : null}
    </section>
  );
}
