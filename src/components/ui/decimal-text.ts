/**
 * Ondalık kutuda yazılan virgülü noktaya çevirir. Base UI NumberField `tr-TR`'de virgülü de noktayı da ondalık okur
 * (gruplama kapalıyken), ama `en-GB`'de yalnız noktayı: "2,5" 2 olur. İngilizce kutu `commaToPoint`'ten geçirilir
 * (`stepper.tsx`: `commaAsDecimal`); Türkçede gerekmez.
 */
export function commaToPoint(text: string): string {
  return text.replace(/,/g, '.');
}
