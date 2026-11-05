import Link from 'next/link';
import { CaretRight, Info } from '@phosphor-icons/react/dist/ssr';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item';
import { getLocale } from '@/i18n/server';
import { ptProgramMessages } from '@/i18n/messages/pt-program';
import { getFormat, todayIn } from '@/lib/format';
import type { Locale } from '@/i18n/locale';
import { activeItem, type OwnIndex, type OwnIndexItem } from '@/lib/own-program-index';
import { lastDateByProgram, programLine } from '@/lib/own-program-text';
import type { SessionIndex } from '@/lib/schemas/session';

/**
 * PT'nin Program sekmesinde danışanın kendi programları (`docs/design/kendi-program.md` §4) — bütün bilgi index'ten
 * (dosya okunmaz): Bugün'ün programı kendi programken bilgi satırı, paylaşılmış programlar kartı.
 */

function dayOf(iso: string, timeZone: string, locale: Locale): string {
  return getFormat(locale).dayShort(todayIn(timeZone, new Date(iso)));
}

/** "Danışan şu an kendi programıyla çalışıyor: Evde" — yalnız kalıcı seçim kendi programken. */
export async function OwnActiveAlert({ clientId, index, timeZone }: { clientId: string; index: OwnIndex | null; timeZone: string }) {
  const locale = await getLocale();
  const t = ptProgramMessages(locale).ownProgramsCard;
  const item = activeItem(index);
  if (!item) return null;
  const at = index?.active?.at;
  return (
    <Alert>
      <Info weight="fill" />
      <AlertTitle className="pr-28">{t.activeTitle(item.name)}</AlertTitle>
      <AlertDescription>
        {[item.shared ? t.shared : t.notShared, at ? t.chosen(dayOf(at, timeZone, locale)) : null].filter(Boolean).join(' · ')}
      </AlertDescription>
      {item.shared ? (
        <AlertAction>
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/dashboard/clients/${clientId}/program/own/${item.id}`} />}>
            {t.open}
          </Button>
        </AlertAction>
      ) : null}
    </Alert>
  );
}

/** Son değişikliği kim yaptı: PT'nin düzenlemesi danışanınkinden yeniyse "sen". */
function lastChange(item: OwnIndexItem, timeZone: string, locale: Locale): string {
  const t = ptProgramMessages(locale).ownProgramsCard;
  const pt = item.ptEditedAt ? Date.parse(item.ptEditedAt) : 0;
  const client = item.clientEditedAt ? Date.parse(item.clientEditedAt) : Date.parse(item.updatedAt);
  return pt > client ? t.byYou(dayOf(item.ptEditedAt as string, timeZone, locale)) : t.byClient(dayOf(item.clientEditedAt ?? item.updatedAt, timeZone, locale));
}

/** "Danışanın paylaştığı programlar (n)" — yalnız paylaşılmış program varsa. */
export async function SharedProgramsCard({
  clientId,
  index,
  sessions,
  timeZone,
}: {
  clientId: string;
  index: OwnIndex | null;
  sessions: Pick<SessionIndex, 'items'> | null;
  timeZone: string;
}) {
  const locale = await getLocale();
  const t = ptProgramMessages(locale).ownProgramsCard;
  const shared = index?.items.filter((item) => item.shared) ?? [];
  if (shared.length === 0) return null;
  const active = activeItem(index)?.id ?? null;
  const last = sessions ? lastDateByProgram(sessions) : new Map<string, string>();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.title(shared.length)}</CardTitle>
        <CardDescription>{t.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2">
          {shared.map((item) => {
            const lastDate = last.get(item.id);
            return (
              <li key={item.id}>
                <Item variant="outline" className="touch:min-h-11" render={<Link href={`/dashboard/clients/${clientId}/program/own/${item.id}`} />}>
                  <ItemContent className="min-w-0">
                    <ItemTitle className="break-words">
                      {item.name}
                      {active === item.id ? <Badge variant="secondary">{t.todayBadge}</Badge> : null}
                    </ItemTitle>
                    <ItemDescription className="tabular-nums">
                      {programLine(item, undefined, locale)}
                      {lastDate ? t.lastWorkout(getFormat(locale).dayShort(lastDate)) : ''}
                    </ItemDescription>
                    <ItemDescription>{t.lastChange(lastChange(item, timeZone, locale))}</ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <CaretRight className="size-4 text-muted-foreground" />
                  </ItemActions>
                </Item>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
