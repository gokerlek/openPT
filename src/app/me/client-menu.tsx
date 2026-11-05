'use client';

import { useState } from 'react';
import Link from 'next/link';
import { GearSix, SignOut } from '@phosphor-icons/react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLocale } from '@/i18n/client';
import { LocaleSwitch } from '@/i18n/locale-switch';
import { clientHomeMessages } from '@/i18n/messages/client-home';
import { upper } from '@/i18n/text';
import type { Locale } from '@/i18n/locale';
import { LogoutDialog } from './logout-dialog';

/** Adın baş harfleri (en çok iki): "Gizem Gonca" → "GG". Türkçe büyük harf. */
function initials(name: string, locale: Locale): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '');
  return upper(locale, letters.join('')) || '?';
}

/**
 * Danışanın sağ üstteki avatar menüsü (PT'ninkiyle aynı yerde): yalnız hesapla ilgili iki öğe, Ayarlar
 * (sağlık takibi, şifre) ve Çıkış yap. Yalnız telefon: düğme ve öğeler 44 px. Çıkış onay penceresiyle. Gezinme alttaki
 * dock'ta (`client-dock.tsx`: Bugün · Program · İlerleme · Sağlık); Sağlık dock'a geçince menüden kalktı,
 * Ayarlar ve Çıkış yalnız burada.
 */
export function ClientMenu({
  clientId,
  name,
  appName,
  hasPassword,
}: {
  clientId: string;
  name: string;
  appName: string;
  hasPassword: boolean;
}) {
  const [leaving, setLeaving] = useState(false);
  const locale = useLocale();
  const t = clientHomeMessages(locale).menu;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t.account}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <Avatar size="lg">
            <AvatarFallback className="font-medium text-foreground">{initials(name, locale)}</AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="text-foreground">{name}</span>
              <span className="font-normal text-muted-foreground">{appName}</span>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem className="min-h-11" render={<Link href="/me/ayarlar" />}>
              <GearSix />
              {t.settings}
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <LocaleSwitch variant="menu" />
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" className="min-h-11" onClick={() => setLeaving(true)}>
            <SignOut />
            {t.signOut}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <LogoutDialog open={leaving} onOpenChange={setLeaving} hasPassword={hasPassword} clientId={clientId} />
    </>
  );
}
