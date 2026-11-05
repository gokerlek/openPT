import { NextResponse } from 'next/server';
import { commonMessages } from '@/i18n/messages/common';
import { localeFromRequest, type Locale } from '@/i18n/locale';
import { ptLibraryMessages } from '@/i18n/messages/pt-library';
import { appRepoFiles } from '@/lib/app-repo-files';
import { saveDevice } from '@/lib/catalog-actions';
import { listDevices } from '@/lib/devices';
import { failureOf } from '@/lib/route-failure';
import { readAnySession, readPtSession } from '@/lib/session';

function failed(error: unknown, fallback: string, locale: Locale) {
  const { message, status } = failureOf(error, fallback, locale);
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request) {
  const locale = localeFromRequest(request);
  const t = ptLibraryMessages(locale).apiRoutes;
  try {
    if (!(await readAnySession())) return NextResponse.json({ error: t.sessionRequired }, { status: 401 });
    return NextResponse.json({ devices: await listDevices(undefined, locale) });
  } catch (error) {
    return failed(error, t.devicesReadFailed, locale);
  }
}

/**
 * Yeni cihaz ya da (kimlikle) güncelleme. Hazır bir cihazı güncellemek PT'nin sürümünü oluşturur;
 * cihazda artık olmayan aparat egzersizlerden düşer. Kurallar `saveDevice`'ta (`src/lib/catalog-actions.ts`).
 */
export async function POST(request: Request) {
  const locale = localeFromRequest(request);
  const session = await readPtSession();
  if (session?.role !== 'pt') return NextResponse.json({ error: commonMessages(locale).errors.status[403] }, { status: 403 });

  const { status, body } = await saveDevice(appRepoFiles(), await request.json().catch(() => null), locale);
  return NextResponse.json(body, { status });
}
