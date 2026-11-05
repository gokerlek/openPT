import { NextResponse } from 'next/server';
import { coachClientSession } from '@/lib/ai/coach-session';
import { assistantDeps } from '@/lib/ai/assistant-service';
import { saveAssistantDraft } from '@/lib/ai/assistant-routes';
import { origin } from '@/lib/urls';
import { localeFromRequest } from '@/i18n/locale';
import { coachMessages } from '@/i18n/messages/coach';
import { coachFailed } from '@/lib/ai/coach-respond';
export async function PUT(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
  const locale = localeFromRequest(request), t = coachMessages(locale).api;
  try {
    const session = await coachClientSession();
    if (!session) return NextResponse.json({ error: t.clientSessionRequired }, { status: 403 });
    const result = await saveAssistantDraft(assistantDeps(coachClientSession, undefined, locale), request.headers, origin(request), session.clientId, (await params).draftId, await request.json().catch(() => null), 'client');
    return NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return coachFailed(error, t.programSaveFailed, locale); }
}
