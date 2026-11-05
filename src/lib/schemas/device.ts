import * as v from 'valibot';
import { DEFAULT_LOCALE, type Locale } from '../../i18n/locale.ts';
import { ptLibraryMessages } from '../../i18n/messages/pt-library/index.ts';
import { msg } from '../../i18n/valibot.ts';
import { DEVICE_KINDS, PULLEY_RATIOS, type DeviceKind } from '../device-loads.ts';
import { IMAGE_MAX_BYTES, IMAGE_TYPES } from '../image.ts';
import { attachmentIdSchema, attachmentRefOf, ATTACHMENTS_MAX } from './attachment.ts';

/**
 * Cihaz şeması — sunucu ve istemci ortak.
 *
 * Hazır katalog pakette (`src/data/device-library.ts`), PT'nin eklediği ya da
 * değiştirdiği cihazlar uygulama repo'sunda (`data/devices.json`); aynı kimlikte PT'ninki
 * kazanır. Egzersiz `deviceId` ile bağlanır; ağırlık önerileri cihazın ağırlıklarından
 * seçilir (`src/lib/device-loads.ts`). Yol takma adıyla çalışma zamanı içe aktarması yok
 * (testler Node'un test aracıyla çalışır).
 */

/** Ağırlık bloğu ya da kablo: ilk blok, adım, en çok (+ ara ağırlıklar). */
const STACK_KINDS: readonly DeviceKind[] = ['selectorized', 'cable'];
/** Kızak/bar ağırlığı ve en küçük artış. */
const PLATE_KINDS: readonly DeviceKind[] = ['plate_loaded', 'barbell'];
/** Ağırlık listesi. */
const SET_KINDS: readonly DeviceKind[] = ['dumbbell', 'kettlebell'];

export const needsBase = (kind: DeviceKind) => STACK_KINDS.includes(kind) || PLATE_KINDS.includes(kind);
export const needsStep = needsBase;
export const needsMax = (kind: DeviceKind) => STACK_KINDS.includes(kind);
export const takesAddOns = (kind: DeviceKind) => STACK_KINDS.includes(kind);
export const needsWeights = (kind: DeviceKind) => SET_KINDS.includes(kind);

/** Cihaz görseli için görsel kuralları (aparat fotoğrafıyla ortak). */
export const DEVICE_IMAGE_TYPES = IMAGE_TYPES;
export const DEVICE_IMAGE_MAX_BYTES = IMAGE_MAX_BYTES;

/** Ara ağırlık seçenekleri (çoğu makinede takılan küçük ek ağırlıklar). */
export const ADD_ON_OPTIONS = [0.5, 1, 1.25, 1.75, 2, 2.5, 5] as const;

/** Doğrulama mesajları (`msg`: şemayı ayrıştıran isteğin diliyle). */
const text = (locale: Locale) => ptLibraryMessages(locale).deviceSchema;

const kg = (max: number) =>
  v.pipe(
    v.number(msg((l) => text(l).enterNumber)),
    v.minValue(0, msg((l) => text(l).nonNegative)),
    v.maxValue(max, msg((l) => text(l).kgMax(max))),
  );

const deviceFields = {
  name: v.pipe(v.string(), v.trim(), v.minLength(2, msg((l) => text(l).nameShort)), v.maxLength(60, msg((l) => text(l).nameMax))),
  kind: v.picklist(DEVICE_KINDS, msg((l) => text(l).pickKind)),
  baseKg: v.optional(kg(500)),
  stepKg: v.optional(
    v.pipe(
      v.number(msg((l) => text(l).enterNumber)),
      v.minValue(0.25, msg((l) => text(l).stepMin)),
      v.maxValue(50, msg((l) => text(l).stepMax)),
    ),
  ),
  maxKg: v.optional(kg(1000)),
  addOnsKg: v.optional(v.pipe(v.array(v.pipe(v.number(), v.minValue(0.25), v.maxValue(20))), v.maxLength(4, msg((l) => text(l).addOnsMax)))),
  pulleyRatio: v.optional(v.picklist(PULLEY_RATIOS, msg((l) => text(l).pickPulley))),
  /** Bu cihaza takılabilen aparatlar: havuzdaki kimlikler (`data/attachments.json`). */
  attachments: v.optional(
    v.pipe(v.array(attachmentIdSchema), v.maxLength(ATTACHMENTS_MAX, msg((l) => text(l).attachmentsMax(ATTACHMENTS_MAX)))),
  ),
  weightsKg: v.optional(v.pipe(v.array(kg(200)), v.maxLength(60, msg((l) => text(l).weightsMax)))),
  notes: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(300, msg((l) => text(l).notesMax)))),
  /** Görselin uygulama repo'sundaki yolu (`media/devices/<id>-<özet>.<uzantı>`). Yalnız görsel ucu yazar. */
  image: v.optional(v.pipe(v.string(), v.regex(/^media\/devices\/[a-z0-9-]+\.(png|jpg|webp)$/))),
};

type Fields = { kind: DeviceKind; baseKg?: number; stepKg?: number; maxKg?: number; weightsKg?: readonly number[] };

/** Türün gerektirdiği ağırlık ayarlarındaki ilk eksik (alan, mesaj); tamamsa `null`. */
export function missingLoadSetting(
  input: Fields,
  locale: Locale = DEFAULT_LOCALE,
): { field: 'baseKg' | 'stepKg' | 'maxKg' | 'weightsKg'; message: string } | null {
  if (needsBase(input.kind) && input.baseKg === undefined) return { field: 'baseKg', message: text(locale).baseKgRequired };
  if (needsStep(input.kind) && !((input.stepKg ?? 0) > 0)) return { field: 'stepKg', message: text(locale).stepKgRequired };
  if (needsMax(input.kind) && !(input.maxKg !== undefined && input.maxKg > (input.baseKg ?? 0))) {
    return { field: 'maxKg', message: text(locale).maxKgRequired };
  }
  if (needsWeights(input.kind) && !(input.weightsKg?.length ?? 0)) return { field: 'weightsKg', message: text(locale).weightsRequired };
  return null;
}

// Hata ilgili alanın altında görünsün diye her alan için ayrı kontrol.
const check = (field: 'baseKg' | 'stepKg' | 'maxKg' | 'weightsKg') => (input: Fields) => missingLoadSetting(input)?.field !== field;
const MESSAGES = {
  baseKg: msg((l) => text(l).baseKgRequired),
  stepKg: msg((l) => text(l).stepKgRequired),
  maxKg: msg((l) => text(l).maxKgRequired),
  weightsKg: msg((l) => text(l).weightsRequired),
} as const;

/** Cihaz kimliği (slug); yeni kayıtta addan üretilir (`src/lib/slug.ts`). */
export const deviceIdSchema = v.pipe(v.string(), v.regex(/^[a-z0-9-]{2,60}$/, msg((l) => text(l).idChars)));

export const deviceSchema = v.pipe(
  v.object({
    id: deviceIdSchema,
    ...deviceFields,
  }),
  v.forward(v.partialCheck([['kind'], ['baseKg']], check('baseKg'), MESSAGES.baseKg), ['baseKg']),
  v.forward(v.partialCheck([['kind'], ['baseKg'], ['stepKg']], check('stepKg'), MESSAGES.stepKg), ['stepKg']),
  v.forward(v.partialCheck([['kind'], ['baseKg'], ['stepKg'], ['maxKg']], check('maxKg'), MESSAGES.maxKg), ['maxKg']),
  v.forward(v.partialCheck([['kind'], ['baseKg'], ['stepKg'], ['maxKg'], ['weightsKg']], check('weightsKg'), MESSAGES.weightsKg), ['weightsKg']),
);
export type Device = v.InferOutput<typeof deviceSchema>;

/** Formun şeması: kimlik yok (yeni kayıtta addan üretilir). */
export const deviceFormSchema = v.pipe(
  v.object(deviceFields),
  v.forward(v.partialCheck([['kind'], ['baseKg']], check('baseKg'), MESSAGES.baseKg), ['baseKg']),
  v.forward(v.partialCheck([['kind'], ['baseKg'], ['stepKg']], check('stepKg'), MESSAGES.stepKg), ['stepKg']),
  v.forward(v.partialCheck([['kind'], ['baseKg'], ['stepKg'], ['maxKg']], check('maxKg'), MESSAGES.maxKg), ['maxKg']),
  v.forward(v.partialCheck([['kind'], ['baseKg'], ['stepKg'], ['maxKg'], ['weightsKg']], check('weightsKg'), MESSAGES.weightsKg), ['weightsKg']),
);
export type DeviceInput = v.InferOutput<typeof deviceFormSchema>;

/** Kayıt ucu: kimliksiz gelen istek yeni cihazdır (kimlik addan üretilir). */
export const deviceSaveSchema = v.pipe(
  v.object({
    id: v.optional(v.pipe(v.string(), v.regex(/^[a-z0-9-]{2,60}$/))),
    ...deviceFields,
  }),
  v.forward(v.partialCheck([['kind'], ['baseKg']], check('baseKg'), MESSAGES.baseKg), ['baseKg']),
  v.forward(v.partialCheck([['kind'], ['baseKg'], ['stepKg']], check('stepKg'), MESSAGES.stepKg), ['stepKg']),
  v.forward(v.partialCheck([['kind'], ['baseKg'], ['stepKg'], ['maxKg']], check('maxKg'), MESSAGES.maxKg), ['maxKg']),
  v.forward(v.partialCheck([['kind'], ['baseKg'], ['stepKg'], ['maxKg'], ['weightsKg']], check('weightsKg'), MESSAGES.weightsKg), ['weightsKg']),
);

/** Eski kayıtlarda aparat cihazın içinde ad ya da kayıttı; havuz kimliğine çevrilir. */
function migrateStoredDevice(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const item = input as Record<string, unknown>;
  return Array.isArray(item.attachments)
    ? { ...item, attachments: [...new Set(item.attachments.map(attachmentRefOf).filter(Boolean))] }
    : item;
}

export const customDevicesSchema = v.array(v.pipe(v.unknown(), v.transform(migrateStoredDevice), deviceSchema));
