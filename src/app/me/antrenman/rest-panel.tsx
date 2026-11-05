'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowUp, CaretDown, CaretRight, Heart, LockSimple } from '@phosphor-icons/react';
import { Check } from '@/components/line-icons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Stepper } from '@/components/ui/stepper';
import { useLocale } from '@/i18n/client';
import { clientWorkoutMessages } from '@/i18n/messages/client-workout';
import { getFormat } from '@/lib/format';
import { calmText } from '@/lib/heart-rate';
import { DURATION, EASE, tween, WORKOUT } from '@/lib/motion';
import { effortLabels } from '@/lib/progression';
import { SESSION_LIMITS } from '@/lib/schemas/session';
import { WaterGlass } from '@/components/water-glass';
import { cn } from '@/lib/utils';
import { clockText, EFFORT_CHOICES, type EffortChoice, type EffortQuestion } from '@/lib/workout-session';

/** Sayacın ekrandaki hâli (saniyede bir değişir). */
export type RestView = {
  /** `hold`: temel süre bitti, nabız bekleniyor (dinlenme uzuyor). */
  state: 'running' | 'warn' | 'hold' | 'ended';
  /** Kalan (tam saniye, yukarı yuvarlanmış), nabız beklenirken uzama ya da bitişten beri geçen. */
  seconds: number;
  /** Alarm hâlâ yineleyecek: "dokununca alarm susar". */
  alarmPending: boolean;
  /** Dinlenme en çok uzadı, nabız inmeden bitti: "Nabız hâlâ yüksek". */
  heartHigh: boolean;
};

/** Dinlenmenin nabız bilgisi: son ölçüm (yoksa null) ve toparlanma sınırı. */
export type RestHeartView = { bpm: number | null; recovery: number };

const RADIUS = 96;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * 208 px'lik halka (tasarım §2.5): `endsAt`'ten kare kare, doğrusal. Rakam 56 px, son 10 sn'de ana renk;
 * bitince "Hazırsın" ve bir kez nabız. Hareket azaltmada halka yok, saniyede bir sayı. Nabız beklenirken (halka boş)
 * ortada canlı nabız ve uzama süresi.
 */
function RestRing({ endsAt, total, view, bpm }: { endsAt: number; total: number; view: RestView; bpm: number | null }) {
  const arc = useRef<SVGCircleElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    let frame = 0;
    const draw = () => {
      const remaining = endsAt - Date.now();
      const fraction = remaining > 0 ? Math.min(1, remaining / Math.max(1, total * 1000)) : 0;
      arc.current?.setAttribute('stroke-dashoffset', String(CIRCUMFERENCE * (1 - fraction)));
      if (remaining > 0) frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [endsAt, total, reduced]);

  const ended = view.state === 'ended';
  const hold = view.state === 'hold';
  const t = clientWorkoutMessages(useLocale()).rest;
  return (
    <motion.div
      role="timer"
      aria-label={hold ? t.holding : t.remainingLabel}
      animate={{ scale: ended ? [1, 1.06, 1] : 1 }}
      transition={tween(DURATION.slow)}
      className="relative shrink-0"
      style={{ width: WORKOUT.restRingPx, height: WORKOUT.restRingPx }}>
      <svg viewBox="0 0 208 208" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="104" cy="104" r={RADIUS} fill="none" strokeWidth="10" className="stroke-muted" />
        {reduced ? null : (
          <circle
            ref={arc}
            cx="104"
            cy="104"
            r={RADIUS}
            fill="none"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            className={cn('transition-[stroke] duration-160', ended ? 'stroke-primary-strong' : 'stroke-primary')}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 text-center">
        <span
          className={cn(
            'inline-flex items-center gap-1 font-heading leading-none font-semibold tabular-nums transition-colors duration-160',
            ended ? 'text-[2.125rem] text-primary' : 'text-[3.5rem]',
            view.state === 'warn' && 'text-primary',
          )}>
          {hold ? <Heart weight="fill" className="size-7 text-destructive" aria-hidden /> : null}
          {ended ? t.ready : hold ? (bpm ?? '—') : clockText(view.seconds)}
        </span>
        <span className="max-w-[9.5rem] text-[0.8125rem] text-muted-foreground">
          {ended
            ? view.alarmPending
              ? t.tapToSilence
              : ''
            : hold
              ? t.heartExtra(clockText(view.seconds))
              : view.state === 'warn'
                ? t.almost
                : t.remaining}
        </span>
      </div>
    </motion.div>
  );
}

/** "Bench Press nasıldı?" sorusu (hareket başına bir kez; grupta üyeler sırayla) ya da teşekkür. */
export type EffortPromptView = {
  /** Sıradaki cevapsız soru; hepsi cevaplandıysa null. */
  question: EffortQuestion | null;
  /** Soruların hepsi cevaplandı: "Kaydedildi" satırı. */
  answered: boolean;
};

/**
 * Zorluk: tek satır, üç düğme (56 px). Hareketin adı başlıkta: soru sıradaki hareketin kartının
 * üstünde çıksa da neyi sorduğu bellidir. Seçilmezse alan boş kalır, motor "İyi" sayar.
 */
export function EffortPrompt({ view, onAnswer }: { view: EffortPromptView; onAnswer: (entryId: string, effort: EffortChoice) => void }) {
  // Cevap bir an seçili görünür, sonra (grupta) sıradaki üyenin sorusu kayarak gelir.
  const [pinned, setPinned] = useState<EffortQuestion | null>(null);
  const locale = useLocale();
  const t = clientWorkoutMessages(locale).rest;
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const question = pinned ?? view.question;
  const answer = (entryId: string, effort: EffortChoice) => {
    const current = question?.entryId === entryId ? question : null;
    if (current) setPinned({ ...current, answer: effort });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPinned(null), WORKOUT.answerHoldMs);
    onAnswer(entryId, effort);
  };
  return (
    <div className="relative shrink-0">
      <AnimatePresence mode="popLayout" initial={false}>
        {question ? (
          <motion.div
            key={question.entryId}
            role="group"
            aria-labelledby={`effort-${question.entryId}`}
            initial={{ opacity: 0, x: WORKOUT.groupSlidePx }}
            animate={{ opacity: 1, x: 0, transition: tween(DURATION.base) }}
            exit={{ opacity: 0, x: -WORKOUT.groupSlidePx, transition: tween(DURATION.fast, EASE.exit) }}
            className="flex flex-col gap-2 py-1">
            <p id={`effort-${question.entryId}`} className="truncate text-[0.9375rem] font-semibold">
              {t.effortQuestion(question.title)}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {EFFORT_CHOICES.map((effort) => (
                <Button
                  key={effort}
                  variant={question.answer === effort ? 'default' : 'secondary'}
                  aria-pressed={question.answer === effort}
                  className="h-14 text-base font-semibold"
                  onClick={() => answer(question.entryId, effort)}>
                  {effortLabels(locale)[effort]}
                </Button>
              ))}
            </div>
          </motion.div>
        ) : view.answered ? (
          <motion.p
            key="thanks"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: tween(DURATION.fast) }}
            className="flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary">
            <Check weight="bold" className="size-4" />
            {t.effortSaved}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** AMRAP setinden sonra: "Kaç tekrar yaptın?" (tekrar stepper'ı set bittikten sonra da açık). */
export function AmrapReps({ reps, onChange }: { reps: number; onChange: (reps: number) => void }) {
  const t = clientWorkoutMessages(useLocale()).rest;
  return (
    <div className="flex min-h-14 shrink-0 items-center gap-3">
      <p className="min-w-0 flex-1 text-sm leading-snug">
        <span className="font-semibold">{t.amrapQuestion}</span>
        <span className="block text-[0.8125rem] text-muted-foreground">{t.amrapHint}</span>
      </p>
      <Stepper
        size="lg"
        value={reps}
        onValueChange={(changed) => {
          if (changed !== null && Number.isFinite(changed)) onChange(Math.min(SESSION_LIMITS.reps, Math.max(0, Math.round(changed))));
        }}
        min={0}
        max={SESSION_LIMITS.reps}
        aria-label={t.amrapLabel}
        decrementLabel={t.repsLess}
        incrementLabel={t.repsMore}
      />
    </div>
  );
}

/**
 * Dinlenme paneli (tasarım §2.5): set tablosu dinlenmede görünmez; hareket kartı üstte tek satıra iner.
 * Yerleşim çift dokunuşa göre: "Set bitti"nin yerinde düğme olmayan "Sıradaki" satırı durur, "Atla"
 * sağ üstte. Dinlenme bitince "Sıradaki" satırı "Sonraki sete geç" düğmesine döner (kilitle).
 *
 * Kaydedilen setin altında: AMRAP'sa "Kaç tekrar yaptın?"; hareket (grupta bütün üyeler) bittiyse
 * "<Hareket> nasıldı?"; ara sette tepedeyse isteğe bağlı "Kolaydı · sonraki set X kg" çipi.
 */
export function RestPanel({
  endsAt,
  total,
  view,
  heart,
  summary,
  saved,
  lockWarning,
  amrap,
  effort,
  easy,
  water,
  undoWater,
  next,
  onSkip,
  onMinimize,
  onAdjust,
  onAmrap,
  onEffort,
  onEasy,
  onWater,
  onUndoWater,
  onEditSaved,
  onTouch,
}: {
  endsAt: number;
  total: number;
  view: RestView;
  /** Nabız bandı bağlıysa (dinlenme uzarken canlı nabız ve "Nabzın 120'ye inince devam"). */
  heart: RestHeartView | null;
  /** Kartın tek satırı: "Goblet Squat · 2/3 set" (grupta "A + B · 4/6 set"; bittiyse ✓); setin hareketi bilinmiyorsa yok. */
  summary: { title: string; done: number; planned: number; finished: boolean } | null;
  saved: { text: string; setId: string } | null;
  lockWarning: boolean;
  /** Kaydedilen set AMRAP: yaptığı tekrar. */
  amrap: { reps: number } | null;
  effort: EffortPromptView | null;
  /** "Kolaydı · sonraki set X kg" (`taken`: dokunuldu). */
  easy: { kg: number; taken: boolean } | null;
  water: number;
  /** "+1 · Geri al" hapı görünüyor. */
  undoWater: boolean;
  next: string | null;
  onSkip: () => void;
  onMinimize: () => void;
  onAdjust: (seconds: number) => void;
  onAmrap: (reps: number) => void;
  onEffort: (entryId: string, effort: EffortChoice) => void;
  onEasy: () => void;
  onWater: () => void;
  onUndoWater: () => void;
  onEditSaved: (setId: string) => void;
  /** Panele her dokunuş yinelenen alarmı susturur. */
  onTouch: () => void;
}) {
  const ended = view.state === 'ended';
  const locale = useLocale();
  const t = clientWorkoutMessages(locale).rest;
  return (
    <div onPointerDownCapture={onTouch} className="flex h-full flex-col">
      {/* Gövde kayar; "Sıradaki / Sonraki sete geç" altta sabit (Safari çubuklarıyla 680 px'te de başparmak bölgesinde). */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4">
        {summary ? (
          <p className="-mx-4 flex min-h-11 shrink-0 items-center gap-2 border-b px-4 text-sm text-muted-foreground tabular-nums">
            {summary.finished ? (
              <span className="inline-flex size-5.5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary [&_svg]:size-3.5">
                <Check weight="bold" />
              </span>
            ) : null}
            <span className="min-w-0 truncate">
              <span className="font-semibold text-foreground">{summary.title}</span>
              {t.summarySets(summary.done, summary.planned)}
              {summary.finished ? t.summaryDone : ''}
            </span>
          </p>
        ) : null}

        <div className="flex min-h-12 shrink-0 items-center gap-1">
          <h2 id="rest-title" tabIndex={-1} className="flex-1 font-heading text-lg font-semibold outline-none">
            {t.title}
          </h2>
          <Button variant="ghost" className="h-11 px-2 text-muted-foreground" onClick={onMinimize}>
            <CaretDown data-icon="inline-start" />
            {t.minimize}
          </Button>
          <Button variant="ghost" className="-mr-2 h-11 px-3" onClick={onSkip} aria-label={t.skipLabel}>
            {t.skip}
            <CaretRight data-icon="inline-end" />
          </Button>
        </div>

        {saved ? (
          <div className="flex min-h-11 shrink-0 items-center gap-2 text-sm tabular-nums">
            <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary [&_svg]:size-3.5">
              <Check weight="bold" />
            </span>
            <span className="min-w-0 flex-1 truncate">{saved.text}</span>
            <Button variant="ghost" className="-mr-2 h-11 px-3" onClick={() => onEditSaved(saved.setId)}>
              {t.edit}
            </Button>
          </div>
        ) : null}

        {amrap ? <AmrapReps reps={amrap.reps} onChange={onAmrap} /> : null}

        {lockWarning ? (
          <Alert className="my-1 shrink-0">
            <LockSimple />
            <AlertDescription>{t.lockWarning}</AlertDescription>
          </Alert>
        ) : null}

        {effort ? <EffortPrompt view={effort} onAnswer={onEffort} /> : null}

        {easy ? (
          <Button
            variant={easy.taken ? 'default' : 'outline'}
            aria-pressed={easy.taken}
            className="my-1 h-11 shrink-0 self-start rounded-full px-4"
            onClick={onEasy}>
            {easy.taken ? <Check data-icon="inline-start" weight="bold" /> : <ArrowUp data-icon="inline-start" weight="bold" />}
            {easy.taken ? t.easyTaken(getFormat(locale).kg(easy.kg)) : t.easy(getFormat(locale).kg(easy.kg))}
          </Button>
        ) : null}

        <div className="mt-2.5 mb-1.5 grid shrink-0 grid-cols-[1fr_auto_1fr] items-center justify-items-center">
          <Button variant="secondary" className="size-14 flex-col gap-0 rounded-full text-base leading-none tabular-nums" onClick={() => onAdjust(-15)} aria-label={t.shorter}>
            −15
            <span className="text-[0.6875rem] font-medium text-muted-foreground">{t.secondsUnit}</span>
          </Button>
          <RestRing endsAt={endsAt} total={total} view={view} bpm={heart?.bpm ?? null} />
          <Button variant="secondary" className="size-14 flex-col gap-0 rounded-full text-base leading-none tabular-nums" onClick={() => onAdjust(15)} aria-label={t.longer}>
            +15
            <span className="text-[0.6875rem] font-medium text-muted-foreground">{t.secondsUnit}</span>
          </Button>
        </div>
        <p className="min-h-5.5 shrink-0 text-center text-[0.9375rem] font-medium text-primary tabular-nums">
          {view.state === 'hold' && heart ? (
            calmText(heart.recovery, locale)
          ) : ended && view.heartHigh ? (
            <>
              <span className="text-destructive-text">{t.heartHigh}</span>
              {t.endedAgo(clockText(view.seconds))}
            </>
          ) : ended ? (
            t.restEndedAgo(clockText(view.seconds))
          ) : (
            ''
          )}
        </p>

        <div className="relative mt-1 shrink-0">
          <Button variant="secondary" className="h-28 w-full gap-3 border border-sky-500/25 bg-sky-500/10 text-base text-sky-700 hover:bg-sky-500/20 dark:text-sky-300" onClick={onWater}>
            <WaterGlass count={water} className="h-24 w-20" />
            <span>
              {t.drankWater}{' '}
              <motion.b key={water} initial={{ scale: 1.15 }} animate={{ scale: 1 }} transition={tween(DURATION.fast)} className="inline-block font-semibold tabular-nums">
                {water}
              </motion.b>
            </span>
          </Button>
          <AnimatePresence>
            {undoWater ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={tween(DURATION.fast)}
                className="mt-2 text-right">
                <Button variant="outline" className="h-10 px-3 text-[0.8125rem]" onClick={onUndoWater}>
                  {t.undoWater}
                </Button>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex min-h-14 shrink-0 items-center justify-center px-4 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        {ended ? (
          <Button size="lg" className="h-14 w-full text-base" onClick={onSkip}>
            {t.nextSet}
          </Button>
        ) : next ? (
          <p className="px-2 text-center text-[0.9375rem] text-balance text-muted-foreground tabular-nums">
            <span className="mr-1 font-semibold text-foreground">{t.next}</span>
            {/* Satır parçaların arasında kırılır, içinde değil ("10–12" bölünmez). */}
            {next.split(' · ').map((part, index) => (
              <span key={index}>
                {index > 0 ? ' · ' : null}
                <span className="whitespace-nowrap">{part}</span>
              </span>
            ))}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Küçültülmüş dinlenme: 48 px şerit, tablo ve giriş paneli geri gelir; "Set bitti" dinlenmeyi bitirir. Listede alt
 * çubuğun üstünde ("‹ Liste" ve geri tuşu tam paneli küçültür; listeden harekete dokunmak dinlenmeyi bitirmez).
 */
export function RestStrip({ view, bpm, onExpand, onSkip }: { view: RestView; bpm: number | null; onExpand: () => void; onSkip: () => void }) {
  const ended = view.state === 'ended';
  const hold = view.state === 'hold';
  const t = clientWorkoutMessages(useLocale()).rest;
  return (
    <div className="flex h-12 items-center gap-1 border-t bg-primary/10 pr-1 pl-4 tabular-nums">
      <span className="flex-1 text-sm text-muted-foreground">{hold ? t.waitingHeart : t.title}</span>
      <b className={cn('inline-flex min-w-14 items-center gap-1 text-lg font-semibold', view.state !== 'running' && 'text-primary')}>
        {hold ? <Heart weight="fill" className="size-4 text-destructive" aria-hidden /> : null}
        {hold ? (bpm ?? '—') : ended ? `+${clockText(view.seconds)}` : clockText(view.seconds)}
      </b>
      <Button variant="ghost" className="h-11 px-3" onClick={onExpand}>
        {t.expand}
      </Button>
      <Button variant="ghost" className="h-11 px-3 text-muted-foreground" onClick={onSkip}>
        {t.skip}
      </Button>
    </div>
  );
}
