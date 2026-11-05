import { NextResponse } from 'next/server';
import { messageOf } from '@/i18n/errors';
import { localeFromRequest } from '@/i18n/locale';
import { commonMessages } from '@/i18n/messages/common';
import { ptClientsMessages } from '@/i18n/messages/pt-clients';
import { langConfig } from '@/i18n/valibot';
import * as v from 'valibot';
import { createClient, updateClient } from '@/lib/clients';
import { GithubError } from '@/lib/github/client';
import { clientSaveSchema } from '@/lib/schemas/client';
import { readPtSession } from '@/lib/session';

/**
 * Yeni danışan ya da (kimlikle) güncelleme. Yeni danışanda sunucu `client-<id>` özel
 * repo'sunu açar, kaydı oraya yazar; uygulama repo'suna yalnız kimlik ve durum girer.
 * Program burada kurulmaz: danışanın sayfasından oluşturulur (danışanın bir özelliği değil).
 */
export async function POST(request: Request) {
  const locale = localeFromRequest(request);
  const t = ptClientsMessages(locale).errors;
  const session = await readPtSession();
  if (session?.role !== 'pt') return NextResponse.json({ error: commonMessages(locale).errors.status[403] }, { status: 403 });

  const parsed = v.safeParse(clientSaveSchema, await request.json().catch(() => null), langConfig(locale));
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.issues) {
      const key = issue.path?.map((segment) => String(segment.key as PropertyKey)).join('.');
      if (key && !fields[key]) fields[key] = issue.message;
    }
    return NextResponse.json({ error: t.checkInfo, fields }, { status: 400 });
  }

  const { id, ...input } = parsed.output;
  try {
    if (id) {
      await updateClient(id, input);
      return NextResponse.json({ id });
    }
    return NextResponse.json({ id: await createClient(input) });
  } catch (error) {
    const failure = error instanceof GithubError ? error : null;
    return NextResponse.json({ error: messageOf(failure, locale) ?? t.saveFailed }, { status: failure?.status ?? 502 });
  }
}
