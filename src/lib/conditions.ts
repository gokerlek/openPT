/**
 * Sakatlık ve kısıt sözlüğü — danışanın kaydı ile egzersiz etiketleri bu kimlikler
 * üzerinden eşleşir (`src/lib/exercise-filter.ts`).
 *
 * Kaynak: `docs/research/medical-fitness/` (164 kaynaklı tarama). Şiddet ve faz
 * kimliğe gömülmez; ayrı `qualifier` alanında tutulur — yoksa 30 kimlik 80 olur.
 *
 * Kırmızı bayrak PT'nin tek başına karar vermeyeceği durumdur: danışanın kısıtında sağlık profesyoneline
 * yönlendirme ve görüş adımları ister (`constraints.ts`, tasarım `kisit-tarama.md` §2.6).
 *
 * Tür (`kind`): tanı (`diagnosis`, varsayılan) bir sağlık profesyonelinin koyduğu şeydir; bulgu (`finding`)
 * PT'nin gözlemidir (postür, hareket taraması). Kısıt formunda ayrı seçicilerde çıkar; danışan bulguyu görmez.
 *
 * Adlar ve notlar `catalog` sözlüğünde (`conditionInfo(id, locale)`); klinik İngilizce bir uzmanın gözünden geçmeli.
 */

import { DEFAULT_LOCALE, type Locale } from '../i18n/locale.ts';
import { catalogMessages } from '../i18n/messages/catalog/index.ts';

export const CONDITION_REGIONS = ['spine', 'neck', 'shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle', 'systemic'] as const;
export type ConditionRegion = (typeof CONDITION_REGIONS)[number];

/** Şiddet/faz niteleyicisi: aynı patolojinin akut ve sakin hali aynı kural setine girmez. */
export const CONDITION_QUALIFIERS = ['acute', 'reactive', 'severe', 'stable', 'controlled', 'uncontrolled', 'postop'] as const;
export type ConditionQualifier = (typeof CONDITION_QUALIFIERS)[number];

export type ConditionKind = 'diagnosis' | 'finding';

export type ConditionInfo = {
  label: string;
  region: ConditionRegion;
  /** Bulgu (PT'nin gözlemi) mi; yoksa tanı. */
  kind?: ConditionKind;
  /** Sağlık profesyoneline yönlendirme ve görüş ister; uygulama uyarıyı gizleyemez. */
  redFlag?: boolean;
  /** Kayıtta anlamlı olan niteleyiciler (boşsa niteleyici sorulmaz). */
  qualifiers?: readonly ConditionQualifier[];
  /** Kısa gerekçe — PT'ye uyarının yanında gösterilir. */
  note?: string;
};

/** Kuralların kodları: bölge, tür, kırmızı bayrak, niteleyiciler. Ad ve not `catalog` sözlüğünde. */
const CONDITION_RULES = {
  // --- Omurga ---
  lumbar_disc_herniation: { region: 'spine', qualifiers: ['acute', 'stable'] },
  lumbar_disc_herniation_with_radiculopathy: { region: 'spine', redFlag: true },
  flexion_intolerant_back: { region: 'spine' },
  lumbar_spondylolisthesis: { region: 'spine' },
  lumbar_stenosis: { region: 'spine' },
  chronic_nonspecific_low_back_pain: { region: 'spine' },
  si_joint_pain: { region: 'hip' },
  cauda_equina_or_progressive_neuro_deficit: { region: 'systemic', redFlag: true },

  // --- Boyun / üst sırt ---
  cervical_pain: { region: 'neck' },
  cervical_radiculopathy: { region: 'neck', redFlag: true, qualifiers: ['acute', 'stable'] },
  upper_crossed_pattern: { region: 'neck', kind: 'finding' },
  thoracic_extension_deficit: { region: 'spine', kind: 'finding' },

  // --- Omuz ---
  subacromial_pain_syndrome: { region: 'shoulder', qualifiers: ['acute', 'severe'] },
  rotator_cuff_tendinopathy: { region: 'shoulder', qualifiers: ['reactive'] },
  anterior_shoulder_instability: { region: 'shoulder', redFlag: true, qualifiers: ['severe', 'postop'] },
  multidirectional_shoulder_instability: { region: 'shoulder' },
  ac_joint_injury: { region: 'shoulder', qualifiers: ['severe'] },
  scapular_dyskinesis: { region: 'shoulder', kind: 'finding' },

  // --- Dirsek / el bileği ---
  lateral_epicondylitis: { region: 'elbow', qualifiers: ['acute'] },
  wrist_pain: { region: 'wrist', qualifiers: ['severe'] },

  // --- Kalça ---
  lower_crossed_pattern: { region: 'hip', kind: 'finding' },
  hip_impingement_fai: { region: 'hip' },

  // --- Diz ---
  patellofemoral_pain: { region: 'knee', qualifiers: ['severe'] },
  patellar_tendinopathy: { region: 'knee', qualifiers: ['reactive'] },
  acl_reconstruction_early: { region: 'knee', redFlag: true },
  knee_osteoarthritis: { region: 'knee', qualifiers: ['severe'] },
  degenerative_meniscal_tear: { region: 'knee' },
  acute_meniscus_tear: { region: 'knee', redFlag: true },
  meniscus_repair_postop: { region: 'knee', redFlag: true },
  acute_knee_effusion: { region: 'knee' },
  dynamic_knee_valgus: { region: 'knee', kind: 'finding' },

  // --- Ayak bileği ---
  ankle_dorsiflexion_restriction: { region: 'ankle', kind: 'finding' },

  // --- Sistemik ---
  hypertension: { region: 'systemic', qualifiers: ['controlled', 'uncontrolled'] },
  pregnancy_second_third_trimester: { region: 'systemic' },
  // Eski kayıtlarda okunur; hiçbir seçicide çıkmaz (taramadaki ağrı tanısız hareket kısıtı olur, `kisit-tarama.md` §4.4).
  movement_screen_pain_flag: { region: 'systemic', kind: 'finding', redFlag: true },
} as const satisfies Record<string, Omit<ConditionInfo, 'label' | 'note'>>;

export type ConditionId = keyof typeof CONDITION_RULES;
export const CONDITION_IDS = Object.keys(CONDITION_RULES) as ConditionId[];

/** Sözlük kaydı, adı ve notu okuyanın dilinde. */
export function conditionInfo(id: ConditionId, locale: Locale = DEFAULT_LOCALE): ConditionInfo {
  const text: { label: string; note?: string } = catalogMessages(locale).conditions[id];
  return { label: text.label, ...CONDITION_RULES[id], ...(text.note !== undefined ? { note: text.note } : {}) };
}

/** Türkçe sözlük (eski çağrılar); arayüz `conditionInfo(id, locale)` kullanır. */
export const CONDITIONS: Record<ConditionId, ConditionInfo> = Object.fromEntries(
  CONDITION_IDS.map((id) => [id, conditionInfo(id, 'tr')]),
) as Record<ConditionId, ConditionInfo>;

export function isConditionId(value: string): value is ConditionId {
  return value in CONDITION_RULES;
}

/** Danışanın kaydındaki bir kısıt: kimlik + (varsa) şiddet/faz. */
export type ClientCondition = { id: ConditionId; qualifier?: ConditionQualifier };

/** "lumbar_disc_herniation:acute" → { id, qualifier }; bilinmeyen kimlikte `null`. */
export function parseCondition(value: string): ClientCondition | null {
  const [id, qualifier] = value.split(':');
  if (!id || !isConditionId(id)) return null;
  if (!qualifier) return { id };
  return CONDITION_QUALIFIERS.includes(qualifier as ConditionQualifier)
    ? { id, qualifier: qualifier as ConditionQualifier }
    : { id };
}

/** Kayıt biçimine geri çevirir ("knee_osteoarthritis:severe"). */
export function formatCondition({ id, qualifier }: ClientCondition): string {
  return qualifier ? `${id}:${qualifier}` : id;
}

export function conditionLabel({ id, qualifier }: ClientCondition, locale: Locale = DEFAULT_LOCALE): string {
  const t = catalogMessages(locale);
  const base = conditionInfo(id, locale).label;
  const ek: Partial<Record<ConditionQualifier, string>> = t.conditionQualifiers;
  return qualifier && ek[qualifier] ? t.conditionWithQualifier(base, ek[qualifier]) : base;
}

/** Niteleyicilerin adları ("akut", "şiddetli"). */
export function conditionQualifierLabels(locale: Locale = DEFAULT_LOCALE): Record<ConditionQualifier, string> {
  return catalogMessages(locale).conditionQualifiers;
}

/** Sağlık profesyoneline yönlendirme isteyen kısıtlar. */
export function redFlags(conditions: readonly ClientCondition[]): ClientCondition[] {
  return conditions.filter((condition) => conditionInfo(condition.id).redFlag);
}

export function conditionKind(id: ConditionId): ConditionKind {
  return conditionInfo(id).kind ?? 'diagnosis';
}

/** Hiçbir seçicide çıkmayan, yalnız eski kayıtta okunan kimlikler. */
export const RETIRED_CONDITION_IDS: ReadonlySet<ConditionId> = new Set(['movement_screen_pain_flag']);

/** "Egzersiz yok" kuralı: görüşle de değişmez, izin verilemez; seçilince acil yönlendirme metni. */
export const EMERGENCY_CONDITION_ID: ConditionId = 'cauda_equina_or_progressive_neuro_deficit';

/**
 * Danışanın göreceği tanı adı (tasarım `kisit-tarama.md` §5.2): yalnız tanı türünde, niteleyicisiz temel ad;
 * adında niteleyici ya da kuşku sözcüğü geçen tanı hiç yazılmaz. Kaynağın hekim olup olmadığına çağıran bakar.
 */
export function clientSafeLabel(id: ConditionId, locale: Locale = DEFAULT_LOCALE): string | null {
  if (conditionKind(id) !== 'diagnosis') return null;
  // Karar dilden bağımsız: Türkçe addaki sözcüğe bakılır, gösterilen ad okuyanın dilinde.
  return /akut|şiddetli|kontrolsüz|şüphe/i.test(conditionInfo(id, 'tr').label) ? null : conditionInfo(id, locale).label;
}
