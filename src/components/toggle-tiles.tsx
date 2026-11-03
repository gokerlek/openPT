'use client';

import { ImageSquare } from '@phosphor-icons/react';
import { Check, Plus } from '@/components/line-icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ToggleTile = {
  id: string;
  title: string;
  detail?: string;
  /** Küçük görsel: `undefined` görsel yeri yok, `null` yer var ama görsel yok (simge). */
  image?: string | null;
};

/**
 * Aç/kapa kutu ızgarası (egzersizin muadilleri, cihazın aparatları ortak): her kutu basılı/basılı değil düğmedir; açıkken
 * ✓ ve halka, kapalıyken +. `max` doluyken seçili olmayanlar kapanır.
 */
export function ToggleTiles({
  items,
  selected,
  onToggle,
  max,
}: {
  items: readonly ToggleTile[];
  selected: readonly string[];
  onToggle: (id: string) => void;
  max?: number;
}) {
  const full = max !== undefined && selected.length >= max;
  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => {
        const on = selected.includes(item.id);
        return (
          <li key={item.id}>
            <Button
              type="button"
              variant={on ? 'secondary' : 'outline'}
              aria-pressed={on}
              disabled={!on && full}
              className={cn('h-auto w-full justify-start gap-3 p-2 text-left', on && 'ring-2 ring-primary-text')}
              onClick={() => onToggle(item.id)}>
              {item.image !== undefined ? (
                <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background">
                  {item.image ? (
                    // Özel repo'dan uygulama üzerinden gelir; Next görsel iyileştiricisi oturum çerezini taşımaz.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.image} alt="" loading="lazy" className="size-full object-cover" />
                  ) : (
                    <ImageSquare className="size-5 text-muted-foreground" />
                  )}
                </span>
              ) : null}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-normal">{item.title}</span>
                {item.detail ? <span className="block truncate text-xs font-normal text-muted-foreground">{item.detail}</span> : null}
              </span>
              {on ? <Check className="text-primary-text" /> : <Plus className="text-muted-foreground" />}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
