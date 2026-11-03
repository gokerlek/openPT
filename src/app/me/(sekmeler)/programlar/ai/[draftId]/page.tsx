import { notFound, redirect } from 'next/navigation';
import { currentClient } from '@/lib/guards';
import { readAppConfig } from '@/lib/config';
import { coachAccess } from '@/lib/ai/coach-contract';
import { assistantDeps } from '@/lib/ai/assistant-service';
import { coachClientSession } from '@/lib/ai/coach-session';
import { readAssistant, permissionHash } from '@/lib/ai/assistant-routes';
import { ownEditorLibrary, readOwnOverview } from '@/lib/own-programs-store';
import { clientTemplates } from '@/lib/templates';
import { bodyWithAssignments } from '@/lib/program-plan';
import { OwnProgramForm } from '@/components/program/own-program-form';
import { ClientHeader } from '../../../../client-header';
export const metadata = { title: 'AI taslağını düzenle' };
export default async function AIDraftPage({ params }: { params: Promise<{ draftId: string }> }) {
  const [client, config, { draftId }] = await Promise.all([currentClient(), readAppConfig(), params]);
  if (coachAccess(client) !== 'ready') redirect('/me/programlar');
  const deps = assistantDeps(coachClientSession);
  const { store } = await readAssistant(deps, client.id);
  const draft = store.drafts.find(d => d.id === draftId && d.permissionHash === permissionHash(deps, client));
  if (!draft) notFound();
  if (draft.status === 'saved') redirect(draft.savedBy === 'client' ? `/me/programlar/${draft.programId}` : '/me/programlar/antrenor');
  const [overview, library, templates] = await Promise.all([readOwnOverview(client.id), ownEditorLibrary(client), clientTemplates().catch(() => [])]);
  // Gün başına atamadan önceki taslak (program düzeyinde `weekdays`) okunan eski dosya gibi atanır: form o alanı okumaz.
  const body = bodyWithAssignments(draft.body);
  return <main className="flex flex-col gap-6"><ClientHeader client={client} appName={config.appName} title="AI taslağını düzenle" back={{ href: '/me/programlar', label: 'Program' }} />
    <p className="rounded-xl border bg-muted/30 p-4 text-sm leading-relaxed">Programları, günlerini, hareketleri ve setleri kontrol et. Kaydedince kendi programın olarak PT’ye görünür; PT gerektiğinde düzenleyebilir. Mevcut PT programın değişmez. Hedef veya kayıtların değiştiyse yeni taslak hazırla.</p>
    <OwnProgramForm mode="own" clientId={client.id} programId={draft.programId} draftIdentity={draft.id} creating initial={{ name: draft.name, currentPhaseId: body.currentPhaseId, phases: body.phases }} base={null} exercises={library.exercises} devices={library.devices} templates={templates} otherNames={overview.state.index.items.map(i => i.name)} timeZone={config.timeZone} saveUrl={`/api/me/coach/drafts/${draft.id}`} doneHref="/me/programlar/{id}" />
  </main>;
}
