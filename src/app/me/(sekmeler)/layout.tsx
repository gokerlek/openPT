import { Suspense } from 'react';
import { hasHealthSection } from '@/lib/client-status';
import { currentClient, requireClient } from '@/lib/guards';
import { ClientDock } from '../client-dock';

/**
 * Danışan kabuğu (docs/design/antrenman-ekrani.md §0, SPEC §6): sekme sayfaları (Bugün `/me`, Program,
 * İlerleme (içinde Geçmiş), Sağlık ve alt sayfaları; docs/design/kendi-program.md §2) ve avatar menüsünden
 * açılan Ayarlar aynı ortalı tek sütunda (`max-w-md`, 16 px kenar),
 * altta dock. Yalnız telefon, 375 px'te tasarlanır. Etkin antrenman (`/me/antrenman`) bu grubun
 * dışındadır: tam ekran, dock ve avatar menüsü yok.
 *
 * - Yetkinin asıl denetimi sayfalarda: her sayfa `currentClient()`'ı kendisi çağırır (SPEC §5; layout
 *   kardeş sayfanın çalışmasını durdurmaz). Kabuğun kendisi yalnız çereze bakar (`requireClient`):
 *   oturumu olmayan, sayfa yükleniyor iskeletiyle akmaya başlamadan girişe 307 alır.
 * - Kaydı yalnız dock'un Sağlık öğesi okur (`HealthAwareDock`, kısıt ya da tarama onaylı mı), o da
 *   `Suspense` içinde: kabuk kaydı beklemeden akar, o arada dock Sağlık'sız çizilir. `currentClient`
 *   istek başına önbellekli (React `cache`): sayfayla aynı okuma, `client.json` bir kez okunur.
 * - Alt boşluk dock'un yüksekliği ve güvenli alan (`--dock-clearance`): içerik dock'un altında kalmaz.
 * - Üstte iOS ana ekran kipinin güvenli alanı (`viewport-fit=cover`, saydam durum çubuğu).
 * - `overflow-x-clip`: sekme geçişinde yandan kayan içerik yatay kaydırma açmaz (`template.tsx`).
 */
export default async function ClientTabsLayout({ children }: { children: React.ReactNode }) {
  await requireClient();
  return (
    <>
      <div className="mx-auto w-full max-w-md overflow-x-clip px-4 pt-[max(2rem,calc(env(safe-area-inset-top)+0.75rem))] pb-[calc(var(--dock-clearance)+0.5rem)]">
        {children}
      </div>
      <Suspense fallback={<ClientDock health={false} />}>
        <HealthAwareDock />
      </Suspense>
    </>
  );
}

/** Dock, Sağlık öğesiyle: yalnız kısıt ya da tarama onaylıyken (tasarım `kisit-tarama.md` §5.2). */
async function HealthAwareDock() {
  const client = await currentClient();
  return <ClientDock health={hasHealthSection(client)} />;
}
