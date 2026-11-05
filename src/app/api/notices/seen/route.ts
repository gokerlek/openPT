import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { localeFromRequest } from '@/i18n/locale';
import { langConfig } from '@/i18n/valibot';
import { commonMessages } from '@/i18n/messages/common';
import { ptShellMessages } from '@/i18n/messages/pt-shell';
import { markNoticesSeen } from '@/lib/clients';
import { describeError } from '@/lib/github/errors';
import { clientIdSchema } from '@/lib/schemas/client';
import { readPtSession } from '@/lib/session';

/** Tek istekte en çok bu kadar danışan okundu sayılır. */
const MAX_CLIENTS = 100;

const bodySchema = v.object({ clientIds: v.pipe(v.array(clientIdSchema), v.minLength(1), v.maxLength(MAX_CLIENTS)) });

/**
 * PT: "Tümünü okundu say" (Genel bakış, tasarım §4.6). Okunmamış bildirimi olan her danışanın
 * `client.json` → `inbox.seenAt`'i şimdiye çekilir (açık soru 7); bildirim özeti düşer. Yazılamayan
 * danışan yanıtta `failed`: sayfa yenilenince bildirimleri yine okunmamış görünür.
 */
export async function POST(request: Request) {
  const locale = localeFromRequest(request);
  const t = ptShellMessages(locale).api;
  if ((await readPtSession())?.role !== 'pt') return NextResponse.json({ error: commonMessages(locale).errors.status[403] }, { status: 403 });
  const parsed = v.safeParse(bodySchema, await request.json().catch(() => null), langConfig(locale));
  if (!parsed.success) return NextResponse.json({ error: t.invalidRequest }, { status: 400 });

  const at = new Date();
  const ids = [...new Set(parsed.output.clientIds)];
  const results = await Promise.allSettled(ids.map((id) => markNoticesSeen(id, at)));
  const failed: string[] = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') return;
    const id = ids[index] ?? '?';
    failed.push(id);
    console.error(`[bildirim] ${id}: okundu yazılamadı: ${describeError(result.reason)}`);
  });
  if (failed.length === ids.length) return NextResponse.json({ error: t.seenFailed }, { status: 502 });
  return NextResponse.json({ ok: true, ...(failed.length > 0 ? { failed } : {}) });
}
