import type { Metadata } from 'next';
import { WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { AchievementsCard } from '@/components/progress/achievements-card';
import { ProgressNotice } from '@/components/progress/progress-summary';
import { RecordsCard } from '@/components/progress/records-card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { readAppConfig } from '@/lib/config';
import { todayIn } from '@/lib/format';
import { currentClient } from '@/lib/guards';
import { loadProgress } from '@/lib/progress-data';
import { ProgressHeader } from '../../../progress-header';

export const metadata: Metadata = { title: 'Rekorlar' };

/**
 * Danışanın İlerleme sekmesinin Rekorlar'ı (tasarım §2.8, §8 satır 10; SPEC §7.6): son rekorlar ve başarılar
 * (seri, rozetler). Başlık "İlerleme", altında İlerleme'nin şeridi (ortak baş `ProgressHeader`); okunamayan ya
 * da sınırın dışında kalan antrenman varsa önce uyarı (`ProgressNotice`: rekorlar onlarsız). Okuma Özet'inkinin
 * hafifi (`progress-data.ts`, `scope: 'records'`): antrenmanlar, katalog ve haftalık hedef; sağlık kaydı, su ve
 * plan okunmaz (SPEC §9.4: gösterim de işlemedir). Antrenman yokken ayrı boş durum yok: iki kart da kendi boş
 * hâlini çizer ("Henüz rekor yok…", kazanılmamış başarılar). Bölümler PT'nin danışan sayfasındaki İlerleme
 * sekmesiyle ortak (`src/components/progress`, `viewer="client"`). Yalnız telefon, 375 px. Sayfa yetkiyi
 * kendisi denetler (SPEC §5).
 */
export default async function RecordsPage() {
  const [client, config] = await Promise.all([currentClient(), readAppConfig()]);
  const now = new Date();
  const today = todayIn(config.timeZone, now);
  const load = await loadProgress(client, now, today, config.timeZone, { scope: 'records' });
  const header = <ProgressHeader client={client} appName={config.appName} />;

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
  return (
    <main className="flex flex-col gap-6">
      {header}
      <ProgressNotice view={view} />
      <RecordsCard viewer="client" items={view.recentRecords} total={view.records} today={today} />
      <AchievementsCard viewer="client" achievements={view.achievements} streak={view.streak} />
    </main>
  );
}
