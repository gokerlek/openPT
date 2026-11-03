'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TabsNav, TabsNavLink } from '@/components/ui/tabs';
import { hasProgressTabs, PROGRESS_SECTIONS, progressSectionIndex } from '@/lib/client-tabs';

/**
 * Danışanın İlerleme sekmesinin ikinci şeridi: Özet · Geçmiş · Rekorlar (`PROGRESS_SECTIONS`). Her bölüm
 * kendi sayfasıdır (adres değişir, geri tuşu çalışır): gezinme, `tablist` değil (`TabsNav`). Etkin bölüm
 * `progressSectionIndex`'ten (Özet yalnız tam eşleşmede, Geçmiş antrenmanın detayında da). Dock'ta üçünde de
 * İlerleme etkindir (`client-tabs.ts`). Yalnız telefon: dokunmatikte şerit 44 px (`TabsNav`'ın varsayılanı).
 */
export function ProgressTabs() {
  const active = progressSectionIndex(usePathname());

  return (
    <TabsNav aria-label="İlerleme bölümleri" className="w-full">
      {PROGRESS_SECTIONS.map((section, index) => (
        <TabsNavLink key={section.href} active={index === active} render={<Link href={section.href} />}>
          {section.label}
        </TabsNavLink>
      ))}
    </TabsNav>
  );
}

/**
 * Yükleniyor iskeletinde şeridin yeri (`tab-skeleton.tsx`): gidilen sayfa üç bölümden biriyse gerçek
 * şerit, değilse hiçbir şey (`hasProgressTabs`; antrenmanın detayında şerit yok). İskelet geçişin hemen
 * başında çizilir, adres de o anda değişir: `usePathname` gidilen sayfayı verir, dokunulan bölüm hemen
 * etkin görünür ve sayfa geldiğinde içerik yerinden oynamaz.
 */
export function ProgressTabsSlot() {
  return hasProgressTabs(usePathname()) ? <ProgressTabs /> : null;
}
