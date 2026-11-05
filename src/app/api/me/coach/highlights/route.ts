import { NextResponse } from 'next/server';
import { coachClientSession } from '@/lib/ai/coach-session';
import { readCoachPreferences } from '@/lib/ai/coach-preferences';
import { readClient } from '@/lib/clients';
import { coachAccess } from '@/lib/ai/coach-contract';
import { coachHighlights } from '@/lib/ai/coach-highlights';
import { readIndex } from '@/lib/session-files-core';
import { sessionRepo } from '@/lib/session-files';
import { todayIn } from '@/lib/format';
import { readAppConfig } from '@/lib/config';
import { localeFromRequest } from '@/i18n/locale';
import { coachMessages } from '@/i18n/messages/coach';
import { coachFailed } from '@/lib/ai/coach-respond';
const json = (items: unknown) => NextResponse.json(items, { headers: { 'Cache-Control': 'no-store' } });
export async function GET(request: Request) {
  const locale = localeFromRequest(request), t = coachMessages(locale).api;
  try {
    const session = await coachClientSession();
    if (!session) return NextResponse.json({ error: t.clientSessionRequired }, { status: 403 });
    const client = (await readClient(session.clientId))?.client;
    if (!client || coachAccess(client) !== 'ready') return json([]);
    const prefs = await readCoachPreferences(client.id);
    if (!prefs.comments && !prefs.celebrations && !prefs.suggestions) return json([]);
    const [index, config] = await Promise.all([readIndex(sessionRepo(client.id)), readAppConfig()]);
    const today = todayIn(config.timeZone);
    const event = index.index.items.filter(row => row.finishedAt && row.date === today).sort((a, b) => b.finishedAt!.localeCompare(a.finishedAt!))[0];
    return json(event ? coachHighlights({ id: event.id, date: event.date, dayName: event.dayName, sets: event.sets }, prefs, locale) : []);
  } catch (error) { return coachFailed(error, t.highlightsFailed, locale); }
}
