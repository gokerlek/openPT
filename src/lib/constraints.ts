import type { LocalizedText, Localizable } from '../i18n/errors.ts';
import { DEFAULT_LOCALE, intlLocale, type Locale } from '../i18n/locale.ts';
import { healthMessages } from '../i18n/messages/health/index.ts';
import type { MovementPattern } from './alternatives.ts';
import {
  CONDITION_IDS,
  clientSafeLabel,
  conditionInfo,
  conditionKind,
  conditionLabel,
  EMERGENCY_CONDITION_ID,
  parseCondition,
  RETIRED_CONDITION_IDS,
  type ConditionId,
  type ConditionKind,
  type ConditionRegion,
} from './conditions.ts';
import { and, has, isTagged, loaded, touches, type ExerciseTags } from './exercise-filter.ts';
import { getFormat } from './format.ts';
import type { Constraint, ConstraintLogEntry, HealthRecord, Override } from './schemas/health.ts';

/**
 * Danışanın kısıtları (tasarım `docs/design/kisit-tarama.md` §2) — saf. `health.json` → `constraints[]`,
 * `overrides[]`, `constraintLog[]` üzerinde işlemler; sunucu (`health.ts`) ve tarayıcı ortak.
 *
 * - **Kısıt** bir kayıttır: bölge, taraf, tür, şiddet, başlangıç, kaçınılacak hareketler (kütüphanenin medikal
 *   etiketlerine eşlenir), isteğe bağlı sağlık profesyonelinin koyduğu tanı (kaynağıyla) ve PT'nin gözlemi.
 * - **Danışan bildirir**, PT karar verir. Güvenli yön hemen: bekleyen bildirimin "zorlayanlar"ı yalnız dikkat
 *   olarak işler (`constraint-filter.ts`), kötüleşme hemen yazılır; gevşeten yönü yalnız PT açar **[sentez]**.
 * - **Kırmızı bayrak** iki tarihli adımla yürür: yönlendirme (`referredAt`) ve görüş (`clearance`) (§2.6).
 * - Her değişiklik okunur bir satırla `constraintLog`'a (en yenisi üstte, 200 satır); commit mesajı geneldir.
 *
 * Eylemler kaydın yeni halini döndürür; kural ihlalinde `ConstraintError` (durum koduyla) fırlatır.
 */

/* --- adlar --- */

export const CONSTRAINT_REGIONS = [
  'neck',
  'shoulder',
  'elbow',
  'wrist_hand',
  'upper_back',
  'lower_back',
  'hip',
  'knee',
  'ankle_foot',
  'other',
] as const;
export type ConstraintRegion = (typeof CONSTRAINT_REGIONS)[number];

/** Kısıt metinleri okuyanın dilinde. */
function text(locale: Locale) {
  return healthMessages(locale).constraints;
}

/** Türkçe adlar (eski çağrılar); arayüz `regionLabels(locale)` kullanır. */
export const REGION_LABELS: Record<ConstraintRegion, string> = text('tr').regions;

/** Çift bölgeler: taraf zorunlu. */
export const PAIRED_REGIONS: ReadonlySet<ConstraintRegion> = new Set(['shoulder', 'elbow', 'wrist_hand', 'hip', 'knee', 'ankle_foot']);

export function isPaired(region: ConstraintRegion): boolean {
  return PAIRED_REGIONS.has(region);
}

/** Bölgenin sözlükteki karşılığı (tanı seçicisi bununla süzülür). */
export const REGION_CONDITION_REGIONS: Record<ConstraintRegion, readonly ConditionRegion[]> = {
  neck: ['neck'],
  shoulder: ['shoulder'],
  elbow: ['elbow'],
  wrist_hand: ['wrist'],
  upper_back: ['spine', 'neck'],
  lower_back: ['spine'],
  hip: ['hip'],
  knee: ['knee'],
  ankle_foot: ['ankle'],
  other: ['systemic'],
};

export const CONSTRAINT_SIDES = ['left', 'right', 'both'] as const;
export type ConstraintSide = (typeof CONSTRAINT_SIDES)[number];
export const SIDE_LABELS: Record<ConstraintSide, string> = text('tr').sides;

export const CONSTRAINT_TYPES = ['injury', 'condition', 'post_op', 'limitation'] as const;
export type ConstraintType = (typeof CONSTRAINT_TYPES)[number];
export const TYPE_LABELS: Record<ConstraintType, string> = text('tr').types;
/** Danışanın bildirim sheet'indeki cevaplar. */
export const TYPE_CLIENT_LABELS: Record<ConstraintType, string> = text('tr').typeClient;

export const SEVERITIES = ['mild', 'moderate', 'severe'] as const;
export type Severity = (typeof SEVERITIES)[number];
export const SEVERITY_LABELS: Record<Severity, string> = text('tr').severities;
/**
 * Tanımlar **[sentez]**: gösterim ve "kötüleşti" içindir. PT'nin seçtiği şiddet süzgeci değiştirmez; yalnız danışanın
 * PT'nin henüz bakmadığı "şiddetli"si (`severeUnreviewed`) bölgeyi çalıştıran harekete dikkat ekler.
 */
export const SEVERITY_DESCRIPTIONS: Record<Severity, string> = text('tr').severityDescriptions;

export const DIAGNOSIS_SOURCES = ['clinician', 'client'] as const;
export type DiagnosisSource = (typeof DIAGNOSIS_SOURCES)[number];
export const DIAGNOSIS_SOURCE_LABELS: Record<DiagnosisSource, string> = text('tr').diagnosisSources;

export const CLEARANCE_BASES = ['client_report', 'written_report'] as const;
export type ClearanceBasis = (typeof CLEARANCE_BASES)[number];
export const CLEARANCE_BASIS_LABELS: Record<ClearanceBasis, string> = text('tr').clearanceBases;

export const GRAFTS = ['hamstring', 'patellar_tendon', 'other'] as const;
export type Graft = (typeof GRAFTS)[number];
export const GRAFT_LABELS: Record<Graft, string> = text('tr').grafts;

export const STAGES = [1, 2, 3, 4] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABELS: Record<Stage, string> = text('tr').stages;

/** Danışanın "Neler zorluyor?" cevapları. */
export const TRIGGERS = ['squat', 'overhead', 'bend', 'jump', 'lean_back'] as const;
export type Trigger = (typeof TRIGGERS)[number];
export const TRIGGER_LABELS: Record<Trigger, string> = text('tr').triggers;

/** Bildirimin "Ne zamandan beri?" cevabı → başlangıç (yaklaşık). */
export const ONSET_CHOICES = ['week', 'month', 'months', 'longer'] as const;
export type OnsetChoice = (typeof ONSET_CHOICES)[number];
export const ONSET_CHOICE_LABELS: Record<OnsetChoice, string> = text('tr').onsetChoices;

/* --- kaçınılacak hareketler --- */

export const AVOID_TAG_IDS = [
  'deep_knee_flexion',
  'knee_end_extension_open',
  'deep_hip_flexion',
  'overhead',
  'abduction_external_rotation',
  'behind_body',
  'ir_under_load',
  'loaded_horizontal_adduction',
  'loaded_spinal_flexion',
  'spinal_flexion_rotation',
  'loaded_spinal_extension',
  'high_axial_load',
  'high_shear',
  'ballistic',
  'forward_bend',
] as const;
export type AvoidTagId = (typeof AVOID_TAG_IDS)[number];

/** Kaçınmanın okuduğu etiket (kütüphane testi ailedeki hareketlerin bunları taşıdığını denetler). */
export type AvoidReads = keyof ExerciseTags | 'pattern';

/** Dengeleyici kaslar yalnız el bileği ve dirsek ölçütünde okunur (tutuş; `regionWorked`). */
export type CareTags = ExerciseTags & { pattern?: MovementPattern | undefined; stabilizerMuscles?: readonly string[] | undefined };

export type AvoidTag = {
  /** PT'ye ("Kaçın: derin diz bükme"); Türkçe. Okuyanın dilinde `avoidLabels(locale)`. */
  label: string;
  /** PT'nin açık talimatı yasaktır; öne eğilme yalnız dikkat (Saraceni 2020). */
  decision: 'block' | 'warn';
  /** Etiket eksikse "dikkat" alan kalıplar (kalıp yedeği); boşsa yedek yok. */
  families: readonly MovementPattern[];
  reads: readonly AvoidReads[];
  match: (tags: CareTags) => boolean | null;
};

const alignment = (tags: CareTags, values: readonly string[]) =>
  tags.spinalAlignment === undefined ? null : values.includes(tags.spinalAlignment);

const AVOID_TR = text('tr').avoid;

export const AVOID_TAGS: Record<AvoidTagId, AvoidTag> = {
  deep_knee_flexion: {
    label: AVOID_TR.deep_knee_flexion,
    decision: 'block',
    families: ['squat', 'lunge'],
    reads: ['jointWindows'],
    match: (tags) => has(tags.jointWindows, 'knee_flexion_over_90'),
  },
  knee_end_extension_open: {
    label: AVOID_TR.knee_end_extension_open,
    decision: 'block',
    families: ['knee_extension'],
    reads: ['kineticChain', 'jointWindows'],
    match: (tags) => and(tags.kineticChain === undefined ? null : tags.kineticChain === 'open', has(tags.jointWindows, 'knee_terminal_extension_0_30')),
  },
  deep_hip_flexion: {
    label: AVOID_TR.deep_hip_flexion,
    decision: 'block',
    families: ['squat', 'lunge'],
    reads: ['jointWindows'],
    match: (tags) => has(tags.jointWindows, 'hip_flexion_over_90'),
  },
  overhead: {
    label: AVOID_TR.overhead,
    decision: 'block',
    families: ['vertical_push', 'vertical_pull'],
    reads: ['jointWindows'],
    match: (tags) => has(tags.jointWindows, 'shoulder_elevation_over_90'),
  },
  abduction_external_rotation: {
    label: AVOID_TR.abduction_external_rotation,
    decision: 'block',
    families: ['vertical_push', 'vertical_pull'],
    reads: ['jointWindows'],
    match: (tags) => has(tags.jointWindows, 'shoulder_abduction_90_end_range_er'),
  },
  behind_body: {
    label: AVOID_TR.behind_body,
    decision: 'block',
    families: ['vertical_push', 'horizontal_push'],
    reads: ['jointWindows'],
    match: (tags) => has(tags.jointWindows, 'glenohumeral_extension_beyond_neutral'),
  },
  ir_under_load: {
    label: AVOID_TR.ir_under_load,
    decision: 'block',
    families: [],
    reads: ['internalRotationUnderLoad'],
    // Etiket yalnız iç rotasyonlu harekette yazılır: etiketli harekette yoksa hayır.
    match: (tags) => (tags.internalRotationUnderLoad === true ? true : isTagged(tags) ? false : null),
  },
  loaded_horizontal_adduction: {
    label: AVOID_TR.loaded_horizontal_adduction,
    decision: 'block',
    families: ['horizontal_push', 'chest_fly'],
    reads: ['loadVector', 'resistanceProfile'],
    match: (tags) =>
      and(
        tags.loadVector === undefined ? null : tags.loadVector === 'horizontal_adduction',
        tags.resistanceProfile === undefined ? null : tags.resistanceProfile !== 'bodyweight',
      ),
  },
  loaded_spinal_flexion: {
    label: AVOID_TR.loaded_spinal_flexion,
    decision: 'block',
    families: ['hinge'],
    reads: ['spinalAlignment', 'axialLoading'],
    match: (tags) => and(alignment(tags, ['flexion']), loaded(tags)),
  },
  spinal_flexion_rotation: {
    label: AVOID_TR.spinal_flexion_rotation,
    decision: 'block',
    families: ['core_rotation'],
    reads: ['spinalAlignment'],
    match: (tags) => alignment(tags, ['flexion_with_rotation']),
  },
  loaded_spinal_extension: {
    label: AVOID_TR.loaded_spinal_extension,
    decision: 'block',
    families: ['hinge'],
    reads: ['spinalAlignment', 'axialLoading'],
    match: (tags) => and(alignment(tags, ['extension', 'extension_with_rotation']), loaded(tags)),
  },
  high_axial_load: {
    label: AVOID_TR.high_axial_load,
    decision: 'block',
    families: ['squat', 'hinge', 'lunge', 'vertical_push'],
    reads: ['axialLoading'],
    match: (tags) => (tags.axialLoading === undefined ? null : tags.axialLoading === 'high'),
  },
  high_shear: {
    label: AVOID_TR.high_shear,
    decision: 'block',
    families: ['hinge'],
    reads: ['shearForce'],
    match: (tags) => (tags.shearForce === undefined ? null : tags.shearForce === 'high'),
  },
  ballistic: {
    label: AVOID_TR.ballistic,
    decision: 'block',
    families: ['squat', 'lunge', 'hinge'],
    reads: ['contractionType'],
    match: (tags) => (tags.contractionType === undefined ? null : tags.contractionType === 'energy_storage_ballistic'),
  },
  forward_bend: {
    label: AVOID_TR.forward_bend,
    decision: 'warn',
    families: [],
    reads: ['pattern'],
    match: (tags) => (tags.pattern === undefined ? null : tags.pattern === 'hinge'),
  },
};

/** Danışanın zorlayanı → önerilen kaçınma (§2.2). */
export const TRIGGER_AVOID: Record<Trigger, AvoidTagId> = {
  squat: 'deep_knee_flexion',
  overhead: 'overhead',
  bend: 'forward_bend',
  jump: 'ballistic',
  lean_back: 'loaded_spinal_extension',
};

export function avoidFromTriggers(triggers: readonly Trigger[] | undefined): AvoidTagId[] {
  return [...new Set((triggers ?? []).map((trigger) => TRIGGER_AVOID[trigger]))].sort(
    (a, b) => AVOID_TAG_IDS.indexOf(a) - AVOID_TAG_IDS.indexOf(b),
  );
}

const KNEE_WINDOW = /^knee/;

/**
 * Bölge kapısı **[sentez]**: diz ve omuz kısıtının kaçınmaları yalnız o eklemi yükleyen harekete işler. Omuz
 * `touches()`; diz daha dar: diz penceresi ya da ön bacak (arka bacak kalça hareketinde de çalışır, yoksa
 * "Sol diz · kaçın: sıçrama" Kettlebell Swing'i yasaklardı). Kas ve pencere bilgisi yoksa bilinmiyor.
 */
export function regionGate(tags: CareTags, region: ConstraintRegion): boolean | null {
  if (region === 'shoulder') return touches(tags, 'shoulder');
  if (region !== 'knee') return true;
  const windows = tags.jointWindows;
  const muscles = [...(tags.primaryMuscles ?? []), ...(tags.secondaryMuscles ?? [])];
  if (windows?.some((window) => KNEE_WINDOW.test(window))) return true;
  if (muscles.includes('quadriceps')) return true;
  return windows === undefined && muscles.length === 0 ? null : false;
}

/** Kaçınma bu harekete işliyor mu (bölge kapısıyla, üç değerli). */
export function avoidMatch(tag: AvoidTagId, tags: CareTags, region: ConstraintRegion): boolean | null {
  return and(regionGate(tags, region), AVOID_TAGS[tag].match(tags));
}

/** Dirseği bükenler ve açanlar (hedef ya da yardımcı). */
const ELBOW_MOVERS: readonly string[] = ['biceps', 'triceps_long', 'triceps_lateral'];
/** Ön kol: el bileğini hareket ettirir, tutuşu taşır; ortak başlangıçları dirsekte (epikondiller). */
const FOREARM: readonly string[] = ['forearm_flexors', 'forearm_extensors'];
/** Kalçayı hareket ettirenler; arka bacak ve ön bacak (iki eklemli) sayılmaz: leg curl ve leg extension kalçayı oynatmaz. */
const HIP_MOVERS: readonly string[] = ['glutes', 'glute_medius', 'hip_flexors', 'adductors'];
const HIP_PATTERNS: readonly MovementPattern[] = ['hinge', 'hip_extension', 'hip_abduction', 'hip_adduction'];
/** Ayak bileğini hareket ettirenler (baldır, kaval önü). */
const ANKLE_MOVERS: readonly string[] = ['gastroc_medial', 'gastroc_lateral', 'soleus', 'tibialis'];
/** Ayak yerde, kaval kemiği ayağın üstünde öne gider (yük altında dorsifleksiyon) ya da yükle yürünür. */
const ANKLE_PATTERNS: readonly MovementPattern[] = ['squat', 'lunge', 'calf_raise', 'carry'];
/** Vücut ağırlığı ellerin üstünde: kapalı zincir itiş (şınav, dips). */
const HAND_BEARING_PATTERNS: readonly MovementPattern[] = ['horizontal_push', 'vertical_push'];
const KNEE_BEND_WINDOWS: readonly string[] = ['knee_flexion_45_90', 'knee_flexion_over_90'];

/**
 * "Bölgeyi çalıştıran" (§2.6): görüşü alınmamış kırmızı bayrakta ve danışanın bakılmamış "şiddetli"sinde
 * (`severeUnreviewed`) bu hareketler en az dikkat alır. Burada kuşkuda dikkat daha güvenli (bölge kapısından geniş),
 * ama her ölçüt etiketin açıkça söylediğine dayanır **[sentez]**:
 * - **diz, omuz:** `touches()` (eklemin pencereleri ya da kasları);
 * - **omurga (bel, sırt), boyun:** eksenel yük (`axialLoading ∉ {none}`);
 * - **dirsek:** dirseği büken ya da açan kas hedef/yardımcı, ya da ön kol herhangi bir düzeyde (tutuş, dengeleyici
 *   dahil: kütüphane ön kolu yalnız tutuşun belirgin olduğu harekette yazar; kavrama epikondil ağrısını zorlar);
 * - **el bileği:** ön kol herhangi bir düzeyde ya da vücut ağırlığı ellerin üstünde (kapalı zincir yatay/dikey itiş);
 *   elde taşınan yük (bench'te bar, dambıl pressleri) etiketlerde yok, sayılmaz;
 * - **kalça:** kalçayı hareket ettiren kas hedef/yardımcı, 90° üstü kalça bükme penceresi ya da kalça kalıbı
 *   (menteşe, kalça itişi, açma, kapama);
 * - **ayak bileği:** baldır ya da kaval önü hedef/yardımcı, squat/lunge/baldır/taşıma kalıbı ya da kapalı zincirde
 *   45° üstü diz bükme;
 * - **başka bir yer:** ölçüt yok (bölge adı bir eklem söylemez): hayır.
 * Kas, pencere ve kalıp bilgisi hiç yoksa bilinmiyor (null): dikkat üretilmez.
 */
export function regionWorked(tags: CareTags, region: ConstraintRegion): boolean | null {
  if (region === 'knee') return touches(tags, 'knee');
  if (region === 'shoulder') return touches(tags, 'shoulder');
  if (region === 'lower_back' || region === 'upper_back' || region === 'neck') {
    return tags.axialLoading === undefined ? null : tags.axialLoading !== 'none';
  }
  if (region === 'other') return false;
  const movers = [...(tags.primaryMuscles ?? []), ...(tags.secondaryMuscles ?? [])];
  const all = [...movers, ...(tags.stabilizerMuscles ?? [])];
  if (all.length === 0 && tags.pattern === undefined && tags.jointWindows === undefined) return null;
  const moves = (list: readonly string[]) => movers.some((muscle) => list.includes(muscle));
  const grips = all.some((muscle) => FOREARM.includes(muscle));
  const pattern = (list: readonly MovementPattern[]) => tags.pattern !== undefined && list.includes(tags.pattern);
  switch (region) {
    case 'elbow':
      return moves(ELBOW_MOVERS) || grips;
    case 'wrist_hand':
      return grips || (tags.kineticChain === 'closed' && pattern(HAND_BEARING_PATTERNS));
    case 'hip':
      return moves(HIP_MOVERS) || Boolean(tags.jointWindows?.includes('hip_flexion_over_90')) || pattern(HIP_PATTERNS);
    case 'ankle_foot':
      return (
        moves(ANKLE_MOVERS) ||
        pattern(ANKLE_PATTERNS) ||
        (tags.kineticChain === 'closed' && Boolean(tags.jointWindows?.some((window) => KNEE_BEND_WINDOWS.includes(window))))
      );
  }
}

/* --- sınırlar --- */

export const CONSTRAINT_LIMITS = {
  total: 30,
  active: 12,
  overrides: 100,
  log: 200,
  logText: 300,
  note: 500,
  clientNote: 140,
  reportNote: 280,
  scope: 140,
} as const;

/* --- durum --- */

/**
 * Kural ihlali, durum koduyla. `.message` Türkçe (kayıtlar ve testler); kullanıcıya giden metin
 * `messageOf(error, locale)` / `error.localized(locale)` ile okuyanın dilinde.
 */
export class ConstraintError extends Error implements Localizable {
  readonly status: number;
  readonly text: LocalizedText;
  constructor(message: string | LocalizedText, status: number) {
    const localized: LocalizedText = typeof message === 'string' ? () => message : message;
    super(localized(DEFAULT_LOCALE));
    this.status = status;
    this.text = localized;
  }

  localized(locale: Locale): string {
    return this.text(locale);
  }
}

type ErrorTexts = ReturnType<typeof text>['errors'];

/** Sözlükteki hata: `failure((e) => e.notFound, 404)`. */
function failure(pick: (errors: ErrorTexts) => string, status: number): ConstraintError {
  return new ConstraintError((locale) => pick(text(locale).errors), status);
}

/** Kısıtın sözlükteki tanısı ve gözlemi (niteleyicisiyle). */
export function conditionsOf(constraint: Pick<Constraint, 'conditionId' | 'findingId'>) {
  return [constraint.conditionId, constraint.findingId].flatMap((raw) => {
    const parsed = raw ? parseCondition(raw) : null;
    return parsed ? [parsed] : [];
  });
}

/** Danışanın henüz karar verilmemiş bildirimi. */
export function isPendingReport(constraint: Constraint): boolean {
  return constraint.source === 'client' && !constraint.confirmedAt && !constraint.declined && constraint.status === 'active';
}

/** Süzgece giren etkin kısıt: açık, reddedilmemiş, PT'nin ya da onaylanmış. */
export function isActive(constraint: Constraint): boolean {
  return constraint.status === 'active' && !constraint.declined && (constraint.source === 'pt' || Boolean(constraint.confirmedAt));
}

export function isRedFlag(constraint: Pick<Constraint, 'conditionId' | 'findingId'>): boolean {
  return conditionsOf(constraint).some((condition) => conditionInfo(condition.id).redFlag);
}

export function isEmergency(constraint: Pick<Constraint, 'conditionId'>): boolean {
  return constraint.conditionId ? parseCondition(constraint.conditionId)?.id === EMERGENCY_CONDITION_ID : false;
}

/** Görüşü alınmamış kırmızı bayrak (yönlendirilmiş olsa da). */
export function awaitsOpinion(constraint: Constraint): boolean {
  return isActive(constraint) && isRedFlag(constraint) && !constraint.clearance;
}

/**
 * Danışanın PT'nin henüz bakmadığı "şiddetli"si (güvenli yön hemen, §2.4) **[sentez]**: onaylı kısıtta "Kötüleşti ·
 * şiddetli" "Gördüm"e (ya da kapatmaya) kadar; karar bekleyen bildirimde şiddet "şiddetli"yse PT karar verene kadar.
 * Bu sürece bölgeyi çalıştıran hareket en az dikkat alır (`constraint-filter.ts`), Dikkat maddesi kırmızı ünlemle en
 * üste yakın durur (`attention.ts`). Arada "Düzeldi" demek bunu kaldırmaz: gevşeten yönü yalnız PT açar.
 */
export function severeUnreviewed(constraint: Constraint): boolean {
  if (isPendingReport(constraint)) return constraint.severity === 'severe';
  return isActive(constraint) && constraint.clientChange?.severity === 'severe';
}

/** Yasağına izin verilebilir mi: kırmızı bayrakta görüş alınmadan ve kauda ekinada hayır. */
export function overridable(constraint: Constraint): boolean {
  return !isEmergency(constraint) && !(isRedFlag(constraint) && !constraint.clearance);
}

/** Süzgece etkisi var mı: kaçınma, tanı ya da gözlem. Yoksa danışan "Antrenörün gördü" okur. */
export function hasFilterEffect(constraint: Pick<Constraint, 'avoid' | 'conditionId' | 'findingId'>): boolean {
  return constraint.avoid.length > 0 || Boolean(constraint.conditionId) || Boolean(constraint.findingId);
}

/* --- metinler --- */

/** Taraf yalnız çift bölgede okunur. */
function placeOf(constraint: Pick<Constraint, 'region' | 'side'>): { region: ConstraintRegion; side?: ConstraintSide } {
  return constraint.side && isPaired(constraint.region) ? { region: constraint.region, side: constraint.side } : { region: constraint.region };
}

/** "Sol diz", "Bel", "İki omuz". */
export function regionText(constraint: Pick<Constraint, 'region' | 'side'>, locale: Locale = DEFAULT_LOCALE): string {
  const t = text(locale);
  const { region, side } = placeOf(constraint);
  return side ? t.regionWithSide(side, region) : t.regions[region];
}

/** Danışana ikinci tekil: "sol dizin" (için), "sol dizini" (düşünerek), "sol dizine" (uygun). */
export function yourRegion(constraint: Pick<Constraint, 'region' | 'side'>, form: 'gen' | 'acc' | 'dat', locale: Locale = DEFAULT_LOCALE): string {
  return text(locale).yourRegion(placeOf(constraint), form);
}

/** PT'nin başlığı: "Sol diz · Patellofemoral ağrı (şiddetli)"; tanı yoksa gözlem, o da yoksa tür. */
export function constraintTitle(constraint: Constraint, locale: Locale = DEFAULT_LOCALE): string {
  const [first] = conditionsOf(constraint);
  return `${regionText(constraint, locale)} · ${first ? conditionLabel(first, locale) : text(locale).types[constraint.type]}`;
}

/** Başlangıç: "2024", "Ağu 2026", "12 Eylül 2026"; yaklaşıksa önünde "yaklaşık". */
export function onsetText(onset: string | undefined, approx?: boolean, locale: Locale = DEFAULT_LOCALE): string | null {
  if (!onset) return null;
  const date =
    onset.length === 4
      ? onset
      : onset.length === 7
        ? new Intl.DateTimeFormat(intlLocale(locale), { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${onset}-01T00:00:00Z`))
        : getFormat(locale).day(onset);
  return approx ? text(locale).approxOnset(date) : date;
}

/** Kartın ikinci satırı: "Rahatsızlık · orta · başlangıç Ağu 2026". */
export function constraintMeta(constraint: Pick<Constraint, 'type' | 'severity' | 'onset' | 'onsetApprox'>, locale: Locale = DEFAULT_LOCALE): string {
  const t = text(locale);
  return t.meta(t.types[constraint.type], constraint.severity ? t.severities[constraint.severity] : null, onsetText(constraint.onset, constraint.onsetApprox, locale));
}

export function avoidText(avoid: readonly AvoidTagId[], locale: Locale = DEFAULT_LOCALE): string {
  const t = text(locale);
  return t.inlineList(avoid.map((tag) => t.avoid[tag]));
}

export function triggersText(triggers: readonly Trigger[] | undefined, locale: Locale = DEFAULT_LOCALE): string {
  const t = text(locale);
  return t.inlineList((triggers ?? []).map((trigger) => t.triggers[trigger]));
}

/**
 * Danışanın göreceği tanı adı (§5.2): yalnız hekim/fizyoterapist kaynaklı, tanı türünde, niteleyicisiz temel ad.
 * Gözlem hiç görünmez.
 */
export function clientDiagnosis(constraint: Pick<Constraint, 'conditionId' | 'diagnosisSource'>, locale: Locale = DEFAULT_LOCALE): string | null {
  if (!constraint.conditionId || constraint.diagnosisSource !== 'clinician') return null;
  const parsed = parseCondition(constraint.conditionId);
  return parsed ? clientSafeLabel(parsed.id, locale) : null;
}

/* --- tanı seçicisi --- */

/** Bölgeye ve türe göre sözlük kimlikleri (emekli kimlikler hiç çıkmaz; kauda ekina bel, sırt ve "başka yer"de). */
export function conditionsForRegion(region: ConstraintRegion | null, kind: ConditionKind): ConditionId[] {
  const regions = region ? REGION_CONDITION_REGIONS[region] : null;
  return CONDITION_IDS.filter((id) => {
    if (RETIRED_CONDITION_IDS.has(id) || conditionKind(id) !== kind) return false;
    if (!regions) return true;
    if (id === EMERGENCY_CONDITION_ID) return region === 'lower_back' || region === 'upper_back' || region === 'other';
    return regions.includes(conditionInfo(id).region);
  });
}

/** Tanı ameliyat tarihi, greft ya da evre istiyor mu (formda alan göstermek için). */
export function detailFields(conditionId: string | undefined): { surgery: boolean; graft: boolean; stage: boolean } {
  const parsed = conditionId ? parseCondition(conditionId) : null;
  if (!parsed) return { surgery: false, graft: false, stage: false };
  const postOp = parsed.id === 'acl_reconstruction_early' || parsed.id === 'meniscus_repair_postop' || parsed.qualifier === 'postop';
  return { surgery: postOp, graft: parsed.id === 'acl_reconstruction_early', stage: parsed.id === 'patellar_tendinopathy' };
}

/* --- kayıt: okuma ve eski biçim --- */

const LEGACY_AT = '1970-01-01T00:00:00.000Z';

const LEGACY_REGION: Record<ConditionRegion, ConstraintRegion> = {
  spine: 'lower_back',
  neck: 'neck',
  shoulder: 'shoulder',
  elbow: 'elbow',
  wrist: 'wrist_hand',
  hip: 'hip',
  knee: 'knee',
  ankle: 'ankle_foot',
  systemic: 'other',
};

function legacyId(index: number): string {
  return `k_old${index.toString(36).padStart(3, '0')}`;
}

/**
 * Kaydın kısıtları. Yeni biçimde `constraints`; yoksa eski `conditions: string[]` her kimlik bir kısıta çevrilir
 * (§5.4): PT'nin, onaylı, bölge sözlükten (çift bölgede iki taraf), tanının kaynağı danışanın beyanı, bulgu
 * türündekiler gözlem. Tek ameliyatlı tanı varsa üst düzeydeki `surgeryDate` onun ayrıntısına taşınır.
 */
export function constraintsOf(record: Pick<HealthRecord, 'constraints' | 'conditions' | 'surgeryDate'>): Constraint[] {
  if (record.constraints) return record.constraints;
  const legacy = (record.conditions ?? []).flatMap((raw) => {
    const parsed = parseCondition(raw);
    return parsed ? [{ raw, parsed }] : [];
  });
  const postOps = legacy.filter(({ raw }) => detailFields(raw).surgery);
  return legacy.map(({ raw, parsed }, index): Constraint => {
    const info = conditionInfo(parsed.id);
    const region = LEGACY_REGION[info.region];
    const finding = conditionKind(parsed.id) === 'finding';
    const surgery = record.surgeryDate && postOps.length === 1 && postOps[0]?.raw === raw ? { details: { surgeryDate: record.surgeryDate } } : {};
    return {
      id: legacyId(index),
      region,
      ...(isPaired(region) ? { side: 'both' as const } : {}),
      type: 'condition',
      ...(finding ? { findingId: raw } : { conditionId: raw, diagnosisSource: 'client' as const }),
      ...surgery,
      avoid: [],
      status: 'active',
      source: 'pt',
      confirmedAt: LEGACY_AT,
      createdAt: LEGACY_AT,
      updatedAt: LEGACY_AT,
    };
  });
}

export function overridesOf(record: Pick<HealthRecord, 'overrides'>): Override[] {
  return record.overrides ?? [];
}

export function constraintLogOf(record: Pick<HealthRecord, 'constraintLog'>): ConstraintLogEntry[] {
  return record.constraintLog ?? [];
}

/** Kısıt yazımından önce kaydı yeni biçime getirir: eski `conditions` ve `surgeryDate` düşer. */
export function withConstraintsMigrated(record: HealthRecord): HealthRecord {
  const { conditions: _conditions, surgeryDate: _surgery, ...rest } = record;
  return { ...rest, version: 2, constraints: constraintsOf(record) };
}

export function activeConstraints(record: Pick<HealthRecord, 'constraints' | 'conditions' | 'surgeryDate'>): Constraint[] {
  return constraintsOf(record).filter(isActive);
}

export function pendingReports(record: Pick<HealthRecord, 'constraints' | 'conditions' | 'surgeryDate'>): Constraint[] {
  return constraintsOf(record).filter(isPendingReport);
}

/* --- kayıt satırları --- */

export type LogKind = ConstraintLogEntry['kind'];

export function appendConstraintLog(record: HealthRecord, entry: ConstraintLogEntry): HealthRecord {
  const text = entry.text.length > CONSTRAINT_LIMITS.logText ? `${entry.text.slice(0, CONSTRAINT_LIMITS.logText - 1)}…` : entry.text;
  return { ...record, constraintLog: [{ ...entry, text }, ...constraintLogOf(record)].slice(0, CONSTRAINT_LIMITS.log) };
}

/* --- eylemler --- */

/** PT'nin formu (ekle / düzenle / onayla ve düzenle): sunucu şemadan geçirip verir. */
export type ConstraintInput = {
  region: ConstraintRegion;
  side?: ConstraintSide | undefined;
  type: ConstraintType;
  conditionId?: string | undefined;
  diagnosisSource?: DiagnosisSource | undefined;
  findingId?: string | undefined;
  details?: { surgeryDate?: string | undefined; graft?: Graft | undefined; stage?: Stage | undefined } | undefined;
  severity?: Severity | undefined;
  onset?: string | undefined;
  onsetApprox?: boolean | undefined;
  avoid: AvoidTagId[];
  note?: string | undefined;
  clientNote?: string | undefined;
};

/** Danışanın bildirimi. */
export type ReportInput = {
  region: ConstraintRegion;
  side?: ConstraintSide | undefined;
  type: ConstraintType;
  severity: Severity;
  since?: OnsetChoice | undefined;
  triggers: Trigger[];
  note?: string | undefined;
};

type Actor = 'pt' | 'client';

function findConstraint(record: HealthRecord, id: string): { list: Constraint[]; index: number; constraint: Constraint } {
  const list = constraintsOf(record);
  const index = list.findIndex((item) => item.id === id);
  const constraint = list[index];
  if (!constraint) throw failure((e) => e.notFound, 404);
  return { list, index, constraint };
}

function checkBase(constraint: Constraint, baseUpdatedAt: string | undefined): void {
  if (baseUpdatedAt !== undefined && baseUpdatedAt !== constraint.updatedAt) {
    throw failure((e) => e.changed, 412);
  }
}

function replaceAt(record: HealthRecord, list: Constraint[], index: number, next: Constraint): HealthRecord {
  return { ...record, constraints: list.map((item, position) => (position === index ? next : item)) };
}

function log(record: HealthRecord, at: string, by: Actor, id: string, kind: LogKind, line: string): HealthRecord {
  return appendConstraintLog(record, { at, by, id, kind, text: line });
}

/** Kayıt satırlarının metni: satır saklanır, yazanın dilinde (`ctx.locale`; yoksa Türkçe). */
function logText(locale: Locale | undefined) {
  return text(locale ?? DEFAULT_LOCALE).log;
}

function withoutEmpty<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== '')) as T;
}

/**
 * Formdan gelen alanları kısıta uygular: taraf yalnız çift bölgede; tanının kaynağı yalnız tanıyla; ayrıntılar
 * yalnız ilgili tanıda. Tutarlılık hatası 400.
 */
function applyInput(base: Omit<Constraint, keyof ConstraintInput>, input: ConstraintInput): Constraint {
  if (isPaired(input.region) && !input.side) throw failure((e) => e.side, 400);
  const condition = input.conditionId ? parseCondition(input.conditionId) : null;
  if (input.conditionId && (!condition || conditionKind(condition.id) !== 'diagnosis')) throw failure((e) => e.diagnosisUnknown, 400);
  if (condition && !input.diagnosisSource) throw failure((e) => e.diagnosisSource, 400);
  const finding = input.findingId ? parseCondition(input.findingId) : null;
  if (input.findingId && (!finding || conditionKind(finding.id) !== 'finding')) throw failure((e) => e.findingUnknown, 400);
  const wanted = detailFields(input.conditionId);
  const details = withoutEmpty({
    surgeryDate: wanted.surgery ? input.details?.surgeryDate : undefined,
    graft: wanted.graft ? input.details?.graft : undefined,
    stage: wanted.stage ? input.details?.stage : undefined,
  });
  return withoutEmpty({
    ...base,
    region: input.region,
    side: isPaired(input.region) ? input.side : undefined,
    type: input.type,
    conditionId: input.conditionId || undefined,
    diagnosisSource: condition ? input.diagnosisSource : undefined,
    findingId: input.findingId || undefined,
    details: Object.keys(details).length > 0 ? details : undefined,
    severity: input.severity,
    onset: input.onset || undefined,
    onsetApprox: input.onset && input.onsetApprox ? true : undefined,
    avoid: [...new Set(input.avoid)].sort((a, b) => AVOID_TAG_IDS.indexOf(a) - AVOID_TAG_IDS.indexOf(b)),
    note: input.note?.trim() || undefined,
    clientNote: input.clientNote?.trim() || undefined,
  }) as Constraint;
}

function checkLimits(list: readonly Constraint[]): void {
  if (list.length > CONSTRAINT_LIMITS.total) throw failure((e) => e.tooMany(CONSTRAINT_LIMITS.total), 409);
  if (list.filter((item) => item.status === 'active' && !item.declined).length > CONSTRAINT_LIMITS.active) {
    throw failure((e) => e.tooManyActive(CONSTRAINT_LIMITS.active), 409);
  }
}

/** Kısıt kimliği: `k_` + 6 küçük harf/rakam; çağıran üretir (sunucuda rastgele). */
export const CONSTRAINT_ID_PATTERN = /^k_[a-z0-9]{6}$/;

/** PT kısıt ekler (onaylı). */
export function addConstraint(
  record: HealthRecord,
  input: ConstraintInput & { origin?: 'screening' | undefined },
  ctx: { id: string; now: string; /** Kayıt satırının dili; yoksa Türkçe. */ locale?: Locale },
): HealthRecord {
  const list = constraintsOf(record);
  if (list.some((item) => item.id === ctx.id)) throw failure((e) => e.idConflict, 409);
  const constraint = applyInput(
    withoutEmpty({ id: ctx.id, status: 'active' as const, source: 'pt' as const, confirmedAt: ctx.now, origin: input.origin, createdAt: ctx.now, updatedAt: ctx.now }),
    input,
  );
  const next = [...list, constraint];
  checkLimits(next);
  const t = logText(ctx.locale);
  const avoid = constraint.avoid.length > 0 ? t.avoidSuffix(avoidText(constraint.avoid, ctx.locale)) : '';
  return log({ ...record, constraints: next }, ctx.now, 'pt', ctx.id, 'added', t.added(regionText(constraint, ctx.locale), avoid));
}

/** Alan alan ne değişti (kayıt satırı için); değişiklik yoksa boş. */
function changeText(before: Constraint, after: Constraint, locale: Locale = DEFAULT_LOCALE): string[] {
  const t = text(locale);
  const c = t.log.changes;
  const parts: string[] = [];
  if (before.region !== after.region || before.side !== after.side) parts.push(c.region(regionText(after, locale)));
  if (before.type !== after.type) parts.push(c.type(t.types[after.type]));
  if (before.severity !== after.severity) {
    parts.push(c.severity(before.severity ? t.severities[before.severity] : null, after.severity ? t.severities[after.severity] : null));
  }
  if (before.conditionId !== after.conditionId) parts.push(after.conditionId ? c.diagnosisChanged : c.diagnosisRemoved);
  if (before.findingId !== after.findingId) parts.push(after.findingId ? c.findingChanged : c.findingRemoved);
  if (before.avoid.join() !== after.avoid.join()) parts.push(after.avoid.length > 0 ? c.avoid(avoidText(after.avoid, locale)) : c.noAvoid);
  if (before.clientNote !== after.clientNote) parts.push(c.clientNote);
  if (before.note !== after.note) parts.push(c.note);
  if (JSON.stringify(before.details ?? {}) !== JSON.stringify(after.details ?? {})) parts.push(c.details);
  if (before.onset !== after.onset) parts.push(c.onset);
  return parts;
}

/** PT kısıtı düzenler. Danışanın bekleyen bildirimi düzenlenince onaylanmış olur ("Onayla ve düzenle"). */
export function editConstraint(
  record: HealthRecord,
  id: string,
  input: ConstraintInput,
  ctx: { now: string; baseUpdatedAt?: string | undefined; locale?: Locale },
): HealthRecord {
  const { list, index, constraint } = findConstraint(record, id);
  checkBase(constraint, ctx.baseUpdatedAt);
  const confirming = isPendingReport(constraint);
  const { region: _r, side: _s, type: _t, conditionId: _c, diagnosisSource: _d, findingId: _f, details: _dt, severity: _sv, onset: _o, onsetApprox: _oa, avoid: _a, note: _n, clientNote: _cn, ...base } = constraint;
  const next = applyInput({ ...base, ...(confirming ? { confirmedAt: ctx.now } : {}), updatedAt: ctx.now }, input);
  const changes = changeText(constraint, next, ctx.locale);
  if (!confirming && changes.length === 0) return record;
  const updated = replaceAt(record, list, index, next);
  checkLimits(constraintsOf(updated));
  const t = logText(ctx.locale);
  const region = regionText(next, ctx.locale);
  const line = confirming
    ? t.confirmed(region, next.avoid.length > 0 ? t.avoidSuffix(avoidText(next.avoid, ctx.locale)) : '')
    : t.edited(region, changes);
  return log(updated, ctx.now, 'pt', id, confirming ? 'confirmed' : 'edited', line);
}

/**
 * "Olduğu gibi onayla": danışanın zorlayanları eşlenen kaçınmalara çevrilir (öncekilerle birleşir). Zorlayan
 * yoksa kısıt süzgeçsiz kaydedilir ("Kaydet (süzgeçsiz)"; danışan "Antrenörün gördü" okur).
 */
export function confirmAsIs(
  record: HealthRecord,
  id: string,
  ctx: { now: string; baseUpdatedAt?: string | undefined; locale?: Locale },
): HealthRecord {
  const { list, index, constraint } = findConstraint(record, id);
  checkBase(constraint, ctx.baseUpdatedAt);
  if (!isPendingReport(constraint)) throw failure((e) => e.decided, 409);
  const avoid = [...new Set([...constraint.avoid, ...avoidFromTriggers(constraint.triggers)])].sort(
    (a, b) => AVOID_TAG_IDS.indexOf(a) - AVOID_TAG_IDS.indexOf(b),
  );
  const next: Constraint = { ...constraint, avoid, confirmedAt: ctx.now, updatedAt: ctx.now };
  const updated = replaceAt(record, list, index, next);
  checkLimits(constraintsOf(updated));
  const t = logText(ctx.locale);
  const region = regionText(next, ctx.locale);
  const line = avoid.length > 0 ? t.confirmed(region, t.avoidSuffix(avoidText(avoid, ctx.locale))) : t.seenUnfiltered(region);
  return log(updated, ctx.now, 'pt', id, 'confirmed', line);
}

/** "Kaydetmeden kapat": bildirim kısıt olmadan kapanır; danışan notu görür. */
export function declineReport(
  record: HealthRecord,
  id: string,
  ctx: { now: string; note?: string | undefined; baseUpdatedAt?: string | undefined; locale?: Locale },
): HealthRecord {
  const { list, index, constraint } = findConstraint(record, id);
  checkBase(constraint, ctx.baseUpdatedAt);
  if (!isPendingReport(constraint)) throw failure((e) => e.decided, 409);
  const note = ctx.note?.trim();
  const next: Constraint = { ...constraint, declined: { at: ctx.now, ...(note ? { note } : {}) }, updatedAt: ctx.now };
  return log(replaceAt(record, list, index, next), ctx.now, 'pt', id, 'declined', logText(ctx.locale).declined(regionText(next, ctx.locale)));
}

export function resolveConstraint(
  record: HealthRecord,
  id: string,
  ctx: { now: string; baseUpdatedAt?: string | undefined; locale?: Locale },
): HealthRecord {
  const { list, index, constraint } = findConstraint(record, id);
  checkBase(constraint, ctx.baseUpdatedAt);
  if (constraint.status === 'resolved') return record;
  const { clientChange: _change, ...rest } = constraint;
  const next: Constraint = { ...rest, status: 'resolved', resolvedAt: ctx.now, updatedAt: ctx.now };
  return log(replaceAt(record, list, index, next), ctx.now, 'pt', id, 'resolved', logText(ctx.locale).resolved(regionText(next, ctx.locale)));
}

export function reopenConstraint(
  record: HealthRecord,
  id: string,
  ctx: { now: string; baseUpdatedAt?: string | undefined; locale?: Locale },
): HealthRecord {
  const { list, index, constraint } = findConstraint(record, id);
  checkBase(constraint, ctx.baseUpdatedAt);
  if (constraint.status === 'active' && !constraint.declined) return record;
  const { resolvedAt: _resolved, declined: _declined, ...rest } = constraint;
  // Reddedilmiş bildirim yeniden açılınca PT'nin kaydı olur (karar verildi).
  const next: Constraint = { ...rest, status: 'active', ...(constraint.declined ? { confirmedAt: ctx.now } : {}), updatedAt: ctx.now };
  const updated = replaceAt(record, list, index, next);
  checkLimits(constraintsOf(updated));
  return log(updated, ctx.now, 'pt', id, 'reopened', logText(ctx.locale).reopened(regionText(next, ctx.locale)));
}

/** Danışanın güncellemesini gördü; `close` ile "düzeldi" diyen kısıtı kapatır. */
export function ackClientChange(
  record: HealthRecord,
  id: string,
  ctx: { now: string; close?: boolean | undefined; baseUpdatedAt?: string | undefined; locale?: Locale },
): HealthRecord {
  const { list, index, constraint } = findConstraint(record, id);
  checkBase(constraint, ctx.baseUpdatedAt);
  if (!constraint.clientChange) return record;
  const { clientChange: _change, ...rest } = constraint;
  if (ctx.close) {
    const next: Constraint = { ...rest, status: 'resolved', resolvedAt: ctx.now, updatedAt: ctx.now };
    return log(replaceAt(record, list, index, next), ctx.now, 'pt', id, 'resolved', logText(ctx.locale).resolvedByClient(regionText(next, ctx.locale)));
  }
  const next: Constraint = { ...rest, updatedAt: ctx.now };
  return replaceAt(record, list, index, next);
}

/** "Sağlık profesyoneline yönlendirdim" (tarih). */
export function referConstraint(
  record: HealthRecord,
  id: string,
  ctx: { now: string; date: string; baseUpdatedAt?: string | undefined; locale?: Locale },
): HealthRecord {
  const { list, index, constraint } = findConstraint(record, id);
  checkBase(constraint, ctx.baseUpdatedAt);
  if (!isRedFlag(constraint)) throw failure((e) => e.referRedFlagOnly, 409);
  const next: Constraint = { ...constraint, referredAt: ctx.date, updatedAt: ctx.now };
  return log(replaceAt(record, list, index, next), ctx.now, 'pt', id, 'referred', logText(ctx.locale).referred(regionText(next, ctx.locale)));
}

/** "Görüş alındı": tarih, dayanak, kısa kapsam. Kauda ekinada görüş yasağı kaldırmaz ama kaydedilir. */
export function clearConstraint(
  record: HealthRecord,
  id: string,
  ctx: { now: string; date: string; basis: ClearanceBasis; scope?: string | undefined; baseUpdatedAt?: string | undefined; locale?: Locale },
): HealthRecord {
  const { list, index, constraint } = findConstraint(record, id);
  checkBase(constraint, ctx.baseUpdatedAt);
  if (!isRedFlag(constraint)) throw failure((e) => e.clearRedFlagOnly, 409);
  const scope = ctx.scope?.trim();
  const next: Constraint = {
    ...constraint,
    referredAt: constraint.referredAt ?? ctx.date,
    clearance: { at: ctx.date, basis: ctx.basis, ...(scope ? { scope } : {}) },
    updatedAt: ctx.now,
  };
  const t = text(ctx.locale ?? DEFAULT_LOCALE);
  return log(replaceAt(record, list, index, next), ctx.now, 'pt', id, 'cleared', t.log.cleared(regionText(next, ctx.locale), t.clearanceBases[ctx.basis]));
}

/** Yanlış kaydı çıkarır; izinleri de. */
export function removeConstraint(record: HealthRecord, id: string, ctx: { now: string; by?: Actor; locale?: Locale }): HealthRecord {
  const { constraint } = findConstraint(record, id);
  const next: HealthRecord = {
    ...record,
    constraints: constraintsOf(record).filter((item) => item.id !== id),
    overrides: overridesOf(record).filter((item) => item.source !== id),
  };
  return log(next, ctx.now, ctx.by ?? 'pt', id, 'removed', logText(ctx.locale).removed(regionText(constraint, ctx.locale)));
}

/** Danışana özel izin ("Yine de ekle", "İzin ver"). */
export function addOverride(
  record: HealthRecord,
  input: { exerciseId: string; source: string; note?: string | undefined },
  ctx: { now: string; title: string; locale?: Locale },
): HealthRecord {
  const { constraint } = findConstraint(record, input.source);
  if (!isActive(constraint)) throw failure((e) => e.overrideInactive, 409);
  if (!overridable(constraint)) {
    throw failure((e) => (isEmergency(constraint) ? e.overrideEmergency : e.overrideAwaiting), 409);
  }
  const list = overridesOf(record).filter((item) => !(item.exerciseId === input.exerciseId && item.source === input.source));
  const note = input.note?.trim();
  const next = [...list, { exerciseId: input.exerciseId, source: input.source, at: ctx.now, ...(note ? { note } : {}) }];
  if (next.length > CONSTRAINT_LIMITS.overrides) throw failure((e) => e.tooManyOverrides(CONSTRAINT_LIMITS.overrides), 409);
  return log({ ...record, overrides: next }, ctx.now, 'pt', input.source, 'override_added', logText(ctx.locale).overrideAdded(regionText(constraint, ctx.locale), ctx.title));
}

export function removeOverride(
  record: HealthRecord,
  input: { exerciseId: string; source: string },
  ctx: { now: string; title: string; locale?: Locale },
): HealthRecord {
  const list = overridesOf(record);
  const kept = list.filter((item) => !(item.exerciseId === input.exerciseId && item.source === input.source));
  if (kept.length === list.length) throw failure((e) => e.overrideNotFound, 404);
  const constraint = constraintsOf(record).find((item) => item.id === input.source);
  const where = constraint ? regionText(constraint, ctx.locale) : text(ctx.locale ?? DEFAULT_LOCALE).fallbackName;
  return log({ ...record, overrides: kept }, ctx.now, 'pt', input.source, 'override_removed', logText(ctx.locale).overrideRemoved(where, ctx.title));
}

/* --- danışanın eylemleri --- */

function addMonths(date: string, months: number): string {
  const [y, m] = date.split('-').map(Number);
  const total = (y ?? 1970) * 12 + ((m ?? 1) - 1) + months;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** "Ne zamandan beri?" → yaklaşık başlangıç: bu hafta ve bu ay bugünün ayı, 1–6 ay üç ay önce, daha uzun geçen yıl. */
export function onsetFromChoice(choice: OnsetChoice | undefined, today: string): { onset?: string; onsetApprox?: true } {
  if (!choice) return {};
  if (choice === 'week') return { onset: today, onsetApprox: true };
  if (choice === 'month') return { onset: today.slice(0, 7), onsetApprox: true };
  if (choice === 'months') return { onset: addMonths(today, -3), onsetApprox: true };
  return { onset: String(Number(today.slice(0, 4)) - 1), onsetApprox: true };
}

function reportFields(input: ReportInput, today: string) {
  if (isPaired(input.region) && !input.side) throw failure((e) => e.reportSide, 400);
  const note = input.note?.trim();
  const triggers = [...new Set(input.triggers)].sort((a, b) => TRIGGERS.indexOf(a) - TRIGGERS.indexOf(b));
  return withoutEmpty({
    region: input.region,
    side: isPaired(input.region) ? input.side : undefined,
    type: input.type,
    severity: input.severity,
    ...onsetFromChoice(input.since, today),
    triggers: triggers.length > 0 ? triggers : undefined,
    reportNote: note || undefined,
  });
}

/** Danışan yeni bir şey bildirir. */
export function reportConstraint(
  record: HealthRecord,
  input: ReportInput,
  ctx: { id: string; now: string; today: string; /** Geçmiş cümlesinin dili; yoksa Türkçe. */ locale?: Locale },
): HealthRecord {
  const list = constraintsOf(record);
  if (list.some((item) => item.id === ctx.id)) throw failure((e) => e.idConflict, 409);
  if (list.filter(isPendingReport).length >= 5) throw failure((e) => e.tooManyReports(5), 409);
  const constraint = { id: ctx.id, ...reportFields(input, ctx.today), avoid: [], status: 'active', source: 'client', createdAt: ctx.now, updatedAt: ctx.now } as Constraint;
  const next = [...list, constraint];
  checkLimits(next);
  const t = text(ctx.locale ?? DEFAULT_LOCALE);
  const severity = constraint.severity ? t.severities[constraint.severity] : null;
  return log({ ...record, constraints: next }, ctx.now, 'client', ctx.id, 'reported', t.log.reported(regionText(constraint, ctx.locale), severity));
}

function ownPending(record: HealthRecord, id: string) {
  const found = findConstraint(record, id);
  if (!isPendingReport(found.constraint)) throw failure((e) => e.reviewed, 409);
  return found;
}

/** Danışan bekleyen bildirimini düzeltir. */
export function editReport(record: HealthRecord, id: string, input: ReportInput, ctx: { now: string; today: string; locale?: Locale }): HealthRecord {
  const { list, index, constraint } = ownPending(record, id);
  const { region: _r, side: _s, type: _t, severity: _sv, onset: _o, onsetApprox: _oa, triggers: _tr, reportNote: _rn, ...base } = constraint;
  const next = { ...base, ...reportFields(input, ctx.today), updatedAt: ctx.now } as Constraint;
  return log(replaceAt(record, list, index, next), ctx.now, 'client', id, 'edited', logText(ctx.locale).reportEdited(regionText(next, ctx.locale)));
}

/** Danışan bekleyen bildirimini geri çeker (kayıttan çıkar; satır kalır). */
export function withdrawReport(record: HealthRecord, id: string, ctx: { now: string; locale?: Locale }): HealthRecord {
  const { constraint } = ownPending(record, id);
  const next: HealthRecord = { ...record, constraints: constraintsOf(record).filter((item) => item.id !== id) };
  return log(next, ctx.now, 'client', id, 'withdrawn', logText(ctx.locale).withdrawn(regionText(constraint, ctx.locale)));
}

const SEVERITY_RANK: Record<Severity, number> = { mild: 1, moderate: 2, severe: 3 };

/**
 * "Kötüleşti" (güvenli yön, hemen yazılır): şiddet görünür, PT'nin Dikkat maddesi doğar. Şiddet yalnız artar. PT
 * bakmadan ikinci kez kötüleşirse başlangıç ilk bakılmamış şiddettir ("hafif → şiddetli", aradaki "orta" değil).
 */
export function reportWorse(record: HealthRecord, id: string, severity: Severity, ctx: { now: string; locale?: Locale }): HealthRecord {
  const { list, index, constraint } = findConstraint(record, id);
  if (!isActive(constraint)) throw failure((e) => e.inactive, 409);
  const before = constraint.severity;
  if (before && SEVERITY_RANK[severity] <= SEVERITY_RANK[before]) throw failure((e) => e.severityNotHigher, 400);
  const pending = constraint.clientChange && !constraint.clientChange.resolved ? constraint.clientChange : null;
  const origin = pending ? pending.previousSeverity : before;
  const next: Constraint = {
    ...constraint,
    severity,
    clientChange: { at: ctx.now, severity, ...(origin ? { previousSeverity: origin } : {}) },
    updatedAt: ctx.now,
  };
  const t = text(ctx.locale ?? DEFAULT_LOCALE);
  const line = t.log.worsened(regionText(next, ctx.locale), before ? t.severities[before] : null, t.severities[severity]);
  return log(replaceAt(record, list, index, next), ctx.now, 'client', id, 'worsened', line);
}

/**
 * "Düzeldi": kısıt PT onaylayana kadar kapanmaz (gevşeten yön). PT'nin bakmadığı bir kötüleşme varsa şiddeti
 * güncellemede kalır: "şiddetli"nin dikkati "Düzeldi" ile değil PT'nin kararıyla kalkar (`severeUnreviewed`).
 */
export function reportBetter(record: HealthRecord, id: string, ctx: { now: string; locale?: Locale }): HealthRecord {
  const { list, index, constraint } = findConstraint(record, id);
  if (!isActive(constraint)) throw failure((e) => e.inactive, 409);
  const worse = constraint.clientChange?.severity ? constraint.clientChange : null;
  const carried = worse ? { severity: worse.severity, ...(worse.previousSeverity ? { previousSeverity: worse.previousSeverity } : {}) } : {};
  const next: Constraint = { ...constraint, clientChange: { at: ctx.now, resolved: true, ...carried }, updatedAt: ctx.now };
  return log(replaceAt(record, list, index, next), ctx.now, 'client', id, 'improved', logText(ctx.locale).improved(regionText(next, ctx.locale)));
}

/* --- danışanın görünümü --- */

export type ClientConstraintState = 'pending' | 'confirmed' | 'seen' | 'declined' | 'resolved';

export type ClientConstraintView = {
  id: string;
  region: ConstraintRegion;
  side?: ConstraintSide;
  title: string;
  type: string;
  severity?: Severity;
  diagnosis: string | null;
  clientNote?: string;
  reportNote?: string;
  state: ClientConstraintState;
  /** Kararın ya da bildirimin anı. */
  at: string;
  declinedNote?: string;
  /** Danışanın bekleyen güncellemesi ("Düzeldi dedin, antrenörün bakacak"). */
  change?: 'worse' | 'better';
  triggers?: Trigger[];
  since?: OnsetChoice;
  /** Bekleyen bildirimde düzeltme formunu doldurmak için. */
  typeId: ConstraintType;
};

/**
 * Danışanın Sağlık sayfasındaki kısıtları (§5.2): bölge · taraf · tür · şiddet · antrenörün notu; tanı adı yalnız
 * hekim kaynaklı ve niteleyicisiz; gözlem ve PT'nin notu hiç yok.
 */
export function clientConstraintView(constraint: Constraint, locale: Locale = DEFAULT_LOCALE): ClientConstraintView {
  const state: ClientConstraintState = constraint.declined
    ? 'declined'
    : constraint.status === 'resolved'
      ? 'resolved'
      : isPendingReport(constraint)
        ? 'pending'
        : hasFilterEffect(constraint)
          ? 'confirmed'
          : 'seen';
  const at = constraint.declined?.at ?? (state === 'resolved' ? constraint.resolvedAt : undefined) ?? constraint.confirmedAt ?? constraint.createdAt;
  return withoutEmpty({
    id: constraint.id,
    region: constraint.region,
    side: constraint.side,
    title: regionText(constraint, locale),
    type: text(locale).types[constraint.type],
    typeId: constraint.type,
    severity: constraint.severity,
    diagnosis: clientDiagnosis(constraint, locale),
    clientNote: constraint.clientNote,
    reportNote: state === 'pending' ? constraint.reportNote : undefined,
    state,
    at,
    declinedNote: constraint.declined?.note,
    change: constraint.clientChange ? (constraint.clientChange.resolved ? 'better' : 'worse') : undefined,
    triggers: state === 'pending' ? constraint.triggers : undefined,
  }) as ClientConstraintView;
}

/**
 * Bildirimden sonraki metin (§2.4): şiddetli ya da bu hafta başlayan yeni sakatlıkta bölgeyi zorlayan hareketleri
 * yapmaması ve gerekirse görünmesi söylenir; öteki durumlarda dikkatli olması.
 */
export function afterReportText(input: Pick<ReportInput, 'severity' | 'type' | 'since'>, locale: Locale = DEFAULT_LOCALE): string {
  const serious = input.severity === 'severe' || (input.type === 'injury' && input.since === 'week');
  const t = text(locale).afterReport;
  return serious ? t.serious : t.other;
}

/** Bildirim sheet'inin iki kademeli güvenlik metni (§2.4; Finucane 2020, Stiell 1992, Stiell 1995; seçim [sentez]). */
export const REPORT_SAFETY: { readonly urgent: string; readonly other: string } = text('tr').reportSafety;

/** Kauda ekina seçilince ve Dikkat maddesinde (yoklamanın "Bugün yük yok" diliyle aynı). */
export const EMERGENCY_TEXT: string = text('tr').emergency;

/* --- PT'nin kartları için özet --- */

/** Kısıtlar sayfası ve Genel'deki özet sayıları. */
export function constraintCounts(record: Pick<HealthRecord, 'constraints' | 'conditions' | 'surgeryDate'>): {
  active: number;
  pending: number;
  changes: number;
  awaiting: number;
  /** Danışanın PT'nin bakmadığı "şiddetli"si (onaylıda kötüleşme ya da şiddetli bildirim). */
  severe: number;
} {
  const list = constraintsOf(record);
  return {
    active: list.filter(isActive).length,
    pending: list.filter(isPendingReport).length,
    changes: list.filter((item) => isActive(item) && item.clientChange).length,
    awaiting: list.filter(awaitsOpinion).length,
    severe: list.filter(severeUnreviewed).length,
  };
}

/** Kırmızı bayrakta adım: yönlendirme bekliyor, görüş bekliyor, görüş alındı; bayrak yoksa null. */
export function redFlagStep(constraint: Constraint): 'refer' | 'opinion' | 'cleared' | null {
  if (!isRedFlag(constraint)) return null;
  if (constraint.clearance) return 'cleared';
  return constraint.referredAt ? 'opinion' : 'refer';
}

/* --- dil: adlar okuyanın dilinde (Türkçe takma adlar yukarıda) --- */

export function regionLabels(locale: Locale = DEFAULT_LOCALE): Record<ConstraintRegion, string> {
  return text(locale).regions;
}

export function constraintSideLabels(locale: Locale = DEFAULT_LOCALE): Record<ConstraintSide, string> {
  return text(locale).sides;
}

export function typeLabels(locale: Locale = DEFAULT_LOCALE): Record<ConstraintType, string> {
  return text(locale).types;
}

export function typeClientLabels(locale: Locale = DEFAULT_LOCALE): Record<ConstraintType, string> {
  return text(locale).typeClient;
}

export function severityLabels(locale: Locale = DEFAULT_LOCALE): Record<Severity, string> {
  return text(locale).severities;
}

export function severityDescriptions(locale: Locale = DEFAULT_LOCALE): Record<Severity, string> {
  return text(locale).severityDescriptions;
}

export function diagnosisSourceLabels(locale: Locale = DEFAULT_LOCALE): Record<DiagnosisSource, string> {
  return text(locale).diagnosisSources;
}

export function clearanceBasisLabels(locale: Locale = DEFAULT_LOCALE): Record<ClearanceBasis, string> {
  return text(locale).clearanceBases;
}

export function graftLabels(locale: Locale = DEFAULT_LOCALE): Record<Graft, string> {
  return text(locale).grafts;
}

/** Tendinopati evreleri ("1 · izometrik"). */
export function tendinopathyStageLabels(locale: Locale = DEFAULT_LOCALE): Record<Stage, string> {
  return text(locale).stages;
}

export function triggerLabels(locale: Locale = DEFAULT_LOCALE): Record<Trigger, string> {
  return text(locale).triggers;
}

export function onsetChoiceLabels(locale: Locale = DEFAULT_LOCALE): Record<OnsetChoice, string> {
  return text(locale).onsetChoices;
}

/** Kaçınılacak hareketlerin adları ("Derin diz bükme (90° üstü)"). */
export function avoidLabels(locale: Locale = DEFAULT_LOCALE): Record<AvoidTagId, string> {
  return text(locale).avoid;
}

export function reportSafety(locale: Locale = DEFAULT_LOCALE): typeof REPORT_SAFETY {
  return text(locale).reportSafety;
}

export function emergencyText(locale: Locale = DEFAULT_LOCALE): string {
  return text(locale).emergency;
}
