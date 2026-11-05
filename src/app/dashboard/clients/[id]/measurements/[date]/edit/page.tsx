import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { SectionHeader } from '@/components/section-header';
import type { Locale } from '@/i18n/locale';
import { measurementsMessages } from '@/i18n/messages/measurements';
import { getLocale } from '@/i18n/server';
import { getFormat } from '@/lib/format';
import { requirePt } from '@/lib/guards';
import { loadMeasurements } from '@/lib/health';
import { isCalendarDate, measurementsOn, slotsFromValues } from '@/lib/measurement-log';
import { MeasurementForm } from '../../measurement-form';
import { MeasurementLockAlert, MeasurementProblemAlert, measurementClient } from '../../measurement-page';
import { MeasurementActions } from './measurement-actions';

/**
 * Günün kaydı; başlık ve sayfa aynı okumayı paylaşır (istek başına bir kez). Tarih geçersizse ya da
 * kayıt okunabildiği halde o gün yoksa (silinmiş, yanlış adres) 404: başlık da olmayan günü adlandırmaz.
 */
const loadDay = cache(async (id: string, date: string, locale: Locale) => {
  if (!isCalendarDate(date)) notFound();
  const loaded = await measurementClient(id);
  const view = loaded.ok ? await loadMeasurements(loaded.client, locale) : null;
  const entries = view?.state === 'ok' ? measurementsOn(view.record.measurements, date) : [];
  if (view?.state === 'ok' && entries.length === 0) notFound();
  return { loaded, view, entries };
});

export async function generateMetadata({ params }: { params: Promise<{ id: string; date: string }> }): Promise<Metadata> {
  await requirePt();
  const { id, date } = await params;
  const locale = await getLocale();
  await loadDay(id, date, locale);
  return { title: measurementsMessages(locale).form.editTitle(getFormat(locale).day(date)) };
}

/** Bir günün ölçümlerini düzenleme; başlıkta "Sil" o günü tamamen kaldırır (SPEC §6). */
export default async function EditMeasurementPage({ params }: { params: Promise<{ id: string; date: string }> }) {
  await requirePt();
  const { id, date } = await params;
  const locale = await getLocale();
  const messages = measurementsMessages(locale);
  const { loaded, view, entries } = await loadDay(id, date, locale);
  const dateLabel = getFormat(locale).day(date);
  const title = messages.form.editTitle(dateLabel);

  // Başlık ve Kaydet formun içinde (masaüstünde başlıkta Kaydet, yanında Sil).
  if (view?.state === 'ok') {
    return (
      <MeasurementForm
        clientId={id}
        title={title}
        description={messages.form.editDescription}
        actions={<MeasurementActions clientId={id} date={date} dateLabel={dateLabel} />}
        mode={{ kind: 'edit', date }}
        initialValues={slotsFromValues(entries)}
        askSex={!view.record.sex}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader back={{ href: `/dashboard/clients/${id}/measurements`, label: messages.form.back }} title={title} />
      {!loaded.ok ? <MeasurementProblemAlert title={messages.page.clientUnreadable} problem={loaded.problem} /> : null}
      {view?.state === 'locked' ? <MeasurementLockAlert lock={view.lock} clientId={id} /> : null}
      {view?.state === 'broken' ? <MeasurementProblemAlert title={messages.page.recordUnreadable} problem={view.problem} /> : null}
    </div>
  );
}
