import type { Attachment } from '../lib/schemas/attachment.ts';
import type { Device } from '../lib/schemas/device.ts';
import type { Exercise } from '../lib/schemas/exercise.ts';
import type { Locale } from '../i18n/locale.ts';
import { ATTACHMENT_LIBRARY_EN } from './attachment-library.en.ts';
import { DEVICE_LIBRARY_EN } from './device-library.en.ts';
import { EXERCISE_LIBRARY_EN } from './exercise-library.en.ts';

/**
 * Hazır kataloğun metni okuyanın dilinde. Kütüphane Türkçe yazılı (`*-library.ts`); İngilizcesi kimliğe göre ayrı
 * tablolarda (`*-library.en.ts`). Tabloda olmayan kimlik ya da alan Türkçesiyle kalır. Veri taşıma yok.
 *
 * Yalnız hazır kütüphanenin öğesi çevrilir: PT'nin kendi öğesi ve hazır bir öğeyi değiştirdiği sürümü (aynı kimlik,
 * `source: 'custom'`) PT'nin içeriğidir, olduğu gibi kalır. `source` taşımayan öğe kütüphaneden sayılır; PT'nin
 * dosyasından okunan öğeyi buraya vermek çağıranın hatası.
 */

function fromLibrary(item: object): boolean {
  return !('source' in item) || item.source === 'library';
}

export function localizeExercise<T extends Exercise>(exercise: T, locale: Locale): T {
  if (locale === 'tr' || !fromLibrary(exercise)) return exercise;
  const text = EXERCISE_LIBRARY_EN[exercise.id];
  if (!text) return exercise;
  return {
    ...exercise,
    title: text.title || exercise.title,
    description: text.description ?? exercise.description,
    cues: text.cues ? [...text.cues] : exercise.cues,
  };
}

export function localizeDevice<T extends Device>(device: T, locale: Locale): T {
  if (locale === 'tr' || !fromLibrary(device)) return device;
  const text = DEVICE_LIBRARY_EN[device.id];
  if (!text) return device;
  return {
    ...device,
    name: text.name || device.name,
    ...(device.notes !== undefined && text.notes !== undefined ? { notes: text.notes } : {}),
  };
}

export function localizeAttachment<T extends Attachment>(attachment: T, locale: Locale): T {
  if (locale === 'tr' || !fromLibrary(attachment)) return attachment;
  const text = ATTACHMENT_LIBRARY_EN[attachment.id];
  return text?.name ? { ...attachment, name: text.name } : attachment;
}

/**
 * `localizedLibraryTitle` (geçmişte saklanan egzersiz adı okuyanın dilinde) `library-titles.ts`'te durur: küçük ve hiçbir
 * şeye bağlı değil. Buradan da alınabilir (imza ve yol aynı), ama istemci bileşenleri `@/data/library-titles`'tan almalı:
 * bu dosya İngilizce metin tablolarını (~32 KB) içe alır. `library-bundle.test.ts` istemcinin buraya varmasını reddeder.
 */
export { localizedLibraryTitle } from './library-titles.ts';
