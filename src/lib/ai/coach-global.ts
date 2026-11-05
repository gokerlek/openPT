import 'server-only';
import { createHash } from 'node:crypto';
import { DEFAULT_LOCALE, type Locale } from '@/i18n/locale';
import { LocalizedError } from '@/i18n/errors';
import { coachMessages } from '@/i18n/messages/coach';
import { readPtSession } from '@/lib/session';
import { listClients } from '@/lib/clients';
import { appRepo, gh, owner } from '@/lib/github/client';
import { readJson, writeJson } from '@/lib/github/files';
import { geminiApiKey } from './gemini-key';
import { coachContext, coachDeps } from './coach-service';
import { type Client } from '@/lib/schemas/client';
import { ASSISTANT_PATH } from './assistant-contract';
import { coachAccess, COACH_PATH } from './coach-contract';
import { EMPTY_CARE } from '@/lib/constraint-filter';
import type { CoachInsight } from './coach-review';
import { hashableFacts, type CoachExercise, type CoachFact } from './coach-engine';
import type { SessionRepo } from '@/lib/session-files-core';

export const PT_COACH_ID = 'c_ptgeneral';
const generalClient = (locale: Locale): Client => ({ id: PT_COACH_ID, name: coachMessages(locale).general.clientName, status: 'active', createdAt: '2026-10-05T00:00:00.000Z', modules: { health: { enabled: false, fields: [] }, ai: { enabled: true } }, consents: {}, access: { version: 1 }, visibleTo: [] });
function generalRepo(): SessionRepo {
  // This route uses only these two operations. Keep the ordinary coach's atomic SHA reservation.
  const privateRepo = async () => {
    const result = await gh().rest.repos.get({ owner: owner(), repo: appRepo() });
    if (!result.data.private || result.data.fork) throw new LocalizedError(l => coachMessages(l).internal.general.privateRepo);
  };
  const path = (value: string) => { if (value === ASSISTANT_PATH) return 'ai/pt-assistant.json'; if (value !== COACH_PATH) throw new LocalizedError(l => coachMessages(l).internal.general.invalidFile); return 'ai/pt-coach.json'; };
  const unsupported = async (): Promise<never> => { throw new LocalizedError(l => coachMessages(l).internal.general.readOnly); };
  return { read: async value => { await privateRepo(); return readJson(appRepo(), path(value)); }, write: async (value, data, options) => { await privateRepo(); return writeJson(appRepo(), path(value), data, options); }, head: unsupported, readBlob: unsupported, listSessions: unsupported, listFolder: unsupported, commit: unsupported, invalidate: () => {}, noticesChanged: () => {}, log: () => {} };
}
export function generalCoachDeps(locale: Locale = DEFAULT_LOCALE) {
  const deps = coachDeps(async () => await readPtSession(), locale);
  deps.client = async id => id === PT_COACH_ID ? generalClient(locale) : null;
  deps.repo = generalRepo;
  deps.connection = async () => await geminiApiKey() ? 'pt' : null;
  const permissionHash = (items: Awaited<ReturnType<typeof listClients>>) => createHash('sha256').update(JSON.stringify(items.map(item => item.ok ? { id: item.client.id, status: item.client.status, modules: item.client.modules, consents: item.client.consents } : { id: item.id, ok: false }))).digest('hex');
  let permissions = '';
  deps.permissionsUnchanged = async () => permissionHash(await listClients()) === permissions;
  deps.context = async () => {
    const clients = await listClients();
    permissions = permissionHash(clients);
    const allowed = clients.flatMap(item => item.ok && coachAccess(item.client) === 'ready' ? [item.client] : []);
    let exercises: CoachExercise[] = [];
    const insights: CoachInsight[] = [];
    // Her danışanın özeti iki dilde tutulur: `shown` isteğin dilinde, `canonical` değişiklik denetimi için Türkçe.
    const snapshots: { client: Client; shown: CoachFact[] | null; canonical: CoachFact[] | null }[] = [];
    // Read sequentially to avoid exhausting GitHub's concurrent request quota on large rosters.
    for (const client of allowed) {
      try {
        const snapshot = await coachContext(client, locale);
        exercises = snapshot.context.exercises;
        insights.push(...(snapshot.context.insights ?? []).map(i => ({ ...i, title: `${client.name} · ${i.title}` })));
        snapshots.push({ client, shown: snapshot.context.facts, canonical: snapshot.canonicalFacts });
      } catch { snapshots.push({ client, shown: null, canonical: null }); }
    }
    const compose = (l: Locale, pick: (item: (typeof snapshots)[number]) => CoachFact[] | null) => {
      const t = coachMessages(l).general;
      const facts: CoachFact[] = [{ text: t.scope(clients.length, allowed.length), source: t.scopeSource }];
      for (const item of snapshots) {
        const own = pick(item);
        if (!own) { facts.push({ text: t.unreadable(item.client.name), clientName: item.client.name, source: t.unreadableSource }); continue; }
        const plain = own.filter(f => !f.exerciseId && !f.measurement).slice(0, 2);
        const chosen = [...plain, ...own.filter(f => f.exerciseId).slice(0, 2), ...own.filter(f => f.measurement).slice(0, 2)];
        facts.push(...chosen.map(f => ({ ...f, text: `${item.client.name}: ${f.text}`, clientName: item.client.name, source: `${f.source} · ${item.client.name}` })));
      }
      if (facts.length > 100) facts.push({ text: t.capped, source: t.cappedSource });
      return facts;
    };
    const facts = compose(locale, item => item.shown);
    // Karma dilden bağımsız (Türkçe özetlerden): dil değişince saklı değerlendirmeler kaybolmaz.
    const canonical = hashableFacts(compose(DEFAULT_LOCALE, item => item.canonical));
    return { context: { facts, insights: insights.slice(0, 20), exercises, care: EMPTY_CARE, today: '', existingExerciseIds: [], healthUnavailable: true, global: true }, hash: createHash('sha256').update(JSON.stringify(canonical)).digest('hex'), baseRevision: null };
  };
  deps.classify = async (_id, _role, message, context, previous) => {
    const key = await geminiApiKey();
    if (!key) throw new LocalizedError(l => coachMessages(l).internal.general.noConnection);
    const { classifyCoachQuestion } = await import('./coach-gemini');
    return classifyCoachQuestion(key, message, context.exercises, previous, fetch, locale);
  };
  deps.publish = async () => { throw new LocalizedError(l => coachMessages(l).internal.general.noPublish); };
  deps.published = async () => false;
  return deps;
}
