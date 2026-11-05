import { DRAFT_PREFIX } from './unsaved-changes.ts';

/**
 * Düzenleyici taslağının tarayıcı deposu (localStorage), arayüzsüz: çıkış penceresi ve silme eylemleri yalnız bunu
 * çeker, düzenleyici bileşenini ve sözlüğünü değil (`src/components/block-editor/editor-draft.tsx` kancayı çizer).
 * Depo her erişimde try/catch içinde: gizli pencere ya da dolu depo taslaksız çalışır.
 */

export function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeRaw(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Depo kapalı ya da dolu: taslaksız devam (çıkış uyarısı yine tutar).
  }
}

export function removeRaw(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Depo kapalı: silinecek taslak da yok.
  }
}

/** Açık düzenleyicilerin durdurucuları: dışarıdan atılan taslağı düzenleyici yeniden yazmasın. */
export const stoppers = new Map<string, Set<() => void>>();

/** Taslağı atar, o anahtardaki açık düzenleyici de yazmayı bırakır (ör. program silinince). */
export function discardDraft(key: string): void {
  for (const stop of stoppers.get(key) ?? []) stop();
  removeRaw(key);
}

/** Bütün taslakları atar: PT çıkış yapınca (aynı tarayıcıyı başkası kullanabilir). */
export function discardAllDrafts(): void {
  discardDrafts(DRAFT_PREFIX);
}

/** Öneki tutan taslakları atar: danışan çıkış yapınca yalnız kendi programlarının taslakları (`ownDraftPrefix`). */
export function discardDrafts(prefix: string): void {
  for (const [key, set] of stoppers) if (key.startsWith(prefix)) for (const stop of set) stop();
  try {
    const store = window.localStorage;
    const keys = Array.from({ length: store.length }, (_, index) => store.key(index)).filter((key) => key?.startsWith(prefix));
    for (const key of keys) if (key) store.removeItem(key);
  } catch {
    // Depo kapalı: taslak da yok.
  }
}
