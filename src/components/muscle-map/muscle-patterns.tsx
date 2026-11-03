'use client';

import { useId } from 'react';
import type { MuscleMark } from '@/lib/muscle-tiers';
import { cn } from '@/lib/utils';

/**
 * Kas haritasının desen dili (her yerde aynı): dolu = hedef rengi; çizgili ve noktalı = boş kas zemininde hedef renginde çizgi
 * ve nokta; gerileme = boş kas zemininde uyarı renginde ters çizgi (kenarı da uyarı renginde, `MARK_STROKE`). Opaklık yok:
 * kademe desenle ayrılır, renk körlüğünde de okunur.
 */

/** Desen kimliği `url(#…)` içinde güvenle kullanılabilsin. */
export function usePatternId() {
  return `mm${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

/** Desen karosu (SVG kullanıcı birimi). */
const TILE = 1.5;

export function MusclePatterns({ id }: { id: string }) {
  const none = { stroke: 'none' } as const;
  return (
    <defs>
      <pattern id={`${id}-striped`} patternUnits="userSpaceOnUse" width={TILE} height={TILE} patternTransform="rotate(45)">
        <rect width={TILE} height={TILE} style={{ ...none, fill: 'var(--muscle-empty)' }} />
        <rect width={TILE * 0.45} height={TILE} style={{ ...none, fill: 'var(--muscle-target)' }} />
      </pattern>
      <pattern id={`${id}-dotted`} patternUnits="userSpaceOnUse" width={TILE} height={TILE}>
        <rect width={TILE} height={TILE} style={{ ...none, fill: 'var(--muscle-empty)' }} />
        <circle cx={TILE / 2} cy={TILE / 2} r={TILE * 0.26} style={{ ...none, fill: 'var(--muscle-target)' }} />
      </pattern>
      {/* Gerileme: ters yönde çizgi, yardımcının çizgisiyle karışmasın. */}
      <pattern id={`${id}-declined`} patternUnits="userSpaceOnUse" width={TILE} height={TILE} patternTransform="rotate(-45)">
        <rect width={TILE} height={TILE} style={{ ...none, fill: 'var(--muscle-empty)' }} />
        <rect width={TILE * 0.35} height={TILE} style={{ ...none, fill: 'var(--destructive)' }} />
      </pattern>
    </defs>
  );
}

export function markFill(mark: MuscleMark, patternId: string): string {
  return mark === 'filled' ? 'var(--muscle-target)' : `url(#${patternId}-${mark})`;
}

/** Gerilemenin kalın kenarı (kas grubunda). */
export const DECLINED_STROKE = 'stroke-[var(--destructive)] [stroke-width:0.22]';

/** Açıklama kutusundaki örnek: haritadaki dolgunun ve desenin aynısı. `empty` boş kas. */
export function MuscleSwatch({ mark, className }: { mark: MuscleMark | 'empty'; className?: string }) {
  const id = usePatternId();
  return (
    <svg viewBox="0 0 3 3" className={cn('size-3.5 shrink-0 rounded-[3px]', className)} aria-hidden>
      <MusclePatterns id={id} />
      <rect
        width={3}
        height={3}
        style={{ fill: mark === 'empty' ? 'var(--muscle-empty)' : markFill(mark, id) }}
        className={mark === 'declined' ? 'stroke-[var(--destructive)] [stroke-width:0.5]' : undefined}
      />
    </svg>
  );
}
