import { NextResponse } from 'next/server';
import { messageOf } from '@/i18n/errors';
import { localeFromRequest } from '@/i18n/locale';
import { commonMessages } from '@/i18n/messages/common';
import { setupMessages } from '@/i18n/messages/setup';
import { readPtSession } from '@/lib/session';
import { appRepo, GithubError } from '@/lib/github/client';
import { deleteFile, getFileSha, writeBinary } from '@/lib/github/files';
import { configStore } from '@/lib/config';
import { ConfigUnavailableError, removeLogo, replaceLogo, type LogoFiles } from '@/lib/config-update';

/**
 * Logo yükleme (SPEC §10).
 *
 * SVG kabul edilmez: SVG betik taşıyabilir ve kendi alan adımızdan servis edilen
 * bir SVG, tarayıcıda çalışan koda dönüşür. PT kendi logosunu yüklüyor olsa da
 * bu kapıyı açık bırakmanın gereği yok.
 */
const ALLOWED = new Map<string, string>([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
]);

const MAX_BYTES = 512 * 1024;

/**
 * Logo dosyasının GitHub işleri. Akış (önce repo denetimi, taban taze okuma, eski dosyanın ancak
 * ayar yazıldıktan sonra silinmesi) `config-update.ts`'te, orada test edilir.
 */
function logoFiles(): LogoFiles {
  const repo = appRepo();
  return {
    sha: (path) => getFileSha(repo, path),
    write: async (path, bytes, sha) => {
      await writeBinary(repo, path, bytes, { sha: sha ?? undefined, message: 'Logo güncellendi' });
    },
    remove: (path, sha, message) => deleteFile(repo, path, { sha, message }),
  };
}

export async function POST(request: Request) {
  const locale = localeFromRequest(request);
  const t = setupMessages(locale).api;
  const session = await readPtSession();
  if (session?.role !== 'pt') {
    return NextResponse.json({ error: commonMessages(locale).errors.status[403] }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get('logo');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: t.noFile }, { status: 400 });
  }

  const extension = ALLOWED.get(file.type);
  if (!extension) {
    return NextResponse.json(
      { error: t.logoTypes, fields: { logo: t.logoTypeField } },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: t.logoSize, fields: { logo: t.logoSizeField } },
      { status: 400 },
    );
  }

  const path = `media/brand/logo.${extension}`;

  try {
    await replaceLogo(configStore(), logoFiles(), path, new Uint8Array(await file.arrayBuffer()));
    return NextResponse.json({ logo: path });
  } catch (error) {
    const failure = error instanceof GithubError || error instanceof ConfigUnavailableError ? error : null;
    return NextResponse.json({ error: messageOf(failure, locale) ?? t.logoUploadFailed }, { status: failure?.status ?? 502 });
  }
}

export async function DELETE(request: Request) {
  const locale = localeFromRequest(request);
  const session = await readPtSession();
  if (session?.role !== 'pt') {
    return NextResponse.json({ error: commonMessages(locale).errors.status[403] }, { status: 403 });
  }

  try {
    await removeLogo(configStore(), logoFiles());
    return NextResponse.json({ ok: true });
  } catch (error) {
    const failure = error instanceof GithubError || error instanceof ConfigUnavailableError ? error : null;
    return NextResponse.json({ error: messageOf(failure, locale) ?? setupMessages(locale).api.logoRemoveFailed }, { status: failure?.status ?? 502 });
  }
}
