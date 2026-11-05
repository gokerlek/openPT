import type { Metadata } from 'next';
import Link from 'next/link';
import { CaretRight, Notebook } from '@phosphor-icons/react/dist/ssr';
import { CoachButton } from '@/components/coach/coach-button';
import { Plus } from '@/components/line-icons';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item';
import { clientProgramsMessages } from '@/i18n/messages/client-programs';
import { getLocale, getMessages } from '@/i18n/server';
import { coachAccess } from '@/lib/ai/coach-contract';
import { readAppConfig } from '@/lib/config';
import { todayIn } from '@/lib/format';
import { currentClient } from '@/lib/guards';
import { activeProgramId, ptEdits } from '@/lib/own-program-index';
import { lastDateByProgram, programLine, ptUpdatedSince } from '@/lib/own-program-text';
import { OWN_PROGRAM_LIMITS, ptProgramName } from '@/lib/own-programs';
import { readOwnOverview } from '@/lib/own-programs-store';
import { currentPhaseOf } from '@/lib/program-plan';
import { effectiveSchedule, isoWeekdayOf, upcomingAssigned, weekdayLabels } from '@/lib/training-days';
import { ClientHeader } from '../../client-header';
import { DeleteOwnProgram, PtEditBadge } from './program-actions';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(clientProgramsMessages)).pages.title };
}

/**
 * Program sekmesi (`docs/design/kendi-program.md` §2.1): antrenörünün programı ve danışanın kendi programları
 * (en çok 5, oluşturulma sırasıyla; seçim değişince liste zıplamaz). Kartların bütün satırları index'ten (program
 * başına okuma yok); "son: 22 Eyl" seans index'inden. "Bugün'ün programı" rozeti tek kartta. Okunamayan dosya
 * adıyla (ya da kimliğiyle) listelenir ve silinebilir. Antrenör AI desteğini açtıysa "Yeni program"ın altında "AI ile
 * program öner" (yer kalmadıysa yok: kaydedilemezdi). Sayfa yetkiyi kendisi denetler (`currentClient`).
 */
export default async function ProgramsPage() {
  const [client, config, locale] = await Promise.all([currentClient(), readAppConfig(), getLocale()]);
  const t = clientProgramsMessages(locale);
  const ptName = ptProgramName(locale);
  const overview = await readOwnOverview(client.id).catch(() => null);

  if (!overview) {
    return (
      <main className="flex flex-col gap-6">
        <ClientHeader client={client} appName={config.appName} title={t.pages.title} />
        <Alert>
          <AlertTitle>{t.pages.listUnavailable}</AlertTitle>
          <AlertDescription>{t.pages.tryLater}</AlertDescription>
        </Alert>
      </main>
    );
  }

  const { state, pt, sessions } = overview;
  const active = activeProgramId(state.index);
  const last = lastDateByProgram(sessions);
  const items = state.index.items;
  const count = items.length + state.unreadable.length;
  const full = count >= OWN_PROGRAM_LIMITS.programs;
  const edited = new Map(ptEdits(state.index, new Date()).map((item) => [item.id, item.at]));
  // "Yeni program"ın altında, yer varken: AI koç paneli "Program hazırla" sekmesiyle açılır. Hayalet: asıl eylem
  // "Yeni program" kalır.
  const coach = coachAccess(client) === 'ready';
  const aiButton = coach ? <CoachButton variant="ghost" label={t.pages.aiSuggest} detail={{ tab: 'program' }} className="h-11 w-full" /> : null;

  const ptProgram = pt?.program ?? null;
  const ptPhase = ptProgram ? currentPhaseOf(ptProgram)?.phase : undefined;
  // Bugünün ya da haftada sıradaki atanmış program (Faz 3; dönüş yok): "Bugün: Alt vücut" / "Sıradaki: Perşembe ·
  // Üst vücut". Atama yoksa satır yok.
  const today = todayIn(config.timeZone);
  const upcoming = ptProgram && ptPhase ? upcomingAssigned(ptProgram, today) : null;
  const upcomingDay = upcoming ? ptPhase?.days.find((day) => day.id === upcoming.dayId) : undefined;
  const ptNext = upcoming && upcomingDay
    ? upcoming.date === today
      ? t.pages.todayNext(upcomingDay.name)
      : t.pages.upcoming(weekdayLabels(locale)[isoWeekdayOf(upcoming.date)], upcomingDay.name)
    : null;

  return (
    <main className="flex flex-col gap-6">
      <ClientHeader client={client} appName={config.appName} title={t.pages.title} />

      <section className="flex flex-col gap-2" aria-labelledby="pt-program">
        <h2 id="pt-program" className="text-sm font-medium text-muted-foreground">
          {ptName}
        </h2>
        {pt === null ? (
          <Card size="sm">
            <CardHeader>
              <CardDescription>{t.pages.ptNone}</CardDescription>
            </CardHeader>
          </Card>
        ) : !ptProgram || !ptPhase ? (
          <Card size="sm">
            <CardHeader>
              <CardDescription>{t.pages.ptUnavailable}</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <Item variant="outline" className="touch:min-h-11" render={<Link href="/me/programlar/antrenor" />}>
            <ItemContent className="min-w-0">
              <ItemTitle>{ptName}</ItemTitle>
              <div className="flex flex-wrap gap-1.5">
                {active === null ? <Badge>{t.pages.todaysProgram}</Badge> : null}
                {ptUpdatedSince(ptProgram, state.index.active) ? <Badge variant="secondary">{t.pages.updated}</Badge> : null}
              </div>
              <ItemDescription className="tabular-nums">
                {programLine({ days: ptPhase.days.length, weekdays: effectiveSchedule(ptProgram).weekdays, daysPerWeek: ptPhase.daysPerWeek }, last.get('pt'), locale)}
              </ItemDescription>
              {ptNext ? <ItemDescription>{ptNext}</ItemDescription> : null}
            </ItemContent>
            <ItemActions>
              <CaretRight className="size-4 text-muted-foreground" />
            </ItemActions>
          </Item>
        )}
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="own-programs">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="own-programs" className="text-sm font-medium text-muted-foreground">
            {t.pages.own}
          </h2>
          {count > 0 ? (
            <span className="text-sm text-muted-foreground tabular-nums">
              {count} / {OWN_PROGRAM_LIMITS.programs}
            </span>
          ) : null}
        </div>

        {count === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Notebook weight="fill" />
              </EmptyMedia>
              <EmptyTitle>{t.pages.noOwn}</EmptyTitle>
              <EmptyDescription>{t.pages.noOwnText}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button className={coach ? 'h-11 w-full' : 'h-11'} nativeButton={false} render={<Link href="/me/programlar/yeni" />}>
                <Plus data-icon="inline-start" />
                {t.pages.newProgram}
              </Button>
              {aiButton}
            </EmptyContent>
          </Empty>
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {items.map((item) => (
                <li key={item.id}>
                  <Item variant="outline" className="touch:min-h-11" render={<Link href={`/me/programlar/${item.id}`} />}>
                    <ItemContent className="min-w-0">
                      <ItemTitle className="w-full break-words">{item.name}</ItemTitle>
                      {active === item.id || item.shared || edited.has(item.id) ? (
                        <div className="flex flex-wrap gap-1.5">
                          {active === item.id ? <Badge>{t.pages.todaysProgram}</Badge> : null}
                          {item.shared ? <Badge variant="secondary">{t.pages.shared}</Badge> : null}
                          <PtEditBadge clientId={client.id} programId={item.id} editedAt={edited.get(item.id)} />
                        </div>
                      ) : null}
                      <ItemDescription className="tabular-nums">{programLine(item, last.get(item.id), locale)}</ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <CaretRight className="size-4 text-muted-foreground" />
                    </ItemActions>
                  </Item>
                </li>
              ))}
              {state.unreadable.map((item) => (
                <li key={item.id}>
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle className="break-words">{item.name ?? t.pages.unreadableName}</CardTitle>
                      <CardDescription>{t.pages.unreadableText}</CardDescription>
                    </CardHeader>
                    <CardFooter>
                      <DeleteOwnProgram clientId={client.id} programId={item.id} name={item.name ?? t.pages.thisProgram} active={active === item.id} shared={false} />
                    </CardFooter>
                  </Card>
                </li>
              ))}
            </ul>
            {full ? (
              <div className="flex flex-col gap-1">
                <Button variant="outline" className="h-11 w-full border-dashed" disabled>
                  <Plus data-icon="inline-start" />
                  {t.pages.newProgram}
                </Button>
                <p className="text-sm text-muted-foreground">{t.errors.limit(OWN_PROGRAM_LIMITS.programs)}</p>
              </div>
            ) : (
              <>
                <Button variant="outline" className="h-11 w-full border-dashed" nativeButton={false} render={<Link href="/me/programlar/yeni" />}>
                  <Plus data-icon="inline-start" />
                  {t.pages.newProgram}
                </Button>
                {aiButton}
              </>
            )}
          </>
        )}
      </section>
    </main>
  );
}
