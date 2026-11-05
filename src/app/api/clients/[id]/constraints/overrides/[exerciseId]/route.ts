import { NextResponse, type NextRequest } from 'next/server';
import * as v from 'valibot';
import { localeFromRequest } from '@/i18n/locale';
import { healthMessages } from '@/i18n/messages/health';
import { CONSTRAINT_ID_PATTERN, removeOverride } from '@/lib/constraints';
import { listExercises } from '@/lib/exercises';
import { updateHealth } from '@/lib/health';
import { failed, forbidden, isPt, notFound } from '@/lib/health-respond';
import { clientIdSchema } from '@/lib/schemas/client';

/** İzni kaldırır (`?source=k_…`): hareket yine o kısıtın süzgecinden geçer. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; exerciseId: string }> }) {
  const locale = localeFromRequest(request);
  const t = healthMessages(locale).constraintApi;
  if (!(await isPt())) return forbidden(locale);
  const { id, exerciseId } = await params;
  const source = request.nextUrl.searchParams.get('source') ?? '';
  if (!v.is(clientIdSchema, id) || !/^[a-z0-9-]{2,60}$/.test(exerciseId) || !CONSTRAINT_ID_PATTERN.test(source)) {
    return notFound(t.overrideNotFound, locale);
  }
  // Hazır egzersizin adı kayda (`overrideRemoved`) eylemi yapanın dilinde yazılır.
  const title = (await listExercises(undefined, locale)).find((item) => item.id === exerciseId)?.title ?? t.deletedExercise;
  try {
    await updateHealth(
      id,
      'conditions',
      (record) => removeOverride(record, { exerciseId, source }, { now: new Date().toISOString(), title, locale }),
      'İzin kaldırıldı',
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, t.overrideRemoveFailed, locale);
  }
}
