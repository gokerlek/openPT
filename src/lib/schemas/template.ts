import * as v from 'valibot';
import { DEFAULT_LOCALE, isLocale, type Locale } from '../../i18n/locale.ts';
import { ptProgramMessages } from '../../i18n/messages/pt-program/index.ts';
import { msg } from '../../i18n/valibot.ts';
import { CARDIO_LIMITS, CARDIO_SPEED_MAX_KMH, cardioSpeedIssue } from '../cardio.ts';
import { PROGRESSION_SCHEMES } from '../progression.ts';
import { SET_LIMITS, isFullLoad } from '../set-plan.ts';
import {
  BLOCK_ID_PATTERN,
  BLOCK_KINDS,
  ROW_ID_PATTERN,
  TEMPLATE_ID_PATTERN,
  TEMPLATE_LIMITS as L,
  blockShapeProblem,
  countRows,
  duplicateIds,
  upgradeLegacyBlocks,
} from '../template-plan.ts';

export { BLOCK_KINDS, BLOCK_KIND_LABELS, TEMPLATE_ID_PATTERN, type BlockKind } from '../template-plan.ts';

/**
 * Antrenman şablonu şeması — sunucu ve istemci ortak (SPEC §7.4).
 *
 * Her şablon uygulama repo'sunda ayrı dosyadır: `data/templates/<id>.json`. Şablonda
 * kişisel veri yok: danışana özel hiçbir alan yok, bilinmeyen alanlar kayıtta atılır
 * (`v.object`). Yapı kuralları ve sabitler `src/lib/template-plan.ts`'te.
 *
 * Setler satırdadır (her setin hedefi, yüzdesi, AMRAP'ı). Eski dosyalar (blokta set sayısı,
 * satırda tek hedef) okunurken ve kayıt ucunda yeni biçime çevrilir (`storedBlocksSchema`);
 * düzenleyicinin şeması yalnız yeni biçimi kabul eder. Kayıt her zaman yeni biçimi yazar.
 */

/** Egzersiz ve cihaz kimlikleriyle aynı biçim. */
const SLUG = /^[a-z0-9-]{2,60}$/;

/** Doğrulama mesajları (`msg`: şemayı ayrıştıran isteğin diliyle). */
const text = (locale: Locale) => ptProgramMessages(locale).templateSchema;

const int = (min: number, max: number, unit?: 'm' | 's') =>
  v.pipe(
    v.number(msg((l) => text(l).enterNumber)),
    v.integer(msg((l) => text(l).enterInteger)),
    v.minValue(min, msg((l) => text(l).atLeastUnit(min, unit ? text(l).units[unit] : ''))),
    v.maxValue(max, msg((l) => text(l).atMostUnit(max, unit ? text(l).units[unit] : ''))),
  );

/** Yük yüzdesi: bozuk giriş (NaN) "Sayı gir." der; boş alan tam yüktür (alan yok). */
const loadPct = v.pipe(
  v.number(msg((l) => text(l).enterNumber)),
  v.integer(msg((l) => text(l).enterInteger)),
  v.minValue(SET_LIMITS.loadPctMin, msg((l) => text(l).loadMin(SET_LIMITS.loadPctMin))),
  v.maxValue(100, msg((l) => text(l).loadMax)),
);

/** Bir set: hedef (tekrar ya da saniye; min = max → sabit), isteğe bağlı yük yüzdesi, AMRAP, kardiyoda mesafe ve eğim. */
export const setSpecSchema = v.pipe(
  v.object({
    min: int(1, L.secondsMax),
    max: int(1, L.secondsMax),
    /** Tam yükteki setin yüzdesi; yoksa tam yük. */
    loadPct: v.optional(loadPct),
    /** "Yapabildiği kadar". */
    amrap: v.optional(v.boolean()),
    /** Kardiyo: mesafe (m); yürüyüş/koşuda eğim (%). Hangi harekette durduğunu sunucuda `normalizeTemplate` denetler. */
    distanceM: v.optional(int(1, CARDIO_LIMITS.distanceMax, 'm')),
    inclinePct: v.optional(
      v.pipe(
        v.number(msg((l) => text(l).enterNumber)),
        v.minValue(0, msg((l) => text(l).inclineMin)),
        v.maxValue(CARDIO_LIMITS.inclineReadMax, msg((l) => text(l).inclineMax(CARDIO_LIMITS.inclineReadMax))),
        v.multipleOf(CARDIO_LIMITS.inclineStep, msg((l) => text(l).inclineStep)),
      ),
    ),
  }),
  v.forward(v.partialCheck([['min'], ['max']], (set) => set.max >= set.min, msg((l) => text(l).upperBelowLower)), ['max']),
  // İnsan sınırı: hareketin türü (yürüyüş/koşu) burada bilinmez, en geniş kardiyo sınırı (antrenmanda türüne göre).
  v.forward(
    v.partialCheck(
      [['max'], ['distanceM']],
      (set) => cardioSpeedIssue('machine', { seconds: set.max, distanceM: set.distanceM }) === null,
      msg((l) => text(l).distanceSpeed(CARDIO_SPEED_MAX_KMH.machine)),
    ),
    ['distanceM'],
  ),
);
// Tekrarda üst sınır 100: kayıt türü burada bilinmediği için sunucuda `normalizeTemplate` denetler.

/** Satırın setleri: 1–10, en az biri tam yükte. */
export const rowSetsSchema = v.pipe(
  v.array(setSpecSchema, msg((l) => text(l).setsUnreadable)),
  v.minLength(1, msg((l) => text(l).setsMin)),
  v.maxLength(L.sets, msg((l) => text(l).setsMax(L.sets))),
  v.check((sets) => sets.length === 0 || sets.some(isFullLoad), msg((l) => text(l).fullLoadRequired)),
);

/** Satır okunamazsa: setleri yoksa (hedefsiz eski satır da) bunu söyler. */
const rowMessage = msg((l, issue: v.ObjectIssue) => (issue.expected === '"sets"' ? text(l).setsUnreadable : text(l).rowUnreadable));

/** Satırın kural değişikliği: yalnız tür ve yedekte tekrar (hedefler setlerde durur). */
export const ruleOverrideSchema = v.object({
  scheme: v.picklist(PROGRESSION_SCHEMES, msg((l) => text(l).pickProgression)),
  targetRir: int(0, 4),
});

export const templateRowSchema = v.object(
  {
  id: v.pipe(v.string(), v.regex(ROW_ID_PATTERN, msg((l) => text(l).rowIdInvalid))),
  exerciseId: v.pipe(v.string(), v.regex(SLUG, msg((l) => text(l).pickExercise))),
  sets: rowSetsSchema,
  rule: v.optional(ruleOverrideSchema),
  /** Aynı hareket başka cihazda. Yoksa egzersizin kendi cihazı. */
  deviceId: v.optional(v.pipe(v.string(), v.regex(SLUG, msg((l) => text(l).deviceIdInvalid)))),
  note: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(L.note, msg((l) => text(l).noteMax(L.note))))),
  },
  rowMessage,
);

export const templateBlockSchema = v.pipe(
  v.object({
    id: v.pipe(v.string(), v.regex(BLOCK_ID_PATTERN, msg((l) => text(l).blockIdInvalid))),
    kind: v.picklist(BLOCK_KINDS, msg((l) => text(l).pickKind)),
    /** Tek harekette setler arası; grupta tur sonu dinlenme (tur = en çok seti olan hareket). */
    restSeconds: int(0, L.restSeconds, 's'),
    /** Yalnız devre: istasyonlar arası geçiş. */
    transitionSeconds: v.optional(int(0, L.transitionSeconds, 's')),
    rows: v.pipe(
      v.array(templateRowSchema),
      v.minLength(1, msg((l) => text(l).blockEmpty)),
      v.maxLength(8, msg((l) => text(l).groupMax)),
    ),
  }),
  v.forward(
    v.partialCheck(
      [['kind'], ['rows']],
      (block) => blockShapeProblem(block.kind, block.rows.length) === null,
      (issue) => {
        const l = isLocale(issue.lang) ? issue.lang : DEFAULT_LOCALE;
        return blockShapeProblem(issue.input.kind, issue.input.rows.length, l) ?? text(l).groupInvalid;
      },
    ),
    ['rows'],
  ),
);

/** Şablon adı (program gününü şablon olarak kaydederken de). */
export const templateNameSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(2, msg((l) => text(l).nameShort)),
  v.maxLength(L.name, msg((l) => text(l).nameMax(L.name))),
);

/** Şablonun blokları: en az bir hareket, 30 blok, 40 hareket, benzersiz kimlikler. */
export const templateBlocksSchema = v.pipe(
  v.array(templateBlockSchema),
  v.minLength(1, msg((l) => text(l).blocksMin)),
  v.maxLength(L.blocks, msg((l) => text(l).blocksMax(L.blocks))),
  v.check((blocks) => countRows(blocks) <= L.rows, msg((l) => text(l).rowsMax(L.rows))),
  v.check((blocks) => duplicateIds(blocks).length === 0, msg((l) => text(l).idsUnique)),
);

/** Dosya ve kayıt ucu: eski biçim (blokta `sets`, satırda `target`) önce yeniye çevrilir. */
export const storedBlocksSchema = v.pipe(v.unknown(), v.transform(upgradeLegacyBlocks), templateBlocksSchema);

/** Yalnız blok düzenleyicinin form tipi için: blokları kökte tutan form. */
export const blocksHostSchema = v.object({ blocks: templateBlocksSchema });

const textFields = {
  name: templateNameSchema,
  description: v.optional(
    v.pipe(v.string(), v.trim(), v.maxLength(L.description, msg((l) => text(l).descriptionMax(L.description)))),
    '',
  ),
};

/** Düzenleyicinin şeması (kimlik ve tarihler yok); yalnız yeni biçim. */
export const templateFormSchema = v.object({
  ...textFields,
  blocks: templateBlocksSchema,
  /** "Danışanlar kendi programlarına kopyalayabilir" (`docs/design/kendi-program.md` §3.8); varsayılan kapalı. */
  sharedWithClients: v.optional(v.boolean(), false),
});
export type TemplateInput = v.InferInput<typeof templateFormSchema>;
export type TemplateFormValues = v.InferOutput<typeof templateFormSchema>;

/**
 * Kayıt ucu: kimliksiz istek yeni şablondur; `baseSha` düzenleyicinin yüklediği sürüm.
 * Eski biçimle açık kalmış bir sekmenin kaydı da kabul edilir (yeni biçime çevrilir). Bayrağı
 * göndermeyen (eski sekme) kayıttakine dokunmaz.
 */
export const templateSaveSchema = v.object({
  ...textFields,
  blocks: storedBlocksSchema,
  sharedWithClients: v.optional(v.boolean()),
  id: v.optional(v.pipe(v.string(), v.regex(TEMPLATE_ID_PATTERN, msg((l) => text(l).idInvalid)))),
  baseSha: v.optional(v.pipe(v.string(), v.regex(/^[0-9a-f]{40}$/))),
});

/** Repo'daki dosya. Bilinmeyen alanlar atılır (`v.object`): dosyaya kişisel veri giremez. */
export const templateSchema = v.object({
  id: v.pipe(v.string(), v.regex(TEMPLATE_ID_PATTERN)),
  ...textFields,
  blocks: storedBlocksSchema,
  /** Danışanlar kendi programlarına kopyalayabilir; yoksa kapalı. Danışan yalnız bu şablonları görür ve okur. */
  sharedWithClients: v.optional(v.boolean()),
  createdAt: v.pipe(v.string(), v.isoTimestamp()),
  updatedAt: v.pipe(v.string(), v.isoTimestamp()),
});
export type Template = v.InferOutput<typeof templateSchema>;
