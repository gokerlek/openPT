import { localizeAttachment, localizeDevice, localizeExercise } from '../data/library-text.ts';
import { DEFAULT_LOCALE, type Locale } from '../i18n/locale.ts';
import { compareText } from '../i18n/text.ts';
import type { Attachment } from './schemas/attachment.ts';
import type { Device } from './schemas/device.ts';
import type { Exercise } from './schemas/exercise.ts';

/**
 * Hazır kütüphane + PT'nin kayıtları, okunurken okuyanın dilinde (`listExercises`, `listDevices`, `listAttachments`
 * bunları çağırır; saf kalsın diye burada). Aynı kimlik iki tarafta da varsa PT'ninki kazanır ve olduğu gibi gelir:
 * yalnız `source: 'library'` öğenin metni çevrilir (`library-text.ts`). Sıra okuyanın dilinin alfabesine göre.
 * `locale` verilmezse çeviri yok: öğeler olduğu gibi (Türkçe) ve Türkçe sırayla gelir. İstek dışı bağlamlar
 * (`unstable_cache` içindeki bildirim özeti gibi) dili okuyamaz; dil isteyen sayfa ve uçlar `await getLocale()` ile verir.
 * Hiçbiri yazmaz: dönen liste bir PT dosyasına olduğu gibi yazılırsa hazır öğenin çevrilmiş metni PT'nin içeriği olurdu.
 */

type Sourced<T> = T & { source: 'library' | 'custom' };

function merge<T extends { id: string }>(custom: readonly T[], library: readonly T[], localize: (item: Sourced<T>) => Sourced<T>): Sourced<T>[] {
  const customIds = new Set(custom.map((item) => item.id));
  return [
    ...custom.map((item) => ({ ...item, source: 'custom' as const })),
    ...library.filter((item) => !customIds.has(item.id)).map((item) => localize({ ...item, source: 'library' as const })),
  ];
}

export function mergeExercises(custom: readonly Exercise[], library: readonly Exercise[], locale: Locale = DEFAULT_LOCALE): Sourced<Exercise>[] {
  const compare = compareText(locale);
  return merge(custom, library, (item) => localizeExercise(item, locale)).sort((a, b) => compare(a.title, b.title));
}

export function mergeDevices(custom: readonly Device[], library: readonly Device[], locale: Locale = DEFAULT_LOCALE): Sourced<Device>[] {
  const compare = compareText(locale);
  return merge(custom, library, (item) => localizeDevice(item, locale)).sort((a, b) => compare(a.name, b.name));
}

export function mergeAttachments(custom: readonly Attachment[], library: readonly Attachment[], locale: Locale = DEFAULT_LOCALE): Sourced<Attachment>[] {
  const compare = compareText(locale);
  return merge(custom, library, (item) => localizeAttachment(item, locale)).sort((a, b) => compare(a.name, b.name));
}
