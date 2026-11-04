/**
 * Service worker (kapsam `/`; kayıt `src/components/install/pwa-root.tsx`).
 *
 * Yalnız sayfa gezinmelerine karışır: önce ağ; ağa ulaşılamazsa önbellekteki `/offline` sayfası
 * (`src/lib/offline-page.ts`). Önbellekte yalnız o tek HTML durur. API yanıtları, sayfa verisi (RSC), resim
 * ve dosyalar hiç önbelleğe alınmaz ve bu dosyadan geçmez: danışan verisi telefonda saklanmaz (gizlilik),
 * eski veri gösterilmez (bayatlık).
 *
 * Bu dosya değişince tarayıcı yenisini kurar; `CACHE` adı değişirse eski önbellek silinir.
 */
const CACHE = 'axon-offline-v1';
const OFFLINE_URL = '/offline';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      // Gezinme isteği service worker uyanırken başlar (ağ önce stratejisinin bekleme süresi kalkar).
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.mode !== 'navigate' || request.method !== 'GET') return;
  event.respondWith(
    (async () => {
      try {
        const preloaded = await event.preloadResponse;
        if (preloaded) return preloaded;
        return await fetch(request);
      } catch {
        // Ağ yok (sunucunun hata yanıtı buraya düşmez, olduğu gibi gösterilir).
        const offline = await caches.match(OFFLINE_URL, { cacheName: CACHE });
        return offline ?? Response.error();
      }
    })(),
  );
});
