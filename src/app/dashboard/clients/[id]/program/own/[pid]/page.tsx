import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Bandaids, WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { EditorBackLink } from '@/components/block-editor/editor-back-link';
import { EditButton } from '@/components/edit-button';
import { SectionHeader } from '@/components/section-header';
import { ChangeLog } from '@/components/program/change-log';
import { DayPlan } from '@/components/program/day-plan';
import { PhaseLoad } from '@/components/program/phase-load';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { loadCareInput } from '@/lib/client-care';
import { loadClient } from '@/lib/clients';
import { readAppConfig } from '@/lib/config';
import { programConflicts } from '@/lib/constraint-filter';
import { listExercises } from '@/lib/exercises';
import { getFormat, todayIn } from '@/lib/format';
import { requirePt } from '@/lib/guards';
import { exerciseSetWeights } from '@/lib/muscles';
import { programLine } from '@/lib/own-program-text';
import { isOwnProgramId, ownSummaryOf } from '@/lib/own-programs';
import { readOwnProgramOf } from '@/lib/own-programs-store';
import { displayDays, missingExerciseDays, phaseMuscleLoad } from '@/lib/program-plan';
import { CLIENT_ID_PATTERN } from '@/lib/schemas/client';
import { templateSummary } from '@/lib/template-plan';
import { upcomingAssigned, weekdaysText } from '@/lib/training-days';
import { cn } from '@/lib/utils';
import { getLocale, getMessages } from '@/i18n/server';
import { ptProgramMessages } from '@/i18n/messages/pt-program';

export async function generateMetadata(): Promise<Metadata> {
  const t = (await getMessages(ptProgramMessages)).ownProgramView;
  return { title: t.title };
}

/**
 * Danışanın paylaştığı kendi programı (`docs/design/kendi-program.md` §4): PT program sayfasının evresiz hâli —
 * "Haftanın programı" (programlar atandıkları günlerle, `DayPlan`; Faz 3: atamayı danışan yapar, bugünün ya da
 * haftada sıradaki atanmış program işaretli), planlanan kas yükü ve değişiklikler (etiketler PT'ye göre, §7.3). Tek eylem [Düzenle]; öneri,
 * evre geçişi ve silme yok. Paylaşılmamış dosyanın içeriği gösterilmez. Kısıtlarla çelişen satırlar program
 * sayfasındaki gibi en üstte (`kisit-tarama.md` §3.3; yalnız kısıtların onayı sürdükçe).
 */
export default async function OwnProgramViewPage({ params }: { params: Promise<{ id: string; pid: string }> }) {
  await requirePt();
  const locale = await getLocale();
  const t = ptProgramMessages(locale).ownProgramView;
  const format = getFormat(locale);
  const { id, pid } = await params;
  if (!CLIENT_ID_PATTERN.test(id) || !isOwnProgramId(pid)) notFound();
  const loaded = await loadClient(id);
  if (!loaded) notFound();
  if (!loaded.ok) redirect(`/dashboard/clients/${id}`);

  const [read, exercises, config] = await Promise.all([readOwnProgramOf(id, pid), listExercises(undefined, locale), readAppConfig()]);
  if (read.status === 'missing') notFound();
  const back = <EditorBackLink href={`/dashboard/clients/${id}/program`} label={t.backLabel} />;

  if (read.status === 'invalid' || !read.program.shared) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          {back}
          <SectionHeader title={t.title} />
        </div>
        <Alert>
          <WarningCircle weight="fill" />
          <AlertTitle>{read.status === 'invalid' ? t.unreadableTitle : t.unsharedTitle}</AlertTitle>
          <AlertDescription>
            {read.status === 'invalid' ? t.invalidBody : t.unsharedBody}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const program = read.program;
  const { timeZone } = config;
  const phase = program.phases[0];
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const today = todayIn(timeZone);
  // Bugünün ya da haftada sıradaki atanmış program (dönüş yok, Faz 3); atama yoksa işaret yok.
  const upcoming = upcomingAssigned(program, today);
  const load = phase ? phaseMuscleLoad(phase, byId, exerciseSetWeights) : null;
  const missingRows = missingExerciseDays(program.phases, new Set(byId.keys())).reduce((sum, item) => sum + item.rowIds.length, 0);
  const description = [programLine(ownSummaryOf(program), undefined, locale), t.createdOn(format.date(program.createdAt, timeZone))].join(' · ');
  const careInput = await loadCareInput(loaded.client, today, locale);
  const conflicts = careInput ? programConflicts(program, byId, careInput, today) : [];
  const editHref = `/dashboard/clients/${id}/program/own/${pid}/edit`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        {back}
        <SectionHeader title={program.name} description={description} actions={<EditButton href={editHref} />} />
      </div>

      {conflicts.length > 0 ? (
        <Alert>
          <Bandaids weight="fill" />
          <AlertTitle>{t.conflictsTitle(conflicts.length)}</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <p>{conflicts.map((conflict) => `${conflict.dayName} · ${conflict.title} (${conflict.message})`).join(' · ')}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" nativeButton={false} render={<Link href={editHref} />}>
                {t.editProgram}
              </Button>
              <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/dashboard/clients/${id}/constraints`} />}>
                {t.limitations}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {missingRows > 0 ? (
        <Alert>
          <WarningCircle weight="fill" />
          <AlertTitle>{t.missingTitle(missingRows)}</AlertTitle>
          <AlertDescription>{t.missingBody}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t.weekTitle}</CardTitle>
          <CardDescription>{t.weekHint}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {displayDays(phase?.days ?? []).map((day) => {
              const summary = templateSummary({ blocks: day.blocks }, byId);
              const isNext = day.id === upcoming?.dayId;
              return (
                <li key={day.id} className={cn('flex flex-col gap-3 rounded-lg border p-3', isNext && 'bg-primary/5 ring-2 ring-primary-text')}>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium break-words">{day.name}</span>
                      {isNext ? <Badge>{upcoming?.date === today ? t.today : t.next}</Badge> : null}
                    </div>
                    <span className="text-sm text-muted-foreground">{weekdaysText(day.weekdays ?? [], locale) || t.noDays}</span>
                    <span className="text-sm tabular-nums text-muted-foreground">{t.summary(summary.rows, summary.workingSets, summary.minutes)}
                    </span>
                    {day.copiedFrom ? <span className="text-xs text-muted-foreground">{t.copiedFrom(day.copiedFrom.dayName)}</span> : null}
                  </div>
                  <DayPlan blocks={day.blocks} exercises={byId} missing="show" locale={locale} />
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {phase && load ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.loadTitle}</CardTitle>
            <CardDescription>{t.loadHint}</CardDescription>
          </CardHeader>
          <CardContent>
            <PhaseLoad
              cycle={load.cycle}
              weekly={load.weekly}
              factor={load.factor}
              daysPerWeek={phase.daysPerWeek}
              dayCount={phase.days.length}
              assigned={load.assigned}
              label={t.loadLabel}
              done={null}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t.changesTitle}</CardTitle>
          <CardDescription>{t.changesHint}</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangeLog entries={program.log} timeZone={timeZone} initial={20} viewer="pt" />
        </CardContent>
      </Card>
    </div>
  );
}
