import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Barbell, ClockCounterClockwise } from '@phosphor-icons/react/dist/ssr';
import { SectionHeader } from '@/components/section-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ptClientsMessages } from '@/i18n/messages/pt-clients';
import { getLocale } from '@/i18n/server';
import type { Locale } from '@/i18n/locale';
import { loadClient } from '@/lib/clients';
import { bodyMassOn } from '@/lib/cardio';
import { canRecordHealth } from '@/lib/client-status';
import { readAppConfig } from '@/lib/config';
import { listExercises } from '@/lib/exercises';
import { getFormat } from '@/lib/format';
import { requirePt } from '@/lib/guards';
import { readHealth } from '@/lib/health';
import { loadDetail } from '@/lib/history-store';
import { readLiveResponse } from '@/lib/live-store';
import { painSkippedRows, ptChangeLines, ptSessionDetail, type PtDetailExercise } from '@/lib/pt-sessions';
import { CLIENT_ID_PATTERN } from '@/lib/schemas/client';
import type { Program } from '@/lib/schemas/program';
import { cn } from '@/lib/utils';
import { LiveSession } from '../../live-session';

export async function generateMetadata(): Promise<Metadata> {
  return { title: ptClientsMessages(await getLocale()).sessions.detail.metaTitle };
}

/** Programdaki satırın hareketinin kütüphanedeki adı (muadilin yerini aldığı hareket). */
function rowTitleOf(program: Pick<Program, 'phases'> | null, titles: ReadonlyMap<string, string>) {
  const rows = new Map(
    (program?.phases ?? []).flatMap((phase) => phase.days.flatMap((day) => day.blocks.flatMap((block) => block.rows.map((row) => [row.id, row.exerciseId] as const)))),
  );
  return (rowId: string) => {
    const exerciseId = rows.get(rowId);
    return exerciseId ? (titles.get(exerciseId) ?? null) : null;
  };
}

/**
 * Danışanın bir antrenmanı (SPEC §6, tasarım §8 satır 12) — yalnız okuma. Hareketler yapılış sırasıyla: setler
 * zorluklarıyla, ısınma ayrı satırda, plandan fazla ve aşırı yük setleri işaretli; geçilen hareketin nedeni,
 * muadil (hangi hareketin yerine), plan dışı eklenen, o günkü plan, ayar notu; bu antrenmanın program
 * değişiklikleri (programa yazılan, onay bekleyen, karara bağlanan). Ağrı ayrıntısı yalnız danışanın onayı
 * sürdükçe (`health.json`). Sürüyorsa canlı satır; silinmişse yalnız bunu söyler.
 */
export default async function SessionDetailPage({ params }: { params: Promise<{ id: string; sessionId: string }> }) {
  await requirePt();
  const { id, sessionId } = await params;
  if (!CLIENT_ID_PATTERN.test(id)) notFound();
  const loaded = await loadClient(id);
  if (!loaded) notFound();
  if (!loaded.ok) redirect(`/dashboard/clients/${id}`);
  const { client } = loaded;
  const locale = await getLocale();
  const t = ptClientsMessages(locale).sessions;
  const format = getFormat(locale);
  const back = { href: `/dashboard/clients/${id}/sessions`, label: t.title };

  const [config, detail] = await Promise.all([readAppConfig(), loadDetail(id, sessionId, locale).catch(() => null)]);

  if (detail === null) {
    return (
      <div className="flex flex-col gap-6">
        <SectionHeader title={t.detail.metaTitle} back={back} />
        <Card>
          <CardHeader>
            <CardTitle>{t.detail.unavailableTitle}</CardTitle>
            <CardDescription>{t.unreadableBody}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (detail.status === 'active') {
    return (
      <div className="flex flex-col gap-6">
        <SectionHeader title={t.detail.activeTitle} description={t.detail.activeBody} back={back} />
        <LiveSession clientId={id} initial={await readLiveResponse(id)} />
      </div>
    );
  }

  if (detail.status !== 'ok') {
    const deleted = detail.status === 'deleted';
    return (
      <div className="flex flex-col gap-6">
        <SectionHeader title={t.detail.metaTitle} back={back} />
        <Card>
          <CardContent>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ClockCounterClockwise weight="fill" />
                </EmptyMedia>
                <EmptyTitle>{deleted ? t.detail.deletedTitle : t.detail.missingTitle}</EmptyTitle>
                <EmptyDescription>{deleted ? t.detail.deletedBody : t.detail.missingBody}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { doc, changes, program } = detail.value;
  const [exercises, health] = await Promise.all([
    listExercises(),
    // Ağrı ayrıntısı ve kardiyo kalorisinin kilosu yalnız kendi onayı sürdükçe; okunamazsa yazılmaz.
    canRecordHealth(client, 'check_in') || canRecordHealth(client, 'measurements') ? readHealth(id).catch(() => null) : Promise.resolve(null),
  ]);
  const titles = new Map(exercises.map((exercise) => [exercise.id, exercise.title]));
  const view = ptSessionDetail(doc, {
    timeZone: config.timeZone,
    rowTitle: rowTitleOf(program, titles),
    painRows: health && canRecordHealth(client, 'check_in') ? painSkippedRows(health.record.checkIns, doc.id) : new Set(),
    bodyMassKg: health && canRecordHealth(client, 'measurements') ? bodyMassOn(health.record.measurements, doc.date) : undefined,
    locale,
  });
  const lines = ptChangeLines(changes, locale);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title={view.title}
        description={
          <span className="tabular-nums">
            {view.meta} · {t.detail.water(view.water, format.number(view.water))}
          </span>
        }
        back={back}
      />

      {view.flags.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={t.detail.flagsLabel}>
          {view.flags.map((flag) => (
            <li key={flag}>
              <Badge variant="outline">{flag}</Badge>
            </li>
          ))}
        </ul>
      ) : null}

      {view.exercises.length === 0 ? (
        <Card>
          <CardContent>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Barbell weight="fill" />
                </EmptyMedia>
                <EmptyTitle>{t.detail.noSetsTitle}</EmptyTitle>
                <EmptyDescription>{t.detail.noSetsBody}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2 lg:items-start" aria-label={t.detail.exercisesLabel}>
          {view.exercises.map((exercise) => (
            <li key={exercise.entryId}>
              <SessionExercise exercise={exercise} locale={locale} />
            </li>
          ))}
        </ul>
      )}

      {lines.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.detail.changesTitle}</CardTitle>
            <CardDescription>{t.detail.changesBody}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3">
              {lines.map((line, position) => (
                <li key={`${line.text}-${position}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
                  <span className="min-w-0">
                    {line.text}
                    {line.note ? <span className="text-muted-foreground"> · “{line.note}”</span> : null}
                  </span>
                  <Badge variant="secondary">{line.label}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function SessionExercise({ exercise, locale }: { exercise: PtDetailExercise; locale: Locale }) {
  const t = ptClientsMessages(locale).sessions.detail;
  const description = [exercise.note, ...exercise.notes].join(' · ');
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{exercise.title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        {exercise.setupNote ? <CardDescription>
            {t.setupNote}
            {exercise.setupNote}
          </CardDescription> : null}
      </CardHeader>
      {exercise.sets.length > 0 ? (
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">{t.set}</TableHead>
                <TableHead>{t.done}</TableHead>
                <TableHead className="text-right">{t.effort}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {exercise.sets.map((set) => (
                <TableRow key={set.id} className={cn(set.warmup && 'text-muted-foreground')}>
                  <TableCell>{set.label}</TableCell>
                  <TableCell className="tabular-nums">
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      {set.text}
                      {set.extra ? <Badge variant="outline">{t.extra}</Badge> : null}
                      {set.overload ? <Badge variant="destructive">{t.overload}</Badge> : null}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">{set.effort ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      ) : null}
    </Card>
  );
}
