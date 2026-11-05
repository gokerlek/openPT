import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { requirePt } from '@/lib/guards';
import { getLocale } from '@/i18n/server';
import { coachMessages } from '@/i18n/messages/coach';
import { readPtSession } from '@/lib/session';
import { readClient } from '@/lib/clients';
import { getAssistant } from '@/lib/ai/assistant-routes';
import { assistantDeps } from '@/lib/ai/assistant-service';
import type { AssistantView } from '@/lib/ai/assistant-contract';
import { listExercises } from '@/lib/exercises';
import { listDevices } from '@/lib/devices';
import { listTemplates, pickerExercises, pickerDevices } from '@/lib/templates';
import { readAppConfig } from '@/lib/config';
import { todayIn } from '@/lib/format';
import { bodyWithAssignments } from '@/lib/program-plan';
import { loadEditorCare } from '@/lib/client-care';
import { EditorBackLink } from '@/components/block-editor/editor-back-link';
import { SectionHeader } from '@/components/section-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ProgramForm } from '../../../program/program-form';
export async function generateMetadata(): Promise<Metadata> {
  return { title: coachMessages(await getLocale()).draftPages.pt.title };
}
export default async function DraftEditor({ params }: { params: Promise<{ id: string; draftId: string }> }) {
  await requirePt();
  const { id, draftId } = await params;
  const locale = await getLocale(), t = coachMessages(locale).draftPages.pt;
  const deps = assistantDeps(readPtSession, undefined, locale), result = await getAssistant(deps, id);
  if (result.status !== 200) notFound();
  const draft = (result.body as AssistantView).drafts.find(d => d.id === draftId);
  if (!draft) notFound();
  if (draft.status === 'saved') redirect(`/dashboard/clients/${id}/program`);
  const [stored, exercises, devices, templates, config] = await Promise.all([readClient(id), listExercises(undefined, locale), listDevices(undefined, locale), listTemplates(), readAppConfig()]);
  if (!stored) notFound();
  const care = await loadEditorCare(stored.client, exercises, todayIn(config.timeZone), { locale });
  return <div className="flex flex-col gap-6">
    <EditorBackLink href={`/dashboard/clients/${id}/program`} label={t.back} />
    <SectionHeader title={t.title} description={t.description} />
    <Alert><AlertDescription>{t.notice}</AlertDescription></Alert>
    {/* Gün başına atamadan önceki taslak (program düzeyinde `weekdays`) okunan eski dosya gibi atanır: form o alanı okumaz. */}
    <ProgramForm clientId={id} aiDraftId={draft.id} mode="create" initial={bodyWithAssignments(draft.body)} base={draft.baseRevision === null ? null : { revision: draft.baseRevision, createdAt: draft.baseCreatedAt }} stored={null} exercises={pickerExercises(exercises)} devices={pickerDevices(devices)} templates={templates.flatMap(t => t.template ? [{ id: t.template.id, name: t.template.name, blocks: t.template.blocks }] : [])} now={new Date().toISOString()} timeZone={config.timeZone} care={care} />
  </div>;
}
