import type { Metadata } from 'next';
import Link from 'next/link';
import { measurementsMessages } from '@/i18n/messages/measurements';
import { getLocale, getMessages } from '@/i18n/server';
import { Plus } from '@/components/line-icons';
import { SectionHeader } from '@/components/section-header';
import { Button } from '@/components/ui/button';
import { requirePt } from '@/lib/guards';
import { loadMeasurements } from '@/lib/health';
import { readAppConfig } from '@/lib/config';
import { todayIn } from '@/lib/format';
import { HealthStrip } from '../health-page';
import { MeasurementOverview } from './measurement-overview';
import { parseRange, RangeFilter } from './range-filter';
import { MeasurementLockAlert, MeasurementProblemAlert, measurementClient } from './measurement-page';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(measurementsMessages)).page.title };
}

/**
 * Sağlık'ın Ölçümler parçası (`measurements` onayı): elle girilen ölçümler — vücut ağırlığı, boy ve çevreler,
 * otur-kalk ve gövde dayanıklılık testleri, ayak bileği hareketliliği, anket skorları. Tek eylem "Ölçüm gir".
 * Her ölçülen şey için bir grafik kartı: seyir, son değer, son iki ölçüm arasındaki değişimin gerçek olup
 * olmadığı ve yorum satırları. Altta tam genişlikte ölçüm günleri; güne dokununca düzenleme. Kamera ölçümü
 * ve hareket testi Hareket parçasında (`screening` onayı).
 */
export default async function MeasurementsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aralik?: string; bas?: string; bit?: string }>;
}) {
  await requirePt();
  const { id } = await params;
  const locale = await getLocale();
  const t = measurementsMessages(locale).page;
  const loaded = await measurementClient(id);
  const base = `/dashboard/clients/${id}/measurements`;

  if (!loaded.ok) {
    return (
      <div className="flex flex-col gap-6">
        <SectionHeader title={t.title} />
        <MeasurementProblemAlert title={t.clientUnreadable} problem={loaded.problem} />
      </div>
    );
  }

  const { client } = loaded;
  const [view, config] = await Promise.all([loadMeasurements(client, locale), readAppConfig()]);
  const today = todayIn(config.timeZone);
  const range = parseRange(await searchParams, today);

  return (
    <div className="flex flex-col gap-6">
      <HealthStrip client={client} record={view.state === 'ok' ? view.record : null} />
      <SectionHeader
        title={t.title}
        description={t.description}
        actions={
          view.state === 'ok' ? (
            <Button nativeButton={false} render={<Link href={`${base}/new`} />}>
              <Plus data-icon="inline-start" />
              {t.add}
            </Button>
          ) : null
        }
      />
      {view.state === 'locked' ? <MeasurementLockAlert lock={view.lock} clientId={id} /> : null}
      {view.state === 'broken' ? (
        <MeasurementProblemAlert title={t.recordUnreadable} problem={t.broken(view.problem)} />
      ) : null}
      {view.state === 'ok' && view.record.measurements.length > 0 ? <RangeFilter base={base} range={range} locale={locale} /> : null}
      {view.state === 'ok' ? <MeasurementOverview record={view.record} base={base} from={range.from} to={range.to} today={today} locale={locale} /> : null}
    </div>
  );
}
