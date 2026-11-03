/**
 * Kısa titreşim (sürükleme eşiği, kaydırarak silme, set bitişi). Tarayıcı desteklemiyorsa, sunucuda ya da kullanıcı
 * etkileşimi olmadan çağrıldıysa sessizce hiçbir şey yapmaz. Uygulamadaki tek titreşim yardımcısı.
 */
export function vibrate(pattern: number | number[] = 8): void {
  try {
    if (typeof navigator !== 'undefined') navigator.vibrate?.(pattern);
  } catch {
    // Bazı tarayıcılar izin yokken hata atar; titreşim süs, iş akışını bozmaz.
  }
}
