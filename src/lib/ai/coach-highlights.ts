import { DEFAULT_LOCALE, type Locale } from '../../i18n/locale.ts';
import { coachMessages } from '../../i18n/messages/coach/index.ts';
import type { CoachPreferences } from './coach-contract.ts';
export type CoachHighlight = { id: string; text: string };
/** Recorded events only; no body score, calorie compensation or pressure to increase load. */
export function coachHighlights(event: { id: string; date: string; dayName?: string; sets: number }, prefs: CoachPreferences, locale: Locale = DEFAULT_LOCALE): CoachHighlight[] {
  const t = coachMessages(locale).highlights;
  return [
    ...(prefs.celebrations ? [{ id: `${event.id}:celebrate`, text: t.celebrate(event.dayName) }] : []),
    ...(prefs.comments ? [{ id: `${event.id}:comment`, text: t.comment(event.date, event.sets) }] : []),
    ...(prefs.suggestions ? [{ id: `${event.id}:suggest`, text: t.suggest }] : []),
  ];
}
