import type { COACH_PAGES } from './coach-contract.ts';
export function coachPage(pathname: string): typeof COACH_PAGES[number] {
  // Hareket (`screening`) ve kamera ölçümü (PT `measurements/camera`, danışan `/me/olcum`) Sağlık'ın parçası;
  // önce bunlar, yoksa `measurements` eşleşmesi kamerayı Ölçümler'e alırdı. Elle girilen ölçümler Ölçümler'de.
  if (/screening|measurements\/camera|olcum/.test(pathname)) return 'health';
  if (/measurements/.test(pathname)) return 'measurements';
  if (/antrenman|sessions|gecmis/.test(pathname)) return 'workout';
  if (/ilerleme/.test(pathname)) return 'progress';
  // AI taslakları (`/coach/drafts/…`) Program sekmesinin altında.
  if (/program|\/coach\/drafts/.test(pathname)) return 'program';
  if (/settings|ayarlar/.test(pathname)) return 'settings';
  if (/templates|exercises|devices/.test(pathname)) return 'library';
  if (/constraints|saglik/.test(pathname)) return 'health';
  return 'overview';
}
export function coachClientOf(pathname: string) { return /^\/dashboard\/clients\/(c_[a-z0-9]{6,24})(?:\/|$)/.exec(pathname)?.[1] ?? null; }
export const COACH_PAGE_LABELS = { overview: 'Genel bakış', program: 'Program', measurements: 'Ölçümler', workout: 'Antrenman', progress: 'İlerleme', settings: 'Ayarlar', library: 'Kütüphane', health: 'Sağlık' };

/** Paneli açarken bağlam: PT'de hangi danışan, hangi sekme, açılınca hemen değerlendirilsin mi. */
export type CoachOpen = { clientId?: string; tab?: 'review' | 'program'; autoReview?: boolean };
/** Bir açılış isteği: `n` her `openCoach`ta artar (panel sıfırdan kurulur), `path` açıldığı sayfa. */
export type CoachRequest = { n: number; path: string; detail: CoachOpen };

/**
 * Panelde kimin, hangi sekmeyle açılacağı (saf; `CoachLauncher` kullanır). Açılış bağlamı (`detail`) açıldığı
 * sayfaya ait: panel açıkken tarayıcıda geri/ileri gidilince danışan yine yoldan gelir. PT'nin zorladığı danışan
 * (`clientId`) yolun ve "Tüm danışanlar" seçiminin önüne geçer; danışan rolünde yalnız kendi kaydı. `key` paneli
 * kurar: değerlendirmenin tüketilmesi (`consumeAutoReview`) onu değiştirmez, panel yeniden kurulmaz.
 */
export function coachSelection({ role, routeClient, generalPath, pathname, request }: { role: 'pt' | 'client'; routeClient: string | null; generalPath: string | null; pathname: string; request: CoachRequest }) {
  const detail: CoachOpen = request.path === pathname ? request.detail : {};
  const forced = role === 'pt' ? detail.clientId ?? null : null;
  const selected = forced ?? (generalPath === pathname && role === 'pt' ? null : routeClient);
  const page = coachPage(pathname);
  return {
    selected, page, general: role === 'pt' && !selected,
    initialTab: detail.tab, autoReview: detail.autoReview === true,
    // "Tüm danışanlar ↔ bu danışan" geçişi yalnız PT'de, danışan sayfasındayken.
    toggle: role === 'pt' && routeClient !== null,
    key: `${role}:${selected ?? 'general'}:${page}:${request.n}`,
  };
}

/** Otomatik değerlendirme açılış başına bir kez: panel isteği gönderirken açılış isteğinden düşer (aynı `n`, aynı bağlam). */
export function consumeAutoReview(request: CoachRequest): CoachRequest {
  return request.detail.autoReview ? { ...request, detail: { ...request.detail, autoReview: false } } : request;
}
