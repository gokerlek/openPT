import { NextResponse } from 'next/server';
import { messageOf } from '@/i18n/errors';
import { localeFromRequest } from '@/i18n/locale';
import { commonMessages } from '@/i18n/messages/common';
import { ptClientsMessages } from '@/i18n/messages/pt-clients';
import * as v from 'valibot';
import { GithubError } from '@/lib/github/client';
import { readLiveSession } from '@/lib/live-store';
import type { LiveResponse } from '@/lib/live-text';
import { clientIdSchema } from '@/lib/schemas/client';
import { readPtSession } from '@/lib/session';

/**
 * PT: danışanın açık antrenmanı (canlı görünüm, tasarım §4.6; SPEC §7). Danışanın sayfası sekme görünürken
 * 10 sn'de bir sorar (kimse çalışmıyorken 60 sn). Değişiklik yokken GitHub'a tek koşullu okuma gider (304,
 * birincil kotadan düşmez; `live-store.ts`). Yanıt önbelleğe alınmaz.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const locale = localeFromRequest(request);
  const t = ptClientsMessages(locale).errors;
  if ((await readPtSession())?.role !== 'pt') return NextResponse.json({ error: commonMessages(locale).errors.status[403] }, { status: 403 });
  const { id } = await params;
  if (!v.is(clientIdSchema, id)) return NextResponse.json({ error: t.notFound }, { status: 404 });

  try {
    const now = new Date();
    const body: LiveResponse = { live: await readLiveSession(id, now), checkedAt: now.toISOString() };
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const failure = error instanceof GithubError ? error : null;
    return NextResponse.json({ error: messageOf(failure, locale) ?? t.liveFailed }, { status: failure?.status ?? 502 });
  }
}
