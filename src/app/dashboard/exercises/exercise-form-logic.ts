// Göreli ve uzantılı içe aktarma: bu yardımcılar `node --test` ile de sınanır (`exercise-form-logic.test.ts`).
import { DEFAULT_LOCALE, type Locale } from '../../../i18n/locale.ts';
import { catalogMessages } from '../../../i18n/messages/catalog/index.ts';
import { ptLibraryMessages } from '../../../i18n/messages/pt-library/index.ts';
import { lower } from '../../../i18n/text.ts';
import { cardioKind } from '../../../lib/cardio.ts';
import { describeDeviceLoads, loadSpecFor, type DeviceLoadSettings } from '../../../lib/device-loads.ts';
import { defaultRule, progressionLabels, rirLabels, type ProgressionRule, type TrackingType } from '../../../lib/progression.ts';
import { categoryLabels, type Category, type ExerciseInput } from '../../../lib/schemas/exercise.ts';
import { parseVideoUrl } from '../../../lib/video.ts';

/** Egzersiz formunun saf yardımcıları: gönderilen gövde, cihazdan gelen yük, varsayılan kural. */

export function sameRule(a: ProgressionRule | undefined, b: ProgressionRule): boolean {
  return (
    a?.scheme === b.scheme && a.targetMin === b.targetMin && a.targetMax === b.targetMax && a.targetRir === b.targetRir
  );
}

/** Türün varsayılan kuralı tek satırda: "Varsayılan: bileşik 6–10 tekrar · çift ilerleme · 2 tekrar yedekte". */
export function describeDefaultRule(category: Category, trackingType: TrackingType, locale: Locale = DEFAULT_LOCALE): string {
  const time = catalogMessages(locale).time;
  const rule = defaultRule(category, trackingType);
  const unit = trackingType === 'duration' ? time.secondsUnit : time.reps(rule.targetMax);
  const parts = [`${rule.targetMin}–${rule.targetMax} ${unit}`, lower(locale, progressionLabels(locale)[rule.scheme])];
  // Süreli harekette ve ilerlemesiz kuralda yedekte tekrar öneriyi değiştirmez.
  if (trackingType !== 'duration' && rule.scheme !== 'none') parts.push(lower(locale, rirLabels(locale)[rule.targetRir] ?? ''));
  return ptLibraryMessages(locale).exerciseFormLogic.defaultRule(lower(locale, categoryLabels(locale)[category]), parts.join(' · '));
}

/** Cihazın ayarından gelen yük alanları (formda salt okunur gösterilir). */
export type DeviceLoadFields = {
  /** Düzenli adım (bar, plaka yüklemeli, blok); dambıl/kettlebell setinde `null` (ağırlıklar setten). */
  stepKg: number | null;
  /** En hafif ayar: bar/kızak, ilk blok ya da setin en hafifi. */
  minKg: number;
  /** Cihazın ağırlık ayarının kısa anlatımı (ara ağırlıklar, makara, set). */
  summary: string;
};

/**
 * Cihaz seçiliyken ağırlık adımı ve taban cihazdan gelir (öneri motoru `loadSpecFor` ile aynı karar);
 * cihaz ağırlık vermiyorsa (istasyon, bant, eksik ayar) ya da cihaz yoksa `null`: egzersizin kendi
 * değerleri düzenlenir. Egzersizin değerleri formda kalır; cihaz silinirse onlarla devam edilir.
 */
export function deviceLoadFields(device: DeviceLoadSettings | undefined, locale: Locale = DEFAULT_LOCALE): DeviceLoadFields | null {
  if (!device) return null;
  // Egzersizin değerleri yerine NaN: cihaz ağırlık vermiyorsa sonuç NaN kalır.
  const spec = loadSpecFor({ trackingType: 'weight_reps', loadStepKg: Number.NaN, minLoadKg: Number.NaN }, device);
  if (Number.isNaN(spec.minLoadKg)) return null;
  const blockStep = device.kind === 'selectorized' || device.kind === 'cable' ? (device.stepKg ?? null) : null;
  return {
    stepKg: spec.loadsKg ? blockStep : spec.loadStepKg,
    minKg: spec.minLoadKg,
    summary: describeDeviceLoads(device, locale),
  };
}

/**
 * Formun değerlerinden `/api/exercises` gövdesi: video bağlantısı sağlayıcı + kimliğe çevrilir
 * (tanınmayan bağlantı gitmez); aparat yalnız cihazın aparatlarından biriyse gider (cihaz değişince
 * gizli kalmış seçim düşer); düzenlemede mevcut kimlik eklenir, yenide sunucu başlıktan üretir.
 */
export function toExercisePayload(
  values: ExerciseInput,
  options: { editingId?: string; attachmentIds: readonly string[] },
) {
  const { videoUrl: link, attachmentId, locomotion, ...rest } = values;
  const video = link ? (parseVideoUrl(link) ?? undefined) : undefined;
  const attachment = attachmentId && options.attachmentIds.includes(attachmentId) ? attachmentId : undefined;
  // Yürüyüş/koşu yalnız süreli kardiyo harekette ve açıkken yazılır (gizli kalmış anahtar düşer).
  const walk = locomotion === true && cardioKind(values) !== null;
  return { ...rest, attachmentId: attachment, video, ...(walk ? { locomotion: true } : {}), ...(options.editingId ? { id: options.editingId } : {}) };
}

/** Kütüphane değişikliğinin şablon ve programlara yansıdığını söyleyen satır (kullanılabilirlik 16). */
export function libraryImpactNote(locale: Locale = DEFAULT_LOCALE): string {
  return ptLibraryMessages(locale).exerciseFormLogic.libraryImpact;
}

/** Türkçe metin (eski çağrılar ve testler); arayüz `libraryImpactNote(locale)` kullanır. */
export const LIBRARY_IMPACT_NOTE = libraryImpactNote('tr');

/**
 * Düzenlemede cihaz açılıştakinden farklı mı (cihazsız ile boş seçim aynı): satırında kendi cihazı
 * olmayan şablon ve program satırları egzersizinkini kullanır, değişiklik onlara da geçer. Kural için
 * `sameRule` (satırında kendi kuralı olmayanlar egzersizin kuralını kullanır).
 */
export function sameDevice(a: string | undefined, b: string | undefined): boolean {
  return (a ?? '') === (b ?? '');
}
