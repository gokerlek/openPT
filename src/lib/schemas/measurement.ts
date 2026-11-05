import * as v from 'valibot';
import { DEFAULT_LOCALE, type Locale } from '../../i18n/locale.ts';
import { healthMessages } from '../../i18n/messages/health/index.ts';
import { measurementsMessages } from '../../i18n/messages/measurements/index.ts';
import { msg } from '../../i18n/valibot.ts';
import { isCalendarDate, MEASUREMENT_SLOTS, SIDES, valueMax } from '../measurement-log.ts';
import { MEASUREMENT_IDS, type Sex } from '../measurements.ts';

/** Şema mesajı okuyanın dilinde (`issue.lang`; yoksa Türkçe). */
const m = (pick: (t: ReturnType<typeof measurementsMessages>['validation']) => string) => msg((locale) => pick(measurementsMessages(locale).validation));
const common = (pick: (t: ReturnType<typeof healthMessages>['validation']) => string) => msg((locale) => pick(healthMessages(locale).validation));

/**
 * Ölçüm girişi — PT'nin formu ve API gövdesi (SPEC §7.5). Kayıt şeması `health.ts`'te;
 * burası girdiyi tarif eder: bir gün, o günün doldurulan değerleri ve cinsiyet bilinmiyorsa o.
 */

export const SEXES = ['female', 'male'] as const satisfies readonly Sex[];

/** Base UI Select boş metni "değer yok" sayar: bilinmeyen cinsiyet için boş olmayan işaret. */
export const SEX_UNKNOWN = 'unknown';
export const SEX_CHOICES = [SEX_UNKNOWN, ...SEXES] as const;
export type SexChoice = (typeof SEX_CHOICES)[number];
/** Türkçe adlar (eski çağrılar); arayüz `sexLabels(locale)` kullanır. */
export const SEX_LABELS: Record<SexChoice, string> = measurementsMessages('tr').sexes;

export function sexLabels(locale: Locale = DEFAULT_LOCALE): Record<SexChoice, string> {
  return measurementsMessages(locale).sexes;
}

export const calendarDateSchema = v.pipe(v.string(m((t) => t.chooseDate)), v.check(isCalendarDate, m((t) => t.validDate)));

const DECIMAL = /^[-+]?(\d+([.,]\d*)?|[.,]\d+)$/;

/**
 * Ondalık metin → sayı: "81,5" ve "81.5" ikisi de 81,5 (Türkçe klavyede virgül, sayısal klavyede nokta
 * gelebilir). Boşluklar atılır; boş metin `undefined` (alan boş). Sayı olmayan metin NaN: şema
 * "Sayı gir." der, kayıtlı değer sessizce silinmez. Binlik ayırıcı kabul edilmez ("1.000,5" sayı değil).
 */
export function parseDecimal(text: string): number | undefined {
  const compact = text.replace(/\s/g, '');
  if (compact === '') return undefined;
  return DECIMAL.test(compact) ? Number(compact.replace(',', '.')) : Number.NaN;
}

/** Sayının kutudaki hali: Türkçede 81.5 → "81,5", İngilizcede "81.5" (binlik ayırıcısız, kutuda düzenlenebilsin). */
export function decimalText(value: number, locale: Locale = DEFAULT_LOCALE): string {
  return locale === 'tr' ? String(value).replace('.', ',') : String(value);
}

/** Formun değer alanları: her ölçüm (iki taraflıda her taraf) isteğe bağlı, virgüllü ya da noktalı sayı metni. */
const slotEntries = Object.fromEntries(
  MEASUREMENT_SLOTS.map((slot) => [
    slot.key,
    v.optional(
      v.pipe(
        v.string(),
        v.transform(parseDecimal),
        v.optional(
          v.pipe(
            v.number(common((t) => t.number)),
            v.minValue(0, common((t) => t.nonNegative)),
            v.maxValue(valueMax(slot.id), common((t) => t.max(valueMax(slot.id)))),
          ),
        ),
      ),
    ),
  ]),
) as Record<string, v.OptionalSchema<v.GenericSchema<string, number | undefined>, undefined>>;

export const measurementFormSchema = v.object({
  date: calendarDateSchema,
  sex: v.picklist(SEX_CHOICES, m((t) => t.sex)),
  values: v.object(slotEntries),
});
export type MeasurementFormInput = v.InferOutput<typeof measurementFormSchema>;

/** API'de değer sayı ya da ondalık metni ("81,5", "81.5"); ikisi de sayıya çevrilir. */
const decimalValueSchema = v.pipe(
  v.union([v.number(), v.string()], common((t) => t.number)),
  v.transform((value) => (typeof value === 'number' ? value : (parseDecimal(value) ?? Number.NaN))),
  v.number(common((t) => t.number)),
);

const valueSchema = v.object({
  id: v.picklist(MEASUREMENT_IDS, common((t) => t.unknownMeasurement)),
  value: decimalValueSchema,
  side: v.optional(v.picklist(SIDES, m((t) => t.side))),
});

const valuesSchema = v.pipe(
  v.array(valueSchema),
  v.minLength(1, m((t) => t.atLeastOne)),
  v.maxLength(MEASUREMENT_SLOTS.length, m((t) => t.tooMany)),
);

/** Yeni ölçüm: güne eklenir (aynı ölçüm varsa yenisi geçer). */
export const measurementAddSchema = v.object({
  date: calendarDateSchema,
  sex: v.optional(v.picklist(SEXES, m((t) => t.sex))),
  values: valuesSchema,
});
export type MeasurementAdd = v.InferOutput<typeof measurementAddSchema>;

/** Günü düzenleme: günün bütün değerleri gönderilir; gün adresten gelir. */
export const measurementDaySchema = v.object({
  sex: v.optional(v.picklist(SEXES, m((t) => t.sex))),
  values: valuesSchema,
});
export type MeasurementDayInput = v.InferOutput<typeof measurementDaySchema>;
