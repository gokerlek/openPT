'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import { FlagCheckered, Play } from '@phosphor-icons/react';
import { WaterGlass } from '@/components/water-glass';
import { unitStateText, UnitStateIcon } from '@/components/workout/unit-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useLocale } from '@/i18n/client';
import { clientHomeMessages } from '@/i18n/messages/client-home';
import { getFormat, todayIn } from '@/lib/format';
import { DURATION, tween, WORKOUT } from '@/lib/motion';
import { fetchJson } from '@/lib/query/errors';
import type { SessionDoc, WaterTap } from '@/lib/schemas/session';
import { waterOf, workingSetCount } from '@/lib/session-index';
import { randomId } from '@/lib/template-plan';
import { cn } from '@/lib/utils';
import { WATER_BATCH_MS, WATER_LIMITS } from '@/lib/water';
import { parseLocalWorkout } from '@/lib/workout-outbox';
import { effectiveDay, itemName, listView, listWindow, localWorkoutDay } from '@/lib/workout-flow';
import type { WorkoutDay } from '@/lib/workout-plan';
import type { WorkoutResponse } from '@/lib/workout-routes';
import { WeekStrip } from './training-week';
import { useWorkoutOverview, WORKOUT_OVERVIEW_KEY } from './workout-overview';
import { localWorkoutText, readPendingWater, savePendingWater, subscribeLocalWorkout } from './workout-storage';

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

// Sorgu ve program seçimi `workout-overview.tsx`'te (şerit de oradan okur); buradan yalnız `WorkoutProgramProvider`
// verilir (`(sekmeler)/page.tsx` onu Bugün'ün parçalarıyla birlikte buradan alır).
export { WorkoutProgramProvider } from './workout-overview';

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
  const { data, isPending, fetchStatus } = useWorkoutOverview(clientId);
  const locale = useLocale();
  const f = getFormat(locale);
  // Çevrimdışı (sorgu duraklatıldı): yer tutucu sonsuza dek dönmesin.
  if (isPending && fetchStatus === 'paused') return null;
  if (isPending) return <Skeleton className="h-5 w-20 rounded-full" />;
  if (!data) return null;
  const { done, target } = data.week;
  return (
    <Badge variant="secondary" className="tabular-nums">
      {clientHomeMessages(locale).today.week(target ? `${f.number(Math.min(done, target))}/${f.number(target)}` : f.number(done))}
    </Badge>
  );
}

type InProgress = { doc: SessionDoc; plan: WorkoutDay | null };

/** "Devam et" kartının listesi en çok bu kadar birim; şu an hep içinde (`listWindow`). */
const RESUME_LIST_LIMIT = 8;

/**
 * Yarım antrenmanın kartı (Faz 2): "Yarım kalan antrenman · Gün A", birincil "Devam et: <şu anki hareket>" (antrenman
 * ekranı o hareketin odağıyla açılır) ve "Antrenmanı bitir"; hepsi bittiyse birincil "Antrenmanı bitir". Plan
 * biliniyorsa hareketlerin listesi (`listView`: durum, ad, "2/4 set"; en çok 8 birim, şu an hep içinde: üstte
 * "Önceki n hareket", altta "+n hareket daha"), bilinmiyorsa yapılan set sayısı; en altta hafta şeridi (`strip`).
 */
function ResumeCard({ progress, timeZone, strip, clientWater }: { progress: InProgress; timeZone: string; strip: React.ReactNode; clientWater: React.ReactNode }) {
  const { doc, plan } = progress;
  const locale = useLocale();
  const t = clientHomeMessages(locale).today;
  const states = unitStateText(locale);
  const view = plan ? listView(plan, doc) : null;
  const items = view && view.items.length > 0 ? view.items : null;
  const list = items && view ? listWindow(items, view.current, RESUME_LIST_LIMIT) : null;
  const current = view?.current ? view.items.find((item) => item.key === view.current) : undefined;
  const currentName = current ? itemName(current) : '';
  // Kalan yalnız plan dışı kayıtsa (`current` null; açılamaz) da tek iş bitirmek.
  const allDone = view != null && (view.allDone || view.current === null);
  const dayName = doc.program?.dayName ?? plan?.dayName;
  const lastAt = doc.entries.flatMap((entry) => entry.sets.map((set) => set.at)).sort().at(-1) ?? doc.startedAt;
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{dayName ? t.unfinishedDay(dayName) : t.unfinished}</CardTitle>
          <CardDescription>
            {items ? null : (
              <span className="block">
                <span className="tabular-nums">{view ? `${view.doneSets}/${view.plannedSets}` : workingSetCount(doc)}</span>{' '}
                {t.setsDone(view ? view.plannedSets : workingSetCount(doc))}
              </span>
            )}
            {t.resumeText(getFormat(locale).recent(lastAt, timeZone))}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {allDone ? (
            // Hepsi bitti: tek iş bitirmek (antrenman ekranı bitiş sheet'iyle açılır; kapatınca liste).
            <Button size="lg" className="h-12 w-full" nativeButton={false} render={<Link href="/me/antrenman?bitir=1" />}>
              <FlagCheckered data-icon="inline-start" weight="fill" />
              {t.finish}
            </Button>
          ) : (
            <div className="flex flex-col gap-2">
              <Button size="lg" className="h-12 w-full" nativeButton={false} render={<Link href="/me/antrenman" />}>
                <Play data-icon="inline-start" weight="fill" />
                <span className="min-w-0 truncate">{currentName ? t.continueWith(currentName) : t.continue}</span>
              </Button>
              <Button variant="ghost" className="h-11 w-full text-muted-foreground" nativeButton={false} render={<Link href="/me/antrenman?bitir=1" />}>
                {t.finish}
              </Button>
            </div>
          )}
          {list ? (
            <div className="flex flex-col gap-1">
              {list.before > 0 ? (
                <p className="pl-7.5 text-sm text-muted-foreground tabular-nums">{t.before(list.before)}</p>
              ) : null}
              <ol className="flex flex-col gap-1" aria-label={t.exercises}>
                {list.shown.map((item) => {
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
                      <UnitStateIcon state={item.state} />
                      <span className="min-w-0 flex-1 break-words">
                        <span className="sr-only">{states[item.state]}: </span>
                        {itemName(item)}
                      </span>
                      <span className={cn('shrink-0 tabular-nums', isCurrent ? 'text-foreground' : 'text-muted-foreground')}>
                        {t.sets(item.done, item.planned)}
                      </span>
                    </li>
                  );
                })}
              </ol>
              {list.after > 0 ? (
                <p className="pl-7.5 text-sm text-muted-foreground tabular-nums">{t.after(list.after)}</p>
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
  // Liste ve sayılar günün etkin planından: muadiller ve eklenen hareketler (`effectiveDay`). Telefondaki antrenmanda
  // ekranın planıyla aynı (`localWorkoutDay`, "+ Set ekle" turları dahil; listenin sayılarını değiştirmez).
  const progress: InProgress | null = local
    ? { doc: local.doc, plan: localWorkoutDay(local, local.doc) }
    : data?.active
      ? { doc: data.active, plan: data.day && data.day.dayId === data.active.program?.dayId ? effectiveDay(data.day, data.active, data.extras ?? {}) : null }
      : null;
  if (!progress) return <>{children}</>;
  const timeZone = data?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  // Şerit atamalardan (Faz 3): yarım antrenman şeridin adlarını değiştirmez, dönüş yok.
  return (
    <ResumeCard
      progress={progress}
      timeZone={timeZone}
      strip={<WeekStrip clientId={clientId} />}
      clientWater={<WaterCard clientId={clientId} />}
    />
  );
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** Bugünkü su: "Su · bugün 3 bardak [+1]" (44 px); +1'den sonra 3 sn "Geri al". */
export function WaterCard({ clientId }: { clientId: string }) {
  const { data, isPending, fetchStatus } = useWorkoutOverview(clientId);
  const local = useLocalWorkout(clientId);
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<WaterTap[]>([]);
  const pendingRef = useRef<WaterTap[]>([]);
  const timer = useRef<number | undefined>(undefined);
  const undoTimer = useRef<number | undefined>(undefined);
  const sending = useRef(false);
  const [undo, setUndo] = useState<string | null>(null);
  const locale = useLocale();
  const t = clientHomeMessages(locale).today;

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
        <span className="mb-1 block text-muted-foreground">{t.waterToday}</span>
        {/* Çevrimdışıyken sorgu bekler (`paused`): telefondaki toplam gösterilir, iskelet sonsuza dek yanıp sönmez. */}
        {isPending && fetchStatus !== 'paused' ? (
          <span aria-hidden className="inline-block h-4 w-4 animate-pulse rounded-md bg-muted align-middle" />
        ) : (
          <motion.b key={total} initial={{ scale: 1.15 }} animate={{ scale: 1 }} transition={tween(DURATION.fast)} className="inline-block text-3xl font-semibold tabular-nums">
            {getFormat(locale).number(total)}
          </motion.b>
        )}{' '}
        {t.glasses(total)}
      </p>
      <AnimatePresence initial={false}>
        {undo ? (
          <motion.div className="order-last w-full text-right" key="undo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={tween(DURATION.fast)}>
            <Button variant="ghost" className="h-11 px-3 text-[0.8125rem]" onClick={revert}>
              {t.undo}
            </Button>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <Button variant="outline" className="h-12 min-w-14 border-sky-500/40 bg-sky-500/10 text-base text-sky-700 hover:bg-sky-500/20 dark:text-sky-300" onClick={add} aria-label={t.addWater}>
        +1
      </Button>
    </Card>
  );
}
