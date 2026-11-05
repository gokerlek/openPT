import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Bandaids, CheckCircle, PencilSimple } from '@phosphor-icons/react/dist/ssr';
import { ChangeLog } from '@/components/program/change-log';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { clientProgramsMessages } from '@/i18n/messages/client-programs';
import { getLocale, getMessages } from '@/i18n/server';
import { loadCareInput } from '@/lib/client-care';
import { readAppConfig } from '@/lib/config';
import { programConflicts } from '@/lib/constraint-filter';
import { listExercises } from '@/lib/exercises';
import { getFormat, todayIn } from '@/lib/format';
import { currentClient } from '@/lib/guards';
import { activeProgramId } from '@/lib/own-program-index';
import { lastDateByDay, programLine } from '@/lib/own-program-text';
import { isOwnProgramId, ownSummaryOf } from '@/lib/own-programs';
import { readOwnOverview, readOwnProgramOf } from '@/lib/own-programs-store';
import { todayAssigned } from '@/lib/training-days';
import { ClientHeader } from '../../../client-header';
import { DeleteOwnProgram, MakeActiveButton, MarkPtEditSeen, ShareSwitch } from '../program-actions';
import { ProgramDays } from '../program-days';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(clientProgramsMessages)).pages.ownTitle };
}

/** Değişikliklerin ilk gösterilen kayıt sayısı (§2.3). */
const LOG_INITIAL = 5;

/**
 * Kendi programın (`docs/design/kendi-program.md` §2.3): programlar salt okuma (atandığı günler, "bugün", "son: 19
 * Eyl"), Düzenle, Bugün'ün programı (rozet ya da tek dokunuşla seçim), antrenörle paylaşım, değişiklikler (etiketler görene göre,
 * §7.3) ve silme. Adresteki kimlik kalıba uymuyorsa ya da program yoksa 404. Açılınca PT'nin düzenlemesi görüldü
 * sayılır (rozet düşer). Kısıtlar onaylıyken kısıtının yasakladığı satırlar en üstte (`kisit-tarama.md` §3.7): gerekçe
 * yok, gün ve hareket.
 */
export default async function OwnProgramPage({ params }: { params: Promise<{ pid: string }> }) {
  const [client, config, { pid }, locale] = await Promise.all([currentClient(), readAppConfig(), params, getLocale()]);
  const t = clientProgramsMessages(locale).pages;
  if (!isOwnProgramId(pid)) notFound();
  const [read, overview, exercises] = await Promise.all([readOwnProgramOf(client.id, pid), readOwnOverview(client.id).catch(() => null), listExercises(undefined, locale)]);
  const back = { href: '/me/programlar', label: t.title };
  if (read.status === 'missing') notFound();

  const active = activeProgramId(overview?.state.index) === pid;

  if (read.status === 'invalid') {
    const name = read.name ?? t.unreadableName;
    return (
      <main className="flex flex-col gap-6">
        <ClientHeader client={client} appName={config.appName} title={name} back={back} />
        <Alert>
          <AlertTitle>{t.programUnavailable}</AlertTitle>
          <AlertDescription>{t.invalidFile}</AlertDescription>
        </Alert>
        <DeleteOwnProgram clientId={client.id} programId={pid} name={read.name ?? t.thisProgram} active={active} shared={false} />
      </main>
    );
  }

  const program = read.program;
  const phase = program.phases[0];
  const item = overview?.state.index.items.find((row) => row.id === pid);
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const lastByDay = overview ? lastDateByDay(overview.sessions) : new Map<string, string>();
  const today = todayIn(config.timeZone);
  const careInput = await loadCareInput(client, today, locale);
  const conflicts = careInput ? programConflicts(program, byId, careInput, today) : [];

  return (
    <main className="flex flex-col gap-6">
      <MarkPtEditSeen clientId={client.id} programId={pid} editedAt={item?.ptEditedAt} />
      <div className="flex flex-col gap-2">
        <ClientHeader client={client} appName={config.appName} title={program.name} back={back} />
        <p className="text-sm text-muted-foreground tabular-nums">{programLine(ownSummaryOf(program), undefined, locale)}</p>
        {active ? (
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <CheckCircle weight="fill" className="size-4 text-primary-text" />
            {t.todaysProgram}
          </p>
        ) : (
          <MakeActiveButton programId={pid} name={program.name} className="h-11 self-start" />
        )}
      </div>

      {conflicts.length > 0 ? (
        <Alert>
          <Bandaids weight="fill" />
          <AlertTitle>{t.conflicts(getFormat(locale).number(conflicts.length), conflicts.length)}</AlertTitle>
          <AlertDescription>
            <p>{conflicts.map((conflict) => `${conflict.dayName} · ${conflict.title}`).join(' · ')}</p>
            <p>{t.conflictsHelp}</p>
          </AlertDescription>
        </Alert>
      ) : null}

      {phase ? <ProgramDays days={phase.days} exercises={byId} todayId={todayAssigned(phase.days, today)?.id ?? null} lastByDay={lastByDay} /> : null}

      <Button variant="outline" size="lg" className="h-11 w-full" nativeButton={false} render={<Link href={`/me/programlar/${pid}/duzenle`} />}>
        <PencilSimple data-icon="inline-start" />
        {t.edit}
      </Button>

      <ShareSwitch programId={pid} name={program.name} shared={Boolean(program.shared)} />

      <Separator />

      <section className="flex flex-col gap-3" aria-labelledby="own-log">
        <h2 id="own-log" className="font-heading text-lg font-semibold">
          {t.changes}
        </h2>
        <ChangeLog entries={program.log} timeZone={config.timeZone} initial={LOG_INITIAL} step={LOG_INITIAL} viewer="client" />
      </section>

      <DeleteOwnProgram clientId={client.id} programId={pid} name={program.name} active={active} shared={Boolean(program.shared)} />
    </main>
  );
}
