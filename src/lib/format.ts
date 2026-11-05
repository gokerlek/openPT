import { commonMessages } from '../i18n/messages/common/index.ts';
import { intlLocale, type Locale } from '../i18n/locale.ts';

/**
 * Sayı ve tarih biçimi, dile göre (`getFormat(locale)`); sunucu ve istemci ortak. Türkçe: ondalık virgül (2,5 kg),
 * binlik nokta, "%30", "23 Eylül 2026". İngilizce `en-GB`: "2.5 kg", "30%", "23 September 2026", 24 saat.
 * Dışa açık `formatX` fonksiyonları Türkçedir (eski çağrılar ve testler).
 */
export type Format = {
  number: (value: number) => string;
  kg: (value: number) => string;
  /** Birimli sayı: "82,5 cm", "12,4 sn"; yüzde işareti Türkçede başa gelir: "%30", İngilizcede sona: "30%". */
  withUnit: (value: number, unit: string) => string;
  /** İşaretli fark: "+1,5 cm", "−2,3 sn" (eksi için gerçek eksi işareti). */
  signedWithUnit: (value: number, unit: string) => string;
  /** Tarih: "23 Eylül 2026". Saat dilimi uygulama ayarından (sunucu UTC'de çalışır). */
  date: (iso: string, timeZone: string) => string;
  /** Tarih ve saat: "23 Eylül 2026 14:05". */
  dateTime: (iso: string, timeZone: string) => string;
  /**
   * Takvim günü ("2026-09-01" → "1 Eylül 2026"). Gün bir an değil, tarihtir: saat dilimine
   * çevrilirse batıdaki bir saat diliminde bir önceki güne kayar; bu yüzden UTC'de biçimlenir.
   */
  day: (day: string) => string;
  /** Kısa takvim günü, grafik ekseni için: "1 Eyl" ya da yıllar karışıyorsa "1 Eyl 2026". */
  dayShort: (day: string, withYear?: boolean) => string;
  /**
   * Yakın bir an (ör. taslağın kaydedildiği): "az önce", "5 dakika önce", "bugün 14:05",
   * "dün 14:05", daha eskisi "23 Eylül 2026 14:05". Gün sınırı uygulamanın saat dilimine göre.
   */
  recent: (iso: string, timeZone: string, now?: Date) => string;
  /** Saat: "14:05". */
  time: (iso: string, timeZone: string) => string;
};

function createFormat(locale: Locale): Format {
  const intl = intlLocale(locale);
  const t = commonMessages(locale).time;
  const number = new Intl.NumberFormat(intl, { maximumFractionDigits: 2 });
  const withUnit = (value: number, unit: string) =>
    unit === '%' ? (locale === 'tr' ? `%${number.format(value)}` : `${number.format(value)}%`) : `${number.format(value)} ${unit}`;
  const dateTime = (iso: string, timeZone: string) =>
    new Intl.DateTimeFormat(intl, { dateStyle: 'long', timeStyle: 'short', timeZone }).format(new Date(iso));
  const time = (iso: string, timeZone: string) => new Intl.DateTimeFormat(intl, { timeStyle: 'short', timeZone }).format(new Date(iso));
  return {
    number: (value) => number.format(value),
    kg: (value) => `${number.format(value)} kg`,
    withUnit,
    signedWithUnit: (value, unit) => {
      const sign = value > 0 ? '+' : value < 0 ? '−' : '±';
      return `${sign}${withUnit(Math.abs(value), unit)}`;
    },
    date: (iso, timeZone) =>
      new Intl.DateTimeFormat(intl, { day: 'numeric', month: 'long', year: 'numeric', timeZone }).format(new Date(iso)),
    dateTime,
    day: (day) =>
      new Intl.DateTimeFormat(intl, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`)),
    dayShort: (day, withYear = false) =>
      new Intl.DateTimeFormat(intl, {
        day: 'numeric',
        month: 'short',
        ...(withYear ? { year: 'numeric' as const } : {}),
        timeZone: 'UTC',
      }).format(new Date(`${day}T00:00:00Z`)),
    recent: (iso, timeZone, now = new Date()) => {
      const at = new Date(iso);
      const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000);
      if (minutes < 1) return t.justNow;
      if (minutes < 60) return t.minutesAgo(minutes);
      const day = todayIn(timeZone, at);
      const today = todayIn(timeZone, now);
      // Dün takvimden: 24 saat çıkarmak yaz saati geçişinde bir günü atlayabilirdi.
      const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
      if (day === today) return t.todayAt(time(iso, timeZone));
      if (day === yesterday) return t.yesterdayAt(time(iso, timeZone));
      return dateTime(iso, timeZone);
    },
    time,
  };
}

const formats = new Map<Locale, Format>();

/** Dilin biçimleri (bir kez kurulur): `getFormat(locale).kg(2.5)`. */
export function getFormat(locale: Locale): Format {
  let format = formats.get(locale);
  if (!format) {
    format = createFormat(locale);
    formats.set(locale, format);
  }
  return format;
}

const tr = getFormat('tr');

export function formatNumber(value: number): string {
  return tr.number(value);
}

export function formatKg(value: number): string {
  return tr.kg(value);
}

/** Birimli sayı: "82,5 cm", "12,4 sn"; yüzde işareti Türkçede başa gelir: "%30". */
export function formatWithUnit(value: number, unit: string): string {
  return tr.withUnit(value, unit);
}

/** İşaretli fark: "+1,5 cm", "−2,3 sn" (eksi için gerçek eksi işareti). */
export function formatSignedWithUnit(value: number, unit: string): string {
  return tr.signedWithUnit(value, unit);
}

/** Türkçe tarih: "23 Eylül 2026". Saat dilimi uygulama ayarından (sunucu UTC'de çalışır). */
export function formatDate(iso: string, timeZone: string): string {
  return tr.date(iso, timeZone);
}

/** Türkçe tarih ve saat: "23 Eylül 2026 14:05". */
export function formatDateTime(iso: string, timeZone: string): string {
  return tr.dateTime(iso, timeZone);
}

/**
 * Takvim günü ("2026-09-01" → "1 Eylül 2026"). Gün bir an değil, tarihtir: saat dilimine
 * çevrilirse batıdaki bir saat diliminde bir önceki güne kayar; bu yüzden UTC'de biçimlenir.
 */
export function formatDay(day: string): string {
  return tr.day(day);
}

/** Kısa takvim günü, grafik ekseni için: "1 Eyl" ya da yıllar karışıyorsa "1 Eyl 2026". */
export function formatDayShort(day: string, withYear = false): string {
  return tr.dayShort(day, withYear);
}

/** Uygulamanın saat dilimine göre bugünün takvim günü: "2026-09-24". */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  // en-CA biçimi YYYY-AA-GG verir; parçalardan kurmak yerel ayar farkına karşı daha sağlam.
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).formatToParts(now);
  const part = (type: 'year' | 'month' | 'day') => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/**
 * Yakın bir an (ör. taslağın kaydedildiği): "az önce", "5 dakika önce", "bugün 14:05",
 * "dün 14:05", daha eskisi "23 Eylül 2026 14:05". Gün sınırı uygulamanın saat dilimine göre.
 */
export function formatRecent(iso: string, timeZone: string, now: Date = new Date()): string {
  return tr.recent(iso, timeZone, now);
}
