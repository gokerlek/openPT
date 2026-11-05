/**
 * Ağ yokken gösterilen sayfa (`/offline`, `public/sw.js`). Service worker onu kurulurken önbelleğe alır ve
 * uygulama her açıldığında tazeler (`offline-cache.ts`): marka adı ya da rengi
 * değişirse, ya da kurulumda ayar okunamayıp varsayılan ad yazıldıysa eskisi kalıcı olmaz. Sayfa gezinmesi
 * ağa ulaşamayınca bu döner. Önbellekte yalnız bu HTML durur: Next'in stil ve
 * betik dosyaları alınmadığı için sayfa kendi başına çalışır (satır içi stil, tek düğme). Marka adı ve
 * rengi kurulum anındaki ayardan gelir (düğme yazısı renge göre okunaklı); tema cihazın açık/koyu
 * tercihine uyar.
 */
import { DEFAULT_LOCALE, type Locale } from '../i18n/locale.ts';
import { shellMessages } from '../i18n/messages/shell/index.ts';
import { readableOn } from './color.ts';

const DEFAULT_ACCENT = '#c4f000';

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ENTITIES[char] ?? char);
}

/** Dil `/offline` isteğinin dili (`localeFromRequest`): service worker'ın isteği çerezi taşır. */
export function offlineHtml({ appName, accent, locale = DEFAULT_LOCALE }: { appName: string; accent: string | null; locale?: Locale }): string {
  const t = shellMessages(locale).offline;
  const name = escapeHtml(appName);
  const color = accent && /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : DEFAULT_ACCENT;
  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>${escapeHtml(t.title)} · ${name}</title>
<style>
:root { --accent: ${color}; --on-accent: ${readableOn(color)}; --bg: #171717; --fg: #fafafa; --muted: #a3a3a3; color-scheme: dark; }
@media (prefers-color-scheme: light) { :root { --bg: #fafafa; --fg: #171717; --muted: #525252; color-scheme: light; } }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100dvh; display: grid; place-items: center; padding: max(1.5rem, env(safe-area-inset-top)) 1rem max(1.5rem, env(safe-area-inset-bottom));
  background: var(--bg); color: var(--fg); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; text-align: center; }
main { width: 100%; max-width: 22rem; display: flex; flex-direction: column; align-items: center; gap: 0.75rem; }
svg { width: 10rem; height: 1.5rem; }
h1 { margin: 0.5rem 0 0; font-size: 1.375rem; line-height: 1.3; }
p { margin: 0; color: var(--muted); }
button { margin-top: 1rem; min-height: 2.75rem; width: 100%; border: 0; border-radius: 0.625rem; background: var(--accent); color: var(--on-accent); font: inherit; font-weight: 600; cursor: pointer; }
</style>
</head>
<body>
<main>
<svg viewBox="0 0 240 40" fill="none" aria-hidden="true"><path d="M0 20h78l8-13 10 26 9-19 7 6h128" stroke="var(--accent)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>
<p>${name}</p>
<h1>${escapeHtml(t.title)}</h1>
<p>${escapeHtml(t.body)}</p>
<button type="button" onclick="location.reload()">${escapeHtml(t.retry)}</button>
</main>
</body>
</html>
`;
}
