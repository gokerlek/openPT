import Link from 'next/link';
import { Bandaids, Barbell, CaretRight, Play } from '@phosphor-icons/react/dist/ssr';
import { Plus } from '@/components/line-icons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item';
import type { Locale } from '@/i18n/locale';
import { clientHomeMessages } from '@/i18n/messages/client-home';
import { getLocale } from '@/i18n/server';
import { lower } from '@/i18n/text';
import type { TodayCare } from '@/lib/client-care';
import { withClientTargets } from '@/lib/client-targets';
import { careLine, evaluateCare, hasCare, rowCareOf, type CareInput } from '@/lib/constraint-filter';
import type { CareTags } from '@/lib/constraints';
import { hasAssignments, weekAssignments } from '@/lib/day-assignments';
import { listExercises } from '@/lib/exercises';
import { getFormat, todayIn } from '@/lib/format';
import { activeItem, shownProgram } from '@/lib/own-program-index';
import { lastDateByProgram, ptUpdatedSince } from '@/lib/own-program-text';
import { ptProgramName } from '@/lib/own-programs';
import { readOwnOverview, readOwnProgramOf } from '@/lib/own-programs-store';
import { displayDays, currentPhaseOf, frequencyLabel, phaseStatus } from '@/lib/program-plan';
import { previewBlocks, rowLabels, templateSummary, type TemplateBlock } from '@/lib/template-plan';
import { isoWeekdayOf, phaseFrequency, todayAssigned, weekdayLabels, type Weekday } from '@/lib/training-days';
import { lastDoneDates, programStamp, type PlanOwner, type PlanProgram } from '@/lib/workout-plan';
import { ClientDayPlan } from './client-day-plan';
import { NewPtProgramBanner, ProgramChip, PtEditLine, type ProgramChoice } from './program-choice';
import { WeekBadge } from './today-workout';
import { OtherProgramButton, WeekStrip, WorkoutFreshness } from './training-week';

const NO_CARE: TodayCare = { stamp: '', input: null };

/** Bugün kartında görünen kısıt satırı sayısı; fazlası "+n harekette daha not var". */
const CARE_LINES = 2;

/**
 * Programın kısıt notları (`kisit-tarama.md` §3.5, antrenmandaki kart notuyla aynı kural: `rowCareOf`): notlu satırlar
 * (önizlemedeki yara bandı) ve hareket başına bir satır ("Sol diz için dikkat: Back Squat"), "değiştir" diyenler önce.
 */
function dayCare(
  blocks: readonly TemplateBlock[],
  exercises: ReadonlyMap<string, CareTags & { id: string; title: string }>,
  input: CareInput | null,
  own: boolean,
  locale: Locale,
): { rows: Set<string>; lines: { id: string; text: string }[] } {
  const rows = new Set<string>();
  const lines: { id: string; text: string; avoid: boolean }[] = [];
  if (!input || !hasCare(input)) return { rows, lines };
  const seen = new Set<string>();
  for (const block of blocks) {
    for (const row of block.rows) {
      const exercise = exercises.get(row.exerciseId);
      const rowCare = exercise ? rowCareOf(evaluateCare(exercise, input), input) : null;
      if (!exercise || !rowCare) continue;
      rows.add(row.id);
      if (seen.has(exercise.id)) continue;
      seen.add(exercise.id);
      lines.push({ id: exercise.id, text: careLine(own ? { ...rowCare, own: true } : rowCare, exercise.title, locale), avoid: rowCare.kind === 'avoid' });
    }
  }
  // `sort` kararlı: aynı türde programın sırası korunur.
  lines.sort((a, b) => Number(b.avoid) - Number(a.avoid));
  return { rows, lines: lines.map(({ id, text }) => ({ id, text })) };
}

function Unavailable({ children, top, locale }: { children?: React.ReactNode; top?: React.ReactNode; locale: Locale }) {
  const t = clientHomeMessages(locale).card;
  return (
    <>
      {top}
      <Card>
        <CardHeader>
          <CardTitle>{t.todaysWorkout}</CardTitle>
          <CardDescription>{t.unavailable}</CardDescription>
        </CardHeader>
      </Card>
      {children}
    </>
  );
}

/**
 * Danışanın bugünkü antrenmanı (Faz 3: güne atanmış programlar, Karar 7): gösterilen programın (evreliyse şu anki
 * evrenin) bugüne atanmış programı. Bu yalnız kolaylıktır; danışan her gün istediği programı yapar. İki hâl:
 *
 * **Atanmış gün** (`todayAssigned`). Yukarıdan aşağı:
 * - başlık: bugünün adı ve program ("Salı · Alt vücut"), sağ üstte "Bu hafta x/y" (`WeekBadge`, istemcide); bugün
 *   antrenman bittiyse üstünde "Bugünkü antrenmanını yaptın";
 * - tek satır "N hareket · ≈ N dk" (evreli programda üstünde evre satırı, sıklık `phaseFrequency`);
 * - "Antrenmana başla" (`?day=<id>`) ve altında "Değiştir" (başka antrenman, `OtherProgramButton`) kaydırmadan
 *   görünür (Faz 0: 375×812'de düğmenin alt kenarı 700 px'ten yukarıda; başlık kısa tutulur). "Antrenmana başla" tek
 *   dokunuştur: Bugün'ün varsayılan yanıtı bugünün programını telefona alır (çevrimdışı da açılır), ağ beklenmez;
 *   telefondaki plan programın bu sürümüne (ya da kısıtların bu hâline) ait değilse atılır (`WorkoutFreshness`);
 * - kısıt notları (en çok 2, "Sol diz için dikkat: Back Squat", `careLine`; fazlası "+n harekette daha not var");
 * - programın ilk 3 hareketini dolduran bloklar (`previewBlocks`, grup bölünmez; kısıtlı satırda yara bandı), kalanı
 *   "Tümünü gör (n hareket daha)" altında; numaralar bütün programdan;
 * - hafta şeridi (`WeekStrip`).
 *
 * **Atanmamış gün**: başlık "Bugün atanmış program yok" (evrede hiç atama yoksa "Bugün hangi programı
 * yapacaksın?"), "Yapmak istediğin programı seç." ve programların listesi (ad, "N hareket · ≈ N dk · son: 21 Eki",
 * [Başla]); öneri yok (kullanıcı kararı 3). Kısıt notu ve önizleme bu hâlde yok: antrenman ekranı gösterir. Altında
 * şerit. Çevrimdışı (kabul edilen gerileme, Karar 7): Bugün'ün varsayılan yanıtı yalnız bir programın planını telefona
 * alır (atanmamış günde haftada sıradaki atanmış program); önbellekte olmayan programın [Başla]'sı ağ ister,
 * çevrimdışı antrenman ekranı "Bağlantı yok…" / "Antrenman açılamadı." der. Bütün planlar önceden çekilmez
 * (GitHub'daki depolamaya yük olurdu).
 *
 * Evrede atama varsa ana kartın ve `children`'ın (Bugün'ün su kartı) altında "Haftanın programı": hafta günü →
 * program, bugünün satırında "bugün", atanmamış programlar sonda tek satırda. `clientId` oturumdan doğrulanmış kayıttan
 * gelir (`currentClient`). `care` sayfanın bir kez okuduğu kısıtlar (`loadTodayCare`).
 *
 * Kendi programlar (`docs/design/kendi-program.md` §2.6): gösterilen program adresteki (`programParam`, "Yalnız
 * bugün") ya da kalıcı seçim (`shownProgram`, sunucunun `planSource`'uyla aynı kural); en az bir kendi program
 * varken kartın başında program çipi. Kalıcı seçim kendi programken PT'nin programı o arada kaydedildiyse
 * "Antrenörün yeni bir program hazırladı"; PT paylaşılmış Bugün programını düzenlediyse satırı. Hiç program yoksa
 * boş kartın altında [Kendi programını kur].
 */
export async function ProgramCard({
  clientId,
  programParam = null,
  timeZone,
  care = NO_CARE,
  children,
}: {
  clientId: string;
  programParam?: string | null;
  timeZone: string;
  care?: TodayCare;
  children?: React.ReactNode;
}) {
  const [overview, exercises, locale] = await Promise.all([readOwnOverview(clientId).catch(() => null), listExercises(), getLocale()]);
  const t = clientHomeMessages(locale).card;
  const f = getFormat(locale);
  const weekdayNames = weekdayLabels(locale);
  if (!overview) return <Unavailable locale={locale}>{children}</Unavailable>;

  const { state, pt, sessions } = overview;
  const index = state.index;
  const choice = shownProgram(index, state.unreadable, programParam);
  const ptProgram = pt?.program ?? null;
  let program: PlanProgram | null = ptProgram;
  let owner: PlanOwner = null;
  let problem = 'broken' in choice && choice.broken ? t.chosenUnavailable(choice.broken.name ?? null) : null;
  if (choice.shown) {
    const cached = state.programs.get(choice.shown);
    const read = cached ? { status: 'ok' as const, program: cached } : await readOwnProgramOf(clientId, choice.shown);
    if (read.status === 'ok') {
      program = read.program;
      owner = { programId: choice.shown, name: read.program.name };
    } else {
      problem = t.yoursUnavailable(index.items.find((item) => item.id === choice.shown)?.name ?? null);
    }
  }

  // Program seçimi (§2.6): yalnız en az bir kendi program varken.
  const last = lastDateByProgram(sessions);
  const choices: ProgramChoice[] = [
    ...(ptProgram ? [{ id: null, name: ptProgramName(locale), ...(last.get('pt') ? { lastDate: last.get('pt') } : {}) }] : []),
    ...index.items.map((item) => ({ id: item.id, name: item.name, ...(last.get(item.id) ? { lastDate: last.get(item.id) } : {}) })),
  ];
  const shown = owner?.programId ?? null;
  // Seçilen kendi program okunamadıysa PT'nin programı gösterilir ama bu tek seferlik seçim sayılmaz.
  const oneOff = choice.oneOff && (choice.shown === null || owner !== null);
  const chip =
    index.items.length > 0 ? <ProgramChip clientId={clientId} choices={choices} active={activeItem(index)?.id ?? null} shown={shown} oneOff={oneOff} /> : null;
  const edited = activeItem(index);
  const top = (
    <>
      {ptProgram && ptUpdatedSince(ptProgram, index.active) ? <NewPtProgramBanner clientId={clientId} version={ptProgram.updatedAt} /> : null}
      {edited?.ptEditedAt ? (
        <PtEditLine
          clientId={clientId}
          programId={edited.id}
          name={edited.name}
          editedAt={edited.ptEditedAt}
          dateText={f.dayShort(todayIn(timeZone, new Date(edited.ptEditedAt)))}
        />
      ) : null}
      {problem ? (
        <Alert>
          <AlertDescription>
            {problem} {t.showingPt}
          </AlertDescription>
        </Alert>
      ) : null}
    </>
  );

  if (!owner && pt === null) {
    return (
      <>
        {top}
        <Card>
          <CardHeader>
            <CardTitle>{t.todaysWorkout}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {chip}
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Barbell weight="fill" />
                </EmptyMedia>
                <EmptyTitle>{t.noProgram}</EmptyTitle>
                <EmptyDescription>{t.noProgramText}</EmptyDescription>
              </EmptyHeader>
              {index.items.length === 0 ? (
                <EmptyContent>
                  <Button variant="outline" className="h-11" nativeButton={false} render={<Link href="/me/programlar/yeni" />}>
                    <Plus data-icon="inline-start" />
                    {t.setUpOwn}
                  </Button>
                </EmptyContent>
              ) : null}
            </Empty>
          </CardContent>
        </Card>
        {children}
      </>
    );
  }
  if (!program) return <Unavailable top={top} locale={locale}>{children}</Unavailable>;

  const phase = currentPhaseOf(program)?.phase;
  if (!phase || phase.days.length === 0) return <Unavailable top={top} locale={locale}>{children}</Unavailable>;
  const plan = program;
  type Day = (typeof phase.days)[number];

  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  // Danışanın kendi tekrar hedefleri (bitişte "Evet, güncelle", tasarım §6.2) programın satırlarında; kendi programda yok.
  const blocksOf = (day: Day) => (owner ? day.blocks : withClientTargets(day.blocks, plan.clientTargets));
  const summaryOf = (day: Day) => templateSummary({ blocks: blocksOf(day) }, byId);
  const phased = !owner && ptProgram?.phased === true;
  // Evreli programda evre satırı; ötekinde başlığın altında yalnız "N hareket · ≈ N dk". Sıklık atanmış gün sayısı,
  // atamasız evrede `daysPerWeek` (`phaseFrequency`).
  const status = phaseStatus(plan, new Date());
  const context = phased
    ? [
        phase.name,
        phase.weeks !== undefined ? t.phaseWeek(Math.min(status.week, phase.weeks), phase.weeks) : null,
        lower(locale, frequencyLabel(phaseFrequency(phase), locale) ?? '') || null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;
  // Bugün uygulamanın saat diliminde; "yapıldı" bugün biten bir antrenman (hangi program olursa olsun).
  const today = todayIn(timeZone);
  const todayDay = todayAssigned(phase.days, today);
  const anyAssigned = hasAssignments(phase.days);
  const doneToday = sessions.items.some((row) => Boolean(row.finishedAt) && row.date === today);
  const note = doneToday ? t.doneToday : null;
  // Her başlangıç açık günle (`?day=`); tek seferlik seçimde antrenman o programla açılır.
  const programQuery = oneOff ? `&program=${encodeURIComponent(shown ?? 'pt')}` : '';
  const startHref = (dayId: string) => `/me/antrenman?day=${encodeURIComponent(dayId)}${programQuery}`;
  const freshness = <WorkoutFreshness clientId={clientId} stamp={programStamp(plan, owner?.programId ?? null) + care.stamp} />;

  // Haftanın programı (evrede atama varken): hafta günü → program; atanmamışlar sonda tek satırda.
  const week = anyAssigned ? weekAssignments(phase.days) : [];
  const unassigned = anyAssigned ? phase.days.filter((day) => !week.some((row) => row.day.id === day.id)) : [];
  const weekCard = anyAssigned ? (
    <Card>
      <CardHeader>
        <CardTitle>{t.weekProgram}</CardTitle>
        {phased ? <CardDescription>{phase.name}</CardDescription> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <ul className="flex flex-col gap-2">
          {week.map(({ weekday, day }) => {
            const itemSummary = summaryOf(day);
            const isToday = weekday === isoWeekdayOf(today);
            return (
              <li key={weekday}>
                <Item variant="outline">
                  <ItemContent className="min-w-0">
                    <ItemTitle className="w-full break-words">
                      {weekdayNames[weekday as Weekday]} · {day.name}
                    </ItemTitle>
                    <ItemDescription className="tabular-nums">{t.summary(itemSummary.rows, itemSummary.minutes)}</ItemDescription>
                  </ItemContent>
                  {isToday ? (
                    <ItemActions>
                      <Badge variant="secondary">{t.today}</Badge>
                    </ItemActions>
                  ) : null}
                </Item>
              </li>
            );
          })}
        </ul>
        {unassigned.length > 0 ? (
          <p className="text-sm break-words text-muted-foreground">{t.unassigned(unassigned.map((day) => day.name).join(', '))}</p>
        ) : null}
      </CardContent>
    </Card>
  ) : null;

  if (!todayDay) {
    // Atanmamış gün: programların listesi, öneri yok. Son yapıldığı gün yalnız bilgi.
    const lastByDay = lastDoneDates(sessions);
    return (
      <>
        {top}
        {freshness}
        <Card>
          <CardHeader>
            {chip ? <div className="col-span-full flex min-w-0 pb-1">{chip}</div> : null}
            {note ? <CardDescription>{note}</CardDescription> : null}
            <CardAction>
              <WeekBadge clientId={clientId} />
            </CardAction>
            <CardTitle className="text-xl">{anyAssigned ? t.nothingToday : t.whichToday}</CardTitle>
            <CardDescription>
              {context ? <span className="block">{context}</span> : null}
              {t.pick}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ul className="flex flex-col gap-2" aria-label={t.programs}>
              {displayDays(phase.days).map((day) => {
                const itemSummary = summaryOf(day);
                const lastDate = lastByDay[day.id];
                return (
                  <li key={day.id}>
                    <Item variant="outline">
                      <ItemContent className="min-w-0">
                        <ItemTitle className="w-full break-words">{day.name}</ItemTitle>
                        <ItemDescription className="tabular-nums">
                          {itemSummary.rows > 0
                            ? `${t.summary(itemSummary.rows, itemSummary.minutes)} · ${lastDate ? t.last(f.dayShort(lastDate)) : t.notYet}`
                            : t.rowsUnavailable}
                        </ItemDescription>
                      </ItemContent>
                      {itemSummary.rows > 0 ? (
                        <ItemActions>
                          <Button className="h-11" nativeButton={false} aria-label={t.startNamed(day.name)} render={<Link href={startHref(day.id)} />}>
                            {t.start}
                          </Button>
                        </ItemActions>
                      ) : null}
                    </Item>
                  </li>
                );
              })}
            </ul>
            <WeekStrip clientId={clientId} />
          </CardContent>
        </Card>
        {children}
        {weekCard}
      </>
    );
  }

  const blocks = blocksOf(todayDay);
  const summary = templateSummary({ blocks }, byId);
  const title = `${weekdayNames[isoWeekdayOf(today)]} · ${todayDay.name}`;
  // Önizleme: kütüphanede olmayan satırlar önce ayıklanır (çizilmiyorlar; yoksa "ilk 3" üçten az görünür).
  const labels = rowLabels({ blocks });
  const shownBlocks = blocks.flatMap((block) => {
    const rows = block.rows.filter((row) => byId.has(row.exerciseId));
    return rows.length > 0 ? [{ ...block, rows }] : [];
  });
  const preview = previewBlocks(shownBlocks, 3);
  const cares = dayCare(shownBlocks, byId, care.input, owner !== null, locale);

  return (
    <>
      {top}
      {/* Kısıtlar değişince (ya da onay çekilince) telefondaki plan da eskir: kart notu yenilenir. */}
      {freshness}
      <Card>
        <CardHeader>
          {chip ? <div className="col-span-full flex min-w-0 pb-1">{chip}</div> : null}
          {note ? <CardDescription>{note}</CardDescription> : null}
          <CardAction>
            <WeekBadge clientId={clientId} />
          </CardAction>
          <CardTitle className="text-xl">{title}</CardTitle>
          <CardDescription>
            {context ? <span className="block">{context}</span> : null}
            <span className="tabular-nums">{summary.rows}</span> {t.exercisesUnit(summary.rows)} · ≈ <span className="tabular-nums">{summary.minutes}</span>{' '}
            {t.minutesUnit}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {summary.rows > 0 ? (
            <div className="flex flex-col gap-2">
              <Button size="lg" className="h-12 w-full" nativeButton={false} render={<Link href={startHref(todayDay.id)} />}>
                <Play data-icon="inline-start" weight="fill" />
                {t.startWorkout}
              </Button>
              <OtherProgramButton clientId={clientId} />
            </div>
          ) : (
            // Bugünün programı açılamıyorsa da başka bir program seçilebilir; sheet açılabilen ilk programla başlar.
            <OtherProgramButton clientId={clientId} initial={phase.days.find((day) => day.id !== todayDay.id && summaryOf(day).rows > 0)?.id ?? null} />
          )}
          {cares.lines.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {cares.lines.slice(0, CARE_LINES).map((line) => (
                <li key={line.id} className="flex items-start gap-2">
                  <Bandaids weight="fill" aria-hidden className="mt-0.5 size-4 shrink-0 text-primary-text" />
                  <span className="min-w-0">{line.text}</span>
                </li>
              ))}
              {cares.lines.length > CARE_LINES ? (
                <li className="pl-6 text-muted-foreground tabular-nums">{t.moreNotes(cares.lines.length - CARE_LINES)}</li>
              ) : null}
            </ul>
          ) : null}
          {summary.rows > 0 ? (
            <div className="flex flex-col gap-2">
              <ClientDayPlan blocks={preview.head} exercises={byId} labels={labels} cared={cares.rows} />
              {preview.rest.length > 0 ? (
                <details className="group/rest">
                  <summary className="-mx-3 flex min-h-11 w-fit cursor-pointer list-none items-center gap-1.5 rounded-lg px-3 font-medium text-muted-foreground outline-none select-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                    <CaretRight
                      aria-hidden
                      weight="bold"
                      className="size-3.5 shrink-0 motion-safe:transition-transform motion-safe:duration-160 group-open/rest:rotate-90"
                    />
                    {/* Tek kutu: flex'te metin parçaları ayrı öğe olur, `gap` parantezin içine boşluk koyardı. */}
                    <span className="tabular-nums">{t.showAll(preview.restRows)}</span>
                  </summary>
                  <div className="pt-2">
                    <ClientDayPlan blocks={preview.rest} exercises={byId} labels={labels} cared={cares.rows} />
                  </div>
                </details>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t.rowsUnavailableTell}</p>
          )}
          <WeekStrip clientId={clientId} />
        </CardContent>
      </Card>
      {children}
      {weekCard}
    </>
  );
}
