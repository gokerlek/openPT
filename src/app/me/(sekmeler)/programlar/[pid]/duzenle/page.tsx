import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { OwnProgramForm } from '@/components/program/own-program-form';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { clientProgramsMessages } from '@/i18n/messages/client-programs';
import { getLocale, getMessages } from '@/i18n/server';
import { readAppConfig } from '@/lib/config';
import { currentClient } from '@/lib/guards';
import { isOwnProgramId, OWN_PROGRAM_LIMITS } from '@/lib/own-programs';
import { ownEditorLibrary, readOwnOverview, readOwnProgramOf } from '@/lib/own-programs-store';
import { clientTemplates } from '@/lib/templates';
import { ClientHeader } from '../../../../client-header';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(clientProgramsMessages)).pages.editTitle };
}

/**
 * Kendi programın düzenleyicisi (`docs/design/kendi-program.md` §2.5): `OwnProgramForm` danışan kipinde (sade
 * düzenleyici). `?gunler=d_…` antrenörünün programından "Kendi programına kopyala"dan gelir: günler eklenmiş açılır,
 * kaydetmek danışanın işi. Kimlik kalıba uymuyorsa ya da program yoksa 404; bozuk dosya düzenlenmez.
 */
export default async function EditOwnProgramPage({
  params,
  searchParams,
}: {
  params: Promise<{ pid: string }>;
  searchParams: Promise<{ gunler?: string | string[] }>;
}) {
  const [client, config, { pid }, query, locale] = await Promise.all([currentClient(), readAppConfig(), params, searchParams, getLocale()]);
  const t = clientProgramsMessages(locale).pages;
  if (!isOwnProgramId(pid)) notFound();
  const [read, overview, library, templates] = await Promise.all([
    readOwnProgramOf(client.id, pid),
    readOwnOverview(client.id).catch(() => null),
    ownEditorLibrary(client),
    clientTemplates().catch(() => []),
  ]);
  if (read.status === 'missing') notFound();
  const back = { href: `/me/programlar/${pid}`, label: read.status === 'ok' ? read.program.name : t.title };

  if (read.status === 'invalid' || !overview) {
    return (
      <main className="flex flex-col gap-6">
        <ClientHeader client={client} appName={config.appName} title={t.editTitle} back={back} />
        <Alert>
          <AlertTitle>{t.programUnavailable}</AlertTitle>
          <AlertDescription>{t.tryLaterTell}</AlertDescription>
        </Alert>
      </main>
    );
  }

  const program = read.program;
  const ptProgram = overview.pt?.program ?? null;
  const ptDayIds = new Set(ptProgram?.phases.flatMap((phase) => phase.days.map((day) => day.id)) ?? []);
  const wanted = Array.isArray(query.gunler) ? query.gunler[0] : query.gunler;
  const addPtDayIds = (wanted ?? '')
    .split(',')
    .filter((id) => ptDayIds.has(id))
    .slice(0, OWN_PROGRAM_LIMITS.days);

  return (
    <main className="flex flex-col gap-6">
      <ClientHeader client={client} appName={config.appName} title={t.editNamed(program.name)} back={back} />
      <OwnProgramForm
        mode="own"
        clientId={client.id}
        programId={pid}
        creating={false}
        initial={{ name: program.name, currentPhaseId: program.current.phaseId, phases: program.phases }}
        base={{ revision: program.revision, createdAt: program.createdAt }}
        exercises={library.exercises}
        devices={library.devices}
        ptProgram={ptProgram ? { phases: ptProgram.phases, clientTargets: ptProgram.clientTargets } : null}
        templates={templates}
        otherNames={overview.state.index.items.filter((item) => item.id !== pid).map((item) => item.name)}
        timeZone={config.timeZone}
        saveUrl={`/api/me/programs/${pid}`}
        doneHref="/me/programlar/{id}"
        {...(addPtDayIds.length > 0 ? { addPtDayIds } : {})}
      />
    </main>
  );
}
