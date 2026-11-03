'use client';

import { usePathname } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { USER_MENU_GUTTER } from '@/components/user-menu-spot';
import { skeletonKind } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { SettingsTabs } from './settings/settings-tabs';
import { TrainingTabs } from './training-tabs';

/**
 * Sayfa geçişinde yeni sayfa gelene kadar gösterilen iskelet (`loading.tsx`, shadcn Skeleton).
 * Next `loading.tsx`'i geçişin hemen başında (üretimde önceden yüklenmiş olarak) çizer; adres de
 * o anda değişir, bu yüzden hangi sayfaya gidildiği `usePathname`'den okunur ve iskelet onun
 * yerleşimine benzer (`skeletonKind`). Kütüphane listelerinde sekmeler gerçektir: seçilen sekme
 * hemen etkin görünür.
 *
 * Ayarlar'ın sekmeleri buradan yalnız bölüme başka yerden girilirken gelir (düzeni henüz yüklenmemişse).
 * Ayarlar'ın kendi sekmeleri arasında bu sınır görünmez: Next sınırı çocuk segmentin anahtarıyla kurar
 * (`layout-router`, `TemplateContext.Provider key={stateKey}`) ve buradaki sınırın anahtarı `settings` kalır.
 * O geçişin iskeleti `settings/loading.tsx` (`SettingsTabSkeleton`): sekmeler düzende, yalnız başlık ve gövde.
 */
export function RouteSkeleton() {
  const kind = skeletonKind(usePathname());

  // Ayarlar'ın düzeni (`settings/layout.tsx`): sekmeler, altında `gap-5` ile sayfa (başlık + form).
  if (kind === 'settings') {
    return (
      <div className="flex flex-col gap-5">
        <SettingsTabs />
        <SettingsTabSkeleton />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <span role="status" className="sr-only">
        Sayfa yükleniyor…
      </span>
      {kind === 'library' ? <TrainingTabs /> : null}
      <HeaderSkeleton crumbs={kind === 'detail' || kind === 'form' || kind === 'client'} gutter={kind !== 'library'} />
      {kind === 'client' ? <Skeleton className="h-8 w-full max-w-md" /> : null}
      <BodySkeleton kind={kind} />
    </div>
  );
}

/** Ayarlar'ın sekmesi değişirken (`settings/loading.tsx`): sekmeler yerinde (Ayarlar düzeni), yalnız başlık ve form. */
export function SettingsTabSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <span role="status" className="sr-only">
        Sayfa yükleniyor…
      </span>
      <HeaderSkeleton crumbs={false} gutter={false} />
      <BodySkeleton kind="settings" />
    </div>
  );
}

/** Danışanın sekmesi değişirken: başlık ve sekmeler yerinde (danışan düzeni), yalnız içerik. */
export function ClientTabSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <span role="status" className="sr-only">
        Sayfa yükleniyor…
      </span>
      <Skeleton className="h-7 w-40" />
      <TwoColumns />
    </div>
  );
}

function HeaderSkeleton({ crumbs, gutter }: { crumbs: boolean; gutter: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      {crumbs ? (
        <div className={cn('h-5', gutter && USER_MENU_GUTTER)}>
          <Skeleton className="h-4 w-40" />
        </div>
      ) : null}
      <div className={cn('flex flex-col gap-2', !crumbs && gutter && USER_MENU_GUTTER)}>
        <Skeleton className="h-8 w-56 max-w-full" />
        <Skeleton className="h-5 w-72 max-w-full" />
      </div>
    </div>
  );
}

function TwoColumns() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Skeleton className="h-64 rounded-xl" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

function BodySkeleton({ kind }: { kind: ReturnType<typeof skeletonKind> }) {
  switch (kind) {
    case 'overview':
      // Genel bakış'ın sırası (`dashboard/page.tsx`): önce Dikkat gerektirenler ve Bildirimler, altında küçük sayı
      // kartları (telefonda iki yan yana) ve tam genişlikte "Şu an antrenmanda".
      return (
        <>
          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="col-span-2 h-24 rounded-xl lg:col-span-1" />
          </div>
        </>
      );
    case 'library':
      return (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((key) => (
            <Skeleton key={key} className="h-48 rounded-xl" />
          ))}
        </div>
      );
    case 'list':
      // Danışan listesi (`clients/client-list.tsx`): arama kutusu, bölüm başlığı, kart ızgarası.
      return (
        <>
          <Skeleton className="h-8 w-full rounded-lg touch:h-11 sm:max-w-sm" />
          <div className="flex flex-col gap-3">
            <Skeleton className="h-4 w-16" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2, 3].map((key) => (
                <Skeleton key={key} className="h-28 rounded-xl" />
              ))}
            </div>
          </div>
        </>
      );
    case 'form':
    case 'settings':
      return <Skeleton className="h-96 rounded-xl" />;
    case 'client':
    case 'detail':
      return <TwoColumns />;
  }
}
