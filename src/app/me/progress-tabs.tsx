'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TabsNav, TabsNavLink } from '@/components/ui/tabs';

const under = (href: string) => (path: string) => path === href || path.startsWith(`${href}/`);

/** İlerleme sekmesinin bölümleri; Geçmiş'in adresi (`/me/gecmis`) yerinde kalır. */
const PROGRESS_SECTIONS = [
  // Özet bölümün köküdür (`/me/ilerleme/rekorlar` onun altında): yalnız tam eşleşmede etkin.
  { href: '/me/ilerleme', label: 'Özet', active: (path: string) => path === '/me/ilerleme' },
  // Geçmiş, antrenmanın detayında (`/me/gecmis/[id]`) da etkin.
  { href: '/me/gecmis', label: 'Geçmiş', active: under('/me/gecmis') },
  { href: '/me/ilerleme/rekorlar', label: 'Rekorlar', active: under('/me/ilerleme/rekorlar') },
] as const;

/**
 * Danışanın İlerleme sekmesinin ikinci şeridi: Özet · Geçmiş · Rekorlar. Her bölüm kendi sayfasıdır
 * (adres değişir, geri tuşu çalışır): gezinme, `tablist` değil (`TabsNav`). Dock'ta üçünde de İlerleme
 * etkindir (`client-tabs.ts`). Sondaki `/` sayılmaz. Yalnız telefon: dokunmatikte şerit 44 px.
 */
export function ProgressTabs() {
  const pathname = usePathname();
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;

  return (
    <TabsNav aria-label="İlerleme bölümleri" className="w-full" listClassName="h-8 touch:h-11">
      {PROGRESS_SECTIONS.map((section) => (
        <TabsNavLink key={section.href} active={section.active(path)} render={<Link href={section.href} />}>
          {section.label}
        </TabsNavLink>
      ))}
    </TabsNav>
  );
}
