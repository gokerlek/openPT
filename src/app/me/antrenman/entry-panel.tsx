'use client';

import { motion } from 'motion/react';
import { ArrowRight, CaretDown, CaretLeft, CaretRight, CaretUp, CheckCircle, FlagCheckered, Play, Stop, WarningCircle } from '@phosphor-icons/react';
import { Check, Plus } from '@/components/line-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Stepper } from '@/components/ui/stepper';
import { useLocale, useMessages } from '@/i18n/client';
import { clientWorkoutMessages } from '@/i18n/messages/client-workout';
import { CARDIO_LIMITS, minutesOf } from '@/lib/cardio';
import { getFormat } from '@/lib/format';
import { gridOf } from '@/lib/progression';
import { SESSION_LIMITS } from '@/lib/schemas/session';
import { cn } from '@/lib/utils';
import type { WorkoutRow } from '@/lib/workout-plan';
import { clockText, targetText, type NextSet, type OverloadState, type SetValues } from '@/lib/workout-session';
import type { SetTimerTick } from '@/lib/workout-timer';

/** Süreli harekette stepper adımı (sn). */
const SECONDS_STEP = 5;

/** Devrede istasyon geçişi: panelin üst kenarında incelen çubuk (tam dinlenme değil). */
export type TransitionView = { endsAt: number; total: number };

/** Sayılan süreli set: saniyede bir değişen hâli. */
export type TimerView = Pick<SetTimerTick, 'seconds' | 'toMin' | 'fraction' | 'phase'>;

/**
 * Odaktaki hareketin komşusu: sonra açılacak hareket (kendiliğinden geçişin açacağı, `nextUnitAfter`) ya da listede önceki
 * hareket (`previousUnitBefore`); adı ve açan iş.
 */
export type FollowingView = { name: string; onOpen: () => void };

/** "‹ Önceki": kısa (adı yalnız erişilebilir adda), satırın ya da başlığın kenarında. */
function PreviousButton({ previous, className }: { previous: FollowingView; className?: string }) {
  const t = useMessages(clientWorkoutMessages).entry;
  return (
    <Button
      variant="ghost"
      aria-label={t.previousNamed(previous.name)}
      className={cn('h-11 gap-1 px-2 text-sm font-normal text-muted-foreground', className)}
      onClick={previous.onOpen}>
      <CaretLeft data-icon="inline-start" weight="bold" />
      {t.previous}
    </Button>
  );
}

/**
 * Giriş panelinin altında tek satır (8. görev, "Sıradaki her an görünür"): "Sıradaki: Goblet Squat ›" dokununca o hareketi
 * açar; sonra hareket kalmadıysa "Son hareket". Listede önceki hareket varsa solda kısa "‹ Önceki" (biten bir harekete
 * dönüp setini düzenlemek için), "Sıradaki" sağa yaslanır ve adı kırpılır; ilk harekette yalnız "Sıradaki", ortada. Ana
 * düğmenin hemen altında tam genişlikte bir şerit değil: çizgiyle ayrılır ve düğmeler yazıları kadar geniş, "Set bitti"yi
 * ıskalayan başparmak onları açmasın. `hidden`: süreli set sayarken ve set kaydedilirken satır yok (yanlış dokunuş süren
 * seti bırakırdı); yeri boş kalır, panel kaymaz.
 */
function NextUp({ previous, following, hidden }: { previous: FollowingView | null; following: FollowingView | null; hidden: boolean }) {
  const t = useMessages(clientWorkoutMessages).entry;
  return (
    <div className={cn('mt-1 flex min-h-11 items-center gap-2 border-t pt-1', previous && !hidden ? 'justify-between' : 'justify-center')}>
      {hidden ? null : (
        <>
          {previous ? <PreviousButton previous={previous} className="-ml-2 shrink-0" /> : null}
          {following ? (
            // Erişilebilir ad görünen metnin kendisi ("Sıradaki: Goblet Squat"; WCAG 2.5.3): sesle komut verilebilsin.
            <Button
              variant="ghost"
              className={cn('h-11 w-auto max-w-full min-w-0 gap-1 px-3 text-sm font-normal text-muted-foreground', previous && '-mr-2 shrink')}
              onClick={following.onOpen}>
              <span className="shrink-0">{t.next}</span>{' '}
              <span className="min-w-0 truncate font-medium text-foreground">{following.name}</span>
              <CaretRight data-icon="inline-end" weight="bold" />
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">{t.last}</p>
          )}
        </>
      )}
    </div>
  );
}

/** Paneli açıp kapatan düğmenin kimliği: düğme yer değiştirince odak yenisine taşınır. */
export const ENTRY_PANEL_TOGGLE_ID = 'entry-panel-toggle';

/** Paneli kapatan (açıkken üst satırın sağında) ya da açan (kapalıyken gezinme satırının sağında) küçük düğme. */
function PanelToggle({ collapsed, onToggle, className }: { collapsed: boolean; onToggle: () => void; className?: string }) {
  const t = useMessages(clientWorkoutMessages).entry;
  return (
    <Button
      id={ENTRY_PANEL_TOGGLE_ID}
      variant="ghost"
      aria-label={collapsed ? t.openPanel : t.hidePanel}
      aria-expanded={!collapsed}
      className={cn('size-11 shrink-0 p-0 text-muted-foreground [&_svg]:size-5', className)}
      onClick={onToggle}>
      {collapsed ? <CaretUp weight="bold" /> : <CaretDown weight="bold" />}
    </Button>
  );
}

/**
 * Kapalı panel: yalnız "‹ Önceki · Sıradaki: <ad> ›" satırı ve sağda paneli açan ⌃. Set tablodaki satırdan girilir (kg ve
 * tekrar kutuları, ✓). `hidden` (set kaydedilirken): gezinme düğmeleri yok, yeri boş kalır.
 */
function CollapsedBar({ previous, following, hidden, onToggle }: { previous: FollowingView | null; following: FollowingView | null; hidden: boolean; onToggle: () => void }) {
  const t = useMessages(clientWorkoutMessages).entry;
  return (
    <div className="flex min-h-14 items-center gap-1 pt-1">
      {!hidden && previous ? <PreviousButton previous={previous} className="-ml-2 shrink-0" /> : null}
      <div className="flex min-w-0 flex-1 justify-center">
        {hidden ? null : following ? (
          <Button variant="ghost" className="h-11 w-auto max-w-full min-w-0 gap-1 px-3 text-sm font-normal text-muted-foreground" onClick={following.onOpen}>
            <span className="shrink-0">{t.next}</span> <span className="min-w-0 truncate font-medium text-foreground">{following.name}</span>
            <CaretRight data-icon="inline-end" weight="bold" />
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">{t.last}</p>
        )}
      </div>
      <PanelToggle collapsed onToggle={onToggle} className="-mr-2" />
    </div>
  );
}

function TransitionBar({ transition, now }: { transition: TransitionView; now: number }) {
  const remaining = Math.max(0, transition.endsAt - now);
  const fraction = Math.min(1, remaining / Math.max(1, transition.total * 1000));
  return (
    <div className="absolute inset-x-0 top-0 h-1 overflow-hidden bg-primary/15" aria-hidden>
      <motion.div
        className="h-full origin-left bg-primary"
        initial={{ scaleX: fraction }}
        animate={{ scaleX: 0, transition: { duration: remaining / 1000, ease: 'linear' } }}
      />
    </div>
  );
}

/** Sayılan süreli set: büyük saniye, alt sınıra geri sayım ve çubuk (stepper'ın yerinde). */
function TimerBox({ view, target }: { view: TimerView; target: NextSet['target'] }) {
  const locale = useLocale();
  const t = clientWorkoutMessages(locale).entry;
  const f = getFormat(locale);
  const reached = view.phase !== 'below';
  return (
    <div role="timer" aria-live="off" className="relative flex h-14 items-center gap-3 overflow-hidden rounded-lg border border-input px-4 dark:bg-input/30">
      <span className="flex items-baseline gap-1.5">
        <span className="font-heading text-[2rem] leading-none font-semibold text-primary tabular-nums">{f.number(view.seconds)}</span>
        <span className="text-sm text-muted-foreground">{clientWorkoutMessages(locale).input.secondsUnit}</span>
      </span>
      <span className="ml-auto text-right text-sm text-muted-foreground tabular-nums">
        {reached ? (view.phase === 'above' && !target.amrap ? t.aboveTarget : t.reached) : t.toTarget(f.number(view.toMin))}
      </span>
      <span className="absolute inset-x-0 bottom-0 h-1 bg-primary/15" aria-hidden>
        <span className="block h-full origin-left bg-primary transition-transform duration-160" style={{ transform: `scaleX(${view.fraction})` }} />
      </span>
    </div>
  );
}

/**
 * Alt giriş paneli (tasarım §2.4), yapışkan: başparmak bölgesinde; yalnız odakta. Üst satırda "Set 2/3 · Hedef 8–10"
 * (AMRAP'ta rozet ve "En az 8, yapabildiğin kadar"), altında 56 px'lik stepper'lar (ağırlık cihazın
 * ızgarasıyla bir sonraki/önceki ayar; tekrar ya da saniye), sonra tek dokunuşluk "Set bitti"
 * (grupta turun sıradaki üyesi varsa "Set bitti → B"), en altta "Sıradaki: <ad>" satırı. Kaydedilince düğme panel
 * değişene kadar "Kaydedildi" der ve değerler donar. Dokunuş kilidi paneli saran kapta (`WorkoutScreen`).
 *
 * - Odaktaki harekette set kalmadı (biten hareket açıldı): "Bu hareket bitti", birincil **Sıradaki: <ad>** (yoksa
 *   **Antrenmanı bitir**), ikincil **Set ekle** (grupta **Tur ekle**; fazladan set). "Sıradaki" satırı burada yok:
 *   birincil düğme odur; "‹ Önceki" başlığın sağında.
 * - Kaydedilmiş seti düzenlemek bu panelin işi değil: tablodaki satıra dokununca ekran paneli `SetEditPanel` ile değiştirir.
 *
 * - Süreli set: "Başlat ▶" sayacı kurar (saniye kronometreyle sayılır, alt sınırda tek bip), "Bitir ■"
 *   geçen süreyi yazar; elle stepper ve "Set bitti" de var.
 * - Aşırı yük (hareket başına bir kez): ağırlık planın çok üstündeyse uyarı ve "Onayla · Set bitti";
 *   "Düzelt" önerilen ağırlığa döner. Engellemez.
 * - Devrede istasyon geçişi panelin üst kenarında ince çubuk olarak sayar.
 * - Hareketi atlamak ve muadil seçmek üst çubuğun ⋯ menüsünde (8. görev; "Hareketi geç ›" kalktı).
 * - "+ Set ekle" ile istenen fazladan sette üst satırda "Fazladan" rozeti ve sağda "Sil" (fazladan set silinir, 8 sn "Geri al").
 * - Üst satırın sağındaki ⌄ paneli kapatır (`collapsed`, danışanın bu cihazdaki tercihi): altta yalnız gezinme satırı ve ⌃
 *   kalır, set tablodaki satırdan girilir. Süreli set sayarken panel açık görünür (sayaç burada).
 */
export function EntryPanel({
  row,
  next,
  frozen,
  overload,
  nextLetter,
  transition,
  timer,
  now,
  onChange,
  onResetKg,
  onDone,
  onStartTimer,
  onStopTimer,
  onCancelTimer,
  onDropExtra,
  onFinish,
  previous,
  following,
  addSet,
  collapsed,
  onToggleCollapsed,
}: {
  row: WorkoutRow | null;
  /** Gösterilen set: sıradaki ya da (kaydedilirken) az önce kaydedilen. */
  next: NextSet | null;
  /** Az önce kaydedildi: panel değişene kadar değerler donar, düğme "Kaydedildi" der. */
  frozen: boolean;
  overload: OverloadState;
  /** Grupta turun sıradaki üyesi: "Set bitti → B". */
  nextLetter: string | null;
  transition: TransitionView | null;
  /** Süreli setin sayacı çalışıyorsa hâli. */
  timer: TimerView | null;
  now: number;
  onChange: (values: SetValues) => void;
  onResetKg: () => void;
  onDone: () => void;
  onStartTimer: () => void;
  onStopTimer: () => void;
  onCancelTimer: () => void;
  /** Fazladan sette "Sil": istenen fazladan set (grupta tur) silinir (8 sn "Geri al"). */
  onDropExtra: () => void;
  onFinish: () => void;
  /** Listede önceki hareket ("‹ Önceki"); ilk harekette null. */
  previous: FollowingView | null;
  /** Sıradaki hareket (kendiliğinden geçişin açacağı); sonra hareket kalmadıysa null. */
  following: FollowingView | null;
  /** Biten harekette "Set ekle" (grupta "Tur ekle"); sınırdaysa ya da kaydedilirken null. */
  addSet: { label: string; onAdd: () => void } | null;
  /** Panel kapalı (danışanın tercihi): yalnız gezinme satırı; süreli set sayarken panel yine açık görünür. */
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const locale = useLocale();
  const messages = clientWorkoutMessages(locale);
  const t = messages.entry;
  const input = messages.input;
  const counting = next !== null && row?.trackingType === 'duration' && timer !== null && !frozen;
  if (collapsed && !counting) return <CollapsedBar previous={previous} following={following} hidden={frozen} onToggle={onToggleCollapsed} />;
  if (!next || !row) {
    return (
      <div className="flex flex-col gap-2 pt-2">
        <div className="flex min-h-11 items-center gap-2">
          <p className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium">
            <CheckCircle weight="fill" className="size-5 shrink-0 text-primary" aria-hidden />
            {t.done}
          </p>
          {previous ? <PreviousButton previous={previous} className="shrink-0" /> : null}
          <PanelToggle collapsed={false} onToggle={onToggleCollapsed} className="-mr-2" />
        </div>
        {following ? (
          <Button size="lg" className="h-14 w-full text-base" onClick={following.onOpen}>
            <span className="min-w-0 truncate">{t.nextNamed(following.name)}</span>
            <ArrowRight data-icon="inline-end" weight="bold" />
          </Button>
        ) : (
          <Button size="lg" className="h-14 w-full text-base" onClick={onFinish}>
            <FlagCheckered data-icon="inline-start" />
            {t.finish}
          </Button>
        )}
        {addSet ? (
          <Button variant="secondary" size="lg" className="h-12 w-full text-base" onClick={addSet.onAdd}>
            <Plus data-icon="inline-start" weight="bold" />
            {addSet.label}
          </Button>
        ) : null}
      </div>
    );
  }

  const weighted = row.trackingType === 'weight_reps';
  const duration = row.trackingType === 'duration';
  const cardio = row.cardio ?? null;
  // Yürüyüş/koşuda süre dakikayla girilir (saniye saklanır).
  const walk = cardio === 'walk';
  const valueMax = walk ? SESSION_LIMITS.seconds / 60 : duration ? SESSION_LIMITS.seconds : SESSION_LIMITS.reps;
  const grid = weighted ? gridOf(row.spec) : null;
  const { kg, value } = next;
  const running = duration && timer !== null && !frozen;
  const ask = overload === 'ask' && !frozen;
  const inTransition = transition !== null && transition.endsAt > now && !frozen;

  const doneButton = (
    <Button
      id="set-done"
      size="lg"
      aria-disabled={frozen || undefined}
      aria-label={!frozen && !ask && nextLetter ? t.doneThen(nextLetter) : undefined}
      onClick={frozen ? undefined : onDone}
      className={cn(
        'h-14 w-full text-base transition-transform duration-100 active:scale-[0.97] motion-reduce:active:scale-100',
        frozen && 'bg-primary/70 hover:bg-primary/70',
      )}>
      {frozen ? (
        <>
          <Check data-icon="inline-start" weight="bold" />
          {t.saved}
        </>
      ) : ask ? (
        <>
          {t.confirm}
          <Check data-icon="inline-end" weight="bold" />
        </>
      ) : nextLetter ? (
        <>
          {t.setDone}
          <ArrowRight data-icon="inline-end" weight="bold" />
          {nextLetter}
        </>
      ) : (
        <>
          {t.setDone}
          <Check data-icon="inline-end" weight="bold" />
        </>
      )}
    </Button>
  );

  return (
    <div className="flex flex-col gap-2">
      {inTransition && transition ? <TransitionBar key={transition.endsAt} transition={transition} now={now} /> : null}
      <div className="flex min-h-11 items-center gap-1.5 text-sm font-medium tabular-nums">
        <span className="shrink-0">{t.set(next.position + 1, next.total)}</span>
        {next.target.amrap ? <Badge className="shrink-0 bg-primary/15 text-primary">{t.amrap}</Badge> : null}
        {next.extra ? (
          <Badge variant="secondary" className="shrink-0">
            {t.extra}
          </Badge>
        ) : null}
        <span className="text-muted-foreground" aria-hidden>
          ·
        </span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{targetText(next.target, row.trackingType, cardio, locale)}</span>
        {inTransition && transition ? (
          <span className="shrink-0 text-[0.8125rem] text-primary">{t.transition(clockText(Math.ceil((transition.endsAt - now) / 1000)))}</span>
        ) : running ? (
          <Button variant="ghost" className="-mr-2 h-11 shrink-0 px-3 text-muted-foreground" onClick={onCancelTimer}>
            {t.cancel}
          </Button>
        ) : next.extra && !frozen ? (
          <Button variant="ghost" className="h-11 shrink-0 px-3 text-muted-foreground" aria-label={t.dropExtra} onClick={onDropExtra}>
            {t.delete}
          </Button>
        ) : null}
        {running ? null : <PanelToggle collapsed={false} onToggle={onToggleCollapsed} className="-mr-2" />}
      </div>
      {weighted ? (
        <Stepper
          size="xl"
          value={kg ?? null}
          onValueChange={(changed) => {
            if (changed !== null && Number.isFinite(changed)) onChange({ kg: Math.min(SESSION_LIMITS.kg, Math.max(0, changed)) });
          }}
          min={0}
          max={SESSION_LIMITS.kg}
          step={grid ? 0.5 : 1}
          stepFn={grid ? (current, direction) => (direction === 1 ? grid.up(current ?? grid.min, 1) : grid.below(current ?? grid.min, current ?? grid.min)) : undefined}
          inputMode="decimal"
          unit="kg"
          invalid={ask}
          aria-label={input.weight(row.title)}
          decrementLabel={input.weightLess}
          incrementLabel={input.weightMore}
        />
      ) : null}
      {running && timer ? (
        <TimerBox view={timer} target={next.target} />
      ) : (
        <Stepper
          size="xl"
          value={walk ? minutesOf(value) : value}
          onValueChange={(changed) => {
            if (changed === null || !Number.isFinite(changed)) return;
            const shown = Math.min(valueMax, Math.max(0, changed));
            onChange({ value: walk ? Math.round(shown * 60) : Math.round(shown) });
          }}
          min={0}
          max={valueMax}
          step={walk ? 1 : duration ? SECONDS_STEP : 1}
          inputMode={walk ? 'decimal' : 'numeric'}
          unit={walk ? input.minutesUnit : duration ? input.secondsUnit : input.repsUnit}
          aria-label={duration ? input.duration(row.title) : next.target.amrap ? input.repsDone(row.title) : input.reps(row.title)}
          decrementLabel={duration ? input.durationLess : input.repsLess}
          incrementLabel={duration ? input.durationMore : input.repsMore}
        />
      )}
      {cardio && !frozen ? (
        // Sayaç çalışırken de görünür: bandın ekranındaki mesafe ve eğim "Bitir"den önce yazılır.
        <div className={cn('grid gap-2', walk && 'grid-cols-[1.4fr_1fr]')}>
          <Stepper
            value={next.distanceM ?? null}
            onValueChange={(changed) => {
              if (changed !== null && Number.isFinite(changed)) onChange({ distanceM: Math.min(CARDIO_LIMITS.distanceMax, Math.max(0, Math.round(changed))) });
            }}
            min={0}
            max={CARDIO_LIMITS.distanceMax}
            step={CARDIO_LIMITS.distanceStep}
            unit="m"
            aria-label={input.distance(row.title)}
            decrementLabel={input.distanceLess}
            incrementLabel={input.distanceMore}
          />
          {walk ? (
            <Stepper
              value={next.inclinePct ?? null}
              onValueChange={(changed) => {
                if (changed !== null && Number.isFinite(changed)) onChange({ inclinePct: Math.min(CARDIO_LIMITS.inclineMax, Math.max(0, changed)) });
              }}
              min={0}
              max={CARDIO_LIMITS.inclineMax}
              step={CARDIO_LIMITS.inclineStep}
              inputMode="decimal"
              unit="%"
              aria-label={input.incline(row.title)}
              decrementLabel={input.inclineLess}
              incrementLabel={input.inclineMore}
            />
          ) : null}
        </div>
      ) : null}
      {ask ? (
        <div role="alert" className="flex min-h-11 items-center gap-2 text-sm text-destructive-text">
          <WarningCircle weight="fill" className="size-4.5 shrink-0" />
          <span className="min-w-0 flex-1">{t.overTarget(getFormat(locale).kg(next.plannedKg))}</span>
          <Button variant="ghost" className="-mr-2 h-11 shrink-0 px-3" onClick={onResetKg}>
            {t.fix}
          </Button>
        </div>
      ) : null}
      {duration && !frozen ? (
        running ? (
          <Button id="set-done" size="lg" className="h-14 w-full text-base" onClick={onStopTimer}>
            <Stop data-icon="inline-start" weight="fill" />
            {t.stop}
          </Button>
        ) : (
          <div className="grid grid-cols-[1fr_1.6fr] gap-2">
            <Button variant="secondary" size="lg" className="h-14 text-base" onClick={onStartTimer}>
              <Play data-icon="inline-start" weight="fill" />
              {t.start}
            </Button>
            {doneButton}
          </div>
        )
      ) : (
        doneButton
      )}
      <NextUp previous={previous} following={following} hidden={running || frozen} />
    </div>
  );
}
