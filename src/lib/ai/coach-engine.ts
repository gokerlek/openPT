import * as v from 'valibot';
import { DEFAULT_LOCALE, type Locale } from '../../i18n/locale.ts';
import { coachMessages } from '../../i18n/messages/coach/index.ts';
import type { CoachInsight } from './coach-review.ts';
import { defaultSets, DEFAULT_REST_SECONDS } from '../template-plan.ts';
import type { PlanExercise } from '../template-plan.ts';
import { programFormSchema } from '../schemas/program.ts';
import { cleanWeekdays, hasAssignments } from '../day-assignments.ts';
import { bodyWithAssignments, nextDayName, type ProgramBody, type ProgramDay, type ProgramState } from '../program-plan.ts';
import { evaluateCare, hasCare, type CareInput } from '../constraint-filter.ts';
import type { CoachConditions, CoachIntent } from './coach-contract.ts';

export type CoachExercise = PlanExercise & Parameters<typeof evaluateCare>[0] & { pattern?: string };
/** `measurement`: ölçüm kaydı (kamera ya da elle); "ölçümler" sorusu yalnız bunlara, öteki sorular bunlar dışındakilere bakar. */
export type CoachFact = { text: string; source: string; exerciseId?: string; clientName?: string; measurement?: boolean };
/** Değişiklik denetimi (`hash`) dilden bağımsız olmalı: ölçüm bayrağı özet metne ait değil, kayıtta eski biçimiyle karma edilir. */
export const hashableFacts = (facts: readonly CoachFact[]) => facts.map(({ measurement: _measurement, ...fact }) => fact);
export type CoachContext = { facts: CoachFact[]; exercises: CoachExercise[]; care: CareInput; existingExerciseIds: string[]; healthUnavailable: boolean; today: string; global?: boolean; insights?: CoachInsight[] };
export function eligibleExercises(context: CoachContext, conditions?: CoachConditions): CoachExercise[] {
  if (context.healthUnavailable) return [];
  return context.exercises.filter(exercise => {
    if (conditions && !conditions.equipment.includes(exercise.equipment as CoachConditions['equipment'][number])) return false;
    if (!hasCare(context.care)) return true;
    const result = evaluateCare(exercise, context.care);
    return !result.decision && result.unassessed === 0 && !result.untagged;
  });
}
/** The model selects intent/catalog IDs; all numbers, facts and prescriptions come from application rules. */
export function answerCoach(intent: CoachIntent, context: CoachContext, question = '', locale: Locale = DEFAULT_LOCALE): { answer: string; sources: string[] } {
  const t = coachMessages(locale).engine;
  if (intent.intent === 'support') return { answer: t.support, sources: [] };
  if (intent.intent === 'health_question') return { answer: t.healthQuestion, sources: [] };
  if (intent.intent === 'out_of_scope') return { answer: t.outOfScope, sources: [] };
  if (context.global && intent.intent === 'plan') return { answer: t.generalPlan, sources: [] };
  const names = [...new Set(context.facts.flatMap(f => f.clientName ? [f.clientName] : []))];
  const asked = question.toLocaleLowerCase('tr');
  const words = asked.split(/[^\p{L}]+/u);
  const exact = names.filter(name => asked.includes(name.toLocaleLowerCase('tr')));
  const named = exact.length ? exact : names.filter(name => { const first = name.toLocaleLowerCase('tr').split(/\s+/)[0] ?? ''; return first.length >= 3 && words.includes(first); });
  if (!exact.length && named.length > 1) return { answer: t.ambiguousClients(named), sources: [] };
  const scoped = named.length ? context.facts.filter(f => f.clientName && named.includes(f.clientName)) : context.facts;
  const matching = scoped.filter(fact => intent.intent === 'measurement' ? !!fact.measurement : intent.exerciseIds.length ? !!fact.exerciseId && intent.exerciseIds.includes(fact.exerciseId) : !fact.measurement);
  const facts = matching.slice(0, context.global ? 100 : 12);
  if (context.global && matching.length > facts.length) facts.push({ text: t.scopeNote(facts.length), source: t.scopeSource });
  const intro = intent.intent === 'measurement' ? t.introMeasurement : t.introOverview;
  return { answer: `${intro}\n\n${facts.length ? facts.map(f => `• ${f.text}`).join('\n') : t.noRecords}`, sources: [...new Set(facts.map(f => f.source))] };
}
export function draftCoachProgram(context: CoachContext, conditions: CoachConditions, requestedIds: readonly string[], id: (prefix: string) => string, locale: Locale = DEFAULT_LOCALE): { body: ProgramBody; rationale: string[] } | { error: string } {
  const t = coachMessages(locale).engine.draft;
  const eligible = eligibleExercises(context, conditions);
  if (context.healthUnavailable) return { error: t.healthUnavailable };
  if (requestedIds.some(requested => !eligible.some(e => e.id === requested))) return { error: t.mismatch };
  // Prefer existing, practiced exercises; keep patterns diverse. No invented equipment/exercise IDs.
  const priority = new Set([...requestedIds, ...context.existingExerciseIds]);
  const ordered = [...eligible].sort((a, b) => Number(priority.has(b.id)) - Number(priority.has(a.id)) || a.id.localeCompare(b.id));
  const patterns = new Set<string>();
  const selected: CoachExercise[] = [];
  const count = Math.min(6, Math.max(2, Math.floor(conditions.minutes / 10)));
  for (const e of ordered) {
    if (e.category === 'warmup' || e.category === 'cooldown') continue;
    const pattern = e.pattern ?? e.primaryMuscles[0] ?? e.id;
    if (patterns.has(pattern)) continue;
    selected.push(e); patterns.add(pattern);
    if (selected.length === count) break;
  }
  if (selected.length < 2) return { error: t.notEnough };
  const phaseId = id('p');
  // Faz 3: gün başına bir program, o güne atanmış ("Program A" ilk güne…); atamalı evrede sıklık yazılmaz (sıklık
  // atanmış gün sayısı). Program düzeyindeki `weekdays` eski gövdeyi bekleyen okuyucularla uyum için kalır.
  const weekdays = cleanWeekdays(conditions.weekdays);
  const days: ProgramDay[] = [];
  for (const weekday of weekdays) {
    days.push({ id: id('d'), name: nextDayName(days, locale), weekdays: [weekday], blocks: selected.map(e => ({
      id: id('b'), kind: 'single' as const, restSeconds: DEFAULT_REST_SECONDS[e.category],
      rows: [{ id: id('r'), exerciseId: e.id, sets: defaultSets(e, 2) }],
    })) });
  }
  const body: ProgramBody = { phased: false, currentPhaseId: phaseId, weekdays, phases: [{ id: phaseId, name: t.phaseName, days }] };
  const parsed = v.safeParse(programFormSchema, body);
  if (!parsed.success) return { error: t.rules };
  return { body: parsed.output, rationale: t.rationale(conditions.weekdays.length, conditions.minutes) };
}

/**
 * Yayın kurtarma: kayıttaki program bu taslak mı? Kayıt `current.phaseId`, gövde `currentPhaseId` taşır. İki taraf
 * aynı biçime getirilir (Faz 3): taslak yayında olduğu gibi atanır (`bodyWithAssignments`); atamalar günlerde
 * karşılaştırılır (sıralı, boşu yok sayılarak), program düzeyindeki `weekdays` karşılaştırılmaz; atamalı evrede
 * `daysPerWeek` iki tarafta da yok sayılır (`normalizeProgram` yayında düşürür).
 */
export function coachProgramMatches(current: ProgramState, body: ProgramBody): boolean {
  const shape = (input: unknown): string | null => {
    const parsed = v.safeParse(programFormSchema, input);
    if (!parsed.success) return null;
    const { weekdays: _program, ...rest } = parsed.output;
    const phases = rest.phases.map(({ daysPerWeek, days, ...phase }) => ({
      ...phase,
      ...(daysPerWeek !== undefined && !hasAssignments(days) ? { daysPerWeek } : {}),
      days: days.map(({ weekdays: list, ...day }) => {
        const weekdays = cleanWeekdays(list);
        return { ...day, ...(weekdays.length > 0 ? { weekdays } : {}) };
      }),
    }));
    return JSON.stringify({ ...rest, phases });
  };
  const stored = shape({ phased: current.phased, currentPhaseId: current.current.phaseId, phases: current.phases });
  return stored !== null && stored === shape(bodyWithAssignments(body));
}

/** Known high-risk wording has a local gate as well as the provider classifier. */
export function coachSensitiveIntent(message: string): 'support' | 'health_question' | null {
  const text = message.toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');
  if (/ceza|punish|telafi|compensat|kusmak|kusuy|yeme bozuk|eating disorder|kendimden nefret|vucudumdan nefret|ac kal|starv|yediklerimi.*yak|\b(?:vomit\w*|throw(?:ing)? up|threw up|purg(?:e|ing)|binge\w*|bulimi\w*|anorexi\w*|skip(?:ping|ped)? meals|stop(?:ping|ped)? eating)\b|hate (?:myself|my body)|(?:burn(?:ing)? off|make up for|makes? up for) (?:what|everything|the)\b.*\b(?:ate|eaten|food)/.test(text)) return 'support';
  if (/\b(?:tani|teshis|tedavi|diagnos\w*|treatment|agri\w*|pain\w*|ameliyat\w*|surgery|injur\w*|hurt(?:s|ing)?)\b/.test(text)) return 'health_question';
  return null;
}
