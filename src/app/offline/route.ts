import { localeFromRequest } from '@/i18n/locale';
import { readAppConfig } from '@/lib/config';
import { offlineHtml } from '@/lib/offline-page';

/**
 * Ağ yokken gösterilen sayfa (`lib/offline-page.ts`). Service worker (`public/sw.js`) kurulurken bunu bir kez
 * önbelleğe alır; ağa ulaşamayan sayfa gezinmesinde döner. Doğrudan açılınca da aynı sayfa (sınamak için).
 * Dil isteğin dili: service worker'ın isteği çerezi taşır; dil seçici değişince yenisini aldırır (`useSetLocale`).
 */
export async function GET(request: Request) {
  const config = await readAppConfig();
  return new Response(offlineHtml({ appName: config.appName, accent: config.accent, locale: localeFromRequest(request) }), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', Vary: 'Accept-Language, Cookie' },
  });
}
