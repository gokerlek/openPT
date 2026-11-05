import 'server-only';
import { DEFAULT_LOCALE, type Locale } from '../i18n/locale.ts';
import { ptProgramMessages } from '../i18n/messages/pt-program/index.ts';
import type { DeviceWithSource } from './devices';
import type { ExerciseWithSource } from './exercises';
import { appRepo, GithubError } from './github/client';
import { deleteFile, getFileSha, listDir, readJson, writeJson } from './github/files';
import { LocalizedGithubError } from './localized-github-error';
import type { TemplateOption } from './program-plan';
import { TEMPLATE_ID_PATTERN, type Template } from './schemas/template';
import type { EditorDevice, PickerExercise } from './template-edit';
import { createTemplateCache, renderTemplate, resolveTemplates, type RawTemplate, type TemplateFile } from './template-files';

/**
 * Antrenman şablonları: her biri uygulama repo'sunda ayrı dosya (`data/templates/<id>.json`,
 * SPEC §3). Ayrı dosya: iki şablona aynı anda yazmak çakışmaz, geçmiş şablon başına okunur.
 *
 * Liste, dosyaların içerik özetine (blob sha) göre bellekte tutulur (`template-files.ts`): sha içeriğin
 * kendisinden çıktığı için önbellek hiç eskimez — dosya değişince sha da değişir. Okunamayan dosya yapı olarak
 * tutulur, sorunu her istekte okuyanın dilinde üretilir. Tek dosya okuması her zaman tazedir (düzenleme ve kayıt
 * sha'yı buradan alır).
 */

export const TEMPLATES_DIR = 'data/templates';
const FILE_PATTERN = /^t_[a-z0-9]{8}\.json$/;

/** Dosya yolu; kimlik kalıba uymuyorsa (ör. `../clients`) istek hiç çıkmaz. */
export function templatePath(id: string): string {
  if (!TEMPLATE_ID_PATTERN.test(id)) throw new LocalizedGithubError((l) => ptProgramMessages(l).templatesLib.invalidId(id), 400);
  return `${TEMPLATES_DIR}/${id}.json`;
}

export type { TemplateFile };

/** Depodan ham okuma (dil yok). `null`: yok ya da kimlik geçersiz; bozuk JSON `unreadable` olarak döner. */
async function loadTemplateRaw(id: string): Promise<RawTemplate | null> {
  if (!TEMPLATE_ID_PATTERN.test(id)) return null;
  const path = templatePath(id);
  let stored: Awaited<ReturnType<typeof readJson<unknown>>>;
  try {
    stored = await readJson<unknown>(appRepo(), path);
  } catch (error) {
    // Bozuk JSON: silinebilsin ya da üzerine yazılabilsin diye sha ayrıca alınır.
    if (error instanceof GithubError && error.status === 500) {
      const sha = await getFileSha(appRepo(), path);
      return sha ? { id, sha, unreadable: true } : null;
    }
    throw error;
  }
  return stored ? { id, sha: stored.sha, content: stored.content } : null;
}

/** Taze okuma. `null`: yok ya da kimlik geçersiz. Bozuk dosya hata değil, sorunuyla döner (sorun okuyanın dilinde). */
export async function readTemplateFile(id: string, locale: Locale = DEFAULT_LOCALE): Promise<TemplateFile | null> {
  const raw = await loadTemplateRaw(id);
  return raw ? renderTemplate(raw, locale) : null;
}

const cache = createTemplateCache();

/**
 * Bütün şablonlar: geçerliler ada göre, okunamayanlar sonda; okunamayanın sorunu okuyanın dilinde, dosya önbellekte
 * yapı olarak durur (bkz. `template-files.ts`). Klasör okunamazsa hata fırlar.
 */
export async function listTemplates(locale: Locale = DEFAULT_LOCALE): Promise<TemplateFile[]> {
  const entries = (await listDir(appRepo(), TEMPLATES_DIR)).filter((entry) => entry.type === 'file' && FILE_PATTERN.test(entry.name));
  return resolveTemplates(entries, cache, loadTemplateRaw, locale);
}

/** Seçiciler için geçerli şablonların kimliği ve adı (ör. danışanın başlangıç şablonu). */
export async function templateChoices(): Promise<{ id: string; name: string }[]> {
  return (await listTemplates()).flatMap((file) => (file.template ? [{ id: file.template.id, name: file.template.name }] : []));
}

/**
 * Danışanlara açık şablonlar (`docs/design/kendi-program.md` §3.8): kendi programın "Hazır şablondan" başlangıcı ve
 * gün ekleme. Yalnız bayraklı (`sharedWithClients`) ve okunabilen şablonlar; açıklama gönderilmez.
 */
export async function clientTemplates(): Promise<TemplateOption[]> {
  return (await listTemplates()).flatMap((file) =>
    file.template?.sharedWithClients ? [{ id: file.template.id, name: file.template.name, blocks: file.template.blocks }] : [],
  );
}

/**
 * Danışanın kimlikle okuması (`?sablon=t_…`): şablon kimlikleri tahmin edilebilir, bu yüzden işaretsiz şablon
 * yokmuş gibi null döner (liste süzgeci yetmez, §3.8).
 */
export async function clientTemplate(id: string): Promise<TemplateOption | null> {
  const file = await readTemplateFile(id);
  const template = file?.template;
  return template && template.sharedWithClients === true ? { id: template.id, name: template.name, blocks: template.blocks } : null;
}

export async function writeTemplate(template: Template, options: { sha?: string; message: string }): Promise<{ sha: string }> {
  return writeJson(appRepo(), templatePath(template.id), template, { sha: options.sha, message: options.message });
}

export async function deleteTemplateFile(id: string, sha: string, message: string): Promise<void> {
  await deleteFile(appRepo(), templatePath(id), { sha, message });
}

/**
 * Düzenleyicinin kütüphane paneli için egzersizler: yalnız gereken alanlar (ipucu,
 * açıklama, video ve medikal etiketler yok) — sayfa yükü küçük kalsın.
 */
export function pickerExercises(list: readonly ExerciseWithSource[]): PickerExercise[] {
  return list.map((exercise) => ({
    id: exercise.id,
    title: exercise.title,
    category: exercise.category,
    trackingType: exercise.trackingType,
    equipment: exercise.equipment,
    ...(exercise.deviceId ? { deviceId: exercise.deviceId } : {}),
    ...(exercise.pattern ? { pattern: exercise.pattern } : {}),
    ...(exercise.locomotion ? { locomotion: true } : {}),
    ...(exercise.grip ? { grip: exercise.grip } : {}),
    ...(exercise.alternatives?.length ? { alternatives: exercise.alternatives } : {}),
    ...(exercise.progression ? { progression: exercise.progression } : {}),
    loadStepKg: exercise.loadStepKg,
    minLoadKg: exercise.minLoadKg,
    primaryMuscles: exercise.primaryMuscles,
    secondaryMuscles: exercise.secondaryMuscles,
    stabilizerMuscles: exercise.stabilizerMuscles,
    source: exercise.source,
  }));
}

/** Düzenleyicinin cihazları: ad, tür ve ağırlık ayarı (görsel, not ve aparatlar yok). */
export function pickerDevices(list: readonly DeviceWithSource[]): EditorDevice[] {
  return list.map((device) => ({
    id: device.id,
    name: device.name,
    kind: device.kind,
    ...(device.baseKg !== undefined ? { baseKg: device.baseKg } : {}),
    ...(device.stepKg !== undefined ? { stepKg: device.stepKg } : {}),
    ...(device.maxKg !== undefined ? { maxKg: device.maxKg } : {}),
    ...(device.addOnsKg?.length ? { addOnsKg: device.addOnsKg } : {}),
    ...(device.pulleyRatio !== undefined ? { pulleyRatio: device.pulleyRatio } : {}),
    ...(device.weightsKg?.length ? { weightsKg: device.weightsKg } : {}),
  }));
}
