'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Check } from '@/components/line-icons';
import { Button } from '@/components/ui/button';
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDayShort } from '@/lib/format';
import {
  dayShortName,
  relativeDayText,
  WEEKDAY_NAMES,
  WEEKDAY_SHORT,
  weekPlan,
  weekStrip,
  weekTarget,
  type WeekPlanDay,
  type WeekPlanState,
} from '@/lib/training-days';
import { cn } from '@/lib/utils';
import type { WorkoutSchedule } from '@/lib/workout-plan';
import type { WorkoutResponse } from '@/lib/workout-routes';
import { ScheduleSheet } from './schedule-sheet';
import { useWorkoutOverview, useWorkoutProgram, WORKOUT_OVERVIEW_KEY } from './today-workout';
import { clearWorkoutCache, readWorkoutCache } from './workout-storage';

/**
 * Bugün kartının antrenman günleri parçaları (tasarım §2.1, §2.3, §2.11) — istemcide, `GET /api/me/workout`
 * yanıtından (`useWorkoutOverview`); kartın başlığı ("Çarşamba · Gün B") sunucuda çizilir (`program-card.tsx`):
 * - 7 günlük şerit (pazartesi başlar): seçili günler halkalı, yapılanlar dolu, kaçanlar ve pencereden önceki
 *   geçmiş seçili günler soluk halkalı, sıradaki kalın halkalı; halkanın altında günün antrenmanı (yapılanda
 *   oturumun adı, ilerisinde dönüşten tahmin, `weekPlan`), kaçanda "kaçtı"; altında "Sırada: yarın · Gün B"
 *   (kart başlığı zaten sıradaki günü söylüyorsa gizlenir, `showNext`) ve "Günlerini değiştir";
 * - "Başka gün seç": gün sheet'i, antrenörüne bildirilir (kendi programda değil), sıra seçilen günden sürer;
 * - telefondaki gün planının tazeliği: sunucuda taze okunan programın damgası saklanan planınkinden
 *   farklıysa (PT programı değiştirdi) saklanan plan atılır, "Antrenmana başla" güncel planı açar.
 */


const STATE_TEXT: Record<WeekPlanState, string> = { done: 'yapıldı', missed: 'kaçtı', next: 'sırada', planned: 'antrenman günü', rest: 'dinlenme' };

/**
 * Halkanın altındaki kelime ve ekran okuyucu satırındaki karşılığı. Seçili günün "dinlenme" durumu: geçmişteyse
 * pencereden (`since`) önceki, yapılmamış gün (soluk halka) "antrenman günü, geçti"; ilerideyse (programsız şerit)
 * "antrenman günü".
 */
function stateText(day: WeekPlanDay, today: string): string {
  if (day.state === 'rest' && day.selected) return day.date < today ? 'antrenman günü, geçti' : 'antrenman günü';
  return STATE_TEXT[day.state];
}

/** Ekran okuyucu: "Çarşamba, bugün, sırada: Gün B", "Pazartesi, yapıldı: Gün A", "Salı, dinlenme", "Pazartesi, antrenman günü, geçti". */
function dayLabel(day: WeekPlanDay, today: string): string {
  const state = stateText(day, today);
  return [WEEKDAY_NAMES[day.weekday], day.today ? 'bugün' : null, day.label ? `${state}: ${day.label}` : state].filter(Boolean).join(', ');
}

/**
 * Şeridin günleri: program varsa `weekPlan` (dönüş `nextDayId`'nin sırasından; bulunamazsa ilk gün, "Başka gün
 * seç" gibi); yoksa bugünkü şerit (sıradaki işaretlenmez, ad yok). Program kurulmadan, günler değişmeden ya da
 * danışan katılmadan önceki günler kaçmış sayılmaz (Genel bakış'la aynı kural).
 */
function planOf(data: WorkoutResponse, schedule: WorkoutSchedule): WeekPlanDay[] {
  const base = { today: data.today, weekdays: schedule.weekdays, since: schedule.since };
  if (!data.program) {
    return weekStrip({ ...base, doneDays: data.week.days }).map((day): WeekPlanDay => ({ ...day, state: day.done ? 'done' : day.missed ? 'missed' : 'rest', label: null }));
  }
  const { days, nextDayId } = data.program;
  const next = Math.max(0, days.findIndex((day) => day.id === nextDayId));
  return weekPlan({ ...base, doneDays: data.week.days, sessions: data.week.sessions ?? [], rotation: { names: days.map((day) => day.name), next } });
}

/**
 * Yedi günlük şerit, sıradaki gün ve "Günlerini değiştir".
 *
 * `showNext` (varsayılan açık): şeridin altındaki "Sırada: Çarşamba · Gün B" satırı. Kartın başlığı sıradaki günü
 * zaten söylüyorsa (program kartı, "Çarşamba · Gün B") çağıran `showNext={false}` verir; satır tekrarlanmaz.
 */
export function WeekStrip({ clientId, showNext = true }: { clientId: string; showNext?: boolean }) {
  const { data, isPending } = useWorkoutOverview(clientId);
  const queryClient = useQueryClient();
  const program = useWorkoutProgram();
  const [open, setOpen] = useState(false);
  // Gerçek şeridin yüksekliği: sütun 81 px (py-1.5 + text-xs 16 + gap 6 + halka 28 + gap 6 + ad 13), gap-1 ile
  // "Sırada" satırı (text-sm 20) ve h-11 düğme: 153 px; satırsız 129 px.
  if (isPending) return <Skeleton className={cn('w-full rounded-lg', showNext ? 'h-[9.5625rem]' : 'h-[8.0625rem]')} />;
  if (!data?.schedule) return null;
  const schedule = data.schedule;
  const days = planOf(data, schedule);
  const upcoming = days.find((day) => day.state === 'next');

  const saved = (next: WorkoutSchedule) => {
    // Hemen görünsün; sonra sunucudan taze (plan damgası değişti, telefondaki plan da yenilenir).
    queryClient.setQueryData<WorkoutResponse>([...WORKOUT_OVERVIEW_KEY, program ?? 'default'], (old) =>
      old ? { ...old, schedule: next, week: { ...old.week, target: weekTarget(next.weekdays, next.daysPerWeek ?? undefined) } } : old,
    );
    clearWorkoutCache(clientId);
    void queryClient.invalidateQueries({ queryKey: WORKOUT_OVERVIEW_KEY });
  };

  return (
    <div className="flex flex-col gap-1">
      <ol className="grid grid-cols-7 gap-1" aria-label="Bu haftanın günleri">
        {days.map((day) => {
          const isNext = day.state === 'next';
          // Seçili, geçmiş ve yapılmamış: kaçan ya da pencereden (`since`) önceki gün; ikisi de soluk halka (gelecekteki
          // planlı gün gibi görünmez), yalnız kaçan "kaçtı" der.
          const faded = day.selected && !day.done && day.date < data.today;
          const short = day.state === 'missed' ? stateText(day, data.today) : day.label ? dayShortName(day.label) : null;
          return (
            <li key={day.date} className={cn('flex min-w-0 flex-col items-center gap-1.5 rounded-lg py-1.5', day.today && 'bg-muted')}>
              <span className="sr-only">{dayLabel(day, data.today)}</span>
              <span aria-hidden className={cn('text-xs', day.today || isNext ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                {WEEKDAY_SHORT[day.weekday]}
              </span>
              <span
                aria-hidden
                className={cn(
                  'flex size-7 items-center justify-center rounded-full',
                  day.done && 'bg-primary text-primary-foreground',
                  isNext && 'ring-4 ring-primary-text ring-inset',
                  !day.done && !isNext && day.selected && !faded && 'ring-2 ring-primary-text ring-inset',
                  faded && 'opacity-40 ring-2 ring-muted-foreground ring-inset',
                )}>
                {day.done ? <Check className="size-3.5" /> : !day.selected ? <span className="size-1.5 rounded-full bg-muted-foreground/40" /> : null}
              </span>
              {/* Sütun ~41 px (375 px'te 7 sütun): uzun ad kesilir; py-px Türkçe işaretleri (ç, Ü) kırpılmasın diye. Boşken de yer tutar.
                  "kaçtı" soldurulmaz: düz muted-foreground AA kontrastı geçer, solukluk halkada. */}
              <span
                aria-hidden
                className={cn(
                  'block w-full truncate px-0.5 py-px text-center text-[0.6875rem] leading-none',
                  isNext ? 'font-semibold text-foreground' : 'text-muted-foreground',
                )}>
                {short ?? '\u00a0'}
              </span>
            </li>
          );
        })}
      </ol>
      {showNext && upcoming ? (
        <p className="text-center text-sm break-words text-muted-foreground">
          Sırada: {upcoming.today ? 'bugün' : relativeDayText(upcoming.date, data.today)}
          {upcoming.label ? (
            <>
              {' · '}
              <span className="font-medium text-foreground">{upcoming.label}</span>
            </>
          ) : null}
        </p>
      ) : null}
      <Button variant="ghost" className="h-11 self-center px-3 text-muted-foreground" onClick={() => setOpen(true)}>
        {schedule.weekdays.length > 0 ? 'Günlerini değiştir' : 'Antrenman günlerini seç'}
      </Button>
      <ScheduleSheet
        open={open}
        onOpenChange={setOpen}
        schedule={schedule}
        own={data.program?.source === 'own' && data.program.id ? { programId: data.program.id, name: data.program.name ?? '' } : null}
        onSaved={saved}
      />
    </div>
  );
}

/**
 * "Başka gün seç" (§2.3): bu evrenin günleri, sıradaki işaretli, ötekilerde son yapıldığı gün. Seçilen
 * günle antrenman başlar; sıradaki gün değilse antrenörüne bildirilir (`other_day`) ve sıra seçilen
 * günden sürer. Evrede tek gün varsa görünmez.
 */
export function OtherDayButton({ clientId }: { clientId: string }) {
  const router = useRouter();
  const { data } = useWorkoutOverview(clientId);
  const program = useWorkoutProgram();
  const [open, setOpen] = useState(false);
  const days = data?.program?.days ?? [];
  const next = data?.program?.nextDayId ?? null;
  const [picked, setPicked] = useState<string | null>(null);
  if (days.length < 2) return null;
  const selected = picked ?? next ?? days[0]?.id ?? '';
  return (
    <>
      <Button variant="ghost" className="h-11 w-full text-muted-foreground" onClick={() => setOpen(true)}>
        Başka gün seç
      </Button>
      <Drawer open={open} onOpenChange={setOpen} onOpenChangeComplete={(isOpen) => (isOpen ? undefined : setPicked(null))}>
        <DrawerContent showCloseButton={false} className="gap-0">
          <DrawerHeader className="gap-1.5 pt-5">
            <DrawerTitle id="other-day-title" className="text-lg font-semibold">
              Hangi günü yapacaksın?
            </DrawerTitle>
            {/* Kendi programda PT'ye bildirilmez (`docs/design/kendi-program.md` §3.4). */}
            <DrawerDescription>
              {data?.program?.source === 'own' ? 'Sıra seçtiğin günden devam eder.' : 'Antrenörüne bildirilir. Sıra seçtiğin günden devam eder.'}
            </DrawerDescription>
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">
            <RadioGroup aria-labelledby="other-day-title" value={selected} onValueChange={(value) => setPicked(String(value))}>
              {days.map((day) => (
                <FieldLabel key={day.id} htmlFor={`other-day-${day.id}`}>
                  <Field orientation="horizontal" className="min-h-11">
                    <FieldContent>
                      <FieldTitle>{day.name}</FieldTitle>
                      <FieldDescription>
                        {day.id === next ? 'sıradaki' : day.lastDate ? `son: ${formatDayShort(day.lastDate)}` : 'henüz yapılmadı'}
                      </FieldDescription>
                    </FieldContent>
                    <RadioGroupItem value={day.id} id={`other-day-${day.id}`} />
                  </Field>
                </FieldLabel>
              ))}
            </RadioGroup>
          </div>
          <DrawerFooter className="pt-4">
            <Button
              size="lg"
              className="h-14 w-full text-base"
              onClick={() => {
                setOpen(false);
                const query = [
                  ...(selected && selected !== next ? [`day=${encodeURIComponent(selected)}`] : []),
                  ...(program ? [`program=${encodeURIComponent(program)}`] : []),
                ].join('&');
                router.push(query ? `/me/antrenman?${query}` : '/me/antrenman');
              }}>
              Bu günle başla
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}

/**
 * Telefondaki gün planı programın bu sürümüne mi ait: sunucuda taze okunan programın damgası saklanan
 * yanıtınkinden (ya da bellektekinden) farklıysa ikisi de atılır ve Bugün yeniden çeker; "Antrenmana
 * başla" eski planla açılmaz (PT o arada programı kaydetti, başka cihazda antrenman bitti).
 */
export function WorkoutFreshness({ clientId, stamp }: { clientId: string; stamp: string }) {
  const queryClient = useQueryClient();
  const program = useWorkoutProgram();
  useEffect(() => {
    const key = [...WORKOUT_OVERVIEW_KEY, program ?? 'default'];
    const cached = readWorkoutCache(clientId);
    const memory = queryClient.getQueryData<WorkoutResponse>(key);
    const stale = (data: WorkoutResponse | undefined) => Boolean(data?.program && data.program.stamp !== stamp);
    // Saklanan yanıt başka programınsa da (tek seferlik seçim) damga farklıdır: atılır, Bugün yeniden çeker.
    if (cached && (stale(cached.data) || !cached.data.program?.stamp)) clearWorkoutCache(clientId);
    if (stale(memory)) void queryClient.invalidateQueries({ queryKey: key });
  }, [clientId, stamp, program, queryClient]);
  return null;
}
