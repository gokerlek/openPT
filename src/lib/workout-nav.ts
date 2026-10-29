import { ENTRY_ID_PATTERN } from './schemas/session.ts';
import { BLOCK_ID_PATTERN } from './template-plan.ts';

/**
 * Antrenman ekranının adresi (Faz 2, liste + odak). Odak `?hareket=<birim>`; liste işareti `?liste=1` geri tuşu
 * korkuluğudur (listeden geri "Ara verilsin mi?"). Adres `window.history.pushState/replaceState` ile değişir:
 * Next yerel geçmiş çağrılarını yönlendiriciye bağlar, sunucuya gidilmez (çevrimdışı salon). `bitir` bir kez
 * okunur, sonraki adreslerde düşer.
 *
 * Birim anahtarı blok kimliğidir (`b_…`), eklenen harekette kaydın kimliği (`e_…`); desenler yerlerinden gelir.
 * İstemci paketine girer (`workout-screen.tsx`); import zinciri yalnız saf modüllerdir.
 */

/** Odaktaki birimin adres parametresi. */
export const FOCUS_PARAM = 'hareket';
/** Liste işaretinin adres parametresi (değeri `1`). */
export const LIST_PARAM = 'liste';

const isUnitKey = (value: string) => BLOCK_ID_PATTERN.test(value) || ENTRY_ID_PATTERN.test(value);

/**
 * Şu anki adresten yeni antrenman adresi: `list` true/false işareti koyar/kaldırır, `focus` metinse odağı koyar,
 * null'sa kaldırır; verilmeyen alan dokunulmaz. Diğer parametreler (`program` …) kalır, `bitir` her zaman düşer.
 */
export function workoutHref(pathname: string, search: string, change: { focus?: string | null; list?: boolean }): string {
  const params = new URLSearchParams(search);
  params.delete('bitir');
  if (change.list === true) params.set(LIST_PARAM, '1');
  if (change.list === false) params.delete(LIST_PARAM);
  if (typeof change.focus === 'string') params.set(FOCUS_PARAM, change.focus);
  if (change.focus === null) params.delete(FOCUS_PARAM);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** Adresteki odak; birim anahtarı biçiminde değilse (elle yazılmış, bozuk) null. */
export function focusOf(params: Pick<URLSearchParams, 'get'>): string | null {
  const value = params.get(FOCUS_PARAM);
  return value && isUnitKey(value) ? value : null;
}
