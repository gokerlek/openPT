'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Set giriş panelinin kapalı tutulması: danışanın bu cihazdaki tercihi (görüntüleyen başına kolaylık). Kapalıyken alt
 * kısımda yalnız "‹ Önceki · Sıradaki ›" satırı ve paneli açan düğme kalır; set tablodaki satırdan girilir. Depo her
 * erişimde try/catch içinde: gizli pencerede tercih yalnız sayfa açıkken sürer.
 */
const KEY = 'pulsecoach.entry-panel';

const listeners = new Set<() => void>();
/** Bu sayfada seçilen değer (depo kapalıyken de geçerli). */
let chosen: boolean | null = null;

function read(): boolean {
  if (chosen !== null) return chosen;
  try {
    return window.localStorage.getItem(KEY) === 'closed';
  } catch {
    return false;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Panel kapalı mı ve değiştiren; sunucuda ve ilk çizimde açık. */
export function useEntryPanelClosed(): [boolean, (closed: boolean) => void] {
  const closed = useSyncExternalStore(subscribe, read, () => false);
  const setClosed = useCallback((next: boolean) => {
    chosen = next;
    try {
      if (next) window.localStorage.setItem(KEY, 'closed');
      else window.localStorage.removeItem(KEY);
    } catch {
      // Depo kapalı: tercih yalnız bu sayfada.
    }
    listeners.forEach((listener) => listener());
  }, []);
  return [closed, setClosed];
}
