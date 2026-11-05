import type { Attachment } from '../lib/schemas/attachment.ts';
import type { Device } from '../lib/schemas/device.ts';
import type { Exercise } from '../lib/schemas/exercise.ts';
import type { Locale } from '../i18n/locale.ts';
import { ATTACHMENT_LIBRARY_EN } from './attachment-library.en.ts';
import { DEVICE_LIBRARY_EN } from './device-library.en.ts';
import { EXERCISE_LIBRARY } from './exercise-library.ts';
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

let titles: Map<string, { tr: string; en?: string }> | null = null;

/** Kimlik → kütüphanedeki ad, iki dilde (ilk kullanımda bir kez kurulur). */
function libraryTitles(): Map<string, { tr: string; en?: string }> {
  titles ??= new Map(EXERCISE_LIBRARY.map((exercise) => [exercise.id, { tr: exercise.title, en: EXERCISE_LIBRARY_EN[exercise.id]?.title }]));
  return titles;
}

/**
 * Geçmişte saklanan egzersiz adı (o günkü adın kopyası: set kaydı, geri bildirim, öneri) okuyanın dilinde:
 * kopya o kimliğin kütüphanedeki adıyla (herhangi bir dilde) aynıysa kütüphanenin bu dildeki adı; değilse kopya
 * (PT'nin verdiği ad, sonradan değişen ya da silinen egzersiz). Türkçe çıktı değişmez; İngilizce kaydedilmiş geçmiş
 * Türkçe okuyana Türkçe görünür.
 */
export function localizedLibraryTitle(exerciseId: string, snapshot: string, locale: Locale): string {
  const entry = libraryTitles().get(exerciseId);
  if (!entry || (snapshot !== entry.tr && snapshot !== entry.en)) return snapshot;
  return locale === 'en' ? (entry.en ?? entry.tr) : entry.tr;
}
