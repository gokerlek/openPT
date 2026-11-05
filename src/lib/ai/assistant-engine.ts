import * as v from 'valibot';
import { DEFAULT_LOCALE, type Locale } from '../../i18n/locale.ts';
import { coachMessages } from '../../i18n/messages/coach/index.ts';
import { eligibleExercises, type CoachContext } from './coach-engine.ts';
import { type AssistantSelection } from './assistant-contract.ts';
import { muscleLabels } from '../schemas/exercise.ts';
import { defaultSets, DEFAULT_REST_SECONDS } from '../template-plan.ts';
import { hasAssignments, phaseWeekdays } from '../day-assignments.ts';
import { nextDayName, type ProgramBody } from '../program-plan.ts';
import { programFormSchema } from '../schemas/program.ts';

/**
 * The provider interprets intent; the application owns catalog selection and numerical targets. `audience`: who asked
 * (errors tell the PT to extend the library, the client to ask the PT). Required: a new caller must not silently get
 * the client's copy. `locale`: the requester's language; the draft's phase name, rationale and attention notes are stored
 * with the draft, so they are written in it.
 */
export function assistantProgram(context: CoachContext, selection: AssistantSelection, kind: 'workout' | 'program', id: (prefix: string) => string, audience: 'pt' | 'client', locale: Locale = DEFAULT_LOCALE) {
  const t = coachMessages(locale);
  if (context.global) return { error: t.assistant.openClientPage };
  if (context.healthUnavailable) return { error: t.assistant.healthUnavailable };
  const eligible = eligibleExercises(context, selection.conditions);
  const moves = eligible.filter(e => selection.goal === 'mobility' ? ['warmup', 'cooldown'].includes(e.category) : !['warmup', 'cooldown'].includes(e.category));
  const wanted = new Set<string>(selection.muscles);
  const pool = selection.fullBody ? moves : moves.filter(e => e.primaryMuscles.some(m => wanted.has(m)));
  if (!pool.length) {
    if (selection.goal === 'mobility') return { error: t.assistant.noMobility[audience] };
    return { error: t.assistant.noMoves[audience] };
  }
  const practiced = new Set(context.existingExerciseIds);
  const ordered = [...pool].sort((a, b) => Number(practiced.has(b.id)) - Number(practiced.has(a.id)) || a.id.localeCompare(b.id));
  const weekdays = [...selection.conditions.weekdays].sort((a, b) => a - b);
  const days = kind === 'workout' ? weekdays.slice(0, 1) : weekdays;
  const count = Math.min(6, Math.max(1, Math.floor(selection.conditions.minutes / 8)));
  const phaseId = id('p');
  const used = new Set<string>();
  const chosenMuscles = new Set<string>();
  const named: { name: string }[] = [];
  // Faz 3: gün başına bir program, o güne atanmış ("Program A" ilk güne…); atamalı evrede sıklık yazılmaz (sıklık
  // atanmış gün sayısı). Program düzeyindeki `weekdays` eski gövdeyi bekleyen okuyucularla uyum için kalır.
  const body = {
    phased: false, currentPhaseId: phaseId, weekdays: days,
    phases: [{ id: phaseId, name: t.goals[selection.goal], days: days.map((weekday) => {
      const selected: typeof pool = [], patterns = new Set<string>();
      // Cover primary regions first; across days prefer movements not selected yet, then practiced ones.
      const candidates = [...ordered].sort((a, b) => Number(used.has(a.id)) - Number(used.has(b.id)));
      while (selected.length < Math.min(count, candidates.length)) {
        const remaining = candidates.filter(e => !selected.includes(e));
        remaining.sort((a, b) => {
          const score = (e: typeof a) => Number(!patterns.has(e.pattern ?? e.primaryMuscles[0] ?? e.id)) * 100 + e.primaryMuscles.filter(m => !chosenMuscles.has(m)).length * 10;
          return score(b) - score(a);
        });
        const next = remaining[0]; if (!next) break;
        selected.push(next); used.add(next.id); patterns.add(next.pattern ?? next.primaryMuscles[0] ?? next.id); next.primaryMuscles.forEach(m => chosenMuscles.add(m));
      }
      const name = nextDayName(named, locale);
      named.push({ name });
      return { id: id('d'), name, weekdays: [weekday], blocks: selected.map(e => ({ id: id('b'), kind: 'single' as const, restSeconds: DEFAULT_REST_SECONDS[e.category], rows: [{ id: id('r'), exerciseId: e.id, sets: defaultSets(e, e.category === 'warmup' || e.category === 'cooldown' ? 1 : 2) }] })) };
    }) }],
  };
  const parsed = v.safeParse(programFormSchema, body);
  if (!parsed.success) return { error: t.assistant.rulesUnmet };
  const attention = assistantAttention(context, selection, parsed.output, locale);
  return { body: parsed.output, attention, rationale: [
    ...t.assistant.rationale(t.goals[selection.goal], days.length, selection.conditions.minutes),
    ...(selection.goal === 'weight_management' ? [t.assistant.weightNote] : []),
    ...(selection.goal === 'mobility' ? [t.assistant.mobilityNote] : []),
  ] };
}

/** Attention is derived again from the body actually saved, including user edits. */
export function assistantAttention(context: CoachContext, selection: AssistantSelection, body: ProgramBody, locale: Locale = DEFAULT_LOCALE): string[] {
  const t = coachMessages(locale).assistant.attention;
  const ids = new Set(body.phases.flatMap(p => p.days.flatMap(d => d.blocks.flatMap(b => b.rows.map(r => r.exerciseId)))));
  const covered = new Set(context.exercises.filter(e => ids.has(e.id)).flatMap(e => e.primaryMuscles));
  const missing = selection.muscles.filter(m => !covered.has(m));
  // Gerçek günler şu anki evrenin atamaları: düzenleyici program düzeyinde gün göndermez, gövdede kalan eski
  // `weekdays` danışanın değiştirdiği atamaları ezmesin. Yalnız atamasız (eski) gövdede program düzeyindeki günler.
  const current = (body.phases.find(p => p.id === body.currentPhaseId) ?? body.phases[0])?.days ?? [];
  const days = hasAssignments(current) ? phaseWeekdays(current) : (body.weekdays ?? []);
  const short = body.phases.some(p => p.days.some(d => d.blocks.flatMap(b => b.rows).length < 4));
  return [
    ...(!context.existingExerciseIds.length ? [t.noHistory] : []),
    ...(missing.length ? [t.missingMuscles(missing.map(m => muscleLabels(locale)[m]))] : []),
    ...(days.some(d => days.includes(d % 7 + 1)) ? [t.consecutive] : []),
    ...(selection.fullBody && short ? [t.limitedCoverage] : []),
  ];
}
