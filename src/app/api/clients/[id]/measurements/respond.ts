import 'server-only';
import { NextResponse } from 'next/server';
import type * as v from 'valibot';
import { messageOf } from '@/i18n/errors';
import { DEFAULT_LOCALE, type Locale } from '@/i18n/locale';
import { healthMessages } from '@/i18n/messages/health';
import { measurementsMessages } from '@/i18n/messages/measurements';
import { readAppConfig } from '@/lib/config';
import { todayIn } from '@/lib/format';
import { GithubError } from '@/lib/github/client';
import { checkValues, type MeasurementValue } from '@/lib/measurement-log';

/**
 * Ölçüm uçlarının ortak yanıtları. Hata mesajları değer taşımaz: sağlık verisi yanıta ya da
 * günlüğe sızmasın (yalnız alanın adı ve kural).
 */

export function forbidden(locale: Locale = DEFAULT_LOCALE) {
  return NextResponse.json({ error: healthMessages(locale).api.forbidden }, { status: 403 });
}

/** GitHub hatası mesajıyla (okuyanın dilinde, `messageOf`), başkası `fallback` (çağıran o dilde verir). */
export function failed(error: unknown, fallback: string, locale: Locale = DEFAULT_LOCALE) {
  const failure = error instanceof GithubError ? error : null;
  return NextResponse.json({ error: (failure ? messageOf(failure, locale) : null) ?? fallback }, { status: failure?.status ?? 502 });
}

/** Şema hataları: üst düzey alanlar (tarih, cinsiyet) formda alanın altında görünür. */
export function invalid(issues: readonly v.BaseIssue<unknown>[], locale: Locale = DEFAULT_LOCALE) {
  const fields: Record<string, string> = {};
  let message = healthMessages(locale).api.invalid;
  for (const issue of issues) {
    const key = issue.path?.[0]?.key;
    if (key === 'values') {
      // Değer listesi form alanlarıyla birebir değil; genel mesaj olarak döner.
      if (issue.path?.length === 1) message = issue.message;
      continue;
    }
    if (typeof key === 'string' && !fields[key]) fields[key] = issue.message;
  }
  return NextResponse.json({ error: message, fields }, { status: 400 });
}

/**
 * Değerleri ve günü denetler: taraf kuralı, aralık, tekrar ve gelecek gün. Sorun varsa
 * gönderilecek yanıt, yoksa temizlenmiş değerler.
 */
export async function checkDay(
  date: string,
  values: readonly MeasurementValue[],
  locale: Locale = DEFAULT_LOCALE,
): Promise<{ response: NextResponse } | { values: MeasurementValue[] }> {
  const checked = checkValues(values, locale);
  const fields: Record<string, string> = Object.fromEntries(
    Object.entries(checked.errors).map(([key, message]) => [`values.${key}`, message]),
  );
  const { timeZone } = await readAppConfig();
  if (date > todayIn(timeZone)) fields.date = measurementsMessages(locale).validation.futureDate;
  if (Object.keys(fields).length > 0) {
    return { response: NextResponse.json({ error: healthMessages(locale).api.invalid, fields }, { status: 400 }) };
  }
  return { values: checked.values };
}
