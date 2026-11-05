import { NextResponse } from 'next/server';
import { messageOf } from '@/i18n/errors';
import { localeFromRequest } from '@/i18n/locale';
import { commonMessages } from '@/i18n/messages/common';
import { ptClientsMessages } from '@/i18n/messages/pt-clients';
import * as v from 'valibot';
import { revokeAccess } from '@/lib/clients';
import { GithubError } from '@/lib/github/client';
import { clientIdSchema } from '@/lib/schemas/client';
import { readPtSession } from '@/lib/session';

/** Danışanın açık bütün oturumlarını düşürür ve bekleyen daveti iptal eder (ör. telefon kayboldu). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const locale = localeFromRequest(request);
  const t = ptClientsMessages(locale).errors;
  const session = await readPtSession();
  if (session?.role !== 'pt') return NextResponse.json({ error: commonMessages(locale).errors.status[403] }, { status: 403 });

  const { id } = await params;
  if (!v.is(clientIdSchema, id)) return NextResponse.json({ error: t.notFound }, { status: 404 });

  try {
    await revokeAccess(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const failure = error instanceof GithubError ? error : null;
    return NextResponse.json({ error: messageOf(failure, locale) ?? t.revokeFailed }, { status: failure?.status ?? 502 });
  }
}
