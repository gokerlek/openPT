'use client';

import { useSyncExternalStore } from 'react';
import { installGuide, installSnoozeKey, isSnoozed, snoozeUntil, type InstallAudience, type InstallGuide } from '@/lib/install-guide';

/**
 * Yükleme yardımcısının tarayıcı tarafı: tarayıcı bilgisini toplar, kararı `lib/install-guide.ts` verir.
 *
 * - `beforeinstallprompt` (Chrome, Edge, Samsung) sayfa açılır açılmaz gelebilir; dinleyici bu modül
 *   yüklenince kurulur ve kök düzendeki `PwaRoot` modülü erkenden yükler. Olay saklanır, tarayıcının kendi
 *   küçük çubuğu çıkmaz; "Uygulamayı yükle" düğmesi sistem penceresini açar. Pencere bir kez kullanılır.
 * - Yüklü mü: uygulama olarak açık (`display-mode: standalone`, iOS `navigator.standalone`) ya da bu sayfada
 *   yükleme kabul edildi (`appinstalled`).
 * - "Şimdi değil" 14 gün gizler, yalnız bu cihazda ve yalnız o kitle için (danışan ve PT ayrı anahtar,
 *   `installSnoozeKey`): `localStorage`, her erişim try/catch içinde. Depo kapalıysa (gizli pencere) yalnız bu
 *   sayfa açıkken gizli kalır.
 */
type PromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export type InstallState = { guide: InstallGuide; snoozed: Record<InstallAudience, boolean> };

const STANDALONE = '(display-mode: standalone)';

let deferred: PromptEvent | null = null;
let acceptedHere = false;
const snoozedHere: Record<InstallAudience, boolean> = { client: false, pt: false };
let snapshot: InstallState | null = null;
const listeners = new Set<() => void>();

function changed() {
  snapshot = null;
  for (const listener of listeners) listener();
}

function readSnooze(audience: InstallAudience): string | null {
  try {
    return window.localStorage.getItem(installSnoozeKey(audience));
  } catch {
    return null;
  }
}

function snoozedNow(audience: InstallAudience, now: Date): boolean {
  return snoozedHere[audience] || isSnoozed(readSnooze(audience), now);
}

function isStandalone(): boolean {
  return window.matchMedia(STANDALONE).matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

let capturing = false;

/** Olay dinleyicilerini bir kez kurar (modül yüklenince kendiliğinden çağrılır). */
export function captureInstallPrompt(): void {
  if (capturing || typeof window === 'undefined') return;
  capturing = true;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as PromptEvent;
    changed();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    acceptedHere = true;
    changed();
  });
}

captureInstallPrompt();

function getSnapshot(): InstallState {
  const now = new Date();
  snapshot ??= {
    guide: acceptedHere
      ? 'installed'
      : installGuide({
          userAgent: navigator.userAgent,
          maxTouchPoints: navigator.maxTouchPoints ?? 0,
          standalone: isStandalone(),
          canPrompt: deferred !== null,
        }),
    snoozed: { client: snoozedNow('client', now), pt: snoozedNow('pt', now) },
  };
  return snapshot;
}

let standaloneQuery: MediaQueryList | null = null;

function subscribe(listener: () => void): () => void {
  // Uygulama penceresine geçiş ve başka sekmedeki "Şimdi değil"; ilk aboneyle kurulur, sonuncuyla kalkar.
  if (listeners.size === 0) {
    standaloneQuery = window.matchMedia(STANDALONE);
    standaloneQuery.addEventListener('change', changed);
    window.addEventListener('storage', changed);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    standaloneQuery?.removeEventListener('change', changed);
    standaloneQuery = null;
    window.removeEventListener('storage', changed);
  };
}

/** Sistem yükleme penceresini açar; pencere yoksa `unavailable`. */
async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const event = deferred;
  if (!event) return 'unavailable';
  // Pencere bir kez kullanılır: tarayıcı gerekirse yeni olay gönderir.
  deferred = null;
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === 'accepted') acceptedHere = true;
    return outcome;
  } catch {
    return 'unavailable';
  } finally {
    changed();
  }
}

function snooze(audience: InstallAudience): void {
  snoozedHere[audience] = true;
  try {
    window.localStorage.setItem(installSnoozeKey(audience), snoozeUntil(new Date()));
  } catch {
    // Depo kapalı: yalnız bu sayfa açıkken gizli.
  }
  changed();
}

/**
 * Bu cihazdaki yükleme durumu. Sunucuda ve ilk çizimde `null` (henüz bilinmiyor): yardımcı o ana kadar
 * hiçbir şey çizmez, hidrasyon uyuşmazlığı olmaz.
 */
export function useInstall(): { state: InstallState | null; promptInstall: typeof promptInstall; snooze: typeof snooze } {
  const state = useSyncExternalStore(subscribe, getSnapshot, () => null);
  return { state, promptInstall, snooze };
}
