import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { localeFromRequest } from '@/i18n/locale';
import { screeningMessages } from '@/i18n/messages/screening';
import { langConfig } from '@/i18n/valibot';
import { updateHealth } from '@/lib/health';
import { failed, forbidden, invalid, isPt, notFound, readBody } from '@/lib/health-respond';
import { isCalendarDate } from '@/lib/measurement-log';
import { clientIdSchema } from '@/lib/schemas/client';
import { screeningReviewSchema } from '@/lib/schemas/constraint';
import { withPainReviewed } from '@/lib/screening';

/** "Gördüm" (tasarım §4.4): ağrılı hücre gözden geçirildi; Dikkat maddesi kalkar. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; date: string }> }) {
  const locale = localeFromRequest(request);
  const t = screeningMessages(locale).api;
  if (!(await isPt())) return forbidden(locale);
  const { id, date } = await params;
  if (!v.is(clientIdSchema, id) || !isCalendarDate(date)) return notFound(t.notFound, locale);
  const parsed = v.safeParse(screeningReviewSchema, await readBody(request), langConfig(locale));
  if (!parsed.success) return invalid(parsed.issues, locale);
  try {
    await updateHealth(id, 'screening', (record) => withPainReviewed(record, date, parsed.output.key, new Date().toISOString()), 'Hareket testi güncellendi');
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, t.reviewFailed, locale);
  }
}
