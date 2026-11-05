import { NextResponse } from 'next/server';
import { commonMessages } from '@/i18n/messages/common';
import { localeFromRequest } from '@/i18n/locale';
import { appRepoFiles } from '@/lib/app-repo-files';
import { deleteAttachment } from '@/lib/catalog-actions';
import { readPtSession } from '@/lib/session';

/**
 * PT'nin aparatını siler; hazır bir aparatın PT sürümüyse varsayılana döner. Hazır
 * havuzdakiler silinemez. Silinen aparat seçili olduğu PT cihazlarından ve
 * egzersizlerinden düşer (SPEC §7.3), kimliği bir daha verilmez; varsayılana dönüşte
 * kimlik hazır havuzda yaşadığı için bağlar kalır. Aparatın fotoğrafı da silinir.
 * Kurallar ve adımların sırası `deleteAttachment`'ta (`src/lib/catalog-actions.ts`).
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const locale = localeFromRequest(request);
  const session = await readPtSession();
  if (session?.role !== 'pt') return NextResponse.json({ error: commonMessages(locale).errors.status[403] }, { status: 403 });

  const { id } = await params;
  const { status, body } = await deleteAttachment(appRepoFiles(), id, locale);
  return NextResponse.json(body, { status });
}
