'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowBendDownRight, CheckCircle, Circle, Play, PlayCircle } from '@phosphor-icons/react';
import { WaterGlass } from '@/components/water-glass';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatNumber, formatRecent, todayIn } from '@/lib/format';
import { DURATION, tween, WORKOUT } from '@/lib/motion';
import { fetchJson } from '@/lib/query/errors';
import { useServiceQuery } from '@/lib/query/use-service';
import type { SessionDoc, WaterTap } from '@/lib/schemas/session';
import { waterOf, workingSetCount } from '@/lib/session-index';
import { randomId } from '@/lib/template-plan';
import { cn } from '@/lib/utils';
import { WATER_BATCH_MS, WATER_LIMITS } from '@/lib/water';
import { parseLocalWorkout } from '@/lib/workout-outbox';
import { effectiveDay, listView, withExtraRounds, type ListItem, type ListState } from '@/lib/workout-flow';
import type { WorkoutDay } from '@/lib/workout-plan';
import type { WorkoutResponse } from '@/lib/workout-routes';
import { WeekStrip } from './training-week';
import { localWorkoutText, readPendingWater, savePendingWater, saveWorkoutCache, subscribeLocalWorkout } from './workout-storage';

/**
 * Bugün'ün antrenman parçaları (tasarım §0, §2.1, §4.4) — istemcide:
 * - `GET /api/me/workout` bir kez çekilir ve telefonda saklanır: "Antrenmana başla" ağ beklemez.
 * - Yarım antrenman (telefonda ya da sunucuda) varsa sıradaki antrenman kartının yerine "Yarım kalan
 *   antrenman" kartı: "Devam et: <şu anki hareket>", "Antrenmanı bitir", hareketlerin listesi ve hafta şeridi.
 * - "Bu hafta x/y" (y seçili antrenman günü sayısı, yoksa sıklık) ve bugünkü su (+1): dokunuşlar 10 sn
 *   biriktirilip tek istekte `water.json`'a gider;
 *   gönderilene kadar telefonda durur. Günün toplamı = `water.json` + bitmiş antrenmanlar + yarım
 *   antrenmanın suyu (çift sayılmaz).
 */

export const WORKOUT_KEY = ['me', 'workout'] as const;
/** Bugün'ün yanıtları (programa göre); `setQueriesData` ile hepsi birden güncellenir, muadil sorguları değil. */
export const WORKOUT_OVERVIEW_KEY = [...WORKOUT_KEY, 'overview'] as const;

/**
 * Bugün'ün tek seferlik program seçimi (`?program=op_…|pt`, `docs/design/kendi-program.md` §2.6): Bugün'ün
 * parçaları yanıtı o programla çeker; yoksa kalıcı seçim (sunucu karar verir).
 */
const WorkoutProgramContext = createContext<string | null>(null);

export function WorkoutProgramProvider({ program, children }: { program: string | null; children: React.ReactNode }) {
  return <WorkoutProgramContext.Provider value={program}>{children}</WorkoutProgramContext.Provider>;
}

/** Tek seferlik seçimin adres parçası (`program=…`); yoksa boş. */
export function useWorkoutProgram(): string | null {
  return useContext(WorkoutProgramContext);
}

export function useWorkoutOverview(clientId: string) {
  const program = useWorkoutProgram();
  return useServiceQuery<WorkoutResponse>({
    key: [...WORKOUT_OVERVIEW_KEY, program ?? 'default'],
    fn: async ({ signal }) => {
      const data = await fetchJson<WorkoutResponse>(`/api/me/workout${program ? `?program=${encodeURIComponent(program)}` : ''}`, { signal });
      saveWorkoutCache(clientId, data);
      return data;
    },
    // Bugün'ün sayıları olmasa da sayfa çalışır; hata bildirimi kartın kendisinde.
    notify: 'none',
  });
}

/** Telefondaki yarım antrenman (aynı ve öteki sekmelerdeki değişiklikleri izler). */
function useLocalWorkout(clientId: string) {
  const text = useSyncExternalStore(
    subscribeLocalWorkout,
    () => localWorkoutText(clientId),
    () => null,
  );
  return useMemo(() => parseLocalWorkout(text), [text]);
}

/** "Bu hafta 1/3" (sıklık yoksa "Bu hafta 1"); yüklenirken yer tutucu. */
export function WeekBadge({ clientId }: { clientId: string }) {
  const { data, isPending } = useWorkoutOverview(clientId);
  if (isPending) return <Skeleton className="h-5 w-20 rounded-full" />;
  if (!data) return null;
  const { done, target } = data.week;
  return (
    <Badge variant="secondary" className="tabular-nums">
      Bu hafta {target ? `${formatNumber(Math.min(done, target))}/${formatNumber(target)}` : formatNumber(done)}
    </Badge>
  );
}

type InProgress = { doc: SessionDoc; plan: WorkoutDay | null };

/** "Devam et" kartının listesi en çok bu kadar birim; fazlası "+n hareket daha". */
const RESUME_LIST_LIMIT = 8;

/**
 * Listenin durum ikonu (`aria-hidden`) ve ekran okuyucu metni; antrenman ekranının listesiyle aynı (✓ bitti, ▶ şu an,
 * ○ sırada, ⤼ atlandı). `Circle`'ın dolu sürümü dolu bir disk: boş halka `regular`.
 */
const LIST_STATE: Record<ListState, { text: string; icon: React.ReactNode }> = {
  done: { text: 'bitti', icon: <CheckCircle weight="fill" aria-hidden className="size-5 shrink-0 text-primary" /> },
  current: { text: 'şu an', icon: <PlayCircle weight="fill" aria-hidden className="size-5 shrink-0 text-primary" /> },
  pending: { text: 'sırada', icon: <Circle weight="regular" aria-hidden className="size-5 shrink-0 text-muted-foreground" /> },
  skipped: { text: 'atlandı', icon: <ArrowBendDownRight aria-hidden className="size-5 shrink-0 text-muted-foreground" /> },
};

/** Birimin adı: tek harekette başlık, grupta "A + B". */
function itemName(item: ListItem): string {
  return item.members
    .map((member) => member.title)
    .filter(Boolean)
    .join(' + ');
}

/**
 * Yarım antrenmanın kartı (Faz 2): "Yarım kalan antrenman · Gün A", birincil "Devam et: <şu anki hareket>" (antrenman
 * ekranı o hareketin odağıyla açılır), "Antrenmanı bitir"; plan biliniyorsa hareketlerin listesi (`listView`: durum,
 * ad, "2/4 set"; ilk 8 birim + "+n"), bilinmiyorsa yapılan set sayısı; en altta hafta şeridi (`strip`).
 */
function ResumeCard({ progress, timeZone, strip, clientWater }: { progress: InProgress; timeZone: string; strip: React.ReactNode; clientWater: React.ReactNode }) {
  const { doc, plan } = progress;
  const view = plan ? listView(plan, doc) : null;
  const items = view && view.items.length > 0 ? view.items : null;
  const shown = items?.slice(0, RESUME_LIST_LIMIT) ?? [];
  // Gizlenen hareketler (grupta her üye ayrı hareket).
  const hidden = (items?.slice(RESUME_LIST_LIMIT) ?? []).reduce((sum, item) => sum + item.members.length, 0);
  const current = view?.current ? view.items.find((item) => item.key === view.current) : undefined;
  const currentName = current ? itemName(current) : '';
  const dayName = doc.program?.dayName ?? plan?.dayName;
  const lastAt = doc.entries.flatMap((entry) => entry.sets.map((set) => set.at)).sort().at(-1) ?? doc.startedAt;
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{dayName ? `Yarım kalan antrenman · ${dayName}` : 'Yarım kalan antrenman'}</CardTitle>
          <CardDescription>
            {items ? null : (
              <span className="block">
                <span className="tabular-nums">{view ? `${view.doneSets}/${view.plannedSets}` : workingSetCount(doc)}</span> set yapıldı
              </span>
            )}
            Kaldığın yerden sürer; kayıtların telefonunda saklı. Son kayıt {formatRecent(lastAt, timeZone)}.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Button size="lg" className="h-12 w-full" nativeButton={false} render={<Link href="/me/antrenman" />}>
              <Play data-icon="inline-start" weight="fill" />
              <span className="min-w-0 truncate">{currentName ? `Devam et: ${currentName}` : 'Kaldığın yerden devam et'}</span>
            </Button>
            <Button variant="ghost" className="h-11 w-full text-muted-foreground" nativeButton={false} render={<Link href="/me/antrenman?bitir=1" />}>
              Antrenmanı bitir
            </Button>
          </div>
          {items ? (
            <div className="flex flex-col gap-1">
              <ol className="flex flex-col gap-1" aria-label="Antrenmanın hareketleri">
                {shown.map((item) => {
                  const state = LIST_STATE[item.state];
                  const isCurrent = item.state === 'current';
                  return (
                    <li
                      key={item.key}
                      aria-current={isCurrent ? 'step' : undefined}
                      className={cn(
                        'flex items-start gap-2.5 py-1 text-sm',
                        isCurrent && 'font-semibold',
                        (item.state === 'done' || item.state === 'skipped') && 'text-muted-foreground',
                      )}>
                      {state.icon}
                      <span className="min-w-0 flex-1 break-words">
                        <span className="sr-only">{state.text}: </span>
                        {itemName(item)}
                      </span>
                      <span className={cn('shrink-0 tabular-nums', isCurrent ? 'text-foreground' : 'text-muted-foreground')}>
                        {item.done}/{item.planned} set
                      </span>
                    </li>
                  );
                })}
              </ol>
              {hidden > 0 ? (
                <p className="pl-7.5 text-sm text-muted-foreground">
                  +<span className="tabular-nums">{hidden}</span> hareket daha
                </p>
              ) : null}
            </div>
          ) : null}
          {strip}
        </CardContent>
      </Card>
      {clientWater}
    </>
  );
}

/**
 * Bugün'ün ana kartı: yarım antrenman varsa onun kartı, yoksa sunucuda çizilen sıradaki antrenman
 * kartı (`children`; içinde su kartı da var). Sunucu HTML'i hep sıradaki antrenmanı çizer; telefondaki
 * yarım antrenman hidrasyondan sonra yerine geçer.
 */
export function TodayWorkout({ clientId, children }: { clientId: string; children: React.ReactNode }) {
  const local = useLocalWorkout(clientId);
  const { data } = useWorkoutOverview(clientId);
  // Liste ve sayılar günün etkin planından: muadiller, eklenen hareketler (`effectiveDay`) ve telefondaki "+ Set ekle"
  // turları (`withExtraRounds`; antrenman ekranıyla aynı "2/4 set").
  const progress: InProgress | null = local
    ? { doc: local.doc, plan: withExtraRounds(effectiveDay(local.plan, local.doc, local.extras), local.extraRounds) }
    : data?.active
      ? { doc: data.active, plan: data.day && data.day.dayId === data.active.program?.dayId ? effectiveDay(data.day, data.active, data.extras ?? {}) : null }
      : null;
  if (!progress) return <>{children}</>;
  const timeZone = data?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  // Dönüş yalnız bitişte ilerler: şerit bugün başlamış yarım antrenmanın gününden sürer (`weekRotation`).
  const activeDay = progress.doc.program ? { dayId: progress.doc.program.dayId, date: progress.doc.date } : null;
  return (
    <ResumeCard
      progress={progress}
      timeZone={timeZone}
      strip={<WeekStrip clientId={clientId} activeDay={activeDay} />}
      clientWater={<WaterCard clientId={clientId} />}
    />
  );
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** Bugünkü su: "Su · bugün 3 bardak [+1]" (44 px); +1'den sonra 3 sn "Geri al". */
export function WaterCard({ clientId }: { clientId: string }) {
  const { data, isPending } = useWorkoutOverview(clientId);
  const local = useLocalWorkout(clientId);
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<WaterTap[]>([]);
  const pendingRef = useRef<WaterTap[]>([]);
  const timer = useRef<number | undefined>(undefined);
  const undoTimer = useRef<number | undefined>(undefined);
  const sending = useRef(false);
  const [undo, setUndo] = useState<string | null>(null);

  const update = useCallback(
    (next: WaterTap[]) => {
      pendingRef.current = next;
      setPending(next);
      savePendingWater(clientId, next);
    },
    [clientId],
  );

  const flush = useCallback(
    async (options: { keepalive?: boolean } = {}) => {
      window.clearTimeout(timer.current);
      timer.current = undefined;
      const taps = pendingRef.current.slice(0, WATER_LIMITS.perRequest);
      if (taps.length === 0) return;
      const body = JSON.stringify({ taps });
      if (options.keepalive) {
        // Sayfa kapanıyor: sonucu beklenmez; dokunuşlar telefonda kalır, açılışta yeniden gider (kimlikle birleşir).
        void fetch('/api/me/water', { method: 'POST', headers: JSON_HEADERS, body, keepalive: true }).catch(() => undefined);
        return;
      }
      if (sending.current) return;
      sending.current = true;
      try {
        const result = await fetchJson<{ file: number }>('/api/me/water', { method: 'POST', body });
        const sent = new Set(taps.map((tap) => tap.id));
        update(pendingRef.current.filter((tap) => !sent.has(tap.id)));
        queryClient.setQueriesData<WorkoutResponse>({ queryKey: WORKOUT_OVERVIEW_KEY }, (old) =>
          old ? { ...old, water: { ...old.water, file: result.file } } : old,
        );
      } catch {
        // Telefonda kalır: sonraki dokunuşta, bağlantı gelince ya da sonraki açılışta gider.
      } finally {
        sending.current = false;
      }
    },
    [queryClient, update],
  );

  useEffect(() => {
    const stored = readPendingWater(clientId);
    pendingRef.current = stored;
    // Telefonda bekleyen dokunuşlar sunucu çiziminden sonra okunur (ilk çizim sunucununkiyle aynı kalsın).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPending(stored);
    if (stored.length > 0) void flush();
    const onOnline = () => void flush();
    const onPageHide = () => void flush({ keepalive: true });
    window.addEventListener('online', onOnline);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('pagehide', onPageHide);
      window.clearTimeout(undoTimer.current);
      // Sekme değişimi (uygulama içi gezinme): sayfa yaşıyor, istek tamamlanır.
      void flush();
    };
  }, [clientId, flush]);

  const tap = (d: 1 | -1) => {
    const entry: WaterTap = { id: randomId('wt', 8, new Set(pendingRef.current.map((item) => item.id))), d, at: new Date().toISOString() };
    update([...pendingRef.current, entry]);
    if (timer.current === undefined) timer.current = window.setTimeout(() => void flush(), WATER_BATCH_MS);
    return entry;
  };

  const add = () => {
    const entry = tap(1);
    try {
      navigator.vibrate?.(10);
    } catch {
      // iOS'ta yok.
    }
    setUndo(entry.id);
    window.clearTimeout(undoTimer.current);
    undoTimer.current = window.setTimeout(() => setUndo(null), WORKOUT.waterUndoMs);
  };

  const revert = () => {
    const id = undo;
    setUndo(null);
    window.clearTimeout(undoTimer.current);
    if (!id) return;
    // Henüz gönderilmediyse dokunuş düşer; gönderildiyse "Geri al" bir −1 dokunuşudur.
    if (pendingRef.current.some((item) => item.id === id)) update(pendingRef.current.filter((item) => item.id !== id));
    else tap(-1);
  };

  const today = data?.today ?? todayIn(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const active = local?.doc ?? data?.active ?? null;
  const activeWater = active && active.date === today ? waterOf(active) : 0;
  const total = Math.max(0, (data?.water.file ?? 0) + (data?.water.sessions ?? 0) + activeWater + pending.reduce((sum, item) => sum + item.d, 0));

  return (
    <Card size="sm" className="flex-row flex-wrap items-center gap-x-3 gap-y-1 border-sky-500/20 bg-sky-500/5 p-3">
      <WaterGlass count={total} />
      <p className="min-w-0 flex-1 text-sm">
        <span className="mb-1 block text-muted-foreground">Su · bugün</span>
        {isPending && !data ? (
          <span aria-hidden className="inline-block h-4 w-4 animate-pulse rounded-md bg-muted align-middle" />
        ) : (
          <motion.b key={total} initial={{ scale: 1.15 }} animate={{ scale: 1 }} transition={tween(DURATION.fast)} className="inline-block text-3xl font-semibold tabular-nums">
            {formatNumber(total)}
          </motion.b>
        )}{' '}
        bardak
      </p>
      <AnimatePresence initial={false}>
        {undo ? (
          <motion.div className="order-last w-full text-right" key="undo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={tween(DURATION.fast)}>
            <Button variant="ghost" className="h-11 px-3 text-[0.8125rem]" onClick={revert}>
              +1 · Geri al
            </Button>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <Button variant="outline" className="h-12 min-w-14 border-sky-500/40 bg-sky-500/10 text-base text-sky-700 hover:bg-sky-500/20 dark:text-sky-300" onClick={add} aria-label="Bir bardak su ekle">
        +1
      </Button>
    </Card>
  );
}
