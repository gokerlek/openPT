'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TabsNav, TabsNavLink } from '@/components/ui/tabs';
import { USER_MENU_SPOT } from '@/components/user-menu-spot';
import { useLocale, useMessages } from '@/i18n/client';
import { ptShellMessages } from '@/i18n/messages/pt-shell';
import { settingsSections } from '@/lib/navigation';

/**
 * Ayarlar bölümünün sekmeleri: Görünüm · Yapay zekâ · Sürüm · Uygulama (`settingsSections`, `lib/navigation.ts`). Her
 * sekme kendi sayfasıdır (adres değişir, geri tuşu çalışır): gezinme, `tablist` değil (`TabsNav`). Etkin sekme
 * adresle birebir eşleşir (sondaki `/` sayılmaz); Görünüm bölümün kökü olduğu için önek eşleşmesi yapılmaz.
 *
 * Sekmeler sayfanın ilk satırıdır; sağ üstteki kullanıcı menüsüne Kütüphane sekmeleri gibi yer
 * bırakır (`USER_MENU_SPOT`, `flex-wrap-reverse`: sığmazsa sekmeler menünün altındaki satıra iner).
 */
export function SettingsTabs() {
  const locale = useLocale();
  const t = useMessages(ptShellMessages).settings;
  const pathname = usePathname();
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;

  return (
    <div className="flex flex-wrap-reverse items-start justify-between gap-x-3 gap-y-2">
      <TabsNav aria-label={t.ariaLabel} className="grow md:grow-0">
        {settingsSections(locale).map((section) => (
          <TabsNavLink key={section.href} active={section.href === path} render={<Link href={section.href} />}>
            {section.label}
          </TabsNavLink>
        ))}
      </TabsNav>
      <span aria-hidden className={USER_MENU_SPOT} />
    </div>
  );
}
