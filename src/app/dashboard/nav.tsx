'use client';

import { usePathname } from 'next/navigation';
import { Barbell, SquaresFour, UsersThree } from '@phosphor-icons/react';
import { Dock, type DockEntry } from '@/components/dock/dock';
import { useMessages } from '@/i18n/client';
import { ptShellMessages } from '@/i18n/messages/pt-shell';
import { TRAINING_SECTIONS } from './training-tabs';

type NavItem = Omit<DockEntry, 'active'> & {
  /** Bu adreslerin altındaki sayfalarda da aktif (bölüm sekmeleri). */
  sections?: readonly string[];
};

function navItems(t: ReturnType<typeof ptShellMessages>['nav']): NavItem[] {
  return [
    { href: '/dashboard', label: t.overview, shortLabel: t.overviewShort, icon: <SquaresFour /> },
    { href: '/dashboard/clients', label: t.clients, icon: <UsersThree /> },
    // Şablonlar, egzersizler, cihazlar ve aparatlar tek bölüm: başvuru kütüphanesi, içinde sekmeler
    // (training-tabs.tsx). Giriş ilk sekme. "Antrenman" yalnız yapılan iş (seans) için kullanılır.
    {
      href: '/dashboard/templates',
      label: t.library,
      icon: <Barbell />,
      sections: TRAINING_SECTIONS.map((section) => section.href),
    },
  ];
}
// Ayarlar ve çıkış dock'ta değil, sağ üstteki kullanıcı menüsünde (user-menu.tsx).

function matches(pathname: string, href: string): boolean {
  // Genel bakış yalnız tam eşleşmede aktif; diğerleri alt sayfalarında da.
  return href === '/dashboard' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function isActive(pathname: string, item: NavItem): boolean {
  return (item.sections ?? [item.href]).some((href) => matches(pathname, href));
}

/** PT gezinmesi: her genişlikte etiketli dock (ikonun altında kısa ad; büyüme ve ipucu yok). */
export function DashboardDock() {
  const t = useMessages(ptShellMessages).nav;
  const pathname = usePathname();
  return (
    <Dock
      ariaLabel={t.ariaLabel}
      labels
      items={navItems(t).map(({ sections, ...item }) => ({ ...item, active: isActive(pathname, { ...item, sections }) }))}
    />
  );
}
