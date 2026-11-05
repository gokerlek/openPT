import type { Metadata } from 'next';
import { Info } from '@phosphor-icons/react/dist/ssr';
import { SectionHeader } from '@/components/section-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { Locale } from '@/i18n/locale';
import { screeningMessages } from '@/i18n/messages/screening';
import { getLocale, getMessages } from '@/i18n/server';
import { canRecordHealth } from '@/lib/client-status';
import { readAppConfig } from '@/lib/config';
import { awaitsOpinion, constraintTitle, constraintsOf, isActive } from '@/lib/constraints';
import { todayIn } from '@/lib/format';
import { requirePt } from '@/lib/guards';
import { loadHealthPart } from '@/lib/health';
import type { Constraint } from '@/lib/schemas/health';
import { presetFromConstraints } from '@/lib/screening';
import { HealthLockAlert } from '../../health-page';
import { MeasurementProblemAlert, measurementClient } from '../../measurements/measurement-page';
import { ScreeningForm } from '../screening-form';
import { initialScreeningState } from '../screening-state';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(screeningMessages)).form.title };
}

/** Etkin kısıtlar başlıkta (tasarım §4.5): görüşü alınmamış kırmızı bayrak bölgesine değen testler "Yapılmadı (kısıt)" hazır. */
function ConstraintsNote({ constraints, locale }: { constraints: Constraint[]; locale: Locale }) {
  if (constraints.length === 0) return null;
  const t = screeningMessages(locale).form;
  const waiting = constraints.filter(awaitsOpinion);
  return (
    <Alert>
      <Info weight="fill" />
      <AlertTitle>{t.constraintsTitle}</AlertTitle>
      <AlertDescription>
        <p>{constraints.map((item) => `${constraintTitle(item, locale)}${awaitsOpinion(item) ? t.awaitingOpinion : ''}`).join(' · ')}</p>
        <p>{waiting.length > 0 ? t.constraintsWaiting : t.constraintsNote}</p>
      </AlertDescription>
    </Alert>
  );
}

/** Tarama girişi: gün bugün (uygulamanın saat dilimi), yalnız doldurulan testler kaydedilir. */
export default async function NewScreeningPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePt();
  const { id } = await params;
  const locale = await getLocale();
  const messages = screeningMessages(locale);
  const TITLE = messages.form.title;
  const [loaded, config] = await Promise.all([measurementClient(id), readAppConfig()]);
  const view = loaded.ok ? await loadHealthPart(loaded.client, 'screening', locale) : null;

  if (loaded.ok && view?.state === 'ok') {
    const today = todayIn(config.timeZone);
    // Kısıtlar yalnız onaylıysa okunur.
    const constraints = canRecordHealth(loaded.client, 'conditions') ? constraintsOf(view.record).filter(isActive) : [];
    return (
      <ScreeningForm
        clientId={id}
        mode={{ kind: 'new', today, screenedDates: (view.record.screenings ?? []).map((item) => item.date) }}
        initial={initialScreeningState({ date: today, preset: presetFromConstraints(constraints) })}
        title={TITLE}
        description={messages.form.newDescription}
        constraintsNote={<ConstraintsNote constraints={constraints} locale={locale} />}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader back={{ href: `/dashboard/clients/${id}/screening`, label: messages.form.back }} title={TITLE} />
      {!loaded.ok ? <MeasurementProblemAlert title={messages.page.clientUnreadable} problem={loaded.problem} /> : null}
      {view?.state === 'locked' ? <HealthLockAlert field="screening" lock={view.lock} clientId={id} /> : null}
      {view?.state === 'broken' ? <MeasurementProblemAlert title={messages.page.recordUnreadable} problem={view.problem} /> : null}
    </div>
  );
}
