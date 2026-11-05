import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { coachClientSession } from '@/lib/ai/coach-session';
import { postGuard } from '@/lib/client-auth-routes';
import { origin } from '@/lib/urls';
import { readClient } from '@/lib/client-record';
import { geminiKeySchema, geminiKeyError } from '@/lib/ai/gemini-key-input';
import { ownCoachKey, setOwnCoachKey } from '@/lib/ai/coach-keys';
import { localeFromRequest } from '@/i18n/locale';
import { coachMessages } from '@/i18n/messages/coach';
import { coachFailed } from '@/lib/ai/coach-respond';
import { langConfig } from '@/i18n/valibot';
const keySchema = v.strictObject({ key: v.nullable(geminiKeySchema) });
export async function GET(request: Request) {
  const locale = localeFromRequest(request), t = coachMessages(locale).api;
  try {
    const session = await coachClientSession();
    if (!session) return NextResponse.json({ error: t.clientSessionRequired }, { status: 403 });
    return NextResponse.json({ ownKey: !!await ownCoachKey(session.clientId) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return coachFailed(error, t.connectionOpenFailed, locale); }
}
export async function PUT(request: Request) {
  const locale = localeFromRequest(request), t = coachMessages(locale);
  const blocked = postGuard(request.headers, origin(request), locale);
  if (blocked) return NextResponse.json(blocked.body, { status: blocked.status });
  try {
    const session = await coachClientSession();
    if (!session) return NextResponse.json({ error: t.api.clientSessionRequired }, { status: 403 });
    const stored = await readClient(session.clientId);
    if (!stored) return NextResponse.json({ error: t.api.clientNotFound }, { status: 404 });
    const body = await request.json().catch(() => null);
    const parsed = v.safeParse(keySchema, body, langConfig(locale));
    if (!parsed.success) return NextResponse.json({ error: body && typeof body === 'object' && 'key' in body ? geminiKeyError(body.key, locale) || t.api.invalidKeyRequest : t.keyErrors.fallback }, { status: 400 });
    if (parsed.output.key && !stored.client.modules.ai?.enabled) return NextResponse.json({ error: t.api.ptMustEnable }, { status: 403 });
    await setOwnCoachKey(session.clientId, parsed.output.key, locale);

    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return coachFailed(error, t.api.connectionSaveFailed, locale); }
}
