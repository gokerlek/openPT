import {WorkoutCalendar} from '@/components/workout/workout-calendar';
import {todayIn} from '@/lib/format';
import type { Metadata } from 'next';
import { ClockCounterClockwise } from '@phosphor-icons/react/dist/ssr';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { clientProgressMessages } from '@/i18n/messages/client-progress';
import { getLocale, getMessages } from '@/i18n/server';
import { readAppConfig } from '@/lib/config';
import { currentClient } from '@/lib/guards';
import { loadHistory } from '@/lib/history-store';
import { ProgressHeader } from '../../progress-header';
import { HistoryList } from './history-list';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(clientProgressMessages)).pages.history };
}

/**
 * Danışanın İlerleme sekmesinin Geçmiş'i (tasarım §2.10; adres `/me/gecmis` yerinde kalır): başlık "İlerleme",
 * altında İlerleme'nin şeridi (Özet · Geçmiş · Rekorlar; ortak baş `ProgressHeader`), şeridin altında son 30
 * günün özeti. Bitmiş antrenmanlar en yeniden eskiye, aylara bölünmüş; satırda gün, süre, set, toplam ağırlık ve rekor,
 * "başka program" ve "yarım" rozetleri. Liste
 * `sessions-index.json`'dan tek okumayla gelir (her okumada `sessions/` ağacıyla onarılır). Satır detayı açar
 * (`/me/gecmis/[id]`: setler, silme). Sayfa yetkiyi kendisi denetler (SPEC §5).
 */
export default async function HistoryPage() {
  const [client, config, locale] = await Promise.all([currentClient(), readAppConfig(), getLocale()]);
  const t = clientProgressMessages(locale).pages;
  const list = await loadHistory(client.id, config.timeZone, locale).catch(() => null);

  return (
    <main className="flex flex-col gap-6">
      <ProgressHeader client={client} appName={config.appName}>
        {list?.recent ? <p className="text-sm text-muted-foreground tabular-nums">{list.recent}</p> : null}
      </ProgressHeader>
      {list?<WorkoutCalendar months={list.months} today={todayIn(config.timeZone)}/>:null}
      {list === null ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.historyUnavailable}</CardTitle>
            <CardDescription>{t.connectionProblem}</CardDescription>
          </CardHeader>
        </Card>
      ) : list.count === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ClockCounterClockwise weight="fill" />
            </EmptyMedia>
            <EmptyTitle>{t.historyEmpty}</EmptyTitle>
            <EmptyDescription>{t.historyEmptyText}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <HistoryList months={list.months} />
      )}
    </main>
  );
}
