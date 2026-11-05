import 'server-only';
import { messageOf } from '../i18n/errors.ts';
import { DEFAULT_LOCALE, type Locale } from '../i18n/locale.ts';
import { healthMessages } from '../i18n/messages/health/index.ts';
import { NextResponse } from 'next/server';
import type * as v from 'valibot';
import { ConstraintError } from './constraints';
import { GithubError } from './github/client';
import { readPtSession } from './session';

/**
 * Kısıt ve tarama uçlarının ortak yanıtları (ölçüm uçlarının `respond.ts`'iyle aynı desen). Hata mesajları değer
 * taşımaz: sağlık verisi yanıta ya da günlüğe sızmasın (yalnız alanın adı ve kural).
 */

export async function isPt(): Promise<boolean> {
  return (await readPtSession())?.role === 'pt';
}

export function forbidden(locale: Locale = DEFAULT_LOCALE) {
  return NextResponse.json({ error: healthMessages(locale).api.forbidden }, { status: 403 });
}

export function notFound(message?: string, locale: Locale = DEFAULT_LOCALE) {
  return NextResponse.json({ error: message ?? healthMessages(locale).api.notFound }, { status: 404 });
}

/**
 * Hata yanıtı. Kural hatası (`ConstraintError`) ve GitHub hatası mesajıyla, okuyanın dilinde (`messageOf`); başkası
 * `fallback` (çağıran o dilde verir) ve günlüğe yalnız hatanın adı.
 */
export function failed(error: unknown, fallback: string, locale: Locale = DEFAULT_LOCALE) {
  if (error instanceof ConstraintError) return NextResponse.json({ error: error.localized(locale) }, { status: error.status });
  const failure = error instanceof GithubError ? error : null;
  // Günlük satırı geliştiriciye: dil seçimine bağlı değil.
  if (!failure) console.error(`[sağlık] ${fallback}`, error instanceof Error ? error.name : 'bilinmeyen hata');
  return NextResponse.json({ error: (failure ? messageOf(failure, locale) : null) ?? fallback }, { status: failure?.status ?? 502 });
}

/** Şema hataları alan yoluyla ("constraint.side"); form alanın altında gösterir. */
export function invalid(issues: readonly v.BaseIssue<unknown>[], locale: Locale = DEFAULT_LOCALE) {
  const fields: Record<string, string> = {};
  let message = healthMessages(locale).api.invalid;
  for (const issue of issues) {
    const key = issue.path?.map((segment) => String(segment.key as PropertyKey)).join('.') ?? '';
    if (!key) message = issue.message;
    else if (!fields[key]) fields[key] = issue.message;
  }
  return NextResponse.json({ error: message, fields }, { status: 400 });
}

export async function readBody(request: Request): Promise<unknown> {
  return request.json().catch(() => null);
}
