import { NextResponse } from 'next/server';
import { coachClientSession } from '@/lib/ai/coach-session';
import { readCoachPreferences, writeCoachPreferences } from '@/lib/ai/coach-preferences';
import { postGuard } from '@/lib/client-auth-routes';
import { origin } from '@/lib/urls';
import { localeFromRequest } from '@/i18n/locale';
import { coachMessages } from '@/i18n/messages/coach';
import { coachFailed } from '@/lib/ai/coach-respond';
import { langConfig } from '@/i18n/valibot';
import { safeParse } from 'valibot';
import { coachPreferencesSchema } from '@/lib/ai/coach-contract';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export async function GET(request: Request) {
  const locale = localeFromRequest(request), t = coachMessages(locale).api;
  try {
    const session = await coachClientSession();
    if (!session) return json({ error: t.clientSessionRequired }, 403);
    return json(await readCoachPreferences(session.clientId));
  } catch (error) { return coachFailed(error, t.preferencesReadFailed, locale); }
}
export async function PUT(request: Request) {
  const locale = localeFromRequest(request), t = coachMessages(locale).api;
  const blocked = postGuard(request.headers, origin(request), locale);
  if (blocked) return json(blocked.body, blocked.status);
  try {
    const session = await coachClientSession();
    if (!session) return json({ error: t.clientSessionRequired }, 403);
    const result = safeParse(coachPreferencesSchema, await request.json().catch(() => null), langConfig(locale));
    if (!result.success) return json({ error: t.checkPreferences }, 400);
    return json(await writeCoachPreferences(session.clientId, result.output, locale));
  } catch (error) { return coachFailed(error, t.preferencesSaveFailed, locale); }
}
