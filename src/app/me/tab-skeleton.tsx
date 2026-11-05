'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { useMessages } from '@/i18n/client';
import { clientHomeMessages } from '@/i18n/messages/client-home';
import { ProgressTabsSlot } from './progress-tabs';

/**
 * Danışan sekmeleri değişirken anında görünen iskelet (shadcn Skeleton; `(sekmeler)/loading.tsx` ve
 * `(sekmeler)/ilerleme/loading.tsx`): başlık ve avatar yerinde, altında kart. Dock layout'ta olduğu için
 * yerinde kalır ve dokunulan sekme hemen etkin görünür. İlerleme bölümlerinde (Özet, Geçmiş, Rekorlar)
 * başlığın altında gerçek şerit (`ProgressTabsSlot`), sayfalardaki gibi `gap-4`le (`progress-header.tsx`):
 * sayfa geldiğinde içerik yerinden oynamaz.
 */
export function TabSkeleton() {
  const t = useMessages(clientHomeMessages);
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <span role="status" className="sr-only">
        {t.pageLoading}
      </span>
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <Skeleton className="my-0.5 h-4 w-24" />
            <Skeleton className="my-0.5 h-7 w-44" />
          </div>
          <Skeleton className="size-11 shrink-0 rounded-full" />
        </div>
        <ProgressTabsSlot />
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
