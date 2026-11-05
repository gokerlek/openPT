import 'server-only';
import { NextResponse } from 'next/server';
import type { Locale } from '@/i18n/locale';
import { failed } from '@/lib/health-respond';
import { CoachError } from './coach-errors';

/**
 * Koç uçlarının hata yanıtı: kendi hataları (`CoachError`) durum koduyla ve okuyanın dilinde; gerisi sağlık uçlarının
 * ortak yanıtı (`failed`): bilinmeyen hata ayrıntısız `fallback` olur.
 */
export function coachFailed(error: unknown, fallback: string, locale: Locale) {
  if (error instanceof CoachError) return NextResponse.json({ error: error.localized(locale) }, { status: error.status });
  return failed(error, fallback, locale);
}
