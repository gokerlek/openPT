import type { MetadataRoute } from 'next';
import { manifestIcons } from '@/lib/brand-icon';
import { readAppConfig } from '@/lib/config';

/**
 * PT panelinin manifest'i (`/panel.webmanifest`; panel düzeni `dashboard/layout.tsx` bağlar). Danışan
 * uygulamasından ayrı kimlik (`id: '/dashboard'`): aynı telefona ikisi de ayrı simgeyle yüklenir. Ad
 * "<uygulama adı> Panel", ana ekrandaki kısa ad uygulama adı; simge aynı marka simgesi. Kapsam bütün site:
 * oturum düşünce açılan giriş sayfası (`/login`) ve GitHub dönüşü de uygulamanın penceresinde kalır.
 *
 * Marka ayarı değişince yeni kurulumlar güncel adı görür (istek anında okunur, önbellek yok).
 */
export async function GET() {
  const config = await readAppConfig();
  const manifest: MetadataRoute.Manifest = {
    id: '/dashboard',
    name: `${config.appName} Panel`,
    short_name: config.appName,
    description: `${config.appName} — antrenör paneli`,
    lang: 'tr',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#171717',
    theme_color: '#171717',
    icons: manifestIcons(),
  };
  return new Response(JSON.stringify(manifest), {
    headers: { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'no-cache' },
  });
}
