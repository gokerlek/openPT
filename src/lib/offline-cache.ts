/**
 * Service worker (`public/sw.js`) ile kayıt bileşeni (`components/install/pwa-root.tsx`) arasındaki sözleşme;
 * `sw.js` bu dosyayı içe aktaramadığı için aynı değerleri yazar, `offline-page.test.ts` eşleştiğini denetler.
 * İstemci paketine giren tek parça bu (sayfanın HTML'i girmez).
 */

/** `/offline` önbelleğinin adı. Sayfanın metni değişince sürüm artar, eski önbellek silinir. */
export const OFFLINE_CACHE = 'axon-offline-v2';

/** Uygulama açılınca service worker'a yollanan "/offline'ı tazele" mesajı. */
export const OFFLINE_REFRESH_MESSAGE = 'refresh-offline';
