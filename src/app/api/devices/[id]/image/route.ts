import { NextResponse } from 'next/server';
import { commonMessages } from '@/i18n/messages/common';
import { localeFromRequest, type Locale } from '@/i18n/locale';
import { ptLibraryMessages } from '@/i18n/messages/pt-library';
import { appRepoFiles } from '@/lib/app-repo-files';
import { removeDeviceImage, saveDeviceImage } from '@/lib/catalog-actions';
import { appRepo } from '@/lib/github/client';
import { readBinary } from '@/lib/github/files';
import { getDevice } from '@/lib/devices';
import { IMAGE_CONTENT_TYPES, IMAGE_MAX_BYTES, IMAGE_TYPES, imageVersion, sniffImage, type ImageExtension } from '@/lib/image';
import { failureOf } from '@/lib/route-failure';
import { readAnySession, readPtSession } from '@/lib/session';

/**
 * Cihaz görseli: PT'nin uygulama repo'sunda `media/devices/` altında.
 *
 * Repo özel olduğu için tarayıcı GitHub'dan doğrudan çekemez; dosya sunucudan geçer.
 * Tür ve içerik denetimi `src/lib/image.ts`'te (aparat fotoğrafıyla ortak).
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
  const device = await getDevice(id);
  const extension = device?.image?.split('.').pop() as ImageExtension | undefined;
  if (!device?.image || !extension || !(extension in IMAGE_CONTENT_TYPES)) return new NextResponse(null, { status: 404 });

  const file = await readBinary(appRepo(), device.image).catch(() => null);
  if (!file) return new NextResponse(null, { status: 404 });

  // Adresteki sürüm güncelse içerik hiç değişmez: uzun süre önbellekte kalabilir.
  const current = new URL(request.url).searchParams.get('v') === imageVersion(device.image);
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

  if (!IMAGE_TYPES[file.type]) {
    return NextResponse.json(
      { error: t.imageTypeUnsupported, fields: { image: t.imageTypeField } },
      { status: 400 },
    );
  }
  if (file.size > IMAGE_MAX_BYTES) {
    return NextResponse.json(
      { error: t.imageTooBig, fields: { image: t.imageTooBigField } },
      { status: 413 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const extension = sniffImage(bytes);
  if (!extension) {
    return NextResponse.json(
      { error: t.imageNotImage, fields: { image: t.imageNotImageField } },
      { status: 400 },
    );
  }

  // Yazma (hazır cihazda PT sürümü, eski görselin silinmesi) `saveDeviceImage`'da (`src/lib/catalog-actions.ts`).
  const { status, body } = await saveDeviceImage(appRepoFiles(), id, bytes, extension, locale);
  return NextResponse.json(body, { status });
}

export async function DELETE(request: Request, { params }: Params) {
  const locale = localeFromRequest(request);
  const session = await readPtSession();
  if (session?.role !== 'pt') return NextResponse.json({ error: commonMessages(locale).errors.status[403] }, { status: 403 });

  const { id } = await params;
  const { status, body } = await removeDeviceImage(appRepoFiles(), id, locale);
  return NextResponse.json(body, { status });
}
