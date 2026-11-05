import type { Metadata } from 'next';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { clientProgramsMessages } from '@/i18n/messages/client-programs';
import { getLocale } from '@/i18n/server';
import { withClientTargets } from '@/lib/client-targets';
import { readAppConfig } from '@/lib/config';
import { listExercises } from '@/lib/exercises';
import { currentClient } from '@/lib/guards';
import { lastDateByDay, programLine } from '@/lib/own-program-text';
import { OWN_PROGRAM_LIMITS, ptProgramName } from '@/lib/own-programs';
import { readOwnOverview } from '@/lib/own-programs-store';
import { todayIn } from '@/lib/format';
import { currentPhaseOf, phaseStatus } from '@/lib/program-plan';
import { effectiveSchedule, todayAssigned } from '@/lib/training-days';
import { ClientHeader } from '../../../client-header';
import { CopyDaySheet } from '../copy-day-sheet';
import { MakeActiveButton } from '../program-actions';
import { ProgramDays } from '../program-days';

export async function generateMetadata(): Promise<Metadata> {
  return { title: ptProgramName(await getLocale()) };
}

/**
 * Antrenörünün programı, salt okuma (`docs/design/kendi-program.md` §2.2): şu anki evrenin programları atandıkları
 * günlerle, danışanın dilinde ve danışanın hedefleriyle (Bugün'deki gibi), öteki evreler altta kapalı. Her programın
 * altında "Kendi programına kopyala". Kalıcı seçim kendi programsa "Bugün'ün programı yap". Programın değişiklik geçmişi danışana gösterilmez.
 */
export default async function PtProgramPage() {
  const locale = await getLocale();
  const [client, config, exercises] = await Promise.all([currentClient(), readAppConfig(), listExercises(undefined, locale)]);
  const t = clientProgramsMessages(locale).pages;
  const PT_PROGRAM_NAME = ptProgramName(locale);
  const overview = await readOwnOverview(client.id).catch(() => null);
  const back = { href: '/me/programlar', label: t.title };
  const program = overview?.pt?.program ?? null;
  const phase = program ? currentPhaseOf(program)?.phase : undefined;

  if (!overview || !program || !phase) {
    return (
      <main className="flex flex-col gap-6">
        <ClientHeader client={client} appName={config.appName} title={PT_PROGRAM_NAME} back={back} />
        <Alert>
          <AlertTitle>{overview?.pt === null ? t.ptNone : t.ptUnavailable}</AlertTitle>
          {overview?.pt === null ? null : <AlertDescription>{t.tryLaterTell}</AlertDescription>}
        </Alert>
      </main>
    );
  }

  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const withTargets = (days: typeof phase.days) => days.map((day) => ({ ...day, blocks: withClientTargets(day.blocks, program.clientTargets) }));
  const lastByDay = lastDateByDay(overview.sessions);
  const status = phaseStatus(program, new Date());
  const others = program.phased ? program.phases.filter((item) => item.id !== phase.id) : [];
  const own = overview.state.index.items.map((item) => ({ id: item.id, name: item.name, days: item.days }));
  const canCreate = overview.state.index.items.length + overview.state.unreadable.length < OWN_PROGRAM_LIMITS.programs;
  const active = overview.state.index.active?.programId ?? null;
  // Bugüne atanmış program, uygulamanın saat diliminde (Bugün kartıyla aynı kural).
  const todayId = todayAssigned(phase.days, todayIn(config.timeZone))?.id ?? null;
  const copy = (day: { id: string; name: string }) => <CopyDaySheet dayId={day.id} dayName={day.name} programs={own} canCreate={canCreate} />;

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <ClientHeader client={client} appName={config.appName} title={PT_PROGRAM_NAME} back={back} />
        <p className="text-sm text-muted-foreground tabular-nums">
          {programLine({ days: phase.days.length, weekdays: effectiveSchedule(program).weekdays, daysPerWeek: phase.daysPerWeek }, undefined, locale)}
        </p>
        {program.phased ? (
          <p className="text-sm text-muted-foreground tabular-nums">
            {t.phase(phase.name)}
            {phase.weeks !== undefined ? t.phaseWeek(Math.min(status.week, phase.weeks), phase.weeks) : ''}
          </p>
        ) : null}
        {active ? <MakeActiveButton programId={null} name={PT_PROGRAM_NAME} className="h-11 self-start" /> : null}
      </div>

      <ProgramDays days={withTargets(phase.days)} exercises={byId} todayId={todayId} lastByDay={lastByDay} action={copy} />

      {others.map((other) => (
        <details key={other.id} className="group flex flex-col gap-3">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-muted-foreground">
            {program.phases.indexOf(other) > program.phases.indexOf(phase) ? t.nextPhase : t.previousPhase}: {other.name}
            {other.weeks !== undefined ? t.phaseWeeks(other.weeks) : ''}
          </summary>
          <ProgramDays days={withTargets(other.days)} exercises={byId} todayId={null} lastByDay={lastByDay} action={copy} />
        </details>
      ))}
    </main>
  );
}
