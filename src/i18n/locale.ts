/**
 * Uygulamanın dilleri ve isteğin dilini bulma — saf: Next'e ve `@/` yollarına bağlı değil (testler Node'un test
 * aracıyla çalışır). Plan: `docs/plans/2026-11-05-coklu-dil-plan.md` §4.
 *
 * - Kod varsayılanı Türkçe (`DEFAULT_LOCALE`): isteği olmayan her yer (testler, eski çağrılar) Türkçe kalır.
 * - İstek: geçerli `locale` çerezi, yoksa tarayıcının `Accept-Language` sırası (tr ile en'den ağırlığı yüksek olan;
 *   ikisi de yoksa İngilizce, `FALLBACK_LOCALE`). Adresler dile göre değişmez.
 * - Biçimlendirme `intlLocale`: İngilizce `en-GB` (gün-ay sırası, 24 saat, metrik, hafta pazartesi başlar).
 */

export const LOCALES = ['tr', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/** Kod varsayılanı: istek yoksa (testler, varsayılan parametreler) Türkçe. */
export const DEFAULT_LOCALE: Locale = 'tr';
/** Tarayıcı ne Türkçe ne İngilizce istiyorsa. */
export const FALLBACK_LOCALE: Locale = 'en';

export const LOCALE_COOKIE = 'locale';
/** Bir yıl (saniye). */
export const LOCALE_COOKIE_MAX_AGE = 31_536_000;

/** Dil seçicideki adlar: her dil kendi adıyla yazılır, çevrilmez. */
export const LOCALE_NAMES: Record<Locale, string> = { tr: 'Türkçe', en: 'English' };

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * `Accept-Language` başlığından dil: tr ile en'den ağırlığı (`q`) yüksek olan; eşitse başlıkta önce yazılan.
 * Bölge eki önemsiz (`en-US`, `tr-TR`). İkisi de yoksa ya da `q=0` ise İngilizce. `de,tr;q=0.8` → tr.
 */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  let best: { locale: Locale; q: number } | null = null;
  for (const part of (acceptLanguage ?? '').split(',')) {
    const [tag = '', ...params] = part.trim().split(';');
    const primary = tag.trim().toLowerCase().split('-')[0];
    if (!isLocale(primary)) continue;
    const weight = params.map((param) => param.trim()).find((param) => param.startsWith('q='));
    const q = weight === undefined ? 1 : Number(weight.slice(2));
    if (!Number.isFinite(q) || q <= 0) continue;
    if (!best || q > best.q) best = { locale: primary, q };
  }
  return best?.locale ?? FALLBACK_LOCALE;
}

/** Çerez geçerliyse o, değilse tarayıcının dili. */
export function resolveLocale({ cookie, acceptLanguage }: { cookie?: string | null; acceptLanguage?: string | null }): Locale {
  return isLocale(cookie) ? cookie : negotiateLocale(acceptLanguage);
}

/** `Cookie` başlığından tek çerezin değeri. Aynı ad birden çok kez geçerse sonuncusu: Next'in `cookies()`'i gibi. */
function cookieValue(header: string | null, name: string): string | null {
  let value: string | null = null;
  for (const pair of (header ?? '').split(';')) {
    const index = pair.indexOf('=');
    if (index < 0 || pair.slice(0, index).trim() !== name) continue;
    const raw = pair.slice(index + 1).trim();
    try {
      value = decodeURIComponent(raw);
    } catch {
      value = raw;
    }
  }
  return value;
}

/** Route handler ve proxy için: isteğin çerezi ve `Accept-Language` başlığı. */
export function localeFromRequest(request: Request): Locale {
  return resolveLocale({
    cookie: cookieValue(request.headers.get('cookie'), LOCALE_COOKIE),
    acceptLanguage: request.headers.get('accept-language'),
  });
}

/** `Intl` biçimlendiricilerinin yerel ayarı. */
export function intlLocale(locale: Locale): string {
  return locale === 'en' ? 'en-GB' : 'tr-TR';
}

/** Dil seçicinin istemcide yazdığı çerez (`document.cookie`): bütün site, bir yıl, `SameSite=Lax`, https'te `Secure`. */
export function localeCookie(locale: Locale, secure: boolean): string {
  return `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax${secure ? '; Secure' : ''}`;
}
