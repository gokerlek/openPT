import { localeFromRequest } from '@/i18n/locale';
import { readAppConfig } from '@/lib/config';
import { panelManifest } from '@/lib/panel-manifest';

/**
 * PT panelinin manifest'i (`/panel.webmanifest`; panel düzeni `dashboard/layout.tsx` bağlar). Danışan
 * uygulamasından ayrı kimlik (`id: '/dashboard'`) ve ayırt edici kısa ad (`lib/panel-manifest.ts`): aynı
 * telefona ikisi de ayrı simgeyle yüklenir. Kapsam bütün site: oturum düşünce açılan giriş sayfası (`/login`) ve
 * GitHub dönüşü de uygulamanın penceresinde kalır.
 *
 * Marka ayarı değişince yeni kurulumlar güncel adı görür (istek anında okunur, önbellek yok). Dil isteğin dili
 * (`localeFromRequest`; manifest çerezsiz gelir, pratikte `Accept-Language`).
 */
export async function GET(request: Request) {
  const config = await readAppConfig();
  return new Response(JSON.stringify(panelManifest({ appName: config.appName, locale: localeFromRequest(request) })), {
    headers: { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'no-cache', Vary: 'Accept-Language, Cookie' },
  });
}
