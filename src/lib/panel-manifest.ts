import type { MetadataRoute } from 'next';
import { DEFAULT_LOCALE, type Locale } from '../i18n/locale.ts';
import { shellMessages } from '../i18n/messages/shell/index.ts';
import { manifestIcons } from './brand-icon.ts';

/**
 * PT panelinin manifest'i (`/panel.webmanifest`, `app/panel.webmanifest/route.ts`) ve ana ekrandaki adı.
 *
 * Panel ve danışan uygulaması aynı simgeyi kullanır; aynı telefonda ikisi yalnız adından ayırt edilir. Bu yüzden
 * panelin kısa adı (Android ana ekranı) ve iPhone başlığı (`appleWebApp.title`, panel düzeni) "<ad> Panel".
 * Ana ekranda yaklaşık 12 harf görünür: sığmazsa önce ilk kelime, o da sığmazsa ilk kelime kısaltılır
 * ("PulseCoach" → "Pulse… Panel"). Tam ad (`name`) her zaman "<ad> Panel".
 */
export const HOME_SCREEN_LABEL_MAX = 12;

const SUFFIX = ' Panel';

function length(text: string): number {
  return Array.from(text).length;
}

export function panelShortName(appName: string): string {
  const name = appName.trim().replace(/\s+/g, ' ');
  if (length(name + SUFFIX) <= HOME_SCREEN_LABEL_MAX) return name + SUFFIX;
  const first = name.split(' ')[0] ?? name;
  if (length(first + SUFFIX) <= HOME_SCREEN_LABEL_MAX) return first + SUFFIX;
  return `${Array.from(first).slice(0, HOME_SCREEN_LABEL_MAX - length(SUFFIX) - 1).join('')}…${SUFFIX}`;
}

/** Dil isteğin dili (`localeFromRequest`). Ad ve kısa ad dile göre değişmez ("<ad> Panel"). */
export function panelManifest({ appName, locale = DEFAULT_LOCALE }: { appName: string; locale?: Locale }): MetadataRoute.Manifest {
  return {
    id: '/dashboard',
    name: `${appName}${SUFFIX}`,
    short_name: panelShortName(appName),
    description: shellMessages(locale).panelDescription(appName),
    lang: locale,
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#171717',
    theme_color: '#171717',
    icons: manifestIcons(),
  };
}
