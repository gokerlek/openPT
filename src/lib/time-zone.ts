/**
 * Uygulamanın saat dilimi (`AppConfig.timeZone`): "bugün", hafta sınırı, haftalık hedef ve kaçırılan gün buna göre
 * sayılır. Kurulum sihirbazı tarayıcınınkini gönderir, Ayarlar → Görünüm'de değişir. Sunucu yalnız IANA adını kabul
 * eder ("Europe/Istanbul", "America/New_York", "UTC"); "+03:00" gibi sabit fark ve Intl'in tanımadığı ad geçmez.
 */
export function isTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 64 || !/^[A-Za-z][\w+-]*(?:\/[\w+-]+)*$/.test(value)) return false;
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone.length > 0;
  } catch {
    return false;
  }
}

/** Ayarlardaki seçenekler: Intl'in bildiği IANA adları; kayıtlı değer listede yoksa (ör. "UTC", eski ad) başta. */
export function timeZoneOptions(current: string): string[] {
  const zones = Intl.supportedValuesOf('timeZone');
  return zones.includes(current) ? zones : [current, ...zones];
}
