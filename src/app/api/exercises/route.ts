import { NextResponse } from 'next/server';
import { commonMessages } from '@/i18n/messages/common';
import { localeFromRequest } from '@/i18n/locale';
import { ptLibraryMessages } from '@/i18n/messages/pt-library';
import { appRepoFiles } from '@/lib/app-repo-files';
import { saveExercise } from '@/lib/catalog-actions';
import { listExercises } from '@/lib/exercises';
import { failureOf } from '@/lib/route-failure';
import { readAnySession, readPtSession } from '@/lib/session';

export async function GET(request: Request) {
  const locale = localeFromRequest(request);
  const t = ptLibraryMessages(locale).apiRoutes;
  try {
    const session = await readAnySession();
    // Danışan da egzersizleri görür (kendi antrenmanını kurarken); yazma yalnız PT'de.
    if (!session) return NextResponse.json({ error: t.sessionRequired }, { status: 401 });

    return NextResponse.json({ exercises: await listExercises() });
  } catch (error) {
    const { message, status } = failureOf(error, t.exercisesReadFailed, locale);
    return NextResponse.json({ error: message }, { status });
  }
}

/** Yeni egzersiz ya da (kimlikle) güncelleme; kurallar `saveExercise`'ta (`src/lib/catalog-actions.ts`). */
export async function POST(request: Request) {
  const locale = localeFromRequest(request);
  const session = await readPtSession();
  if (session?.role !== 'pt') {
    return NextResponse.json({ error: commonMessages(locale).errors.status[403] }, { status: 403 });
  }

  const { status, body } = await saveExercise(appRepoFiles(), await request.json().catch(() => null), locale);
  return NextResponse.json(body, { status });
}
