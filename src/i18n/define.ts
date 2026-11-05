import { intlLocale, type Locale } from './locale.ts';

/**
 * Sözlükler: her alanın (namespace) `src/i18n/messages/<ad>/` altında `tr.ts` (düz nesne), `en.ts`
 * (`const en: Shape<typeof tr>`) ve `index.ts` (`defineMessages({ tr, en })`) dosyası var. İngilizcede eksik ya da
 * fazla anahtar `tsc` hatasıdır; değer türleri, fonksiyonların parametre sayısı ve dizi uzunlukları
 * `parity.test.ts`'te denetlenir. Türkçe ek gerektiren cümleler fonksiyondur (`turkish.ts` yalnız `tr.ts`'ten).
 */

/**
 * Türkçe sözlüğün şekli, değerleri genişletilmiş: dize sabitleri `string` olur, fonksiyonlar parametrelerini korur ve
 * dize döndürür, diziler ve nesneler içeriden aynı kurala uyar.
 */
export type Shape<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T extends (...args: infer A) => infer R
        ? (...args: A) => Shape<R>
        : T extends readonly (infer U)[]
          ? readonly Shape<U>[]
          : T extends object
            ? { readonly [K in keyof T]: Shape<T[K]> }
            : T;

/** Dile göre sözlük: `messages(locale)`. Sözlüklerin kendisi `dictionary`'de (denetimler için). */
export interface Messages<T> {
  (locale: Locale): T;
  readonly dictionary: { tr: T; en: Shape<T> };
}

export function defineMessages<T>(dictionary: { tr: T; en: Shape<T> }): Messages<T> {
  // İngilizce sözlük Türkçenin şeklindedir (tsc denetler); türü Türkçeninki gibi okunur.
  const messages = (locale: Locale): T => (locale === 'en' ? (dictionary.en as T) : dictionary.tr);
  return Object.assign(messages, { dictionary });
}

const pluralRules = new Map<Locale, Intl.PluralRules>();

/**
 * Sayıya göre tekil/çoğul: "1 set" / "3 sets". Türkçede sayıdan sonra isim tekil kalır (iki biçim aynı yazılır).
 * Çoğulu "s" ekleyerek kurmak yok: her biçim sözlükte tam yazılır.
 */
export function plural(locale: Locale, n: number, forms: { one: string; other: string }): string {
  let rules = pluralRules.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(intlLocale(locale));
    pluralRules.set(locale, rules);
  }
  return rules.select(n) === 'one' ? forms.one : forms.other;
}

/** Liste cümlesi: "a, b ve c" / "a, b and c"; `disjunction`: "a, b veya c" / "a, b or c". */
export function listText(locale: Locale, items: readonly string[], type: 'conjunction' | 'disjunction' = 'conjunction'): string {
  return new Intl.ListFormat(intlLocale(locale), { style: 'long', type }).format(items);
}
