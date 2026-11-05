import { DEFAULT_LOCALE, type Locale } from '../i18n/locale.ts';
import { measurementsMessages } from '../i18n/messages/measurements/index.ts';

/**
 * Periyodik ölçümler — PT'nin danışan başına tuttuğu ikinci katman.
 *
 * Seans başına yoklama `src/lib/check-in.ts`'te; buradakiler ayda bir ya da
 * değerlendirme günlerinde alınır. Normlar ve eşikler `docs/research/medical-fitness/`
 * (ISAK antropometri, WHO bel-kalça oranı, 5 tekrar otur-kalk, gövde dayanıklılık
 * bataryası) kaynaklıdır. Ölçüm hatasının altındaki değişim "gelişme" diye
 * raporlanmaz — yoksa PT gürültüye göre program değiştirir.
 *
 * Hepsi sağlık verisidir: yalnız sağlık modülü açık ve danışan onay vermişse
 * `health.json`'a yazılır (SPEC §4).
 */

export const MEASUREMENT_TIERS = ['recommended', 'optional'] as const;
export type MeasurementTier = (typeof MEASUREMENT_TIERS)[number];

export type MeasurementDef = {
  label: string;
  unit: 'kg' | 'cm' | 's' | '%' | 'puan';
  group: 'anthropometry' | 'performance' | 'mobility' | 'questionnaire';
  tier: MeasurementTier;
  frequency: string;
  /** Sağ/sol ayrı mı ölçülür. */
  sided?: boolean;
  note?: string;
};

/** Ölçümlerin metin dışı kuralları (birim, grup, öncelik, taraf); ad, sıklık ve not sözlükte. */
const MEASUREMENT_RULES = {
  // --- Antropometri (ISAK Seviye 1'in çevre ölçümleri) ---
  body_mass: { unit: 'kg', group: 'anthropometry', tier: 'recommended' },
  stature: { unit: 'cm', group: 'anthropometry', tier: 'recommended' },
  waist_girth: { unit: 'cm', group: 'anthropometry', tier: 'recommended' },
  hip_girth: { unit: 'cm', group: 'anthropometry', tier: 'recommended' },
  arm_relaxed_girth: { unit: 'cm', group: 'anthropometry', tier: 'optional', sided: true },
  arm_flexed_girth: { unit: 'cm', group: 'anthropometry', tier: 'optional', sided: true },
  mid_thigh_girth: { unit: 'cm', group: 'anthropometry', tier: 'optional', sided: true },
  calf_girth: { unit: 'cm', group: 'anthropometry', tier: 'optional', sided: true },

  // --- Performans ---
  sit_to_stand_5x: { unit: 's', group: 'performance', tier: 'recommended' },
  trunk_flexor_endurance: { unit: 's', group: 'performance', tier: 'optional' },
  trunk_extensor_endurance: { unit: 's', group: 'performance', tier: 'optional' },
  side_bridge_endurance: { unit: 's', group: 'performance', tier: 'optional', sided: true },

  // --- Hareketlilik ---
  weight_bearing_lunge: { unit: 'cm', group: 'mobility', tier: 'recommended', sided: true },

  // --- Anketler (skoru PT girer; anket metni lisanslı olabilir, burada yok) ---
  odi: { unit: '%', group: 'questionnaire', tier: 'recommended' },
  spadi: { unit: '%', group: 'questionnaire', tier: 'recommended' },
  visa_p: { unit: 'puan', group: 'questionnaire', tier: 'recommended' },
} as const satisfies Record<string, Omit<MeasurementDef, 'label' | 'frequency' | 'note'>>;

export type MeasurementId = keyof typeof MEASUREMENT_RULES;
export const MEASUREMENT_IDS = Object.keys(MEASUREMENT_RULES) as MeasurementId[];

/** Ölçüm tanımı, adı, sıklığı ve notu okuyanın dilinde. */
export function measurementDef(id: MeasurementId, locale: Locale = DEFAULT_LOCALE): MeasurementDef {
  const text: { label: string; frequency: string; note?: string } = measurementsMessages(locale).defs[id];
  return { label: text.label, ...MEASUREMENT_RULES[id], frequency: text.frequency, ...(text.note !== undefined ? { note: text.note } : {}) };
}

/** Bütün ölçüm tanımları okuyanın dilinde, katalog sırasıyla. */
export function measurementDefs(locale: Locale = DEFAULT_LOCALE): Record<MeasurementId, MeasurementDef> {
  return Object.fromEntries(MEASUREMENT_IDS.map((id) => [id, measurementDef(id, locale)])) as Record<MeasurementId, MeasurementDef>;
}

/** Türkçe tanımlar (eski çağrılar); arayüz `measurementDefs(locale)` kullanır. */
export const MEASUREMENTS: Record<MeasurementId, MeasurementDef> = measurementDefs('tr');

/** Katalog birimi → ekranda görünen ("s" Türkçede "sn"): ölçüm ekranları ve Genel bakış ortak. */
export const MEASUREMENT_UNIT_LABELS: Record<MeasurementDef['unit'], string> = measurementsMessages('tr').units;

export type Sex = 'female' | 'male';

/* --- Yorumlayıcılar --- */

/** Bel-kalça oranı; erkekte ≥0,90, kadında ≥0,85 artmış metabolik risk (WHO). */
export function waistHipRatio(waistCm: number, hipCm: number, sex: Sex): { ratio: number; elevatedRisk: boolean } {
  const ratio = Math.round((waistCm / hipCm) * 100) / 100;
  return { ratio, elevatedRisk: ratio >= (sex === 'male' ? 0.9 : 0.85) };
}

/** 5 tekrar otur-kalk: >12 sn düşme riski değerlendirmesi, >15 sn tekrarlayan düşme riski. */
export function sitToStandFlag(seconds: number): 'normal' | 'fall_risk_assessment' | 'recurrent_fall_risk' {
  if (seconds > 15) return 'recurrent_fall_risk';
  if (seconds > 12) return 'fall_risk_assessment';
  return 'normal';
}

/** Otur-kalkta ölçüm hatasını aşan en küçük değişim (sn). */
export const SIT_TO_STAND_MCID = 2.3;

/** Gövde dayanıklılık testlerinde tipik hata %12–24: %25 altındaki değişim gerçek sayılmaz. */
export const ENDURANCE_NOISE = 0.25;

/**
 * Bel ve kalça çevresinde ölçüm hatasını aşan en küçük değişim (cm). Teknik ölçüm hatası
 * belde ölçümcü içi ~1,31, ölçümcüler arası ~1,56 cm; kalçada ~1,23 ve ~1,38 cm (WHO bel
 * çevresi ve bel-kalça oranı uzman raporu). Yalnız bu iki çevre için kaynaklı: kol, uyluk ve
 * baldıra aynen uygulanmaz.
 */
export const WAIST_HIP_GIRTH_NOISE_CM = 2;

export type Change = 'improved' | 'declined' | 'no_real_change';

/**
 * İki ölçüm arasındaki değişim gerçek mi? `better` hangi yönün iyi olduğunu söyler
 * (dayanıklılıkta yüksek, otur-kalkta düşük iyidir).
 */
export function realChange(
  before: number,
  after: number,
  { threshold, relative, better }: { threshold: number; relative: boolean; better: 'higher' | 'lower' },
): Change {
  const delta = after - before;
  const raw = relative ? Math.abs(delta) / Math.max(Math.abs(before), Number.EPSILON) : Math.abs(delta);
  // Ondalık çıkarma kayar (82,1 − 80,1 = 1,99999…): tam eşikteki fark gürültü sayılmasın.
  const size = Math.round(raw * 1e9) / 1e9;
  if (size < threshold) return 'no_real_change';
  const up = delta > 0;
  return (better === 'higher') === up ? 'improved' : 'declined';
}

/**
 * Sağ-sol yan köprü farkı ölçüm hatası bandını (%25) aşıyor mu. Karşılaştırma yuvarlanmamış
 * oranla (%25,4 bandı aşar). `differencePercent` gösterim içindir ve kararla çelişmez: bandın
 * yakınında (%24,5–25,5) bir ondalıkla (%25,4 "aşıyor", %25 "bandında"), uzağında tam sayıyla;
 * bandı aşan fark hiçbir zaman "%25" diye yazılmaz (%25,025 → %25,03).
 */
export function sideBridgeAsymmetry(leftS: number, rightS: number): { differencePercent: number; flagged: boolean } {
  const larger = Math.max(leftS, rightS);
  const ratio = larger === 0 ? 0 : Math.abs(leftS - rightS) / larger;
  // Ondalık çıkarma kayar (33,2 − 24,9 = 8,3000…04 → %25,000…01): tam sınırdaki fark bandı aşmış sayılmasın.
  const flagged = Math.round(ratio * 1e9) / 1e9 > ENDURANCE_NOISE;
  const percent = ratio * 100;
  const band = ENDURANCE_NOISE * 100;
  const scale = Math.abs(percent - band) <= 0.5 ? 10 : 1;
  const shown = Math.round(percent * scale) / scale;
  return { differencePercent: flagged && shown <= band ? Math.ceil(percent * 100) / 100 : shown, flagged };
}

/**
 * Gövde dayanıklılık oranları ve cinsiyete göre başvuru değerleri (McGill). Hedef
 * değil başvuru: sapma tek başına yasak ya da tanı gerekçesi değildir.
 */
export const ENDURANCE_REFERENCE: Record<Sex, { sideToExtensor: number; sideToFlexor: number }> = {
  male: { sideToExtensor: 0.65, sideToFlexor: 0.99 },
  female: { sideToExtensor: 0.39, sideToFlexor: 0.79 },
};

export function enduranceRatios(
  { flexorS, extensorS, sideS }: { flexorS: number; extensorS: number; sideS: number },
  sex: Sex,
): { sideToExtensor: number; sideToFlexor: number; reference: (typeof ENDURANCE_REFERENCE)[Sex] } {
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    sideToExtensor: round(sideS / extensorS),
    sideToFlexor: round(sideS / flexorS),
    reference: ENDURANCE_REFERENCE[sex],
  };
}

/* --- dil --- */

/** Birimlerin ekrandaki adı okuyanın dilinde (`puan` kayıtta koddur). */
export function measurementUnitLabels(locale: Locale = DEFAULT_LOCALE): Record<MeasurementDef['unit'], string> {
  return measurementsMessages(locale).units;
}
