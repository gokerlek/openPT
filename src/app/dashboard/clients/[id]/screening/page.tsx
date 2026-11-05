import type { Metadata } from 'next';
import Link from 'next/link';
import { Camera, CaretRight, PersonSimpleTaiChi, WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { CameraHistory } from '@/components/measurements/camera-history';
import { SectionHeader } from '@/components/section-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Locale } from '@/i18n/locale';
import { healthMessages } from '@/i18n/messages/health';
import { screeningMessages } from '@/i18n/messages/screening';
import { getLocale, getMessages } from '@/i18n/server';
import { canRecordHealth } from '@/lib/client-status';
import { readAppConfig } from '@/lib/config';
import { careInputOf, evaluateCare, hasCare } from '@/lib/constraint-filter';
import { constraintsOf, isPaired, regionText } from '@/lib/constraints';
import { listExercises } from '@/lib/exercises';
import { getFormat, todayIn } from '@/lib/format';
import { requirePt } from '@/lib/guards';
import { loadHealthPart } from '@/lib/health';
import type { Client } from '@/lib/schemas/client';
import type { ConstraintForm } from '@/lib/schemas/constraint';
import type { HealthRecord, Screening } from '@/lib/schemas/health';
import {
  cellTitle,
  compareCell,
  constraintSuppress,
  effectiveMissed,
  majorAsymmetry,
  newestFirst,
  outcomeLabels,
  outcomeOf,
  painHistory,
  previousOutcome,
  reachOf,
  SCREENING_PROTOCOL,
  SCREENING_TEST_IDS,
  SCREENING_TESTS,
  screeningHints,
  screeningTest,
  screeningSummary,
  sideEntry,
  sidesOf,
  testName,
  type ScreeningTestId,
  type SideKey,
} from '@/lib/screening';
import { HealthLockAlert, HealthStrip } from '../health-page';
import { MeasurementProblemAlert, measurementClient } from '../measurements/measurement-page';
import { CompareSelect } from './compare-select';
import { PainActions } from './screening-actions';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(screeningMessages)).page.title };
}

/** Ön uzanma: ham cm ve bacak boyu girildiyse yüzdesi ("64 cm (%71,1)"; Plisky 2006). */
function reachText(reach: { cm: number; percent?: number }, locale: Locale): string {
  const format = getFormat(locale);
  return screeningMessages(locale).page.reach(format.number(reach.cm), reach.percent !== undefined ? format.withUnit(reach.percent, '%') : null);
}

/** Hücrenin metni: sözcük; telafide kaçan noktalar; dengede süre ve uzanma (bacak boyuna göre yüzdesiyle). */
function cellText(testId: ScreeningTestId, screening: Screening, side: SideKey, locale: Locale): string {
  const t = screeningMessages(locale).page;
  const format = getFormat(locale);
  const labels = outcomeLabels(locale);
  const entry = sideEntry(screening.tests, testId, side);
  const outcome = outcomeOf(testId, entry);
  if (!entry || !outcome) return '—';
  const parts: string[] = [outcome === 'pain' ? t.painCell(labels.pain) : labels[outcome]];
  if (outcome === 'not_tested' && entry.reason === 'constraint') parts[0] = t.notTestedConstraint;
  if (outcome === 'compensated' || outcome === 'easier') {
    const points = screeningTest(testId, locale).points;
    const missed = effectiveMissed(testId, entry).map((id) => points.find((point) => point.id === id)?.label ?? id);
    if (missed.length > 0) parts.push(t.missedList(missed));
  }
  if (entry.seconds !== undefined) parts.push(t.seconds(format.number(entry.seconds)));
  const reach = side !== 'center' && testId === 'single_leg_balance' ? reachOf(screening.tests, side) : null;
  if (reach) parts.push(reachText(reach, locale));
  const leg = side !== 'center' && testId === 'single_leg_balance' && entry.legCm !== undefined ? entry.legCm : undefined;
  if (leg !== undefined) parts.push(t.leg(format.number(leg)));
  return parts.join(' · ');
}

/** Ön uzanmanın önceki taramaya göre değişimi ("uzanma 61 → 64 cm (%68,5 → %71,9)"); ikisinde de yoksa boş. */
function reachChange(current: Screening, previous: Screening, side: 'left' | 'right', locale: Locale): string {
  const format = getFormat(locale);
  const now = reachOf(current.tests, side);
  const before = previous.protocol === SCREENING_PROTOCOL ? reachOf(previous.tests, side) : null;
  if (!now || !before) return '';
  const percent =
    now.percent !== undefined && before.percent !== undefined ? { before: format.withUnit(before.percent, '%'), after: format.withUnit(now.percent, '%') } : null;
  return screeningMessages(locale).page.reachChange(format.number(before.cm), format.number(now.cm), percent);
}

function changeText(testId: ScreeningTestId, current: Screening, previous: Screening | null, locale: Locale): string {
  if (!previous) return '';
  const t = screeningMessages(locale).page;
  const parts = sidesOf(testId).flatMap((side) => {
    const compared = compareCell(outcomeOf(testId, sideEntry(current.tests, testId, side)), previousOutcome(previous, testId, side));
    const reach = testId === 'single_leg_balance' && side !== 'center' ? reachChange(current, previous, side, locale) : '';
    if (!compared && !reach) return [];
    const text = [compared ? `${t.changes[compared.change]}${compared.significant ? t.significant : ''}` : '', reach].filter(Boolean).join(', ');
    return [side === 'center' ? text : t.sideChange(side, text)];
  });
  return parts.join(' · ');
}

/** "Kısıt olarak ekle"nin kısıtı: testin bölgesi ve tarafı, hareket kısıtı, testin kaçınma önerisi; tanı yok. */
function constraintFromCell(testId: ScreeningTestId, side: SideKey): ConstraintForm {
  const test = SCREENING_TESTS[testId];
  const paired = isPaired(test.constraintRegion);
  return {
    region: test.constraintRegion,
    ...(paired ? { side: side === 'center' ? ('both' as const) : side } : {}),
    type: 'limitation',
    avoid: test.avoid ? [test.avoid] : [],
    note: undefined,
    clientNote: undefined,
  };
}

function weeksAgo(date: string, today: string): number {
  return Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / (7 * 86_400_000));
}

async function Overview({
  client,
  record,
  today,
  query,
  locale,
}: {
  client: Client;
  record: HealthRecord;
  today: string;
  query: { gun?: string; onceki?: string };
  locale: Locale;
}) {
  const messages = screeningMessages(locale);
  const t = messages.page;
  const format = getFormat(locale);
  const outcomes = outcomeLabels(locale);
  const base = `/dashboard/clients/${client.id}/screening`;
  const list = newestFirst(record.screenings ?? []);
  const legacy = record.movementScreens?.length ?? 0;
  const legacyNote = legacy > 0 ? <p className="text-sm text-muted-foreground">{t.legacy(format.number(legacy), legacy)}</p> : null;

  if (list.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PersonSimpleTaiChi weight="fill" />
            </EmptyMedia>
            <EmptyTitle>{t.emptyTitle}</EmptyTitle>
            <EmptyDescription>{t.emptyDescription}</EmptyDescription>
          </EmptyHeader>
        </Empty>
        {legacyNote}
      </div>
    );
  }

  const current = list.find((item) => item.date === query.gun) ?? list[0]!;
  const older = list.filter((item) => item.date < current.date && item.protocol === current.protocol);
  const previous = query.onceki === 'yok' ? null : (older.find((item) => item.date === query.onceki) ?? older[0] ?? null);
  const conditionsConsent = canRecordHealth(client, 'conditions');
  // Kısıtlar yalnız onaylıysa asimetriyi bastırır ve "Kısıt olarak ekle" çıkar.
  const constraints = conditionsConsent ? constraintsOf(record) : [];
  const suppress = constraintSuppress(constraints);
  // Ağrı taramalar boyunca (`painHistory`, §4.4): bu günün ağrıları durumlarıyla; en yeni taramada, sonra test
  // edilmediği için açık kalan eski ağrılar da; bu taramada ağrısız test edilip kapanan eski ağrılar "ağrı geçti".
  const history = painHistory(record.screenings ?? []);
  const newest = current.date === list[0]!.date;
  const pains = [...history.rows.filter((row) => row.date === current.date), ...(newest ? history.open.filter((row) => row.date !== current.date) : [])];
  const gone = history.rows.filter((row) => row.state === 'resolved' && row.laterDate === current.date);
  const asymmetry = majorAsymmetry(current, suppress);
  const exercises = await listExercises();
  const titles = new Map(exercises.map((exercise) => [exercise.id, exercise.title]));
  // Kısıtın izinsiz yasakladığı hareket ipucunda önerilmez (düzenleyici de yaptırmaz; tek bacak hareketinde iki taraf).
  const care = conditionsConsent ? careInputOf(record, { today, painConsent: canRecordHealth(client, 'check_in'), locale }) : null;
  const blocked = new Set(care && hasCare(care) ? exercises.filter((exercise) => evaluateCare(exercise, care).blockedBy.length > 0).map((exercise) => exercise.id) : []);
  const hints = screeningHints(current, (id) => (blocked.has(id) ? undefined : titles.get(id)), suppress, locale);
  const weeks = weeksAgo(list[0]!.date, today);
  const own = exercises.filter((exercise) => exercise.source === 'custom');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">{t.latest(format.day(list[0]!.date), weeks >= 1 ? format.number(weeks) : null, weeks)}</p>
        <CompareSelect dates={list.map((item) => item.date)} current={current.date} previous={previous?.date ?? null} />
      </div>

      {pains.length > 0 || gone.length > 0 || asymmetry ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.warnings}</CardTitle>
            <CardDescription>{t.warningsHint}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {pains.map((cell) => {
              const test = SCREENING_TESTS[cell.testId];
              const draft = constraintFromCell(cell.testId, cell.side);
              const suggestion = t.suggestion(regionText(draft, locale), draft.avoid[0] ? healthMessages(locale).constraints.avoid[draft.avoid[0]] : null);
              const carried = cell.date !== current.date;
              return (
                <div key={`${cell.date}:${cell.key}`} className="flex flex-col gap-2 rounded-lg border p-3">
                  <p>
                    <span className="font-medium">{t.painTitle(cellTitle(cell.testId, cell.side, false, locale))}</span>
                    {carried ? t.painCarried(format.day(cell.date)) : ''}
                    {cell.note ? ` · “${cell.note}”` : ''}
                    {cell.state === 'open' || cell.state === 'reviewed' ? t.painOpen : '.'}
                    {cell.state === 'reviewed' ? <span className="text-muted-foreground">{t.reviewed}</span> : null}
                    {cell.state === 'resolved' && cell.laterDate ? <span className="text-muted-foreground">{t.painResolved(format.day(cell.laterDate))}</span> : null}
                    {cell.state === 'superseded' && cell.laterDate ? (
                      <span className="text-muted-foreground">{t.painSuperseded(format.day(cell.laterDate))}</span>
                    ) : null}
                  </p>
                  {cell.state === 'open' ? (
                    <PainActions
                      clientId={client.id}
                      date={cell.date}
                      cellKey={cell.key}
                      title={cellTitle(cell.testId, cell.side, false, locale)}
                      constraint={conditionsConsent ? draft : null}
                      suggestion={test ? suggestion : null}
                    />
                  ) : null}
                </div>
              );
            })}
            {gone.map((cell) => (
              <p key={`gone:${cell.date}:${cell.key}`}>
                <span className="font-medium">{t.goneTitle(cellTitle(cell.testId, cell.side, false, locale))}</span>
                {t.gone(format.day(cell.date))}
              </p>
            ))}
            {asymmetry ? (
              <p>
                <span className="font-medium">{t.asymmetryTitle(testName(asymmetry.testId, locale))}</span>
                {t.asymmetry(
                  outcomes[asymmetry.left],
                  outcomes[asymmetry.right],
                  asymmetry.reachDiff !== undefined ? format.number(asymmetry.reachDiff) : null,
                  asymmetry.reachPercentDiff !== undefined ? format.withUnit(asymmetry.reachPercentDiff, '%') : null,
                )}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{format.day(current.date)}</CardTitle>
          <CardDescription>
            {t.protocol(current.protocol)}
            {current.note ? ` · ${current.note}` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {/* Masaüstünde tablo, telefonda test başına kart. */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.test}</TableHead>
                  <TableHead>{messages.sides.left}</TableHead>
                  <TableHead>{messages.sides.right}</TableHead>
                  <TableHead>{previous ? t.comparedTo(format.day(previous.date)) : t.change}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {SCREENING_TEST_IDS.map((testId) => (
                  <TableRow key={testId}>
                    <TableCell className="font-medium">{testName(testId, locale)}</TableCell>
                    {SCREENING_TESTS[testId].sided ? (
                      <>
                        <TableCell className="whitespace-normal">{cellText(testId, current, 'left', locale)}</TableCell>
                        <TableCell className="whitespace-normal">{cellText(testId, current, 'right', locale)}</TableCell>
                      </>
                    ) : (
                      <TableCell colSpan={2} className="whitespace-normal">
                        {cellText(testId, current, 'center', locale)}
                      </TableCell>
                    )}
                    <TableCell className="text-muted-foreground">{changeText(testId, current, previous, locale)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul className="flex flex-col gap-2 md:hidden">
            {SCREENING_TEST_IDS.map((testId) => (
              <li key={testId} className="rounded-lg border p-3 text-sm">
                <p className="font-medium">{testName(testId, locale)}</p>
                {sidesOf(testId).map((side) => (
                  <p key={side}>
                    {side === 'center' ? '' : t.sideLine(messages.sides[side])}
                    {cellText(testId, current, side, locale)}
                  </p>
                ))}
                {previous ? <p className="text-muted-foreground">{changeText(testId, current, previous, locale)}</p> : null}
              </li>
            ))}
          </ul>
          {previous ? <p className="text-xs text-muted-foreground">{t.stepNote}</p> : null}
        </CardContent>
      </Card>

      {hints.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.hintsTitle}</CardTitle>
            <CardDescription>{t.hintsHint}</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
              {hints.map((hint) => {
                const mine = own.filter((exercise) => exercise.pattern && SCREENING_TESTS[hint.testId].patterns.includes(exercise.pattern));
                return (
                  <li key={hint.key}>
                    {hint.text}
                    {mine.length > 0 && hint.outcome !== 'pain' ? (
                      <span className="text-muted-foreground">{t.sameFamily(mine.map((exercise) => exercise.title).join(', '))}</span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>
      ) : null}

      <section aria-labelledby="days-heading" className="flex flex-col gap-3">
        <h4 id="days-heading" className="font-heading text-base font-medium">
          {t.days}
        </h4>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((item) => {
            const summary = screeningSummary(item);
            return (
              <li key={item.date}>
                <Link href={`${base}/${item.date}/edit`} className="flex min-h-11 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted">
                  <span>
                    <span className="font-medium">{format.day(item.date)}</span>
                    {t.daySummary(format.number(summary.tests), summary.tests, summary.pain > 0 ? format.number(summary.pain) : null)}
                  </span>
                  <CaretRight className="size-4 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
        {legacyNote}
      </section>
    </div>
  );
}

/**
 * Sağlık'ın Hareket parçası (`screening` onayı): kamera ölçümü ve PT'nin hareket testi bir arada. Üstte iki eylem
 * kartı (kamerayla ölçüm: `measurements/camera` sihirbazı; hareket testi: `screening/new`), sonra kamera ölçüm
 * geçmişi ve hareket testi sonuçları (tasarım `kisit-tarama.md` §4.5): son test ve karşılaştırma, uyarılar (ağrı;
 * tek büyük asimetri), test başına sözcükle sonuç, PT'ye ipuçları, test günleri. Toplam ve puan yok. Onay yoksa
 * dosya okunmaz ve eylem yok.
 */
export default async function ScreeningPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ gun?: string; onceki?: string }>;
}) {
  await requirePt();
  const { id } = await params;
  const locale = await getLocale();
  const t = screeningMessages(locale).page;
  const loaded = await measurementClient(id);
  if (!loaded.ok) {
    return (
      <div className="flex flex-col gap-6">
        <SectionHeader title={t.title} />
        <MeasurementProblemAlert title={t.clientUnreadable} problem={loaded.problem} />
      </div>
    );
  }
  const { client } = loaded;
  const [view, config] = await Promise.all([loadHealthPart(client, 'screening', locale), readAppConfig()]);

  return (
    <div className="flex flex-col gap-6">
      <HealthStrip client={client} record={view.state === 'ok' ? view.record : null} />
      <SectionHeader
        title={t.title}
        description={t.description}
      />
      {view.state === 'locked' ? <HealthLockAlert field="screening" lock={view.lock} clientId={id} /> : null}
      {view.state === 'broken' ? (
        <Alert variant="destructive">
          <WarningCircle weight="fill" />
          <AlertTitle>{t.recordUnreadable}</AlertTitle>
          <AlertDescription>
            {view.problem} {t.brokenDetail}
          </AlertDescription>
        </Alert>
      ) : null}
      {view.state === 'ok' ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label={t.newRecord}>
            <Button
              nativeButton={false}
              render={<Link href={`/dashboard/clients/${id}/measurements/camera`} />}
              className="h-auto min-h-24 w-full justify-start gap-4 rounded-xl px-5 py-4 text-left whitespace-normal">
              <Camera aria-hidden className="size-8" />
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-lg font-semibold">{t.camera}</span>
                <span className="text-sm font-normal">{t.cameraHint}</span>
              </span>
            </Button>
            <Button
              variant="secondary"
              nativeButton={false}
              render={<Link href={`/dashboard/clients/${id}/screening/new`} />}
              className="h-auto min-h-24 w-full justify-start gap-4 rounded-xl border-border px-5 py-4 text-left whitespace-normal">
              <PersonSimpleTaiChi aria-hidden weight="fill" className="size-8" />
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-lg font-semibold">{t.screen}</span>
                <span className="text-sm font-normal">{t.screenHint}</span>
              </span>
            </Button>
          </div>
          <CameraHistory clientId={id} timeZone={config.timeZone} records={view.record.cameraMeasurements ?? []} />
          <section aria-labelledby="screening-results-heading" className="flex flex-col gap-4">
            <div>
              <h3 id="screening-results-heading" className="font-heading text-lg font-semibold">
                {t.resultsTitle}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">{t.resultsHint}</p>
            </div>
            <Overview client={client} record={view.record} today={todayIn(config.timeZone)} query={await searchParams} locale={locale} />
          </section>
        </>
      ) : null}
    </div>
  );
}
