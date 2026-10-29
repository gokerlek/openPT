'use client';

import { usePathname } from 'next/navigation';
import { FirstAidKit, House, Notebook } from '@phosphor-icons/react';
import { Dock } from '@/components/dock/dock';
import { ChartLineUp } from '@/components/line-icons';
import { CLIENT_TABS, clientTabIndex } from '@/lib/client-tabs';

/** Sekmelerin ikonları (Phosphor, tasarım §0); sıra ve adlar `client-tabs.ts`'te. */
const ICONS: Record<(typeof CLIENT_TABS)[number]['href'], React.ReactNode> = {
  '/me': <House />,
  '/me/programlar': <Notebook />,
  '/me/ilerleme': <ChartLineUp />,
  '/me/saglik': <FirstAidKit />,
};

/**
 * Danışan gezinmesi: PT'ninkiyle aynı dock (`components/dock/dock.tsx`, `dashboard/nav.tsx`), yalnız
 * telefon: ikonun altında kısa etiket, öğe ≥ 44 px, altta güvenli alan. Sekmeler Bugün · Program ·
 * İlerleme · Sağlık; Geçmiş İlerleme'nin içinde. Sağlık yalnız kısıt ya da tarama onaylıyken (`health`,
 * tasarım `kisit-tarama.md` §5.2) görünür; gizliyken öteki sekmelerin sırası değişmez (etkin öğe
 * `CLIENT_TABS`'taki sırayla eşleşir). Ayarlar ve çıkış dock'ta değil, sağ üstteki avatar menüsünde
 * (`client-menu.tsx`); Ayarlar'da hiçbir sekme etkin görünmez.
 */
export function ClientDock({ health }: { health: boolean }) {
  const active = clientTabIndex(usePathname());
  return (
    <Dock
      ariaLabel="Ana menü"
      items={CLIENT_TABS.map(({ href, label }, index) => ({ href, label, icon: ICONS[href], active: index === active })).filter(
        (item) => health || item.href !== '/me/saglik',
      )}
    />
  );
}
