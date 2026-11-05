import {WorkoutCalendar} from '@/components/workout/workout-calendar';
import {todayIn} from '@/lib/format';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Barbell } from '@phosphor-icons/react/dist/ssr';
import { SectionHeader } from '@/components/section-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { ptClientsMessages } from '@/i18n/messages/pt-clients';
import { getLocale } from '@/i18n/server';
import { loadClient } from '@/lib/clients';
import { readAppConfig } from '@/lib/config';
import { requirePt } from '@/lib/guards';
import { loadHistory } from '@/lib/history-store';
import { readLiveResponse } from '@/lib/live-store';
import { CLIENT_ID_PATTERN } from '@/lib/schemas/client';
import { LiveSession } from '../live-session';
import { SessionList } from './session-list';

export async function generateMetadata(): Promise<Metadata> {
  return { title: ptClientsMessages(await getLocale()).sessions.title };
}

/**
 * Danışanın antrenmanları (SPEC §6, tasarım §8 satır 12) — yalnız okuma: kayıtları danışan kendi telefonundan
 * siler. Üstte açık antrenman canlı ("Şu an antrenmanda · Gün A · 7/17 set · son set 2 dk önce"), altında
 * bitmiş antrenmanlar en yeniden eskiye, aylara bölünmüş (danışanın Geçmiş'iyle aynı satırlar). Liste
 * `sessions-index.json`'dan tek okumayla gelir (her okumada `sessions/` ağacıyla onarılır). Satır detayı açar.
 */
export default async function SessionsPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePt();
  const { id } = await params;
  if (!CLIENT_ID_PATTERN.test(id)) notFound();
  const loaded = await loadClient(id);
  if (!loaded) notFound();
  // Kaydı okunamayan danışan: sorunu detay sayfası anlatır.
  if (!loaded.ok) redirect(`/dashboard/clients/${id}`);

  const locale = await getLocale();
  const t = ptClientsMessages(locale).sessions;
  const config = await readAppConfig();
  const [list, live] = await Promise.all([loadHistory(id, config.timeZone, locale).catch(() => null), readLiveResponse(id)]);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title={t.title}
        description={t.description}
      />

      <LiveSession clientId={id} initial={live} />

      {list?<WorkoutCalendar months={list.months} today={todayIn(config.timeZone)} hrefPrefix={`/dashboard/clients/${id}/sessions`}/>:null}
      {list === null ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.unreadableTitle}</CardTitle>
            <CardDescription>{t.unreadableBody}</CardDescription>
          </CardHeader>
        </Card>
      ) : list.count === 0 ? (
        <Card>
          <CardContent>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Barbell weight="fill" />
                </EmptyMedia>
                <EmptyTitle>{t.emptyTitle}</EmptyTitle>
                <EmptyDescription>{t.emptyBody}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t.history}</CardTitle>
            {list.recent ? <CardDescription className="tabular-nums">{list.recent}</CardDescription> : null}
          </CardHeader>
          <CardContent>
            <SessionList clientId={id} months={list.months} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
