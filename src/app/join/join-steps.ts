import type { InstallGuide } from '../../lib/install-guide.ts';

/**
 * Kare kodla katılımın toplam adımı: kod, şifre ve "uygulamayı ana ekrana ekle". Uygulama olarak açıksa
 * (zaten yüklü) son adım gösterilmez. Cihaz henüz bilinmezken (sunucu, ilk çizim) üç sayılır.
 */
export function joinStepTotal(guide: InstallGuide | null): 2 | 3 {
  return guide === 'installed' ? 2 : 3;
}
