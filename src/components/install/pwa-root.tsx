'use client';

import { useEffect } from 'react';
import { captureInstallPrompt } from './install-state';

/**
 * Kök düzende bir kez: service worker'ı (`public/sw.js`) kaydeder ve yükleme penceresi olayını
 * (`beforeinstallprompt`) erkenden dinlemeye başlar. Olay sayfa açılır açılmaz gelebilir; yardımcı
 * (`install-helper.tsx`) o sırada ekranda olmasa da saklanır.
 *
 * Service worker yalnız üretimde kaydolur: yerel geliştirmede aynı adresteki (localhost:3000) başka
 * projelere ve sıcak yenilemeye karışmasın. `/offline` sayfası doğrudan açılarak denenebilir.
 */
captureInstallPrompt();

export function PwaRoot() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    // `updateViaCache: 'none'`: tarayıcı sw.js'in yeni sürümüne HTTP önbelleğine bakmadan bakar.
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {
      // Kayıt olmazsa uygulama yine çalışır; yalnız ağ yokken tarayıcının kendi hata sayfası çıkar.
    });
  }, []);
  return null;
}
