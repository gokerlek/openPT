import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { SectionHeader } from '@/components/section-header';
import type { Locale } from '@/i18n/locale';
import { screeningMessages } from '@/i18n/messages/screening';
import { getLocale } from '@/i18n/server';
import { getFormat } from '@/lib/format';
import { requirePt } from '@/lib/guards';
import { loadHealthPart } from '@/lib/health';
import { isCalendarDate } from '@/lib/measurement-log';
import { HealthLockAlert } from '../../../health-page';
import { MeasurementProblemAlert, measurementClient } from '../../../measurements/measurement-page';
import { ScreeningDelete } from '../../screening-actions';
import { ScreeningForm } from '../../screening-form';
import { initialScreeningState } from '../../screening-state';

/** Günün taraması; başlık ve sayfa aynı okumayı paylaşır. Okunabilen kayıtta o gün yoksa 404. */
const loadDay = cache(async (id: string, date: string, locale: Locale) => {
  if (!isCalendarDate(date)) notFound();
  const loaded = await measurementClient(id);
  const view = loaded.ok ? await loadHealthPart(loaded.client, 'screening', locale) : null;
  const screening = view?.state === 'ok' ? (view.record.screenings ?? []).find((item) => item.date === date) : undefined;
  if (view?.state === 'ok' && !screening) notFound();
  return { loaded, view, screening };
});

export async function generateMetadata({ params }: { params: Promise<{ id: string; date: string }> }): Promise<Metadata> {
  await requirePt();
  const { id, date } = await params;
  const locale = await getLocale();
  await loadDay(id, date, locale);
  return { title: screeningMessages(locale).form.editTitle(getFormat(locale).day(date)) };
}

/** Bir günün taramasını düzenleme; başlıkta "Sil" o günü kaldırır. */
export default async function EditScreeningPage({ params }: { params: Promise<{ id: string; date: string }> }) {
  await requirePt();
  const { id, date } = await params;
  const locale = await getLocale();
  const messages = screeningMessages(locale);
  const { loaded, view, screening } = await loadDay(id, date, locale);
  const dateLabel = getFormat(locale).day(date);

  if (view?.state === 'ok' && screening) {
    return (
      <ScreeningForm
        clientId={id}
        mode={{ kind: 'edit', date }}
        initial={initialScreeningState({ date, tests: screening.tests, ...(screening.note ? { note: screening.note } : {}) })}
        title={messages.form.editTitle(dateLabel)}
        description={messages.form.editDescription}
        actions={<ScreeningDelete clientId={id} date={date} dateLabel={dateLabel} />}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader back={{ href: `/dashboard/clients/${id}/screening`, label: messages.form.back }} title={messages.form.editTitle(dateLabel)} />
      {!loaded.ok ? <MeasurementProblemAlert title={messages.page.clientUnreadable} problem={loaded.problem} /> : null}
      {view?.state === 'locked' ? <HealthLockAlert field="screening" lock={view.lock} clientId={id} /> : null}
      {view?.state === 'broken' ? <MeasurementProblemAlert title={messages.page.recordUnreadable} problem={view.problem} /> : null}
    </div>
  );
}
