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
import { dayOnWeekday, weekdayNames } from '@/lib/day-assignments';
import { formatDayShort } from '@/lib/format';
import {
  assignedWeek,
  dayShortName,
  isoWeekdayOf,
  WEEKDAY_NAMES,
  WEEKDAY_SHORT,
  weekdayNamesText,
  type WeekDay,
  type WeekDayState,
} from '@/lib/training-days';
import { cn } from '@/lib/utils';
import type { WorkoutResponse } from '@/lib/workout-routes';
import { useWorkoutOverview, useWorkoutProgram, WORKOUT_OVERVIEW_KEY } from './workout-overview';
import { clearWorkoutCache, readWorkoutCache } from './workout-storage';

/**
 * Bugün kartının antrenman günleri parçaları (tasarım §2.1, §2.3; Faz 3: güne atanmış programlar) — istemcide,
 * `GET /api/me/workout` yanıtından (`useWorkoutOverview`); kartın başlığı ("Salı · Alt vücut") sunucuda çizilir
 * (`program-card.tsx`):
 * - 7 günlük şerit (pazartesi başlar, `assignedWeek`): yapılanlar dolu (altında oturumun adı), atanmış günler
 *   halkalı (altında o güne atanmış program; bugünün planlısı kalın), geçen atanmış gün antrenmansızsa soluk halka ve
 *   "kaçtı", öteki günler dinlenme. Dönüş tahmini, "Sırada" satırı ve "Günlerini değiştir" yok: günleri yalnız PT
 *   belirler (kendi programda programın formu), her günün adı o güne atanmış program;
 * - "Değiştir" (başka antrenman): bu evrenin programları; bugüne atanmış program varken başkası seçilirse antrenörüne
 *   bildirilir (kendi programda değil);
 * - telefondaki gün planının tazeliği: sunucuda taze okunan programın damgası saklanan planınkinden
 *   farklıysa (PT programı değiştirdi) saklanan plan atılır, "Antrenmana başla" güncel planı açar.
 */

const STATE_TEXT: Record<WeekDayState, string> = { done: 'yapıldı', missed: 'kaçtı', planned: 'antrenman günü', rest: 'dinlenme' };

/**
 * Halkanın altındaki kelime ve ekran okuyucu satırındaki karşılığı. Seçili günün "dinlenme" durumu yalnız geçmişte,
 * pencereden (`since`) önceki yapılmamış atanmış günde olur (soluk halka): "antrenman günü, geçti".
 */
function stateText(day: WeekDay, today: string): string {
  if (day.state === 'rest' && day.selected && day.date < today) return 'antrenman günü, geçti';
  return STATE_TEXT[day.state];
}

/** Ekran okuyucu: "Salı, bugün, antrenman günü: Alt vücut", "Pazartesi, yapıldı: Üst vücut", "Salı, kaçtı: Alt vücut", "Çarşamba, dinlenme". */
function dayLabel(day: WeekDay, today: string): string {
  const state = stateText(day, today);
  return [WEEKDAY_NAMES[day.weekday], day.today ? 'bugün' : null, day.label ? `${state}: ${day.label}` : state].filter(Boolean).join(', ');
}

/**
 * Yedi günlük şerit (Faz 3). Günler geçerli günlerden (`schedule.weekdays`: şu anki evrenin atamaları, atamasız
 * eski programda PT'nin günleri), adlar atamalardan (`weekdayNames`). Program kurulmadan, günler değişmeden ya da
 * danışan katılmadan önceki günler kaçmış sayılmaz (`schedule.since`, Genel bakış'la aynı kural).
 *
 * Çevrimdışıyken (sorgu duraklatıldı, `networkMode: 'online'`) yanıt yoksa şerit çizilmez: yer tutucu sonsuza dek
 * dönmez.
 */
export function WeekStrip({ clientId }: { clientId: string }) {
  const { data, isPending, fetchStatus } = useWorkoutOverview(clientId);
  if (isPending && fetchStatus === 'paused') return null;
  // İskelet gerçek şeritle aynı yükseklikte: sütun 81 px (py-1.5 12 + text-xs 16 + gap 6 + halka 28 + gap 6 + ad 13);
  // altında satır ya da düğme yok.
  if (isPending) return <Skeleton className="h-[5.0625rem] w-full rounded-lg" />;
  if (!data?.schedule) return null;
  const schedule = data.schedule;
  const days = assignedWeek({
    today: data.today,
    weekdays: schedule.weekdays,
    names: weekdayNames(data.program?.days ?? []),
    doneDays: data.week.days,
    sessions: data.week.sessions ?? [],
    since: schedule.since,
  });

  return (
    <ol className="grid grid-cols-7 gap-1" aria-label="Bu haftanın günleri">
      {days.map((day) => {
        // Bugünün planlısı kalın halkalı ve kalın adlı: kartın başlığındaki programla aynı gün.
        const strong = day.state === 'planned' && day.today;
        // Seçili, geçmiş ve yapılmamış: kaçan ya da pencereden (`since`) önceki gün; ikisi de soluk halka (gelecekteki
        // planlı gün gibi görünmez), yalnız kaçan "kaçtı" der.
        const faded = day.selected && !day.done && day.date < data.today;
        const short = day.state === 'missed' ? stateText(day, data.today) : day.label ? dayShortName(day.label) : null;
        return (
          <li key={day.date} className={cn('flex min-w-0 flex-col items-center gap-1.5 rounded-lg py-1.5', day.today && 'bg-muted')}>
            <span className="sr-only">{dayLabel(day, data.today)}</span>
            <span aria-hidden className={cn('text-xs', day.today ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
              {WEEKDAY_SHORT[day.weekday]}
            </span>
            <span
              aria-hidden
              className={cn(
                'flex size-7 items-center justify-center rounded-full',
                day.done && 'bg-primary text-primary-foreground',
                strong && 'ring-4 ring-primary-text ring-inset',
                !day.done && !strong && day.selected && !faded && 'ring-2 ring-primary-text ring-inset',
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
                strong ? 'font-semibold text-foreground' : 'text-muted-foreground',
              )}>
              {short ?? ' '}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * "Değiştir" (§2.3; Faz 3): bu evrenin programları, bugüne atanmış olan "bugün", ötekiler atandıkları günlerle;
 * hepsinde son yapıldığı gün. Seçilen program başlar (her zaman `?day=`); PT programında bugüne atanmış program
 * varken başkası seçilirse antrenörüne bildirilir (`other_day`, sunucu bitişte seansın tarihinden karar verir).
 * Düğmede "gün" yok: kullanıcının sözü, gün değil antrenman değişir. Evrede tek program varsa görünmez.
 */
export function OtherProgramButton({ clientId }: { clientId: string }) {
  const router = useRouter();
  const { data } = useWorkoutOverview(clientId);
  const program = useWorkoutProgram();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const days = data?.program?.days ?? [];
  if (!data || days.length < 2) return null;
  // Bugün: yanıtın günü (uygulamanın saat diliminde), kartın başlığıyla aynı kural (`todayAssigned`).
  const todayDay = dayOnWeekday(days, isoWeekdayOf(data.today));
  const todayId = todayDay?.id ?? null;
  const selected = picked ?? todayId ?? days[0]?.id ?? '';
  const own = data.program?.source === 'own';
  return (
    <>
      <Button variant="ghost" className="h-11 w-full text-muted-foreground" aria-label="Antrenmanı değiştir" onClick={() => setOpen(true)}>
        Değiştir
      </Button>
      <Drawer open={open} onOpenChange={setOpen} onOpenChangeComplete={(isOpen) => (isOpen ? undefined : setPicked(null))}>
        <DrawerContent showCloseButton={false} className="gap-0">
          <DrawerHeader className="gap-1.5 pt-5">
            <DrawerTitle id="other-program-title" className="text-lg font-semibold">
              Başka antrenman seç
            </DrawerTitle>
            {/* Bildirim yalnız PT programında ve bugüne atanmış program varken (kendi programda yok,
                `docs/design/kendi-program.md` §3.4). */}
            <DrawerDescription>
              {!own && todayDay ? `Bugün ${todayDay.name} planlı; başka birini seçersen antrenörüne bildirilir.` : 'Bugün için bir program seç.'}
            </DrawerDescription>
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">
            <RadioGroup aria-labelledby="other-program-title" value={selected} onValueChange={(value) => setPicked(String(value))}>
              {days.map((day) => (
                <FieldLabel key={day.id} htmlFor={`other-program-${day.id}`}>
                  <Field orientation="horizontal" className="min-h-11">
                    <FieldContent>
                      <FieldTitle>{day.name}</FieldTitle>
                      <FieldDescription>
                        {[
                          day.id === todayId ? 'bugün' : weekdayNamesText(day.weekdays ?? []) || null,
                          day.lastDate ? `son: ${formatDayShort(day.lastDate)}` : 'henüz yapılmadı',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </FieldDescription>
                    </FieldContent>
                    <RadioGroupItem value={day.id} id={`other-program-${day.id}`} />
                  </Field>
                </FieldLabel>
              ))}
            </RadioGroup>
          </div>
          <DrawerFooter className="pt-4">
            <Button
              size="lg"
              className="h-14 w-full text-base"
              disabled={!selected}
              onClick={() => {
                setOpen(false);
                // Her zaman açık gün: sunucunun varsayılanı atanmamış günde sıradaki atanmış program olurdu.
                const query = [`day=${encodeURIComponent(selected)}`, ...(program ? [`program=${encodeURIComponent(program)}`] : [])].join('&');
                router.push(`/me/antrenman?${query}`);
              }}>
              Bu antrenmanla başla
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
