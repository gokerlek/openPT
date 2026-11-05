import * as v from 'valibot';
import { type Locale } from '../../i18n/locale.ts';
import { ptProgramMessages } from '../../i18n/messages/pt-program/index.ts';
import { msg } from '../../i18n/valibot.ts';
import { weekdayConflicts } from '../day-assignments.ts';
import {
  DAY_ID_PATTERN,
  LOG_KINDS,
  PHASE_ID_PATTERN,
  PROGRAM_LIMITS as L,
  countDays,
  duplicateNames,
  duplicateProgramIds,
  upgradeProgram,
  upgradeProgramBody,
} from '../program-plan.ts';
import { ROW_ID_PATTERN, TEMPLATE_ID_PATTERN, TEMPLATE_LIMITS, countRows } from '../template-plan.ts';
import { SESSION_ID_PATTERN } from './session.ts';
import { rowSetsSchema, templateBlockSchema } from './template.ts';

/**
 * Danışana özel program şeması — sunucu ve istemci ortak (SPEC §4, §7.4).
 *
 * Program danışanın kendi repo'sunda `program.json`'dur: evreler → günler (programlar: "Alt vücut"…) → bloklar.
 * Evreler isteğe bağlıdır: `phased: false` programda tek, süresiz, gizli bir evre olur. Faz 3: her program
 * evresinde hafta günlerine atanır (`weekdays`); bir hafta günü evrede en çok bir programa.
 * Günün blokları şablonla aynı yapıdadır (`templateBlockSchema`). Yapı kuralları ve
 * sabitler `src/lib/program-plan.ts`'te. Node'un test aracı doğrudan çalıştırdığı için
 * çalışma zamanı içe aktarmaları göreli ve `.ts` uzantılıdır.
 *
 * Sürüm 1 dosyalar (ve eski sekmeden gelen kayıtlar) okunurken sürüm 2'ye çevrilir
 * (`upgradeProgram`): `phased` evrelerden çıkarılır, satırlar set başına hedefe geçer. Gün başına
 * ataması olmayan eski dosya ve eski gövde de okunurken `schedule.weekdays`'ten (gövdede `weekdays`)
 * atanır. Düzenleyicinin şeması yalnız yeni biçimi kabul eder.
 */

/** Doğrulama mesajları (`msg`: şemayı ayrıştıran isteğin diliyle). */
const text = (locale: Locale) => ptProgramMessages(locale).programSchema;

const timestamp = v.pipe(v.string(), v.isoTimestamp());
const int = (min: number, max: number, unit?: 'weeks' | 'days') =>
  v.pipe(
    v.number(msg((l) => text(l).enterNumber)),
    v.integer(msg((l) => text(l).enterInteger)),
    v.minValue(min, msg((l) => text(l).atLeastUnit(min, unit ? text(l).units[unit](min) : ''))),
    v.maxValue(max, msg((l) => text(l).atMostUnit(max, unit ? text(l).units[unit](max) : ''))),
  );
const positive = v.pipe(v.number(), v.integer(), v.minValue(1));

export const phaseIdSchema = v.pipe(v.string(), v.regex(PHASE_ID_PATTERN, msg((l) => text(l).phaseIdInvalid)));
export const dayIdSchema = v.pipe(v.string(), v.regex(DAY_ID_PATTERN, msg((l) => text(l).dayIdInvalid)));

/** Günün blokları: şablonla aynı yapı; boş gün kaydedilmez. */
export const dayBlocksSchema = v.pipe(
  v.array(templateBlockSchema),
  v.minLength(1, msg((l) => text(l).dayBlocksMin)),
  v.maxLength(TEMPLATE_LIMITS.blocks, msg((l) => text(l).dayBlocksMax(TEMPLATE_LIMITS.blocks))),
  v.check((blocks) => countRows(blocks) <= TEMPLATE_LIMITS.rows, msg((l) => text(l).dayRowsMax(TEMPLATE_LIMITS.rows))),
);

/** Günün geldiği şablon: o anki adıyla; şablon sonra değişse ya da silinse de program değişmez. */
export const daySourceSchema = v.object({
  templateId: v.pipe(v.string(), v.regex(TEMPLATE_ID_PATTERN)),
  templateName: v.pipe(v.string(), v.maxLength(TEMPLATE_LIMITS.name)),
  at: timestamp,
});

/**
 * Hafta günleri: ISO, 1 = Pazartesi … 7 = Pazar; her gün bir kez. Programlar günlere atanır (Faz 3);
 * `schedule.weekdays` şu anki evrenin atamalarının birleşimi.
 */
export const weekdaysSchema = v.pipe(
  v.array(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(7)), msg((l) => text(l).pickWeekdays)),
  v.maxLength(7),
  v.check((days) => new Set(days).size === days.length, msg((l) => text(l).weekdayTwice)),
);
/**
 * Danışanın eski gün katmanı (`clientSchedule`): en az bir gün. Faz 3'te danışan günleri değiştirmez (Karar 3);
 * şema yalnız eski dosyalar okunabilsin diye kalır.
 */
export const clientWeekdaysSchema = v.pipe(weekdaysSchema, v.minLength(1, msg((l) => text(l).weekdaysMin)));

/** Evrede bir hafta günü en çok bir programa: Bugün o günün tek programını gösterir. */
export const DAY_CONFLICT = msg((l) => text(l).dayConflict);

export const programDaySchema = v.object({
  id: dayIdSchema,
  name: v.pipe(v.string(msg((l) => text(l).dayNameRequired)), v.trim(), v.minLength(1, msg((l) => text(l).dayNameRequired)), v.maxLength(L.dayName, msg((l) => text(l).dayNameMax(L.dayName)))),
  /** Programın atandığı hafta günleri (Faz 3; ISO, 1 = Pazartesi); yoksa atanmamış. Evrede bir gün en çok bir programa. */
  weekdays: v.optional(weekdaysSchema),
  blocks: dayBlocksSchema,
  source: v.optional(daySourceSchema),
});

export const programPhaseSchema = v.object({
  id: phaseIdSchema,
  name: v.pipe(
    v.string(msg((l) => text(l).phaseNameRequired)),
    v.trim(),
    v.minLength(1, msg((l) => text(l).phaseNameRequired)),
    v.maxLength(L.phaseName, msg((l) => text(l).phaseNameMax(L.phaseName))),
  ),
  /** Süre (hafta); yoksa süresiz evre, geçiş önerilmez. */
  weeks: v.optional(int(1, L.weeks, 'weeks')),
  /** Haftada kaç gün; evresiz programda programın sıklığı. */
  daysPerWeek: v.optional(int(1, L.daysPerWeek, 'days')),
  days: v.pipe(
    v.array(programDaySchema),
    v.minLength(1, msg((l) => text(l).phaseDaysMin)),
    v.maxLength(L.daysPerPhase, msg((l) => text(l).phaseDaysMax(L.daysPerPhase))),
    v.check((days) => duplicateNames(days).length === 0, msg((l) => text(l).phaseDayNames)),
    v.check((days) => weekdayConflicts(days).length === 0, DAY_CONFLICT),
  ),
});

export const programPhasesSchema = v.pipe(
  v.array(programPhaseSchema),
  v.minLength(1, msg((l) => text(l).phasesMin)),
  v.maxLength(L.phases, msg((l) => text(l).phasesMax(L.phases))),
  v.check((phases) => countDays(phases) <= L.days, msg((l) => text(l).daysMax(L.days))),
  v.check((phases) => duplicateNames(phases).length === 0, msg((l) => text(l).phaseNames)),
  v.check((phases) => duplicateProgramIds(phases).length === 0, msg((l) => text(l).idsUnique)),
);

const bodyFields = {
  phased: v.boolean(msg((l) => text(l).phasedUnreadable)),
  currentPhaseId: phaseIdSchema,
  phases: programPhasesSchema,
  /** Eski sekme ve taslak: gün başına atama yoksa günler buradan türetilir (`upgradeProgramBody`). */
  weekdays: v.optional(weekdaysSchema),
};
const CURRENT_MISSING = msg((l) => text(l).currentMissing);
const UNPHASED_PROBLEM = msg((l) => text(l).unphasedOnly);

const currentExists = (input: { currentPhaseId: string; phases: readonly { id: string }[] }) =>
  input.phases.some((phase) => phase.id === input.currentPhaseId);
/** Evresiz programda tek evre olur ve süresi yoktur. */
const unphasedOk = (input: { phased: boolean; phases: readonly { weeks?: number }[] }) =>
  input.phased || (input.phases.length === 1 && input.phases[0]?.weeks === undefined);

/** Düzenleyicinin şeması: evrelere bölündü mü, evreler, şu anki evre (geçmiş, rotasyon, revision sunucunun). */
export const programFormSchema = v.pipe(
  v.object(bodyFields),
  v.forward(v.partialCheck([['currentPhaseId'], ['phases']], currentExists, CURRENT_MISSING), ['currentPhaseId']),
  v.forward(v.partialCheck([['phased'], ['phases']], unphasedOk, UNPHASED_PROBLEM), ['phases']),
);
export type ProgramFormInput = v.InferInput<typeof programFormSchema>;
export type ProgramFormValues = v.InferOutput<typeof programFormSchema>;

/**
 * Kayıt ucu: `baseRevision` null = yeni program; sayı = düzenleyicinin yüklediği sürüm.
 * `baseCreatedAt`: yüklenen programın oluşturulma anı; silinip yeniden oluşturulan program revision
 * 1'den başlasa da çakışma yakalanır. Göndermeyen (eski) sekmede yalnız revision denetlenir.
 * Eski biçimle açık kalmış sekmenin kaydı da kabul edilir (`phased` evrelerden, setler satıra).
 */
export const programSaveSchema = v.pipe(
  v.unknown(),
  v.transform(upgradeProgramBody),
  v.object({ ...bodyFields, baseRevision: v.nullable(positive), baseCreatedAt: v.optional(timestamp) }),
  v.forward(v.partialCheck([['currentPhaseId'], ['phases']], currentExists, CURRENT_MISSING), ['currentPhaseId']),
  v.forward(v.partialCheck([['phased'], ['phases']], unphasedOk, UNPHASED_PROBLEM), ['phases']),
);

/** Evre geçişi (program sayfasındaki öneri): sürüm kayıttaki gibi (`baseRevision`, `baseCreatedAt`). */
export const programPhaseSwitchSchema = v.object({ phaseId: phaseIdSchema, baseRevision: positive, baseCreatedAt: v.optional(timestamp) });

export const programChangeSchema = v.object({
  scope: v.optional(v.pipe(v.string(), v.maxLength(L.changeScope))),
  text: v.pipe(v.string(), v.minLength(1), v.maxLength(L.changeText)),
});

export const programLogEntrySchema = v.object({
  at: timestamp,
  revision: positive,
  kind: v.picklist(LOG_KINDS),
  /** Bitişte yazılan danışan kaydının seansı: aynı seansın kaydı ikinci kez eklenmez. */
  sessionId: v.optional(v.pipe(v.string(), v.regex(SESSION_ID_PATTERN))),
  /** Kaydı PT yaptı (yalnız danışanın kendi programında); yoksa danışan. */
  by: v.optional(v.literal('pt')),
  changes: v.pipe(v.array(programChangeSchema), v.minLength(1), v.maxLength(L.changesPerEntry)),
});

/** Danışanın satır hedefi (tasarım §6.2): `baseSets` PT'nin o anki setleri; satır onlara eşitken `sets` geçerli. */
export const clientTargetSchema = v.object({
  sets: rowSetsSchema,
  baseSets: rowSetsSchema,
  sessionId: v.optional(v.pipe(v.string(), v.regex(SESSION_ID_PATTERN))),
  at: timestamp,
});

/**
 * `clientTargets` hoşgörüyle okunur: satır kimliği ya da içeriği bozuk hedef düşer, program yine okunur
 * (danışanın tek bozuk hedefi PT'nin programını ve antrenmanı kilitlemesin). Boşsa alan yok.
 */
const clientTargetsSchema = v.pipe(
  v.unknown(),
  v.transform((raw): Record<string, v.InferOutput<typeof clientTargetSchema>> | undefined => {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
    const targets: Record<string, v.InferOutput<typeof clientTargetSchema>> = {};
    for (const [rowId, value] of Object.entries(raw)) {
      const parsed = v.safeParse(clientTargetSchema, value);
      if (ROW_ID_PATTERN.test(rowId) && parsed.success) targets[rowId] = parsed.output;
    }
    return Object.keys(targets).length > 0 ? targets : undefined;
  }),
);

/** Repo'daki dosya: sürüm 1 önce çevrilir. Bilinmeyen alanlar atılır (`v.object`). */
export const programSchema = v.pipe(
  v.unknown(),
  v.transform(upgradeProgram),
  v.object({
    version: v.literal(2),
    /** Evrelere bölündü mü; false: tek, süresiz gün listesi. */
    phased: v.boolean(),
    /** PT'nin her kaydında +1; düzenleyici çakışmayı bununla yakalar. */
    revision: positive,
    createdAt: timestamp,
    updatedAt: timestamp,
    phases: programPhasesSchema,
    current: v.object({ phaseId: phaseIdSchema, startedAt: timestamp }),
    /** Dönüş (A → B → C): Faz 3'te kalkar; eski dosyalar okunabilsin diye şemada kalır, yeni kararlar ona bakmaz. */
    rotation: v.object({ lastDayId: v.optional(dayIdSchema), lastCompletedAt: v.optional(timestamp) }),
    /**
     * Antrenman günleri: şu anki evrenin atamalarının birleşimi (türetilmiş; PT kaydı ve evre geçişi yeniden yazar),
     * yoksa atama yok. Okuyan her yer (kaçan gün, "Bu hafta x/y", Genel bakış) değişmeden çalışsın diye durur. Gün
     * başına ataması olmayan eski dosyada okunurken atamalar buradan türetilir. `at`: birleşimin son değiştiği an
     * (kaçan gün penceresi).
     */
    schedule: v.optional(v.object({ weekdays: weekdaysSchema, at: v.optional(timestamp) })),
    /** Danışanın eski gün katmanı: okunur ama yok sayılır (danışan günleri değiştirmez); PT'nin ilk kaydı siler. */
    clientSchedule: v.optional(v.object({ weekdays: clientWeekdaysSchema, at: timestamp })),
    /** Danışanın satır hedefleri (bitişte "Evet, güncelle"): revision artmaz, PT satırı değiştirince düşer. */
    clientTargets: v.optional(clientTargetsSchema),
    /** En yenisi üstte. */
    log: v.pipe(v.array(programLogEntrySchema), v.maxLength(L.log)),
  }),
  v.check((program) => program.phases.some((phase) => phase.id === program.current.phaseId), CURRENT_MISSING),
  v.forward(v.partialCheck([['phased'], ['phases']], unphasedOk, UNPHASED_PROBLEM), ['phases']),
);
export type Program = v.InferOutput<typeof programSchema>;
