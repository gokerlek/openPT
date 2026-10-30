import Link from 'next/link';
import { Bandaids, Barbell, CaretRight, Play } from '@phosphor-icons/react/dist/ssr';
import { Plus } from '@/components/line-icons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item';
import type { TodayCare } from '@/lib/client-care';
import { withClientTargets } from '@/lib/client-targets';
import { careLine, evaluateCare, hasCare, rowCareOf, type CareInput } from '@/lib/constraint-filter';
import type { CareTags } from '@/lib/constraints';
import { listExercises } from '@/lib/exercises';
import { formatDayShort, todayIn } from '@/lib/format';
import { activeItem, shownProgram } from '@/lib/own-program-index';
import { lastDateByProgram, ptUpdatedSince } from '@/lib/own-program-text';
import { PT_PROGRAM_NAME } from '@/lib/own-programs';
import { readOwnOverview, readOwnProgramOf } from '@/lib/own-programs-store';
import { currentPhaseOf, frequencyLabel, nextDayId, phaseStatus } from '@/lib/program-plan';
import { previewBlocks, rowLabels, templateSummary, type TemplateBlock } from '@/lib/template-plan';
import { effectiveSchedule, todayCardTitle, todayState } from '@/lib/training-days';
import { programStamp, type PlanOwner, type PlanProgram } from '@/lib/workout-plan';
import { ClientDayPlan } from './client-day-plan';
import { NewPtProgramBanner, ProgramChip, PtEditLine, type ProgramChoice } from './program-choice';
import { WeekBadge } from './today-workout';
import { OtherDayButton, WeekStrip, WorkoutFreshness } from './training-week';

const NO_CARE: TodayCare = { stamp: '', input: null };

/** Bugün kartında görünen kısıt satırı sayısı; fazlası "+n harekette daha not var". */
const CARE_LINES = 2;

/**
 * Günün kısıt notları (`kisit-tarama.md` §3.5, antrenmandaki kart notuyla aynı kural: `rowCareOf`): notlu satırlar
 * (önizlemedeki yara bandı) ve hareket başına bir satır ("Sol diz için dikkat: Back Squat"), "değiştir" diyenler önce.
 */
function dayCare(
  blocks: readonly TemplateBlock[],
  exercises: ReadonlyMap<string, CareTags & { id: string; title: string }>,
  input: CareInput | null,
  own: boolean,
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
      lines.push({ id: exercise.id, text: careLine(own ? { ...rowCare, own: true } : rowCare, exercise.title), avoid: rowCare.kind === 'avoid' });
    }
  }
  // `sort` kararlı: aynı türde günün sırası korunur.
  lines.sort((a, b) => Number(b.avoid) - Number(a.avoid));
  return { rows, lines: lines.map(({ id, text }) => ({ id, text })) };
}

function Unavailable({ children, top }: { children?: React.ReactNode; top?: React.ReactNode }) {
  return (
    <>
      {top}
      <Card>
        <CardHeader>
          <CardTitle>Bugünün antrenmanı</CardTitle>
          <CardDescription>Programın şu an açılamıyor. Antrenörüne haber ver.</CardDescription>
        </CardHeader>
      </Card>
      {children}
    </>
  );
}

/**
 * Danışanın sıradaki antrenmanı (Faz 2: "bugün ne var, başla"): gösterilen programın (evreliyse şu anki evrenin)
 * sıradaki günü. Yukarıdan aşağı:
 * - başlık: antrenmanın günü ve adı ("Çarşamba · Gün B", `todayCardTitle`; gün seçilmemişse yalnız ad), sağ üstte
 *   "Bu hafta x/y" (`WeekBadge`, istemcide); yalnız dinlenme gününde ya da bugünkü antrenman yapıldıysa üstünde kısa
 *   satır. Faz 3'e (gün ↔ antrenman eşlemesi) kadar dinlenme gününde başlık sıradaki günü söyler, "Antrenmana başla"
 *   yine bugün başlatır;
 * - tek satır "N hareket · ≈ N dk" (evreli programda üstünde evre satırı);
 * - "Antrenmana başla" ve "Başka gün seç" (§2.3) kaydırmadan görünür (Faz 0: 375×812'de düğmenin alt kenarı 700 px'ten
 *   yukarıda; başlık kısa tutulur). "Antrenmana başla" tek dokunuştur: plan Bugün açılınca telefona alınmıştır, ağ
 *   beklenmez; telefondaki plan programın bu sürümüne (ya da kısıtların bu hâline) ait değilse atılır
 *   (`WorkoutFreshness`);
 * - kısıt notları (en çok 2, "Sol diz için dikkat: Back Squat", `careLine`; fazlası "+n harekette daha not var");
 * - günün ilk 3 hareketini dolduran bloklar (`previewBlocks`, grup bölünmez; kısıtlı satırda yara bandı), kalanı
 *   "Tümünü gör (n hareket daha)" altında; numaralar bütün günden;
 * - hafta şeridi (`WeekStrip`; başlık sıradaki günü söylediği için "Sırada" satırı yok).
 * Altında diğer günler dönüş sırasıyla. `children` ana kartın hemen altına (Bugün'ün su kartı). `clientId` oturumdan
 * doğrulanmış kayıttan gelir (`currentClient`). `care` sayfanın bir kez okuduğu kısıtlar (`loadTodayCare`).
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
  const [overview, exercises] = await Promise.all([readOwnOverview(clientId).catch(() => null), listExercises()]);
  if (!overview) return <Unavailable>{children}</Unavailable>;

  const { state, pt, sessions } = overview;
  const index = state.index;
  const choice = shownProgram(index, state.unreadable, programParam);
  const ptProgram = pt?.program ?? null;
  let program: PlanProgram | null = ptProgram;
  let owner: PlanOwner = null;
  let problem = 'broken' in choice && choice.broken ? `${choice.broken.name ?? 'Seçtiğin program'} şu an açılamıyor.` : null;
  if (choice.shown) {
    const cached = state.programs.get(choice.shown);
    const read = cached ? { status: 'ok' as const, program: cached } : await readOwnProgramOf(clientId, choice.shown);
    if (read.status === 'ok') {
      program = read.program;
      owner = { programId: choice.shown, name: read.program.name };
    } else {
      problem = `${index.items.find((item) => item.id === choice.shown)?.name ?? 'Programın'} şu an açılamıyor.`;
    }
  }

  // Program seçimi (§2.6): yalnız en az bir kendi program varken.
  const last = lastDateByProgram(sessions);
  const choices: ProgramChoice[] = [
    ...(ptProgram ? [{ id: null, name: PT_PROGRAM_NAME, ...(last.get('pt') ? { lastDate: last.get('pt') } : {}) }] : []),
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
          dateText={formatDayShort(todayIn(timeZone, new Date(edited.ptEditedAt)))}
        />
      ) : null}
      {problem ? (
        <Alert>
          <AlertDescription>{problem} Antrenörünün programı gösteriliyor.</AlertDescription>
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
            <CardTitle>Bugünün antrenmanı</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {chip}
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Barbell weight="fill" />
                </EmptyMedia>
                <EmptyTitle>Henüz program yok</EmptyTitle>
                <EmptyDescription>Antrenörün programını hazırladığında sıradaki antrenmanın burada görünecek.</EmptyDescription>
              </EmptyHeader>
              {index.items.length === 0 ? (
                <EmptyContent>
                  <Button variant="outline" className="h-11" nativeButton={false} render={<Link href="/me/programlar/yeni" />}>
                    <Plus data-icon="inline-start" />
                    Kendi programını kur
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
  if (!program) return <Unavailable top={top}>{children}</Unavailable>;

  const phase = currentPhaseOf(program)?.phase;
  const dayId = nextDayId(program);
  const dayIndex = phase?.days.findIndex((item) => item.id === dayId) ?? -1;
  const day = phase?.days[dayIndex];
  if (!phase || !day) return <Unavailable top={top}>{children}</Unavailable>;

  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  // Danışanın kendi tekrar hedefleri (bitişte "Evet, güncelle", tasarım §6.2) günün satırlarında; kendi programda yok.
  const blocks = owner ? day.blocks : withClientTargets(day.blocks, program.clientTargets);
  const summary = templateSummary({ blocks }, byId);
  const phased = !owner && ptProgram?.phased === true;
  // Evreli programda evre satırı; ötekinde başlığın altında yalnız "N hareket · ≈ N dk".
  const status = phaseStatus(program, new Date());
  const context = phased
    ? [
        phase.name,
        phase.weeks !== undefined ? `${Math.min(status.week, phase.weeks)}. hafta / ${phase.weeks}` : null,
        frequencyLabel(phase.daysPerWeek)?.toLocaleLowerCase('tr') ?? null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;
  // Başlık ve kısa satır: geçerli günler iki programda da `effectiveSchedule`; "yapıldı" bugün biten bir antrenman.
  const today = todayIn(timeZone);
  const weekdays = effectiveSchedule(program).weekdays;
  const doneToday = sessions.items.some((row) => Boolean(row.finishedAt) && row.date === today);
  const title = todayCardTitle({ today, weekdays, doneToday, dayName: day.name });
  const note = doneToday
    ? 'Bugünkü antrenmanını yaptın'
    : todayState({ today, weekdays, doneToday }).kind === 'rest'
      ? 'Bugün dinlenme günün'
      : null;
  // Önizleme: kütüphanede olmayan satırlar önce ayıklanır (çizilmiyorlar; yoksa "ilk 3" üçten az görünür).
  const labels = rowLabels({ blocks });
  const shownBlocks = blocks.flatMap((block) => {
    const rows = block.rows.filter((row) => byId.has(row.exerciseId));
    return rows.length > 0 ? [{ ...block, rows }] : [];
  });
  const preview = previewBlocks(shownBlocks, 3);
  const cares = dayCare(shownBlocks, byId, care.input, owner !== null);
  // Tek seferlik seçimde antrenman o programla açılır.
  const programQuery = oneOff ? `?program=${encodeURIComponent(shown ?? 'pt')}` : '';
  // Dönüş sırası: sıradaki günün arkasından başlayıp başa sarar.
  const following = [...phase.days.slice(dayIndex + 1), ...phase.days.slice(0, dayIndex)];

  return (
    <>
      {top}
      {/* Kısıtlar değişince (ya da onay çekilince) telefondaki plan da eskir: kart notu yenilenir. */}
      <WorkoutFreshness clientId={clientId} stamp={programStamp(program, owner?.programId ?? null) + care.stamp} />
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
            <span className="tabular-nums">{summary.rows}</span> hareket · ≈ <span className="tabular-nums">{summary.minutes}</span> dk
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {summary.rows > 0 ? (
            <div className="flex flex-col gap-2">
              <Button size="lg" className="h-12 w-full" nativeButton={false} render={<Link href={`/me/antrenman${programQuery}`} />}>
                <Play data-icon="inline-start" weight="fill" />
                Antrenmana başla
              </Button>
              <OtherDayButton clientId={clientId} />
            </div>
          ) : null}
          {cares.lines.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {cares.lines.slice(0, CARE_LINES).map((line) => (
                <li key={line.id} className="flex items-start gap-2">
                  <Bandaids weight="fill" aria-hidden className="mt-0.5 size-4 shrink-0 text-primary-text" />
                  <span className="min-w-0">{line.text}</span>
                </li>
              ))}
              {cares.lines.length > CARE_LINES ? (
                <li className="pl-6 text-muted-foreground">
                  +<span className="tabular-nums">{cares.lines.length - CARE_LINES}</span> harekette daha not var
                </li>
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
                    <span>
                      Tümünü gör (<span className="tabular-nums">{preview.restRows}</span> hareket daha)
                    </span>
                  </summary>
                  <div className="pt-2">
                    <ClientDayPlan blocks={preview.rest} exercises={byId} labels={labels} cared={cares.rows} />
                  </div>
                </details>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Bu günün hareketleri şu an açılamıyor. Antrenörüne haber ver.</p>
          )}
          <WeekStrip clientId={clientId} showNext={false} />
        </CardContent>
      </Card>
      {children}

      {following.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Sonraki günler</CardTitle>
            <CardDescription>{phased ? 'Bu evrede günler sırayla döner.' : 'Günler sırayla döner.'}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {following.map((item) => {
                const itemSummary = templateSummary({ blocks: item.blocks }, byId);
                const titles = item.blocks.flatMap((block) =>
                  block.rows.flatMap((row) => {
                    const exercise = byId.get(row.exerciseId);
                    return exercise ? [exercise.title] : [];
                  }),
                );
                return (
                  <li key={item.id}>
                    <Item variant="outline">
                      <ItemContent>
                        <ItemTitle>{item.name}</ItemTitle>
                        <ItemDescription className="tabular-nums">
                          {itemSummary.rows} hareket · ≈ {itemSummary.minutes} dk
                        </ItemDescription>
                        {titles.length > 0 ? (
                          <p className="line-clamp-2 text-sm text-muted-foreground">{titles.join(', ')}</p>
                        ) : null}
                      </ItemContent>
                    </Item>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
