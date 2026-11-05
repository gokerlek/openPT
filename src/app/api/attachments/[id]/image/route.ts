import { NextResponse } from 'next/server';
import { commonMessages } from '@/i18n/messages/common';
import { localeFromRequest, type Locale } from '@/i18n/locale';
import { ptLibraryMessages } from '@/i18n/messages/pt-library';
import { appRepoFiles } from '@/lib/app-repo-files';
import { getAttachment } from '@/lib/attachments';
import { removeAttachmentImage, saveAttachmentImage } from '@/lib/catalog-actions';
import { appRepo } from '@/lib/github/client';
import { readBinary } from '@/lib/github/files';
import { IMAGE_CONTENT_TYPES, IMAGE_MAX_BYTES, IMAGE_TYPES, imageVersion, sniffImage, type ImageExtension } from '@/lib/image';
import { failureOf } from '@/lib/route-failure';
import { readAnySession, readPtSession } from '@/lib/session';

/**
 * Aparat fotoğrafı: PT'nin uygulama repo'sunda `media/attachments/` altında. Havuzda
 * bir kez yüklenir; aparatı kullanan her cihazda ve egzersizde aynı fotoğraf görünür.
 * Repo özel olduğu için dosya sunucudan geçer.
 */

type Params = { params: Promise<{ id: string }> };

function failed(error: unknown, fallback: string, locale: Locale) {
  const { message, status } = failureOf(error, fallback, locale);
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request, { params }: Params) {
  // Danışan da antrenmanda görecek; oturum yeterli.
  const locale = localeFromRequest(request);
  try {
    if (!(await readAnySession())) return new NextResponse(null, { status: 401 });
  } catch (error) {
    return failed(error, ptLibraryMessages(locale).apiRoutes.sessionCheckFailed, locale);
  }

  const { id } = await params;
  const attachment = await getAttachment(id);
  const extension = attachment?.image?.split('.').pop() as ImageExtension | undefined;
  if (!attachment?.image || !extension || !(extension in IMAGE_CONTENT_TYPES)) return new NextResponse(null, { status: 404 });

  const file = await readBinary(appRepo(), attachment.image).catch(() => null);
  if (!file) return new NextResponse(null, { status: 404 });

  // Adresteki sürüm güncelse içerik hiç değişmez: uzun süre önbellekte kalabilir.
  const current = new URL(request.url).searchParams.get('v') === imageVersion(attachment.image);
  return new NextResponse(Buffer.from(file.bytes) as unknown as BodyInit, {
    headers: {
      'Content-Type': IMAGE_CONTENT_TYPES[extension],
      'X-Content-Type-Options': 'nosniff',
      ETag: `"${file.sha}"`,
      'Cache-Control': current ? 'private, max-age=31536000, immutable' : 'private, no-cache',
    },
  });
}

export async function POST(request: Request, { params }: Params) {
  const locale = localeFromRequest(request);
  const t = ptLibraryMessages(locale).apiRoutes;
  const session = await readPtSession();
  if (session?.role !== 'pt') return NextResponse.json({ error: commonMessages(locale).errors.status[403] }, { status: 403 });

  const { id } = await params;
  const form = await request.formData().catch(() => null);
  const file = form?.get('image');
  if (!(file instanceof File)) return NextResponse.json({ error: t.imageNotChosen }, { status: 400 });
  if (!IMAGE_TYPES[file.type]) return NextResponse.json({ error: t.imageTypeUnsupported }, { status: 400 });
  if (file.size > IMAGE_MAX_BYTES) return NextResponse.json({ error: t.imageTooBig }, { status: 413 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const extension = sniffImage(bytes);
  if (!extension) return NextResponse.json({ error: t.imageNotImage }, { status: 400 });

  // Yazma (hazır aparatta PT sürümü, eski fotoğrafın silinmesi) `saveAttachmentImage`'da (`src/lib/catalog-actions.ts`).
  const { status, body } = await saveAttachmentImage(appRepoFiles(), id, bytes, extension, locale);
  return NextResponse.json(body, { status });
}

export async function DELETE(request: Request, { params }: Params) {
  const locale = localeFromRequest(request);
  const session = await readPtSession();
  if (session?.role !== 'pt') return NextResponse.json({ error: commonMessages(locale).errors.status[403] }, { status: 403 });

  const { id } = await params;
  const { status, body } = await removeAttachmentImage(appRepoFiles(), id, locale);
  return NextResponse.json(body, { status });
}
