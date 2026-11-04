import { readAppConfig } from '@/lib/config';
import { offlineHtml } from '@/lib/offline-page';

/**
 * Ağ yokken gösterilen sayfa (`lib/offline-page.ts`). Service worker (`public/sw.js`) kurulurken bunu bir kez
 * önbelleğe alır; ağa ulaşamayan sayfa gezinmesinde döner. Doğrudan açılınca da aynı sayfa (sınamak için).
 */
export async function GET() {
  const config = await readAppConfig();
  return new Response(offlineHtml({ appName: config.appName, accent: config.accent }), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
  });
}
