import 'server-only';
import { DEFAULT_LOCALE, type Locale } from '@/i18n/locale';
import { coachMessages } from '@/i18n/messages/coach';
import { progressReview } from './coach-review';
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
import { measurementDef } from '@/lib/measurements';
import { coachAccess } from './coach-contract';
import { strongestOf } from '@/lib/session-records';
import { protocols, metricLabels } from '@/lib/pose/protocols';
import { coachingKey } from './coach-keys';
import { classifyCoachQuestion } from './coach-gemini';
import type { CoachDeps } from './coach-routes';
import { coachProgramMatches, hashableFacts, type CoachContext, type CoachFact } from './coach-engine';
import type { Client } from '@/lib/schemas/client';
import { CoachError } from './coach-errors';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const id = (prefix?: string) => prefix ? `${prefix}_${randomBytes(3).toString('hex')}` : randomUUID();
/**
 * Koçun bağlamı. `locale`: isteğin dili; kayıt özetleri, değerlendirme ve katalog adları bu dilde yazılır (taslakla
 * birlikte saklanır). `hash` ise dilden bağımsız: aynı kayıtlardan Türkçe hâli karma edilir, böylece bir dilde hazırlanan
 * taslak başka dilde onaylanabilir ya da danışan dil değiştirince taslağı kaybolmaz.
 */
export async function coachContext(client: Client, locale: Locale = DEFAULT_LOCALE) {
  const [custom, program, index, config] = await Promise.all([readCustomExercises(), readProgramFile(client.id), readIndex(sessionRepo(client.id)), readAppConfig()]);
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
  }, { today, painConsent: pain }) : { ...EMPTY_CARE, today };
  const finished = index.index.items.filter(item => item.finishedAt && item.date <= today).sort((a, b) => b.date.localeCompare(a.date) || (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));
  const current = program?.program;
  // i18n-followup(T4): `protocols`, `metricLabels` ve `measurementDef` Türkçe döner, T4 çevirene kadar ölçüm özetlerinin başlıkları İngilizcede de Türkçe kalır.
  /** Kayıt özetleri ve değerlendirme `l` dilinde; `exercises` o dildeki katalog (adlar için). */
  const describe = (l: Locale, exercises: readonly { id: string; title: string }[]) => {
    const t = coachMessages(l).facts;
    const facts: CoachFact[] = [
      { text: t.history(finished.length), source: t.historySource },
      ...finished.slice(0, 3).map(item => ({ text: t.session(item.date, item.dayName ?? t.defaultDayName, item.sets, item.volumeKg), source: t.sessionSource(item.date) })),
    ];
    const seenExercises = new Set<string>();
    for (let rowIndex = 0; rowIndex < Math.min(8, finished.length); rowIndex++) {
      const row = finished[rowIndex]!;
      for (const item of row.exercises) {
        const key = `${item.exerciseId}:${item.deviceId ?? ''}`;
        const best = strongestOf(item.best);
        if (!best || seenExercises.has(key)) continue;
        seenExercises.add(key);
        const before = finished.slice(rowIndex + 1).flatMap(previous => previous.exercises)
          .find(previous => previous.exerciseId === item.exerciseId && previous.deviceId === item.deviceId && strongestOf(previous.best));
        const old = before ? strongestOf(before.best) : null;
        const difference = old ? t.difference((best.e1rm - old.e1rm).toFixed(1)) : t.noPrevious;
        const title = exercises.find(e => e.id === item.exerciseId)?.title ?? t.removedExercise;
        facts.push({ text: t.exercise(row.date, title, best.e1rm.toFixed(1), best.kg, best.reps, difference), source: t.exerciseSource(row.date, title), exerciseId: item.exerciseId });
      }
    }
    if (current) facts.push({ text: t.program(current.phases.reduce((n, p) => n + p.days.length, 0)), source: t.programSource });
    if (screening && record) {
      for (const entry of (record.cameraMeasurements ?? []).filter(e => !e.deletedAt).slice(0, 3)) {
        const title = protocols(l)[entry.task].title, date = entry.capturedAt.slice(0, 10);
        facts.push({ text: t.camera(date, title, entry.metrics.map(m => `${metricLabels(l)[m.id] ?? m.id} ${m.median.toFixed(1)}°`).join(', ')), source: t.measurementSource(date, title), measurement: true });
      }
    }
    if (measurements && record) {
      for (const entry of [...record.measurements].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6)) {
        const definition = measurementDef(entry.id, l);
        facts.push({ text: t.measurement(entry.date, definition.label, entry.side, entry.value, t.units[definition.unit]), source: t.measurementSource(entry.date, definition.label), measurement: true });
      }
    }
    return { facts, insights: progressReview(finished, today, new Map(exercises.map(e => [e.id, e.title])), l) };
  };
  const catalog = await listExercises(custom, locale);
  const shown = describe(locale, catalog);
  const canonicalCatalog = locale === DEFAULT_LOCALE ? catalog : await listExercises(custom, DEFAULT_LOCALE);
  const canonical = locale === DEFAULT_LOCALE ? shown : describe(DEFAULT_LOCALE, canonicalCatalog);
  const context: CoachContext = { today, facts: shown.facts, insights: shown.insights, exercises: catalog, care, healthUnavailable, existingExerciseIds: [...new Set([...(current?.phases.flatMap(p => p.days.flatMap(d => d.blocks.flatMap(b => b.rows.map(r => r.exerciseId)))) ?? []), ...finished.flatMap(s => s.exercises.map(e => e.exerciseId))])] };
  return { context, hash: hash({ client: { modules: client.modules, consents: client.consents }, care, facts: hashableFacts(canonical.facts), insights: canonical.insights, catalog: canonicalCatalog, program: current }), baseRevision: current?.revision ?? null, ...(current ? { baseCreatedAt: current.createdAt } : {}), canonicalFacts: canonical.facts };
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
      const current = (await readProgramFile(clientId))?.program;
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
