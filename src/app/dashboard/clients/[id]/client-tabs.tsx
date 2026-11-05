'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TabsNav, TabsNavLink } from '@/components/ui/tabs';
import { useMessages } from '@/i18n/client';
import { ptClientsMessages } from '@/i18n/messages/pt-clients';
import { activeHealthPart } from './health-parts';

type Tab = { key: string; label: string; href: string; active: (pathname: string) => boolean };

/**
 * Danışanın sekmeleri: Genel · Program · Antrenmanlar · İlerleme · Sağlık. Her sekme kendi sayfasıdır
 * (adres değişir, geri tuşu çalışır): gezinme, `tablist` değil (`TabsNav`). Alt sayfalar (programı
 * düzenle, ölçüm gir, antrenmanın detayı, AI taslağını düzenle) kendi sekmesinde açık görünür; giriş
 * daveti (`/invite`, Genel'in Giriş kartından açılır) Genel'de sayılır. AI koç sekme değil, paneldir
 * (`CoachLauncher`).
 *
 * "Sağlık" (tasarım `kisit-tarama.md` §1) Kısıtlar, Ölçümler ve Hareket'in çatısıdır: şeritteki bir parçanın
 * adresindeyken etkin (`activeHealthPart`, kamera ölçümü `measurements/camera` da); bağlantısı modülde seçili ilk
 * parça (layout hesaplar, `healthHref`). İçindeki ikinci şerit `HealthTabs`.
 *
 * Telefonda (375 px) beş sekme de tek satıra sığmaz: şerit yatay kayar, taşan kenar solar.
 */
export function ClientTabs({ clientId, healthHref }: { clientId: string; healthHref: string }) {
  const t = useMessages(ptClientsMessages).shell;
  const pathname = usePathname();
  const base = `/dashboard/clients/${clientId}`;
  const under = (path: string) => (pathname: string) => pathname === path || pathname.startsWith(`${path}/`);
  const tabs: Tab[] = [
    {
      key: 'general',
      label: t.tabs.general,
      href: base,
      active: (p) => p === base || p === `${base}/edit` || under(`${base}/invite`)(p),
    },
    {
      key: 'program',
      label: t.tabs.program,
      href: `${base}/program`,
      // AI taslağının düzenleyicisi (`/coach/drafts/…`) bir program düzenleyicisi; dönüşü de Program'a.
      active: (p) => under(`${base}/program`)(p) || under(`${base}/coach/drafts`)(p),
    },
    { key: 'sessions', label: t.tabs.sessions, href: `${base}/sessions`, active: under(`${base}/sessions`) },
    { key: 'progress', label: t.tabs.progress, href: `${base}/ilerleme`, active: under(`${base}/ilerleme`) },
    { key: 'health', label: t.tabs.health, href: healthHref, active: (p) => activeHealthPart(p, base) !== null },
  ];
  const current = tabs.find((tab) => tab.active(pathname))?.key ?? 'general';

  return (
    <TabsNav aria-label={t.tabsLabel}>
      {tabs.map((tab) => (
        <TabsNavLink key={tab.key} active={tab.key === current} render={<Link href={tab.href} />}>
          {tab.label}
        </TabsNavLink>
      ))}
    </TabsNav>
  );
}
