import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { localeFromRequest } from '@/i18n/locale';
import { healthMessages } from '@/i18n/messages/health';
import { measurementsMessages } from '@/i18n/messages/measurements';
import { langConfig } from '@/i18n/valibot';
import { addMeasurementDay } from '@/lib/health';
import { clientIdSchema } from '@/lib/schemas/client';
import { measurementAddSchema } from '@/lib/schemas/measurement';
import { readPtSession } from '@/lib/session';
import { checkDay, failed, forbidden, invalid } from './respond';

/**
 * Bir güne ölçüm ekler (yalnız PT). Aynı gün aynı ölçüm varsa yenisi geçer, diğerleri kalır.
 * Modül ve danışan onayı veri katmanında, danışan kaydı taze okunarak denetlenir (SPEC §4).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const locale = localeFromRequest(request);
  if ((await readPtSession())?.role !== 'pt') return forbidden(locale);

  const { id } = await params;
  if (!v.is(clientIdSchema, id)) return NextResponse.json({ error: healthMessages(locale).record.clientNotFound }, { status: 404 });

  const parsed = v.safeParse(measurementAddSchema, await request.json().catch(() => null), langConfig(locale));
  if (!parsed.success) return invalid(parsed.issues, locale);

  const { date, sex } = parsed.output;
  const checked = await checkDay(date, parsed.output.values, locale);
  if ('response' in checked) return checked.response;

  try {
    await addMeasurementDay(id, { date, sex, values: checked.values });
    return NextResponse.json({ ok: true, date }, { status: 201 });
  } catch (error) {
    return failed(error, measurementsMessages(locale).api.saveFailed, locale);
  }
}
