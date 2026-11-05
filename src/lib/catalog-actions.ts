import { createHash } from 'node:crypto';
import * as v from 'valibot';
import { messageOf } from '../i18n/errors.ts';
import { DEFAULT_LOCALE, type Locale } from '../i18n/locale.ts';
import { ptLibraryMessages } from '../i18n/messages/pt-library/index.ts';
import { langConfig, msg } from '../i18n/valibot.ts';
import {
  attachmentChoiceProblem,
  dropAttachmentFromDevices,
  dropAttachmentFromExercises,
  dropDetachedAttachments,
  dropDeviceFromExercises,
  dropPinnedAlternative,
  unknownAttachmentsProblem,
} from './catalog-refs.ts';
import {
  ATTACHMENTS,
  DEVICES,
  EXERCISES,
  readCatalog,
  readRetiredIds,
  retireId,
  updateCatalog,
  withLibrary,
  writeCatalog,
  type Catalog,
  type CatalogKind,
} from './catalog-store.ts';
import { takesAttachments } from './device-loads.ts';
import { GithubError } from './github/errors.ts';
import type { RepoFiles } from './repo-files.ts';
import { attachmentIdSchema, attachmentSaveSchema, LEGACY_ATTACHMENT_IDS } from './schemas/attachment.ts';
import {
  deviceIdSchema,
  deviceSaveSchema,
  needsBase,
  needsMax,
  needsStep,
  needsWeights,
  takesAddOns,
  type Device,
} from './schemas/device.ts';
import { exerciseSchema } from './schemas/exercise.ts';
import { newRecordId } from './slug.ts';
import { hasUnreadable, storedIds } from './stored-list.ts';

/**
 * Egzersiz, cihaz ve aparat uçlarının çekirdeği (SPEC §7.2, §7.3). Rota yalnız oturumu denetler
 * ve isteği buraya verir; GitHub'a `RepoFiles` ile erişilir, sonuç durum kodu ve gövde olarak
 * döner. Silme temizliği, kaydetme denetimleri ve kimlik kuralları böylece `npm test`'te sahte
 * repo'yla sınanır (`catalog-actions.test.ts`).
 *
 * Kurallar:
 * - Aynı kimlikte okunamayan (ham) kayıt varken o kimliğe yazılmaz (409): yazılsaydı dosya
 *   düzeltilince aynı kimlikte iki kayıt olurdu.
 * - Silinen PT kaydının kimliği bir daha verilmez (`data/retired-ids.json`, silmenin son adımı).
 *   Hazır kaydın PT sürümünü silmek ("Varsayılana dön") silme değildir: kimlik ayrılmaz.
 * - Silmede bağlar önce kalkar, her dosya taze okunur ve kendi `sha`'sıyla yazılır. Yarıda kalırsa
 *   ne yapıldığı söylenir; silmeyi yeniden denemek kalan adımları tamamlar.
 *
 * Saf; yol takma adıyla çalışma zamanı içe aktarması yok (testler Node'un test aracıyla çalışır).
 */

/** Ucun yanıtı: rota bunu olduğu gibi döner (`{ error, fields? }` ya da başarı verisi). */
export type Outcome = { status: number; body: Record<string, unknown> };

/** Uçların metinleri (yanıt, alan hatası, commit mesajı) isteği yapanın dilinde. */
const text = (locale: Locale) => ptLibraryMessages(locale).catalogActions;

const ok = (body: Record<string, unknown> = { ok: true }): Outcome => ({ status: 200, body });
const problem = (status: number, error: string): Outcome => ({ status, body: { error } });
const fieldProblem = (field: string, message: string, locale: Locale): Outcome => ({
  status: 400,
  body: { error: text(locale).checkInput, fields: { [field]: message } },
});
const brokenRecord = (path: string, locale: Locale): Outcome => problem(409, text(locale).brokenRecord(path));
const noIdFromName = (field: string, locale: Locale): Outcome => ({
  status: 400,
  body: { error: text(locale).noIdFromNameBody, fields: { [field]: text(locale).noIdFromNameField } },
});

/** Şema hataları alan alan (her alanın ilk hatası; mesajlar şemayı ayrıştıran isteğin dilinde). */
function invalidInput(issues: readonly v.BaseIssue<unknown>[], locale: Locale): Outcome {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path?.map((segment) => String(segment.key)).join('.');
    if (key && !fields[key]) fields[key] = issue.message;
  }
  return { status: 400, body: { error: text(locale).checkInput, fields } };
}

// GitHub katmanının hataları (`GithubError`, `toGithubError`) dile göre metin taşır; bu iki yardımcı onları `messageOf` ile
// okuyanın dilinde verir (bu dosyanın kendi hataları `LocalizedGithubError`).
/** Beklenmeyen hata: GitHub'ın nedeni ve durumu, yoksa 502. */
function failed(error: unknown, fallback: string, locale: Locale): Outcome {
  const failure = error instanceof GithubError ? error : null;
  return problem(failure?.status ?? 502, failure ? (messageOf(failure, locale) ?? failure.message) : fallback);
}

/** İş bir adımda durdu: ne yapıldığı ve GitHub'ın nedeni (409'da istemci bir kez yeniden dener). */
function stopped(error: unknown, message: string, locale: Locale): Outcome {
  const failure = error instanceof GithubError ? error : null;
  return problem(failure?.status ?? 502, failure ? `${message} ${messageOf(failure, locale) ?? failure.message}` : message);
}

/** Görsel artıkta kalmasın; silinemezse kayıt yine doğru, yalnız repo'da artık kalır. */
async function removeMedia(files: RepoFiles, path: string, message: string): Promise<void> {
  const sha = await files.getFileSha(path).catch(() => null);
  if (sha) await files.deleteFile(path, { sha, message }).catch(() => undefined);
}

function retireFailed(kind: CatalogKind, locale: Locale): string {
  const t = text(locale);
  return kind === 'exercises' ? t.retireFailedExercise : kind === 'devices' ? t.retireFailedDevice : t.retireFailedAttachment;
}

/** Silmenin son adımı: kimlik bir daha verilmesin. Durursa kayıt gitmiştir; silmeyi yeniden denemek bunu tamamlar. */
async function retire(files: RepoFiles, kind: CatalogKind, id: string, locale: Locale): Promise<Outcome> {
  try {
    await retireId(files, kind, id, text(locale).retired(id));
    return ok();
  } catch (error) {
    return stopped(error, retireFailed(kind, locale), locale);
  }
}

/**
 * Dosyada da hazır kütüphanede de olmayan kimliği silmek: önceki silme kaydı kaldırıp kimliği
 * listeye yazamadan durmuş olabilir; yeniden deneme o adımı tamamlar (zaten listedeyse yazmaz).
 * Kimlik biçimine uymayan yol listeye hiç yazılmaz.
 */
async function finishDeletion(
  files: RepoFiles,
  kind: CatalogKind,
  idSchema: v.GenericSchema<string>,
  id: string,
  notFound: string,
  locale: Locale,
): Promise<Outcome> {
  if (!v.is(idSchema, id)) return problem(404, notFound);
  return retire(files, kind, id, locale);
}

/** Cihaz: hazır katalogda ya da PT'nin (okunabilen) cihazlarında olmalı (yoksa `deviceMissing`). */

async function findDevice(files: RepoFiles, id: string): Promise<Device | undefined> {
  return withLibrary((await readCatalog(files, DEVICES)).items, DEVICES.library).find((item) => item.id === id);
}

// ── Egzersizler ────────────────────────────────────────────────────────────────

/** Kimliksiz gelen istek yeni egzersizdir: kimlik başlıktan üretilir. */
const exerciseSaveSchema = v.object({ ...exerciseSchema.entries, id: v.optional(exerciseSchema.entries.id) });

/**
 * Egzersiz kaydı: yeni ya da (kimlikle) güncelleme. Hazır bir egzersizi kaydetmek PT'nin sürümünü oluşturur.
 *
 * - Cihaz var olmalı (hazır ya da PT'nin); aparat o cihazın aparatlarından biri olmalı.
 * - Hazır egzersizin PT sürümü ilk kez yazılırken kütüphanedeki aparatı, PT'nin cihaz sürümünde
 *   yoksa düşer (PT aparatı cihazından çıkarmış olabilir). Gerekçe: PT'nin dosyasındaki her
 *   egzersizin aparatı cihazında durur; cihaz kaydı ve "Varsayılana dön" bunu korur, form da yalnız
 *   cihazdaki aparatları sunar. Denetim kütüphanedeki cihaza göre yapılsaydı dosyaya bu kurala
 *   uymayan bir kayıt girer, bir sonraki cihaz kaydında sessizce değişirdi. PT'nin kendi seçtiği
 *   (kütüphanedekinden farklı) aparat cihazda yoksa yine 400.
 */
export async function saveExercise(files: RepoFiles, raw: unknown, locale: Locale = DEFAULT_LOCALE): Promise<Outcome> {
  const t = text(locale);
  const parsed = v.safeParse(exerciseSaveSchema, raw, langConfig(locale));
  if (!parsed.success) return invalidInput(parsed.issues, locale);
  // Sabitlenen muadiller kendi ucundan yazılır; burada istemcinin gönderdiği yok sayılır.
  const { id: requestedId, primaryMuscles, secondaryMuscles, stabilizerMuscles, alternatives: _ignored, ...rest } = parsed.output;

  try {
    const file = await readCatalog(files, EXERCISES);
    if (requestedId && hasUnreadable(file, requestedId)) return brokenRecord(EXERCISES.path, locale);
    const index = requestedId ? file.items.findIndex((item) => item.id === requestedId) : -1;
    const library = requestedId ? EXERCISES.library.find((item) => item.id === requestedId) : undefined;
    // Kimlikle gelen istek var olan kaydı günceller: silinmiş kimlik (eski sekmeden) yeniden doğmaz.
    if (requestedId && index < 0 && !library) return problem(404, t.exerciseNotFound);

    let attachmentId = rest.attachmentId;
    if (rest.deviceId || attachmentId) {
      const device = rest.deviceId ? await findDevice(files, rest.deviceId) : undefined;
      if (rest.deviceId && !device) return fieldProblem('deviceId', t.deviceMissing, locale);
      const inherited = index < 0 && library !== undefined && attachmentId === library.attachmentId && rest.deviceId === library.deviceId;
      if (inherited && attachmentChoiceProblem({ deviceId: rest.deviceId, attachmentId }, device, locale)) attachmentId = undefined;
      const choice = attachmentChoiceProblem({ deviceId: rest.deviceId, attachmentId }, device, locale);
      if (choice) return fieldProblem('attachmentId', choice, locale);
    }

    // Bir kas yalnız bir seviyede: hedef > yardımcı > dengeleyici.
    const input = {
      ...rest,
      attachmentId,
      primaryMuscles,
      secondaryMuscles: secondaryMuscles.filter((muscle) => !primaryMuscles.includes(muscle)),
      stabilizerMuscles: stabilizerMuscles.filter((muscle) => !primaryMuscles.includes(muscle) && !secondaryMuscles.includes(muscle)),
    };

    if (requestedId) {
      const stored = file.items[index] ?? library;
      const entry = { ...input, id: requestedId, alternatives: stored?.alternatives };
      const next = index >= 0 ? file.items.map((item, i) => (i === index ? entry : item)) : [...file.items, entry];
      await writeCatalog(files, EXERCISES, next, t.exerciseUpdated(input.title), file);
      return ok({ id: requestedId });
    }

    // Dosyadaki (okunamayanlar dahil), hazır ve silinmiş kimlikler dolu.
    const { ids: retired } = await readRetiredIds(files);
    const taken = new Set([...storedIds(file), ...EXERCISES.library.map((item) => item.id), ...retired.exercises]);
    const id = newRecordId(input.title, taken, exerciseSchema.entries.id);
    if (!id) return noIdFromName('title', locale);
    await writeCatalog(files, EXERCISES, [...file.items, { ...input, id }], t.exerciseAdded(input.title), file);
    return ok({ id });
  } catch (error) {
    return failed(error, t.exerciseSaveFailed, locale);
  }
}

/**
 * PT'nin egzersizini siler; hazır bir egzersizin sürümüyse varsayılana döner. Hazır kütüphanedekiler
 * silinemez. Silinen egzersiz PT'nin diğer egzersizlerindeki sabitlemelerden düşer (aynı dosya, tek
 * yazma), sonra kimliği silinenler listesine girer. Varsayılana dönüşte kimlik hazır kütüphanede
 * yaşar: sabitlemeler kalır, kimlik ayrılmaz.
 */
export async function deleteExercise(files: RepoFiles, id: string, locale: Locale = DEFAULT_LOCALE): Promise<Outcome> {
  const t = text(locale);
  try {
    const file = await readCatalog(files, EXERCISES);
    if (hasUnreadable(file, id)) return brokenRecord(EXERCISES.path, locale);
    const target = file.items.find((item) => item.id === id);
    const inLibrary = EXERCISES.library.some((item) => item.id === id);
    if (!target) {
      if (inLibrary) return problem(404, t.exerciseBuiltIn);
      return finishDeletion(files, 'exercises', exerciseSchema.entries.id, id, t.exerciseNotFound, locale);
    }

    const rest = file.items.filter((item) => item.id !== id);
    const next = inLibrary ? rest : (dropPinnedAlternative(rest, id) ?? rest);
    await writeCatalog(files, EXERCISES, next, t.exerciseDeleted(target.title), file);
    return inLibrary ? ok() : retire(files, 'exercises', id, locale);
  } catch (error) {
    return failed(error, t.exerciseDeleteFailed, locale);
  }
}

const alternativesSchema = v.object({
  alternatives: v.pipe(
    v.array(v.pipe(v.string(), v.regex(/^[a-z0-9-]{2,60}$/))),
    v.maxLength(12, msg((l) => text(l).alternativesMax)),
  ),
});

/**
 * PT'nin sabitlediği muadilleri yazar (sıra korunur). Hazır bir egzersizde bu, düzenlemede olduğu
 * gibi PT'nin sürümünü oluşturur; kütüphanedeki aparat PT'nin cihaz sürümünde yoksa düşer (bkz. `saveExercise`).
 */
export async function pinAlternatives(files: RepoFiles, id: string, raw: unknown, locale: Locale = DEFAULT_LOCALE): Promise<Outcome> {
  const t = text(locale);
  const parsed = v.safeParse(alternativesSchema, raw, langConfig(locale));
  if (!parsed.success) return problem(400, parsed.issues[0].message);

  try {
    const file = await readCatalog(files, EXERCISES);
    if (hasUnreadable(file, id)) return brokenRecord(EXERCISES.path, locale);
    const own = file.items.find((item) => item.id === id);
    const entry = own ?? EXERCISES.library.find((item) => item.id === id);
    if (!entry) return problem(404, t.exerciseNotFound);

    const known = new Set([...file.items.map((item) => item.id), ...EXERCISES.library.map((item) => item.id)]);
    const alternatives = [...new Set(parsed.output.alternatives)].filter((other) => other !== id && known.has(other));
    let updated = { ...entry, alternatives: alternatives.length > 0 ? alternatives : undefined };
    if (!own && entry.attachmentId) {
      const device = entry.deviceId ? await findDevice(files, entry.deviceId) : undefined;
      if (attachmentChoiceProblem(entry, device, locale)) updated = { ...updated, attachmentId: undefined };
    }
    const next = own ? file.items.map((item) => (item.id === id ? updated : item)) : [...file.items, updated];
    await writeCatalog(files, EXERCISES, next, t.alternativesUpdated(entry.title), file);
    return ok({ alternatives });
  } catch (error) {
    return failed(error, t.alternativesFailed, locale);
  }
}

// ── Cihazlar ───────────────────────────────────────────────────────────────────

/**
 * Cihaz kaydı: yeni ya da (kimlikle) güncelleme. Hazır bir cihazı güncellemek PT'nin sürümünü
 * oluşturur. Türün kullanmadığı ayarlar kayda girmez (ör. dambıl setinde blok adımı); aparatlar
 * havuzda olmalı. Güncellemede cihazda artık olmayan aparat (çıkarıldı ya da tür aparat almıyor),
 * bu cihazı kullanan PT egzersizlerinden düşer.
 */
export async function saveDevice(files: RepoFiles, raw: unknown, locale: Locale = DEFAULT_LOCALE): Promise<Outcome> {
  const t = text(locale);
  const parsed = v.safeParse(deviceSaveSchema, raw, langConfig(locale));
  if (!parsed.success) return invalidInput(parsed.issues, locale);

  const { id: requestedId, ...input } = parsed.output;
  const kind = input.kind;
  const clean: Omit<Device, 'id' | 'attachments'> = {
    name: input.name,
    kind,
    ...(needsBase(kind) ? { baseKg: input.baseKg } : {}),
    ...(needsStep(kind) ? { stepKg: input.stepKg } : {}),
    ...(needsMax(kind) || kind === 'plate_loaded' ? { maxKg: input.maxKg } : {}),
    ...(takesAddOns(kind) && input.addOnsKg?.length ? { addOnsKg: [...new Set(input.addOnsKg)].sort((a, b) => a - b) } : {}),
    ...(kind === 'cable' ? { pulleyRatio: input.pulleyRatio ?? 1 } : {}),
    ...(needsWeights(kind) ? { weightsKg: [...new Set(input.weightsKg ?? [])].sort((a, b) => a - b) } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
  };
  // Havuzdaki aparat kimlikleri; aynısı iki kez girilmesin.
  const attachments = takesAttachments(kind) ? [...new Set(input.attachments ?? [])] : [];
  const withAttachments = attachments.length > 0 ? { attachments } : {};

  try {
    // Aparatlar havuzdan (hazır + PT'nin) seçilir: silinmiş ya da hiç olmamış kimlik yazılmaz.
    if (attachments.length > 0) {
      const pool = new Set(withLibrary((await readCatalog(files, ATTACHMENTS)).items, ATTACHMENTS.library).map((item) => item.id));
      const unknown = unknownAttachmentsProblem(attachments, pool, locale);
      if (unknown) return fieldProblem('attachments', unknown, locale);
    }

    const file = await readCatalog(files, DEVICES);
    if (requestedId) {
      if (hasUnreadable(file, requestedId)) return brokenRecord(DEVICES.path, locale);
      const index = file.items.findIndex((item) => item.id === requestedId);
      const stored = file.items[index] ?? DEVICES.library.find((item) => item.id === requestedId);
      if (!stored) return problem(404, t.deviceNotFound);
      // Görsel yalnız görsel ucundan yazılır; kayıtlı olan korunur.
      const entry: Device = { ...clean, ...withAttachments, id: requestedId, ...(stored.image ? { image: stored.image } : {}) };
      const next = index >= 0 ? file.items.map((item, i) => (i === index ? entry : item)) : [...file.items, entry];
      await writeCatalog(files, DEVICES, next, t.deviceUpdated(clean.name), file);
      try {
        await updateCatalog(
          files,
          EXERCISES,
          (items) => dropDetachedAttachments(items, requestedId, entry.attachments),
          t.detachedDropped(clean.name),
        );
      } catch (error) {
        return stopped(error, t.detachedDropFailed, locale);
      }
      return ok({ id: requestedId });
    }

    // Dosyadaki (okunamayanlar dahil), hazır ve silinmiş kimlikler dolu.
    const { ids: retired } = await readRetiredIds(files);
    const taken = new Set([...storedIds(file), ...DEVICES.library.map((item) => item.id), ...retired.devices]);
    const id = newRecordId(clean.name, taken, deviceIdSchema);
    if (!id) return noIdFromName('name', locale);
    await writeCatalog(files, DEVICES, [...file.items, { ...clean, ...withAttachments, id }], t.deviceAdded(clean.name), file);
    return ok({ id });
  } catch (error) {
    return failed(error, t.deviceSaveFailed, locale);
  }
}

/**
 * PT'nin cihazını siler; hazır bir cihazın PT sürümüyse varsayılana döner. Hazır katalogdakiler
 * silinemez. Silinen cihaza bağlı PT egzersizleri cihazsız kalır (kendi ağırlık adımlarıyla devam
 * eder), cihazdan seçtikleri aparat da düşer (SPEC §7.3). Varsayılana dönüşte cihaz hazır sürümüyle
 * kalır; yalnız hazır sürümde olmayan aparat egzersizlerden düşer. Cihazın görseli de silinir;
 * aparat fotoğrafları havuzda kalır.
 *
 * Bağlar önce kalkar; yarıda kalırsa cihaz yerinde durur ve silme yeniden denenebilir.
 */
export async function deleteDevice(files: RepoFiles, id: string, locale: Locale = DEFAULT_LOCALE): Promise<Outcome> {
  const t = text(locale);
  try {
    const file = await readCatalog(files, DEVICES);
    if (hasUnreadable(file, id)) return brokenRecord(DEVICES.path, locale);
    const target = file.items.find((item) => item.id === id);
    const library = DEVICES.library.find((item) => item.id === id);
    if (!target) {
      if (library) return problem(404, t.deviceBuiltIn);
      return finishDeletion(files, 'devices', deviceIdSchema, id, t.deviceNotFound, locale);
    }

    let unlinked = false;
    try {
      unlinked = await updateCatalog(
        files,
        EXERCISES,
        (items) => (library ? dropDetachedAttachments(items, id, library.attachments) : dropDeviceFromExercises(items, id)),
        library ? t.deviceResetDropped(target.name) : t.deviceUnlinked(target.name),
      );
    } catch (error) {
      return stopped(error, library ? t.deviceResetStopped : t.deviceDeleteStopped, locale);
    }

    try {
      await writeCatalog(files, DEVICES, file.items.filter((item) => item.id !== id), t.deviceDeleted(target.name), file);
    } catch (error) {
      if (!unlinked) throw error;
      return stopped(error, library ? t.deviceResetPartial : t.deviceDeletePartial, locale);
    }
    if (target.image) await removeMedia(files, target.image, t.deviceImageFileRemoved);
    return library ? ok() : retire(files, 'devices', id, locale);
  } catch (error) {
    return failed(error, t.deviceDeleteFailed, locale);
  }
}

// ── Aparatlar ──────────────────────────────────────────────────────────────────

/** Yeni aparat ya da (kimlikle) güncelleme. Hazır bir aparatı değiştirmek PT'nin sürümünü oluşturur. */
export async function saveAttachment(files: RepoFiles, raw: unknown, locale: Locale = DEFAULT_LOCALE): Promise<Outcome> {
  const t = text(locale);
  const parsed = v.safeParse(attachmentSaveSchema, raw, langConfig(locale));
  if (!parsed.success) return invalidInput(parsed.issues, locale);

  const { id: requestedId, name } = parsed.output;
  try {
    const file = await readCatalog(files, ATTACHMENTS);
    if (requestedId) {
      if (hasUnreadable(file, requestedId)) return brokenRecord(ATTACHMENTS.path, locale);
      const index = file.items.findIndex((item) => item.id === requestedId);
      const stored = file.items[index] ?? ATTACHMENTS.library.find((item) => item.id === requestedId);
      if (!stored) return problem(404, t.attachmentNotFound);
      // Fotoğraf yalnız görsel ucundan yazılır; kayıtlı olan korunur.
      const entry = { id: requestedId, name, ...(stored.image ? { image: stored.image } : {}) };
      const next = index >= 0 ? file.items.map((item, i) => (i === index ? entry : item)) : [...file.items, entry];
      await writeCatalog(files, ATTACHMENTS, next, t.attachmentUpdated(name), file);
      return ok({ id: requestedId });
    }

    // Dosyadaki (okunamayanlar dahil), hazır, silinmiş ve eski sabit kimlikler dolu.
    const { ids: retired } = await readRetiredIds(files);
    const taken = new Set([
      ...storedIds(file),
      ...ATTACHMENTS.library.map((item) => item.id),
      ...LEGACY_ATTACHMENT_IDS,
      ...retired.attachments,
    ]);
    const id = newRecordId(name, taken, attachmentIdSchema);
    if (!id) return noIdFromName('name', locale);
    await writeCatalog(files, ATTACHMENTS, [...file.items, { id, name }], t.attachmentAdded(name), file);
    return ok({ id });
  } catch (error) {
    return failed(error, t.attachmentSaveFailed, locale);
  }
}

/**
 * PT'nin aparatını siler; hazır bir aparatın PT sürümüyse varsayılana döner. Hazır havuzdakiler
 * silinemez. Silinen aparat seçili olduğu PT cihazlarından ve egzersizlerinden düşer (SPEC §7.3);
 * varsayılana dönüşte kimlik hazır havuzda yaşadığı için bağlar kalır. Aparatın fotoğrafı da silinir.
 *
 * Bağlar önce kalkar (cihazlar, sonra egzersizler); yarıda kalırsa aparat yerinde durur ve silme
 * yeniden denenebilir: bağı kalmış silinmiş aparat olmaz.
 */
export async function deleteAttachment(files: RepoFiles, id: string, locale: Locale = DEFAULT_LOCALE): Promise<Outcome> {
  const t = text(locale);
  try {
    const file = await readCatalog(files, ATTACHMENTS);
    if (hasUnreadable(file, id)) return brokenRecord(ATTACHMENTS.path, locale);
    const target = file.items.find((item) => item.id === id);
    const inLibrary = ATTACHMENTS.library.some((item) => item.id === id);
    if (!target) {
      if (inLibrary) return problem(404, t.attachmentBuiltIn);
      return finishDeletion(files, 'attachments', attachmentIdSchema, id, t.attachmentNotFound, locale);
    }

    let unlinked = false;
    if (!inLibrary) {
      try {
        unlinked = await updateCatalog(files, DEVICES, (items) => dropAttachmentFromDevices(items, id), t.attachmentUnlinkedDevices(target.name));
      } catch (error) {
        return stopped(error, t.attachmentDeleteStoppedDevices, locale);
      }
      try {
        const changed = await updateCatalog(
          files,
          EXERCISES,
          (items) => dropAttachmentFromExercises(items, id),
          t.attachmentUnlinkedExercises(target.name),
        );
        unlinked ||= changed;
      } catch (error) {
        return stopped(error, unlinked ? t.attachmentDeleteStoppedBoth : t.attachmentDeleteStoppedExercises, locale);
      }
    }

    try {
      await writeCatalog(files, ATTACHMENTS, file.items.filter((item) => item.id !== id), t.attachmentDeleted(target.name), file);
    } catch (error) {
      if (!unlinked) throw error;
      return stopped(error, t.attachmentDeletePartial, locale);
    }
    if (target.image) await removeMedia(files, target.image, t.attachmentPhotoFileRemoved);
    return inLibrary ? ok() : retire(files, 'attachments', id, locale);
  } catch (error) {
    return failed(error, t.attachmentDeleteFailed, locale);
  }
}

// ── Görseller (cihaz görseli, aparat fotoğrafı) ────────────────────────────────

type ImageRecord = { id: string; name: string; image?: string | undefined };

type ImageText = {
  folder: string;
  notFound: string;
  upload: string;
  updated: string;
  oldRemoved: string;
  removed: string;
  fileRemoved: string;
  uploadFailed: string;
  removeFailed: string;
};

function deviceImageText(locale: Locale): ImageText {
  const t = text(locale);
  return {
    folder: 'media/devices',
    notFound: t.deviceNotFound,
    upload: t.deviceImageUpload,
    updated: t.deviceImageUpdated,
    oldRemoved: t.deviceImageOldRemoved,
    removed: t.deviceImageRemoved,
    fileRemoved: t.deviceImageFileRemoved,
    uploadFailed: t.imageUploadFailed,
    removeFailed: t.imageRemoveFailed,
  };
}

function attachmentImageText(locale: Locale): ImageText {
  const t = text(locale);
  return {
    folder: 'media/attachments',
    notFound: t.attachmentNotFound,
    upload: t.attachmentPhotoUpload,
    updated: t.attachmentPhotoUpdated,
    oldRemoved: t.attachmentPhotoOldRemoved,
    removed: t.attachmentPhotoRemoved,
    fileRemoved: t.attachmentPhotoFileRemoved,
    uploadFailed: t.attachmentPhotoUploadFailed,
    removeFailed: t.attachmentPhotoRemoveFailed,
  };
}

/**
 * Görsel yükleme (türü ve içeriği rota denetler): dosya `<klasör>/<kimlik>-<özet>.<uzantı>` olarak
 * yazılır, kayıtta yalnız `image` değişir. Hazır bir kayda görsel eklemek PT'nin sürümünü oluşturur.
 */
async function saveImageOf<T extends ImageRecord>(
  files: RepoFiles,
  catalog: Catalog<T>,
  images: ImageText,
  id: string,
  bytes: Uint8Array,
  extension: string,
  locale: Locale,
): Promise<Outcome> {
  try {
    const file = await readCatalog(files, catalog);
    if (hasUnreadable(file, id)) return brokenRecord(catalog.path, locale);
    const own = file.items.find((item) => item.id === id);
    const entry = own ?? catalog.library.find((item) => item.id === id);
    if (!entry) return problem(404, images.notFound);

    const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 10);
    const path = `${images.folder}/${id}-${digest}.${extension}`;
    const existing = await files.getFileSha(path);
    await files.writeBinary(path, bytes, { sha: existing ?? undefined, message: `${images.upload}: ${entry.name}` });

    const updated = { ...entry, image: path };
    const next = own ? file.items.map((item) => (item.id === id ? updated : item)) : [...file.items, updated];
    await writeCatalog(files, catalog, next, `${images.updated}: ${entry.name}`, file);
    if (entry.image && entry.image !== path) await removeMedia(files, entry.image, images.oldRemoved);
    return ok({ image: path });
  } catch (error) {
    return failed(error, images.uploadFailed, locale);
  }
}

/** Görseli kaldırır: kayıttan düşer, dosya silinir. Hazır kayıtta ya da görsel yoksa yapılacak iş yok. */
async function removeImageOf<T extends ImageRecord>(
  files: RepoFiles,
  catalog: Catalog<T>,
  images: ImageText,
  id: string,
  locale: Locale,
): Promise<Outcome> {
  try {
    const file = await readCatalog(files, catalog);
    if (hasUnreadable(file, id)) return brokenRecord(catalog.path, locale);
    const entry = file.items.find((item) => item.id === id);
    if (!entry?.image) return ok();

    const image = entry.image;
    const next = file.items.map((item) => (item.id === id ? { ...item, image: undefined } : item));
    await writeCatalog(files, catalog, next, `${images.removed}: ${entry.name}`, file);
    await removeMedia(files, image, images.fileRemoved);
    return ok();
  } catch (error) {
    return failed(error, images.removeFailed, locale);
  }
}

export const saveDeviceImage = (files: RepoFiles, id: string, bytes: Uint8Array, extension: string, locale: Locale = DEFAULT_LOCALE) =>
  saveImageOf(files, DEVICES, deviceImageText(locale), id, bytes, extension, locale);
export const removeDeviceImage = (files: RepoFiles, id: string, locale: Locale = DEFAULT_LOCALE) =>
  removeImageOf(files, DEVICES, deviceImageText(locale), id, locale);
export const saveAttachmentImage = (files: RepoFiles, id: string, bytes: Uint8Array, extension: string, locale: Locale = DEFAULT_LOCALE) =>
  saveImageOf(files, ATTACHMENTS, attachmentImageText(locale), id, bytes, extension, locale);
export const removeAttachmentImage = (files: RepoFiles, id: string, locale: Locale = DEFAULT_LOCALE) =>
  removeImageOf(files, ATTACHMENTS, attachmentImageText(locale), id, locale);
