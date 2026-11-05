import * as v from 'valibot';
import { DEFAULT_LOCALE, LOCALES, type Locale } from '../../i18n/locale.ts';
import { catalogMessages } from '../../i18n/messages/catalog/index.ts';
import { clientValidationMessages } from '../../i18n/messages/client-validation/index.ts';
import { msg } from '../../i18n/valibot.ts';
import { HEART_RATE_MAX, HEART_RATE_MIN } from '../heart-rate.ts';

/**
 * Danışan şeması — sunucu ve istemci ortak (SPEC §3, §4).
 *
 * Danışanın her şeyi kendi özel repo'sunda (`client-<id>`): `client.json` bu kayıttır,
 * `invite.json` davet kodunun özeti. Uygulama repo'sundaki `data/clients.json` yalnız
 * kimlik ve durum tutar — isim, not hiçbir koşulda oraya yazılmaz.
 */

/** Danışan kimliği: `c_` + 6-24 küçük harf/rakam. Repo adına doğrudan girdiği için dar tutulur. */
export const CLIENT_ID_PATTERN = /^c_[a-z0-9]{6,24}$/;

export const CLIENT_NAME_MAX = 60;
export const CLIENT_NOTE_MAX = 500;

export const CLIENT_STATUSES = ['active', 'paused', 'archived'] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];
export function clientStatusLabels(locale: Locale = DEFAULT_LOCALE): Record<ClientStatus, string> {
  return catalogMessages(locale).clientStatuses;
}

/** Türkçe adlar (eski çağrılar); arayüz `clientStatusLabels(locale)` kullanır. */
export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = clientStatusLabels('tr');

/**
 * Sağlık modülünün parçaları. PT danışanı açarken hangilerinin tutulacağını seçer;
 * danışan onayı bu listeyi kapsar — sonradan eklenen parça yeniden onay ister.
 */
export const HEALTH_FIELDS = ['conditions', 'readiness', 'check_in', 'measurements', 'screening'] as const;
export type HealthField = (typeof HEALTH_FIELDS)[number];
export function healthFieldInfo(locale: Locale = DEFAULT_LOCALE): Record<HealthField, { label: string; description: string }> {
  return catalogMessages(locale).healthFields;
}

/** Türkçe metinler (eski çağrılar); arayüz `healthFieldInfo(locale)` kullanır. */
export const HEALTH_FIELD_INFO: Record<HealthField, { label: string; description: string }> = healthFieldInfo('tr');

/**
 * Parça başına onay metninin sürümü (tasarım `kisit-tarama.md` §5.1): bir parçanın metni ya da amacı değişince
 * yalnız onun sürümü artar ve yalnız o parça yeniden sorulur; öteki parçaların kaydı kesintisiz sürer (sürüm
 * artışı ağrı takibini ve kırmızı bayrak sorusunu kapatmasın). Kısıtlar ve tarama 2026-10'da genişledi:
 * danışanın bildirimi, antrenmandaki not, tarama ipuçları.
 */
export const HEALTH_FIELD_VERSIONS: Record<HealthField, string> = {
  conditions: '2026-10',
  readiness: '2026-09',
  check_in: '2026-09',
  measurements: '2026-09',
  screening: '2026-10',
};

/** Onay metninin güncel sürümü (parça sürümlerinin en yenisi): danışanın ekranı bununla onay verir. */
export const HEALTH_CONSENT_VERSION = '2026-10';
export const AI_CONSENT_VERSION = '2026-10-v2';

/**
 * Danışanın uygulamaya gelmeden önceki antrenman geçmişi (tasarım §5.2 "Genel deneyim tabanı", açık
 * soru 4): her hareketin aşamasına taban olur. Yeni → taban yok (her hareket Tanışma'dan başlar); 6 ay+
 * → Tanışma tek seans (yalnız ayar), sonra en az Başlangıç; 1 yıl+ → Tanışma tek seans, sonra en az Orta.
 */
export const TRAINING_EXPERIENCES = ['new', 'six_months', 'one_year'] as const;
export type TrainingExperience = (typeof TRAINING_EXPERIENCES)[number];
export function trainingExperienceLabels(locale: Locale = DEFAULT_LOCALE): Record<TrainingExperience, string> {
  return catalogMessages(locale).trainingExperiences;
}

/** Türkçe adlar (eski çağrılar); arayüz `trainingExperienceLabels(locale)` kullanır. */
export const TRAINING_EXPERIENCE_LABELS: Record<TrainingExperience, string> = trainingExperienceLabels('tr');

export const clientIdSchema = v.pipe(v.string(), v.regex(CLIENT_ID_PATTERN, msg((l) => clientValidationMessages(l).clientId)));

/** Nabız sınırı (bpm): tam sayı, `HEART_RATE_MIN`–`HEART_RATE_MAX`. */
const heartRateBpmSchema = v.pipe(
  v.number(msg((l) => clientValidationMessages(l).number)),
  v.integer(msg((l) => clientValidationMessages(l).integer)),
  v.minValue(HEART_RATE_MIN, msg((l) => clientValidationMessages(l).atLeast(HEART_RATE_MIN))),
  v.maxValue(HEART_RATE_MAX, msg((l) => clientValidationMessages(l).atMost(HEART_RATE_MAX))),
);

const timestamp = v.pipe(v.string(), v.isoTimestamp());

const nameSchema = v.pipe(
  v.string(msg((l) => clientValidationMessages(l).nameRequired)),
  v.trim(),
  v.minLength(2, msg((l) => clientValidationMessages(l).nameShort)),
  v.maxLength(CLIENT_NAME_MAX, msg((l) => clientValidationMessages(l).maxChars(CLIENT_NAME_MAX))),
);
const noteSchema = v.pipe(
  v.string(),
  v.trim(),
  v.maxLength(CLIENT_NOTE_MAX, msg((l) => clientValidationMessages(l).maxChars(CLIENT_NOTE_MAX))),
);
const healthFieldsSchema = v.pipe(
  v.array(v.picklist(HEALTH_FIELDS)),
  v.maxLength(HEALTH_FIELDS.length),
);

const consentVersion = v.pipe(v.string(), v.maxLength(20));

export const healthConsentSchema = v.object({
  granted: v.boolean(),
  /** Onay verildiğinde ekrandaki metnin sürümü. */
  version: v.string(),
  /**
   * Parça başına onaylanan sürüm (`HEALTH_FIELD_VERSIONS`). Eski onayda yok: her parça `version` ile onaylanmış
   * sayılır (bugünkü kayıtlarda 2026-09).
   */
  versions: v.optional(
    v.object({
      conditions: v.optional(consentVersion),
      readiness: v.optional(consentVersion),
      check_in: v.optional(consentVersion),
      measurements: v.optional(consentVersion),
      screening: v.optional(consentVersion),
    }),
  ),
  /** Onayın kapsadığı parçalar. */
  fields: healthFieldsSchema,
  at: timestamp,
  /** Onay metninin gösterildiği dil; eski onaylarda yok (Türkçe gösterilmişti). */
  lang: v.optional(v.picklist(LOCALES)),
});
export type HealthConsent = v.InferOutput<typeof healthConsentSchema>;

export const clientSchema = v.object({
  id: clientIdSchema,
  name: nameSchema,
  /** PT'nin kendine notu. */
  note: v.optional(noteSchema),
  createdAt: timestamp,
  status: v.picklist(CLIENT_STATUSES),
  /** Durumun son değiştiği an (ör. duraklatmadan dönüş): kaçan gün penceresi bundan önce sayılmaz (`attention.ts`). */
  statusChangedAt: v.optional(timestamp),
  modules: v.object({
    ai: v.optional(v.object({ enabled: v.boolean() })),
    health: v.object({
      enabled: v.boolean(),
      fields: healthFieldsSchema,
      /** Modülün son açıldığı an; kapalıysa yok. */
      enabledAt: v.optional(timestamp),
    }),
  }),
  consents: v.object({ health: v.optional(healthConsentSchema), ai: v.optional(v.object({ granted: v.boolean(), version: v.string(), at: timestamp })) }),
  /** PT'nin girdiği antrenman geçmişi; yoksa yeni sayılır (öneri motorunda aşama tabanı). */
  training: v.optional(v.object({ experience: v.picklist(TRAINING_EXPERIENCES) })),
  /**
   * PT'nin girdiği nabız sınırları (bpm; Paket C): dinlenme nabız `recovery`'ye inene kadar uzar, `alert`'in üstünde
   * danışan uyarılır. Yoksa otomatik (`resolveHeartLimits`: yaştan ya da genel 120/170).
   */
  heartRate: v.optional(v.object({ recovery: heartRateBpmSchema, alert: heartRateBpmSchema })),
  /**
   * Oturum kuşağı: danışanın oturum çerezi bu sayıyı taşır. PT "erişimi kapat" deyince
   * artar ve açık bütün oturumlar bir sonraki istekte düşer.
   */
  access: v.object({
    version: v.pipe(v.number(), v.integer(), v.minValue(1)),
    /** İlk ve son davetle giriş. Davet dosyası her yeni kodda ezildiği için katılım burada tutulur. */
    joinedAt: v.optional(timestamp),
    lastJoinAt: v.optional(timestamp),
    /** PT'nin erişimi son kapattığı an; sonraki girişte kalkar. */
    revokedAt: v.optional(timestamp),
    /**
     * Danışanın şifreyi son belirlediği an (yalnız bilgi; özeti `auth.json`'da, SPEC §5). "Erişimi
     * kapat" siler: kapatmadan önceki şifre açmaz, danışan yeni kare kodla girip yenisini belirler.
     */
    passwordSetAt: v.optional(timestamp),
    /**
     * Şifre girişinin çok sayıda yanlış denemeden sonra kapandığı an (PT ekranında rozet; SPEC §5).
     * Yeni kare kodla girilince ya da yeni şifre belirlenince kalkar.
     */
    loginLockedAt: v.optional(timestamp),
  }),
  /** Faz 7: bağlantı verilen diğer danışanlar (yalnız kimlik). */
  visibleTo: v.array(clientIdSchema),
  /**
   * PT'nin bildirimleri (Genel bakış, tasarım §4.6): `seenAt`'ten yeni bildirim okunmamıştır. PT yazar;
   * bildirimler ayrı dosyada tutulmaz, danışanın kayıtlarından türetilir (`notices.ts`).
   */
  inbox: v.optional(v.object({ seenAt: v.optional(timestamp) })),
});
export type Client = v.InferOutput<typeof clientSchema>;

/** Uygulama repo'sundaki `data/clients.json`: yalnız kimlik ve durum. */
export const clientIndexSchema = v.array(v.object({ id: clientIdSchema, status: v.picklist(CLIENT_STATUSES) }));
export type ClientIndexEntry = v.InferOutput<typeof clientIndexSchema>[number];

/** `invite.json`: kodun kendisi hiçbir yerde saklanmaz, yalnız anahtarlı özeti. */
export const inviteSchema = v.object({
  codeHash: v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/)),
  createdAt: timestamp,
  expiresAt: timestamp,
  used: v.boolean(),
  usedAt: v.optional(timestamp),
  /** Yanlış kod denemeleri; sınıra gelince davet kilitlenir, PT yenisini üretir. */
  attempts: v.pipe(v.number(), v.integer(), v.minValue(0)),
});
export type Invite = v.InferOutput<typeof inviteSchema>;

/** Formdaki antrenman geçmişi: verilmezse kayıttaki kalır (yeni danışanda "yeni"). */
const trainingExperienceSchema = v.optional(v.picklist(TRAINING_EXPERIENCES, msg((l) => clientValidationMessages(l).pickExperience)));

/**
 * Formdaki nabız sınırı: metin kutusu; boş → null (otomatik). Yalnız rakamlar: `Number` "0x78", "1e2", "+120" gibi
 * biçimleri de sayı sayardı.
 */
const heartRateInputSchema = v.optional(
  v.pipe(
    v.string(),
    v.trim(),
    v.regex(/^\d*$/, msg((l) => clientValidationMessages(l).digitsOnly)),
    v.transform((text) => (text === '' ? null : Number(text))),
    v.nullable(heartRateBpmSchema),
  ),
);
/**
 * Kayıt ucunda nabız sınırı: JSON tam sayı (metin hiç kabul edilmez), boşaltıldıysa null; hiç yoksa (eski istemci)
 * kayıttaki kalır.
 */
const heartRateSaveSchema = v.optional(v.nullable(heartRateBpmSchema));

const HEART_RATE_PAIR = msg((l) => clientValidationMessages(l).heartPair);
const HEART_RATE_ORDER = msg((l) => clientValidationMessages(l).heartOrder);

/** PT'nin formu. Durum yalnız düzenlemede görünür; yeni danışan aktif başlar. */
export const clientFormSchema = v.pipe(
  v.object({
    name: nameSchema,
    note: noteSchema,
    status: v.picklist(CLIENT_STATUSES, msg((l) => clientValidationMessages(l).pickStatus)),
    aiEnabled: v.optional(v.boolean()),
    healthEnabled: v.boolean(),
    healthFields: healthFieldsSchema,
    trainingExperience: trainingExperienceSchema,
    heartRecovery: heartRateInputSchema,
    heartAlert: heartRateInputSchema,
  }),
  v.forward(
    v.partialCheck(
      [['healthEnabled'], ['healthFields']],
      (input) => !input.healthEnabled || input.healthFields.length > 0,
      msg((l) => clientValidationMessages(l).pickHealthPart),
    ),
    ['healthFields'],
  ),
  // Nabız sınırları ikisi birlikte girilir (ya da ikisi de boş: otomatik); hata boş kalan alana düşer.
  v.forward(v.partialCheck([['heartRecovery'], ['heartAlert']], (input) => input.heartRecovery == null || input.heartAlert != null, HEART_RATE_PAIR), ['heartAlert']),
  v.forward(v.partialCheck([['heartRecovery'], ['heartAlert']], (input) => input.heartAlert == null || input.heartRecovery != null, HEART_RATE_PAIR), ['heartRecovery']),
  v.forward(
    v.partialCheck([['heartRecovery'], ['heartAlert']], (input) => input.heartRecovery == null || input.heartAlert == null || input.heartRecovery < input.heartAlert, HEART_RATE_ORDER),
    ['heartRecovery'],
  ),
);
export type ClientInput = v.InferOutput<typeof clientFormSchema>;

/** Kayıt ucu: kimliksiz gelen istek yeni danışandır. */
export const clientSaveSchema = v.pipe(
  v.object({
    id: v.optional(clientIdSchema),
    name: nameSchema,
    note: noteSchema,
    status: v.picklist(CLIENT_STATUSES, msg((l) => clientValidationMessages(l).pickStatus)),
    aiEnabled: v.optional(v.boolean()),
    healthEnabled: v.boolean(),
    healthFields: healthFieldsSchema,
    trainingExperience: trainingExperienceSchema,
    heartRecovery: heartRateSaveSchema,
    heartAlert: heartRateSaveSchema,
  }),
  v.forward(
    v.partialCheck(
      [['healthEnabled'], ['healthFields']],
      (input) => !input.healthEnabled || input.healthFields.length > 0,
      msg((l) => clientValidationMessages(l).pickHealthPart),
    ),
    ['healthFields'],
  ),
  v.forward(v.partialCheck([['heartRecovery'], ['heartAlert']], (input) => input.heartRecovery == null || input.heartAlert != null, HEART_RATE_PAIR), ['heartAlert']),
  v.forward(v.partialCheck([['heartRecovery'], ['heartAlert']], (input) => input.heartAlert == null || input.heartRecovery != null, HEART_RATE_PAIR), ['heartRecovery']),
  v.forward(
    v.partialCheck([['heartRecovery'], ['heartAlert']], (input) => input.heartRecovery == null || input.heartAlert == null || input.heartRecovery < input.heartAlert, HEART_RATE_ORDER),
    ['heartRecovery'],
  ),
);

/** Kaydın antrenman geçmişi: formda seçildiyse o, değilse kayıttaki (yoksa alan yazılmaz). */
export function trainingOf(
  input: Pick<ClientInput, 'trainingExperience'>,
  current?: Client['training'],
): Pick<Client, 'training'> {
  const experience = input.trainingExperience ?? current?.experience;
  return experience ? { training: { experience } } : {};
}

/**
 * Kaydın nabız sınırları: formda ikisi de sayıysa onlar; boşaltıldıysa (null) alan düşer, sınırlar otomatiğe döner;
 * formda hiç gelmediyse (eski istemci) kayıttaki kalır.
 */
export function heartRateOf(
  input: Pick<ClientInput, 'heartRecovery' | 'heartAlert'>,
  current?: Client['heartRate'],
): Pick<Client, 'heartRate'> {
  const { heartRecovery: recovery, heartAlert: alert } = input;
  if (recovery === undefined && alert === undefined) return current ? { heartRate: current } : {};
  return typeof recovery === 'number' && typeof alert === 'number' ? { heartRate: { recovery, alert } } : {};
}
