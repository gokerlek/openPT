'use client';

import { WarningCircle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { useMessages } from '@/i18n/client';
import { shellMessages } from '@/i18n/messages/shell';

/**
 * Beklenmeyen hata sınırı (Next `error.js`). Kök segmentte durur ki panel kabuğunun
 * (`dashboard/layout.tsx`) fırlattığı hatayı da yakalasın: ayar GitHub'dan bir anlık
 * okunamazsa PT kurulum sihirbazına yollanmaz, burada tekrar dener.
 *
 * Sunucu hatasının mesajı üretimde gizlenir; bu yüzden metin genel.
 */
export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useMessages(shellMessages).error;
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-8">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <WarningCircle weight="fill" />
          </EmptyMedia>
          <EmptyTitle>{t.title}</EmptyTitle>
          <EmptyDescription>{t.description}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={() => retry()}>{t.retry}</Button>
        </EmptyContent>
      </Empty>
    </main>
  );
}
