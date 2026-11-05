import 'server-only';
import { EXERCISE_LIBRARY } from '@/data/exercise-library';
import { getLocale } from '@/i18n/server';
import type { Locale } from '@/i18n/locale';
import { appRepoFiles } from './app-repo-files';
import { EXERCISES, readCatalog, type CatalogFile } from './catalog-store';
import { mergeExercises } from './library-lists';
import type { Exercise } from './schemas/exercise';

/**
 * Egzersizler: hazır kütüphane (pakette) + PT'nin kendi egzersizleri (repo'da).
 *
 * İkisi ayrı durur ki paket güncellemesi PT'nin eklediklerini ezmesin. Aynı kimlik
 * iki tarafta da varsa PT'ninki kazanır — böylece PT hazır bir egzersizin ipuçlarını
 * kendine göre değiştirebilir.
 *
 * Hazır kütüphanenin metni okunurken isteğin dilinde verilir (`library-lists.ts`; veri taşıma yok, dosyada Türkçe
 * kalır). PT'nin kendi ve değiştirdiği egzersizler PT'nin yazdığı metindir, olduğu gibi gelir. Dönen liste bir PT
 * dosyasına olduğu gibi yazılmamalı: hazır bir öğenin çevrilmiş metni PT'nin içeriği olurdu.
 *
 * Sunucuda önbellek yok, her okuma GitHub'dan taze: kaydın hemen ardından açılan
 * sayfa yeni kaydı görmeli. Next'in veri önbelleği rota ucundan temizlendiğinde bu
 * garanti değil (kayıttan sonra açılan detay sayfası eski listeyi görüp 404 verdi).
 * Tek PT'li uygulamada her sayfada bir GitHub okuması sorun değil; istemcide
 * React Query önbelleği var.
 */

export const CUSTOM_EXERCISES_PATH = EXERCISES.path;

export type ExerciseWithSource = Exercise & { source: 'library' | 'custom' };

/** PT'nin dosyası: okunabilen egzersizler, okunamayanlar (sayısı ve ham hâli) ve `sha`. */
export type CustomExercises = CatalogFile<Exercise>;

/**
 * Taze okuma. Öğe öğe doğrulanır (`src/lib/stored-list.ts`): şemaya uymayan kayıt (ya da aynı
 * kimliğin ikinci kaydı) listede görünmez ama dosyadan da düşmez. Dosya liste değilse hata verir.
 * Yazma uçların çekirdeğinde (`src/lib/catalog-actions.ts`).
 */
export async function readCustomExercises(): Promise<CustomExercises> {
  return readCatalog(appRepoFiles(), EXERCISES);
}

/**
 * Hazır kütüphane + PT'nin egzersizleri. Dosya zaten okunduysa (`custom`) yeniden okunmaz. `locale` verilmezse
 * isteğin dili (yapay zekâ bağlamı, değişiklik denetimi için dilden bağımsız Türkçe hâlini de ister).
 */
export async function listExercises(custom?: Pick<CustomExercises, 'items'>, locale?: Locale): Promise<ExerciseWithSource[]> {
  const { items } = custom ?? (await readCustomExercises());
  return mergeExercises(items, EXERCISE_LIBRARY, locale ?? (await getLocale()));
}

export type ExerciseDetail = ExerciseWithSource & {
  /** PT'nin sürümü hazır kütüphanedeki bir egzersizin yerine geçiyor ("Varsayılana dön" mümkün). */
  overridesLibrary: boolean;
};

export async function getExercise(id: string, list?: ExerciseWithSource[]): Promise<ExerciseDetail | null> {
  const all = list ?? (await listExercises());
  const found = all.find((item) => item.id === id);
  if (!found) return null;
  const inLibrary = EXERCISE_LIBRARY.some((item) => item.id === id);
  return { ...found, overridesLibrary: found.source === 'custom' && inLibrary };
}
