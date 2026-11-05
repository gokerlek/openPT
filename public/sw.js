/**
 * Service worker (kapsam `/`; kayıt `src/components/install/pwa-root.tsx`).
 *
 * Yalnız sayfa gezinmelerine karışır: önce ağ; ağa ulaşılamazsa önbellekteki `/offline` sayfası
 * (`src/lib/offline-page.ts`). Önbellekte yalnız o tek HTML durur. Kurulurken alınır ve uygulama her açıldığında
 * tazelenir (kayıt bileşeninin `refresh-offline` mesajı): marka adı/rengi değişince eskisi kalmaz. API yanıtları, sayfa verisi (RSC), resim
 * ve dosyalar hiç önbelleğe alınmaz ve bu dosyadan geçmez: danışan verisi telefonda saklanmaz (gizlilik),
 * eski veri gösterilmez (bayatlık).
 *
 * Bu dosya değişince tarayıcı yenisini kurar; `CACHE` adı değişirse eski önbellek silinir. Ad ve mesaj
 * `src/lib/offline-cache.ts`'teki sabitlerle aynı (`offline-page.test.ts` denetler).
 */
const CACHE = 'axon-offline-v2';
const OFFLINE_URL = '/offline';

/**
 * `/offline`'ı ağdan yeniden alır. Yalnız düzgün yanıt yazılır: hata ya da yönlendirme (ör. kurulum bitmemişken
 * `/install`'a) eskisinin yerine geçmez. Kurulumda hata fırlatır (service worker kurulmaz, sonra yeniden denenir).
 */
async function refreshOffline() {
  const response = await fetch(new Request(OFFLINE_URL, { cache: 'reload' }));
  if (!(response.ok && !response.redirected)) throw new Error('offline sayfası alınamadı');
  const cache = await caches.open(CACHE);
  await cache.put(OFFLINE_URL, response);
}

self.addEventListener('install', (event) => {
  event.waitUntil(refreshOffline().then(() => self.skipWaiting()));
});

// Uygulama açılınca kayıt bileşeni yollar; ağ yoksa eski kopya kalır.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'refresh-offline') event.waitUntil(refreshOffline().catch(() => {}));
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
