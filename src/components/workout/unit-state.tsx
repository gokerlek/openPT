import { ArrowBendDownRightIcon, CheckCircleIcon, CircleIcon, PlayCircleIcon } from '@phosphor-icons/react/dist/ssr';
import type { ListState } from '@/lib/workout-flow';
import { cn } from '@/lib/utils';

/**
 * Antrenman listesinin birim durumu (tasarım Faz 2): ✓ bitti, ▶ şu an, ○ sırada, ⤼ atlandı. Antrenman ekranının listesi
 * ve Bugün'ün "Devam et" kartı aynı ikonu ve aynı ekran okuyucu sözcüğünü buradan alır.
 *
 * - İkon yalnız görsel (`aria-hidden`); durum satırda sr-only metinle söylenir (`UNIT_STATE_TEXT`).
 * - `dist/ssr` ikonları: sunucu ve istemcide aynı çalışır, uygulamanın `IconContext`'ini (dolu) görmez; kalınlıklar
 *   burada açıkça verilir. `Circle`'ın dolu sürümü dolu bir disk: boş halka `bold` (dolu ikonların yanında `regular`
 *   silik kalır, `line-icons.tsx` gibi).
 */

export const UNIT_STATE_TEXT: Record<ListState, string> = { done: 'bitti', current: 'şu an', pending: 'sırada', skipped: 'atlandı' };

/** Durum ikonu: varsayılan `size-5`, bitti ve şu an vurgu renginde, sırada ve atlandı soluk. `className` üstüne yazar. */
export function UnitStateIcon({ state, className }: { state: ListState; className?: string }) {
  const base = 'size-5 shrink-0';
  switch (state) {
    case 'done':
      return <CheckCircleIcon weight="fill" aria-hidden className={cn(base, 'text-primary', className)} />;
    case 'current':
      return <PlayCircleIcon weight="fill" aria-hidden className={cn(base, 'text-primary', className)} />;
    case 'pending':
      return <CircleIcon weight="bold" aria-hidden className={cn(base, 'text-muted-foreground', className)} />;
    case 'skipped':
      return <ArrowBendDownRightIcon weight="fill" aria-hidden className={cn(base, 'text-muted-foreground', className)} />;
  }
}
