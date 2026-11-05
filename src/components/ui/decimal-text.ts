/**
 * Ondalık kutuda virgül. Base UI NumberField `tr-TR`'de virgülü de noktayı da ondalık okur (gruplama kapalıyken), ama
 * `en-GB`'de yalnız noktayı: "2,5" 2 olur. İngilizce ondalık kutuda yazılan ve yapıştırılan metin buradan geçer
 * (`stepper.tsx`: `commaAsDecimal`, `pasteDecimal`); Türkçede gerekmez.
 *
 * Kural: ilk virgül, metinde nokta yoksa ondalık noktası olur; nokta zaten varsa ("2.5" yazılıyken virgüle basıldı ya da
 * "1,234.5" yapıştırıldı) virgül düşer: yoksa "2.5." olurdu ve 25 okunurdu.
 */

/** `text`'i düzeltir; `caret` (imleç konumu) imleçten önce düşen virgül kadar geri gelir. */
export function normalizeDecimal(text: string, caret: number): { text: string; caret: number } {
  if (!text.includes(',')) return { text, caret };
  let pointKept = text.includes('.');
  let out = '';
  let moved = caret;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (char !== ',') {
      out += char;
    } else if (!pointKept) {
      out += '.';
      pointKept = true;
    } else if (index < caret) {
      moved -= 1;
    }
  }
  return { text: out, caret: moved };
}

export function commaToPoint(text: string): string {
  return normalizeDecimal(text, 0).text;
}

/**
 * Yapıştırma: `pasted`, `current`'ın `[start, end)` seçiminin yerine girer ve bütün metin düzeltilir. İmleç yapıştırılanın
 * sonuna gelir.
 */
export function pastedDecimal(current: string, start: number, end: number, pasted: string): { text: string; caret: number } {
  const merged = current.slice(0, start) + pasted + current.slice(end);
  return normalizeDecimal(merged, start + pasted.length);
}
