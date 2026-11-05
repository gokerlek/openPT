import { DEFAULT_LOCALE, type Locale } from '../../i18n/locale.ts';
import { coachMessages } from '../../i18n/messages/coach/index.ts';
import type { SessionIndexExercise, SessionIndexRow } from '../schemas/session.ts';
import { strongestOf } from '../session-records.ts';
export type CoachInsight = { title: string; finding: string; next: string; sources: string[] };
/** `kind` aynı ölçütleri karşılaştırır (metin dile göre değişir, karşılaştırma koduyla yapılır). */
type Performance = { value: number; label: string; kind: 'strength' | 'seconds' | 'reps' };
function performanceOf(exercise: SessionIndexExercise, locale: Locale): Performance | null {
  const t = coachMessages(locale).review.performance;
  const strength = strongestOf(exercise.best);
  if (strength) return { value: strength.e1rm, label: t.strength(strength.kg, strength.reps), kind: 'strength' };
  const seconds = exercise.best?.seconds;
  if (seconds) return { value: seconds, label: t.seconds(seconds), kind: 'seconds' };
  const reps = Math.max(0, ...(exercise.best?.sets ?? []).filter(s => s.kg === 0).map(s => s.reps));
  return reps ? { value: reps, label: t.reps(reps), kind: 'reps' } : null;
}
/** Compare only the same exercise/device on different dates; do not guess causes or training loads. `locale`: the requester's language (the text is stored with the review). */
export function progressReview(rows: readonly SessionIndexRow[], today: string, titles: ReadonlyMap<string, string>, locale: Locale = DEFAULT_LOCALE): CoachInsight[] {
  const t = coachMessages(locale).review;
  const finished = rows.filter(r => r.finishedAt && !r.unfinished && r.date <= today).sort((a, b) => b.date.localeCompare(a.date) || (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));
  const cutoff = new Date(`${today}T00:00:00Z`); cutoff.setUTCDate(cutoff.getUTCDate() - 27);
  const recent = finished.filter(r => r.date >= cutoff.toISOString().slice(0, 10));
  const insights: CoachInsight[] = [{ title: t.patternTitle, finding: t.recent(recent.length), next: recent.length ? t.recentNext : t.recentNextEmpty, sources: recent.slice(0, 4).map(r => t.sessionSource(r.date)) }];
  const seen = new Set<string>();
  for (const row of recent) for (const exercise of row.exercises) {
    const key = JSON.stringify([exercise.exerciseId, exercise.deviceId ?? null]);
    if (!exercise.full || exercise.lighter || exercise.oneOff || seen.has(key) || !titles.has(exercise.exerciseId)) continue;
    const latest = performanceOf(exercise, locale); if (!latest) continue;
    seen.add(key);
    const history = finished.filter(r => r.date < row.date).flatMap(r => r.exercises.filter(e => e.full && !e.lighter && !e.oneOff && e.exerciseId === exercise.exerciseId && e.deviceId === exercise.deviceId).map(e => ({ date: r.date, best: performanceOf(e, locale) }))).filter(e => e.best?.kind === latest.kind);
    const before = history[0], title = titles.get(exercise.exerciseId)!;
    if (!before?.best) {
      insights.push({ title, finding: t.baseline(row.date, latest.label), next: t.baselineNext, sources: [t.exerciseSource(row.date, title)] });
    } else {
      const difference = latest.value - before.best.value;
      const direction = difference > 0.05 ? 'up' : difference < -0.05 ? 'down' : 'same';
      insights.push({ title, finding: t.change(before.date, row.date, before.best.label, latest.label, t.metrics[latest.kind], direction, Math.abs(difference).toFixed(1), t.units[latest.kind === 'strength' ? 'kg' : latest.kind]), next: direction === 'down' ? t.nextDown : direction === 'up' ? t.nextUp : t.nextSame, sources: [t.exerciseSource(before.date, title), t.exerciseSource(row.date, title)] });
    }
    if (insights.length >= 5) return insights;
  }
  return insights;
}
