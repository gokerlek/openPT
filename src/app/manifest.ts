import type { MetadataRoute } from 'next';
import { manifestIcons } from '@/lib/brand-icon';
import { readAppConfig } from '@/lib/config';

// Marka ayarları değişince yeni kurulumlar güncel adı görür.
export const dynamic = 'force-dynamic';

/**
 * Danışan uygulamasının manifest'i (kök düzen bağlar). Kimliği (`id: '/'`) ve başlangıcı (`/me`) değişmez:
 * değişirse telefonlardaki eski yüklemeler başka uygulama sayılır. PT paneli ayrı simgeyle kendi manifest'ini
 * kullanır (`panel.webmanifest/route.ts`).
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const config = await readAppConfig();
  return {
    id: '/',
    name: config.appName,
    short_name: config.appName,
    description: `${config.appName} — antrenman takibi`,
    lang: 'tr',
    start_url: '/me',
    scope: '/',
    display: 'standalone',
    background_color: '#171717',
    theme_color: '#171717',
    icons: manifestIcons(),
  };
}
