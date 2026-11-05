import { DEFAULT_LOCALE, type Locale } from '../i18n/locale.ts';
import { shellMessages } from '../i18n/messages/shell/index.ts';
import type { LinkClick } from './unsaved-changes.ts';

/**
 * PT kabuğunun gezinme kuralları (SPEC §6), tarayıcıdan ve Next'ten bağımsız saf mantık:
 * sayfa geçişi göstergesi, girişten sonra dönülecek yol, "sayfa yok" ekranının dönüş bağlantısı
 * ve geçişte gösterilecek iskelet.
 */

/**
 * Bir bağlantı tıklaması uygulamanın başka bir SAYFASINA geçiş başlatıyor mu: başlatıyorsa gidilen
 * yol, başlatmıyorsa null. Yeni sekme, indirme, değiştirici tuş, orta tık, başka site, `mailto:`,
 * aynı adres (yalnız çapa) ve `/api/` uçları (dosya, yönlendirme) sayfa geçişi değildir.
 * Kaydedilmemiş değişiklik korumasının süzgeciyle (`leaveHref`) aynı kurallar.
 */
export function navigationHref(click: LinkClick): string | null {
  if (click.href === null || click.button !== 0 || click.modified || click.download) return null;
  if (click.target && click.target !== '_self') return null;
  let here: URL;
  let url: URL;
  try {
    here = new URL(click.location);
    url = new URL(click.href, here);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.origin !== here.origin) return null;
  if (url.pathname === here.pathname && url.search === here.search) return null;
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Girişten sonra dönülecek yolun sorgu parametresi (`/login?next=…`). */
export const RETURN_PARAM = 'next';

/**
 * İstenen PT sayfasının yolu: `src/proxy.ts` her `/dashboard` isteğine koyar, oturum yoksa
 * `requirePt` girişe bununla yollar (sunucu bileşeni adresi başka yoldan bilemez). İstemcinin
 * gönderdiği aynı adlı başlığı proxy ezer; değer yine `safeReturnPath`'ten geçer.
 */
export const PATH_HEADER = 'x-pulsecoach-path';

const PT_AREA = '/dashboard';
const BASE = 'http://pulsecoach.invalid';

/**
 * Oturumsuz açılan PT sayfasına girişten sonra dönmek için güvenli yol, değilse null. Yalnız aynı
 * kökende `/dashboard` altı kabul edilir (açık yönlendirme yok): `//site`, `/\site`, `https://…`,
 * `javascript:` ve başka alanlar düşer. Yol URL ayrıştırıcısının çıktısından kurulur (sekme, satır
 * sonu, `..` temizlenmiş olur); Next'in iç `_rsc` parametresi atılır.
 */
export function safeReturnPath(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return null;
  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE) return null;
  if (url.pathname !== PT_AREA && !url.pathname.startsWith(`${PT_AREA}/`)) return null;
  url.searchParams.delete('_rsc');
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Oturum yokken gidilecek giriş adresi: istenen PT sayfası dönüş yolu olarak taşınır. */
export function loginPath(from: string | null | undefined): string {
  const next = safeReturnPath(from);
  return next && next !== PT_AREA ? `/login?${RETURN_PARAM}=${encodeURIComponent(next)}` : '/login';
}

/** "Sayfa yok" ekranında dönülecek liste: adresin ait olduğu bölüm, yoksa genel bakış. */
const SECTIONS = ['templates', 'exercises', 'devices', 'attachments', 'clients'] as const;

export function notFoundBackLink(pathname: string, locale: Locale = DEFAULT_LOCALE): { href: string; label: string } {
  const backTo = shellMessages(locale).backTo;
  const [root, section] = pathname.split('/').filter(Boolean);
  // Yalnız listedeki adlar: "constructor" gibi yollar nesnenin prototipine düşmesin.
  const known = SECTIONS.find((name) => name === section);
  if (root === 'dashboard' && known) return { href: `${PT_AREA}/${known}`, label: backTo[known] };
  return root === 'dashboard' ? { href: PT_AREA, label: backTo.overview } : { href: '/', label: backTo.home };
}

/** Kütüphane bölümünün listeleri (sekmeleriyle açılan sayfalar). */
const LIBRARY_LISTS = ['/dashboard/templates', '/dashboard/exercises', '/dashboard/devices', '/dashboard/attachments'];

/**
 * Ayarlar bölümünün sayfaları, sekme sırasıyla (tek yer): sekmeleri `settings/settings-tabs.tsx` çizer, geçiş
 * iskeleti (`skeletonKind`) buradan tanır. Avatar menüsündeki tek "Ayarlar" öğesi bölümün girişine (Görünüm) açılır.
 */
export function settingsSections(locale: Locale = DEFAULT_LOCALE): readonly { href: string; label: string }[] {
  const label = shellMessages(locale).settingsSections;
  return [
    { href: '/dashboard/settings', label: label.appearance },
    { href: '/dashboard/settings/ai', label: label.ai },
    { href: '/dashboard/settings/updates', label: label.updates },
    { href: '/dashboard/settings/app', label: label.app },
  ];
}

/** Türkçe sekmeler (eski çağrılar); arayüz `settingsSections(locale)` kullanır. */
export const SETTINGS_SECTIONS = settingsSections('tr');

const SETTINGS_PAGES: readonly string[] = SETTINGS_SECTIONS.map((section) => section.href);

/**
 * Sayfa geçişinde yüklenirken gösterilecek iskeletin biçimi; hedef sayfanın yerleşimine benzer
 * (`dashboard/route-skeleton.tsx`).
 * - `overview`: genel bakış · `library`: Kütüphane listesi (sekmeler + kart ızgarası)
 * - `list`: danışan listesi · `form`: oluşturma ve düzenleme · `settings`: Ayarlar (sekmeler + form)
 * - `client`: danışanın sayfası (başlık + sekmeler) · `detail`: kaydın detayı
 */
export type SkeletonKind = 'overview' | 'library' | 'list' | 'form' | 'settings' | 'client' | 'detail';

export function skeletonKind(pathname: string): SkeletonKind {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (path === PT_AREA) return 'overview';
  if (LIBRARY_LISTS.includes(path)) return 'library';
  if (SETTINGS_PAGES.includes(path)) return 'settings';
  if (path === '/dashboard/clients') return 'list';
  // Danışanın bütün sayfaları (düzenleme dahil) aynı başlık ve sekmelerin altında açılır.
  if (path.startsWith('/dashboard/clients/') && path !== '/dashboard/clients/new') return 'client';
  if (path.endsWith('/new') || path.endsWith('/edit')) return 'form';
  return 'detail';
}
