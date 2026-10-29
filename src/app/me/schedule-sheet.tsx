'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDots } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Spinner } from '@/components/ui/spinner';
import { WeekdayToggle } from '@/components/weekday-toggle';
import { formatNumber } from '@/lib/format';
import { fetchJson } from '@/lib/query/errors';
import { useServiceMutation } from '@/lib/query/use-service';
import { frequencyMismatch, sameWeekdays, weekdaysText, type Weekday } from '@/lib/training-days';
import type { WorkoutSchedule } from '@/lib/workout-plan';
import type { ScheduleResponse } from '@/lib/workout-routes';

/**
 * "Günlerini değiştir" (tasarım §2.11): haftanın 7 günü (çoklu, 44 px), antrenörün planladığı sıklıktan
 * farklıysa küçük uyarı (engel değil), Kaydet. Doğrudan uygulanır: program geçmişine danışan değişikliği
 * olarak yazılır, antrenöre bildirim gider. Antrenörün günlerinden farklıysa onlara tek dokunuşla dönülür.
 * Sıra değişmez: günler yalnız "ne zaman" sorusunu cevaplar. Kendi programda (`own`, `docs/design/kendi-program.md`
 * §3.2) günler o programa yazılır: antrenörün sıklığı ve günleri yok, bildirim de gitmez.
 */
export type ScheduleProgram = { programId: string; name: string } | null;

export function ScheduleSheet({
  open,
  onOpenChange,
  schedule,
  onSaved,
  own = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule: WorkoutSchedule;
  onSaved: (schedule: WorkoutSchedule) => void;
  /** Gösterilen kendi program; null PT'nin programı. */
  own?: ScheduleProgram;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent showCloseButton={false} className="gap-0">
        {/* Her açılışta kayıttaki günlerle başlar. */}
        {open ? <ScheduleBody schedule={schedule} own={own} onSaved={onSaved} onClose={() => onOpenChange(false)} /> : null}
      </DrawerContent>
    </Drawer>
  );
}

function ScheduleBody({
  schedule,
  own,
  onSaved,
  onClose,
}: {
  schedule: WorkoutSchedule;
  own: ScheduleProgram;
  onSaved: (schedule: WorkoutSchedule) => void;
  onClose: () => void;
}) {
  const [days, setDays] = useState<Weekday[]>(schedule.weekdays);
  const save = useServiceMutation({
    fn: (weekdays: Weekday[]) =>
      fetchJson<ScheduleResponse>('/api/me/schedule', { method: 'POST', body: JSON.stringify({ weekdays, programId: own?.programId ?? null }) }),
    notify: { success: own ? 'Günlerin kaydedildi.' : 'Günlerin kaydedildi. Antrenörüne bildirildi.' },
    onSuccess: (result) => {
      onSaved(result.schedule);
      onClose();
    },
  });
  const unchanged = sameWeekdays(days, schedule.weekdays);
  const differsFromPt = !own && schedule.pt.length > 0 && !sameWeekdays(days, schedule.pt);
  const perWeek = own ? undefined : (schedule.daysPerWeek ?? undefined);
  return (
    <>
      <DrawerHeader className="gap-1.5 pt-5">
        <DrawerTitle id="schedule-title" className="text-lg font-semibold">
          Antrenman günlerin
        </DrawerTitle>
        <DrawerDescription>
          {own
            ? `${own.name} programına yazılır. Sıra değişmez: sıradaki antrenman seçtiğin ilk güne kayar.`
            : 'Antrenörüne bildirilir. Sıra değişmez: sıradaki antrenman seçtiğin ilk güne kayar.'}
        </DrawerDescription>
      </DrawerHeader>
      <div className="flex flex-col gap-3 px-4">
        <WeekdayToggle id="schedule-title" value={days} onChange={setDays} disabled={save.isPending} />
        {days.length > 0 && frequencyMismatch(days, perWeek) ? (
          <p className="text-[0.8125rem] text-muted-foreground" role="status">
            {formatNumber(days.length)} gün seçtin; antrenörünün planı haftada {formatNumber(perWeek ?? 0)} gün.
          </p>
        ) : null}
        {differsFromPt ? (
          <div className="flex flex-wrap items-center justify-between gap-x-3">
            <p className="text-[0.8125rem] text-muted-foreground">Antrenörünün günleri: {weekdaysText(schedule.pt)}</p>
            <Button variant="ghost" className="-mr-2 h-11 px-2" onClick={() => setDays(schedule.pt)}>
              Onlara dön
            </Button>
          </div>
        ) : null}
      </div>
      <DrawerFooter className="pt-4">
        <Button size="lg" className="h-14 w-full text-base" disabled={days.length === 0 || unchanged || save.isPending} onClick={() => save.mutate(days)}>
          {save.isPending ? <Spinner data-icon="inline-start" /> : null}
          {days.length === 0 ? 'En az bir gün seç' : 'Kaydet'}
        </Button>
      </DrawerFooter>
    </>
  );
}

/**
 * Ayarlar'daki "Antrenman günleri" satırı: Bugün'ün programının (kalıcı seçim) geçerli günleri (danışanınki ya
 * da antrenörünki; kendi programda o programınki) ve "Günlerini değiştir" (Bugün'dekiyle aynı sheet). Kaydedince
 * sayfa tazelenir.
 */
export function TrainingDaysCard({ schedule: initial, own = null }: { schedule: WorkoutSchedule; own?: ScheduleProgram }) {
  const router = useRouter();
  const [schedule, setSchedule] = useState(initial);
  const [open, setOpen] = useState(false);
  const text = weekdaysText(schedule.weekdays);
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDots weight="fill" className="size-5 text-muted-foreground" />
          Antrenman günleri
        </CardTitle>
        <CardDescription>
          {own ? <span className="block">{own.name}</span> : null}
          {text
            ? `${text}${own ? '' : schedule.source === 'client' ? ' (senin seçimin)' : ' (antrenörünün seçimi)'}`
            : 'Henüz seçilmedi. Hangi günler çalışacağını seçersen Bugün sana hatırlatır.'}
        </CardDescription>
        <CardAction>
          <Button variant="outline" className="h-11" onClick={() => setOpen(true)}>
            Değiştir
          </Button>
        </CardAction>
      </CardHeader>
      <ScheduleSheet
        open={open}
        onOpenChange={setOpen}
        schedule={schedule}
        own={own}
        onSaved={(next) => {
          setSchedule(next);
          router.refresh();
        }}
      />
    </Card>
  );
}
