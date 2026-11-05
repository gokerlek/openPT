import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { AchievementsCard } from '@/components/progress/achievements-card';
import { ExerciseProgress } from '@/components/progress/exercise-progress';
import { AdherenceCard, EffortCard, PainCard, ReadinessCard, WaterCard, WeeklyLoadCard } from '@/components/progress/insight-charts';
import { ProgressEmpty, ProgressNotice, ProgressStats } from '@/components/progress/progress-summary';
import { RecordsCard } from '@/components/progress/records-card';
import { ScreeningCard } from '@/components/progress/screening-card';
import { StrengthProgress } from '@/components/progress/strength-progress';
import { WeeklyProgress } from '@/components/progress/weekly-progress';
import { SectionHeader } from '@/components/section-header';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ptClientsMessages } from '@/i18n/messages/pt-clients';
import { getLocale } from '@/i18n/server';
import { loadClient } from '@/lib/clients';
import { healthConsentState } from '@/lib/client-status';
import { readAppConfig } from '@/lib/config';
import { todayIn } from '@/lib/format';
import { requirePt } from '@/lib/guards';
import { defaultStrengthWindow, STRENGTH_WINDOWS, type StrengthWindow } from '@/lib/muscle-progress';
import { loadProgress } from '@/lib/progress-data';
import { CLIENT_ID_PATTERN } from '@/lib/schemas/client';
import { LOW_READINESS } from '@/lib/session-check';
import { healthStateLabels } from '../../health-state';

export async function generateMetadata(): Promise<Metadata> {
  return { title: ptClientsMessages(await getLocale()).progress.title };
}

/**
 * Danışanın İlerleme sekmesi (PT; SPEC §6, §7.6) — danışanın İlerleme'siyle aynı kartlar ve aynı hesap
 * (`src/components/progress`, `viewer="pt"`), ama tek sayfada: danışanda Özet'te (`/me/ilerleme`) olanlar ve
 * Rekorlar alt sekmesindekiler (`/me/ilerleme/rekorlar`: son rekorlar, başarılar) burada birlikte. Sırayla: üç sayı, Gelişim (kas başına güç gelişimi: harita,
 * listeler, kasın hareketleri ve grafikleri, onay varsa çevre değişimi), hareket başına grafik ve rekorlar,
 * haftalık yük, antrenman düzeni (plana göre), haftalık kas yükü, antrenman zorluğu, su, son rekorlar,
 * başarılar. Hazır oluşluk, ağrı ve hareket taraması (tarama sayfasına bağlantıyla) yalnız danışanın onayı o parçayı
 * kapsadıkça (danışandaki kural):
 * onay yoksa `health.json` hiç okunmaz (`progress-data.ts`, SPEC §9.4). Veri danışanınkiyle aynı önbellekli
 * okumadan (index + blob kimliğiyle antrenman özetleri).
 *
 * Masaüstünde (PT'nin birincil cihazı) Gelişim ve Hareketler kartın içinde iki sütun (kap sorgusu), grafikler
 * iki bağımsız sütun; telefonda alt alta. Metin PT'ye: danışanın adıyla ya da yansız ("kaldırılan").
 * Sayfa yetkiyi kendisi denetler (SPEC §5).
 */
export default async function ClientProgressPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ hareket?: string | string[]; donem?: string | string[] }>;
}) {
  await requirePt();
  const { id } = await params;
  if (!CLIENT_ID_PATTERN.test(id)) notFound();
  const loaded = await loadClient(id);
  if (!loaded) notFound();
  // Kaydı okunamayan danışan: sorunu Genel anlatır.
  if (!loaded.ok) redirect(`/dashboard/clients/${id}`);
  const { client } = loaded;

  const locale = await getLocale();
  const t = ptClientsMessages(locale).progress;
  const [config, query] = await Promise.all([readAppConfig(), searchParams]);
  const now = new Date();
  const today = todayIn(config.timeZone, now);
  const load = await loadProgress(client, now, today, config.timeZone, { locale });
  const name = client.name.trim().split(/\s+/)[0] ?? client.name;
  const header = (
    <SectionHeader title={t.title} description={t.description} />
  );

  if (load.status === 'error') {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Card>
          <CardHeader>
            <CardTitle>{t.unavailableTitle}</CardTitle>
            <CardDescription>{t.unavailableBody}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const { view, insights } = load;
  if (view.workouts === 0) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <ProgressEmpty viewer="pt" name={name} />
        <ScreeningCard viewer="pt" screening={insights.screening} clientId={id} />
      </div>
    );
  }

  const requested = typeof query.hareket === 'string' ? query.hareket : null;
  const period: StrengthWindow =
    typeof query.donem === 'string' && Object.hasOwn(STRENGTH_WINDOWS, query.donem)
      ? (query.donem as StrengthWindow)
      : defaultStrengthWindow(view.exercises, today);
  // Onay yoksa sağlık grafikleri hiç gelmez (`off`); PT nedenini görsün.
  const health = healthConsentState(client);

  return (
    <div className="flex flex-col gap-6">
      {header}
      <ProgressNotice view={view} />
      <ProgressStats viewer="pt" view={view} />
      <StrengthProgress viewer="pt" name={name} exercises={view.exercises} today={today} initialWindow={period} circumference={insights.circumference} />
      {view.exercises.length > 0 ? <ExerciseProgress viewer="pt" exercises={view.exercises} initialKey={requested} today={today} /> : null}
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <WeeklyLoadCard viewer="pt" weeks={view.weeks} today={today} />
          <WeeklyProgress viewer="pt" weeks={view.weeks} />
          <RecordsCard viewer="pt" name={name} items={view.recentRecords} total={view.records} today={today} />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <AdherenceCard viewer="pt" adherence={insights.adherence} />
          <EffortCard viewer="pt" name={name} rpe={insights.rpe} today={today} />
          <ReadinessCard viewer="pt" readiness={insights.readiness} today={today} low={LOW_READINESS} />
          <PainCard viewer="pt" name={name} pain={insights.pain} />
          <ScreeningCard viewer="pt" screening={insights.screening} clientId={id} />
          <WaterCard viewer="pt" name={name} water={insights.water} today={today} />
          {health !== 'granted' ? (
            <p className="text-sm text-muted-foreground">{t.healthHidden(healthStateLabels(locale)[health])}</p>
          ) : null}
        </div>
      </div>
      <AchievementsCard viewer="pt" achievements={view.achievements} streak={view.streak} />
    </div>
  );
}
