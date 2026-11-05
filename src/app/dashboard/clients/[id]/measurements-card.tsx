import Link from 'next/link';
import { ChartLineUp, Plus } from '@/components/line-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { measurementsMessages } from '@/i18n/messages/measurements';
import { getLocale } from '@/i18n/server';
import { getFormat } from '@/lib/format';
import type { MeasurementsView } from '@/lib/health';
import { healthLockInfo, measurementDays } from '@/lib/measurement-log';
import { measurementAlerts } from '@/lib/measurement-trends';
import { measurementDefs } from '@/lib/measurements';

/**
 * Danışan sayfasında ölçümlerin özeti: son ölçüm, gün sayısı ve son ölçüme kadarki 4 haftanın kararı
 * verilebilen eğilimleri (gerileme ve durağan önde; ölçümler sayfasındaki "4 haftalık eğilim" ile aynı
 * hesap). Ölçüm girişi ve grafikler kendi sayfasında.
 * `undefined`: GitHub'dan okunamadı. `today`: uygulamanın saat dilimindeki gün; son ölçümü
 * 4 haftadan eski eğilim gösterilmez.
 */
export async function MeasurementsCard({
  clientId,
  view,
  today,
}: {
  clientId: string;
  view: MeasurementsView | undefined;
  today: string;
}) {
  const href = `/dashboard/clients/${clientId}/measurements`;
  const locale = await getLocale();
  const messages = measurementsMessages(locale);
  const t = messages.card;
  const format = getFormat(locale);

  if (!view || view.state !== 'ok') {
    const description = !view ? t.unreadable : view.state === 'locked' ? healthLockInfo('measurements', view.lock, locale).title : t.broken(view.problem);
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t.title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        {view ? (
          <CardFooter>
            <Button variant="outline" nativeButton={false} render={<Link href={href} />}>
              <ChartLineUp data-icon="inline-start" />
              {t.details}
            </Button>
          </CardFooter>
        ) : null}
      </Card>
    );
  }

  const days = measurementDays(view.record.measurements);
  const last = days[0];
  const alerts = measurementAlerts(view.record.measurements, today, locale).slice(0, 4);
  const defs = measurementDefs(locale);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.title}</CardTitle>
        <CardDescription>{last ? t.summary(days.length, format.day(last.date)) : t.empty}</CardDescription>
      </CardHeader>
      {alerts.length > 0 ? (
        <CardContent className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">{t.trendNote}</p>
          <ul className="flex flex-col gap-2 text-sm" aria-label={t.trends}>
            {alerts.map((alert) => {
              const def = defs[alert.id];
              return (
                <li key={`${alert.id}-${alert.key}`} className="flex items-center justify-between gap-3">
                  <span>
                    {t.alertName(def.label, alert.key === 'value' ? null : messages.sides[alert.key])}
                    <span className="text-muted-foreground tabular-nums">
                      {' '}
                      · {format.signedWithUnit(Math.round(alert.change * 10) / 10, messages.units[def.unit])}
                    </span>
                  </span>
                  <Badge variant={alert.kind === 'declining' ? 'destructive' : alert.kind === 'plateau' ? 'outline' : 'default'}>
                    {t.alerts[alert.kind]}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </CardContent>
      ) : null}
      <CardFooter className="flex flex-wrap gap-2">
        <Button variant="outline" nativeButton={false} render={<Link href={href} />}>
          <ChartLineUp data-icon="inline-start" />
          {t.charts}
        </Button>
        <Button variant="outline" nativeButton={false} render={<Link href={`${href}/new`} />}>
          <Plus data-icon="inline-start" />
          {t.add}
        </Button>
      </CardFooter>
    </Card>
  );
}
