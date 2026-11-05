import type { Metadata } from 'next';
import { SectionHeader } from '@/components/section-header';
import { healthMessages } from '@/i18n/messages/health';
import { getLocale, getMessages } from '@/i18n/server';
import { readAppConfig } from '@/lib/config';
import { listExercises } from '@/lib/exercises';
import { todayIn } from '@/lib/format';
import { requirePt } from '@/lib/guards';
import { loadHealthPart } from '@/lib/health';
import { HealthLockAlert } from '../../health-page';
import { MeasurementProblemAlert, measurementClient } from '../../measurements/measurement-page';
import { ConstraintFormView } from '../constraint-form';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(healthMessages)).constraintForm.newTitle };
}

/** Yeni kısıt (tasarım `kisit-tarama.md` §2.3): sayfa, modal değil. PT'nin kaydı onaylı başlar. */
export default async function NewConstraintPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePt();
  const { id } = await params;
  const locale = await getLocale();
  const messages = healthMessages(locale);
  const TITLE = messages.constraintForm.newTitle;
  const [loaded, config] = await Promise.all([measurementClient(id), readAppConfig()]);
  const view = loaded.ok ? await loadHealthPart(loaded.client, 'conditions', locale) : null;

  if (view?.state === 'ok') {
    const library = await listExercises(undefined, locale);
    return (
      <ConstraintFormView
        clientId={id}
        mode={{ kind: 'new' }}
        initial={{ avoid: [] }}
        library={library}
        today={todayIn(config.timeZone)}
        title={TITLE}
        description={messages.constraintForm.newDescription}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader back={{ href: `/dashboard/clients/${id}/constraints`, label: messages.constraintForm.back }} title={TITLE} />
      {!loaded.ok ? <MeasurementProblemAlert title={messages.constraintsPage.clientUnreadable} problem={loaded.problem} /> : null}
      {view?.state === 'locked' ? <HealthLockAlert field="conditions" lock={view.lock} clientId={id} /> : null}
      {view?.state === 'broken' ? <MeasurementProblemAlert title={messages.constraintsPage.recordUnreadable} problem={view.problem} /> : null}
    </div>
  );
}
