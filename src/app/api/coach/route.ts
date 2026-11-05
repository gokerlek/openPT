import { NextResponse } from 'next/server';
import { getAssistant, requestAssistant } from '@/lib/ai/assistant-routes';
import { assistantDeps } from '@/lib/ai/assistant-service';
import { readPtSession } from '@/lib/session';
import { generalCoachDeps, PT_COACH_ID } from '@/lib/ai/coach-global';
import { origin } from '@/lib/urls';
import { localeFromRequest } from '@/i18n/locale';
import { coachMessages } from '@/i18n/messages/coach';
import { coachFailed } from '@/lib/ai/coach-respond';
export const maxDuration = 60;
const respond = (result: Awaited<ReturnType<typeof getAssistant>>) => NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
export async function GET(request: Request) {
  const locale = localeFromRequest(request), t = coachMessages(locale).api;
  try { return respond(await getAssistant(assistantDeps(readPtSession, generalCoachDeps(locale), locale), PT_COACH_ID)); }
  catch (error) { return coachFailed(error, t.generalOpenFailed, locale); }
}
export async function POST(request: Request) {
  const locale = localeFromRequest(request), t = coachMessages(locale).api;
  try { return respond(await requestAssistant(assistantDeps(readPtSession, generalCoachDeps(locale), locale), request.headers, origin(request), PT_COACH_ID, await request.json().catch(() => null))); }
  catch (error) { return coachFailed(error, t.generalReplyFailed, locale); }
}
