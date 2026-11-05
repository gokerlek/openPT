import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import type { Messages } from './define';
import { LOCALE_COOKIE, resolveLocale, type Locale } from './locale';

/**
 * Sunucu bileşenleri, `generateMetadata` ve route handler'lar için isteğin dili: `locale` çerezi, yoksa
 * `Accept-Language`. İstek başına bir kez okunur (`cache`). İkisi de istek anı API'si: kök düzen okuduğu için bütün
 * sayfalar dinamik çizilir (`cacheComponents` kapalı, `<Suspense>` gerekmez).
 */
export const getLocale = cache(async (): Promise<Locale> => {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  return resolveLocale({ cookie: cookieStore.get(LOCALE_COOKIE)?.value, acceptLanguage: headerList.get('accept-language') });
});

/** İsteğin dilindeki sözlük: `const t = await getMessages(shellMessages)`. */
export async function getMessages<T>(messages: Messages<T>): Promise<T> {
  return messages(await getLocale());
}
