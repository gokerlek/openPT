import { DEFAULT_LOCALE, intlLocale, type Locale } from '../i18n/locale.ts';
import { catalogMessages } from '../i18n/messages/catalog/index.ts';
import { progressionOf, type ProgressionRule, type ProgressionScheme, type TrackingType } from './progression.ts';
import { cardioKind } from './cardio.ts';
import { SET_LIMITS, referenceSet, uniformSets, type SetSpec } from './set-plan.ts';
import type { Category } from '@/lib/schemas/exercise';
import type { MovementPattern } from './alternatives.ts';

/**
 * Antrenman şablonu — okuma tarafı (SPEC §7.4).
 *
 * Şablon sıralı bloklardan oluşur; blok tek hareket ya da gruptur (süperset, devre,
 * kompleks). Her hareket bir satırdır ve kalıcı kimliği vardır: antrenman kayıtları
 * satıra `şablon kimliği + satır kimliği` ile bağlanır. Setler satırdadır: her setin
 * kendi hedefi, isteğe bağlı yük yüzdesi ve AMRAP'ı olur (`set-plan.ts`). Dinlenme
 * bloktadır; grupta tur sayısı en çok seti olan hareketinkidir (`roundsOf`), seti biten
 * hareket sonraki turlarda atlanır. Isınma setleri saklanmaz, antrenmanda `warmupSets`
 * ile hesaplanır.
 *
 * Saf fonksiyonlar; yol takma adıyla çalışma zamanı içe aktarması yapmaz (testler
 * Node'un kendi test aracıyla çalışır). Kas payları (`exerciseSetWeights`) çağırandan gelir.
 */

export const TEMPLATE_ID_PATTERN = /^t_[a-z0-9]{8}$/;
export const BLOCK_ID_PATTERN = /^b_[a-z0-9]{6}$/;
export const ROW_ID_PATTERN = /^r_[a-z0-9]{6}$/;

export const BLOCK_KINDS = ['single', 'superset', 'circuit', 'complex'] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

export function blockKindLabels(locale: Locale = DEFAULT_LOCALE): Record<BlockKind, string> {
  return catalogMessages(locale).blocks.kinds;
}

export function blockKindHints(locale: Locale = DEFAULT_LOCALE): Record<Exclude<BlockKind, 'single'>, string> {
  return catalogMessages(locale).blocks.hints;
}

/** Türkçe adlar (eski çağrılar); arayüz `blockKindLabels(locale)` / `blockKindHints(locale)` kullanır. */
export const BLOCK_KIND_LABELS: Record<BlockKind, string> = blockKindLabels('tr');
export const BLOCK_KIND_HINTS: Record<Exclude<BlockKind, 'single'>, string> = blockKindHints('tr');

/** Blok türüne göre hareket sayısı. */
export const BLOCK_ROWS: Record<BlockKind, { min: number; max: number }> = {
  single: { min: 1, max: 1 },
  superset: { min: 2, max: 2 },
  circuit: { min: 3, max: 8 },
  complex: { min: 2, max: 6 },
};

export const TEMPLATE_LIMITS = {
  name: 60,
  description: 300,
  blocks: 30,
  rows: 40,
  /** Bir satırdaki en fazla set (grupta tur da en fazla bu kadar). */
  sets: SET_LIMITS.perRow,
  restSeconds: 600,
  transitionSeconds: 120,
  note: 200,
  repsMax: 100,
  secondsMax: 3600,
} as const;

/** Yeni tek hareketin çalışma seti, türüne göre. */
export const DEFAULT_SETS: Record<Category, number> = {
  compound: 3,
  isolation: 3,
  conditioning: 3,
  warmup: 1,
  cooldown: 1,
};

/** Yeni tek hareketin setler arası dinlenmesi (sn), türüne göre. */
export const DEFAULT_REST_SECONDS: Record<Category, number> = {
  compound: 120,
  isolation: 60,
  conditioning: 60,
  warmup: 30,
  cooldown: 30,
};

/** Yeni grubun tur sonu dinlenmesi (sn). */
export const DEFAULT_GROUP_REST_SECONDS = { superset: 90, circuit: 120, complex: 120 } as const;
/** Devrede istasyonlar arası geçiş (sn). */
export const DEFAULT_TRANSITION_SECONDS = 15;
/** Süre tahmininde bir tekrarın süresi (sn). */
export const SECONDS_PER_REP = 3;
/** Egzersiz yoksa (silinmiş) kullanılan dinlenme. */
export const FALLBACK_REST_SECONDS = 90;

// Yapısal tipler: Valibot şemasının çıktısı (`schemas/template.ts`) bunlarla aynı şekildedir.
/** Tek aralık: egzersizin varsayılan hedefi, kural kaynağı, düz setlerin hedefi. */
export type TemplateTarget = { min: number; max: number };
export type RuleOverride = { scheme: ProgressionScheme; targetRir: number };
export type TemplateRow = {
  id: string;
  exerciseId: string;
  /** Setler (1–10), sırasıyla: her birinin hedefi (tekrar; süreli harekette saniye), yüzdesi, AMRAP'ı. */
  sets: SetSpec[];
  /** Egzersizin kuralının yerine: ilerleme türü ve yedekte tekrar. */
  rule?: RuleOverride;
  /** Aynı hareket başka cihazda. Yoksa egzersizin kendi cihazı. */
  deviceId?: string;
  note?: string;
};
export type TemplateBlock = {
  id: string;
  kind: BlockKind;
  /** Tek harekette setler arası; grupta tur sonu dinlenme. */
  restSeconds: number;
  /** Yalnız devre: istasyonlar arası geçiş. */
  transitionSeconds?: number;
  rows: TemplateRow[];
};
export type TemplateBody = { blocks: readonly TemplateBlock[] };

/** Hesap için gereken egzersiz alanları (egzersiz şemasının alt kümesi). */
export type PlanExercise = {
  id: string;
  title: string;
  category: Category;
  trackingType: TrackingType;
  equipment: string;
  deviceId?: string;
  progression?: ProgressionRule;
  primaryMuscles: readonly string[];
  secondaryMuscles: readonly string[];
  stabilizerMuscles?: readonly string[];
  /** Kardiyo türü için (`cardioKind`): hareket kalıbı ve yürüyüş/koşu işareti. */
  pattern?: MovementPattern;
  locomotion?: boolean;
};

/** Antrenman ekranının set sırası: hangi satır, kaçıncı tur, ardından ne kadar dinlenme. */
export type SetSlot = { blockId: string; rowId: string; round: number; restAfterSeconds: number };

/** Blok türü hareket sayısına uymuyorsa sebebi; uyuyorsa `null`. */
export function blockShapeProblem(kind: BlockKind, rowCount: number, locale: Locale = DEFAULT_LOCALE): string | null {
  const { min, max } = BLOCK_ROWS[kind];
  return rowCount >= min && rowCount <= max ? null : catalogMessages(locale).blocks.shapeProblems[kind];
}

/**
 * Hareket sayısı değişince türün uyarlanması: tür yeni sayıya uyuyorsa kalır, uymuyorsa
 * en yakın tür (üçüncü hareket eklenen süperset devre olur, tek hareket kalan grup tekleşir).
 */
export function settleKind(kind: BlockKind, rowCount: number): BlockKind {
  if (rowCount <= 1) return 'single';
  if (rowCount === 2) return kind === 'superset' || kind === 'complex' ? kind : 'superset';
  if (rowCount <= BLOCK_ROWS.complex.max) return kind === 'circuit' || kind === 'complex' ? kind : 'circuit';
  return 'circuit';
}

/** Bu hareket sayısında seçilebilecek türler. */
export function kindOptions(rowCount: number): BlockKind[] {
  const options = BLOCK_KINDS.filter((kind) => blockShapeProblem(kind, rowCount) === null);
  return options.length > 0 ? options : [settleKind('single', rowCount)];
}

export function countRows(blocks: readonly TemplateBlock[]): number {
  return blocks.reduce((sum, block) => sum + block.rows.length, 0);
}

/** Bloğun tur sayısı: en çok seti olan hareketinki (tek harekette set sayısı). */
export function roundsOf(block: Pick<TemplateBlock, 'rows'>): number {
  return Math.max(0, ...block.rows.map((row) => row.sets.length));
}

/**
 * Grupta seti erken biten hareketler: "Leg Curl 3 sette biter; sonraki turlarda atlanır."
 * Bütün hareketlerin set sayısı aynıysa (ya da tek harekette) `null`.
 */
export function groupSkipNote(
  block: Pick<TemplateBlock, 'kind' | 'rows'>,
  titleOf: (row: TemplateRow) => string,
  locale: Locale = DEFAULT_LOCALE,
): string | null {
  if (block.kind === 'single') return null;
  const t = catalogMessages(locale).blocks;
  const rounds = roundsOf(block);
  const short = block.rows.filter((row) => row.sets.length < rounds);
  if (short.length === 0) return null;
  const list = short.map((row) => t.skipItem(titleOf(row), row.sets.length, count(row.sets.length, locale))).join(', ');
  return t.skipNote(list);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Eski şablon/gün blokları (blokta `sets: n`, satırda tek `target`) → satır başına setler.
 * Yalnız yapıyı çevirir, onarmaz: geçersiz sayı geçersiz kalır (0 → [], 25 → 11 set), dev dizi üretmez.
 * Yeni biçime ve tanımadığı değerlere dokunmaz; iki kez uygulamak aynı sonucu verir.
 */
export function upgradeLegacyBlocks(blocks: unknown): unknown {
  if (!Array.isArray(blocks)) return blocks;
  return blocks.map((block: unknown) => {
    if (!isRecord(block) || !Array.isArray(block.rows)) return block;
    if (!('sets' in block)) return block;
    const { sets: setCount, ...rest } = block;
    const n = typeof setCount === 'number' && Number.isInteger(setCount) ? Math.min(Math.max(setCount, 0), TEMPLATE_LIMITS.sets + 1) : 0;
    return {
      ...rest,
      rows: block.rows.map((row: unknown) => {
        if (!isRecord(row) || Array.isArray(row.sets) || !isRecord(row.target)) return row;
        const { target, ...others } = row;
        const { min, max } = target as Record<string, unknown>;
        return { ...others, sets: Array.from({ length: n }, () => ({ min, max })) };
      }),
    };
  });
}

/** Birden çok kez geçen blok ve satır kimlikleri (temiz şablonda boş). */
export function duplicateIds(blocks: readonly TemplateBlock[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of blocks.flatMap((block) => [block.id, ...block.rows.map((row) => row.id)])) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return [...duplicates];
}

type RuleSource = Pick<PlanExercise, 'category' | 'trackingType' | 'progression'>;

/** Yeni satırın hedefi: egzersizin kuralındaki aralık. */
export function defaultTarget(exercise: RuleSource): TemplateTarget {
  const rule = progressionOf(exercise);
  return { min: rule.targetMin, max: rule.targetMax };
}

/** Yeni satırın setleri: egzersizin aralığıyla düz setler (sayı türüne göre ya da verilen). */
export function defaultSets(exercise: RuleSource, setCount: number = DEFAULT_SETS[exercise.category]): SetSpec[] {
  return uniformSets(defaultTarget(exercise), setCount);
}

/**
 * Kuralın kaynağından geçerli ilerleme kuralı: tür ve yedekte tekrar satırdan (değiştirildiyse)
 * ya da egzersizden, hedef aralığı verilen hedeften. `nextSession()`'a doğrudan verilir.
 */
export function ruleFor(row: { rule?: RuleOverride; target: TemplateTarget }, exercise: RuleSource): ProgressionRule {
  const base = progressionOf(exercise);
  return {
    scheme: row.rule?.scheme ?? base.scheme,
    targetRir: row.rule?.targetRir ?? base.targetRir,
    targetMin: row.target.min,
    targetMax: row.target.max,
  };
}

/** Satırın kuralı: hedef aralığı referans setten (ilk tam yük seti; `describeRule` için). */
export function rowRule(row: Pick<TemplateRow, 'rule' | 'sets'>, exercise: RuleSource): ProgressionRule {
  return ruleFor({ rule: row.rule, target: referenceSet(row.sets) }, exercise);
}

/** Antrenman ekranının `planSession` girdisi: satırın kuralı (tür, yedek) ve setleri. */
export function planInputFor(
  row: Pick<TemplateRow, 'rule' | 'sets'>,
  exercise: RuleSource,
): { rule: Pick<ProgressionRule, 'scheme' | 'targetRir'>; sets: SetSpec[] } {
  const { scheme, targetRir } = rowRule(row, exercise);
  return { rule: { scheme, targetRir }, sets: row.sets };
}

/** Satırın cihazı: şablonda değiştirildiyse ve cihaz hâlâ varsa o, yoksa egzersizin kendi cihazı (SPEC §7.4). */
export function effectiveDeviceId(
  row: Pick<TemplateRow, 'deviceId'>,
  exercise?: Pick<PlanExercise, 'deviceId'>,
  knownDeviceIds?: ReadonlySet<string>,
): string | undefined {
  if (row.deviceId !== undefined && (!knownDeviceIds || knownDeviceIds.has(row.deviceId))) return row.deviceId;
  return exercise?.deviceId;
}

/**
 * Antrenmandaki set sırası. Tek harekette setler arka arkaya; grupta her tur, satırlar
 * sırayla (süperset ve komplekste aralarında dinlenme yok, devrede istasyon geçişi),
 * dinlenme turun sonunda. Setleri biten hareket sonraki turlarda atlanır (v1 kuralı):
 * turun son hareketi, o turda kalan son harekettir. `round` satırın kaçıncı setidir.
 * Şablonun son setinden sonra dinlenme yok.
 */
export function setSlots(template: TemplateBody): SetSlot[] {
  const slots: SetSlot[] = [];
  for (const block of template.blocks) {
    const between = block.kind === 'circuit' ? (block.transitionSeconds ?? DEFAULT_TRANSITION_SECONDS) : 0;
    const rounds = roundsOf(block);
    for (let round = 0; round < rounds; round++) {
      const active = block.rows.filter((row) => row.sets.length > round);
      active.forEach((row, index) => {
        const last = index === active.length - 1;
        slots.push({ blockId: block.id, rowId: row.id, round, restAfterSeconds: last ? block.restSeconds : between });
      });
    }
  }
  const final = slots.at(-1);
  if (final) final.restAfterSeconds = 0;
  return slots;
}

const NO_LOAD_CATEGORIES = new Set<Category>(['warmup', 'cooldown']);

/** Kas yüküne girer mi: ısınma ve soğuma türündeki hareketler sayılmaz (şablon, program ve antrenman özeti). */
export function countsForLoad(category: Category): boolean {
  return !NO_LOAD_CATEGORIES.has(category);
}

function clean(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Şablon kas haritası: kas başına kesirli set toplamı (hedef 1 · yardımcı 0,5 ·
 * dengeleyici 0,25; aynı kas birden çok harekette varsa toplanır). Isınma ve soğuma
 * türündeki hareketler sayılmaz; kütüphanede olmayan egzersizin satırı `missingRowIds`'e
 * düşer. `cardio` anahtarı korunur (harita onu çizmez, açıklama yazar).
 */
export function templateMuscleLoad<E extends PlanExercise>(
  template: TemplateBody,
  exercises: ReadonlyMap<string, E>,
  setWeightsOf: (exercise: E) => Partial<Record<string, number>>,
): { load: Record<string, number>; missingRowIds: string[] } {
  const rows = template.blocks.flatMap((block) => block.rows.map((row) => ({ key: row.id, exerciseId: row.exerciseId, sets: row.sets.length })));
  const { load, missing } = muscleLoadOf(rows, exercises, setWeightsOf);
  return { load, missingRowIds: missing };
}

/**
 * Kas yükünün ortak hesabı: kalem başına set sayısı × kasın payı, kas başına toplam. Şablon ve program
 * haritası planlanan setleri (`templateMuscleLoad`), İlerleme sekmesi yapılan çalışma setlerini verir
 * (gerçekleşen haftalık yük, SPEC §7.4). Isınma ve soğuma türündeki hareketler sayılmaz; kütüphanede
 * olmayan egzersizin kalemi `missing`'e düşer.
 */
export function muscleLoadOf<E extends PlanExercise>(
  items: Iterable<{ key: string; exerciseId: string; sets: number }>,
  exercises: ReadonlyMap<string, E>,
  setWeightsOf: (exercise: E) => Partial<Record<string, number>>,
): { load: Record<string, number>; missing: string[] } {
  const load: Record<string, number> = {};
  const missing: string[] = [];
  for (const item of items) {
    const exercise = exercises.get(item.exerciseId);
    if (!exercise) {
      missing.push(item.key);
      continue;
    }
    if (NO_LOAD_CATEGORIES.has(exercise.category)) continue;
    for (const [muscle, weight] of Object.entries(setWeightsOf(exercise))) {
      if (weight) load[muscle] = (load[muscle] ?? 0) + item.sets * weight;
    }
  }
  for (const muscle of Object.keys(load)) load[muscle] = clean(load[muscle] ?? 0);
  return { load, missing };
}

/**
 * Haftalık yük kademesi (SPEC §7.4): 0 boş · 1–9 az · 10–20 yeterli · 20'nin üstü fazla. Kesirli sette
 * 10'un altı az (9,5 az), 20 dahil yeterli. Haftada kas başına ~10 set: ACSM 2026.
 */
export const WEEKLY_SET_BANDS = { enough: 10, high: 20 } as const;
export type WeeklySetBand = 'none' | 'low' | 'enough' | 'high';

export function weeklySetBand(sets: number): WeeklySetBand {
  if (!(sets > 0)) return 'none';
  if (sets < WEEKLY_SET_BANDS.enough) return 'low';
  return sets <= WEEKLY_SET_BANDS.high ? 'enough' : 'high';
}

/** Kas yükünü bir çarpanla ölçekler (haftalık yük = bir tur × sıklık ÷ gün sayısı). */
export function scaleLoad(load: Readonly<Record<string, number>>, factor: number): Record<string, number> {
  return Object.fromEntries(Object.entries(load).map(([muscle, value]) => [muscle, clean(value * factor)]));
}

/**
 * Bir setin tahmini süresi (sn): hedefin ortası (AMRAP'ta üst sınır); tekrarda tekrar
 * başına 3 sn, süreli harekette saniye.
 */
export function setSeconds(set: SetSpec, trackingType: TrackingType): number {
  const value = set.amrap ? set.max : (set.min + set.max) / 2;
  return trackingType === 'duration' ? value : value * SECONDS_PER_REP;
}

/**
 * Tahmini süre (dk, 5'e yuvarlanır): her set kendi hedefine göre (`setSeconds`) +
 * ardındaki dinlenme. Isınma setleri hariç. Kütüphanede olmayan egzersiz tekrarlı sayılır.
 */
export function estimateMinutes(template: TemplateBody, exercises: ReadonlyMap<string, Pick<PlanExercise, 'trackingType'>>): number {
  const rows = new Map(template.blocks.flatMap((block) => block.rows.map((row) => [row.id, row] as const)));
  const slots = setSlots(template);
  if (slots.length === 0) return 0;
  let seconds = 0;
  for (const slot of slots) {
    const row = rows.get(slot.rowId);
    const set = row?.sets[slot.round];
    if (!row || !set) continue;
    seconds += setSeconds(set, exercises.get(row.exerciseId)?.trackingType ?? 'weight_reps') + slot.restAfterSeconds;
  }
  return Math.ceil(seconds / 300) * 5;
}

/**
 * Isınma için "kas grubunun ilk hareketi" olan satırlar (`warmupSets({ isFirstForMuscle })`).
 * Şablon sırasıyla: hedef kaslarından (kardiyo hariç) en az biri daha önceki bir satırda
 * hedef olmadıysa satır ilktir. Gruptaki satırlar sırasıyla sayılır; ısınma/soğuma
 * hareketleri ve kütüphanede olmayan egzersizler hesaba girmez.
 */
export function firstForMuscleRowIds(template: TemplateBody, exercises: ReadonlyMap<string, PlanExercise>): Set<string> {
  const seen = new Set<string>();
  const first = new Set<string>();
  for (const block of template.blocks) {
    for (const row of block.rows) {
      const exercise = exercises.get(row.exerciseId);
      if (!exercise || NO_LOAD_CATEGORIES.has(exercise.category)) continue;
      const primary = exercise.primaryMuscles.filter((muscle) => muscle !== 'cardio');
      if (primary.some((muscle) => !seen.has(muscle))) first.add(row.id);
      for (const muscle of primary) seen.add(muscle);
    }
  }
  return first;
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

/** Satır etiketleri: bloklar 1'den numaralanır, gruptaki satırlar harf alır ("2a", "2b"). */
export function rowLabels(template: TemplateBody): Map<string, string> {
  const labels = new Map<string, string>();
  template.blocks.forEach((block, index) => {
    const number = String(index + 1);
    if (block.kind === 'single' && block.rows.length === 1) {
      const row = block.rows[0];
      if (row) labels.set(row.id, number);
      return;
    }
    block.rows.forEach((row, rowIndex) => labels.set(row.id, `${number}${LETTERS[rowIndex] ?? rowIndex + 1}`));
  });
  return labels;
}

/**
 * Bugün önizlemesi: en az `limit` hareketi dolduran ilk bloklar (grup bölünmez) ve kalanlar; `restRows` kalan
 * satır sayısı. Kütüphanede olmayan satırları çağıran önceden ayıklar (yoksa "ilk 3" üçten az görünür).
 */
export function previewBlocks<T extends { rows: readonly unknown[] }>(blocks: readonly T[], limit: number): { head: T[]; rest: T[]; restRows: number } {
  const head: T[] = [];
  let rows = 0;
  for (const block of blocks) {
    if (rows >= limit) break;
    head.push(block);
    rows += block.rows.length;
  }
  const rest = blocks.slice(head.length);
  return { head, rest, restRows: rest.reduce((sum, block) => sum + block.rows.length, 0) };
}

export type TemplateSummary = {
  /** Kütüphanede olan hareketler (silinmiş egzersizin satırı sayılmaz). */
  rows: number;
  /** Çalışma setleri: satırların set sayılarının toplamı, bütün türler. */
  workingSets: number;
  groups: { superset: number; circuit: number; complex: number };
  missingRowIds: string[];
  /** Kullanılan cihazlar, şablon sırasıyla (satırdaki değişiklik egzersizin cihazına üstün). */
  deviceIds: string[];
  minutes: number;
};

/** Liste kartı ve detaydaki özet: hareket, set, grup, cihaz ve tahmini süre. */
export function templateSummary(
  template: TemplateBody,
  exercises: ReadonlyMap<string, PlanExercise>,
  knownDeviceIds?: ReadonlySet<string>,
): TemplateSummary {
  const groups = { superset: 0, circuit: 0, complex: 0 };
  const missingRowIds: string[] = [];
  const deviceIds: string[] = [];
  let rows = 0;
  let workingSets = 0;
  for (const block of template.blocks) {
    if (block.kind !== 'single') groups[block.kind] += 1;
    for (const row of block.rows) {
      const exercise = exercises.get(row.exerciseId);
      if (!exercise) {
        missingRowIds.push(row.id);
        continue;
      }
      rows += 1;
      workingSets += row.sets.length;
      const deviceId = effectiveDeviceId(row, exercise, knownDeviceIds);
      if (deviceId && !deviceIds.includes(deviceId)) deviceIds.push(deviceId);
    }
  }
  // Silinmiş egzersiz sayılara girmez; süre de onsuz tahmin edilir.
  const missing = new Set(missingRowIds);
  const counted = missing.size
    ? {
        blocks: template.blocks
          .map((block) => ({ ...block, rows: block.rows.filter((row) => !missing.has(row.id)) }))
          .filter((block) => block.rows.length > 0),
      }
    : template;
  return { rows, workingSets, groups, missingRowIds, deviceIds, minutes: estimateMinutes(counted, exercises) };
}

function count(value: number, locale: Locale = DEFAULT_LOCALE): string {
  return value.toLocaleString(intlLocale(locale));
}

/** "8–12 tekrar", "5 tekrar", "30–60 sn". */
export function formatTarget(target: TemplateTarget, trackingType: TrackingType, locale: Locale = DEFAULT_LOCALE): string {
  const t = catalogMessages(locale).time;
  const unit = trackingType === 'duration' ? t.secondsUnit : t.reps(target.max);
  return target.min === target.max
    ? `${count(target.min, locale)} ${unit}`
    : `${count(target.min, locale)}–${count(target.max, locale)} ${unit}`;
}

/** "Ara yok", "45 sn", "1 dk", "1 dk 30 sn". */
export function formatRest(seconds: number, locale: Locale = DEFAULT_LOCALE): string {
  const t = catalogMessages(locale).time;
  if (seconds <= 0) return t.noRest;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return t.seconds(String(rest));
  return rest === 0 ? t.minutes(String(minutes)) : t.minutesSeconds(String(minutes), String(rest));
}

/**
 * Bloğun tek satırlık anlatımı (detayda grup başlığı, düzenleyicide ipucu). `sets`: tek
 * harekette set sayısı, grupta tur; çağıran `{ ...block, sets: roundsOf(block) }` verir.
 */
export function describeBlock(
  block: Pick<TemplateBlock, 'kind' | 'restSeconds' | 'transitionSeconds'> & { sets: number },
  locale: Locale = DEFAULT_LOCALE,
): string {
  const t = catalogMessages(locale).blocks;
  const rest = (afterRound: boolean) => t.rest(block.restSeconds > 0 ? formatRest(block.restSeconds, locale) : null, afterRound);
  const rounds = t.rounds(block.sets, count(block.sets, locale));
  switch (block.kind) {
    case 'single':
      return `${t.sets(block.sets, count(block.sets, locale))} · ${rest(false)}`;
    case 'superset':
      return `${rounds} · ${rest(true)}`;
    case 'circuit': {
      const transition = block.transitionSeconds ?? DEFAULT_TRANSITION_SECONDS;
      return `${rounds} · ${t.betweenStations(transition > 0 ? formatRest(transition, locale) : null)} · ${rest(true)}`;
    }
    case 'complex':
      return `${rounds} · ${t.complexNote} · ${rest(true)}`;
  }
}

const REPS_TRACKING = new Set<TrackingType>(['weight_reps', 'bodyweight_reps']);

/**
 * Kayıttan önce sunucuda: kütüphaneye ve cihazlara göre denetim ve sadeleştirme.
 * Hata anahtarları Formisch yollarıdır (`blocks.0.rows.1.deviceId`).
 * - Kütüphanede olmayan egzersiz ya da cihaz reddedilir; tekrarda her setin hedefi en fazla 100.
 * - Yük yüzdesi yalnız ağırlıklı harekette ve %100'ün altındaysa yazılır; AMRAP yalnız açıksa.
 * - Egzersizin kuralıyla aynı olan kural değişikliği ve egzersizin kendi cihazı yazılmaz.
 *   Programda (`storedRows`: kayıttaki satırlar) kayıttaki aynı satırda (aynı kimlik) aynen
 *   duruyorsa kalır: danışana özel seçim, egzersiz sonradan ona eşitlense de kaybolmaz (yoksa
 *   PT'nin yapmadığı "…döndü" yazılırdı). Yeni gelen eşit değer (seçicide gösterilen varsayılanı
 *   yeniden seçmek, şablondan gün) şablondaki gibi düşer, değişiklik üretmez.
 * - Not kırpılır, boşsa yazılmaz; istasyon geçişi yalnız devrede durur (yoksa 15 sn).
 */
export function normalizeTemplate(
  body: TemplateBody,
  ctx: { exercises: ReadonlyMap<string, PlanExercise>; deviceIds: ReadonlySet<string> },
  options: { storedRows?: ReadonlyMap<string, Pick<TemplateRow, 'rule' | 'deviceId'>> } = {},
  locale: Locale = DEFAULT_LOCALE,
): { blocks: TemplateBlock[]; errors: Record<string, string> } {
  const t = catalogMessages(locale).blocks;
  const errors: Record<string, string> = {};
  const blocks = body.blocks.map((block, i): TemplateBlock => {
    const rows = block.rows.map((row, j): TemplateRow => {
      const at = `blocks.${i}.rows.${j}`;
      const exercise = ctx.exercises.get(row.exerciseId);
      if (!exercise) errors[`${at}.exerciseId`] = t.missingExercise;
      const sets = row.sets.map((set, k): SetSpec => {
        if (exercise && REPS_TRACKING.has(exercise.trackingType) && set.max > TEMPLATE_LIMITS.repsMax) {
          errors[`${at}.sets.${k}.max`] = t.repsMax(TEMPLATE_LIMITS.repsMax);
        }
        // Egzersiz yoksa (hata zaten bildirildi) yüzde olduğu gibi kalır.
        const keepPct = set.loadPct !== undefined && set.loadPct < 100 && (!exercise || exercise.trackingType === 'weight_reps');
        // Mesafe kardiyoda, eğim yürüyüş/koşuda; egzersiz yoksa olduğu gibi kalır.
        const kind = exercise ? cardioKind(exercise) : 'walk';
        return {
          min: set.min,
          max: set.max,
          ...(keepPct ? { loadPct: set.loadPct } : {}),
          ...(set.amrap === true ? { amrap: true } : {}),
          ...(kind && set.distanceM !== undefined ? { distanceM: set.distanceM } : {}),
          ...(kind === 'walk' && set.inclinePct !== undefined ? { inclinePct: set.inclinePct } : {}),
        };
      });
      const stored = options.storedRows?.get(row.id);
      let deviceId = row.deviceId;
      if (deviceId !== undefined && !ctx.deviceIds.has(deviceId)) errors[`${at}.deviceId`] = t.missingDevice;
      if (exercise && deviceId === exercise.deviceId && deviceId !== stored?.deviceId) deviceId = undefined;

      let rule = row.rule;
      const kept = stored?.rule?.scheme === rule?.scheme && stored?.rule?.targetRir === rule?.targetRir;
      if (rule && exercise && !kept) {
        const base = progressionOf(exercise);
        if (rule.scheme === base.scheme && rule.targetRir === base.targetRir) rule = undefined;
      }
      const note = row.note?.trim();
      return {
        id: row.id,
        exerciseId: row.exerciseId,
        sets,
        ...(rule ? { rule: { scheme: rule.scheme, targetRir: rule.targetRir } } : {}),
        ...(deviceId ? { deviceId } : {}),
        ...(note ? { note } : {}),
      };
    });
    return {
      id: block.id,
      kind: block.kind,
      restSeconds: block.restSeconds,
      ...(block.kind === 'circuit' ? { transitionSeconds: block.transitionSeconds ?? DEFAULT_TRANSITION_SECONDS } : {}),
      rows,
    };
  });
  return { blocks, errors };
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
/** 252 = 36 × 7: bu değerin altındaki baytlar alfabeye eşit dağılır. */
const UNBIASED_LIMIT = 252;
const MAX_ATTEMPTS = 20;

/**
 * Rastgele kimlik (`t_k3m9x2qa`, `r_q2m8xk`; programda evre `p_`, gün `d_`; antrenman kaydında seans `s_`, hareket `e_`,
 * set `st_`, su `wt_`, cihaz `w_`; danışanın önerisi `pr_`; kendi programı `op_`; kısıt `k_`): a-z ve 0-9, eşit dağılımlı. Alınmış kimliklerle çakışırsa yeniden dener; 20 denemede
 * bulamazsa hata fırlatır.
 */
export function randomId(
  prefix: 't' | 'b' | 'r' | 'p' | 'd' | 's' | 'e' | 'st' | 'wt' | 'w' | 'pr' | 'op' | 'k',
  length: number,
  taken: ReadonlySet<string>,
  random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n)),
): string {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let body = '';
    while (body.length < length) {
      for (const byte of random(length * 2)) {
        if (byte < UNBIASED_LIMIT && body.length < length) body += ALPHABET[byte % ALPHABET.length];
      }
    }
    const id = `${prefix}_${body}`;
    if (!taken.has(id)) return id;
  }
  throw new Error('Benzersiz kimlik üretilemedi.');
}
