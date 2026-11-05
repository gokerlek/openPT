import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { ArrowSquareOut, Barbell, CaretRight, QrCode, WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { CoachButton } from '@/components/coach/coach-button';
import { EditButton } from '@/components/edit-button';
import { ListChecks, Plus } from '@/components/line-icons';
import { SectionHeader } from '@/components/section-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import type { Locale } from '@/i18n/locale';
import { ptClientsMessages } from '@/i18n/messages/pt-clients';
import { getLocale } from '@/i18n/server';
import { lower } from '@/i18n/text';
import { coachAccess } from '@/lib/ai/coach-contract';
import { attentionItems, type AttentionItem } from '@/lib/attention';
import { loadClient, readInvite } from '@/lib/clients';
import { healthConsentState, healthFieldState } from '@/lib/client-status';
import { readAppConfig } from '@/lib/config';
import { constraintCounts } from '@/lib/constraints';
import { serverEnv } from '@/lib/env';
import { listExercises, type ExerciseWithSource } from '@/lib/exercises';
import { getFormat, todayIn } from '@/lib/format';
import type { HealthRecord } from '@/lib/schemas/health';
import { newestFirst, painHistory } from '@/lib/screening';
import { clientRepoName } from '@/lib/github/client';
import { displayDays, countDays, currentPhaseOf, frequencyLabel, phaseStatus, phaseStatusLabel } from '@/lib/program-plan';
import { readProgramFile, type ProgramFile } from '@/lib/programs';
import { CLIENT_ID_PATTERN, clientStatusLabels, healthFieldInfo, trainingExperienceLabels, type HealthField } from '@/lib/schemas/client';
import { templateSummary } from '@/lib/template-plan';
import { programWeekTarget, upcomingAssigned, weekdaysText } from '@/lib/training-days';
import { cn } from '@/lib/utils';
import { healthStateDetails, healthStateLabels } from '../health-state';
import { AccessBadge, accessDetail, accessOf, passwordOf } from '../invite-state';
import { requirePt } from '@/lib/guards';
import { loadMeasurements, readHealthIfAllowed } from '@/lib/health';
import { loadHistory } from '@/lib/history-store';
import { readLiveResponse } from '@/lib/live-store';
import { readClientDigest, type ClientOverview } from '@/lib/notices-store';
import type { HistoryList } from '@/lib/session-history';
import { AttentionRow } from '../../attention-row';
import { LiveSession } from './live-session';
import { MeasurementsCard } from './measurements-card';
import { SessionRow } from './sessions/session-list';

/** Genel'in Antrenmanlar kartında en çok bu kadar son antrenman; gerisi sekmesinde. */
const RECENT_SESSIONS = 3;

/** Genel'in Dikkat kartında açık duran madde sayısı; gerisi altında "+n madde daha" ile katlanır. */
const ATTENTION_SHOWN = 5;

/**
 * Genel'in başındaki Dikkat kartı: Genel bakış'taki "Dikkat gerektirenler"in bu danışana düşen maddeleri, en acili
 * üstte; her madde danışanın ilgili sekmesine götürür. İlk beşi açık, gerisi "+n madde daha" (`details`) altında:
 * Genel bakış'ın "+n madde daha"sı buraya getirir, hiçbir madde ulaşılmaz kalmaz. Ad sayfanın başında olduğundan
 * satırlarda yazılmaz (yalnız ekran okuyucuya). Madde yoksa kart da yok.
 */
function AttentionSummaryCard({ clientId, name, items, locale }: { clientId: string; name: string; items: readonly AttentionItem[]; locale: Locale }) {
  if (items.length === 0) return null;
  const t = ptClientsMessages(locale).detail.attention;
  const { number } = getFormat(locale);
  const shown = items.slice(0, ATTENTION_SHOWN);
  const rest = items.slice(ATTENTION_SHOWN);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {t.title}
          <Badge variant="secondary" className="tabular-nums">
            {number(items.length)}
            <span className="sr-only">{t.itemsSr}</span>
          </Badge>
        </CardTitle>
        {/* Ünlemin anlamı yalnız kartta ünlem varken. */}
        {items.some((item) => item.tone === 'danger') ? <CardDescription>{t.redHint}</CardDescription> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <ul role="list" aria-label={t.listLabel} className="flex flex-col gap-1">
          {shown.map((item) => (
            <li key={item.key}>
              <AttentionRow clientId={clientId} item={{ ...item, clientName: name }} />
            </li>
          ))}
        </ul>
        {rest.length > 0 ? (
          <details className="group/more">
            <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-1.5 rounded-lg px-3 text-sm text-muted-foreground outline-none select-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
              <CaretRight
                aria-hidden
                weight="bold"
                className="size-3.5 shrink-0 motion-safe:transition-transform motion-safe:duration-160 group-open/more:rotate-90"
              />
              {t.more(rest.length, number(rest.length))}
            </summary>
            <ul role="list" aria-label={t.restLabel} className="mt-1 flex flex-col gap-1">
              {rest.map((item) => (
                <li key={item.key}>
                  <AttentionRow clientId={clientId} item={{ ...item, clientName: name }} />
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * Dikkat kartı kendi akışında: özet önbellekte değilse birkaç GitHub okuması sürer; sayfa onu beklemeden açılır,
 * kart hazır olunca gelir. Okuma sayfanın başında, öbür okumalarla birlikte başlar (`digest`); burada yalnız
 * beklenir. Özet okunamazsa (`null`, sayfanın geri kalanı gibi sessizce) ya da madde yoksa hiçbir şey.
 */
async function ClientAttention({
  clientId,
  name,
  timeZone,
  exercises,
  digest,
  locale,
}: {
  clientId: string;
  name: string;
  timeZone: string;
  exercises: ReadonlyMap<string, ExerciseWithSource>;
  digest: Promise<ClientOverview | null>;
  locale: Locale;
}) {
  const overview = await digest;
  if (!overview) return null;
  const items = attentionItems(overview.attention, {
    now: new Date(),
    timeZone,
    titleOf: (exerciseId) => exercises.get(exerciseId)?.title ?? exerciseId,
    locale,
  });
  return <AttentionSummaryCard clientId={clientId} name={name} items={items} locale={locale} />;
}

/**
 * Sağlık modülü kartındaki parçanın özeti (tasarım `kisit-tarama.md` §1): "2 etkin · 1 bildirim bekliyor",
 * "son 12 Eyl · 1 ağrı". Yalnız onaylı parçada ve kayıt okunduysa; yoksa null. `danger`: danışanın PT'nin bakmadığı
 * "şiddetli"si var (Dikkat gerektirenler'deki kırmızı ünlemin aynısı).
 */
function healthSummary(field: HealthField, record: HealthRecord | null, locale: Locale): { text: string; danger?: true } | null {
  if (!record) return null;
  const t = ptClientsMessages(locale).detail.health;
  const format = getFormat(locale);
  if (field === 'conditions') {
    const counts = constraintCounts(record);
    const parts = [
      t.active(format.number(counts.active)),
      counts.severe ? t.severe(format.number(counts.severe)) : null,
      counts.pending ? t.pending(counts.pending, format.number(counts.pending)) : null,
      counts.awaiting ? t.awaiting(format.number(counts.awaiting)) : null,
    ];
    return { text: parts.filter(Boolean).join(' · '), ...(counts.severe ? { danger: true as const } : {}) };
  }
  if (field === 'screening') {
    const latest = newestFirst(record.screenings ?? [])[0];
    if (!latest) return { text: t.noScreening };
    // Açık ağrılar (gözden geçirilmemiş, sonra ağrısız test edilmemiş): yeni tarama o testi yapmadıysa eskisininki de.
    const pain = painHistory(record.screenings ?? []).open.length;
    return { text: t.lastScreening(format.dayShort(latest.date), pain ? format.number(pain) : null) };
  }
  return null;
}

/**
 * Genel'in Antrenmanlar kartı: son antrenmanlar ve Antrenmanlar sekmesine geçiş (açık antrenman sayfanın
 * başında canlı). `null`: antrenmanlar okunamadı.
 */
function SessionsCard({ clientId, list, locale }: { clientId: string; list: HistoryList | null; locale: Locale }) {
  const t = ptClientsMessages(locale).detail.sessions;
  const href = `/dashboard/clients/${clientId}/sessions`;
  const recent = (list?.months ?? []).flatMap((month) => month.rows).slice(0, RECENT_SESSIONS);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.title}</CardTitle>
        <CardDescription className="tabular-nums">
          {list === null ? t.unreadable : (list.recent ?? t.subtitle)}
        </CardDescription>
      </CardHeader>
      {list !== null && list.count === 0 ? (
        <CardContent>
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Barbell weight="fill" />
              </EmptyMedia>
              <EmptyTitle>{t.emptyTitle}</EmptyTitle>
              <EmptyDescription>{t.emptyBody}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      ) : recent.length > 0 ? (
        <CardContent>
          <ul className="grid gap-2 lg:grid-cols-3" aria-label={t.recentLabel}>
            {recent.map((row) => (
              <li key={row.id}>
                <SessionRow clientId={clientId} row={row} />
              </li>
            ))}
          </ul>
        </CardContent>
      ) : null}
      {list !== null && list.count > 0 ? (
        <CardFooter>
          <Button variant="outline" nativeButton={false} render={<Link href={href} />}>
            {t.all(getFormat(locale).number(list.count))}
            <CaretRight data-icon="inline-end" weight="bold" />
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}

/**
 * Programın özeti: şu anki evre, programları atandıkları günlerle (Faz 3: bugünün ya da haftada sıradaki atanmış
 * program işaretli; dönüş yok), son değişiklik. Program yoksa "Program oluştur"; okunamıyorsa sorunu. `undefined`:
 * GitHub'dan okunamadı.
 */
function ProgramCard({
  clientId,
  file,
  exercises,
  timeZone,
  locale,
}: {
  clientId: string;
  file: ProgramFile | null | undefined;
  exercises: ReadonlyMap<string, ExerciseWithSource>;
  timeZone: string;
  locale: Locale;
}) {
  const t = ptClientsMessages(locale).detail.program;
  const format = getFormat(locale);
  const href = `/dashboard/clients/${clientId}/program`;
  const openButton = (
    <CardFooter>
      <Button variant="outline" nativeButton={false} render={<Link href={href} />}>
        <ListChecks data-icon="inline-start" />
        {t.open}
      </Button>
    </CardFooter>
  );

  if (file === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t.title}</CardTitle>
          <CardDescription>{t.unreadable}</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  if (file === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t.title}</CardTitle>
          <CardDescription>{t.none}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button nativeButton={false} render={<Link href={`${href}/new`} />}>
            <Plus data-icon="inline-start" />
            {t.create}
          </Button>
        </CardFooter>
      </Card>
    );
  }
  if (!file.program) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t.title}</CardTitle>
          <CardDescription className="text-destructive">{t.broken(file.problem ?? '')}</CardDescription>
        </CardHeader>
        {openButton}
      </Card>
    );
  }

  const program = file.program;
  const current = currentPhaseOf(program);
  const now = new Date();
  const status = phaseStatus(program, now);
  const today = todayIn(timeZone, now);
  const upcoming = upcomingAssigned(program, today);
  // Sıklık atanmış gün sayısı, atama yoksa evrenin `daysPerWeek`'i (`programWeekTarget`).
  const perWeek = frequencyLabel(programWeekTarget(program), locale);
  const perWeekText = perWeek ? lower(locale, perWeek) : undefined;
  // Evresiz programda evreden söz edilmez: antrenman sayısı ve sıklık.
  const description = program.phased
    ? [current?.phase.name, phaseStatusLabel(status, locale)].filter(Boolean).join(' · ') + (perWeekText ? ` · ${perWeekText}` : '')
    : [t.workouts(countDays(program.phases), format.number(countDays(program.phases))), perWeekText].filter(Boolean).join(' · ');
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        {program.phased && status.kind === 'due' ? (
          <CardAction>
            <Badge variant="outline">{t.phaseDue}</Badge>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label={program.phased ? t.currentPhaseLabel : t.programsLabel}>
          {displayDays(current?.phase.days ?? []).map((day) => {
            const summary = templateSummary({ blocks: day.blocks }, exercises);
            const isNext = day.id === upcoming?.dayId;
            return (
              <li key={day.id}>
                <Item variant="outline" size="sm" className={isNext ? 'bg-primary/5 ring-2 ring-primary-text' : undefined}>
                  <ItemContent>
                    <ItemTitle className="break-words">{day.name}</ItemTitle>
                    <ItemDescription>{weekdaysText(day.weekdays ?? [], locale) || t.noDays}</ItemDescription>
                    <ItemDescription className="tabular-nums">
                      {t.summary(summary.rows, format.number(summary.rows), summary.workingSets, format.number(summary.workingSets), format.number(summary.minutes))}
                    </ItemDescription>
                  </ItemContent>
                  {isNext ? (
                    <ItemActions>
                      <Badge>{upcoming?.date === today ? t.today : t.next}</Badge>
                    </ItemActions>
                  ) : null}
                </Item>
              </li>
            );
          })}
        </ul>
        <p className="text-sm text-muted-foreground">{t.lastChange(format.date(program.updatedAt, timeZone))}</p>
      </CardContent>
      {openButton}
    </Card>
  );
}

/** Danışan detayı — yalnız gösterir; değiştirmek için "Düzenle" (SPEC §6). */
export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePt();
  const { id } = await params;
  if (!CLIENT_ID_PATTERN.test(id)) notFound();
  const locale = await getLocale();
  const t = ptClientsMessages(locale);
  const format = getFormat(locale);
  const [loaded, config] = await Promise.all([loadClient(id), readAppConfig()]);
  if (!loaded) notFound();

  // Listede var ama kaydı okunamıyor (repo dışarıdan silinmiş ya da kayıt bozuk).
  if (!loaded.ok) {
    return (
      <div className="flex flex-col gap-6">
        <SectionHeader
          title={t.detail.title}
          description={t.shell.unreadableDescription}
          actions={<EditButton href={`/dashboard/clients/${id}/edit`} />}
        />
        <Card>
          <CardHeader>
            <CardTitle>{t.list.unreadableTitle}</CardTitle>
            <CardDescription>{t.list.unreadableBody(loaded.problem)}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const { client } = loaded;
  // Dikkat özeti hemen başlar ama beklenmez (kartı kendi akışında); `.catch` burada: aşağıdaki okumalardan biri
  // düşse de sahipsiz bir ret kalmasın.
  const digest = readClientDigest(id, locale).catch(() => null);
  const [invite, programFile, exercises, measurements, history, live, healthRecord] = await Promise.all([
    readInvite(id),
    // undefined: GitHub'dan okunamadı; sayfa yine açılır.
    readProgramFile(id).catch(() => undefined),
    listExercises(),
    loadMeasurements(client).catch(() => undefined),
    loadHistory(id, config.timeZone, locale).catch(() => null),
    readLiveResponse(id),
    // Kısıt ve tarama özeti yalnız o parçanın onayı sürdükçe (onay yoksa dosya okunmaz).
    readHealthIfAllowed(client, ['conditions', 'screening']).catch(() => null),
  ]);
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const repo = clientRepoName(id);
  const access = accessOf(client, invite?.invite ?? null);
  const statusLabels = clientStatusLabels(locale);
  const fieldInfo = healthFieldInfo(locale);
  const health = healthConsentState(client);
  const consent = client.consents.health;
  // Onay danışanın kendi ekranında verilir; hiç girmemiş danışanda onay kaydı tutarsızdır (elle eklenmiş).
  const consentWithoutJoin = Boolean(consent) && !client.access.joinedAt && !client.access.lastJoinAt;
  const coach = coachAccess(client) === 'ready';

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title={t.detail.title}
        description={t.detail.description}
        actions={
          <>
            {coach ? <CoachButton label={t.detail.askAi} detail={{ clientId: id, autoReview: true }} /> : null}
            <EditButton href={`/dashboard/clients/${id}/edit`} />
          </>
        }
      />

      {/* Danışanın dikkat maddeleri en üstte: PT sayfayı açınca önce bakılacakları görür. Madde yoksa kart da
          olmadığından yer tutucu yok. */}
      <Suspense fallback={null}>
        <ClientAttention clientId={id} name={client.name} timeZone={config.timeZone} exercises={exerciseById} digest={digest} locale={locale} />
      </Suspense>

      {/* Açık antrenman canlı (tasarım §4.6); kimse çalışmıyorken satır yok. */}
      <LiveSession clientId={id} initial={live} />

      {/* Kartlar kendi boyunda: soldaki profil sağ sütunun boyuna uzayıp alt bölümü ortada bırakmasın. */}
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Card>
          <CardHeader>
            <CardTitle>{t.detail.profile.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell className="text-muted-foreground">{t.detail.profile.status}</TableCell>
                  <TableCell>
                    <Badge variant={client.status === 'active' ? 'secondary' : 'outline'}>
                      {statusLabels[client.status]}
                    </Badge>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-muted-foreground">{t.detail.profile.added}</TableCell>
                  <TableCell>{format.date(client.createdAt, config.timeZone)}</TableCell>
                </TableRow>
                {/* Öneri motorunun aşama tabanı (tasarım §5.2): her hareketin Tanışma'sı ve en düşük aşaması. */}
                <TableRow>
                  <TableCell className="text-muted-foreground">{t.detail.profile.experience}</TableCell>
                  <TableCell>{client.training ? trainingExperienceLabels(locale)[client.training.experience] : t.detail.profile.notEntered}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="align-top text-muted-foreground">{t.detail.profile.note}</TableCell>
                  <TableCell className="whitespace-pre-wrap">{client.note ?? '—'}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
          {/* Verinin durduğu yer PT'nin işi değil; gerektiğinde (yedek, elle düzeltme) burada. */}
          <CardFooter>
            <details className="w-full text-sm">
              <summary className="w-fit cursor-pointer text-muted-foreground underline-offset-4 hover:underline touch:py-3">
                {t.detail.profile.technical}
              </summary>
              <div className="flex flex-col items-start gap-2 pt-2">
                <p className="text-muted-foreground">
                  {t.detail.profile.repo}
                  <span className="font-mono text-xs text-foreground">{repo}</span>
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={<a href={`https://github.com/${serverEnv().owner}/${repo}`} target="_blank" rel="noreferrer" />}>
                  <ArrowSquareOut data-icon="inline-start" weight="fill" />
                  {t.detail.profile.openOnGithub}
                </Button>
              </div>
            </details>
          </CardFooter>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t.detail.access.title}</CardTitle>
              <CardDescription>{accessDetail(client, invite?.invite ?? null, config.timeZone, new Date(), locale)}</CardDescription>
              <div>
                <AccessBadge state={access} password={passwordOf(client)} locale={locale} />
              </div>
            </CardHeader>
            {client.status !== 'archived' ? (
              <CardFooter>
                <Button variant="outline" nativeButton={false} render={<Link href={`/dashboard/clients/${id}/invite`} />}>
                  <QrCode data-icon="inline-start" weight="fill" />
                  {access === 'joined' ? t.detail.access.newCode : access === 'none' ? t.detail.access.invite : t.detail.access.inviteScreen}
                </Button>
              </CardFooter>
            ) : null}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t.detail.health.title}</CardTitle>
              <CardDescription>
                {healthStateDetails(locale)[health]}
                {consentWithoutJoin && health !== 'off' ? t.detail.health.withoutJoin : null}
              </CardDescription>
              <div>
                <Badge variant={health === 'granted' ? 'secondary' : 'outline'}>{healthStateLabels(locale)[health]}</Badge>
              </div>
            </CardHeader>
            {client.modules.health.enabled ? (
              <CardContent>
                <ul className="flex flex-col gap-2 text-sm">
                  {client.modules.health.fields.map((field) => {
                    const state = healthFieldState(client, field);
                    const summary = state === 'granted' ? healthSummary(field, healthRecord, locale) : null;
                    const path = field === 'conditions' ? 'constraints' : field === 'screening' ? 'screening' : field === 'measurements' ? 'measurements' : null;
                    return (
                      <li key={field} className="flex items-baseline justify-between gap-3">
                        {path ? (
                          <Link href={`/dashboard/clients/${id}/${path}`} className="underline-offset-4 hover:underline">
                            {fieldInfo[field].label}
                          </Link>
                        ) : (
                          <span>{fieldInfo[field].label}</span>
                        )}
                        <span className={cn('text-right text-xs text-muted-foreground', summary?.danger && 'text-foreground')}>
                          {summary?.danger ? (
                            <>
                              <WarningCircle weight="fill" aria-hidden className="mr-1 inline size-3.5 align-[-0.125rem] text-destructive" />
                              <span className="sr-only">{t.detail.health.urgentSr}</span>
                            </>
                          ) : null}
                          {state === 'granted'
                            ? (summary?.text ?? t.detail.health.granted)
                            : state === 'outdated' && consent?.granted
                              ? t.detail.health.renewing
                              : t.detail.health.noConsent}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            ) : null}
          </Card>

          <MeasurementsCard clientId={id} view={measurements} today={todayIn(config.timeZone)} />
        </div>
      </div>

      <ProgramCard clientId={id} file={programFile} exercises={exerciseById} timeZone={config.timeZone} locale={locale} />

      <SessionsCard clientId={id} list={history} locale={locale} />
    </div>
  );
}
