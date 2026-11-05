import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { localeFromRequest } from '@/i18n/locale';
import { screeningMessages } from '@/i18n/messages/screening';
import { langConfig } from '@/i18n/valibot';
import { updateHealth } from '@/lib/health';
import { failed, forbidden, invalid, isPt, notFound, readBody } from '@/lib/health-respond';
import { isCalendarDate } from '@/lib/measurement-log';
import { clientIdSchema } from '@/lib/schemas/client';
import { screeningPutSchema } from '@/lib/schemas/constraint';
import { withoutScreening, withScreening } from '@/lib/screening';

type Context = { params: Promise<{ id: string; date: string }> };

async function target(context: Context): Promise<{ id: string; date: string } | null> {
  const { id, date } = await context.params;
  return v.is(clientIdSchema, id) && isCalendarDate(date) ? { id, date } : null;
}

/** Günün taramasını değiştirir (yoksa 404). */
export async function PUT(request: Request, context: Context) {
  const locale = localeFromRequest(request);
  const t = screeningMessages(locale).api;
  if (!(await isPt())) return forbidden(locale);
  const day = await target(context);
  if (!day) return notFound(t.notFound, locale);
  const parsed = v.safeParse(screeningPutSchema, await readBody(request), langConfig(locale));
  if (!parsed.success) return invalid(parsed.issues, locale);
  try {
    await updateHealth(day.id, 'screening', (record) => withScreening(record, { date: day.date, ...parsed.output }, { replace: true }), 'Hareket testi güncellendi');
    return NextResponse.json({ ok: true, date: day.date });
  } catch (error) {
    return failed(error, t.saveFailed, locale);
  }
}

/** Günü siler (yoksa 404). Git geçmişinde danışanın repo'sunda kalır. */
export async function DELETE(request: Request, context: Context) {
  const locale = localeFromRequest(request);
  const t = screeningMessages(locale).api;
  if (!(await isPt())) return forbidden(locale);
  const day = await target(context);
  if (!day) return notFound(t.notFound, locale);
  try {
    await updateHealth(day.id, 'screening', (record) => withoutScreening(record, day.date), 'Hareket testi silindi');
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, t.deleteFailed, locale);
  }
}
