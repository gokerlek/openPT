import 'server-only';
import { DEVICE_LIBRARY } from '@/data/device-library';
import type { Locale } from '@/i18n/locale';
import { appRepoFiles } from './app-repo-files';
import { DEVICES, readCatalog, type CatalogFile } from './catalog-store';
import { mergeDevices } from './library-lists';
import type { Device } from './schemas/device';

/**
 * Cihazlar: hazır katalog (pakette) + PT'nin eklediği ya da değiştirdiği cihazlar (repo'da).
 * Aynı kimlik iki tarafta da varsa PT'ninki kazanır (ör. blok adımı farklı bir chest press).
 * Egzersizlerdeki gibi sunucuda önbellek yok: kaydın ardından açılan sayfa yeni kaydı görür.
 * Hazır katalogun adı ve notu `locale` verilince o dilde okunur (`library-lists.ts`; verilmezse olduğu gibi, dil burada
 * çerezden okunmaz: `unstable_cache` içinde çağrılabilir); PT'nin kayıtları olduğu gibi gelir. Dönen liste bir PT dosyasına olduğu gibi yazılmamalı (çevrilmiş metin PT'nin içeriği olurdu).
 */

export const CUSTOM_DEVICES_PATH = DEVICES.path;

export type DeviceWithSource = Device & { source: 'library' | 'custom' };
export type DeviceDetail = DeviceWithSource & { overridesLibrary: boolean };

/** PT'nin dosyası: okunabilen cihazlar, okunamayanlar (sayısı ve ham hâli) ve `sha`. */
export type CustomDevices = CatalogFile<Device>;

/**
 * Taze okuma. Öğe öğe doğrulanır (`src/lib/stored-list.ts`): şemaya uymayan kayıt (ya da aynı
 * kimliğin ikinci kaydı) listede görünmez ama dosyadan da düşmez. Dosya liste değilse hata verir.
 * Yazma uçların çekirdeğinde (`src/lib/catalog-actions.ts`).
 */
export async function readCustomDevices(): Promise<CustomDevices> {
  return readCatalog(appRepoFiles(), DEVICES);
}

/** Hazır katalog + PT'nin cihazları. Dosya zaten okunduysa (`custom`) yeniden okunmaz. `locale` verilmezse çeviri yok. */
export async function listDevices(custom?: Pick<CustomDevices, 'items'>, locale?: Locale): Promise<DeviceWithSource[]> {
  const { items } = custom ?? (await readCustomDevices());
  return mergeDevices(items, DEVICE_LIBRARY, locale);
}

export async function getDevice(id: string, list?: DeviceWithSource[], locale?: Locale): Promise<DeviceDetail | null> {
  const all = list ?? (await listDevices(undefined, locale));
  const found = all.find((item) => item.id === id);
  if (!found) return null;
  return { ...found, overridesLibrary: found.source === 'custom' && DEVICE_LIBRARY.some((item) => item.id === id) };
}
