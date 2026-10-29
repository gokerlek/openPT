'use client';

import { ResponsiveSheet, ResponsiveSheetContent, useResponsiveSheetBottom } from '@/components/ui/responsive-sheet';
import { useMediaQuery } from '@/hooks/use-media-query';
import type { ProgressViewer } from '@/lib/progress-text';
import { cn } from '@/lib/utils';

/** Alttan açılan, ekran boyu çekmece (antrenman ekranının kütüphanesiyle aynı; köşe ve güvenli alan Drawer'da). */
const TALL_SHEET = 'h-[calc(100dvh-max(1rem,env(safe-area-inset-top)))] gap-0';

/** PT'nin geniş ekranında sağdan açılan sheet. */
const SIDE_SHEET = 'gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-lg';

/**
 * İlerleme sheet'lerinin (kasın hareketleri, hareket seçici) kökü. Danışanda her zaman alttan çekmece (danışan
 * yalnız telefon kullanır); PT'de ≥40rem sağdan sheet, telefonda alttan çekmece (şablon düzenleyicinin kütüphane
 * sheet'iyle aynı kural). Kök de değişir: alttayken Drawer, yandayken Sheet.
 */
export function ProgressSheet({
  viewer,
  ...props
}: Omit<React.ComponentProps<typeof ResponsiveSheet>, 'bottom'> & { viewer: ProgressViewer }) {
  const wide = useMediaQuery('(min-width: 40rem)');
  return <ResponsiveSheet bottom={!(viewer === 'pt' && wide)} {...props} />;
}

/** İlerleme sheet'inin kabı; konumu `ProgressSheet`ten alır. */
export function ProgressSheetContent({ className, ...props }: React.ComponentProps<typeof ResponsiveSheetContent>) {
  const bottom = useResponsiveSheetBottom();
  return <ResponsiveSheetContent className={cn(bottom ? TALL_SHEET : SIDE_SHEET, className)} {...props} />;
}
