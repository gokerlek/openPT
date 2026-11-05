'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { useLocale, useMessages } from '@/i18n/client';
import { shellMessages } from '@/i18n/messages/shell';
import { notFoundBackLink } from '@/lib/navigation';

/**
 * "Böyle bir sayfa yok": olmayan adres ya da silinmiş kayıt (`notFound()`). Dönüş bağlantısı
 * adresin bölümüne gider (`/dashboard/exercises/yok` → Egzersizler); panelde dock ve kullanıcı
 * menüsü yerinde kalır (`dashboard/not-found.tsx`).
 */
export function NotFoundView() {
  const back = notFoundBackLink(usePathname(), useLocale());
  const t = useMessages(shellMessages).notFound;
  return (
    <Empty className="py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <MagnifyingGlass />
        </EmptyMedia>
        <EmptyTitle>
          <h1 className="text-lg font-semibold">{t.title}</h1>
        </EmptyTitle>
        <EmptyDescription>{t.description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button nativeButton={false} render={<Link href={back.href} />}>
          {back.label}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
