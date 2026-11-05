import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { commonMessages } from '@/i18n/messages/common';
import { localeFromRequest, type Locale } from '@/i18n/locale';
import { ptProgramMessages } from '@/i18n/messages/pt-program';
import { langConfig } from '@/i18n/valibot';
import { readClient } from '@/lib/clients';
import { listDevices } from '@/lib/devices';
import { listExercises } from '@/lib/exercises';
import { failureOf } from '@/lib/route-failure';
import { deleteProgram, programDiffContext, saveProgram } from '@/lib/programs';
import { clientIdSchema } from '@/lib/schemas/client';
import { programSaveSchema } from '@/lib/schemas/program';
import { readPtSession } from '@/lib/session';

function forbidden(locale: Locale) {
  return NextResponse.json({ error: commonMessages(locale).errors.status[403] }, { status: 403 });
}

function clientMissing(locale: Locale) {
  return NextResponse.json({ error: ptProgramMessages(locale).apiRoutes.clientNotFound }, { status: 404 });
}

function failed(error: unknown, fallback: string, locale: Locale) {
  const { message, status } = failureOf(error, fallback, locale);
  return NextResponse.json({ error: message }, { status });
}

/**
 * Programı oluşturur (`baseRevision: null`) ya da kaydeder. Egzersiz ve cihaz kimlikleri
 * kütüphaneye göre, kayıttaki programla birlikte denetlenir (`saveProgram`); eski biçimle açık
 * kalmış sekmenin gövdesi şemada çevrilir. Düzenleyici yüklediği revision'ı ve programın oluşturulma
 * anını gönderir: program o arada başka yerde kaydedildiyse (ya da silinip yeniden oluşturulduysa)
 * 412 döner ve kayıt yapılmaz. Değişiklik yoksa hiçbir şey yazılmaz; varsa geçmişe ve commit
 * mesajına otomatik özet girer. Cihazı o arada silinmiş satırlar egzersizin cihazına döner; sayısı
 * yanıtta (`droppedDevices`), düzenleyici PT'ye söyler. Antrenman günleri şu anki evrenin atamalarından
 * yazılır; danışanın eski gün katmanı ilk kayıtta silinir (Faz 3, `settleSchedule`).
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const locale = localeFromRequest(request);
  const t = ptProgramMessages(locale).apiRoutes;
  if ((await readPtSession())?.role !== 'pt') return forbidden(locale);
  const { id } = await params;
  if (!v.is(clientIdSchema, id)) return clientMissing(locale);

  const parsed = v.safeParse(programSaveSchema, await request.json().catch(() => null), langConfig(locale));
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.issues) {
      const key = issue.path?.map((segment) => String(segment.key as PropertyKey)).join('.');
      if (key && !fields[key]) fields[key] = issue.message;
    }
    return NextResponse.json({ error: t.checkInput, fields }, { status: 400 });
  }

  const { baseRevision, baseCreatedAt, phased, currentPhaseId, phases, weekdays } = parsed.output;
  try {
    if (!(await readClient(id))) return clientMissing(locale);
    const [exercises, devices] = await Promise.all([listExercises(), listDevices()]);
    const result = await saveProgram(
      id,
      // Günleri hiç göndermeyen eski sekme kayıttaki atamalara dokunmaz (`keepStoredAssignments`).
      { phased, currentPhaseId, phases, ...(weekdays !== undefined ? { weekdays } : {}) },
      baseRevision === null ? null : { revision: baseRevision, createdAt: baseCreatedAt },
      { exercises: new Map(exercises.map((exercise) => [exercise.id, exercise])), deviceIds: new Set(devices.map((device) => device.id)) },
      programDiffContext(exercises, devices, locale),
    );
    switch (result.status) {
      case 'invalid':
        return NextResponse.json({ error: t.checkInput, fields: result.errors }, { status: 400 });
      case 'created':
        return NextResponse.json({ revision: result.revision, droppedDevices: result.droppedDevices }, { status: 201 });
      case 'saved':
        return NextResponse.json({ revision: result.revision, droppedDevices: result.droppedDevices });
      case 'unchanged':
        return NextResponse.json({ revision: result.revision, unchanged: true, droppedDevices: result.droppedDevices });
      case 'missing':
        return NextResponse.json({ error: t.programNotFoundMaybeDeleted }, { status: 404 });
      case 'stale':
        return NextResponse.json(
          { error: t.programStale },
          { status: 412 },
        );
      case 'exists':
        return NextResponse.json(
          { error: t.programExists },
          { status: 412 },
        );
    }
  } catch (error) {
    return failed(error, t.programSaveFailed, locale);
  }
}

/** Programı siler (okunamayan dosya da silinebilir). Git geçmişinde kaydı durur. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const locale = localeFromRequest(request);
  const t = ptProgramMessages(locale).apiRoutes;
  if ((await readPtSession())?.role !== 'pt') return forbidden(locale);
  const { id } = await params;
  if (!v.is(clientIdSchema, id)) return clientMissing(locale);
  try {
    if (!(await deleteProgram(id, locale))) return NextResponse.json({ error: t.programNotFound }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, t.programDeleteFailed, locale);
  }
}
