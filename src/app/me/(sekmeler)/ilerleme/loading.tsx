import { TabSkeleton } from '../../tab-skeleton';

/**
 * Özet ↔ Rekorlar geçişinin iskeleti (`tab-skeleton.tsx`). İkisi de `ilerleme` segmentinin altında: üstteki
 * `(sekmeler)/loading.tsx` ve `template.tsx` `ilerleme` anahtarıyla yerinde kalır, eski sayfa yükleme bitene
 * dek dururdu. Bu dosya `ilerleme`'nin çocuklarını (sayfası ve `rekorlar`) kendi Suspense sınırına alır; Next
 * sınırı çocuk segmentin anahtarıyla kurar (`layout-router`: `TemplateContext.Provider key={stateKey}`), bölüm
 * değişince sınır yeniden kurulur ve iskelet hemen görünür.
 */
export default function Loading() {
  return <TabSkeleton />;
}
