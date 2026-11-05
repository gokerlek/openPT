import type * as v from 'valibot';
import { DEFAULT_LOCALE, isLocale, type Locale } from './locale.ts';

/**
 * Şema mesajları dile göre: `v.minLength(2, msg((l) => …))`. Valibot sorunun (`issue.lang`) dilini yapılandırmadan
 * alır: sunucuda `v.safeParse(schema, body, langConfig(locale))`, istemcide `LocaleProvider`'ın kurduğu genel dil.
 * Dil yoksa Türkçe (eski çağrılar ve testler değişmez).
 */
export function msg<I extends v.BaseIssue<unknown>>(text: (locale: Locale, issue: I) => string): (issue: I) => string {
  return (issue) => text(isLocale(issue.lang) ? issue.lang : DEFAULT_LOCALE, issue);
}

/** `v.safeParse`'ın yapılandırması: mesajlar bu dilde. */
export function langConfig(locale: Locale): { lang: Locale } {
  return { lang: locale };
}
