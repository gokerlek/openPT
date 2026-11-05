import * as v from 'valibot';
import { programFormSchema } from '@/lib/schemas/program';
import { NextResponse } from 'next/server';
import { readPtSession } from '@/lib/session';
import { assistantDeps } from '@/lib/ai/assistant-service';
import { requestAssistant, saveAssistantDraft, getAssistant } from '@/lib/ai/assistant-routes';
import { origin } from '@/lib/urls';
import { localeFromRequest } from '@/i18n/locale';
import { coachMessages } from '@/i18n/messages/coach';
import { coachFailed } from '@/lib/ai/coach-respond';
import { langConfig } from '@/i18n/valibot';
export const maxDuration = 60;
type Context = { params: Promise<{ id: string }> };
const respond = (result: Awaited<ReturnType<typeof getAssistant>>) => NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
export async function GET(request: Request, { params }: Context) {
  const locale = localeFromRequest(request), t = coachMessages(locale).api;
  try { return respond(await getAssistant(assistantDeps(readPtSession, undefined, locale), (await params).id)); }
  catch (error) { return coachFailed(error, t.openFailed, locale); }
}
export async function POST(request: Request, { params }: Context) {
  const locale = localeFromRequest(request), t = coachMessages(locale).api;
  try { return respond(await requestAssistant(assistantDeps(readPtSession, undefined, locale), request.headers, origin(request), (await params).id, await request.json().catch(() => null))); }
  catch (error) { return coachFailed(error, t.replyFailed, locale); }
}
export async function PATCH(request: Request, { params }: Context) {
  const locale = localeFromRequest(request), t = coachMessages(locale).api;
  try {
    const input = await request.json().catch(() => null);
    const parsed = v.safeParse(v.strictObject({ id: v.pipe(v.string(), v.uuid()), body: v.optional(programFormSchema) }), input, langConfig(locale));
    if (!parsed.success) return NextResponse.json({ error: t.invalidDraft }, { status: 400 });
    return respond(await saveAssistantDraft(assistantDeps(readPtSession, undefined, locale), request.headers, origin(request), (await params).id, parsed.output.id, parsed.output.body ?? null, 'pt'));
  } catch (error) { return coachFailed(error, t.draftApplyFailed, locale); }
}
