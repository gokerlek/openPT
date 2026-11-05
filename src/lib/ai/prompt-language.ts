import type { Locale } from '../../i18n/locale.ts';

/**
 * Gemini'ye giden komutlar İngilizce yazılı (model için dil seçimi değil, bakımı kolay olsun diye); kullanıcının
 * dili komutun sonuna eklenen bu cümleyle söylenir. Model yalnız niyet, katalog kimliği ve kod seçer (serbest metin
 * üretmez); yine de ürettiği her metin okuyanın dilinde olur, şemadaki anahtarlar, kimlikler ve kodlar değişmez.
 */
const LANGUAGE_NAMES: Record<Locale, string> = { tr: 'Turkish', en: 'English' };

export function languageInstruction(locale: Locale): string {
  const language = LANGUAGE_NAMES[locale];
  return ` Answer language: ${language}. The user writes in ${language}; any text you produce must be in ${language}. JSON keys, ids, codes and enum values stay exactly as the schema gives them.`;
}
