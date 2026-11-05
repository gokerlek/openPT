'use client';

import { createContext, startTransition, useCallback, useContext } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import * as v from 'valibot';
import { OFFLINE_REFRESH_MESSAGE } from '@/lib/offline-cache';
import type { Messages } from './define';
import { DEFAULT_LOCALE, localeCookie, type Locale } from './locale';

/**
 * İstemci bileşenlerinin dili. Kök düzen isteğin dilini (`getLocale`) `Providers` üzerinden buraya verir; istemci
 * bileşenleri `useLocale()` ya da `useMessages(sozluk)` ile okur. React dışındaki istemci kodu (`fetchJson`'ın genel
 * mesajları) `currentClientLocale()` ile `<html lang>`'den okur.
 */
const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/**
 * Valibot'un genel dili: formisch `v.safeParseAsync`'i yapılandırmasız çağırır, şema mesajları (`msg`) dili buradan
 * alır. Yalnız tarayıcıda: sunucuda genel yapılandırma bütün isteklerce paylaşılır.
 */
function applyValidationLocale(locale: Locale) {
  if (typeof window === 'undefined' || v.getGlobalConfig().lang === locale) return;
  v.setGlobalConfig({ ...v.getGlobalConfig(), lang: locale });
}

export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  // Çocuklardan önce kurulur: ilk doğrulama da doğru dilde çıkar. Aynı dilde tekrar çağrı bir şey yapmaz.
  applyValidationLocale(locale);
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/** Bileşenin dilindeki sözlük: `const t = useMessages(shellMessages)`. */
export function useMessages<T>(messages: Messages<T>): T {
  return messages(useLocale());
}

export { currentClientLocale } from './client-locale';

/**
 * Dili değiştirir (dil seçici):
 * 1. Çerezi istemcide yazar (route handler değil: kurulum bitmeden proxy `/api`'yi 503'le keser).
 * 2. `<html lang>` ve valibot'un dili hemen değişir.
 * 3. React Query'deki sunucu metinleri tazelenir, service worker ağ yok sayfasını yeni dilde alır.
 * 4. Sunucu bileşenleri yeni dille yeniden çizilir (`router.refresh`).
 */
export function useSetLocale(): (next: Locale) => void {
  const router = useRouter();
  const queryClient = useQueryClient();
  return useCallback(
    (next: Locale) => {
      document.cookie = localeCookie(next, window.location.protocol === 'https:');
      document.documentElement.lang = next;
      applyValidationLocale(next);
      void queryClient.invalidateQueries();
      navigator.serviceWorker?.controller?.postMessage({ type: OFFLINE_REFRESH_MESSAGE });
      startTransition(() => router.refresh());
    },
    [queryClient, router],
  );
}
