import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ClockCounterClockwise } from '@phosphor-icons/react/dist/ssr';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { clientWorkoutMessages } from '@/i18n/messages/client-workout';
import { getLocale, getMessages } from '@/i18n/server';
import { coachAccess } from '@/lib/ai/coach-contract';
import { readAppConfig } from '@/lib/config';
import { currentClient } from '@/lib/guards';
import { bodyMassOn } from '@/lib/cardio';
import { readHealthIfAllowed } from '@/lib/health';
import { loadSummary } from '@/lib/history-store';
import { loadPainReport } from '@/lib/pain-report-store';
import { SummaryCarousel } from './summary-carousel';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(clientWorkoutMessages)).summaryScreen.title };
}

/**
 * Antrenman özeti (tasarım §2.8): bitişten hemen sonra ve geçmişten ("Özeti aç", `?from=gecmis`) açılır.
 * Tam ekran, dock yok (`/me/antrenman` gibi sekmeler grubunun dışında). Sayfa yetkiyi kendisi denetler
 * (SPEC §5); hesaplar `history-store.ts` → `workout-summary.ts`. Bitmemiş antrenman antrenman ekranına döner;
 * silinmiş ya da olmayan antrenmanda dönüş bağlantısı. Bitişten açıldıysa ağrıyla yine geçilen hareketin
 * "Antrenörüne kısıt olarak bildir" kısayolu (`pain-report-store.ts`; kısıtlar ve ağrı takibi onaylıyken). AI koç
 * açıksa son kartta "AI koça sor" (`coach`).
 */
export default async function SummaryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [client, config, { id }, query, locale] = await Promise.all([currentClient(), readAppConfig(), params, searchParams, getLocale()]);
  const t = clientWorkoutMessages(locale).summaryScreen;
  const from = query.from === 'gecmis' ? 'history' : 'finish';
  const [loaded, painOffers] = await Promise.all([
    loadSummary(client.id, id, config.timeZone, {
      // Kardiyo kalorisinin kilosu: yalnız ölçüm onayı sürdükçe (onay yoksa dosya okunmaz).
      bodyMass: async (date) => {
        const record = await readHealthIfAllowed(client, ['measurements']);
        return record ? bodyMassOn(record.measurements, date) : undefined;
      },
      locale,
    }),
    from === 'finish' ? loadPainReport(client, id, locale) : Promise.resolve([]),
  ]);
  if (loaded.status === 'active') redirect('/me/antrenman');
  if (loaded.status !== 'ok') {
    return (
      <main className="mx-auto grid min-h-dvh w-full max-w-md place-items-center px-4 pt-[env(safe-area-inset-top)] pb-8">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ClockCounterClockwise weight="fill" />
            </EmptyMedia>
            <EmptyTitle>{loaded.status === 'deleted' ? t.deleted : t.notFound}</EmptyTitle>
            <EmptyDescription>{loaded.status === 'deleted' ? t.deletedText : t.notFoundText}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button className="h-11" nativeButton={false} render={<Link href={from === 'history' ? '/me/gecmis' : '/me'} />}>
              {from === 'history' ? t.backToHistory : t.backToToday}
            </Button>
          </EmptyContent>
        </Empty>
      </main>
    );
  }
  const firstName = client.name.split(/\s+/)[0] ?? client.name;
  return (
    <SummaryCarousel summary={loaded.value} firstName={firstName} from={from} painOffers={painOffers} coach={coachAccess(client) === 'ready'} />
  );
}
