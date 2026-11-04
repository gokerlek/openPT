import { clientIdParam, clientManifest } from '@/lib/client-manifest';
import { readAppConfig } from '@/lib/config';

/**
 * Danışan uygulamasının manifest'i, eskisiyle aynı adreste (`/manifest.webmanifest`). Next'in `app/manifest.ts`
 * dosya kuralı istek adresini okuyamadığı için route handler: danışan sayfaları `?c=<kimlik>` ile bağlar ve
 * uygulama kimlikli girişle açılır (`lib/client-manifest.ts`). Geçersiz kimlik yok sayılır. Kök düzen yalın
 * adresi bağlar; ikisi aynı adreste olamayacağı için `manifest.ts` yok.
 *
 * Marka ayarı değişince yeni kurulumlar güncel adı görür (istek anında okunur, önbellek yok).
 */
export async function GET(request: Request) {
  const config = await readAppConfig();
  const clientId = clientIdParam(new URL(request.url).searchParams.get('c'));
  return new Response(JSON.stringify(clientManifest({ appName: config.appName, clientId })), {
    headers: { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'no-cache' },
  });
}
