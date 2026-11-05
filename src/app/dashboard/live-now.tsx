'use client';

import Link from 'next/link';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useLocale, useMessages } from '@/i18n/client';
import { ptShellMessages } from '@/i18n/messages/pt-shell';
import { getFormat } from '@/lib/format';
import { LIVE_OVERVIEW_POLL_MS, liveDetailText, type LiveOverviewResponse } from '@/lib/live-text';
import { fetchJson } from '@/lib/query/errors';
import { useServiceQuery } from '@/lib/query/use-service';
import { LiveDot } from './live-dot';

/**
 * Genel bakış'ın "Şu an antrenmanda" kartı (tasarım §4.6, §8 satır 12): açık antrenmanı olan danışanlar, her biri
 * "Gün A · 7/17 set · son set 2 dk önce" ve danışanın Antrenmanlar sekmesine bağlantı. Sayfa görünürken 60 sn'de
 * bir tazelenir (SPEC §7: genel görünüm daha seyrek; açık antrenman danışanın sayfasında 10 sn'de bir), gizliyken
 * durur. İlk değer sunucudan; göreli zaman sunucunun anına göre (`checkedAt`).
 */
export function LiveNow({ initial }: { initial: LiveOverviewResponse | null }) {
  const locale = useLocale();
  const t = useMessages(ptShellMessages).live;
  const { number } = getFormat(locale);
  const { data } = useServiceQuery<LiveOverviewResponse>({
    key: ['live-overview'],
    fn: ({ signal }) => fetchJson<LiveOverviewResponse>('/api/live', { signal }),
    ...(initial ? { initialData: initial, initialDataUpdatedAt: Date.parse(initial.checkedAt) } : {}),
    refetchInterval: LIVE_OVERVIEW_POLL_MS,
    notify: 'none',
  });
  const items = data?.items ?? [];
  const now = data ? new Date(data.checkedAt) : null;

  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{t.title}</CardDescription>
        <CardTitle className="tabular-nums group-data-[size=sm]/card:text-2xl">{data ? number(items.length) : '—'}</CardTitle>
        {items.length > 0 ? (
          <CardAction>
            <LiveDot className="mt-1.5" />
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {!data ? (
          <p className="text-muted-foreground">{t.reading}</p>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground">{t.nobody}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {items.map((item) => (
              <li key={item.clientId} className="flex flex-col">
                <Link
                  href={`/dashboard/clients/${item.clientId}/sessions`}
                  className="w-fit font-medium underline-offset-4 hover:underline touch:inline-flex touch:min-h-11 touch:items-center">
                  {item.name}
                </Link>
                <span className="text-muted-foreground tabular-nums">{now ? liveDetailText(item, now, locale) : null}</span>
              </li>
            ))}
          </ul>
        )}
        {data && data.failed > 0 ? <p className="text-xs text-muted-foreground">{t.failed(data.failed, number(data.failed))}</p> : null}
      </CardContent>
    </Card>
  );
}
