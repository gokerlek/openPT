import { NextResponse } from 'next/server';
import { localeFromRequest } from '@/i18n/locale';
import { messageOf } from '@/i18n/errors';
import { commonMessages } from '@/i18n/messages/common';
import { ptShellMessages } from '@/i18n/messages/pt-shell';
import { GithubError } from '@/lib/github/client';
import { readLiveOverview } from '@/lib/live-store';
import type { LiveOverviewResponse } from '@/lib/live-text';
import { readPtSession } from '@/lib/session';

/**
 * PT: şu an antrenmanda olan danışanlar (Genel bakış; tasarım §4.6, §8 satır 12). Sayfa görünürken 60 sn'de bir
 * sorulur (SPEC §7: genel görünüm daha seyrek). Danışan başına tek koşullu okuma (değişmediyse 304); okunamayan
 * danışan listeyi durdurmaz, sayılır. Yanıt önbelleğe alınmaz.
 */
export async function GET(request: Request) {
  const locale = localeFromRequest(request);
  if ((await readPtSession())?.role !== 'pt') return NextResponse.json({ error: commonMessages(locale).errors.status[403] }, { status: 403 });
  try {
    const now = new Date();
    const overview = await readLiveOverview(now, locale);
    const body: LiveOverviewResponse = { ...overview, checkedAt: now.toISOString() };
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const failure = error instanceof GithubError ? error : null;
    return NextResponse.json({ error: messageOf(failure, locale) ?? ptShellMessages(locale).api.liveFailed }, { status: failure?.status ?? 502 });
  }
}
