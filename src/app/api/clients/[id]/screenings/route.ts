import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { localeFromRequest } from '@/i18n/locale';
import { healthMessages } from '@/i18n/messages/health';
import { screeningMessages } from '@/i18n/messages/screening';
import { langConfig } from '@/i18n/valibot';
import { readAppConfig } from '@/lib/config';
import { todayIn } from '@/lib/format';
import { updateHealth } from '@/lib/health';
import { failed, forbidden, invalid, isPt, notFound, readBody } from '@/lib/health-respond';
import { clientIdSchema } from '@/lib/schemas/client';
import { screeningPostSchema } from '@/lib/schemas/constraint';
import { withScreening } from '@/lib/screening';

/**
 * Hareket taraması günü (tasarım `kisit-tarama.md` §4.5, §5.5) → 201; aynı gün varsa günceller. Yalnız doldurulan
 * testler kaydedilir; gelecek gün girilemez. Onay veri katmanında denetlenir.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const locale = localeFromRequest(request);
  const t = screeningMessages(locale).api;
  if (!(await isPt())) return forbidden(locale);
  const { id } = await params;
  if (!v.is(clientIdSchema, id)) return notFound(healthMessages(locale).record.clientNotFound, locale);
  const parsed = v.safeParse(screeningPostSchema, await readBody(request), langConfig(locale));
  if (!parsed.success) return invalid(parsed.issues, locale);
  const { timeZone } = await readAppConfig();
  if (parsed.output.date > todayIn(timeZone)) {
    return NextResponse.json({ error: healthMessages(locale).api.invalid, fields: { date: t.futureDate } }, { status: 400 });
  }
  try {
    await updateHealth(id, 'screening', (record) => withScreening(record, parsed.output), 'Hareket testi kaydedildi');
    return NextResponse.json({ ok: true, date: parsed.output.date }, { status: 201 });
  } catch (error) {
    return failed(error, t.saveFailed, locale);
  }
}
