import { NextResponse } from 'next/server';
import { commonMessages } from '@/i18n/messages/common';
import { localeFromRequest } from '@/i18n/locale';
import { appRepoFiles } from '@/lib/app-repo-files';
import { pinAlternatives } from '@/lib/catalog-actions';
import { readPtSession } from '@/lib/session';

/**
 * PT'nin sabitlediği muadilleri yazar (sıra korunur). Hazır bir egzersizde bu,
 * düzenlemede olduğu gibi PT'nin sürümünü oluşturur. Kurallar `pinAlternatives`'te
 * (`src/lib/catalog-actions.ts`).
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const locale = localeFromRequest(request);
  const session = await readPtSession();
  if (session?.role !== 'pt') return NextResponse.json({ error: commonMessages(locale).errors.status[403] }, { status: 403 });

  const { id } = await params;
  const { status, body } = await pinAlternatives(appRepoFiles(), id, await request.json().catch(() => null), locale);
  return NextResponse.json(body, { status });
}
