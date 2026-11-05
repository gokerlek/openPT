import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { localeFromRequest } from '@/i18n/locale';
import { healthMessages } from '@/i18n/messages/health';
import { langConfig } from '@/i18n/valibot';
import { addOverride } from '@/lib/constraints';
import { listExercises } from '@/lib/exercises';
import { updateHealth } from '@/lib/health';
import { failed, forbidden, invalid, isPt, notFound, readBody } from '@/lib/health-respond';
import { clientIdSchema } from '@/lib/schemas/client';
import { overridePostSchema } from '@/lib/schemas/constraint';

/**
 * Danışana özel izin ("Yine de ekle", "İzin ver"; tasarım `kisit-tarama.md` §3.2): o kısıtın bulguları bu harekette
 * susar. Görüşü alınmamış kırmızı bayrakta ve kauda ekinada 409. Programı kaydetmeden çıkılsa da izin kalır.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const locale = localeFromRequest(request);
  const messages = healthMessages(locale);
  if (!(await isPt())) return forbidden(locale);
  const { id } = await params;
  if (!v.is(clientIdSchema, id)) return notFound(messages.record.clientNotFound, locale);
  const parsed = v.safeParse(overridePostSchema, await readBody(request), langConfig(locale));
  if (!parsed.success) return invalid(parsed.issues, locale);

  // i18n-followup(T5): `listExercises()` has no locale yet; the library title goes into the stored log line (`overrideAdded`/`overrideRemoved`), so it stays Turkish until T5 localizes it.
  const exercise = (await listExercises()).find((item) => item.id === parsed.output.exerciseId);
  if (!exercise) return notFound(messages.constraintApi.exerciseMissing, locale);
  try {
    await updateHealth(
      id,
      'conditions',
      (record) => addOverride(record, parsed.output, { now: new Date().toISOString(), title: exercise.title, locale }),
      'İzin kaydedildi',
    );
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return failed(error, messages.constraintApi.overrideSaveFailed, locale);
  }
}
