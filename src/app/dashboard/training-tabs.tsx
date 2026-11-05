'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TabsNav, TabsNavLink } from '@/components/ui/tabs';
import { useMessages } from '@/i18n/client';
import { ptShellMessages } from '@/i18n/messages/pt-shell';
import { USER_MENU_SPOT } from '@/components/user-menu-spot';

/** Kütüphane bölümünün sayfaları (adları `ptShellMessages().library`); dock'ta tek "Kütüphane" öğesi bunlara açılır. */
export const TRAINING_SECTIONS = [
  { href: '/dashboard/templates', key: 'templates' },
  { href: '/dashboard/exercises', key: 'exercises' },
  { href: '/dashboard/devices', key: 'devices' },
  { href: '/dashboard/attachments', key: 'attachments' },
] as const;

/** Bu yol hangi Kütüphane sekmesinde (alt sayfalar dahil); bölüm dışındaysa null. */
export function librarySection(pathname: string): string | null {
  return (
    TRAINING_SECTIONS.find((section) => pathname === section.href || pathname.startsWith(`${section.href}/`))?.href ?? null
  );
}

/**
 * Kütüphane bölümünün sekmeleri: Şablonlar · Egzersizler · Cihazlar · Aparatlar. Her sekme kendi
 * sayfasıdır (adres değişir, geri tuşu çalışır); bu yüzden gezinmedir, `tablist` değil. Bölümün
 * girişi Şablonlar.
 *
 * Sekmeler sayfanın ilk satırıdır; sağ üstte kullanıcı menüsü durur. Menünün yeri satırda ayrılır
 * (`USER_MENU_SPOT`): sekmeler yanına sığarsa aynı satırda, sığmazsa (telefon) menünün altındaki
 * satırda tam genişlikte durur (`flex-wrap-reverse`: taşan satır üste değil alta iner).
 */
export function TrainingTabs() {
  const t = useMessages(ptShellMessages).library;
  const pathname = usePathname();
  const current = librarySection(pathname) ?? '/dashboard/templates';

  return (
    <div className="flex flex-wrap-reverse items-start justify-between gap-x-3 gap-y-2">
      <TabsNav aria-label={t.ariaLabel} className="grow md:grow-0">
        {TRAINING_SECTIONS.map((section) => (
          <TabsNavLink key={section.href} active={section.href === current} render={<Link href={section.href} />}>
            {t[section.key]}
          </TabsNavLink>
        ))}
      </TabsNav>
      <span aria-hidden className={USER_MENU_SPOT} />
    </div>
  );
}
