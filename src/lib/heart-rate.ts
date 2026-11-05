import { dative } from './turkish.ts';

/**
 * Nabız (tasarım `docs/plans/2026-11-05-mobil-uygulama-ve-kolay-kurulum-design.md`, Paket C) — saf. Göğüs bandı ya da
 * nabız yayınlayan saat Web Bluetooth'la bağlanır (`me/antrenman/use-heart-rate.ts`); burada yalnız kararlar var:
 * - bandın gönderdiği ölçümü (0x2A37) çözmek;
 * - danışanın sınırları: PT'nin girdiği → yaştan → genel değerler (hangisi kullanıldıysa ekranda yazar);
 * - okumalar: boş ölçüm (ten teması yok) son geçerli ölçümü silmez; 5 sn yeni ölçüm gelmezse nabız yok sayılır;
 * - dinlenme: temel süre bitti ve nabız toparlanma sınırının üstündeyse uzar, 3 sn boyunca sınırda ya da altında kalınca
 *   biter; en çok 120 sn uzar (temel sürenin ilk bittiği andan; hiçbir düğme sıfırlamaz), sonra "Nabız hâlâ yüksek"
 *   notuyla biter. Nabız yoksa bugünkü sayaç (`workout-rest.ts`);
 * - uyarı: 5 sn boyunca uyarı sınırının üstündeyse bir kez; sınırın 5 altına inene kadar yeniden uyarmaz; ölçüm yoksa
 *   (bağlantı yok) düşer.
 * Kararlar zaman damgasından (epoch ms): dinlenme sayacı gibi, kare kare çağrılsa da geç fark edilse de doğru kalır.
 * Tıbbi cihaz değildir; nabız kayda yazılmaz.
 */

/** PT'nin girebileceği sınırların aralığı (bpm). */
export const HEART_RATE_MIN = 60;
export const HEART_RATE_MAX = 220;

/** Ne PT sınırı ne yaş varken. */
export const DEFAULT_HEART_LIMITS = { recovery: 120, alert: 170 } as const;

/** Yaştan: en yüksek nabız ≈ 208 − 0,7 × yaş (Tanaka); toparlanma ve uyarı onun payları. */
const AGE_RANGE = { min: 10, max: 100 } as const;
const RECOVERY_SHARE = 0.65;
const ALERT_SHARE = 0.9;

/** Dinlenme: nabız bu kadar süre sınırda ya da altında kalınca biter. */
export const REST_CALM_MS = 3000;
/** Dinlenme en çok bu kadar uzar. */
export const REST_EXTEND_MAX_MS = 120_000;
/** Uyarı: nabız bu kadar süre uyarı sınırının üstünde kalınca. */
export const ALERT_AFTER_MS = 5000;
/** Uyarıdan sonra nabız sınırın bu kadar altına inince uyarı yeniden kurulur. */
export const ALERT_REARM_BPM = 5;
/** Bu kadar süre geçerli ölçüm gelmezse nabız yok sayılır (band çıkarıldı, ölçmüyor, bağlantı sessizce düştü). */
export const READING_STALE_MS = 5000;
/**
 * Beklerken nabzın görüldüğü an en çok bu sıklıkla yazılır (kayıt her karede değişmesin). Geç fark etme sınırından
 * (`LATE_MS`, 2 sn) kısa: ekran açıkken bant koparsa bitiş sesli kalır.
 */
export const HOLD_SEEN_STEP_MS = 1000;

/* --- ölçüm --- */

/**
 * BLE Heart Rate Measurement (0x2A37). İlk bayt bayraklar: 0. bit değerin biçimi (0: 8 bit, 1: 16 bit küçük uçlu),
 * 1–2. bitler ten teması (2. bit destek, 1. bit temas); değer hemen arkasında. Enerji ve RR alanları sonra gelir, okunmaz.
 * Temas destekli bandın teması yoksa, değer 0'sa ya da veri eksikse ölçüm yok (null).
 */
export function parseHeartRateMeasurement(data: DataView): number | null {
  if (data.byteLength < 2) return null;
  const flags = data.getUint8(0);
  const contactSupported = (flags & 0b100) !== 0;
  const contact = (flags & 0b010) !== 0;
  if (contactSupported && !contact) return null;
  const wide = (flags & 0b001) !== 0;
  if (wide && data.byteLength < 3) return null;
  const bpm = wide ? data.getUint16(1, true) : data.getUint8(1);
  return bpm > 0 ? bpm : null;
}

/** Son geçerli ölçüm ve geldiği an. */
export type HeartReading = { bpm: number; at: number };

/** Bandın yeni ölçümü: geçerliyse alınır; boşsa (ten teması yok, 0) son geçerli ölçüm kalır, bayatlayana kadar. */
export function takeReading(last: HeartReading | null, bpm: number | null, now: number): HeartReading | null {
  return bpm !== null ? { bpm, at: now } : last;
}

/** Şu anki nabız: son geçerli ölçüm 5 sn'den eskiyse yok. */
export function readingBpm(last: HeartReading | null, now: number): number | null {
  return last && now - last.at < READING_STALE_MS ? last.bpm : null;
}

/* --- sınırlar --- */

export type HeartLimitSource = 'pt' | 'age' | 'default';
export type HeartLimits = { recovery: number; alert: number; source: HeartLimitSource };

/** Danışanın gördüğü kaynak (bağlantı panelinde, sınırların altında). */
export const HEART_LIMIT_SOURCE_TEXT: Record<HeartLimitSource, string> = {
  pt: 'Antrenörünün belirlediği sınırlar.',
  age: 'Yaşına göre hesaplandı.',
  default: 'Genel değerler; antrenörün ayrıca sınır girmedi.',
};

/** Sınırlar kullanılabilir mi: aralıkta, tam sayı ve toparlanma uyarıdan düşük. */
export function heartLimitsValid(recovery: number, alert: number): boolean {
  const inRange = (value: number) => Number.isInteger(value) && value >= HEART_RATE_MIN && value <= HEART_RATE_MAX;
  return inRange(recovery) && inRange(alert) && recovery < alert;
}

/** Yaştan sınırlar: en yüksek nabız 208 − 0,7 × yaş; toparlanma %65, uyarı %90 (yuvarlanmış). */
export function ageHeartLimits(age: number): { recovery: number; alert: number } {
  const max = 208 - 0.7 * age;
  return { recovery: Math.round(max * RECOVERY_SHARE), alert: Math.round(max * ALERT_SHARE) };
}

/**
 * Sırayla: PT'nin danışana girdiği sınırlar → yaş varsa yaştan → genel değerler. Anlamsız değer (elle bozulmuş kayıt,
 * aralık dışı yaş) atlanır, sıradakine geçilir.
 */
export function resolveHeartLimits(input: { pt?: { recovery: number; alert: number } | null; age?: number | null }): HeartLimits {
  const { pt, age } = input;
  if (pt && heartLimitsValid(pt.recovery, pt.alert)) return { recovery: pt.recovery, alert: pt.alert, source: 'pt' };
  if (typeof age === 'number' && Number.isFinite(age) && age >= AGE_RANGE.min && age <= AGE_RANGE.max) {
    return { ...ageHeartLimits(age), source: 'age' };
  }
  return { ...DEFAULT_HEART_LIMITS, source: 'default' };
}

export type HeartZone = 'calm' | 'work' | 'high';

/** Rozetin rengi: toparlanma ve altı sakin, uyarının üstü yüksek, arası çalışma. */
export function heartZone(bpm: number, limits: Pick<HeartLimits, 'recovery' | 'alert'>): HeartZone {
  if (bpm <= limits.recovery) return 'calm';
  return bpm > limits.alert ? 'high' : 'work';
}

/* --- dinlenme --- */

/**
 * Uzayan dinlenme: tavanın sayıldığı an (temel sürenin ilk bittiği an), nabzın sınıra ya da altına indiği an
 * (inmediyse null) ve nabzın son görüldüğü an (saniyede bir; nabız kesilirse bekleme o an biter).
 */
export type RestHold = { since: number; calmSince: number | null; seenAt: number };

export type RestHoldStep =
  | { kind: 'hold'; hold: RestHold }
  /** Dinlenme biter: bitiş anı (`at`) ve "Nabız hâlâ yüksek" notu (`high`). */
  | { kind: 'end'; at: number; high: boolean };

/**
 * Temel süre (`baseEnd`) bitti: dinlenme uzar mı, sürer mi, bitti mi. Tavan `origin`'den sayılır: temel sürenin ilk
 * bittiği an (beklerken +15'le uzatılan dinlenmede de o an; yoksa `baseEnd`). Temel süre tavandan sonra bittiyse yeniden
 * uzamaz. Değişmeyen bekleme aynı nesne döner (sayaç kare kare çağrılır, değişmeyen durum yazılmasın). Bitiş anı gerçekte
 * bittiği an: 3 sn'nin dolduğu an ya da tavan (geç fark edildiyse de). Nabız kesildiyse (bant koptu, sayfa yenilendi,
 * telefon kilitliyken bağlantı düştü) o an değil, nabzın son görüldüğü an; tavanı geçmez. Böylece çok sonra dönülünce
 * bitiş geç fark edilmiş sayılır: ses yok, aşım doğru.
 */
export function restHoldStep(
  hold: RestHold | null,
  bpm: number | null,
  recovery: number,
  baseEnd: number,
  now: number,
  origin: number = baseEnd,
): RestHoldStep {
  if (bpm === null) {
    if (!hold) return { kind: 'end', at: baseEnd, high: false };
    return { kind: 'end', at: Math.min(now, hold.seenAt, hold.since + REST_EXTEND_MAX_MS), high: false };
  }
  if (!hold) {
    if (bpm <= recovery) return { kind: 'end', at: baseEnd, high: false };
    if (baseEnd >= origin + REST_EXTEND_MAX_MS) return { kind: 'end', at: baseEnd, high: true };
  }
  const current = hold ?? { since: origin, calmSince: null, seenAt: now };
  const calmSince = bpm <= recovery ? (current.calmSince ?? now) : null;
  const cap = current.since + REST_EXTEND_MAX_MS;
  if (calmSince !== null && calmSince + REST_CALM_MS <= Math.min(now, cap)) return { kind: 'end', at: calmSince + REST_CALM_MS, high: false };
  // Sınıra gelindi: nabız o an inmişse (3 sn dolmasa da) not yok.
  if (now >= cap) return { kind: 'end', at: cap, high: calmSince === null };
  const seenAt = now - current.seenAt >= HOLD_SEEN_STEP_MS ? now : current.seenAt;
  return { kind: 'hold', hold: hold && hold.calmSince === calmSince && hold.seenAt === seenAt ? hold : { since: current.since, calmSince, seenAt } };
}

/** Dinlenme panelinde uzarken: "Nabzın 120'ye inince devam" (sınırın kendisi; sınırda ya da altında 3 sn). */
export function calmText(recovery: number): string {
  return `Nabzın ${dative(String(recovery))} inince devam`;
}

/* --- uyarı --- */

/** Uyarının durumu: nabzın uyarı sınırının üstüne çıktığı an (değilse null) ve uyarının çalıp yeniden kurulmadığı. */
export type HeartAlertState = { aboveSince: number | null; fired: boolean };
export const HEART_ALERT_IDLE: HeartAlertState = { aboveSince: null, fired: false };

/**
 * Nabız 5 sn boyunca uyarı sınırının üstündeyse bir kez uyarır (`fire`); sınırın 5 altına inene kadar yeniden uyarmaz.
 * Ölçüm yoksa (bağlantı kesildi, koptu ya da 5 sn ölçüm gelmedi) uyarı düşer (şerit kalkar); bağlantı dönünce yeniden
 * sayılır.
 */
export function heartAlertStep(state: HeartAlertState, bpm: number | null, alert: number, now: number): { state: HeartAlertState; fire: boolean } {
  if (bpm === null) return { state: state.aboveSince === null && !state.fired ? state : HEART_ALERT_IDLE, fire: false };
  const fired = state.fired && bpm > alert - ALERT_REARM_BPM;
  const aboveSince = bpm > alert ? (state.aboveSince ?? now) : null;
  const fire = !fired && aboveSince !== null && now - aboveSince >= ALERT_AFTER_MS;
  const next = { aboveSince, fired: fired || fire };
  return { state: next.aboveSince === state.aboveSince && next.fired === state.fired ? state : next, fire };
}

/** Uyarı şeridinin metni. */
export function heartAlertText(bpm: number): string {
  return `Nabzın çok yüksek (${bpm}). Tempoyu düşür ve dinlen.`;
}

/* --- deneme nabzı (yalnız yerel geliştirmede) --- */

/** Sette bu değere doğru yükselir, dinlenmede buna doğru iner (bpm) ve saniyedeki yaklaşma payları. */
const FAKE_WORK = { target: 185, rate: 0.05 } as const;
const FAKE_REST = { target: 85, rate: 0.008 } as const;

/**
 * Yapay nabzın bir adımı: sette uyarı sınırını yarım dakikada aşar, dinlenmede yavaş iner (90 sn'lik dinlenmede çoğu kez
 * toparlanma sınırının üstünde kalır, dinlenme uzar). Sınırlarda kalır.
 */
export function fakeHeartRate(bpm: number, resting: boolean, dtMs: number): number {
  const { target, rate } = resting ? FAKE_REST : FAKE_WORK;
  const next = target + (bpm - target) * Math.exp((-rate * dtMs) / 1000);
  return Math.min(HEART_RATE_MAX, Math.max(HEART_RATE_MIN, next));
}
