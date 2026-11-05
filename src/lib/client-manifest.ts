import type { MetadataRoute } from 'next';
import { DEFAULT_LOCALE, type Locale } from '../i18n/locale.ts';
import { shellMessages } from '../i18n/messages/shell/index.ts';
import { manifestIcons } from './brand-icon.ts';
import { CLIENT_ID_PATTERN } from './schemas/client.ts';

/**
 * Danışan uygulamasının manifest'i (`/manifest.webmanifest`, `app/manifest.webmanifest/route.ts`).
 *
 * iPhone'da ana ekrana eklenen uygulama Safari'nin çerezini ve `localStorage`'ını görmeyebilir: oturum ve
 * telefonda saklanan kimlik (`giris/remembered-client.ts`) uygulamaya geçmezse danışan ilk açılışta kimliksiz
 * `/giris`'te kalırdı. Bu yüzden danışan sayfaları manifest'i kimlikle bağlar (`?c=<kimlik>`) ve uygulama
 * kimlikli girişle açılır (`/giris?c=…`; oturum varsa oradan programa). Kimlik zaten giriş adresinde duran
 * gizli olmayan bir değer; manifest'e başka kişisel veri girmez.
 *
 * Kimlik (`id: '/'`) hiç değişmez: değişirse telefonlardaki eski yüklemeler başka uygulama sayılır. PT paneli
 * ayrı manifest kullanır (`panel.webmanifest/route.ts`).
 */
export const CLIENT_MANIFEST_PATH = '/manifest.webmanifest';

/** Adresten gelen kimlik: yalnız geçerli biçimdeyse, değilse null (yok sayılır). */
export function clientIdParam(value: string | null | undefined): string | null {
  return value && CLIENT_ID_PATTERN.test(value) ? value : null;
}

/** Sayfanın `<link rel="manifest">` adresi. */
export function clientManifestHref(clientId: string | null | undefined): string {
  const id = clientIdParam(clientId);
  return id ? `${CLIENT_MANIFEST_PATH}?c=${id}` : CLIENT_MANIFEST_PATH;
}

/** Dil isteğin dili (`localeFromRequest`; tarayıcı manifest'i çerezsiz alır, pratikte `Accept-Language`). */
export function clientManifest({
  appName,
  clientId,
  locale = DEFAULT_LOCALE,
}: {
  appName: string;
  clientId: string | null;
  locale?: Locale;
}): MetadataRoute.Manifest {
  const id = clientIdParam(clientId);
  return {
    id: '/',
    name: appName,
    short_name: appName,
    description: shellMessages(locale).appDescription(appName),
    lang: locale,
    start_url: id ? `/giris?c=${id}` : '/me',
    scope: '/',
    display: 'standalone',
    background_color: '#171717',
    theme_color: '#171717',
    icons: manifestIcons(),
  };
}
