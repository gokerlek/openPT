import type { Metadata } from 'next';
import { WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { AchievementsCard } from '@/components/progress/achievements-card';
import { ProgressEmpty } from '@/components/progress/progress-summary';
import { RecordsCard } from '@/components/progress/records-card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { readAppConfig } from '@/lib/config';
import { todayIn } from '@/lib/format';
import { currentClient } from '@/lib/guards';
import { loadProgress } from '@/lib/progress-data';
import { ClientHeader } from '../../../client-header';
import { ProgressTabs } from '../../../progress-tabs';

export const metadata: Metadata = { title: 'Rekorlar' };

/**
 * Danışanın İlerleme sekmesinin Rekorlar'ı (tasarım §2.8, §8 satır 10; SPEC §7.6): son rekorlar ve başarılar
 * (seri, rozetler). Özet'le aynı okuma (`progress-data.ts`); başlık "İlerleme", altında İlerleme'nin şeridi
 * (`ProgressTabs`). Bölümler PT'nin danışan sayfasındaki İlerleme sekmesiyle ortak (`src/components/progress`,
 * `viewer="client"`). Yalnız telefon, 375 px. Sayfa yetkiyi kendisi denetler (SPEC §5).
 */
export default async function RecordsPage() {
  const [client, config] = await Promise.all([currentClient(), readAppConfig()]);
  const now = new Date();
  const today = todayIn(config.timeZone, now);
  const load = await loadProgress(client, now, today, config.timeZone);
  const header = (
    <div className="flex flex-col gap-4">
      <ClientHeader client={client} appName={config.appName} title="İlerleme" />
      <ProgressTabs />
    </div>
  );

  if (load.status === 'error') {
    return (
      <main className="flex flex-col gap-6">
        {header}
        <Alert variant="destructive">
          <WarningCircle weight="fill" />
          <AlertTitle>İlerleme açılamadı</AlertTitle>
          <AlertDescription>{load.message}</AlertDescription>
        </Alert>
      </main>
    );
  }

  const { view } = load;
  if (view.workouts === 0) {
    return (
      <main className="flex flex-col gap-6">
        {header}
        <ProgressEmpty viewer="client" />
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-6">
      {header}
      <RecordsCard viewer="client" items={view.recentRecords} total={view.records} today={today} />
      <AchievementsCard viewer="client" achievements={view.achievements} streak={view.streak} />
    </main>
  );
}
