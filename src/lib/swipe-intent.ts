/**
 * Kart yüzündeki basış kaydırma olarak izlenir mi (`useCardGesture`). Tutamaçtan başlayan basış sürüklemedir; farenin
 * öbür tuşları ve ikincil parmak sayılmaz. Fare ya da kalemle metin alanında başlayan basış metin seçimidir: satırı
 * kaydırmaz (PT tarafında ipucu, evre adı); dokunmatikte metin seçimi uzun basıştır, yatay kaydırma yine siler.
 */
export function tracksSwipe(input: {
  enabled: boolean;
  onGrabber: boolean;
  isPrimary: boolean;
  pointerType: string;
  button: number;
  inTextField: boolean;
}): boolean {
  const { enabled, onGrabber, isPrimary, pointerType, button, inTextField } = input;
  if (!enabled || onGrabber || !isPrimary) return false;
  if (pointerType === 'mouse' && button !== 0) return false;
  return pointerType === 'touch' || !inTextField;
}
