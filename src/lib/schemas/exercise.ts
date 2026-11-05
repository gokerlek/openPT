import * as v from 'valibot';
import { DEFAULT_LOCALE, type Locale } from '../../i18n/locale.ts';
import { catalogMessages } from '../../i18n/messages/catalog/index.ts';
import { libraryValidationMessages } from '../../i18n/messages/library-validation/index.ts';
import { msg } from '../../i18n/valibot.ts';
import { MOVEMENT_PATTERNS } from '../alternatives.ts';
import { DEEP_MUSCLE_MAX, DEEP_MUSCLES } from '../deep-muscles.ts';
import { parseCondition } from '../conditions.ts';
import {
  AXIAL_LOADS,
  CONTRACTION_TYPES,
  JOINT_WINDOWS,
  KINETIC_CHAINS,
  LOAD_VECTORS,
  RESISTANCE_PROFILES,
  SHEAR_LEVELS,
  SPINAL_ALIGNMENTS,
} from '../exercise-filter.ts';
import { attachmentIdOf, attachmentIdSchema } from './attachment.ts';
import { GRIPS, GRIP_WIDTHS } from '../grips.ts';
import { PROGRESSION_SCHEMES } from '../progression.ts';
import { isValidVideoId, parseVideoUrl } from '../video.ts';

/**
 * Egzersiz şeması — sunucu ve istemci ortak.
 *
 * Hazır kütüphane pakette (`src/data/exercise-library.ts`), PT'nin kendi
 * egzersizleri uygulama repo'sunda (`data/exercises.json`). İkisi aynı şekle uyar.
 * Yol takma adıyla çalışma zamanı içe aktarması yok (testler Node'un test aracıyla çalışır).
 */

export const EQUIPMENT = [
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'band',
  'kettlebell',
  'bodyweight',
  'cardio_machine',
] as const;

/**
 * Kaslar — kas haritasının (body-muscles) parçalarıyla bire bir; sol ve sağ birlikte.
 * Kardiyo bir kas değil ama egzersizin neyi çalıştırdığı olarak burada durur.
 */
export const MUSCLES = [
  'chest_upper',
  'chest_lower',
  'delt_front',
  'delt_side',
  'delt_rear',
  'traps_upper',
  'traps_mid',
  'traps_lower',
  'lats_upper',
  'lats_mid',
  'lats_lower',
  'erectors',
  'quadratus',
  'biceps',
  'triceps_long',
  'triceps_lateral',
  'forearm_flexors',
  'forearm_extensors',
  'abs_upper',
  'abs_lower',
  'obliques',
  'serratus',
  'glutes',
  'glute_medius',
  'hip_flexors',
  'quadriceps',
  'adductors',
  'hamstrings_medial',
  'hamstrings_lateral',
  'gastroc_medial',
  'gastroc_lateral',
  'soleus',
  'tibialis',
  'neck',
  'nape',
  'cardio',
] as const;

/** Set kaydının nasıl tutulacağı: ağırlık+tekrar, sadece tekrar, ya da süre. */
export const TRACKING_TYPES = ['weight_reps', 'bodyweight_reps', 'duration'] as const;

/** Kondisyon: tüm vücudu çalıştıran, kardiyoyla karışık hareketler (burpee, battle rope, kızak…). */
export const CATEGORIES = ['compound', 'isolation', 'conditioning', 'warmup', 'cooldown'] as const;
export type Category = (typeof CATEGORIES)[number];

/** Doğrulama mesajları (`msg`: şemayı ayrıştıran isteğin diliyle). */
const text = (locale: Locale) => libraryValidationMessages(locale).exerciseSchema;

const count = (max: number) =>
  v.pipe(
    v.number(msg((l) => text(l).enterNumber)),
    v.integer(msg((l) => text(l).enterInteger)),
    v.minValue(1, msg((l) => text(l).atLeast1)),
    v.maxValue(max, msg((l) => text(l).atMost(max))),
  );

/**
 * İlerleme kuralı (`src/lib/progression.ts`): tür, hedef aralığı (tekrar ya da saniye)
 * ve set sonunda yedekte kalacak tekrar. Egzersizde yoksa türüne göre varsayılan
 * kullanılır; şablondaki satır bunu değiştirebilir.
 */
export const progressionSchema = v.pipe(
  v.object({
    scheme: v.picklist(PROGRESSION_SCHEMES, msg((l) => text(l).pickProgression)),
    targetMin: count(3600),
    targetMax: count(3600),
    targetRir: v.pipe(
      v.number(msg((l) => text(l).enterNumber)),
      v.integer(msg((l) => text(l).enterInteger)),
      v.minValue(0, msg((l) => text(l).atLeast0)),
      v.maxValue(4, msg((l) => text(l).atMost4)),
    ),
  }),
  v.forward(
    v.partialCheck(
      [['targetMin'], ['targetMax']],
      (rule) => rule.targetMax >= rule.targetMin,
      msg((l) => text(l).upperBelowLower),
    ),
    ['targetMax'],
  ),
);

/** "lumbar_disc_herniation" ya da "lumbar_disc_herniation:acute"; sözlükte olmalı. */
const conditionRef = v.pipe(
  v.string(),
  v.check((value) => parseCondition(value) !== null, msg((l) => text(l).unknownLimitation)),
);

export const exerciseSchema = v.object({
  /** Okunabilir kimlik (slug). Şablonlar ve set kayıtları buna bakar; değiştirilmez. */
  id: v.pipe(v.string(), v.regex(/^[a-z0-9-]{2,60}$/, msg((l) => text(l).idChars))),
  title: v.pipe(v.string(), v.trim(), v.minLength(2, msg((l) => text(l).titleShort)), v.maxLength(60)),
  description: v.pipe(v.string(), v.trim(), v.maxLength(400, msg((l) => text(l).descriptionMax))),
  /** Harekete başlarken hatırlatılacak kısa maddeler. */
  cues: v.pipe(
    v.array(v.pipe(v.string(), v.trim(), v.maxLength(120, msg((l) => text(l).cueMax)))),
    // Formda boş bırakılan satırlar kayda girmesin.
    v.transform((items) => items.filter((item) => item.length > 0)),
    v.maxLength(6, msg((l) => text(l).cuesMax)),
  ),
  category: v.picklist(CATEGORIES, msg((l) => text(l).pickCategory)),
  trackingType: v.picklist(TRACKING_TYPES, msg((l) => text(l).pickTracking)),
  equipment: v.picklist(EQUIPMENT, msg((l) => text(l).pickEquipment)),
  /**
   * Hareketin yapıldığı cihaz (`src/data/device-library.ts` ya da PT'nin cihazı). Varsa
   * ağırlık önerileri cihazın ayarlanabilen ağırlıklarından seçilir; `loadStepKg` ve
   * `minLoadKg` yalnız cihazsız harekette kullanılır.
   */
  deviceId: v.optional(v.pipe(v.string(), v.regex(/^[a-z0-9-]{2,60}$/))),
  /** Hangi aparatla yapıldığı: havuzdaki aparatın kimliği (cihazın aparatlarından seçilir). */
  attachmentId: v.optional(attachmentIdSchema),
  /**
   * Biyomekanik etiketler — sakatlık süzgeci bunlara bakar (`src/lib/exercise-filter.ts`).
   * Hepsi isteğe bağlı: etiketlenmemiş hareket süzülmez, uygulama bunu açıkça söyler.
   */
  kineticChain: v.optional(v.picklist(KINETIC_CHAINS, msg((l) => text(l).pickChain))),
  axialLoading: v.optional(v.picklist(AXIAL_LOADS, msg((l) => text(l).pickAxial))),
  shearForce: v.optional(v.picklist(SHEAR_LEVELS, msg((l) => text(l).pickShear))),
  spinalAlignment: v.optional(v.picklist(SPINAL_ALIGNMENTS, msg((l) => text(l).pickAlignment))),
  /** Hareketin geçtiği kritik açı pencereleri: hareketi yasaklamak yerine aralığı kısmak için. */
  jointWindows: v.optional(v.pipe(v.array(v.picklist(JOINT_WINDOWS)), v.maxLength(6, msg((l) => text(l).windowsMax)))),
  loadVector: v.optional(v.picklist(LOAD_VECTORS, msg((l) => text(l).pickVector))),
  contractionType: v.optional(v.picklist(CONTRACTION_TYPES, msg((l) => text(l).pickContraction))),
  resistanceProfile: v.optional(v.picklist(RESISTANCE_PROFILES, msg((l) => text(l).pickProfile))),
  /** Yük altında omuz iç rotasyonda mı (upright row, empty can). */
  internalRotationUnderLoad: v.optional(v.boolean()),
  /** Bu hareketin yaptırılmayacağı kısıtlar ("lumbar_disc_herniation:acute"). */
  contraindications: v.optional(v.pipe(v.array(conditionRef), v.maxLength(12, msg((l) => text(l).limitationsMax)))),
  /** PT'nin "bunda sorun yok" dediği kısıtlar: uyarıyı susturur, yasağı susturmaz. */
  safeFor: v.optional(v.pipe(v.array(conditionRef), v.maxLength(12, msg((l) => text(l).limitationsMax)))),
  /**
   * Derin/stabilizatör aktivasyon hedefleri (`src/lib/deep-muscles.ts`): rotator manşet,
   * multifidus, pelvik taban… Haritada çizilmez ve **haftalık hacme girmez**; düzeltici
   * çalışmada "bu hareket şunu uyandırır" demek için.
   */
  activationTargets: v.optional(
    v.pipe(v.array(v.picklist(DEEP_MUSCLES, msg((l) => text(l).pickDeepMuscle))), v.maxLength(DEEP_MUSCLE_MAX, msg((l) => text(l).activationMax(DEEP_MUSCLE_MAX)))),
  ),
  /** Tutuş: pronasyon/supinasyon/nötr/karışık ve genişlik (`src/lib/grips.ts`). */
  grip: v.optional(v.picklist(GRIPS, msg((l) => text(l).pickGrip))),
  gripWidth: v.optional(v.picklist(GRIP_WIDTHS, msg((l) => text(l).pickGripWidth))),
  /** Hareket kalıbı (yatay itiş, squat…): muadil önerisinin ilk ölçütü (`src/lib/alternatives.ts`). */
  pattern: v.optional(v.picklist(MOVEMENT_PATTERNS, msg((l) => text(l).pickPattern))),
  /** Yürüyüş/koşu (koşu bandı): kardiyo hareketinde eğim ve kalori (`src/lib/cardio.ts`). */
  locomotion: v.optional(v.boolean()),
  /** PT'nin sabitlediği muadiller (egzersiz kimlikleri); önerilerde en başta gelir. */
  alternatives: v.optional(
    v.pipe(v.array(v.pipe(v.string(), v.regex(/^[a-z0-9-]{2,60}$/))), v.maxLength(12, msg((l) => text(l).alternativesMax))),
  ),
  /**
   * Kasın bu hareketteki payı üç seviyede: hedef, yardımcı, dengeleyici (haftalık yükte
   * 1 / 0,5 / 0,25 set sayılır). Seviye her kas için ayrıdır: birden çok kas aynı anda
   * hedef olabilir. Bir kas yalnız bir seviyede bulunur; form ve sunucu ayırır.
   */
  primaryMuscles: v.pipe(
    v.array(v.picklist(MUSCLES, msg((l) => text(l).pickMuscle))),
    v.minLength(1, msg((l) => text(l).primaryMin)),
    v.maxLength(8, msg((l) => text(l).primaryMax)),
  ),
  secondaryMuscles: v.pipe(v.array(v.picklist(MUSCLES, msg((l) => text(l).pickMuscle))), v.maxLength(10, msg((l) => text(l).secondaryMax))),
  /** Hareketi taşımayan ama gövdeyi sabit tutan kaslar (squat'ta karın, plank'ta omuz). */
  stabilizerMuscles: v.optional(
    v.pipe(v.array(v.picklist(MUSCLES, msg((l) => text(l).pickMuscle))), v.maxLength(10, msg((l) => text(l).stabilizerMax))),
    [],
  ),
  /**
   * Ağırlık adımı: aletin izin verdiği en küçük artış (halter 2,5, dambıl 2, makine 5…).
   * Ne kadar artacağını danışanın performansı belirler; öneri bu adıma yuvarlanır.
   * Taban: barın/aletin kendi ağırlığı; öneri bunun altına inmez.
   */
  loadStepKg: v.pipe(v.number(msg((l) => text(l).enterNumber)), v.minValue(0, msg((l) => text(l).nonNegative)), v.maxValue(50, msg((l) => text(l).stepMax))),
  minLoadKg: v.pipe(v.number(msg((l) => text(l).enterNumber)), v.minValue(0, msg((l) => text(l).nonNegative)), v.maxValue(500, msg((l) => text(l).minLoadMax))),
  progression: v.optional(progressionSchema),
  video: v.optional(
    v.pipe(
      v.object({
        provider: v.picklist(['youtube', 'vimeo'], msg((l) => text(l).videoProvider)),
        /** Video kimliği; gömme adresi buradan kurulur, medya barındırmıyoruz (`src/lib/video.ts`). */
        id: v.pipe(v.string(), v.trim(), v.maxLength(64)),
      }),
      v.check(isValidVideoId, msg((l) => text(l).videoId)),
    ),
  ),
});

export type Exercise = v.InferOutput<typeof exerciseSchema>;

/**
 * Formun şeması: `id` ve `video` yok; video yerine yapıştırılan bağlantı var.
 *
 * Kimlik yeni kayıtta sunucuda başlıktan üretilir, düzenlemede zaten bellidir.
 * Formda olmayan bir alanı zorunlu tutmak formu sessizce geçersiz bırakır.
 */
export const exerciseFormSchema = v.object({
  // Sabitlenen muadiller detay sayfasındaki karttan yönetilir; form onlara dokunmaz.
  ...v.omit(exerciseSchema, ['id', 'video', 'alternatives']).entries,
  pattern: v.picklist(MOVEMENT_PATTERNS, msg((l) => text(l).pickPattern)),
  // Formda kural her zaman açık yazılır (varsayılan da olsa); egzersizde isteğe bağlı.
  progression: progressionSchema,
  videoUrl: v.pipe(
    v.string(),
    v.trim(),
    v.check(
      (value) => value === '' || parseVideoUrl(value) !== null,
      msg((l) => text(l).videoLink),
    ),
  ),
});
export type ExerciseInput = v.InferOutput<typeof exerciseFormSchema>;

export type Equipment = (typeof EQUIPMENT)[number];
export type Muscle = (typeof MUSCLES)[number];

/** Kasların bölgeleri (Göğüs, Omuz, Sırt…): kas listelerini sıralamak ve gruplamak için. Adlar `catalog` sözlüğünde. */
const MUSCLE_GROUP_PARTS = [
  { id: 'chest', muscles: ['chest_upper', 'chest_lower'] },
  { id: 'shoulders', muscles: ['delt_front', 'delt_side', 'delt_rear'] },
  { id: 'back', muscles: ['traps_upper', 'traps_mid', 'traps_lower', 'lats_upper', 'lats_mid', 'lats_lower', 'erectors', 'quadratus'] },
  { id: 'arms', muscles: ['biceps', 'triceps_long', 'triceps_lateral', 'forearm_flexors', 'forearm_extensors'] },
  { id: 'core', muscles: ['abs_upper', 'abs_lower', 'obliques', 'serratus'] },
  {
    id: 'legs',
    muscles: [
      'glutes',
      'glute_medius',
      'hip_flexors',
      'quadriceps',
      'adductors',
      'hamstrings_medial',
      'hamstrings_lateral',
      'gastroc_medial',
      'gastroc_lateral',
      'soleus',
      'tibialis',
    ],
  },
  { id: 'neck', muscles: ['neck', 'nape'] },
  { id: 'other', muscles: ['cardio'] },
] as const satisfies readonly { id: string; muscles: readonly Muscle[] }[];

export function muscleGroups(locale: Locale = DEFAULT_LOCALE): readonly { id: string; label: string; muscles: readonly Muscle[] }[] {
  const labels = catalogMessages(locale).muscleGroups;
  return MUSCLE_GROUP_PARTS.map((group) => ({ id: group.id, label: labels[group.id], muscles: group.muscles }));
}

/** Türkçe bölgeler (eski çağrılar); arayüz `muscleGroups(locale)` kullanır. */
export const MUSCLE_GROUPS: readonly { id: string; label: string; muscles: readonly Muscle[] }[] = muscleGroups('tr');

/**
 * Birden çok parçadan oluşan kaslar. Özetlerde bütün parçaları seçiliyse tek ad
 * yazılır: "Üst kanat, Orta kanat, Alt kanat" yerine "Kanat" (`src/lib/muscles.ts`).
 */
const MUSCLE_FAMILY_PARTS = [
  { id: 'chest', muscles: ['chest_upper', 'chest_lower'] },
  { id: 'shoulders', muscles: ['delt_front', 'delt_side', 'delt_rear'] },
  { id: 'traps', muscles: ['traps_upper', 'traps_mid', 'traps_lower'] },
  { id: 'lats', muscles: ['lats_upper', 'lats_mid', 'lats_lower'] },
  { id: 'lowerBack', muscles: ['erectors', 'quadratus'] },
  { id: 'triceps', muscles: ['triceps_long', 'triceps_lateral'] },
  { id: 'forearms', muscles: ['forearm_flexors', 'forearm_extensors'] },
  { id: 'abs', muscles: ['abs_upper', 'abs_lower'] },
  { id: 'hamstrings', muscles: ['hamstrings_medial', 'hamstrings_lateral'] },
  { id: 'calves', muscles: ['gastroc_medial', 'gastroc_lateral', 'soleus'] },
  { id: 'neck', muscles: ['neck', 'nape'] },
] as const satisfies readonly { id: string; muscles: readonly Muscle[] }[];

export function muscleFamilies(locale: Locale = DEFAULT_LOCALE): readonly { label: string; muscles: readonly Muscle[] }[] {
  const labels = catalogMessages(locale).muscleFamilies;
  return MUSCLE_FAMILY_PARTS.map((family) => ({ label: labels[family.id], muscles: family.muscles }));
}

/** Türkçe aileler (eski çağrılar ve muadil sıralamasının anahtarı, `familyOf`); arayüz `muscleFamilies(locale)` kullanır. */
export const MUSCLE_FAMILIES: readonly { label: string; muscles: readonly Muscle[] }[] = muscleFamilies('tr');

/**
 * Önceki sürümlerden kalan kas değerleri (12'li grup ve 24'lü liste) → yeni parçalar.
 * Repo'daki eski kayıtlar okunurken çevrilir; yoksa kayıt okunamaz ve listede görünmez.
 *
 * Çeviri her okumada yeni kayıtlara da uygulanır; bu yüzden burada yalnız güncel
 * listede (`MUSCLES`) artık olmayan adlar durur. Eski "Boyun" (`neck`) bugün de bir kas
 * (boyun ön yüzü); çevrilirse hedef `neck` + yardımcı `nape` her okumada `[neck, nape]`
 * hedefe dönüşürdü.
 */
const LEGACY_MUSCLES: Record<string, readonly Muscle[]> = {
  chest: ['chest_upper', 'chest_lower'],
  upper_chest: ['chest_upper'],
  shoulders: ['delt_front', 'delt_side', 'delt_rear'],
  front_delts: ['delt_front'],
  side_delts: ['delt_side'],
  rear_delts: ['delt_rear'],
  back: ['lats_upper', 'lats_mid', 'lats_lower'],
  lats: ['lats_upper', 'lats_mid', 'lats_lower'],
  upper_traps: ['traps_upper'],
  mid_back: ['traps_mid', 'traps_lower'],
  lower_back: ['erectors', 'quadratus'],
  triceps: ['triceps_long', 'triceps_lateral'],
  forearms: ['forearm_flexors', 'forearm_extensors'],
  core: ['abs_upper', 'abs_lower'],
  abs: ['abs_upper', 'abs_lower'],
  hamstrings: ['hamstrings_medial', 'hamstrings_lateral'],
  calves: ['gastroc_medial', 'gastroc_lateral', 'soleus'],
};

function migrateMuscles(values: unknown): unknown {
  if (!Array.isArray(values)) return values;
  return [...new Set(values.flatMap((value) => (typeof value === 'string' ? (LEGACY_MUSCLES[value] ?? [value]) : [value])))];
}

function migrateStoredExercise(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const { loadIncrementKg, targetMuscle, ...item } = input as Record<string, unknown>;
  // Eskiden tek hedef kas vardı (`targetMuscle`); artık liste.
  const primary = migrateMuscles(item.primaryMuscles ?? (targetMuscle === undefined ? undefined : [targetMuscle]));
  const secondary = migrateMuscles(item.secondaryMuscles);
  const stabilizer = migrateMuscles(item.stabilizerMuscles);
  const without = (values: unknown, ...others: unknown[]) =>
    Array.isArray(values)
      ? values.filter((muscle) => !others.some((list) => Array.isArray(list) && list.includes(muscle)))
      : values;
  return {
    ...item,
    // İlk sürümdeki ad: "artış" aslında aletin adımıydı.
    loadStepKg: item.loadStepKg ?? loadIncrementKg,
    // Aparat eskiden sabit bir kimlik ya da addı; artık havuzdaki kimlik.
    attachmentId:
      typeof item.attachmentId === 'string'
        ? item.attachmentId
        : typeof item.attachment === 'string'
          ? attachmentIdOf(item.attachment)
          : undefined,
    primaryMuscles: primary,
    secondaryMuscles: without(secondary, primary),
    stabilizerMuscles: without(stabilizer, primary, secondary),
  };
}

/** Repo'daki `data/exercises.json`: eski alan ve kas adları okunurken yenisine çevrilir. */
export const customExercisesSchema = v.array(v.pipe(v.unknown(), v.transform(migrateStoredExercise), exerciseSchema));

export function equipmentLabels(locale: Locale = DEFAULT_LOCALE): Record<Equipment, string> {
  return catalogMessages(locale).equipment;
}

export function categoryLabels(locale: Locale = DEFAULT_LOCALE): Record<Category, string> {
  return catalogMessages(locale).categories;
}

export function muscleLabels(locale: Locale = DEFAULT_LOCALE): Record<Muscle, string> {
  return catalogMessages(locale).muscles;
}

/** Türkçe adlar (eski çağrılar); arayüz `equipmentLabels(locale)` / `categoryLabels` / `muscleLabels` kullanır. */
export const EQUIPMENT_LABELS: Record<Equipment, string> = equipmentLabels('tr');
export const CATEGORY_LABELS: Record<Category, string> = categoryLabels('tr');
export const MUSCLE_LABELS: Record<Muscle, string> = muscleLabels('tr');
