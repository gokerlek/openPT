'use client';

import { useRef, useState } from 'react';
import { CaretDown, CheckCircle } from '@phosphor-icons/react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Spinner } from '@/components/ui/spinner';
import { useLocale } from '@/i18n/client';
import { clientWorkoutMessages } from '@/i18n/messages/client-workout';
import { getFormat } from '@/lib/format';
import { cn } from '@/lib/utils';
import { finishReasonLabels, FINISH_REASONS, type FinishReason } from '@/lib/workout-flow';
import type { EffortChoice, WorkoutSummary } from '@/lib/workout-session';
import { AmrapReps, EffortPrompt, type EffortPromptView } from './rest-panel';

/** "Neden? (isteğe bağlı)": kapalı gelir; tek seçim, yeniden dokunmak kaldırır. "Ağrı" yalnız sağlık onayı varken. */
function ReasonPicker({ pain, value, onChange }: { pain: boolean; value: FinishReason | null; onChange: (reason: FinishReason | null) => void }) {
  const locale = useLocale();
  const t = clientWorkoutMessages(locale).sheets;
  const labels = finishReasonLabels(locale);
  const [open, setOpen] = useState(value !== null);
  const reasons = FINISH_REASONS.filter((reason) => reason !== 'pain' || pain);
  return (
    <div className="flex flex-col gap-2">
      <Button variant="ghost" className="-mx-2 h-11 justify-between px-2 font-normal text-muted-foreground" aria-expanded={open} aria-controls="finish-reasons" onClick={() => setOpen(!open)}>
        {t.why}
        <CaretDown data-icon="inline-end" className={cn('transition-transform duration-160', open && 'rotate-180')} />
      </Button>
      {open ? (
        <div id="finish-reasons" role="group" aria-label={t.whyGroup} className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {reasons.map((reason) => (
              <Button
                key={reason}
                variant={value === reason ? 'default' : 'secondary'}
                aria-pressed={value === reason}
                className="h-11 px-4"
                onClick={() => onChange(value === reason ? null : reason)}>
                {labels[reason]}
              </Button>
            ))}
          </div>
          {value === 'pain' ? <p className="text-[0.8125rem] text-muted-foreground">{t.painNote}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Bitirme soruları (tasarım §2.7 a/b; plandan sapma varsa ardından "Programını güncelleyelim mi?",
 * `program-update-sheet.tsx`):
 * - hepsi bitti: "Antrenman tamamlandı, bitirelim mi?" ve özet satırı; son hareketin dinlenmesi
 *   olmadığı için onun "nasıldı?" sorusu (ve AMRAP'la bittiyse "Kaç tekrar yaptın?") burada. Geçilen
 *   hareket kaldıysa "1 hareket geçildi: Plank" [Geçileni yap];
 * - erken: "Antrenmanı bitir?", yapılan/planlanan set ve yapılmayanlar (geçilenler "geçildi");
 * - yapılmayan varsa kapalı "Neden? (isteğe bağlı)": neden antrenman ortasında sorulmaz, yalnız burada ve bir
 *   kez; "Ağrı" yalnız sağlık onayıyla. Sıradaki antrenman sorulmaz (Faz 3): programlar günlere atanır, bitiş
 *   dönüşü ilerletmez;
 * - hiç set yok: dosya ilk sette oluştuğu için silinecek bir şey de yok; yalnız "Antrenmanı iptal et".
 * Yıkıcı işlem yorgun başparmağın düştüğü yerde durmaz: silme bu sheet'te yok. Yarım bırakılan
 * antrenman antrenöre bildirilir (sunucu, `unfinished`).
 */
export function FinishSheet({
  open,
  onOpenChange,
  summary,
  busy,
  effort,
  amrap,
  pain,
  onEffort,
  onAmrap,
  onDoSkipped,
  onFinish,
  onCancelWorkout,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: WorkoutSummary;
  busy: boolean;
  /** Son hareketin zorluğu (hepsi bittiyse). */
  effort: EffortPromptView | null;
  /** Son set AMRAP'sa yaptığı tekrar. */
  amrap: { reps: number } | null;
  /** Sağlık onayı: "Ağrı" nedeni. */
  pain: boolean;
  onEffort: (entryId: string, effort: EffortChoice) => void;
  onAmrap: (reps: number) => void;
  /** "Geçileni yap": ilk geçilen hareket şimdi. */
  onDoSkipped: () => void;
  onFinish: (reason: FinishReason | null) => void;
  onCancelWorkout: () => void;
}) {
  const locale = useLocale();
  const t = clientWorkoutMessages(locale).sheets;
  const none = summary.sets === 0;
  const all = !none && summary.allDone;
  const skipped = summary.remaining.filter((item) => item.skipped);
  const [reason, setReason] = useState<FinishReason | null>(null);
  // Odak birincil eylemde (zorluk düğmeleri önce gelse de).
  const primary = useRef<HTMLButtonElement>(null);
  const asks = !none && summary.remaining.length > 0;
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(next) => {
        if (!next) setReason(null);
      }}>
      <DrawerContent showCloseButton={false} className="gap-0" initialFocus={primary}>
        <DrawerHeader className="gap-1.5 pt-5">
          {all ? <CheckCircle className="mb-1 size-10 text-primary" /> : null}
          <DrawerTitle className="text-lg font-semibold">
            {none ? t.noSets : all ? t.allDone : t.finishEarly}
          </DrawerTitle>
          <DrawerDescription className="tabular-nums">
            {none
              ? t.nothingToDelete
              : all
                ? t.totals(summary.exercises, summary.sets, getFormat(locale).kg(Math.round(summary.volumeKg)), summary.minutes)
                : t.partial(summary.doneSets, summary.plannedSets)}
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-4">
          {!none && !all ? (
            <ul className="flex flex-col gap-1 text-sm tabular-nums">
              {summary.remaining.map((item) => (
                <li key={item.rowId} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate">{item.title}</span>
                  <span className="shrink-0 text-muted-foreground">{item.skipped ? t.skipped : t.setsOf(item.done, item.planned)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {all && skipped.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm">
                {t.skippedCount(skipped.length)} <span className="font-medium">{skipped.map((item) => item.title).join(', ')}</span>
              </p>
              <Button variant="outline" className="h-11 w-full" onClick={onDoSkipped}>
                {t.doSkipped}
              </Button>
            </div>
          ) : null}
          {asks ? <ReasonPicker pain={pain} value={reason} onChange={setReason} /> : null}
          {all && (amrap || effort) ? (
            <div className="flex flex-col gap-1 border-t pt-2">
              {amrap ? <AmrapReps reps={amrap.reps} onChange={onAmrap} /> : null}
              {effort ? <EffortPrompt view={effort} onAnswer={onEffort} /> : null}
            </div>
          ) : null}
        </div>
        <DrawerFooter className="pt-3">
          {none ? (
            <>
              <Button ref={primary} size="lg" className="h-14 w-full text-base" onClick={() => onOpenChange(false)}>
                {t.backToRest}
              </Button>
              <Button variant="outline" className="h-11 w-full" disabled={busy} onClick={onCancelWorkout}>
                {t.cancelWorkout}
              </Button>
            </>
          ) : (
            <>
              <Button
                ref={primary}
                size="lg"
                className="h-14 w-full text-base"
                disabled={busy}
                onClick={() => onFinish(asks ? reason : null)}>
                {busy ? <Spinner data-icon="inline-start" /> : null}
                {t.finish}
              </Button>
              <Button variant="outline" className="h-11 w-full" onClick={() => onOpenChange(false)}>
                {all ? t.keepGoing : t.backToRest}
              </Button>
            </>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

/** Başka cihazda bitirilen antrenman (409 `finished`): telefondaki setler eklensin mi? */
export function FinishedElsewhereDialog({
  count,
  busy,
  onAdd,
  onSkip,
}: {
  count: number | null;
  busy: boolean;
  onAdd: () => void;
  onSkip: () => void;
}) {
  const locale = useLocale();
  const t = clientWorkoutMessages(locale).sheets;
  return (
    <AlertDialog open={count !== null}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.elsewhereTitle}</AlertDialogTitle>
          <AlertDialogDescription>{t.elsewhereText(getFormat(locale).number(count ?? 0), count ?? 0)}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" className="h-11" disabled={busy} onClick={onSkip}>
            {t.skip}
          </Button>
          <Button className="h-11" disabled={busy} onClick={onAdd}>
            {busy ? <Spinner data-icon="inline-start" /> : null}
            {t.add}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Listeden geri tuşu (Faz 2, 9. görev): "Ara verilsin mi?". **Devam et** listede kalır (ekran liste işaretini yeniden
 * iter), **Ara ver** Bugün'e döner (antrenman telefonda kalır; bağlantı yoksa ekran söyler ve listede kalır). Telefonda
 * düğmeler üst üste: "Devam et" birincil, en altta (başparmağın düştüğü yer güvenli olan) ve odak onda. Açıklığı adresten
 * gelir (işaretsiz girdi; başka bir sheet ya da dialog açıkken açılmaz): kapatmak (Esc) "Devam et"tir, yoksa adres
 * değişmeden dialog yeniden açık sayılırdı. `busy`: çıkılıyor (Bugün açılıyor); dialog açık kalır, düğmeler devre dışı ve
 * kapanmayı reddeder (FinishSheet'in düzeni).
 */
export function PauseDialog({ open, busy, onContinue, onPause }: { open: boolean; busy: boolean; onContinue: () => void; onPause: () => void }) {
  const t = clientWorkoutMessages(useLocale()).sheets;
  const stay = useRef<HTMLButtonElement>(null);
  return (
    <AlertDialog open={open} onOpenChange={(next) => (next || busy ? undefined : onContinue())}>
      <AlertDialogContent initialFocus={stay}>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.pauseTitle}</AlertDialogTitle>
          <AlertDialogDescription>{t.pauseText}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button ref={stay} className="h-11" disabled={busy} onClick={onContinue}>
            {t.continue}
          </Button>
          <Button variant="outline" className="h-11" disabled={busy} onClick={onPause}>
            {busy ? <Spinner data-icon="inline-start" /> : null}
            {t.pause}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
