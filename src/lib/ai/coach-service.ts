import 'server-only';
import { DEFAULT_LOCALE, type Locale } from '@/i18n/locale';
import { coachMessages } from '@/i18n/messages/coach';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readClient } from '@/lib/clients';
import { readIndex } from '@/lib/session-files-core';
import { sessionRepo } from '@/lib/session-files';
import { listExercises, readCustomExercises } from '@/lib/exercises';
import { listDevices } from '@/lib/devices';
import { readAppConfig } from '@/lib/config';
import { todayIn } from '@/lib/format';
import { canRecordHealth } from '@/lib/client-status';
import { readHealthIfAllowed } from '@/lib/health';
import { careInputOf, EMPTY_CARE } from '@/lib/constraint-filter';
import { programDiffContext, readProgramFile, saveProgram } from '@/lib/programs';
import { coachAccess } from './coach-contract';
import { coachingKey } from './coach-keys';
import { classifyCoachQuestion } from './coach-gemini';
import type { CoachDeps } from './coach-routes';
import { coachProgramMatches, type CoachContext } from './coach-engine';
import { coachContextHash, coachFactsFor, finishedSessions, type CoachRecords } from './coach-facts';
import type { Client } from '@/lib/schemas/client';
import { CoachError } from './coach-errors';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const id = (prefix?: string) => prefix ? `${prefix}_${randomBytes(3).toString('hex')}` : randomUUID();
/**
 * Koçun bağlamı. `locale`: isteğin dili; kayıt özetleri, değerlendirme ve katalog adları bu dilde yazılır (taslakla
 * birlikte saklanır). `hash` ise dilden bağımsız (Türkçe hâlinden, bkz. `coach-facts.ts`): bir dilde hazırlanan taslak
 * başka dilde onaylanabilir ya da danışan dil değiştirince taslağı kaybolmaz.
 */
export async function coachContext(client: Client, locale: Locale = DEFAULT_LOCALE) {
  const [custom, program, index, config] = await Promise.all([readCustomExercises(), readProgramFile(client.id, locale), readIndex(sessionRepo(client.id)), readAppConfig()]);
  if (program?.problem) throw new CoachError(l => coachMessages(l).failures.programUnreadable, 409);
  const today = todayIn(config.timeZone);
  const conditions = canRecordHealth(client, 'conditions'), pain = canRecordHealth(client, 'check_in'), measurements = canRecordHealth(client, 'measurements'), screening = canRecordHealth(client, 'screening');
  const record = await readHealthIfAllowed(client, ['conditions', 'check_in', 'measurements', 'screening']);
  const healthUnavailable = (client.modules.health.enabled && client.modules.health.fields.includes('conditions') && !conditions) || ((conditions || pain) && !record);
  const care = record && (conditions || pain) ? careInputOf({
    conditions: conditions ? record.conditions : [],
    constraints: conditions ? record.constraints : undefined,
    surgeryDate: conditions ? record.surgeryDate : undefined,
    overrides: conditions ? record.overrides : undefined,
    checkIns: pain ? record.checkIns : [],
  }, { today, painConsent: pain, locale }) : { ...EMPTY_CARE, today };
  const current = program?.program;
  const records: CoachRecords = {
    today, items: index.index.items, program: current,
    camera: screening && record ? (record.cameraMeasurements ?? []) : [],
    measurements: measurements && record ? record.measurements : [],
  };
  const catalog = await listExercises(custom, locale);
  const canonicalCatalog = locale === DEFAULT_LOCALE ? catalog : await listExercises(custom, DEFAULT_LOCALE);
  const { shown, canonical } = coachFactsFor(records, { shown: catalog, canonical: canonicalCatalog }, locale);
  const finished = finishedSessions(index.index.items, today);
  const context: CoachContext = { today, facts: shown.facts, insights: shown.insights, exercises: catalog, care, healthUnavailable, existingExerciseIds: [...new Set([...(current?.phases.flatMap(p => p.days.flatMap(d => d.blocks.flatMap(b => b.rows.map(r => r.exerciseId)))) ?? []), ...finished.flatMap(s => s.exercises.map(e => e.exerciseId))])] };
  return { context, hash: coachContextHash(hash, { client, care, canonical, catalog: canonicalCatalog, program: current }), baseRevision: current?.revision ?? null, ...(current ? { baseCreatedAt: current.createdAt } : {}), canonicalFacts: canonical.facts };
}
export function coachDeps(session: CoachDeps['session'], locale: Locale = DEFAULT_LOCALE): CoachDeps {
  return {
    session, client: async id => (await readClient(id))?.client ?? null, repo: sessionRepo,
    connection: async (id, role) => (await coachingKey(id, role)).source,
    context: client => coachContext(client, locale), hash, id, now: () => new Date(), locale,
    classify: async (clientId, role, message, context, previous) => {
      const { key } = await coachingKey(clientId, role);
      if (!key) throw new CoachError(l => coachMessages(l).failures.connectionClosed, 409);
      return classifyCoachQuestion(key, message, context.exercises.map(e => ({ id: e.id, title: e.title })), previous, fetch, locale);
    },
    published: async (clientId, proposal) => {
      const current = (await readProgramFile(clientId, locale))?.program;
      return !!current && coachProgramMatches(current, proposal.body);
    },
    publish: async (clientId, proposal) => {
      const client = (await readClient(clientId))?.client;
      if (!client || coachAccess(client) !== 'ready') throw new CoachError(l => coachMessages(l).failures.aiDisabled, 403);
      const fresh = await coachContext(client, locale);
      if (fresh.hash !== proposal.contextHash) throw new CoachError(l => coachMessages(l).failures.recordsChanged, 412);
      // Validate the current catalog again; never drop a device silently during an AI approval.
      const [exercises, devices] = await Promise.all([listExercises(undefined, locale), listDevices(undefined, locale)]);
      const result = await saveProgram(clientId, proposal.body,
        proposal.baseRevision === null ? null : { revision: proposal.baseRevision, createdAt: proposal.baseCreatedAt },
        { exercises: new Map(exercises.map(e => [e.id, e])), deviceIds: new Set(devices.map(d => d.id)) }, programDiffContext(exercises, devices, locale));
      if (!['created', 'saved', 'unchanged'].includes(result.status)) throw new CoachError(l => coachMessages(l).failures.catalogChanged, 412);
    },
  };
}
