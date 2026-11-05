import { DEFAULT_LOCALE, isLocale, type Locale } from './locale';

/**
 * React dışındaki istemci kodu için: sayfanın dili (`<html lang>`, dil seçici değiştirir); sunucuda Türkçe.
 * `'use client'` modülünden ayrı: sunucu kodu ve `node --test` de içe aktarabilir.
 */
export function currentClientLocale(): Locale {
  if (typeof document === 'undefined') return DEFAULT_LOCALE;
  const lang = document.documentElement.lang;
  return isLocale(lang) ? lang : DEFAULT_LOCALE;
}
