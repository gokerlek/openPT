import { clientProgressMessages } from '@/i18n/messages/client-progress';
import { getMessages } from '@/i18n/server';
import type { Client } from '@/lib/schemas/client';
import { ClientHeader } from './client-header';
import { ProgressTabs } from './progress-tabs';

/**
 * Danışanın İlerleme bölümlerinin (Özet, Geçmiş, Rekorlar) ortak başı: başlık "İlerleme", altında bölüm
 * şeridi (`ProgressTabs`); `children` şeridin altında (Geçmiş'te son 30 günün özeti). Aralık yükleniyor
 * iskeletiyle aynı (`tab-skeleton.tsx`): sayfa geldiğinde içerik yerinden oynamaz. Sunucu bileşeni;
 * şerit istemcide (`progress-tabs.tsx`).
 */
export async function ProgressHeader({ client, appName, children }: { client: Client; appName: string; children?: React.ReactNode }) {
  const t = (await getMessages(clientProgressMessages)).pages;
  return (
    <div className="flex flex-col gap-4">
      <ClientHeader client={client} appName={appName} title={t.progress} />
      <ProgressTabs />
      {children}
    </div>
  );
}
