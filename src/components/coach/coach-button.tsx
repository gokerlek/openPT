'use client';
import { Sparkle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { openCoach, type CoachOpen } from './coach-launcher';

/** Bağlamlı AI koç girişi: paneli bu danışan/sekme bilgisiyle açar (sayfa, AI erişimi hazırsa çizer). */
export function CoachButton({ label, detail, variant = 'outline', className }: { label: string; detail: CoachOpen; variant?: 'outline' | 'ghost' | 'secondary'; className?: string }) {
  return <Button type="button" variant={variant} className={className} onClick={() => openCoach(detail)}>
    <Sparkle data-icon="inline-start" weight="fill" />
    {label}
  </Button>;
}
