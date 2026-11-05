/**
 * Tutuş — aynı cihazda kasları değiştiren ayrıntı (pronasyon/supinasyon/nötr, genişlik).
 *
 * Kaslar belirgin değişiyorsa ayrı egzersiz açılır (ör. "Ters Tutuş Lat Pulldown");
 * bu alanlar küçük farkı taşır ve muadil sıralamasında aynı tutuşu öne alır.
 *
 * Saf veri; yol takma adıyla içe aktarma yok (testler Node'un test aracıyla çalışır). Adlar `catalog` sözlüğünde.
 */

import { DEFAULT_LOCALE, type Locale } from '../i18n/locale.ts';
import { catalogMessages } from '../i18n/messages/catalog/index.ts';

export const GRIPS = ['pronated', 'supinated', 'neutral', 'mixed'] as const;
export type Grip = (typeof GRIPS)[number];

/**
 * Parantez içi avucun yönü: bağlamdan bağımsız. "Ters/düz" harekete göre değişir
 * ("Ters Tutuş Lat Pulldown" supinasyondur), o yüzden kullanılmaz.
 */
export function gripLabels(locale: Locale = DEFAULT_LOCALE): Record<Grip, string> {
  return catalogMessages(locale).grips;
}

/** Türkçe adlar (eski çağrılar); arayüz `gripLabels(locale)` kullanır. */
export const GRIP_LABELS: Record<Grip, string> = gripLabels('tr');

export const GRIP_WIDTHS = ['narrow', 'shoulder', 'wide'] as const;
export type GripWidth = (typeof GRIP_WIDTHS)[number];

export function gripWidthLabels(locale: Locale = DEFAULT_LOCALE): Record<GripWidth, string> {
  return catalogMessages(locale).gripWidths;
}

/** Türkçe adlar (eski çağrılar); arayüz `gripWidthLabels(locale)` kullanır. */
export const GRIP_WIDTH_LABELS: Record<GripWidth, string> = gripWidthLabels('tr');

/** Tutuşun okunur özeti: "Geniş pronasyon (avuç aşağı)". */
export function describeGrip(grip?: Grip, width?: GripWidth, locale: Locale = DEFAULT_LOCALE): string | null {
  const t = catalogMessages(locale);
  if (!grip && !width) return null;
  if (!grip) return t.gripWidths[width as GripWidth];
  return width ? t.gripWithWidth(t.gripWidths[width], t.grips[grip]) : t.grips[grip];
}
