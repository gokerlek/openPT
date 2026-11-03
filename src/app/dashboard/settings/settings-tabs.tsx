'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TabsNav, TabsNavLink } from '@/components/ui/tabs';
import { USER_MENU_SPOT } from '@/components/user-menu-spot';
import { SETTINGS_SECTIONS } from '@/lib/navigation';

/**
 * Ayarlar bölümünün sekmeleri: Görünüm · Yapay zekâ · Sürüm (`SETTINGS_SECTIONS`, `lib/navigation.ts`). Her
 * sekme kendi sayfasıdır (adres değişir, geri tuşu çalışır): gezinme, `tablist` değil (`TabsNav`). Etkin sekme
 * adresle birebir eşleşir (sondaki `/` sayılmaz); Görünüm bölümün kökü olduğu için önek eşleşmesi yapılmaz.
 *
 * Sekmeler sayfanın ilk satırıdır; sağ üstteki kullanıcı menüsüne Kütüphane sekmeleri gibi yer
 * bırakır (`USER_MENU_SPOT`, `flex-wrap-reverse`: sığmazsa sekmeler menünün altındaki satıra iner).
 */
export function SettingsTabs() {
  const pathname = usePathname();
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;

  return (
    <div className="flex flex-wrap-reverse items-start justify-between gap-x-3 gap-y-2">
      <TabsNav aria-label="Ayarlar" className="grow md:grow-0">
        {SETTINGS_SECTIONS.map((section) => (
          <TabsNavLink key={section.href} active={section.href === path} render={<Link href={section.href} />}>
            {section.label}
          </TabsNavLink>
        ))}
      </TabsNav>
      <span aria-hidden className={USER_MENU_SPOT} />
    </div>
  );
}
