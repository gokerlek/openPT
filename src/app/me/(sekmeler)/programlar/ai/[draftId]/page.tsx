import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { currentClient } from '@/lib/guards';
import { readAppConfig } from '@/lib/config';
import { getLocale } from '@/i18n/server';
import { coachMessages } from '@/i18n/messages/coach';
import { coachAccess } from '@/lib/ai/coach-contract';
import { assistantDeps } from '@/lib/ai/assistant-service';
import { coachClientSession } from '@/lib/ai/coach-session';
import { readAssistant, permissionHash } from '@/lib/ai/assistant-routes';
import { ownEditorLibrary, readOwnOverview } from '@/lib/own-programs-store';
import { clientTemplates } from '@/lib/templates';
import { bodyWithAssignments } from '@/lib/program-plan';
import { OwnProgramForm } from '@/components/program/own-program-form';
import { ClientHeader } from '../../../../client-header';
export async function generateMetadata(): Promise<Metadata> {
  return { title: coachMessages(await getLocale()).draftPages.client.title };
}
export default async function AIDraftPage({ params }: { params: Promise<{ draftId: string }> }) {
  const [client, config, { draftId }, locale] = await Promise.all([currentClient(), readAppConfig(), params, getLocale()]);
  const t = coachMessages(locale).draftPages.client;
  if (coachAccess(client) !== 'ready') redirect('/me/programlar');
  const deps = assistantDeps(coachClientSession, undefined, locale);
  const { store } = await readAssistant(deps, client.id);
  const draft = store.drafts.find(d => d.id === draftId && d.permissionHash === permissionHash(deps, client));
  if (!draft) notFound();
  if (draft.status === 'saved') redirect(draft.savedBy === 'client' ? `/me/programlar/${draft.programId}` : '/me/programlar/antrenor');
  // i18n-followup(T3): `ownEditorLibrary` hazır egzersiz ve cihaz adlarını dilsiz (Türkçe) okur; `locale` alıp `listExercises`/`listDevices`'a vermeli.
  const [overview, library, templates] = await Promise.all([readOwnOverview(client.id), ownEditorLibrary(client), clientTemplates().catch(() => [])]);
  // Gün başına atamadan önceki taslak (program düzeyinde `weekdays`) okunan eski dosya gibi atanır: form o alanı okumaz.
  const body = bodyWithAssignments(draft.body);
  return <main className="flex flex-col gap-6"><ClientHeader client={client} appName={config.appName} title={t.title} back={{ href: '/me/programlar', label: t.back }} />
    <p className="rounded-xl border bg-muted/30 p-4 text-sm leading-relaxed">{t.notice}</p>
    <OwnProgramForm mode="own" clientId={client.id} programId={draft.programId} draftIdentity={draft.id} creating initial={{ name: draft.name, currentPhaseId: body.currentPhaseId, phases: body.phases }} base={null} exercises={library.exercises} devices={library.devices} templates={templates} otherNames={overview.state.index.items.map(i => i.name)} timeZone={config.timeZone} saveUrl={`/api/me/coach/drafts/${draft.id}`} doneHref="/me/programlar/{id}" />
  </main>;
}
