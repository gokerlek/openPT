/**
 * Yükleme yardımcısının saf mantığı (tasarım `2026-11-05-mobil-uygulama-ve-kolay-kurulum-design.md`, Paket A):
 * bu cihazda uygulama nasıl ana ekrana eklenir. Tarayıcıdan bağımsız; tarayıcı bilgisini bileşen toplar
 * (`components/install/install-state.ts`), burası yalnız karar verir.
 *
 * - `installed`: uygulama olarak açık (`display-mode: standalone` ya da iOS `navigator.standalone`); anlatım yok.
 * - `prompt`: tarayıcı yükleme penceresini veriyor (`beforeinstallprompt`: Android/masaüstü Chrome, Edge, Samsung).
 * - `ios-safari`: iPhone/iPad Safari: Paylaş → Ana Ekrana Ekle → Ekle.
 * - `ios-other`: iPhone/iPad'de Safari dışı tarayıcı ya da uygulama içi tarayıcı (Instagram, Facebook…): Safari'de aç.
 * - `android-in-app`: Android'de uygulama içi tarayıcı (WebView): Chrome'da aç.
 * - `mac-safari`: Mac Safari (dokunmatik değil): Dosya → Dock'a Ekle.
 * - `menu`: geri kalanı (pencere henüz gelmemiş Chrome, Firefox…): tarayıcı menüsünden ekle.
 */
export type InstallGuide = 'installed' | 'prompt' | 'ios-safari' | 'ios-other' | 'android-in-app' | 'mac-safari' | 'menu';

/** Yardımcıyı kimin gördüğü: metinler ve "Şimdi değil" anahtarı buna göre ayrılır. */
export type InstallAudience = 'client' | 'pt';

export type InstallEnv = {
  userAgent: string;
  /** `navigator.maxTouchPoints`: masaüstü dizesi gönderen iPad'i Mac'ten ayırır. */
  maxTouchPoints: number;
  /** Uygulama olarak açık. */
  standalone: boolean;
  /** Saklanmış bir `beforeinstallprompt` olayı var. */
  canPrompt: boolean;
};

/** iPadOS 13'ten beri iPad Safari "Macintosh" der; Mac'lerde dokunma noktası yok. */
function isIos(env: InstallEnv): boolean {
  return /iPhone|iPad|iPod/.test(env.userAgent) || (/Macintosh/.test(env.userAgent) && env.maxTouchPoints > 1);
}

/**
 * Safari dışı iOS tarayıcıları ve uygulama içi tarayıcıların imleri. Gömülü tarayıcının (WKWebView) dizesinde
 * "Version/…" ve "Safari/" hiç yoktur; Chrome, Firefox, Edge vb. kendi adını ekler.
 */
const IOS_NOT_SAFARI =
  /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|YaBrowser|DuckDuckGo|Ddg\/|GSA\/|Instagram|FBAN|FBAV|FBIOS|FB_IAB|Line\/|Twitter|LinkedInApp|Snapchat|musical_ly|BytedanceWebview|Pinterest|MicroMessenger|WhatsApp/;

function isIosSafari(userAgent: string): boolean {
  return /Version\/[\d.]+.*Safari\//.test(userAgent) && !IOS_NOT_SAFARI.test(userAgent);
}

/** Mac'te Safari: "Version/… Safari/" var; Chrome, Edge, Opera ve Firefox kendi adını ekler. */
function isMacSafari(userAgent: string): boolean {
  return /Macintosh/.test(userAgent) && /Version\/[\d.]+.*Safari\//.test(userAgent) && !/Chrome|Chromium|Edg\/|OPR\/|Firefox/.test(userAgent);
}

/** Android WebView'i dizesine "; wv)" koyar; bazı uygulamalar ayrıca kendi adını ekler. */
const ANDROID_IN_APP = /; wv\)|FB_IAB|FBAN|FBAV|Instagram|Line\/|musical_ly|BytedanceWebview|Snapchat|Twitter|LinkedInApp|Pinterest|MicroMessenger/;

export function installGuide(env: InstallEnv): InstallGuide {
  if (env.standalone) return 'installed';
  if (env.canPrompt) return 'prompt';
  if (isIos(env)) return isIosSafari(env.userAgent) ? 'ios-safari' : 'ios-other';
  if (isMacSafari(env.userAgent)) return 'mac-safari';
  if (/Android/.test(env.userAgent) && ANDROID_IN_APP.test(env.userAgent)) return 'android-in-app';
  return 'menu';
}

/** "Şimdi değil" bu kadar gün gizler (yalnız o cihazda). */
export const INSTALL_SNOOZE_DAYS = 14;
const SNOOZE_MS = INSTALL_SNOOZE_DAYS * 24 * 60 * 60 * 1000;

/** "Şimdi değil"in `localStorage` anahtarı; danışan ve PT ayrı (aynı cihazda biri ötekini gizlemesin). */
export function installSnoozeKey(audience: InstallAudience): string {
  return `pulsecoach.install-snoozed-until.${audience}`;
}

/** Telefona yazılacak değer: gizlemenin bittiği an (ISO). */
export function snoozeUntil(now: Date): string {
  return new Date(now.getTime() + SNOOZE_MS).toISOString();
}

/**
 * Yardımcı şu an gizli mi. Kayıt yoksa ya da okunamıyorsa gizli değil. 14 günden uzak bir tarih (elle
 * yazılmış, saat geri alınmış) sonsuza dek gizlemesin diye yok sayılır.
 */
export function isSnoozed(stored: string | null, now: Date): boolean {
  if (!stored) return false;
  const until = Date.parse(stored);
  if (Number.isNaN(until)) return false;
  const left = until - now.getTime();
  return left > 0 && left <= SNOOZE_MS;
}

function httpUrl(href: string): URL | null {
  try {
    const url = new URL(href);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

/** iOS 17+ "Safari'de aç": `x-safari-https://…` adresi Safari'yi açar. Eski sürümde işe yaramazsa bağlantı kopyalanır. */
export function safariUrl(href: string): string | null {
  const url = httpUrl(href);
  return url ? `x-safari-${url.href}` : null;
}

/** Android "Chrome'da aç": uygulama içi tarayıcıdan Chrome'u açan intent adresi (çapa taşınmaz). */
export function chromeIntentUrl(href: string): string | null {
  const url = httpUrl(href);
  if (!url) return null;
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${url.protocol.slice(0, -1)};package=com.android.chrome;end`;
}
