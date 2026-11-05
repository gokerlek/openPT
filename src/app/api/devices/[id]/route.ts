import { NextResponse } from 'next/server';
import { commonMessages } from '@/i18n/messages/common';
import { localeFromRequest } from '@/i18n/locale';
import { appRepoFiles } from '@/lib/app-repo-files';
import { deleteDevice } from '@/lib/catalog-actions';
import { readPtSession } from '@/lib/session';

/**
 * PT'nin cihazını siler; hazır bir cihazın PT sürümüyse varsayılana döner. Hazır
 * katalogdakiler silinemez. Bu cihaza bağlı PT egzersizleri cihazsız kalır (kendi
 * ağırlık adımlarıyla devam eder), cihazdan seçtikleri aparat da düşer (SPEC §7.3);
 * varsayılana dönüşte yalnız hazır sürümde olmayan aparat düşer. Silinen cihazın kimliği
 * bir daha verilmez. Kurallar ve adımların sırası `deleteDevice`'ta (`src/lib/catalog-actions.ts`).
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const locale = localeFromRequest(request);
  const session = await readPtSession();
  if (session?.role !== 'pt') return NextResponse.json({ error: commonMessages(locale).errors.status[403] }, { status: 403 });

  const { id } = await params;
  const { status, body } = await deleteDevice(appRepoFiles(), id, locale);
  return NextResponse.json(body, { status });
}
