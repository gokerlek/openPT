import { NextResponse } from 'next/server';
import { commonMessages } from '@/i18n/messages/common';
import { localeFromRequest } from '@/i18n/locale';
import { appRepoFiles } from '@/lib/app-repo-files';
import { deleteExercise } from '@/lib/catalog-actions';
import { readPtSession } from '@/lib/session';

/**
 * PT'nin kendi egzersizini siler (hazır bir egzersizin sürümüyse varsayılana döner).
 * Hazır kütüphanedekiler silinemez (pakette gelir). Silinen egzersiz, PT'nin diğer
 * egzersizlerinde sabitlendiği muadillerden de düşer ve kimliği bir daha verilmez;
 * varsayılana dönüşte kimlik hazır kütüphanede yaşadığı için sabitlemeler kalır.
 * Kurallar `deleteExercise`'ta (`src/lib/catalog-actions.ts`).
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const locale = localeFromRequest(request);
  const session = await readPtSession();
  if (session?.role !== 'pt') {
    return NextResponse.json({ error: commonMessages(locale).errors.status[403] }, { status: 403 });
  }

  const { id } = await params;
  const { status, body } = await deleteExercise(appRepoFiles(), id, locale);
  return NextResponse.json(body, { status });
}
