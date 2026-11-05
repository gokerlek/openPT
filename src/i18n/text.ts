import type { Locale } from './locale.ts';

/**
 * Dile göre büyük/küçük harf ve sıralama. Türkçe kurallar yalnız Türkçede: İngilizce metin `tr` ile büyütülürse `i`
 * `İ` olur. Arama katlaması (`exercise-search.ts`) ve PT'nin yazdığı içeriğin sıralaması bunlardan geçmez.
 */

export function lower(locale: Locale, text: string): string {
  return text.toLocaleLowerCase(locale);
}

export function upper(locale: Locale, text: string): string {
  return text.toLocaleUpperCase(locale);
}

/** İlk harfi büyük: "ön omuz" → "Ön omuz". */
export function upperFirst(locale: Locale, text: string): string {
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

/** İlk harfi küçük: cümlenin ortasına giren etiket ("Ön omuz" → "ön omuz"). */
export function lowerFirst(locale: Locale, text: string): string {
  return text.charAt(0).toLocaleLowerCase(locale) + text.slice(1);
}

const collators = new Map<Locale, Intl.Collator>();

/** Dilin alfabetik sırası (`list.sort(compareText(locale))`); `a.localeCompare(b, locale)` ile aynı. */
export function compareText(locale: Locale): (a: string, b: string) => number {
  let collator = collators.get(locale);
  if (!collator) {
    collator = new Intl.Collator(locale);
    collators.set(locale, collator);
  }
  return collator.compare;
}
