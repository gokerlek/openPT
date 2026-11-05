import type { Metadata } from 'next';
import { WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { CoachButton } from '@/components/coach/coach-button';
import { ExerciseProgress } from '@/components/progress/exercise-progress';
import { AdherenceCard, EffortCard, PainCard, ReadinessCard, WaterCard, WeeklyLoadCard } from '@/components/progress/insight-charts';
import { ProgressEmpty, ProgressNotice, ProgressStats } from '@/components/progress/progress-summary';
import { ScreeningCard } from '@/components/progress/screening-card';
import { StrengthProgress } from '@/components/progress/strength-progress';
import { WeeklyProgress } from '@/components/progress/weekly-progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { clientProgressMessages } from '@/i18n/messages/client-progress';
import { getLocale, getMessages } from '@/i18n/server';
import { coachAccess } from '@/lib/ai/coach-contract';
import { readAppConfig } from '@/lib/config';
import { todayIn } from '@/lib/format';
import { currentClient } from '@/lib/guards';
import { defaultStrengthWindow, STRENGTH_WINDOW_KEYS, type StrengthWindow } from '@/lib/muscle-progress';
import { loadProgress } from '@/lib/progress-data';
import { LOW_READINESS } from '@/lib/session-check';
import { ProgressHeader } from '../../progress-header';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(clientProgressMessages)).pages.progress };
}

/**
 * Danışanın İlerleme sekmesinin Özet'i (tasarım §0, §8 satır 10; SPEC §6, §7.6). Başlığın altında İlerleme'nin
 * şeridi (Özet · Geçmiş · Rekorlar; ortak baş `ProgressHeader`); en üstte üç sayı (antrenman, seri, rekor),
 * sonra Gelişim (hangi kasında güç kazandın: kas haritası, listeler, kasın hareketleri), hareket başına grafik (en ağır set,
 * tahmini maksimum, toplam; seçici aranabilir), grafikler (haftalık yük, antrenman düzeni, haftalık kas yükü,
 * onay varsa hazır oluşluk, ağrı ve hareket taraması, zorluk, su). Antrenörün AI desteğini açtıysa sayıların altında
 * "AI değerlendirmesi" (AI koç paneli, hemen değerlendirir). Son rekorlar ve başarılar Rekorlar
 * bölümünde (`/me/ilerleme/rekorlar`). Veri `sessions-index.json`, özetleri önbellekli antrenman dosyaları,
 * `water.json` ve onay varsa `health.json`'dan (`progress-data.ts`). Danışanın dilinde: "e1RM", "tonaj" yok.
 * Yalnız telefon, 375 px. Bölümler PT'nin danışan sayfasındaki İlerleme sekmesiyle ortak (`src/components/progress`,
 * `viewer="client"`). Sayfa yetkiyi kendisi denetler (SPEC §5).
 */
export default async function ProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ hareket?: string | string[]; donem?: string | string[] }>;
}) {
  const [client, config, params, locale] = await Promise.all([currentClient(), readAppConfig(), searchParams, getLocale()]);
  const t = clientProgressMessages(locale).pages;
  const now = new Date();
  const today = todayIn(config.timeZone, now);
  const load = await loadProgress(client, now, today, config.timeZone, { locale });
  const header = <ProgressHeader client={client} appName={config.appName} />;

  if (load.status === 'error') {
    return (
      <main className="flex flex-col gap-6">
        {header}
        <Alert variant="destructive">
          <WarningCircle weight="fill" />
          <AlertTitle>{t.loadFailed}</AlertTitle>
          <AlertDescription>{load.message}</AlertDescription>
        </Alert>
      </main>
    );
  }

  const { view, insights } = load;
  if (view.workouts === 0) {
    return (
      <main className="flex flex-col gap-6">
        {header}
        <ProgressEmpty viewer="client" />
        <ScreeningCard viewer="client" screening={insights.screening} />
      </main>
    );
  }

  const requested = typeof params.hareket === 'string' ? params.hareket : null;
  const period: StrengthWindow =
    typeof params.donem === 'string' && (STRENGTH_WINDOW_KEYS as readonly string[]).includes(params.donem)
      ? (params.donem as StrengthWindow)
      : defaultStrengthWindow(view.exercises, today);

  return (
    <main className="flex flex-col gap-6">
      {header}
      <ProgressNotice view={view} />
      <ProgressStats viewer="client" view={view} />
      {coachAccess(client) === 'ready' ? <CoachButton label={t.aiReview} detail={{ autoReview: true }} className="h-11 w-full" /> : null}
      <StrengthProgress viewer="client" exercises={view.exercises} today={today} initialWindow={period} circumference={insights.circumference} />
      {view.exercises.length > 0 ? <ExerciseProgress viewer="client" exercises={view.exercises} initialKey={requested} today={today} /> : null}
      <WeeklyLoadCard viewer="client" weeks={view.weeks} today={today} />
      <AdherenceCard viewer="client" adherence={insights.adherence} />
      <WeeklyProgress viewer="client" weeks={view.weeks} />
      <ReadinessCard viewer="client" readiness={insights.readiness} today={today} low={LOW_READINESS} />
      <PainCard viewer="client" pain={insights.pain} />
      <ScreeningCard viewer="client" screening={insights.screening} />
      <EffortCard viewer="client" rpe={insights.rpe} today={today} />
      <WaterCard viewer="client" water={insights.water} today={today} />
    </main>
  );
}
