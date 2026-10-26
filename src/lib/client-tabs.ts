/**
 * Danışan uygulamasının sekmeleri (docs/design/antrenman-ekrani.md §0, docs/design/kendi-program.md §2.1),
 * tarayıcıdan ve Next'ten bağımsız saf mantık: dock'un etkin öğesi ve sekme değişiminde içeriğin geldiği yön.
 * İkonlar ve dock `src/app/me/client-dock.tsx`'te; Sağlık öğesi yalnız kısıt ya da tarama onaylıyken görünür
 * (dock gizler, sıra burada sabit kalır). Hesapla ilgili her şey (Ayarlar, Çıkış) avatar menüsünde kalır ve
 * dock'ta tekrarlanmaz.
 */

export const CLIENT_TABS = [
  { href: '/me', label: 'Bugün' },
  { href: '/me/programlar', label: 'Program' },
  // Geçmiş, İlerleme'nin alt sekmesi (Özet · Geçmiş · Rekorlar); adresi yerinde kalır.
  { href: '/me/ilerleme', label: 'İlerleme', also: ['/me/gecmis'] },
  // Kamera ölçümü Sağlık'tan açılır, geri bağlantısı Sağlık.
  { href: '/me/saglik', label: 'Sağlık', also: ['/me/olcum'] },
] as const satisfies readonly { href: string; label: string; also?: readonly string[] }[];

export type ClientTab = (typeof CLIENT_TABS)[number];

/** Sondaki eğik çizgi yok sayılır (`/me/gecmis/` → `/me/gecmis`); kök `/` kalır. */
function withoutTrailingSlash(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
}

/** `href`'in kendisi ya da alt sayfası; `/me/gecmisler` `/me/gecmis`'in altı değildir. */
function isUnder(path: string, href: string): boolean {
  return path === href || path.startsWith(`${href}/`);
}

/**
 * Adresin ait olduğu sekmenin sırası; sekme dışındaki sayfada (Ayarlar) -1. Bugün yalnız tam
 * eşleşmede etkindir (`/me` bütün danışan adreslerinin önekidir); öteki sekmeler alt sayfalarında
 * da (`/me/programlar/[pid]/duzenle`, `/me/ilerleme/rekorlar`). Bir sekme `also`'daki adreslerde de
 * etkindir: Geçmiş (`/me/gecmis`, `/me/gecmis/[id]`) İlerleme'nin, kamera ölçümü (`/me/olcum`) Sağlık'ın
 * içindedir. Sondaki eğik çizgi yok sayılır; `/me/gecmisler` Geçmiş değildir.
 */
export function clientTabIndex(pathname: string): number {
  const path = withoutTrailingSlash(pathname);
  return CLIENT_TABS.findIndex((tab) => {
    if (tab.href === '/me') return path === tab.href;
    const prefixes: readonly string[] = 'also' in tab ? [tab.href, ...tab.also] : [tab.href];
    return prefixes.some((href) => isUnder(path, href));
  });
}

/**
 * İlerleme sekmesinin bölümleri, şeritteki sırayla (`src/app/me/progress-tabs.tsx`). Her biri ayrı
 * sayfadır; Geçmiş'in adresi (`/me/gecmis`) yerinde kalır.
 */
export const PROGRESS_SECTIONS = [
  { href: '/me/ilerleme', label: 'Özet' },
  { href: '/me/gecmis', label: 'Geçmiş' },
  { href: '/me/ilerleme/rekorlar', label: 'Rekorlar' },
] as const satisfies readonly { href: string; label: string }[];

/**
 * Adresin İlerleme şeridindeki etkin bölümü; bölüm dışında -1. Özet bölümün köküdür
 * (`/me/ilerleme/rekorlar` onun altında): yalnız tam eşleşmede etkin. Geçmiş ve Rekorlar alt
 * sayfalarında da (`/me/gecmis/[id]`). Sondaki eğik çizgi yok sayılır; `/me/gecmisler` Geçmiş değildir.
 */
export function progressSectionIndex(pathname: string): number {
  const path = withoutTrailingSlash(pathname);
  return PROGRESS_SECTIONS.findIndex((section, index) => (index === 0 ? path === section.href : isUnder(path, section.href)));
}

/**
 * Sayfanın başında İlerleme şeridi var mı: yalnız üç bölümün kendi sayfası. Geçmiş'teki antrenmanın
 * detayında (`/me/gecmis/[id]`) yok: başında geri bağlantısı var, şerit yok. Yükleniyor iskeleti şeridi
 * buna göre çizer (`src/app/me/tab-skeleton.tsx`).
 */
export function hasProgressTabs(pathname: string): boolean {
  const path = withoutTrailingSlash(pathname);
  return PROGRESS_SECTIONS.some((section) => section.href === path);
}

/**
 * Sekme değişiminde yeni içeriğin geldiği yön: dock'ta sağdaki sekmeye geçince sağdan (1),
 * soldakine geçince soldan (-1). İlk çizimde (`from` yok), aynı sekmede ve sekme dışı sayfaya
 * giriş ya da çıkışta 0: yalnız saydamlık, kayma yok.
 */
export function tabDirection(from: number | null, to: number): -1 | 0 | 1 {
  if (from === null || from < 0 || to < 0 || from === to) return 0;
  return to > from ? 1 : -1;
}
