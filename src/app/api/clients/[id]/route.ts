import { NextResponse } from 'next/server';
import { messageOf } from '@/i18n/errors';
import { localeFromRequest } from '@/i18n/locale';
import { commonMessages } from '@/i18n/messages/common';
import { ptClientsMessages } from '@/i18n/messages/pt-clients';
import { langConfig } from '@/i18n/valibot';
import * as v from 'valibot';
import { deleteClient, readClient } from '@/lib/clients';
import { GithubError } from '@/lib/github/client';
import { clientIdSchema } from '@/lib/schemas/client';
import { readPtSession } from '@/lib/session';

const bodySchema = v.object({ confirmName: v.string() });

/**
 * Danışanı ve bütün verisini kalıcı siler (repo dahil). İki adımlıdır: PT danışanın adını
 * yazarak doğrular; kontrol sunucuda da yapılır (SPEC §9.2). Kaydı okunamayan danışanda
 * ad bilinmediği için kimliği yazılır.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const locale = localeFromRequest(request);
  const t = ptClientsMessages(locale).errors;
  const session = await readPtSession();
  if (session?.role !== 'pt') return NextResponse.json({ error: commonMessages(locale).errors.status[403] }, { status: 403 });

  const { id } = await params;
  const body = v.safeParse(bodySchema, await request.json().catch(() => null), langConfig(locale));
  if (!v.is(clientIdSchema, id) || !body.success) return NextResponse.json({ error: t.invalidRequest }, { status: 400 });

  try {
    const stored = await readClient(id).catch((error: unknown) => {
      if (error instanceof GithubError && error.status === 500) return null; // bozuk kayıt: kimlikle silinir
      throw error;
    });
    const expected = stored?.client.name ?? id;
    const typed = body.output.confirmName.trim().toLocaleLowerCase('tr');
    if (typed !== expected.toLocaleLowerCase('tr')) {
      return NextResponse.json(
        { error: t.confirmMismatch, fields: { confirmName: stored ? t.confirmName : t.confirmId } },
        { status: 400 },
      );
    }
    await deleteClient(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const failure = error instanceof GithubError ? error : null;
    return NextResponse.json({ error: messageOf(failure, locale) ?? t.deleteFailed }, { status: failure?.status ?? 502 });
  }
}
