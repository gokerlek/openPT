'use client';

import { Translate } from '@phosphor-icons/react';
import { ChoiceChips } from '@/components/choice-chips';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenuGroup, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { shellMessages } from './messages/shell';
import { useLocale, useMessages, useSetLocale } from './client';
import { isLocale, LOCALE_NAMES, LOCALES, type Locale } from './locale';

/**
 * Dil seçici, tek bileşen (`useSetLocale`). Diller kendi adlarıyla yazılır ("Türkçe", "English"; `lang` ile).
 * - `inline`: giriş sayfalarının altında küçük düğmeler (`/giris`, `/join`, `/login`, `/install`).
 * - `card`: Ayarlar'da kart (panelde Ayarlar → Uygulama, danışanda Ayarlar).
 * - `menu`: avatar menüsünde seçenekler (`DropdownMenuContent`'in içinde).
 */
export function LocaleSwitch({ variant = 'inline', className }: { variant?: 'inline' | 'card' | 'menu'; className?: string }) {
  const locale = useLocale();
  const setLocale = useSetLocale();
  const t = useMessages(shellMessages).language;
  const choose = (next: Locale | undefined) => {
    if (next && next !== locale) setLocale(next);
  };

  if (variant === 'menu') {
    return (
      <DropdownMenuGroup className={className}>
        <DropdownMenuLabel>{t.label}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={locale} onValueChange={(next: unknown) => choose(isLocale(next) ? next : undefined)}>
          {LOCALES.map((code) => (
            <DropdownMenuRadioItem key={code} value={code} lang={code} className="touch:min-h-11">
              {LOCALE_NAMES[code]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuGroup>
    );
  }

  if (variant === 'card') {
    return (
      <Card size="sm" className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Translate weight="fill" className="size-5 text-muted-foreground" />
            {t.label}
          </CardTitle>
          <CardDescription>{t.hint}</CardDescription>
        </CardHeader>
        <CardContent>
          <ChoiceChips
            value={locale}
            label={t.label}
            options={LOCALES.map((code) => ({ value: code, label: <span lang={code}>{LOCALE_NAMES[code]}</span> }))}
            onChange={choose}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div role="group" aria-label={t.label} className={cn('flex items-center justify-center gap-1 text-sm', className)}>
      <Translate weight="fill" aria-hidden className="size-4 text-muted-foreground" />
      {LOCALES.map((code) => (
        <Button
          key={code}
          variant="ghost"
          lang={code}
          aria-pressed={code === locale}
          onClick={() => choose(code)}
          className={cn('min-h-11 px-2 font-normal', code === locale ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
          {LOCALE_NAMES[code]}
        </Button>
      ))}
    </div>
  );
}
