import type { Metadata } from 'next';
import { SectionHeader } from '@/components/section-header';
import { measurementsMessages } from '@/i18n/messages/measurements';
import { getLocale, getMessages } from '@/i18n/server';
import { readAppConfig } from '@/lib/config';
import { todayIn } from '@/lib/format';
import { requirePt } from '@/lib/guards';
import { loadMeasurements } from '@/lib/health';
import { measurementDays } from '@/lib/measurement-log';
import { MeasurementForm } from '../measurement-form';
import { MeasurementLockAlert, MeasurementProblemAlert, measurementClient } from '../measurement-page';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(measurementsMessages)).form.newTitle };
}

/** Ölçüm girişi: gün bugün (uygulamanın saat dilimi), yalnız doldurulan değerler kaydedilir. */
export default async function NewMeasurementPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePt();
  const { id } = await params;
  const locale = await getLocale();
  const messages = measurementsMessages(locale);
  const TITLE = messages.form.newTitle;
  const [loaded, config] = await Promise.all([measurementClient(id), readAppConfig()]);
  const view = loaded.ok ? await loadMeasurements(loaded.client, locale) : null;

  // Başlık ve Kaydet formun içinde (masaüstünde başlıkta Kaydet); form yoksa yalnız başlık ve nedeni.
  if (view?.state === 'ok') {
    return (
      <MeasurementForm
        clientId={id}
        title={TITLE}
        description={messages.form.newDescription}
        mode={{
          kind: 'new',
          today: todayIn(config.timeZone),
          measuredDates: measurementDays(view.record.measurements).map((day) => day.date),
        }}
        initialValues={{}}
        askSex={!view.record.sex}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader back={{ href: `/dashboard/clients/${id}/measurements`, label: messages.form.back }} title={TITLE} />
      {!loaded.ok ? <MeasurementProblemAlert title={messages.page.clientUnreadable} problem={loaded.problem} /> : null}
      {view?.state === 'locked' ? <MeasurementLockAlert lock={view.lock} clientId={id} /> : null}
      {view?.state === 'broken' ? <MeasurementProblemAlert title={messages.page.recordUnreadable} problem={view.problem} /> : null}
    </div>
  );
}
