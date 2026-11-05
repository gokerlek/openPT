import Link from 'next/link';
import { CalendarDots } from '@phosphor-icons/react/dist/ssr';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { clientHomeMessages } from '@/i18n/messages/client-home';
import { getLocale } from '@/i18n/server';
import type { AssignableDay } from '@/lib/day-assignments';
import { assignmentsText } from '@/lib/training-days';

/**
 * Ayarlar'daki "Antrenman günleri" satırı (Faz 3): Bugün'ün programının (kalıcı seçim) şu anki evresinin atamaları,
 * salt okunur ("Sal · Alt vücut, Per · Üst vücut"). Danışan günleri değiştirmez (Karar 3): PT programında günleri
 * antrenörü belirler, düğme yok; kendi programda atamalar programın formunda, eylem "Düzenle" oraya götürür.
 */
export async function TrainingDaysCard({
  days,
  own = null,
}: {
  /** Şu anki evrenin programları (atamalarıyla). */
  days: readonly AssignableDay[];
  /** Gösterilen kendi program; null PT'nin programı. */
  own?: { programId: string; name: string } | null;
}) {
  const locale = await getLocale();
  const t = clientHomeMessages(locale).trainingDays;
  const text = assignmentsText(days, locale);
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDots weight="fill" className="size-5 text-muted-foreground" />
          {t.title}
        </CardTitle>
        <CardDescription>
          {own ? <span className="block">{own.name}</span> : null}
          <span className="block">{text || t.none}</span>
          {own ? null : <span className="block">{t.byPt}</span>}
        </CardDescription>
        {own ? (
          <CardAction>
            <Button variant="outline" className="h-11" nativeButton={false} render={<Link href={`/me/programlar/${encodeURIComponent(own.programId)}/duzenle`} />}>
              {t.edit}
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
    </Card>
  );
}
