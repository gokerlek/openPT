import { NextResponse } from 'next/server';
import { coachClientSession } from '@/lib/ai/coach-session';
import { assistantDeps } from '@/lib/ai/assistant-service';
import { requestAssistant, getAssistant } from '@/lib/ai/assistant-routes';
import { origin } from '@/lib/urls';
import { localeFromRequest } from '@/i18n/locale';
import { coachMessages } from '@/i18n/messages/coach';
import { coachFailed } from '@/lib/ai/coach-respond';
export const maxDuration = 60;
const respond = (result: Awaited<ReturnType<typeof getAssistant>>) => NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
export async function GET(request: Request) {
  const locale = localeFromRequest(request), t = coachMessages(locale).api;
  try {
    const session = await coachClientSession();
    if (!session) return NextResponse.json({ error: t.clientSessionRequired }, { status: 403 });
    return respond(await getAssistant(assistantDeps(coachClientSession, undefined, locale), session.clientId));
  } catch (error) { return coachFailed(error, t.openFailed, locale); }
}
export async function POST(request: Request) {
  const locale = localeFromRequest(request), t = coachMessages(locale).api;
  try {
    const session = await coachClientSession();
    if (!session) return NextResponse.json({ error: t.clientSessionRequired }, { status: 403 });
    return respond(await requestAssistant(assistantDeps(coachClientSession, undefined, locale), request.headers, origin(request), session.clientId, await request.json().catch(() => null)));
  } catch (error) { return coachFailed(error, t.replyFailed, locale); }
}
