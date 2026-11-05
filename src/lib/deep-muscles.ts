import { DEFAULT_LOCALE, type Locale } from '../i18n/locale.ts';
import { catalogMessages } from '../i18n/messages/catalog/index.ts';
import type { Muscle } from './schemas/exercise.ts';

/**
 * Derin kaslar ve postür paternleri — medikal/düzeltici katmanın sözlüğü.
 *
 * Kas haritası (`src/lib/muscles.ts`, 35 kas) yüzey anatomisidir: görülen, boyanan,
 * haftalık hacmi sayılan kaslar. Buradakiler derindedir; haritada çizilecek yüzeyleri
 * yoktur ve **hacim sayımına girmezler** — stabilizatörün seti "set" değildir, bunlar
 * aktivasyon hedefidir.
 *
 * Kaynak: `docs/research/medical-fitness/` (Janda üst/alt çapraz, NASM Overhead Squat
 * kompansasyon tablosu, McGill omurga stabilizasyonu, Sahrmann MSI).
 */

export const DEEP_MUSCLES = [
  // Omuz / skapula
  'rotator_cuff_supraspinatus',
  'rotator_cuff_external',
  'rotator_cuff_subscapularis',
  'rhomboids',
  'pec_minor',
  'levator_scapulae',
  // Boyun
  'deep_neck_flexors',
  // Gövde
  'multifidus',
  'transversus_abdominis',
  'pelvic_floor',
  'diaphragm',
  // Kalça
  'tfl',
  'deep_hip_rotators',
  // Ayak bileği
  'tibialis_posterior',
  'peroneals',
] as const;

export type DeepMuscle = (typeof DEEP_MUSCLES)[number];

/** Yüzey ya da derin kas; postür paternleri ikisini birlikte kullanır. */
export type AnyMuscle = Muscle | DeepMuscle;

export function deepMuscleLabels(locale: Locale = DEFAULT_LOCALE): Record<DeepMuscle, string> {
  return catalogMessages(locale).deepMuscles;
}

/** Türkçe adlar (eski çağrılar); arayüz `deepMuscleLabels(locale)` kullanır. */
export const DEEP_MUSCLE_LABELS: Record<DeepMuscle, string> = deepMuscleLabels('tr');

export type DeepMuscleRegion = 'shoulder' | 'neck' | 'trunk' | 'hip' | 'ankle';

/** Hangi bölgeye ait — formda gruplu seçim için. */
export const DEEP_MUSCLE_REGIONS: Record<DeepMuscle, DeepMuscleRegion> = {
  rotator_cuff_supraspinatus: 'shoulder',
  rotator_cuff_external: 'shoulder',
  rotator_cuff_subscapularis: 'shoulder',
  rhomboids: 'shoulder',
  pec_minor: 'shoulder',
  levator_scapulae: 'shoulder',
  deep_neck_flexors: 'neck',
  multifidus: 'trunk',
  transversus_abdominis: 'trunk',
  pelvic_floor: 'trunk',
  diaphragm: 'trunk',
  tfl: 'hip',
  deep_hip_rotators: 'hip',
  tibialis_posterior: 'ankle',
  peroneals: 'ankle',
};

export function deepMuscleRegionLabels(locale: Locale = DEFAULT_LOCALE): Record<DeepMuscleRegion, string> {
  return catalogMessages(locale).deepMuscleRegions;
}

/** Kısa klinik notlar; PT'ye seçimin yanında gösterilir. */
export function deepMuscleNotes(locale: Locale = DEFAULT_LOCALE): Partial<Record<DeepMuscle, string>> {
  return catalogMessages(locale).deepMuscleNotes;
}

/** Türkçe metinler (eski çağrılar); arayüz `deepMuscleRegionLabels(locale)` / `deepMuscleNotes(locale)` kullanır. */
export const DEEP_MUSCLE_REGION_LABELS: Record<DeepMuscleRegion, string> = deepMuscleRegionLabels('tr');
export const DEEP_MUSCLE_NOTES: Partial<Record<DeepMuscle, string>> = deepMuscleNotes('tr');

/** Bir harekette en çok bu kadar derin kas (şema da bunu kullanır). */
export const DEEP_MUSCLE_MAX = 8;

const DEEP_MUSCLE_REGION_ORDER: readonly DeepMuscleRegion[] = ['shoulder', 'neck', 'trunk', 'hip', 'ankle'];

/** Derin kaslar bölge bölge (bölge sırası `DEEP_MUSCLE_REGION_ORDER`), her bölgede `DEEP_MUSCLES` sırasıyla; boş bölge yok. */
export function deepMusclesByRegion(
  muscles: readonly DeepMuscle[],
  locale: Locale = DEFAULT_LOCALE,
): { region: DeepMuscleRegion; label: string; muscles: DeepMuscle[] }[] {
  const labels = deepMuscleRegionLabels(locale);
  return DEEP_MUSCLE_REGION_ORDER
    .map((region) => ({
      region,
      label: labels[region],
      muscles: DEEP_MUSCLES.filter((muscle) => DEEP_MUSCLE_REGIONS[muscle] === region && muscles.includes(muscle)),
    }))
    .filter((group) => group.muscles.length > 0);
}

export function isDeepMuscle(value: string): value is DeepMuscle {
  return (DEEP_MUSCLES as readonly string[]).includes(value);
}

/**
 * Postür/kompansasyon paternleri: hangi kas kısalmış (aşırı aktif), hangisi uykuda
 * (az aktif). NASM'in düzeltici zinciri bunu "inhibit → lengthen → activate → integrate"
 * sırasıyla kullanır.
 *
 * `confidence` bilerek var: bu eşlemelerin çoğu uzman görüşüdür. Uygulama bunlara
 * dayanarak egzersiz **yasaklamaz**, yalnız öneri üretir.
 */
export type PosturalPattern = {
  label: string;
  /** Kısalmış/aşırı aktif: önce gevşetilir ve uzatılır. */
  overactive: readonly AnyMuscle[];
  /** Zayıf/az aktif: sonra aktive edilip harekete katılır. */
  underactive: readonly AnyMuscle[];
  confidence: 'supported' | 'mixed' | 'expert_opinion';
  note: string;
};

/** Paternlerin kasları ve güveni; ad ve not `catalog` sözlüğünde. */
const POSTURAL_RULES = {
  upper_crossed: {
    overactive: ['pec_minor', 'chest_upper', 'levator_scapulae', 'traps_upper', 'nape'],
    underactive: ['deep_neck_flexors', 'traps_lower', 'traps_mid', 'rhomboids', 'serratus', 'rotator_cuff_external'],
    confidence: 'expert_opinion',
  },
  lower_crossed: {
    overactive: ['hip_flexors', 'erectors', 'tfl'],
    underactive: ['glutes', 'abs_lower', 'transversus_abdominis'],
    confidence: 'expert_opinion',
  },
  dynamic_knee_valgus: {
    overactive: ['adductors', 'tfl', 'gastroc_lateral', 'soleus'],
    underactive: ['glute_medius', 'glutes', 'tibialis_posterior'],
    confidence: 'mixed',
  },
  scapular_dyskinesis: {
    overactive: ['pec_minor', 'traps_upper', 'levator_scapulae'],
    underactive: ['serratus', 'traps_lower', 'rhomboids'],
    confidence: 'mixed',
  },
  foot_pronation: {
    overactive: ['peroneals', 'gastroc_lateral', 'adductors'],
    underactive: ['tibialis_posterior', 'tibialis', 'glute_medius'],
    confidence: 'expert_opinion',
  },
} as const satisfies Record<string, Omit<PosturalPattern, 'label' | 'note'>>;

export type PosturalPatternId = keyof typeof POSTURAL_RULES;
export const POSTURAL_PATTERN_IDS = Object.keys(POSTURAL_RULES) as PosturalPatternId[];

export function posturalPattern(id: PosturalPatternId, locale: Locale = DEFAULT_LOCALE): PosturalPattern {
  const { label, note } = catalogMessages(locale).posturalPatterns[id];
  return { label, ...POSTURAL_RULES[id], note };
}

/** Türkçe paternler (eski çağrılar); arayüz `posturalPattern(id, locale)` kullanır. */
export const POSTURAL_PATTERNS: Record<PosturalPatternId, PosturalPattern> = Object.fromEntries(
  POSTURAL_PATTERN_IDS.map((id) => [id, posturalPattern(id, 'tr')]),
) as Record<PosturalPatternId, PosturalPattern>;

/** Paternin önerdiği çalışma: önce gevşet/uzat, sonra aktive et. */
export function correctiveTargets(ids: readonly PosturalPatternId[]): {
  lengthen: AnyMuscle[];
  activate: AnyMuscle[];
} {
  const lengthen = new Set<AnyMuscle>();
  const activate = new Set<AnyMuscle>();
  for (const id of ids) {
    for (const muscle of POSTURAL_PATTERNS[id].overactive) lengthen.add(muscle);
    for (const muscle of POSTURAL_PATTERNS[id].underactive) activate.add(muscle);
  }
  // Aynı kas iki paternde ters roldeyse aktivasyon kazanır: zayıfı güçlendirmek önceliklidir.
  for (const muscle of activate) lengthen.delete(muscle);
  return { lengthen: [...lengthen], activate: [...activate] };
}
