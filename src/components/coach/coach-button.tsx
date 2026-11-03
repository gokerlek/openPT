'use client';
import { Sparkle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { openCoach, type CoachOpen } from './coach-launcher';

/**
 * Bağlamlı AI koç girişi: paneli bu danışan/sekme bilgisiyle açar (sayfa, AI erişimi hazırsa çizer). Aynı etiket
 * listede yinelenirse `srLabel` ekran okuyucuya kimin için olduğunu söyler (ör. `: Ada Yılmaz`).
 */
export function CoachButton({ label, srLabel, detail, variant = 'outline', size = 'default', className }: { label: string; srLabel?: string; detail: CoachOpen; variant?: 'outline' | 'ghost' | 'secondary'; size?: 'default' | 'sm'; className?: string }) {
  return <Button type="button" variant={variant} size={size} className={className} onClick={() => openCoach(detail)}>
    <Sparkle data-icon="inline-start" weight="fill" />
    {label}
    {srLabel ? <span className="sr-only">{srLabel}</span> : null}
  </Button>;
}
