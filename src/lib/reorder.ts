/** Sıralama hedefi: bir yukarı/aşağı ya da uçlara. */
export type ReorderTarget = 'up' | 'down' | 'top' | 'end';

/**
 * Anahtarı listede taşır (klavyeyle sıralama). Değiştirmez: yeni dizi döner; anahtar yoksa
 * ya da zaten o uçtaysa aynı dizi döner (çağıran `===` ile "taşınmadı"yı anlar).
 */
export function moveKey<K>(keys: readonly K[], key: K, target: ReorderTarget): readonly K[] {
  const from = keys.indexOf(key);
  if (from === -1) return keys;
  const to = target === 'up' ? from - 1 : target === 'down' ? from + 1 : target === 'top' ? 0 : keys.length - 1;
  if (to < 0 || to >= keys.length || to === from) return keys;
  const next = keys.slice();
  next.splice(from, 1);
  next.splice(to, 0, key);
  return next;
}

/**
 * Sürükle-bırak: anahtar, üzerine bırakıldığı anahtarın eski sırasına girer (aşağı taşırken onun arkasına, yukarı taşırken
 * önüne). Aynı anahtar ya da biri yoksa aynı dizi.
 */
export function moveTo<K>(keys: readonly K[], key: K, overKey: K): readonly K[] {
  const from = keys.indexOf(key);
  const to = keys.indexOf(overKey);
  if (from === -1 || to === -1 || from === to) return keys;
  const next = keys.slice();
  next.splice(from, 1);
  next.splice(to, 0, key);
  return next;
}

/** Nesne listesinde taşıma: klavye adımı (`moveKey`) ya da bırakma (`moveTo`). Değiştirmez; taşınmadıysa aynı sıra. */
export function moveItem<T>(items: readonly T[], keyOf: (item: T) => string, key: string, target: ReorderTarget | { over: string }): T[] {
  const keys = items.map(keyOf);
  const order = typeof target === 'string' ? moveKey(keys, key, target) : moveTo(keys, key, target.over);
  const byKey = new Map(items.map((item) => [keyOf(item), item]));
  return order.map((item) => byKey.get(item) as T);
}

const MOVE_KEYS: Record<string, ReorderTarget> = { ArrowUp: 'up', ArrowDown: 'down', Home: 'top', End: 'end' };

/** Odaktaki öğeyi taşıyan tuş: Alt + ↑/↓/Home/End; değilse `null`. */
export function moveTargetOf(event: { altKey: boolean; key: string }): ReorderTarget | null {
  return event.altKey ? (MOVE_KEYS[event.key] ?? null) : null;
}
