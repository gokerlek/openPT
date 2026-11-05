import * as v from 'valibot';
import { DEFAULT_LOCALE } from '../../i18n/locale.ts';
import { coachMessages } from '../../i18n/messages/coach/index.ts';
import { langConfig } from '../../i18n/valibot.ts';
import { postGuard, type RouteResult } from '../client-auth-routes.ts';
import { clientIdSchema, type Client } from '../schemas/client.ts';
import { ownProgramSaveSchema, type OwnProgramSaveBody } from '../schemas/own-program.ts';
import { coachSensitiveIntent, eligibleExercises } from './coach-engine.ts';
import { coachAccess, type CoachProposal } from './coach-contract.ts';
import type { CoachDeps } from './coach-routes.ts';
import { programFormSchema } from '../schemas/program.ts';
import { assistantAttention, assistantProgram } from './assistant-engine.ts';
import { ASSISTANT_PATH, assistantStoreSchema, assistantRequestSchema, emptyAssistant, type AssistantDraft, type AssistantStore, type InterpretedGoal } from './assistant-contract.ts';

export type AssistantDeps = CoachDeps & {
  interpret: (id: string, role: 'pt' | 'client', text: string) => Promise<InterpretedGoal>;
  ownId: () => string;
  saveOwn: (client: Client, draft: AssistantDraft, body: OwnProgramSaveBody) => Promise<RouteResult>;
};
const fail = (status: number, error: string): RouteResult => ({ status, body: { error } });
export const permissionHash = (deps: Pick<CoachDeps, 'hash'>, client: Client) => deps.hash({ status: client.status, modules: client.modules, consents: client.consents });
async function auth(deps: CoachDeps, id: string) {
  const session = await deps.session();
  if (!session || !v.is(clientIdSchema, id) || (session.role === 'client' && session.clientId !== id)) return null;
  const client = await deps.client(id); return client ? { client, role: session.role } : null;
}
export async function readAssistant(deps: Pick<CoachDeps, 'repo'>, id: string) {
  const stored = await deps.repo(id).read(ASSISTANT_PATH);
  return { store: stored ? v.parse(assistantStoreSchema, stored.content) : emptyAssistant(), sha: stored?.sha };
}
async function write(deps: CoachDeps, id: string, store: AssistantStore, sha?: string) {
  await deps.repo(id).write(ASSISTANT_PATH, v.parse(assistantStoreSchema, store), { sha, message: coachMessages(deps.locale ?? DEFAULT_LOCALE).assistant.commit });
  deps.repo(id).noticesChanged();
}
export async function getAssistant(deps: CoachDeps, id: string): Promise<RouteResult> {
  const t = coachMessages(deps.locale ?? DEFAULT_LOCALE).assistant;
  const who = await auth(deps, id); if (!who) return fail(403, t.forbidden);
  const access = coachAccess(who.client);
  if (access !== 'ready') return { status: 200, body: { clientName: who.client.name, access, connection: null, drafts: [], reviews: [], exercises: [] } };
  const [{ store }, connection, data] = await Promise.all([readAssistant(deps, id), deps.connection(id, who.role), deps.context(who.client)]);
  const fresh = await auth(deps, id);
  if (!fresh || coachAccess(fresh.client) !== 'ready' || permissionHash(deps, fresh.client) !== permissionHash(deps, who.client) || (deps.permissionsUnchanged && !await deps.permissionsUnchanged())) return fail(403, t.permissionsChanged);
  const allowed = data.context.global ? deps.hash([permissionHash(deps, who.client), data.hash]) : permissionHash(deps, who.client);
  return { status: 200, body: { clientName: who.client.name, access, connection, global: !!data.context.global,
    drafts: store.drafts.filter(d => d.permissionHash === allowed), reviews: store.reviews.filter(r => r.permissionHash === allowed),
    exercises: data.context.exercises.map(e => ({ id: e.id, title: e.title, equipment: e.equipment, trackingType: e.trackingType, primaryMuscles: e.primaryMuscles })),
  } };
}
export async function requestAssistant(deps: AssistantDeps, headers: Headers, origin: string, id: string, input: unknown): Promise<RouteResult> {
  const locale = deps.locale ?? DEFAULT_LOCALE, messages = coachMessages(locale), t = messages.assistant;
  const blocked = postGuard(headers, origin, locale); if (blocked) return blocked;
  const who = await auth(deps, id); if (!who || coachAccess(who.client) !== 'ready') return fail(403, messages.guard.disabled);
  const parsed = v.safeParse(assistantRequestSchema, input, langConfig(locale)); if (!parsed.success) return fail(400, t.invalidRequest);
  const request = parsed.output, loaded = await readAssistant(deps, id), now = deps.now(), hash = deps.hash(request);
  const duplicate = loaded.store.requests.find(r => r.id === request.requestId);
  if (duplicate) {
    if (duplicate.hash !== hash) return fail(409, t.requestIdReused);
    const view = await getAssistant(deps, id);
    return view.status === 200 ? { ...view, body: { ...view.body as object, ...(duplicate.interpreted ? { interpreted: duplicate.interpreted } : {}) } } : view;
  }
  if (loaded.store.pending && now.getTime() - Date.parse(loaded.store.pending.at) < 120000) return fail(409, t.inProgress);
  if (loaded.store.requests.filter(r => now.getTime() - Date.parse(r.at) < 86400000).length >= 30) return fail(429, t.dailyLimit);
  await write(deps, id, { ...loaded.store, pending: { id: request.requestId, at: now.toISOString() } }, loaded.sha);
  try {
    const data = await deps.context(who.client), allowed = data.context.global ? deps.hash([permissionHash(deps, who.client), data.hash]) : permissionHash(deps, who.client);
    const initialPermission = permissionHash(deps, who.client);
    let interpreted: InterpretedGoal | undefined;
    let draft: AssistantDraft | undefined;
    let review: AssistantStore['reviews'][number] | undefined;
    if (request.action === 'interpret') {
      if (data.context.global) return fail(400, t.pickClient);
      const sensitive = coachSensitiveIntent(request.text);
      if (sensitive) interpreted = { intent: sensitive, goal: null, fullBody: null, muscles: [], weekdays: null, minutes: null, equipment: null };
      else {
        if (!await deps.connection(id, who.role)) return fail(409, t.needsConnection);
        interpreted = await deps.interpret(id, who.role, request.text);
      }
    } else if (request.action === 'generate') {
      const result = assistantProgram(data.context, request.selection, request.kind, prefix => deps.id(prefix), who.role, locale);
      if ('error' in result) return fail(400, result.error!);
      draft = { id: deps.id(), programId: deps.ownId(), name: t.draftName(request.kind, now.toISOString().slice(0, 10), deps.id().slice(0, 4)), at: now.toISOString(), kind: request.kind, selection: request.selection, ...result, contextHash: data.hash, permissionHash: allowed, baseRevision: data.baseRevision, ...(data.baseCreatedAt ? { baseCreatedAt: data.baseCreatedAt } : {}), status: 'draft' };
    } else {
      const insights = data.context.insights ?? [{ title: t.reviewFallback.title, finding: data.context.facts.slice(0, 3).map(f => f.text).join(' ') || t.reviewFallback.noRecords, next: t.reviewFallback.next, sources: data.context.facts.slice(0, 3).map(f => f.source) }];
      review = { id: request.requestId, at: now.toISOString(), permissionHash: allowed, insights, text: insights.map(i => `${i.title}: ${i.finding}\n${i.next}`).join('\n\n'), sources: [...new Set(insights.flatMap(i => i.sources))] };
    }
    const freshWho = await auth(deps, id);
    if (!freshWho || coachAccess(freshWho.client) !== 'ready' || permissionHash(deps, freshWho.client) !== initialPermission || (deps.permissionsUnchanged && !await deps.permissionsUnchanged())) return fail(403, t.permissionsRevoked);
    const fresh = await readAssistant(deps, id);
    if (fresh.store.pending?.id !== request.requestId) return fail(409, messages.guard.requestChanged);
    const { pending: _pending, ...next } = fresh.store;
    next.requests = [...next.requests.filter(r => now.getTime() - Date.parse(r.at) < 86400000), { id: request.requestId, hash, at: now.toISOString(), ...(interpreted ? { interpreted } : {}) }];
    if (draft) next.drafts = [...next.drafts, draft].slice(-20);
    if (review) next.reviews = [...next.reviews, review].slice(-10);
    await write(deps, id, next, fresh.sha);
    const view = await getAssistant(deps, id);
    return view.status === 200 ? { ...view, body: { ...view.body as object, ...(interpreted ? { interpreted } : {}) } } : view;
  } finally {
    const fresh = await readAssistant(deps, id);
    if (fresh.store.pending?.id === request.requestId) { const { pending: _pending, ...next } = fresh.store; await write(deps, id, next, fresh.sha); }
  }
}
export function draftProposal(draft: AssistantDraft): CoachProposal {
  return { id: draft.id, at: draft.at, expiresAt: new Date(Date.parse(draft.at) + 72 * 3600000).toISOString(), status: 'pending', body: draft.body, rationale: draft.rationale, conditions: draft.selection.conditions, contextHash: draft.contextHash, baseRevision: draft.baseRevision, baseCreatedAt: draft.baseCreatedAt, exerciseTitles: {} };
}
export async function saveAssistantDraft(deps: AssistantDeps, headers: Headers, origin: string, id: string, draftId: string, input: unknown, by: 'pt' | 'client'): Promise<RouteResult> {
  const locale = deps.locale ?? DEFAULT_LOCALE, messages = coachMessages(locale), t = messages.assistant;
  const blocked = postGuard(headers, origin, locale); if (blocked) return blocked;
  const who = await auth(deps, id);
  if (!who || who.role !== by || coachAccess(who.client) !== 'ready') return fail(403, t.saveForbidden);
  const loaded = await readAssistant(deps, id), draft = loaded.store.drafts.find(d => d.id === draftId);
  if (!draft) return fail(404, messages.guard.draftNotFound);
  if (draft.permissionHash !== permissionHash(deps, who.client)) return fail(412, t.draftPermissionsChanged);
  const parsed = by === 'client' ? v.safeParse(ownProgramSaveSchema, input, langConfig(locale)) : null;
  if (by === 'client' && (!parsed?.success || parsed.output.baseRevision !== null || !parsed.output.name)) return fail(400, t.ownProgramInvalid);
  const edited = by === 'pt' && input !== null ? v.safeParse(programFormSchema, input, langConfig(locale)) : null;
  if (edited && !edited.success) return fail(400, t.programInvalid);
  const effectiveBody = edited?.success ? edited.output : draft.body;
  const body = parsed?.success ? parsed.output : null, savedHash = deps.hash({ by, body: body ?? effectiveBody });
  if (draft.savedHash && draft.savedHash !== savedHash) return fail(409, t.saveStarted);
  if (draft.status === 'saved') return { status: 200, body: { id: by === 'client' ? draft.programId : id, unchanged: true, ...(draft.savedRevision ? { revision: draft.savedRevision } : {}) } };
  if (loaded.store.pending) return fail(409, t.preparing);
  const data = await deps.context(who.client);
  if (data.context.global) return fail(403, t.globalNoSave);
  if (draft.status === 'draft' && (data.hash !== draft.contextHash || deps.now().getTime() - Date.parse(draft.at) > 72 * 3600000)) return fail(412, t.draftStale);
  {
    const eligible = new Set(eligibleExercises(data.context).map(e => e.id));
    if ((body ?? effectiveBody).phases.some(p => p.days.some(d => d.blocks.some(b => b.rows.some(r => !eligible.has(r.exerciseId)))))) return fail(400, t.exerciseMismatch);
  }
  if (by === 'pt') { draft.body = effectiveBody; draft.attention = assistantAttention(data.context, draft.selection, effectiveBody, locale); }
  draft.status = 'saving'; draft.savedHash = savedHash; draft.savedBy = by;
  await write(deps, id, loaded.store, loaded.sha);
  const freshWho = await auth(deps, id);
  if (!freshWho || coachAccess(freshWho.client) !== 'ready' || permissionHash(deps, freshWho.client) !== draft.permissionHash) return fail(403, t.savePermissionsChanged);
  let result: RouteResult;
  if (by === 'client' && body) result = await deps.saveOwn(freshWho.client, draft, body);
  else {
    const proposal = draftProposal(draft);
    if (!await deps.published(id, proposal)) await deps.publish(id, proposal);
    result = { status: 200, body: { id } };
  }
  const fresh = await readAssistant(deps, id), found = fresh.store.drafts.find(d => d.id === draft.id);
  if (found) {
    if (result.status < 300) { found.status = 'saved'; found.savedAt = deps.now().toISOString(); if (body) { found.name = body.name!; found.body = v.parse(programFormSchema, { ...body, phased: false }); found.attention = assistantAttention(data.context, found.selection, found.body, locale); found.rationale = [t.savedOwnRationale(found.body.phases.flatMap(p => p.days).length), ...found.rationale.slice(1)]; }
      if ('revision' in (result.body as object) && typeof (result.body as { revision?: unknown }).revision === 'number') found.savedRevision = (result.body as { revision: number }).revision; }
    else { found.status = 'draft'; delete found.savedHash; delete found.savedBy; }
    await write(deps, id, fresh.store, fresh.sha);
  }
  return result;
}
