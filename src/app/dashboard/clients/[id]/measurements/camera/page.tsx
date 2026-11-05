import { POSE_TASKS,type PoseTask } from '@/lib/pose/protocols';
import type { Metadata } from 'next';
import { CameraWizard } from '@/components/measurements/camera-wizard';
import { SectionHeader } from '@/components/section-header';
import { measurementsMessages } from '@/i18n/messages/measurements';
import { getLocale, getMessages } from '@/i18n/server';
import { readAppConfig } from '@/lib/config';
import { canRecordHealth } from '@/lib/client-status';
import { requirePt } from '@/lib/guards';
import { loadHealthPart } from '@/lib/health';
import { HealthLockAlert, HealthStrip } from '../../health-page';
import { MeasurementProblemAlert, measurementClient } from '../measurement-page';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(measurementsMessages)).camera.title };
}

/**
 * Kamera ölçümü sihirbazı: Hareket parçasının eylemi (`screening` onayı), sekme değil. Adresi ölçümlerin altında
 * kalır; şeritte Hareket etkin görünür (`activeHealthPart`), geri bağlantısı ve sihirbazın dönüşü Hareket'e.
 */
export default async function CameraMeasurementPage({ params,searchParams }: { params: Promise<{ id: string }>;searchParams:Promise<{analysis?:string}> }) {
  await requirePt();
  const { id } = await params;
  const {analysis}=await searchParams;
  const initialTask=POSE_TASKS.includes(analysis as PoseTask)?analysis as PoseTask:'front';
  const base = `/dashboard/clients/${id}/measurements`;
  const movement = `/dashboard/clients/${id}/screening`;
  const locale = await getLocale();
  const messages = measurementsMessages(locale);
  const loaded = await measurementClient(id);
  const [view, config] = await Promise.all([loaded.ok ? loadHealthPart(loaded.client, 'screening', locale) : null, readAppConfig()]);
  return (
    <div className="flex flex-col gap-6">
      {loaded.ok ? <HealthStrip client={loaded.client} record={view?.state === 'ok' ? view.record : null} /> : null}
      <SectionHeader title={messages.camera.title} description={messages.camera.pageDescription} back={{ href: movement, label: messages.camera.back }} />
      {!loaded.ok ? <MeasurementProblemAlert title={messages.page.clientUnreadable} problem={loaded.problem} /> : null}
      {view?.state === 'locked' ? <HealthLockAlert field="screening" lock={view.lock} clientId={id} /> : null}
      {view?.state === 'broken' ? <MeasurementProblemAlert title={messages.page.recordUnreadable} problem={view.problem} /> : null}
      {/* Elle ölçüm "Ölçümler" onayına bağlı: yalnız o parça yazılabiliyorsa bağlantısı görünür. */}
      {view?.state === 'ok' ? <CameraWizard initialTask={initialTask} clientName={loaded.ok?loaded.client.name:undefined} clientId={id} backHref={movement} backLabel={messages.camera.backToMovement} manualHref={loaded.ok && canRecordHealth(loaded.client, 'measurements') ? `${base}/new` : undefined} timeZone={config.timeZone} records={view.record.cameraMeasurements ?? []} /> : null}
    </div>
  );
}
