import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { localeFromRequest } from '@/i18n/locale';
import { healthMessages } from '@/i18n/messages/health';
import { langConfig } from '@/i18n/valibot';
import { addConstraint, constraintsOf, type ConstraintInput } from '@/lib/constraints';
import { updateHealth } from '@/lib/health';
import { failed, forbidden, invalid, isPt, notFound, readBody } from '@/lib/health-respond';
import { clientIdSchema } from '@/lib/schemas/client';
import { constraintPostSchema } from '@/lib/schemas/constraint';
import { withPainReviewed } from '@/lib/screening';
import { randomId } from '@/lib/template-plan';

/**
 * PT kısıt ekler (tasarım `kisit-tarama.md` §2.3, §5.5) → 201 `{ id }`. Taramadaki ağrıdan eklenince
 * (`fromScreening`) aynı yazımda o hücre gözden geçirilmiş olur; kısıt tanısız hareket kısıtıdır. Onay veri
 * katmanında, danışan kaydı taze okunarak denetlenir.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const locale = localeFromRequest(request);
  const messages = healthMessages(locale);
  if (!(await isPt())) return forbidden(locale);
  const { id } = await params;
  if (!v.is(clientIdSchema, id)) return notFound(messages.record.clientNotFound, locale);

  const parsed = v.safeParse(constraintPostSchema, await readBody(request), langConfig(locale));
  if (!parsed.success) return invalid(parsed.issues, locale);
  const { constraint, fromScreening } = parsed.output;

  try {
    let created = '';
    await updateHealth(
      id,
      fromScreening ? ['conditions', 'screening'] : 'conditions',
      (record) => {
        created = randomId('k', 6, new Set(constraintsOf(record).map((item) => item.id)));
        const now = new Date().toISOString();
        const input: ConstraintInput & { origin?: 'screening' } = fromScreening ? { ...constraint, origin: 'screening' } : constraint;
        const next = addConstraint(record, input, { id: created, now, locale });
        return fromScreening ? withPainReviewed(next, fromScreening.date, fromScreening.key, now) : next;
      },
      'Kısıt kaydedildi',
    );
    return NextResponse.json({ ok: true, id: created }, { status: 201 });
  } catch (error) {
    return failed(error, messages.constraintApi.saveFailed, locale);
  }
}
