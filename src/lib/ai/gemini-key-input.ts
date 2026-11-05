import * as v from 'valibot';
import { DEFAULT_LOCALE, type Locale } from '../../i18n/locale.ts';
import { coachMessages } from '../../i18n/messages/coach/index.ts';
import { langConfig, msg } from '../../i18n/valibot.ts';

/** Client/server validation without importing encryption or exposing the supplied value in errors. Türkçe metinler (eski çağrılar); mesajlar `msg` ile okuyanın dilinde. */
export const GEMINI_KEY_ERRORS = coachMessages(DEFAULT_LOCALE).keyErrors;
export const geminiKeySchema = v.pipe(
  v.string(), v.trim(),
  v.check(value => !/[•●*…]|\.{2,}/.test(value), msg(l => coachMessages(l).keyErrors.masked)),
  v.minLength(20, msg(l => coachMessages(l).keyErrors.incomplete)),
  v.maxLength(200, msg(l => coachMessages(l).keyErrors.long)),
  v.check(value => !/\s/.test(value), msg(l => coachMessages(l).keyErrors.spaces)),
  // Google AI Studio issues authorization keys with an AQ. prefix as well as standard keys.
  v.regex(/^[A-Za-z0-9_.-]+$/, msg(l => coachMessages(l).keyErrors.characters)),
);
export function geminiKeyError(input: unknown, locale: Locale = DEFAULT_LOCALE): string {
  const parsed = v.safeParse(geminiKeySchema, input, langConfig(locale));
  if (parsed.success) return '';
  const known: string[] = Object.values(coachMessages(locale).keyErrors);
  return parsed.issues.map(issue => issue.message).find(message => known.includes(message)) ?? coachMessages(locale).keyErrors.fallback;
}
