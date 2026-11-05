import 'server-only';
import * as v from 'valibot';
import { DEFAULT_LOCALE, type Locale } from '@/i18n/locale';
import { coachMessages } from '@/i18n/messages/coach';
import { sessionRepo } from '@/lib/session-files';
import { coachPreferencesSchema, DEFAULT_COACH_PREFERENCES, type CoachPreferences } from './coach-contract';
const PATH = 'ai-coach-preferences.json';
export async function readCoachPreferences(clientId: string): Promise<CoachPreferences> {
  const stored = await sessionRepo(clientId).read(PATH);
  return stored ? v.parse(coachPreferencesSchema, stored.content) : { ...DEFAULT_COACH_PREFERENCES };
}
export async function writeCoachPreferences(clientId: string, input: unknown, locale: Locale = DEFAULT_LOCALE) {
  const prefs = v.parse(coachPreferencesSchema, input), repo = sessionRepo(clientId);
  const stored = await repo.read(PATH);
  await repo.write(PATH, prefs, { sha: stored?.sha, message: coachMessages(locale).internal.commits.preferences });
  return prefs;
}
