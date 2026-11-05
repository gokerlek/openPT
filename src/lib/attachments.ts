import 'server-only';
import { ATTACHMENT_LIBRARY } from '@/data/attachment-library';
import { getLocale } from '@/i18n/server';
import type { Locale } from '@/i18n/locale';
import { appRepoFiles } from './app-repo-files';
import { ATTACHMENTS, readCatalog, type CatalogFile } from './catalog-store';
import { mergeAttachments } from './library-lists';
import type { Attachment } from './schemas/attachment';

/**
 * Aparat havuzu: hazır liste (pakette) + PT'nin eklediği ya da değiştirdiği aparatlar
 * (repo'da). Aynı kimlik iki tarafta da varsa PT'ninki kazanır. Cihazlarda olduğu gibi
 * sunucuda önbellek yok: kaydın ardından açılan sayfa yeni kaydı görür. Hazır havuzun adı okunurken isteğin dilinde
 * verilir (`library-lists.ts`); PT'nin kayıtları olduğu gibi gelir. Dönen liste bir PT dosyasına olduğu gibi
 * yazılmamalı (çevrilmiş metin PT'nin içeriği olurdu).
 */

export const CUSTOM_ATTACHMENTS_PATH = ATTACHMENTS.path;

export type AttachmentWithSource = Attachment & { source: 'library' | 'custom' };
export type AttachmentDetail = AttachmentWithSource & { overridesLibrary: boolean };

/** PT'nin dosyası: okunabilen aparatlar, okunamayanlar (sayısı ve ham hâli) ve `sha`. */
export type CustomAttachments = CatalogFile<Attachment>;

/**
 * Taze okuma. Öğe öğe doğrulanır (`src/lib/stored-list.ts`): şemaya uymayan kayıt (ya da aynı
 * kimliğin ikinci kaydı) listede görünmez ama dosyadan da düşmez. Dosya liste değilse hata verir.
 * Yazma uçların çekirdeğinde (`src/lib/catalog-actions.ts`).
 */
export async function readCustomAttachments(): Promise<CustomAttachments> {
  return readCatalog(appRepoFiles(), ATTACHMENTS);
}

/** Hazır havuz + PT'nin aparatları. Dosya zaten okunduysa (`custom`) yeniden okunmaz. `locale` verilmezse isteğin dili. */
export async function listAttachments(custom?: Pick<CustomAttachments, 'items'>, locale?: Locale): Promise<AttachmentWithSource[]> {
  const { items } = custom ?? (await readCustomAttachments());
  return mergeAttachments(items, ATTACHMENT_LIBRARY, locale ?? (await getLocale()));
}

export async function getAttachment(id: string, list?: AttachmentWithSource[]): Promise<AttachmentDetail | null> {
  const all = list ?? (await listAttachments());
  const found = all.find((item) => item.id === id);
  if (!found) return null;
  return { ...found, overridesLibrary: found.source === 'custom' && ATTACHMENT_LIBRARY.some((item) => item.id === id) };
}
