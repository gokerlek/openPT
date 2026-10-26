import { SettingsTabSkeleton } from '../route-skeleton';

/**
 * Ayarlar'ın sekmeleri arasında geçişte. Üstteki `dashboard/loading.tsx` sınırı `settings` anahtarıyla yerinde
 * kalır, iskelet hiç görünmezdi. Bu dosya `settings`'in çocuklarını (Görünüm, `ai`, `updates`) kendi Suspense
 * sınırına alır; Next sınırı çocuk segmentin anahtarıyla kurar (`layout-router`: `TemplateContext.Provider
 * key={stateKey}`), sekme değişince sınır yeniden kurulur ve iskelet hemen görünür. Sınır Ayarlar düzeninin
 * (`layout.tsx`) içindedir: sekmeler yerinde kalır, burada çizilmez; yalnız başlık ve gövde.
 */
export default function Loading() {
  return <SettingsTabSkeleton />;
}
