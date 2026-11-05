import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Bandaids, Lightning, WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { CoachButton } from '@/components/coach/coach-button';
import { EditButton } from '@/components/edit-button';
import { ListChecks, Plus } from '@/components/line-icons';
import { SectionHeader } from '@/components/section-header';
import { ChangeLog } from '@/components/program/change-log';
import { DayPlan } from '@/components/program/day-plan';
import { PhaseLoad, type DoneLoad } from '@/components/program/phase-load';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Progress, ProgressLabel } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { coachAccess } from '@/lib/ai/coach-contract';
import { loadCareInput } from '@/lib/client-care';
import { clientTargetNotes } from '@/lib/client-targets';
import { loadClient } from '@/lib/clients';
import { programConflicts } from '@/lib/constraint-filter';
import { readAppConfig } from '@/lib/config';
import { listExercises } from '@/lib/exercises';
import { getFormat, todayIn } from '@/lib/format';
import { requirePt } from '@/lib/guards';
import { exerciseSetWeights } from '@/lib/muscles';
import {
  displayDays,
  countDays,
  currentPhaseOf,
  frequencyLabel,
  missingExerciseDays,
  phaseMuscleLoad,
  phaseProgress,
  phaseStatus,
  phaseStatusLabel,
  sourceNames,
  type ProgramPhase,
} from '@/lib/program-plan';
import { deloadHints, loadComparison, thisWeekLoad } from '@/lib/program-insights';
import { readProgramFile } from '@/lib/programs';
import { weekLabel } from '@/lib/progress-text';
import { isFaded, pendingProposals, proposalKindLabels } from '@/lib/proposals';
import { readProposals } from '@/lib/proposals-store';
import { CLIENT_ID_PATTERN } from '@/lib/schemas/client';
import { readIndex } from '@/lib/session-files-core';
import { sessionRepo } from '@/lib/session-files';
import { lastWorkout } from '@/lib/session-history';
import { templateSummary } from '@/lib/template-plan';
import { templateChoices } from '@/lib/templates';
import {
  assignmentsText,
  isoWeekdayOf,
  phaseFrequency,
  upcomingAssigned,
  weekdayLabels,
  weekdaysText,
} from '@/lib/training-days';
import { cn } from '@/lib/utils';
import { readOwnState } from '@/lib/own-program-files';
import { InvalidProgramAlert } from './invalid-program-alert';
import { OwnActiveAlert, SharedProgramsCard } from './own-programs-card';
import { PhaseTransition } from './phase-transition';
import { ProposalsCard, type ProposalView } from './proposals-card';
import { getLocale, getMessages } from '@/i18n/server';
import { lower } from '@/i18n/text';
import { ptProgramMessages } from '@/i18n/messages/pt-program';

export async function generateMetadata(): Promise<Metadata> {
  const t = (await getMessages(ptProgramMessages)).programPage;
  return { title: t.title };
}

/**
 * Danışanın programı — yalnız gösterim; tek eylem "Düzenle" (SPEC §6). İstisnalar: şu anki
 * evrenin süresi dolunca sonraki evreye geçiş önerisi burada onaylanır (SPEC §7.4); en üstte
 * "Danışandan öneriler (n)" [Uygula] [Reddet] (tasarım §6.4); danışanın tekrar hedefi olan satırda
 * "Danışan güncelledi" rozeti (§6.2). Kas yükünde planlanan haftalığın yanında bu hafta yapılan (SPEC §7.4);
 * İleri aşamadaki harekette hafifletme ipucu (tasarım §5.3, `deloadHintDue`).
 *
 * Faz 3: programlar haftanın günlerine atanır, dönüş yok. Üstte bugünün ya da haftada sıradaki atanmış program
 * (`upcomingAssigned`), "Haftanın programı" kartında programlar atandıkları günlerle; evresiz programda evreden söz
 * edilmez ("Durum" kartı: bugün / sıradaki, sıklık, antrenman günleri). Danışan günleri değiştiremez (Karar 3):
 * kayıtta danışanın eski gün katmanı kaldıysa yalnız soluk bir satır söyler, PT'nin ilk kaydı onu siler.
 * Danışan kendi programıyla çalışıyorsa en üstte bilgi satırı; paylaştığı programlar en altta
 * (`docs/design/kendi-program.md` §4).
 */
export default async function ProgramPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePt();
  const locale = await getLocale();
  const messages = ptProgramMessages(locale);
  const p = messages.programPage;
  const ov = messages.ownProgramView;
  const format = getFormat(locale);
  const { id } = await params;
  if (!CLIENT_ID_PATTERN.test(id)) notFound();
  const loaded = await loadClient(id);
  if (!loaded) notFound();
  // Kaydı okunamayan danışan: sorunu detay sayfası anlatır.
  if (!loaded.ok) redirect(`/dashboard/clients/${id}`);
  const { client } = loaded;
  // AI koç açıksa "AI ile taslak öner": panel bu danışanın "Program hazırla" sekmesiyle açılır.
  const draftButton =
    coachAccess(client) === 'ready' ? <CoachButton label={p.draftLabel} detail={{ clientId: id, tab: 'program' }} /> : null;

  const [file, exercises, config, templates, proposals, sessions, own] = await Promise.all([
    readProgramFile(id, locale),
    listExercises(),
    readAppConfig(),
    templateChoices().catch(() => []),
    // Öneriler okunamasa da program görünür.
    readProposals(id).catch(() => null),
    // Antrenmanlar (bu haftanın yükü, hafifletme ipucu) okunamasa da program görünür.
    readIndex(sessionRepo(id)).catch(() => null),
    // Danışanın kendi programları (index): okunamasa da program görünür.
    readOwnState(sessionRepo(id)).catch(() => null),
  ]);
  const ownIndex = own?.index ?? null;
  const detailHref = `/dashboard/clients/${id}`;
  const editHref = `${detailHref}/program/edit`;

  if (!file) {
    return (
      <div className="flex flex-col gap-6">
        <SectionHeader title={p.title} />
        <OwnActiveAlert clientId={id} index={ownIndex} timeZone={config.timeZone} />
        <Card>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ListChecks />
              </EmptyMedia>
              <EmptyTitle>{p.emptyTitle}</EmptyTitle>
              <EmptyDescription>{p.emptyBody}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="flex-row flex-wrap justify-center">
              <Button nativeButton={false} render={<Link href={`${detailHref}/program/new`} />}>
                <Plus data-icon="inline-start" />
                {p.create}
              </Button>
              {draftButton}
            </EmptyContent>
          </Empty>
        </Card>
        <SharedProgramsCard clientId={id} index={ownIndex} sessions={sessions?.index ?? null} timeZone={config.timeZone} />
      </div>
    );
  }

  if (!file.program) {
    return (
      <div className="flex flex-col gap-6">
        <SectionHeader title={p.title} actions={<EditButton href={editHref} />} />
        <OwnActiveAlert clientId={id} index={ownIndex} timeZone={config.timeZone} />
        <InvalidProgramAlert problem={file.problem} />
        <SharedProgramsCard clientId={id} index={ownIndex} sessions={sessions?.index ?? null} timeZone={config.timeZone} />
      </div>
    );
  }

  const program = file.program;
  const { timeZone } = config;
  const phased = program.phased;
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const templateIds = new Set(templates.map((template) => template.id));
  const current = currentPhaseOf(program);
  const now = new Date();
  const status = phaseStatus(program, now);
  const progress = phaseProgress(program, now);
  // Bugün uygulamanın saat diliminde: bugünün ya da haftada sıradaki atanmış program (dönüş yok, Faz 3).
  const today = todayIn(timeZone, now);
  const upcoming = upcomingAssigned(program, today);
  const nextId = upcoming?.dayId ?? null;
  const nextDay = current?.phase.days.find((day) => day.id === nextId);
  // "Bugün · Alt vücut" ya da "Perşembe · Üst vücut"; atama yoksa yok.
  const upcomingWhen = upcoming ? (upcoming.date === today ? ov.today : weekdayLabels(locale)[isoWeekdayOf(upcoming.date)]) : null;
  const upcomingText = upcomingWhen && nextDay ? `${upcomingWhen} · ${nextDay.name}` : null;
  const missingRows = missingExerciseDays(program.phases, new Set(byId.keys())).reduce((sum, item) => sum + item.rowIds.length, 0);
  const sources = sourceNames(program.phases);
  const load = current ? phaseMuscleLoad(current.phase, byId, exerciseSetWeights) : null;
  const nextPhase = status.kind === 'due' ? program.phases.find((phase) => phase.id === status.nextPhaseId) : undefined;
  const perWeek = (daysPerWeek: number | undefined) => {
    const label = frequencyLabel(daysPerWeek, locale);
    return label === null ? null : lower(locale, label);
  };
  // Sıklık atanmış gün sayısı, atama yoksa evrenin `daysPerWeek`'i (`phaseFrequency`).
  const frequency = frequencyLabel(current ? phaseFrequency(current.phase) : undefined, locale);
  const created = ov.createdOn(format.date(program.createdAt, timeZone));
  const description = phased
    ? [p.phaseCount(program.phases.length), p.workoutCount(countDays(program.phases)), created].join(' · ')
    : [p.workoutCount(countDays(program.phases)), current ? perWeek(phaseFrequency(current.phase)) : null, created].filter(Boolean).join(' · ');
  // Son antrenman: PT programında bitmişlerin en yenisi, yarım dahil (danışan ekranıyla aynı kural).
  const last = lastWorkout(sessions?.index ?? null);
  // Bu hafta yapılan (İlerleme sekmesiyle aynı hesap), planlanan haftalığın yanında.
  const week = sessions ? thisWeekLoad({ index: sessions.index, today, exercises: byId, setWeightsOf: exerciseSetWeights }) : null;
  const done: DoneLoad | null = week
    ? {
        load: week.muscles,
        sessions: week.sessions,
        sets: week.sets,
        range: weekLabel(week.weekStart, week.weekEnd, locale),
        versus: load?.weekly ? loadComparison(load.weekly, week.muscles) : null,
      }
    : null;
  const phaseLoad =
    current && load ? (
      <PhaseLoad
        cycle={load.cycle}
        weekly={load.weekly}
        factor={load.factor}
        daysPerWeek={current.phase.daysPerWeek}
        dayCount={current.phase.days.length}
        assigned={load.assigned}
        label={phased ? p.phaseLoadLabel : ov.loadLabel}
        done={done}
      />
    ) : null;
  // İleri aşamadaki hareketlerde hafifletme ipucu (tasarım §5.3): şu anki evrenin hareketleri.
  const hints =
    sessions && current
      ? deloadHints({
          exerciseIds: current.phase.days.flatMap((day) => day.blocks.flatMap((block) => block.rows.map((row) => row.exerciseId))),
          index: sessions.index,
          now,
          experience: client.training?.experience,
        })
      : [];
  const nextSummary = nextDay ? templateSummary({ blocks: nextDay.blocks }, byId) : null;
  // Danışanın geçerli tekrar hedefleri (§6.2): satırda "Danışan güncelledi · hedef 10–14 · 26 Eyl".
  const targetNotes = Object.fromEntries(
    Object.entries(clientTargetNotes(program.phases, program.clientTargets, (exerciseId) => byId.get(exerciseId)?.trackingType ?? 'weight_reps', locale)).map(
      ([rowId, note]) => [rowId, `${note.text} · ${format.dayShort(todayIn(timeZone, new Date(note.at)))}`],
    ),
  );
  // Danışandan öneriler (§6.4): bekleyenler, en yeni üstte; gün adı programdan.
  const dayNames = new Map(program.phases.flatMap((phase) => phase.days.map((day) => [day.id, day.name] as const)));
  const proposalViews: ProposalView[] = proposals
    ? pendingProposals(proposals.file).map((item) => ({
        id: item.id,
        sessionId: item.sessionId,
        text: item.text,
        ...(item.why ? { why: item.why } : {}),
        meta: [dayNames.get(item.dayId), format.date(item.at, timeZone)].filter(Boolean).join(' · '),
        kindLabel: proposalKindLabels(locale)[item.kind],
        faded: isFaded(item, now),
      }))
    : [];
  // Antrenman günleri (Faz 3): şu anki evrenin atamaları. Danışanın eski gün katmanı (ham `clientSchedule`) artık
  // okunmaz; kayıtta durdukça soluk satır söyler, PT'nin ilk kaydı ya da evre geçişi siler (Karar 3). Rozet ve geri
  // dönüş yok.
  const daysRow = (
    <TableRow>
      <TableCell className="text-muted-foreground">{p.workoutDays}</TableCell>
      <TableCell className="whitespace-normal">
        <div className="flex flex-col gap-1">
          <span className="break-words">{(current ? assignmentsText(current.phase.days, locale) : '') || p.noDaysYet}</span>
          {program.clientSchedule ? (
            <span className="text-xs text-muted-foreground">
              {p.oldClientDays(weekdaysText(program.clientSchedule.weekdays, locale))}
            </span>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
  const upcomingRow = (
    <TableRow>
      <TableCell className="text-muted-foreground">{p.todayNext}</TableCell>
      <TableCell className="whitespace-normal">{upcomingText ?? '—'}</TableCell>
    </TableRow>
  );

  const dayCards = (phase: ProgramPhase) => (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {displayDays(phase.days).map((day) => {
        const summary = templateSummary({ blocks: day.blocks }, byId);
        // Bugünün ya da haftada sıradaki atanmış programı (yalnız şu anki evrede) işaretli.
        const isNext = phase.id === current?.phase.id && day.id === nextId;
        const source = day.source;
        return (
          <li key={day.id} className={cn('flex flex-col gap-3 rounded-lg border p-3', isNext && 'bg-primary/5 ring-2 ring-primary-text')}>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium break-words">{day.name}</span>
                {isNext ? <Badge>{upcoming?.date === today ? ov.today : ov.next}</Badge> : null}
              </div>
              <span className="text-sm text-muted-foreground">{weekdaysText(day.weekdays ?? [], locale) || ov.noDays}</span>
              <span className="text-sm tabular-nums text-muted-foreground">
                {ov.summary(summary.rows, summary.workingSets, summary.minutes)}
              </span>
              {source ? (
                <span className="text-xs text-muted-foreground">
                  {templateIds.has(source.templateId) ? (
                    <Link
                      href={`/dashboard/templates/${source.templateId}`}
                      className="underline underline-offset-4 touch:inline-flex touch:min-h-11 touch:items-center">
                      {messages.dayEditor.fromTemplate(source.templateName)}
                    </Link>
                  ) : (
                    <>{messages.dayEditor.fromTemplateDeleted(source.templateName)}</>
                  )}
                </span>
              ) : null}
            </div>
            <DayPlan blocks={day.blocks} exercises={byId} missing="show" rowNotes={targetNotes} locale={locale} />
          </li>
        );
      })}
    </ul>
  );

  /*
   * Sıra telefonda işe göre (DOM sırası): bugünün ya da sıradaki atanmış program ve hareketleri → haftanın programı
   * → evre ya da durum özeti → evreler → kas yükü → geçmiş. Masaüstünde iki sütun: bugünün programı evre özetinin
   * yanında, programlar tam genişlikte, kas yükü evrelerin yanında (`lg:order-*`).
   */
  // Kısıtlarla çelişen satırlar (tasarım `kisit-tarama.md` §3.3): yalnız kısıtların onayı sürdükçe.
  // Bugün kısıtların günü ve çelişkinin "sıradaki"si için (Faz 3: bugünkü ya da sıradaki atanmış program).
  const careInput = await loadCareInput(client, today, locale);
  const conflicts = careInput ? programConflicts(program, new Map(exercises.map((exercise) => [exercise.id, exercise])), careInput, today) : [];

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title={p.title}
        description={description}
        actions={
          <>
            {draftButton}
            <EditButton href={editHref} />
          </>
        }
      />
      <OwnActiveAlert clientId={id} index={ownIndex} timeZone={timeZone} />

      {conflicts.length > 0 ? (
        <Alert>
          <Bandaids weight="fill" />
          <AlertTitle>{ov.conflictsTitle(conflicts.length)}</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <p>{conflicts.map((conflict) => `${conflict.dayName} · ${conflict.title} (${conflict.message})`).join(' · ')}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" nativeButton={false} render={<Link href={editHref} />}>
                {ov.editProgram}
              </Button>
              <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`${detailHref}/constraints`} />}>
                {ov.limitations}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {proposalViews.length > 0 ? <ProposalsCard clientId={id} items={proposalViews} /> : null}
      {proposals?.broken ? (
        <Alert>
          <WarningCircle weight="fill" />
          <AlertTitle>{p.proposalsBrokenTitle}</AlertTitle>
          <AlertDescription>{p.proposalsBrokenBody}</AlertDescription>
        </Alert>
      ) : null}

      {hints.length > 0 ? (
        <Alert>
          <Lightning weight="fill" />
          <AlertTitle>{p.deloadTitle}</AlertTitle>
          <AlertDescription>
            <p>{p.deloadBody}</p>
            <ul className="list-disc pl-5">
              {hints.map((hint) => (
                <li key={hint.exerciseId}>
                  {byId.get(hint.exerciseId)?.title ?? hint.exerciseId}:{' '}
                  {hint.since === 'deload' ? p.deloadSince(hint.weeks) : p.deloadNone(hint.weeks)}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      {phased && status.kind === 'due' && current && nextPhase ? (
        <PhaseTransition
          clientId={id}
          phaseName={current.phase.name}
          description={p.phaseDue(status.weeks, format.date(program.current.startedAt, timeZone), nextPhase.name)}
          next={{ id: nextPhase.id, name: nextPhase.name }}
          revision={program.revision}
          createdAt={program.createdAt}
        />
      ) : null}

      {phased && status.kind === 'ended' && current ? (
        <Alert>
          <WarningCircle weight="fill" />
          <AlertTitle>{messages.phasesCard.expired(current.phase.name)}</AlertTitle>
          <AlertDescription>{p.phaseEndedBody}</AlertDescription>
        </Alert>
      ) : null}

      {missingRows > 0 ? (
        <Alert>
          <WarningCircle weight="fill" />
          <AlertTitle>{ov.missingTitle(missingRows)}</AlertTitle>
          <AlertDescription>{p.missingBody}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        {nextDay && nextSummary && upcomingText ? (
          <Card className="lg:order-1">
            <CardHeader>
              <CardTitle>{upcoming?.date === today ? upcomingText : p.nextTitle(upcomingText)}</CardTitle>
              <CardDescription className="tabular-nums">
                {[
                  phased ? current?.phase.name : null,
                  ov.summary(nextSummary.rows, nextSummary.workingSets, nextSummary.minutes),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DayPlan blocks={nextDay.blocks} exercises={byId} missing="show" rowNotes={targetNotes} locale={locale} />
            </CardContent>
          </Card>
        ) : null}

        <Card className="lg:order-3 lg:col-span-2">
          <CardHeader>
            <CardTitle>{ov.weekTitle}</CardTitle>
            <CardDescription>
              {phased ? p.weekHintPhased : ov.weekHint}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {phased ? (
              <Tabs defaultValue={program.current.phaseId}>
                <TabsList variant="line" className="w-full justify-start overflow-x-auto">
                  {program.phases.map((phase, index) => (
                    <TabsTrigger key={phase.id} value={phase.id} className="flex-none">
                      {index + 1}. {phase.name}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {program.phases.map((phase) => (
                  <TabsContent key={phase.id} value={phase.id} className="pt-3">
                    {dayCards(phase)}
                  </TabsContent>
                ))}
              </Tabs>
            ) : current ? (
              dayCards(current.phase)
            ) : null}
          </CardContent>
        </Card>

        {phased ? (
          <Card className="lg:order-2">
            <CardHeader>
              <CardTitle>{p.currentPhaseTitle(current?.phase.name ?? '')}</CardTitle>
              <CardDescription>{phaseStatusLabel(status, locale)}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {status.kind !== 'open' && progress !== null ? (
                <Progress value={progress * 100}>
                  <ProgressLabel>{p.weekOf(Math.min(status.week, status.weeks), status.weeks)}</ProgressLabel>
                </Progress>
              ) : null}
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="w-32 text-muted-foreground">{p.started}</TableCell>
                    <TableCell>{format.date(program.current.startedAt, timeZone)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">{p.ends}</TableCell>
                    <TableCell>{status.kind === 'open' ? p.openEnded : format.date(status.endsAt, timeZone)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">{p.frequency}</TableCell>
                    <TableCell>{frequency ?? p.notSpecified}</TableCell>
                  </TableRow>
                  {daysRow}
                  {upcomingRow}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : (
          <Card className="lg:order-2">
            <CardHeader>
              <CardTitle>{p.statusTitle}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="w-36 text-muted-foreground">{p.todayNext}</TableCell>
                    <TableCell className="whitespace-normal">{upcomingText ?? '—'}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">{p.frequency}</TableCell>
                    <TableCell>{frequency ?? p.notSpecified}</TableCell>
                  </TableRow>
                  {daysRow}
                  <TableRow>
                    <TableCell className="text-muted-foreground">{p.lastWorkout}</TableCell>
                    <TableCell>{last ? p.lastWorkoutValue(format.day(last.date), Boolean(last.unfinished)) : sessions ? p.noneYet : '—'}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">{p.started}</TableCell>
                    <TableCell>{format.date(program.current.startedAt, timeZone)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              {sources.length > 0 ? (
                <p className="text-sm text-muted-foreground">{p.sourceTemplates(sources.join(', '))}</p>
              ) : null}
            </CardContent>
          </Card>
        )}

        {phased ? (
          <Card className="lg:order-4">
            <CardHeader>
              <CardTitle>{messages.phasesCard.title}</CardTitle>
              <CardDescription>{p.phasesHint}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ol className="flex flex-col gap-3">
                {program.phases.map((phase, index) => {
                  const position = current ? index - current.index : 0;
                  return (
                    <li key={phase.id} className="flex flex-col gap-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">
                          {index + 1}. {phase.name}
                        </span>
                        {position === 0 ? (
                          <Badge variant="secondary">{messages.phasesCard.current}</Badge>
                        ) : (
                          <Badge variant="outline">{position < 0 ? p.previous : p.upcoming}</Badge>
                        )}
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {[p.weeksText(phase.weeks), perWeek(phaseFrequency(phase)), displayDays(phase.days).map((day) => day.name).join(', ')]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </li>
                  );
                })}
              </ol>
              {sources.length > 0 ? (
                <p className="text-sm text-muted-foreground">{p.sourceTemplates(sources.join(', '))}</p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {phaseLoad ? (
          <Card className={cn('lg:order-5', !phased && 'lg:col-span-2')}>
            <CardHeader>
              <CardTitle>{ov.loadTitle}</CardTitle>
              <CardDescription>{p.loadHint(phased, done !== null)}</CardDescription>
            </CardHeader>
            <CardContent>{phaseLoad}</CardContent>
          </Card>
        ) : null}

        <Card id="gecmis" className="scroll-mt-4 lg:order-6 lg:col-span-2">
          <CardHeader>
            <CardTitle>{p.historyTitle}</CardTitle>
            <CardDescription>{p.historyHint}</CardDescription>
          </CardHeader>
          <CardContent>
            <ChangeLog entries={program.log} timeZone={timeZone} initial={20} />
          </CardContent>
        </Card>
      </div>

      <SharedProgramsCard clientId={id} index={ownIndex} sessions={sessions?.index ?? null} timeZone={timeZone} />
    </div>
  );
}
