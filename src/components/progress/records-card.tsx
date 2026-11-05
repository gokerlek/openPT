'use client';

import { Trophy } from '@phosphor-icons/react/dist/ssr';
import { useLocale } from '@/i18n/client';
import { clientProgressMessages } from '@/i18n/messages/client-progress';
import { lower } from '@/i18n/text';
import { getFormat } from '@/lib/format';
import type { RecordItem } from '@/lib/progress';
import { progressCopy, recordLabel, recordPrevious, recordValue, type ProgressViewer } from '@/lib/progress-text';
import { ProgressCard } from './progress-card';

/**
 * Son rekorlar (tasarım §2.8 kuralları): bir antrenmanda bir hareketin kırdığı rekorlar tek satır,
 * öne en önemlisi (en ağır set, tahmini maksimum, aynı ağırlıkta tekrar…) ve önceki en iyi; ötekiler
 * altında kısaca. En yeni önce. Danışan ve PT aynı kartı kullanır (`viewer`).
 */
export function RecordsCard({
  viewer,
  name,
  items,
  total,
  today,
}: {
  viewer: ProgressViewer;
  name?: string;
  items: RecordItem[];
  total: number;
  today: string;
}) {
  const locale = useLocale();
  const t = clientProgressMessages(locale).cards;
  const copy = progressCopy(viewer, name, locale);
  return (
    <ProgressCard viewer={viewer} title={t.records} description={`${total > items.length ? t.recordsTotal(total, items.length) : copy.recordsIntro} ${t.recordsFirst}`}>
      {items.length === 0 ? (
        <p className="rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">{copy.recordsEmpty}</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {items.map((item) => {
            const [primary, ...others] = item.events;
            if (!primary) return null;
            const withYear = item.date.slice(0, 4) !== today.slice(0, 4);
            return (
              <li key={`${item.sessionId}-${item.key}`} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                <Trophy weight="fill" className="mt-0.5 size-5 shrink-0 text-primary-text" aria-hidden />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate font-medium">
                      {item.title}
                      {item.deviceName ? <span className="font-normal text-muted-foreground"> · {item.deviceName}</span> : null}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{getFormat(locale).dayShort(item.date, withYear)}</span>
                  </div>
                  <p className="text-sm">
                    {recordLabel(primary.kind, item.trackingType, locale)}: <span className="font-medium tabular-nums">{recordValue(primary, locale)}</span>
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">{recordPrevious(primary, locale)}</p>
                  {others.length > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {t.recordsAlso}{' '}
                      {others.map((event) => `${lower(locale, recordLabel(event.kind, item.trackingType, locale))} ${recordValue(event, locale)}`).join(' · ')}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </ProgressCard>
  );
}
