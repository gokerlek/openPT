import * as v from 'valibot';
import { type Locale } from '../../i18n/locale.ts';
import { ptProgramMessages } from '../../i18n/messages/pt-program/index.ts';
import { msg } from '../../i18n/valibot.ts';
import { weekdayConflicts } from '../day-assignments.ts';
import {
  DAY_ID_PATTERN,
  OWN_PROGRAM_ID_PATTERN,
  OWN_PROGRAM_NAME_MAX,
  PROGRAM_LIMITS as L,
  duplicateNames,
  duplicateProgramIds,
  upgradeProgram,
  upgradeProgramBody,
} from '../program-plan.ts';
import {
  DAY_CONFLICT,
  dayBlocksSchema,
  dayIdSchema,
  daySourceSchema,
  phaseIdSchema,
  programLogEntrySchema,
  weekdaysSchema,
} from './program.ts';

/**
 * Danışanın kendi programı — şemalar (`docs/design/kendi-program.md` §5.2, §5.3, §6). Sunucu ve telefon ortak.
 *
 * Dosya `own-programs/<id>.json`: `program.json` ile aynı gövde (sürüm 2, tek gizli evre), üstüne kimlik,
 * ad, paylaşım ve günün kopyalandığı PT günü (`copiedFrom`). Evre yok (`phased: false`, tek evre, süresiz);
 * `clientSchedule` ve `clientTargets` yazılmaz, gelirse atılır (`v.object`). Programlar 1–7, hafta günlerine atanır
 * (Faz 3; atamayı danışan yapar, yazar o).
 *
 * Index (`own-programs-index.json`) türetilmiş veridir: satır satır hoşgörüyle okunur (`own-program-index.ts`),
 * burada yalnız satırın, seçimin ve olayın şeması. Node'un test aracı doğrudan çalıştırdığı için içe aktarmalar
 * göreli ve `.ts` uzantılıdır.
 */

/** Doğrulama mesajları (`msg`: şemayı ayrıştıran isteğin diliyle). */
const text = (locale: Locale) => ptProgramMessages(locale).ownProgramSchema;

const timestamp = v.pipe(v.string(), v.isoTimestamp());
const positive = v.pipe(v.number(), v.integer(), v.minValue(1));

export const ownProgramIdSchema = v.pipe(v.string(), v.regex(OWN_PROGRAM_ID_PATTERN, msg((l) => text(l).idInvalid)));

/** Ad: kırpılır, 1–40 karakter. Benzersizlik ve ayrılmış ad çağıranda (`ownNameProblem`). */
export const ownProgramNameSchema = v.pipe(
  v.string(msg((l) => text(l).nameRequired)),
  v.trim(),
  v.minLength(1, msg((l) => text(l).nameRequired)),
  v.maxLength(OWN_PROGRAM_NAME_MAX, msg((l) => text(l).nameMax(OWN_PROGRAM_NAME_MAX))),
);

/** Günün kopyalandığı PT günü: o anki adıyla; PT günü sonra değişse de kopya değişmez. */
export const dayCopySchema = v.object({
  dayId: v.pipe(v.string(), v.regex(DAY_ID_PATTERN)),
  dayName: v.pipe(v.string(), v.maxLength(L.dayName)),
  at: timestamp,
});

export const ownProgramDaySchema = v.object({
  id: dayIdSchema,
  name: v.pipe(v.string(msg((l) => text(l).dayNameRequired)), v.trim(), v.minLength(1, msg((l) => text(l).dayNameRequired)), v.maxLength(L.dayName, msg((l) => text(l).dayNameMax(L.dayName)))),
  /** Programın atandığı hafta günleri (PT programındaki gibi); yoksa atanmamış. */
  weekdays: v.optional(weekdaysSchema),
  blocks: dayBlocksSchema,
  source: v.optional(daySourceSchema),
  copiedFrom: v.optional(dayCopySchema),
});

/**
 * Tek, gizli, süresiz evre: 1–7 program, adları benzersiz, bir hafta günü en çok bir programa; sıklık yalnız hiç
 * atama yokken anlamlı.
 */
export const ownProgramPhaseSchema = v.object({
  id: phaseIdSchema,
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(L.phaseName)),
  daysPerWeek: v.optional(
    v.pipe(v.number(msg((l) => text(l).enterNumber)), v.integer(msg((l) => text(l).enterInteger)), v.minValue(1, msg((l) => text(l).daysPerWeekMin)), v.maxValue(L.daysPerWeek, msg((l) => text(l).daysPerWeekMax(L.daysPerWeek)))),
  ),
  days: v.pipe(
    v.array(ownProgramDaySchema),
    v.minLength(1, msg((l) => text(l).daysMin)),
    v.maxLength(L.daysPerPhase, msg((l) => text(l).daysMax(L.daysPerPhase))),
    v.check((days) => duplicateNames(days).length === 0, msg((l) => text(l).dayNames)),
    v.check((days) => weekdayConflicts(days).length === 0, DAY_CONFLICT),
  ),
});

export const ownProgramPhasesSchema = v.pipe(
  v.array(ownProgramPhaseSchema),
  v.length(1, msg((l) => text(l).noPhases)),
  v.check((phases) => duplicateProgramIds(phases).length === 0, msg((l) => text(l).idsUnique)),
);

const CURRENT_MISSING = msg((l) => text(l).currentMissing);
const currentExists = (input: { currentPhaseId: string; phases: readonly { id: string }[] }) =>
  input.phases.some((phase) => phase.id === input.currentPhaseId);

/** Repo'daki dosya: sürüm 1 önce çevrilir; bilinmeyen alanlar (`clientTargets`, `clientSchedule`) atılır. */
export const ownProgramSchema = v.pipe(
  v.unknown(),
  v.transform(upgradeProgram),
  v.object({
    version: v.literal(2),
    id: ownProgramIdSchema,
    name: ownProgramNameSchema,
    phased: v.literal(false),
    /** İçerik yazımında +1 (düzenleyici ya da bitişte satır); rotasyon, günler, paylaşım artırmaz. */
    revision: positive,
    createdAt: timestamp,
    updatedAt: timestamp,
    /** Antrenörle paylaşıldıysa an; yoksa paylaşılmamış. PT'nin yazma izninin tek kaynağı. */
    shared: v.optional(v.object({ at: timestamp })),
    phases: ownProgramPhasesSchema,
    current: v.object({ phaseId: phaseIdSchema, startedAt: timestamp }),
    rotation: v.object({ lastDayId: v.optional(dayIdSchema), lastCompletedAt: v.optional(timestamp) }),
    /**
     * Antrenman günleri: programların atamalarının birleşimi (katman yok). Gün başına ataması olmayan eski dosyada
     * okunurken atamalar buradan türetilir.
     */
    schedule: v.optional(v.object({ weekdays: weekdaysSchema, at: v.optional(timestamp) })),
    log: v.pipe(v.array(programLogEntrySchema), v.maxLength(L.log)),
  }),
  v.check((program) => program.phases.some((phase) => phase.id === program.current.phaseId), CURRENT_MISSING),
);
export type OwnProgramFile = v.InferOutput<typeof ownProgramSchema>;

const bodyFields = {
  currentPhaseId: phaseIdSchema,
  phases: ownProgramPhasesSchema,
  /**
   * Eski sekme ve taslak (gün başına atama yok): programlar buradan türetilir (`upgradeProgramBody`; oluştururken
   * açılıştakiyle aynı olsa da, `bodyWithAssignments`). Kayıtta hiç gönderilmezse ya da açılıştakiyle
   * (`baseWeekdays`) aynıysa kayıttaki atamalar korunur (`keepStoredAssignments`).
   */
  weekdays: v.optional(weekdaysSchema),
};

/** Düzenleyicinin şeması (Formisch): ad, tek evre, şu anki evre, günler. Kip `own-pt`'de ad salt okunur. */
export const ownProgramFormSchema = v.pipe(
  v.object({ name: ownProgramNameSchema, ...bodyFields }),
  v.forward(v.partialCheck([['currentPhaseId'], ['phases']], currentExists, CURRENT_MISSING), ['currentPhaseId']),
);
export type OwnProgramFormInput = v.InferInput<typeof ownProgramFormSchema>;
export type OwnProgramFormValues = v.InferOutput<typeof ownProgramFormSchema>;

/**
 * Kayıt uçları (danışan `PUT /api/me/programs/[pid]`, PT `PUT /api/clients/[id]/programs/[pid]`). `baseRevision`
 * null = oluşturma (yalnız danışan); `baseWeekdays` eski düzenleyicinin açılıştaki günleri: gün başına alan yokken
 * gönderilen günler onunla aynıysa kayıttaki atamalara dokunulmaz (§3.6). Ad PT'nin kaydında yok sayılır.
 */
export const ownProgramSaveSchema = v.pipe(
  v.unknown(),
  v.transform(upgradeProgramBody),
  v.object({
    ...bodyFields,
    name: v.optional(ownProgramNameSchema),
    baseWeekdays: v.optional(weekdaysSchema),
    baseRevision: v.nullable(positive),
    baseCreatedAt: v.optional(timestamp),
  }),
  v.forward(v.partialCheck([['currentPhaseId'], ['phases']], currentExists, CURRENT_MISSING), ['currentPhaseId']),
);
export type OwnProgramSaveBody = v.InferOutput<typeof ownProgramSaveSchema>;

/** Paylaşım: `{ shared }`; revision artmaz. */
export const ownProgramShareSchema = v.object({ shared: v.boolean() });

/** Bugün'ün programı (kalıcı seçim): kendi programın kimliği ya da null (PT'nin programı). */
export const ownProgramActiveSchema = v.object({ programId: v.nullable(ownProgramIdSchema) });

/* --- own-programs-index.json --- */

export const ownIndexItemSchema = v.object({
  id: ownProgramIdSchema,
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(OWN_PROGRAM_NAME_MAX)),
  /** Dosyanın blob `sha`'sı: onarım bununla karşılaştırır (her program yazımı index'i de yazar). */
  sha: v.pipe(v.string(), v.regex(/^[0-9a-f]{40}$/)),
  days: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(L.daysPerPhase)),
  daysPerWeek: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(L.daysPerWeek))),
  weekdays: weekdaysSchema,
  /** Günlerin son değiştiği an: kaçan gün penceresi (`attention.ts`, Bugün'ün şeridi). */
  weekdaysAt: v.optional(timestamp),
  revision: positive,
  createdAt: timestamp,
  updatedAt: timestamp,
  /** Gösterim; karar dosyadan (§3.5). */
  shared: v.optional(v.object({ at: timestamp })),
  /** Paylaşılmışken son düzenlemeler (bildirimler, §7). */
  ptEditedAt: v.optional(timestamp),
  clientEditedAt: v.optional(timestamp),
});

export const ownIndexActiveSchema = v.object({ programId: v.nullable(ownProgramIdSchema), at: timestamp });

export const OWN_EVENT_KINDS = ['unshared', 'deleted'] as const;
export const ownIndexEventSchema = v.object({
  kind: v.picklist(OWN_EVENT_KINDS),
  id: ownProgramIdSchema,
  name: v.pipe(v.string(), v.maxLength(OWN_PROGRAM_NAME_MAX)),
  at: timestamp,
});
