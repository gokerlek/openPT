'use client';

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowClockwise, Barbell, WarningCircle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { showGuardedUndo, showUndoToast } from '@/components/undo-toast';
import { cardioSpeedIssue } from '@/lib/cardio';
import { formatKg } from '@/lib/format';
import { DRAG, DURATION, EASE, tween, WORKOUT } from '@/lib/motion';
import { EFFORT_LABELS } from '@/lib/progression';
import { ApiError, fetchJson } from '@/lib/query/errors';
import { feedbackItems, feedbackMessage, resolveFeedback, withFeedbackFlags, type FeedbackItem, type FeedbackOutcome } from '@/lib/program-feedback';
import type { FinishFeedback, FinishHealth, SessionDoc } from '@/lib/schemas/session';
import {achievementNotice} from '@/lib/workout-achievements';
import { waterOf } from '@/lib/session-index';
import { rowKeyOf, type CursorUnit } from '@/lib/workout-cursor';
import {
  addExercise,
  canRemoveAdded,
  canSwap,
  dropWithUndo,
  firstSkippedKey,
  itemName,
  listView,
  localWorkoutDay,
  moveUnit,
  moveUnitTo,
  nextUnitAfter,
  previousUnitBefore,
  removeAdded,
  restoreAt,
  swapRow,
  undoSkip,
  undoSwitchPrep,
  unitTitle,
  validFocus,
  withFinishReason,
  type FinishReason,
} from '@/lib/workout-flow';
import { groupView, nextMemberLetter } from '@/lib/workout-groups';
import type { HeartLimits } from '@/lib/heart-rate';
import { FOCUS_PARAM, focusOf, LIST_PARAM, pauseSteps, workoutHref } from '@/lib/workout-nav';
import { createLocalWorkout, setsMissingOn, unsentSets, untouchedWorkout, withChange, type LocalWorkout } from '@/lib/workout-outbox';
import { acknowledgeRest, adjustRest, alarmPending, LATE_MS, startRest, tickRest, type RestEvent, type RestHeart, type RestTimer } from '@/lib/workout-rest';
import { afterFinish, extraKey, rekeyExtra, type WorkoutDay } from '@/lib/workout-plan';
import type { AddedRowResponse, LibraryItem, SwapOption, WorkoutResponse } from '@/lib/workout-routes';
import {
  addExtraRound,
  addWaterTap,
  afterLog,
  canDropSet,
  cursorOf,
  deleteSet,
  dropExtraRound,
  droppedWith,
  easyShortcut,
  editSet,
  effortQuestions,
  elapsedText,
  ensureEntries,
  findSet,
  logSet,
  logWarmup,
  newEntryId,
  newSessionDoc,
  nextSet,
  nextText,
  overloadState,
  restoreSet,
  setEntryEffort,
  setSetEffort,
  setSetupNote,
  syncPlannedCount,
  setupNoteOf,
  setValueText,
  setViews,
  unitKeyOfRow,
  unlogWarmup,
  warmupViews,
  workoutSummary,
  type EffortChoice,
  type EffortQuestion,
  keepTyped,
  pendingTyped,
  withoutTyped,
  type NextSet,
  type SetValues,
  type SetView,
} from '@/lib/workout-session';
import { startSetTimer, stopSetTimer, tickSetTimer } from '@/lib/workout-timer';
import { checkAsked } from '../check-in-storage';
import { WORKOUT_KEY, WORKOUT_OVERVIEW_KEY } from '../workout-overview';
import { clearLocalWorkout, clearWorkoutCache, readLocalWorkout, readWorkoutCache, saveLocalWorkout, saveWorkoutCache, writerId } from '../workout-storage';
import { AddExerciseSheet } from './add-exercise-sheet';
import { ENTRY_PANEL_TOGGLE_ID, EntryPanel, type TimerView, type TransitionView } from './entry-panel';
import { WorkoutExerciseCard } from './exercise-card';
import { HeartAlertBanner, HeartBadge, HeartSheet } from './heart-rate-panel';
import { ProgramUpdateSheet, type ProgramAnswer } from './program-update-sheet';
import { RestPanel, RestStrip, type EffortPromptView, type RestView } from './rest-panel';
import { SetEditPanel, type SetEditValues, type SetEditView } from './set-edit-panel';
import { useEntryPanelClosed } from './panel-pref';
import { ROW_DONE_ID, setEditButtonId, type FixSet, type RowEntry } from './set-row';
import { StartCheck, type StartCheckHandle } from './start-check';
import { SwapSheet, type SwapTarget } from './swap-sheet';
import { disconnectHeartRate, useHeartAlert, useHeartRate } from './use-heart-rate';
import { useWorkoutOutbox } from './use-workout-outbox';
import { beep, isIOS, unlockAudio, useWakeLock } from './workout-feedback';
import { vibrate } from '@/lib/haptics';
import { WorkoutHeader, type FocusActions, type WorkoutStatus } from './workout-header';
import { LIST_TITLE_ID, listRowId, WorkoutList, WorkoutListBar } from './workout-list';
import { WorkoutSwitchSheet } from './workout-switch-sheet';
import { FinishedElsewhereDialog, FinishSheet, PauseDialog } from './workout-sheets';

/**
 * Bugün'de çekilen plan bu kadar tazeyse başlangıç ağ beklemez; yine de arka planda taze plan istenir ve
 * henüz hiçbir şey kaydedilmediyse (PT o arada programı değiştirdiyse) antrenman güncel planla yeniden
 * kurulur. Bugün de sunucudaki programın damgası tutmayan planı atar (`WorkoutFreshness`).
 */
const CACHE_FRESH_MS = 60_000;
/** Hareket bitince: eski kart çıkar, yenisi gelir; dinlenme onun üstünde açılır (tasarım §2.4, prototip). */
const NEXT_SLIDE_MS = 260;
const NEXT_REST_MS = 700;

type LoadState = { phase: 'loading' } | { phase: 'ready' } | { phase: 'empty'; problem?: string | undefined } | { phase: 'error'; message: string };

/** Bitiş sorusu cevaplandı, "Programını güncelleyelim mi?" bekliyor: maddeler ve bitişin öteki seçimleri. */
type PendingUpdate = { items: FeedbackItem[]; health: FinishHealth | undefined };

/** Az önce kaydedilen set: panel değişene kadar gösterilir. */
type Saving = { next: NextSet };

/** Ekranın sheet ve dialog'ları (açık katman; "Ara verilsin mi?" hariç). */
type Layer = 'elsewhere' | 'check' | 'swap' | 'add' | 'update' | 'finish' | 'switch' | 'heart';

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function stampOf(local: LocalWorkout) {
  return { at: new Date().toISOString(), by: local.doc.writer };
}

/** Taslağın değerleri: verilenler, verilmeyenler önceden dolu değerden (ağırlık, tekrar/süre, kardiyoda mesafe ve eğim). */
function valuesOf(prefilled: Pick<NextSet, 'kg' | 'value' | 'distanceM' | 'inclinePct'>, values: SetValues): SetValues {
  const distanceM = values.distanceM ?? prefilled.distanceM;
  const inclinePct = values.inclinePct ?? prefilled.inclinePct;
  return {
    kg: values.kg ?? prefilled.kg,
    value: values.value ?? prefilled.value,
    ...(distanceM !== undefined ? { distanceM } : {}),
    ...(inclinePct !== undefined ? { inclinePct } : {}),
  };
}

function sameValues(a: SetValues, b: SetValues): boolean {
  return a.kg === b.kg && a.value === b.value && a.distanceM === b.distanceM && a.inclinePct === b.inclinePct;
}

/** Planın programı adres parçası olarak (`program=`): kendi programın kimliği ya da `pt`. */
function planProgram(plan: WorkoutDay): string {
  return plan.source === 'own' && plan.programId ? plan.programId : 'pt';
}

/** Yanıttaki planın programı (`planProgram` gibi). */
function responseProgram(data: WorkoutResponse): string {
  return data.program?.source === 'own' && data.program.id ? data.program.id : 'pt';
}

/**
 * Telefondaki antrenmanda henüz hiçbir şey yok (`untouchedWorkout`: kayıt, su, gönderim, yoklamanın hafifletmesi) ve yoklama
 * cevaplanmadı ya da geçilmedi: plan değişirse sessizce yeniden kurulabilir. Yoklama planı bildirimsiz de değiştirebilir
 * (ağrı kuralı yalnız planı); yeniden kurulan antrenman o ayarı kaybeder, yeni kimliğiyle yoklamayı yeniden sorardı.
 */
function untouched(clientId: string, local: LocalWorkout): boolean {
  return untouchedWorkout(local) && !checkAsked(clientId, local.doc.id);
}

/**
 * Taze yanıt telefondaki boş antrenmanı değiştirir mi: sunucuda aynı günün yarım antrenmanı var (başka
 * cihaz) ya da gün planı farklı (PT programı kaydetti). Başka programın yarım antrenmanı buradan devralınmaz.
 */
function planChanged(local: LocalWorkout, fresh: WorkoutResponse): boolean {
  if (fresh.active) return fresh.active.program?.dayId === local.plan.dayId;
  return fresh.day !== null && JSON.stringify(fresh.day) !== JSON.stringify(local.plan);
}

/** "Bu hareketi atla" ve "Hareket ekle" toast'larının düğmeleri: dokunmatikte 44 px (`undo-toast.ts` gibi). */
const TOAST_BUTTONS = { actionButton: 'touch:min-h-11 touch:px-3! touch:text-sm!' };

const effective = new WeakMap<LocalWorkout, WorkoutDay>();

/**
 * Günün etkin planı: başlangıçtaki gün + muadiller + eklenen hareketler + "+ Set ekle"nin turları (`localWorkoutDay`).
 * Her kayıt yeni bir `LocalWorkout` olduğu için kayıt başına bir kez kurulur.
 */
function planOf(local: LocalWorkout): WorkoutDay {
  let day = effective.get(local);
  if (!day) {
    day = localWorkoutDay(local, local.doc);
    effective.set(local, day);
  }
  return day;
}

/** Sorulardan panelin görünümü: ilk cevapsız soru; hepsi cevaplandıysa teşekkür. Soru yoksa null. */
function promptOf(questions: readonly EffortQuestion[]): EffortPromptView | null {
  if (questions.length === 0) return null;
  const question = questions.find((item) => item.answer === undefined) ?? null;
  return { question, answered: question === null };
}

/** Belgedeki en son kaydedilen çalışma seti (bitiş sorusunun konusu). */
function lastWorkingSetId(doc: SessionDoc): string | null {
  let best: { id: string; at: number } | null = null;
  for (const entry of doc.entries) {
    for (const set of entry.sets) {
      const at = Date.parse(set.at);
      if (set.type === 'working' && (!best || at >= best.at)) best = { id: set.id, at };
    }
  }
  return best?.id ?? null;
}

/** Odaktaki birimde set kalmadıysa kartın satırı: tek harekette kendisi, grupta en son set yapılan üye. */
function restingRowOf(unit: CursorUnit, doc: SessionDoc): string | null {
  let best: { rowId: string; at: string } | null = null;
  for (const member of unit.members) {
    const entry = member.entryId ? doc.entries.find((item) => item.id === member.entryId) : undefined;
    for (const set of entry?.sets ?? []) {
      if (member.rowId && set.type === 'working' && (!best || set.at >= best.at)) best = { rowId: member.rowId, at: set.at };
    }
  }
  return best?.rowId ?? unit.members[0]?.rowId ?? null;
}

/**
 * Panelde düzenlenen set, gösterilen birimdeyse: kaydı, satırı ve tablodaki yeri. Değilse null (set silindi, başka birimin seti,
 * çalışma seti değil): panel giriş paneline döner.
 */
function editOf(plan: WorkoutDay, doc: SessionDoc, setId: string, unitKey: string): SetEditView | null {
  const found = findSet(doc, setId);
  const rowKey = found ? rowKeyOf(found.entry) : undefined;
  const row = rowKey ? plan.rows[rowKey] : undefined;
  if (!found || !row || found.set.type !== 'working' || unitKeyOfRow(plan, row.rowId) !== unitKey) return null;
  const views = setViews(plan, doc, row.rowId);
  const position = views.find((item) => item.logged?.id === setId)?.position;
  if (position === undefined) return null;
  return {
    setId,
    row,
    position,
    total: views.length,
    kg: found.set.kg,
    value: found.set.reps ?? found.set.seconds ?? 0,
    effort: found.set.target?.amrap ? null : found.set.effort,
    extra: found.set.extra === true,
  };
}

/** Süreli setin sayacı gösterilen setin sayacı mı (çizimdeki `timerRunning` ile aynı kural; işleyiciler için). */
function timedSetRunning(local: LocalWorkout, focus: string | null): boolean {
  const next = local.timer ? nextSet(planOf(local), local.doc, local.draft, focus) : null;
  return Boolean(local.timer && next && local.timer.rowId === next.rowId && local.timer.setIndex === next.setIndex);
}

/** Adresteki odak (`window.location`): geri tuşu onu hemen değiştirir, `useSearchParams` ve `focusRef` sonra yetişir. */
function addressFocus(): string | null {
  return focusOf(new URLSearchParams(window.location.search));
}

/** Adreste liste işareti ya da odak var (`window.location`; `useSearchParams` geçişte gecikir). */
function addressMarked(): boolean {
  const address = new URLSearchParams(window.location.search);
  return address.has(LIST_PARAM) || address.has(FOCUS_PARAM);
}

/**
 * Etkin antrenman (tasarım §2.4, §2.5, §4.3, §4.4): tam ekran, dock yok. Kaynak telefondur: belge,
 * gönderim kuyruğu, dinlenme ve taslak `localStorage`'da (`workout-outbox.ts`); yenileme ya da çökme
 * bir şey kaybettirmez, kaldığı yerden sürer.
 *
 * Başlangıç ağ beklemez: Bugün'de çekilen plan tazeyse o, değilse `GET /api/me/workout`; çevrimdışıysa
 * son okunan plan. Telefonda yarım antrenman varsa o; yoksa sunucudaki yarım antrenman; o da yoksa yeni
 * belge (dosya ilk setle oluşur). Saklanan planla açılan boş antrenman arka planda taze planla
 * karşılaştırılır; PT o arada programı değiştirdiyse güncel planla yeniden kurulur. Bugüne atanmış program varken
 * başka program seçildiyse (`?day=`, Faz 3) "Üst vücut seçildi · Bugün Alt vücut planlıydı; antrenörüne bildirilecek.".
 *
 * Bitiş (§2.7): "Antrenman tamamlandı, bitirelim mi?" ya da erken bitişte yapılmayanlar ve bir kez sorulan
 * isteğe bağlı neden (sıradaki antrenman sorulmaz: programlar günlere atanır, bitiş dönüşü ilerletmez); plandan
 * sapma ya da öneri varsa ardından "Programını güncelleyelim mi?" (`program-feedback.ts`), kararlar bitişin
 * tek commit'ine biner. Bitince özet karuseli açılır (§2.8, `/me/antrenman/ozet/[id]`).
 *
 * "Set bitti": önce ✓ satıra düşer ve düğme "Kaydedildi" der; 220 ms sonra panel dinlenmeye döner.
 * Hareket bittiyse kart sola çıkar, sıradaki sağdan gelir, dinlenme onun üstünde açılır; son setten sonra
 * bitirme sorusu. Alt panel her durum değişiminden sonra 400 ms dokunuş almaz (`WORKOUT.tapGuardMs`):
 * emin olmak için ikinci kez basmak ikinci bir set yazmaz.
 *
 * Set türleri ve gruplar (§2.4, §2.5): grupta tur `setSlots` sırasıyla yürür; üyeler arasında dinlenme
 * yok (kart 12 px kayar, düğme "Set bitti → B"), devrede istasyon geçişi panelde ince çubuk, tur sonunda
 * blok dinlenmesi. Süreli sette "Başlat ▶ / Bitir ■" sayacı; ısınma satırdaki ✓; aşırı yük hareket
 * başına bir kez onaylanır. Zorluk hareketin son setinden sonra bir kez; AMRAP'ta "Kaç tekrar yaptın?".
 * Zorluk, ısınma, ayar notu ve AMRAP düzeltmesi kendi başına gönderilmez, sonraki set yazımına biner.
 *
 * Liste + odak (Faz 2): adreste odak yoksa ana ekran günün listesi (`WorkoutList`: satıra dokunmak o hareketi açar,
 * atlananı geri alır, tutamaçla taşınır, "Hareket ekle", altta "Başla/Devam et: <ad>" ya da "Antrenmanı bitir");
 * odak varsa (`?hareket=<birim>`, `workout-nav.ts`) o hareketin kartı ve giriş paneli: sıradaki set yalnız o birimde
 * aranır, sıra kendiliğinden değişmez, biten birim set tablosuyla açılır, "‹ Liste" ve geri tuşu listeye döner. Ekran
 * şu anki hareketin odağıyla açılır (açılış kuralı: liste işaretli girdinin üstünde odak girdisi). Listeden geri tuşu
 * işaretsiz girdiye döner ve "Ara verilsin mi?" sorar (`PauseDialog`: Devam et · Ara ver). Üst çubuk
 * `WorkoutHeader` (⋯ menüsünde "Antrenmanı değiştir" ve "Ara ver"; odakta önce "Muadil seç" ve "Bu hareketi atla").
 * Odakta giriş panelinin altında "Sıradaki: <ad>" (kendiliğinden geçişin açacağı hareket, `nextUnitAfter`) ve solunda
 * "‹ Önceki" (listede önceki açılabilen hareket, `previousUnitBefore`); biten hareket açılınca panel "Bu hareket bitti"
 * der (Sıradaki ya da Antrenmanı bitir, Set ekle). Dinlenme ekranı kilitlemez: listeye dönülünce tam panel küçülür,
 * listede alt çubuğun üstündeki şeritte sürer.
 *
 * Yapılan set (§2.4): tablodaki satıra (ya da dinlenmenin "Düzenle"sine) dokunmak onu alttaki panelde düzenlemeye açar
 * (`SetEditPanel`, satır vurgulu; yazım eski set sheet'ininki). ✓'a dokunmak işareti kaldırır; sola kaydırıp
 * "Sil" ve panelin "Seti sil"i seti siler: onay yok, 8 sn "Geri al" (`showUndoToast`) (`restoreSet`). Süreli set sayarken ikisi
 * de yapılmaz.
 *
 * Atlama ve muadil (§2.6): odakta ⋯ menüsünde tek dokunuşluk "Bu hareketi atla" (atlananlara; 8 sn "Geri al")
 * ve "Muadil seç" (kendi geçmişiyle; kısıt notunda da "Değiştir"). Ekran günün etkin planıyla çalışır (`planOf`:
 * muadiller ve eklenenler). Atlama, sıra ve muadil de kendi başına gönderilmez; neden yalnız bitişte sorulur.
 *
 * "+ Set ekle" (§2.4): kartın tablosunun altında (grupta "Tur ekle") ve biten hareketin giriş panelinde ("Bu hareket
 * bitti" · "Set ekle"; son setten sonra ekran o odakta kalır, bitiş sorusunun "Devam et"i sheet'i kapatır). İstek
 * telefonda durur (`extraRounds`), fazladan set `extra` işaretiyle yazılır; iki antrenman üst üste plandan fazla set
 * yapılırsa bitişte antrenöre set önerisi olur (§6.1). Bekleyen fazladan set bitirmeyi engellemez; satırdaki ✕ ya da
 * paneldeki "Kaldır" bırakır.
 */
export function WorkoutScreen({
  clientId,
  dayParam,
  programParam = null,
  finishOnOpen,
  heartLimits,
}: {
  clientId: string;
  dayParam: string | null;
  /** Bugün'ün tek seferlik program seçimi (`op_…` ya da `pt`); yoksa kalıcı seçim. */
  programParam?: string | null;
  finishOnOpen: boolean;
  /** Danışanın nabız sınırları (PT'nin girdiği ya da otomatik) ve kaynağı. */
  heartLimits: HeartLimits;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  // Odak adreste (`?hareket=`). `useSearchParams` adres değişimini bir geçişin (transition) içinde görür: işleyiciler
  // ve zamanlayıcılar odağı eşzamanlı kopyadan (`focusRef`) okur; `openFocus` ikisini birlikte yazar.
  const params = useSearchParams();
  const focus = focusOf(params);
  const focusRef = useRef<string | null>(focus);
  const [load, setLoad] = useState<LoadState>({ phase: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [local, setLocal] = useState<LocalWorkout | null>(null);
  const localRef = useRef<LocalWorkout | null>(null);
  const storageWarned = useRef(false);

  const [saving, setSaving] = useState<Saving | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [restTick, setRestTick] = useState<{ key: string; view: RestView } | null>(null);
  const [transition, setTransition] = useState<TransitionView | null>(null);
  const [timerTick, setTimerTick] = useState<{ key: string; view: TimerView } | null>(null);
  const [undoWater, setUndoWater] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  // `finishing`'in güncel kopyası (effect'te yazılır): toast'ın "Geri al"ı atlama anında kurulur, state'i eski kalırdı.
  const finishingRef = useRef(false);
  const [update, setUpdate] = useState<PendingUpdate | null>(null);
  // Alttaki panelde düzenlenen set (kimliği): yalnız gösterilen birimde geçerli (`editOf`), birim değişince düşer.
  const [editing, setEditing] = useState<string | null>(null);
  const [elsewhere, setElsewhere] = useState<{ server: SessionDoc; count: number } | null>(null);
  const [elsewhereBusy, setElsewhereBusy] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [switchOpen, setSwitchOpen] = useState(false);
  /** "Antrenmanı değiştir"de seçilen program ve gün: setli antrenman önce bitirilir, bitiş başarılıysa bu açılır. */
  const switchTarget = useRef<{ program: string; day: string } | null>(null);
  const [swapTarget, setSwapTarget] = useState<SwapTarget | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addBusy, setAddBusy] = useState<string | null>(null);
  const [listHighlight, setListHighlight] = useState<string | null>(null);
  const highlightTimer = useRef<number | undefined>(undefined);
  // Yoklama sheet'i açık mı (`StartCheck` bildirir) ve onu kapatmak: açık katmanın altında geri tuşu (aşağıda).
  const [checkOpen, setCheckOpen] = useState(false);
  const checkRef = useRef<StartCheckHandle>(null);
  // Nabız bandı (Paket C): bağlantı paneli açık mı, yüksek nabız şeridi (uyarının çaldığı nabız; kapatılınca null).
  const [heartOpen, setHeartOpen] = useState(false);
  const [heartAlarm, setHeartAlarm] = useState<number | null>(null);
  const heart = useHeartRate(Boolean(local?.rest));
  // Dinlenme sayacı nabzı kare kare buradan okur (effect nabız değiştikçe yeniden kurulmasın). Band bağlı değilse yok:
  // bugünkü sayaç; koptuysa ölçüm yok, uzayan dinlenme o an biter.
  const restHeart = useRef<RestHeart | undefined>(undefined);
  useEffect(() => {
    restHeart.current = heart.status === 'connected' || heart.status === 'lost' ? { bpm: heart.bpm, recovery: heartLimits.recovery } : undefined;
  });

  const guardUntil = useRef(0);
  const timers = useRef<number[]>([]);
  const waterTimer = useRef<number | undefined>(undefined);
  const bottomRef = useRef<HTMLDivElement>(null);
  const now = useNow(1000);
  const wakeHeld = useWakeLock(load.phase === 'ready');

  /* --- kayıt --- */

  const commit = useCallback(
    (next: LocalWorkout) => {
      localRef.current = next;
      setLocal(next);
      if (!saveLocalWorkout(clientId, next) && !storageWarned.current) {
        storageWarned.current = true;
        toast.warning('Bu tarayıcıda yedeklenemiyor; sekmeyi kapatma.');
      }
    },
    [clientId],
  );

  /**
   * Telefondaki antrenman sunucuda bitti ya da silindi: yerel kopya ve saklanan plan düşer, Bugün tazelenir. Depodan yalnız
   * bu antrenman silinir (`clearLocalWorkout` kimliği karşılaştırır): depo sekmeler arasında ortak, başka sekmenin o arada
   * başlattığı antrenman kalır.
   */
  const release = useCallback(() => {
    const id = localRef.current?.doc.id;
    localRef.current = null;
    if (id) clearLocalWorkout(clientId, id);
    clearWorkoutCache(clientId);
    void queryClient.invalidateQueries({ queryKey: WORKOUT_KEY });
  }, [clientId, queryClient]);

  /**
   * Yoklamanın ayarladığı plan ve belge (`StartCheck`'in `onApply`'ı). Yoklama portalda; ekranın `inert`'i onu kapsamaz,
   * çıkış sürerken de dokunulur. Antrenman bırakıldıysa (`release()`: silinmiş, başka cihazda bitirilmiş, iptal, bitiş; her
   * zorunlu çıkıştan önce) yazılmaz: bırakılan antrenman `localStorage`'a geri yazılır, Bugün'de yeniden "Yarım kalan
   * antrenman" olurdu. Antrenman telefonda kaldıkça ("Ara ver" sürerken de) cevaplar ona yazılır.
   */
  const applyCheck = useCallback(
    (next: LocalWorkout) => {
      if (localRef.current?.doc.id === next.doc.id) commit(next);
    },
    [commit],
  );

  /* --- yardımcılar --- */

  const later = useCallback((ms: number, run: () => void) => {
    timers.current.push(window.setTimeout(run, ms));
  }, []);

  useEffect(
    () => () => {
      for (const id of timers.current) window.clearTimeout(id);
      window.clearTimeout(waterTimer.current);
      window.clearTimeout(highlightTimer.current);
    },
    [],
  );

  useEffect(() => {
    finishingRef.current = finishing;
  }, [finishing]);

  /** Alt panelin dokunuş kilidi: durum değişiminden sonra dokunuş yutulur, alttaki öğeye geçmez. */
  const guard = useCallback((ms: number = WORKOUT.tapGuardMs) => {
    guardUntil.current = Math.max(guardUntil.current, performance.now() + ms);
  }, []);
  const swallow = useCallback((event: React.SyntheticEvent) => {
    if (performance.now() < guardUntil.current) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, []);

  /** Tek `aria-live` bölgesi: aynı metin art arda da okunsun diye önce boşaltılır. */
  const announce = useCallback((text: string) => {
    setAnnouncement('');
    window.requestAnimationFrame(() => setAnnouncement(text));
  }, []);

  // Yüksek nabız: şerit (kendisi `role="alert"`) + titreşim + ses; nabız sınırın 5 altına inince şerit kalkar.
  useHeartAlert(
    heart.bpm,
    heartLimits.alert,
    (bpm) => {
      setHeartAlarm(bpm);
      beep(3, 1175);
      vibrate([200, 100, 200, 100, 200]);
    },
    () => setHeartAlarm(null),
  );

  // Set giriş paneli kapalı mı (danışanın bu cihazdaki tercihi): kapalıyken set tablodaki satırdan girilir.
  const [panelClosed, setPanelClosed] = useEntryPanelClosed();
  // Aşırı yük soruluyorken satırın ✓'u kapalı paneli o set için açar ("rowId:setIndex"): uyarı ve "Düzelt" orada. Tercih
  // değişmez; set kaydedilince (ya da başka sete geçilince) panel yine kapalı.
  const [forcedOpen, setForcedOpen] = useState<string | null>(null);

  const focusLater = useCallback((id: string, ms: number) => later(ms, () => document.getElementById(id)?.focus({ preventScroll: true })), [later]);

  /* --- odak: adres (`?hareket=`), sunucuya gidilmeden --- */

  // Bu sayfa bir odak girdisini liste girdisinin üstüne itti mi (açılış kuralı ya da listede satıra dokunmak). İttiyse
  // geçmişteki her odak girdisinin altında bir liste girdisi vardır (itme yalnız listeden; odaktan odağa
  // `replaceState`): "‹ Liste" ona `history.back()` ile döner. Sayfa odak adresiyle yüklendiyse (yenileme) o girdinin
  // altı bilinmez; o girdi odakta kaldıkça bu sayfa onun üstüne itemez, listeden itmek de onu ileri geçmişten siler.
  const focusPushed = useRef(false);
  // Listeye dönülürken bırakılan hareket: liste çizilince o satıra kaydırılır ve klavye odağı oraya taşınır (aşağıda).
  const leftUnit = useRef<string | null>(null);
  // Listeye dönüş niyeti: klavye odağı yalnız gösterilen bir hareketten listeye dönülünce taşınır ("‹ Liste", geri tuşu,
  // odaktaki hareketi atlayıp kalan olmaması). Yalnız gösterilen hareket bırakıldığında yazılır (`goToList`'te
  // `leaveShown`'ın sonucu, odak eşitleme effect'i, `onDropUnit`), liste effect'i ya da `openFocus` siler. Liste
  // kendiliğinden çizildiyse ya da hiç bırakılmadıysa (açılış, odak bir an geçersiz, ileri tuşuyla atlanmış bir hareketin
  // adresi) yazılmaz: liste zaten görünürken yazılan niyet effect'in bağımlılıklarını değiştirmez, kalır ve sonra (sıra
  // değişince) klavye odağını çalardı.
  const returningToList = useRef(false);
  // "Ara verilsin mi?" korkuluğu kurulu (9. görev): bu sayfa liste işaretini (`?liste=1`) kendi işaretsiz girdisinin üstüne
  // itti. Açılış kuralının effect'i (taze açılış) ya da işaretsiz girdide odak açan `openFocus` yazar (`pushMark`). Kurulu
  // ve adres işaretsizken (geri tuşu listeden işaretsiz girdiye döndü) ekran sorar. Antrenmanın kimliğine bağlı değil:
  // arka plandaki tazeleme (`revalidate`) boş antrenmanı yeni kimlikli belgeyle yeniden kurabilir, girdiler yine bu
  // sayfanın; yalnız "Antrenmanı değiştir" sıfırlar (`restartWith`). Sayfa liste ya da odak adresiyle yüklendiyse
  // (yenileme) kurulmaz: altındaki girdi bu belgenin değil; geri tuşu onu yeniden yükler (işaretsizse açılış kuralı orada
  // yeniden çalışır) ya da sayfadan çıkar (kabul edilen sınır). İlk yükleme de işaretsiz olduğundan "adreste işaret yok"
  // tek başına yetmez: bayrak şart.
  const [armed, setArmed] = useState(false);
  // İşaret itildi; korkuluk adres işaretli çizildikten sonra kurulur (aşağıdaki effect, `pushMark` ve açılış kuralı
  // yazar). Next yamalı `pushState`'in adresini bir geçişte yazar (`startTransition`, `app-router.js`); korkuluk hemen
  // kurulsaydı işaretsiz adresle önce çizilebilir, "Ara verilsin mi?" bir kare açılıp kapanırdı (Bugün'den açılışta
  // kapanış animasyonu görüldü). Öncelik sırasına güvenmek yerine sonucu bekler.
  const armPending = useRef(false);
  // Antrenmandan çıkış sürüyor (`exitTo`: "Ara ver", `leave()`, bitişten sonra özet; ekran birazdan başka sayfaya geçer; adı
  // ilk kullanıcısından): `'here'` bulunulan girdi hedefle değişiyor (dialog'dan ya da korkuluksuz), `'back'` önce işaretsiz
  // girdiye dönülüyor (liste ya da odaktan). İkisinde de "Ara verilsin mi?"nin düğmeleri kilitli; `'back'`te adres bir an
  // işaretsiz olsa da dialog açılmaz (çıkış zaten seçildi). Sürerken ekran `inert`.
  const [pausing, setPausing] = useState<'here' | 'back' | null>(null);
  // `pausing`'in eşzamanlı kopyası ve ekranın bağlı olduğu: ekranın `inert`'i dışında çalışanlar okur (genel Toaster'daki
  // "Geri al"/"Şimdi yap", kendiliğinden geçişin zamanlayıcısı, arka plandaki tazeleme). Çıkılırken ya da ekran kapandıktan
  // sonra (toast Bugün'de de görünür) adrese dokunmazlar: yamalı `pushState`'in `ACTION_RESTORE`'u bekleyen geçişi (Bugün ya da
  // özet) düşürürdü, Bugün'deyken de `workoutHref` Bugün'ün adresine odak iterdi.
  const pausingRef = useRef<'here' | 'back' | null>(null);
  const mountedRef = useRef(false);

  /**
   * Liste işaretini bu sayfanın işaretsiz girdisinin üstüne iter ve korkuluğu kurar (`armed`). `history.state`'e kendi
   * nesnesi yazılmaz (`null`; Next'in yaması kendi alanlarını ekler). "Devam et" de bunu çağırır (`focusPushed`'a dokunmaz:
   * itilen bir liste girdisi, odak değil).
   *
   * Korkuluk adres işaretli çizilince kurulur (`armPending`): hemen kurulsaydı işaretsiz adresle "Ara verilsin mi?" bir
   * kare açılabilirdi.
   */
  const pushMark = useCallback(() => {
    window.history.pushState(null, '', workoutHref(window.location.pathname, window.location.search, { list: true }));
    armPending.current = true;
  }, []);

  /**
   * Gösterilen hareket değişti (başka hareket ya da liste; dokunuşla ya da geri/ileri tuşuyla): süren set sayacı,
   * devrenin istasyon geçişi ve paneldeki set düzenlemesi düşer (o hareketindi; düzenleme kaydedilmemişti). Geçerlilik
   * `listView`'ın kuralı (`validFocus`): geçersiz odak liste sayılır. Taslak zaten yalnız kendi setinde geçerli (`nextSet`). Listeye dönülüyorsa bırakılan hareket not
   * edilir (`leftUnit`) ve tam dinlenme küçülür (`mode: 'mini'`): dinlenme ekranı kilitlemez, listede alt çubuğun
   * üstündeki şeritte sürer ("‹ Liste", geri tuşu, geçersiz odak; odak zaten geçersizse de). Gösterilen bir hareketten
   * listeye dönüldüyse true (`goToList`'in niyeti).
   */
  const leaveShown = useCallback(
    (from: string | null, to: string | null): boolean => {
      const current = localRef.current;
      if (!current || from === to) return false;
      const plan = planOf(current);
      const shownFrom = validFocus(plan, current.doc, from);
      const shownTo = validFocus(plan, current.doc, to);
      let next = current;
      if (shownTo === null && current.rest?.mode === 'full') next = { ...next, rest: { ...acknowledgeRest(current.rest), mode: 'mini' } };
      if (shownFrom !== shownTo) {
        if (shownTo === null) leftUnit.current = shownFrom;
        if (next.timer) next = { ...next, timer: null };
        setTransition(null);
        setEditing(null);
      }
      if (next !== current) commit(next);
      return shownFrom !== null && shownTo === null;
    },
    [commit],
  );

  /* --- çıkış: Bugün'e ya da özete, antrenmanın girdileri geride kalmadan --- */

  // Sürmekte olan çıkışın hedefi; `canStay`: kalınabilir çıkış ("Ara ver"). Zorunlu çıkışta antrenman telefondan düştü.
  const exitTarget = useRef<{ href: string; canStay: boolean } | null>(null);
  const exitListener = useRef<(() => void) | null>(null);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (exitListener.current) window.removeEventListener('popstate', exitListener.current);
    };
  }, []);

  /**
   * Antrenmandan çıkış: "Ara ver" ve `leave()` Bugün'e, başarılı bitiş özete. Hedef işaretsiz girdinin (B) yerine konur:
   * `router.replace` yalnız bulunulan girdiyi değiştirir; listeden ya da odaktan doğrudan çağrılsaydı B ve liste girdisi
   * hedefin altında kalırdı (`B, L, [hedef]`), hedefte geri tuşu oraya inerdi. Antrenman telefonda kaldıysa ("Ara ver") ekran
   * onu yeniden açar ve danışan antrenmana geri çekilir; düştüyse (bitiş, iptal, silinme) ekran boş bağlanır ve sıradaki
   * günden yeni, boş bir antrenman başlatırdı (Bugün'de 0 setle "Yarım kalan antrenman"). `push` hiç olmaz: hedefte geri
   * tuşu antrenmana dönerdi.
   *
   * Korkuluk kuruluyken önce işaretsiz girdiye geri gidilir (`pauseSteps`: odakta 2, listede 1; dialog'dan, korkuluksuz ya da
   * odağı bu sayfa itmediyse 0: bulunulan girdi değişir). `history.go` zaman uyumsuz: `replace` gelen `popstate`'te çağrılır.
   * Tek seferlik dinleyici Next'inkinden sonra eklendi, sonra çalışır: o `popstate`'te Next'in kendi geri yüklemesi
   * (`ACTION_RESTORE`) bizim `replace`'imizi ezmez. Hedef çizilmeden gelen başka bir geri yükleme ya da geçiş onu düşürür; bu
   * yüzden çıkılırken ekran `inert`, toast'ların düğmeleri, zamanlayıcılar (kendiliğinden geçiş, bitiş sorusu), tazeleme,
   * geçersiz odak ve açık katmanın geri tuşu adrese dokunmaz (`pausingRef`, `pausing`).
   *
   * Gösterilen hareket önce bırakılır (`leaveShown`, yalnız telefonda; sunucuya bir şey gitmez): süren set sayacı düşer, tam
   * dinlenme küçülür, geri tuşuyla listeye/işaretsiz girdiye dönüşteki gibi. `pausing` 'back' olduğundan işaretsiz adreste
   * "Ara verilsin mi?" açılmaz.
   *
   * `replace` verildikten sonra ekran hâlâ bağlıyken gelen bir `popstate` (geri/ileri tuşu) onu düşürmüştür. Kalınabilir
   * çıkış biter (`pausing` düşer; yoksa ⋯ "Ara ver" sessizce bir şey yapmaz, listeden geri sormaz, dialog kilitli kalırdı);
   * zorunlu çıkış bulunulan girdiden yeniden başlar (ekranda kalacak antrenman yok). Başka sayfaya dönülürse ekran kapanır ve
   * dinleyici kaldırılır; Next'in geri yüklemesi o `popstate`'te henüz çizilmediyse dinleyici yol değiştiği için bir şey
   * yapmaz (yoksa işaretsiz girdinin dialog'u bir kare açılabilirdi). `popstate` işleyicisinde eklenen dinleyici o olayda
   * çağrılmaz (DOM: dinleyiciler dağıtımın başında kopyalanır, "inner invoke"): `replace`'i veren olay sıfırlamayı tetiklemez.
   *
   * Bağlantı yokken kalınabilir çıkış yapılmaz: hedef sunucu ister, Next ağ hatasında tam yüklemeye düşer ve tarayıcının
   * çevrimdışı sayfası açılırdı (service worker yok). Ekran sürer, işaretsiz girdideysek (dialog'dan) işaret geri konur, toast
   * söyler. Zorunlu çıkış bağlantısız da yapılır: çoğu sunucunun yanıtından hemen sonra gelir (silinmiş, başka cihazda
   * bitirilmiş, bitiş, iptalin DELETE'i, "Setler eklendi"); bağlantısız olabilenlerde (hiç gönderilmemiş antrenmanın iptali,
   * "Ekleme", "Bugün yük yok") tarayıcının çevrimdışı sayfası açılır. Kaybolan bir şey yok (antrenman zaten düştü, yoklama
   * telefonda kuyrukta); bağlantı gelince yenileme Bugün'ü açar.
   *
   * Korkuluk yoksa (sayfa liste ya da odak adresiyle yüklendi) altındaki girdi bilinmez: bulunulan girdi değişir (kabul).
   * `replace` ileri geçmişi silmez: tarayıcının ileri tuşu antrenmanın girdilerine dönebilir (kabul; antrenman düştüyse
   * açılıştaki bayat girdi denetimi Bugün'e döner). Çıkılırken ikinci çağrı yeniden geri gitmez; zorunluysa çıkışı zorunlu
   * yapar (ara verirken antrenman silindi).
   */
  const exitTo = useCallback(
    (href: string, { canStay }: { canStay: boolean }) => {
      // Ekran kapandıysa (yoldaki isteğin yanıtı sonra geldi) danışan başka sayfada: o sayfa değiştirilmez.
      if (!mountedRef.current) return;
      const pending = exitTarget.current;
      if (pending) {
        if (!canStay) exitTarget.current = { ...pending, canStay: false };
        return;
      }
      if (canStay && !navigator.onLine) {
        if (!addressMarked()) pushMark();
        toast('Bağlantı yok; Bugün bağlantı gelince açılır.', { description: 'Antrenmanın telefonunda kayıtlı.' });
        return;
      }
      exitTarget.current = { href, canStay };
      leaveShown(focusRef.current, null);
      const path = window.location.pathname;
      const once = (run: () => void) => {
        const listener = () => {
          exitListener.current = null;
          run();
        };
        exitListener.current = listener;
        window.addEventListener('popstate', listener, { once: true });
      };
      const replace = () => {
        router.replace(href);
        once(() => {
          if (window.location.pathname !== path) return;
          if (!exitTarget.current?.canStay) return start();
          exitTarget.current = null;
          pausingRef.current = null;
          startTransition(() => setPausing(null));
        });
      };
      const start = () => {
        const steps = pauseSteps(window.location.search, { armed, focusPushed: focusPushed.current });
        const mode = steps === 0 ? 'here' : 'back';
        pausingRef.current = mode;
        setPausing(mode);
        if (steps === 0) return replace();
        once(replace);
        window.history.go(-steps);
      };
      start();
    },
    [armed, router, leaveShown, pushMark],
  );

  /**
   * Antrenman telefondan düşüyor (sunucuda silinmiş ya da başka cihazda bitirilmiş, bitişin 410'u, iptal, "Setler eklendi",
   * "Ekleme", "Bugün yük yok"): yerel kopya bırakılır, Bugün açılır (zorunlu çıkış: bağlantısız da yapılır, geri/ileri tuşu
   * düşürürse yeniden denenir).
   */
  const leave = useCallback(
    (message: string, kind: 'success' | 'info' = 'success') => {
      release();
      // Antrenman bitti: nabız bandı kesilir, yeniden deneme durur.
      disconnectHeartRate();
      exitTo('/me', { canStay: false });
      if (kind === 'success') toast.success(message);
      else toast(message);
    },
    [release, exitTo],
  );

  const { outbox, problem, online } = useWorkoutOutbox({
    localRef,
    commit,
    onGone: () => leave('Bu antrenman silinmiş.', 'info'),
    onFinishedElsewhere: (server) => {
      const current = localRef.current;
      const count = current ? setsMissingOn(current.doc, server) : 0;
      if (count === 0) leave('Bu antrenman başka bir cihazda bitirildi.', 'info');
      else setElsewhere({ server, count });
    },
  });

  /**
   * Hareketin odağını açar. Listedeyken (adreste odak yok) `pushState`, odaktayken `replaceState`: geri tuşu odaktan hep
   * listeye döner, odaktan odağa değil. Next yerel geçmiş çağrılarını yönlendiriciye bağlar (`useSearchParams`
   * eşitlenir), ağ isteği yok. `focusRef` aynı anda yazılır. Listeye dönmek `goToList`.
   *
   * Listeden itilen odağın altında hep işaretli liste girdisi olur: adreste işaret yoksa önce o itilir (`pushMark`, korkuluk
   * da kurulur). Yoksa "‹ Liste" ve geri tuşu işaretsiz girdiye dönerdi ve orası "Ara verilsin mi?" diye sorardı (ya da
   * soruyu taşıyan dialog odağın üstünde kalırdı). İşaretsiz girdide liste şunlarla açık kalır: sayfa odak adresiyle
   * yüklenip "‹ Liste" odağı `replaceState` ile düşürdü; ya da "Ara verilsin mi?" açıkken altındaki bir toast'ın düğmesi
   * ("Geri al", "Şimdi yap") odak açtı. Dialog'un kendisi kapatılınca "Devam et" sayılır (işaret geri konur).
   */
  const openFocus = useCallback(
    (key: string) => {
      leaveShown(focusRef.current, key);
      focusRef.current = key;
      returningToList.current = false;
      if (addressFocus() !== null) {
        window.history.replaceState(null, '', workoutHref(window.location.pathname, window.location.search, { focus: key }));
        return;
      }
      if (!new URLSearchParams(window.location.search).has(LIST_PARAM)) pushMark();
      window.history.pushState(null, '', workoutHref(window.location.pathname, window.location.search, { focus: key }));
      focusPushed.current = true;
    },
    [leaveShown, pushMark],
  );

  /**
   * Odaktan listeye ("‹ Liste", geçersiz odak, odaktaki hareketi atlayıp kalan olmaması): odak girdisinin altında bu sayfanın
   * ittiği liste girdisi varsa `history.back()` (geri tuşuyla aynı yer; iki liste girdisi yan yana birikmez), yoksa
   * (sayfa odak adresiyle yüklendi) odak `replaceState` ile düşer. Kopya hemen yazılır; `back()` adresi `popstate`'te
   * değiştirir. Zaten listeye dönülüyorsa (kopya boş) ikinci kez geri gidilmez.
   */
  const goToList = useCallback(() => {
    const from = focusRef.current;
    const left = leaveShown(from, null);
    focusRef.current = null;
    if (from === null) return;
    if (left) returningToList.current = true;
    if (addressFocus() === null) return;
    if (focusPushed.current) window.history.back();
    else window.history.replaceState(null, '', workoutHref(window.location.pathname, window.location.search, { focus: null }));
  }, [leaveShown]);

  // Adres başka yoldan değişti (geri/ileri tuşu, `router.replace`): eşzamanlı kopya yetişir; gösterilen hareket
  // değiştiyse sayaç ve geçiş düşer, canlı bölge kipi söyler ("Liste" ya da hareketin adı) ve klavye odağı taşınır
  // (harekete burada; listeye liste çizilince, aşağıdaki effect).
  // `openFocus` ve `goToList` kopyayı adresten önce yazar: adres yetişince ikisi aynıdır, burada bir şey olmaz.
  // Bu effect geçersiz odak effect'inin (aşağıda, `view`'dan sonra) ÜSTÜNDE kalmalı: effect'ler yazılış sırasıyla
  // çalışır; geri tuşu geçersiz bir odağa dönerse kopya önce burada yetişir, o effect ancak o zaman
  // (`focusRef.current === focus`) odağı adresten düşürür.
  useEffect(() => {
    const previous = focusRef.current;
    focusRef.current = focus;
    const current = localRef.current;
    if (previous === focus || !current) return;
    leaveShown(previous, focus);
    const plan = planOf(current);
    const shown = validFocus(plan, current.doc, focus);
    if (shown === validFocus(plan, current.doc, previous)) return;
    const unit = shown ? cursorOf(plan, current.doc).units.find((item) => item.key === shown) : undefined;
    returningToList.current = !unit;
    if (unit) {
      announce(unitTitle(plan, current.doc, unit));
      focusLater('exercise-title', DURATION.base);
    } else {
      announce('Liste');
    }
  }, [focus, leaveShown, announce, focusLater]);

  /* --- açılış: telefondaki antrenman → taze plan → sunucu → son okunan plan --- */

  // `?bitir=1`'in bitiş sorusu ekran başına bir kez açılır: arka plandaki tazeleme antrenmanı yeniden kurunca (`adopt` yine
  // çalışır) danışanın kapattığı sheet yeniden açılmaz.
  const finishShown = useRef(false);
  useEffect(() => {
    let cancelled = false;
    let announced = false;
    const adopt = (next: LocalWorkout) => {
      commit(next);
      setLoad({ phase: 'ready' });
      if (finishOnOpen && !finishShown.current) {
        finishShown.current = true;
        setFinishOpen(true);
      }
      outbox.schedule();
    };
    const begin = (data: WorkoutResponse) => {
      // Önceki sürümün sakladığı yanıtta muadil planları ve onay bilgisi yok.
      const options = { extras: data.extras ?? {}, pain: data.health?.pain ?? false };
      if (data.active && data.day) return adopt(createLocalWorkout(data.active, data.day, data.active, options));
      if (!data.day) return setLoad({ phase: 'empty', problem: data.problem });
      const doc = newSessionDoc(data.day, { today: data.today, now: new Date(), writer: writerId() });
      adopt(createLocalWorkout(doc, data.day, null, options));
      // Başka program seçildi (Faz 3): o gün atanmış program varken antrenöre bitişte bildirilir (`other_day`); kendi programda yok.
      if (!announced && data.day.source !== 'own' && data.day.plannedDayId && data.day.plannedDayId !== data.day.dayId) {
        announced = true;
        toast(`${data.day.dayName} seçildi`, {
          description: data.day.plannedDayName ? `Bugün ${data.day.plannedDayName} planlıydı; antrenörüne bildirilecek.` : 'Antrenörüne bildirilecek.',
        });
      }
    };
    const query = [
      ...(dayParam ? [`day=${encodeURIComponent(dayParam)}`] : []),
      ...(programParam ? [`program=${encodeURIComponent(programParam)}`] : []),
    ].join('&');
    const url = `/api/me/workout${query ? `?${query}` : ''}`;
    /**
     * Saklanan planla açılan ve henüz hiçbir şey kaydedilmemiş antrenman arka planda aynı günün taze planıyla
     * karşılaştırılır: PT o arada programı kaydettiyse (ya da başka cihazda yarım antrenman varsa) güncel
     * hâliyle yeniden kurulur. Bir şey kaydedildiyse antrenman başladığı günün anlık görüntüsüyle sürer.
     */
    const revalidate = () => {
      const current = localRef.current;
      if (!current || !untouched(clientId, current)) return;
      fetchJson<WorkoutResponse>(`/api/me/workout?day=${encodeURIComponent(current.plan.dayId)}&program=${encodeURIComponent(planProgram(current.plan))}`)
        .then((data) => {
          const latest = localRef.current;
          // Çıkılırken yeniden kurulmaz: açılış kuralı işareti ve odağı yeniden iter, bekleyen geçiş düşerdi.
          if (cancelled || pausingRef.current || !latest || latest.doc.id !== current.doc.id || !untouched(clientId, latest) || !planChanged(latest, data)) return;
          begin(data);
        })
        .catch(() => undefined);
    };
    const cleanup = () => {
      cancelled = true;
    };

    const existing = readLocalWorkout(clientId);
    if (existing) {
      adopt(existing);
      revalidate();
      return cleanup;
    }
    // Bayat girdi: adres işaretli (`?liste=1`, `?hareket=`) ama ne telefonda antrenman var ne sunucuda yarım antrenman. Girdi
    // biten ya da bırakılan bir antrenmanın (geri/ileri tuşu: `exitTo` ileri geçmişi silmez; eski sürümün çıkışları işaretsiz
    // ve liste girdisini de geride bırakırdı). Yeni antrenman başlatılmaz (varsayılan programdan boş antrenman, Bugün'de 0 setle
    // "Yarım kalan antrenman" olurdu), Bugün açılır. Yenilemede ve ara verdikten sonra ileri tuşunda antrenman telefonda,
    // başka cihazın yarım antrenmanı sunucuda (`active`), "Antrenmanı değiştir"in adresi işaretsiz: üçü de buraya düşmez.
    // Bağlantı yoksa (saklanan yanıt) Bugün açılamaz (Next tam yüklemeye düşer, tarayıcının çevrimdışı sayfası): ekran söyler.
    const stale = addressMarked();
    const open = (data: WorkoutResponse, online: boolean) => {
      if (!stale || data.active) begin(data);
      else if (online) exitTo('/me', { canStay: false });
      else setLoad({ phase: 'error', message: 'Bağlantı yok; bu antrenman telefonunda kayıtlı değil.' });
    };
    const cached = readWorkoutCache(clientId);
    // Saklanan yanıt bu açılışın günü mü: istenen gün ya da gün istenmediyse sunucunun varsayılan günü (`nextDayId`,
    // Faz 3: bugünün ya da sıradaki atanmış program); "Değiştir"le çekilmiş başka program sonraki olağan başlangıçta
    // kullanılmaz.
    // Program da aynı olmalı: tek seferlik seçimde istenen program, yoksa kalıcı seçim (`docs/design/kendi-program.md` §2.6).
    const sameProgram = (data: WorkoutResponse) =>
      data.active !== null || (programParam ? responseProgram(data) === programParam : !data.selection?.oneOff);
    const matches = (data: WorkoutResponse) =>
      sameProgram(data) &&
      (dayParam ? data.day?.dayId === dayParam : data.active !== null || !data.day || data.day.dayId === (data.program?.nextDayId ?? data.day.dayId));
    const usable = cached && matches(cached.data) ? cached : null;
    if (usable && Date.now() - usable.at < CACHE_FRESH_MS) {
      open(usable.data, navigator.onLine);
      revalidate();
      return cleanup;
    }
    fetchJson<WorkoutResponse>(url)
      .then((data) => {
        if (cancelled) return;
        saveWorkoutCache(clientId, data);
        open(data, true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // Çevrimdışı: son okunan planla başlanır.
        if (usable) open(usable.data, false);
        else setLoad({ phase: 'error', message: error instanceof ApiError ? error.message : 'Antrenman açılamadı.' });
      });
    return cleanup;
    // `finishOnOpen`, `outbox` ve `exitTo` açılışta bir kez okunur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, dayParam, programParam, attempt]);

  /*
   * Açılış kuralı (antrenman başına bir kez, `doc.id`): adreste ne liste işareti ne odak varsa (Bugün'den, yeni
   * açılışta) önce liste işareti `pushState` ile itilir, altında işaretsiz girdi kalır ve korkuluk kurulur (`armed`:
   * listeden geri "Ara verilsin mi?"); ardından hepsi bitmediyse "şu an"ın odağı da itilir (yeni antrenmanda ilk hareket;
   * yarımda yarım bırakılan ya da sıradaki, `listView`). Hepsi bittiyse ya da bitiş sorusuyla açıldıysa (`?bitir=1`;
   * `workoutHref` onu düşürür, sheet `adopt`'ta açılır) yalnız liste: sheet kapanınca liste görünür. Adres liste ya da
   * odak taşıyorsa (yenileme, geri/ileri; ya da arka plandaki tazeleme boş antrenmanı yeni kimlikli belgeyle yeniden kurdu)
   * adrese ve korkuluğa dokunulmaz (kurulu değilse kurulmaz, kuruluysa kalır), yalnız süreli set sayacının kuralı adresin
   * gösterdiği harekete uygulanır; karar yine bu antrenman için verilmiş sayılır. "Antrenmanı değiştir" bayrağı (`opened`)
   * ve korkuluğu sıfırlar (`restartWith`): yeni antrenman da Bugün'den açılmış gibi odakla açılır.
   *
   * Chrome'un geçmiş müdahalesi: kullanıcı etkileşimi olmadan itilen girdiler tarayıcının geri tuşunda atlanabilir. Sert
   * yüklemede (yalnız yenileme değil: işaretsiz adresin yenilenmesi, yer imi, yeni sekme, ana ekran kısayolu, bildirim, adres
   * çubuğu) bu effect sayfa henüz dokunuş almadan iter; o zaman geri tuşu liste ve işaretsiz girdiyi atlayıp sayfadan
   * çıkabilir (odaktan listeye bile dönmeyebilir; sonradan dokunuş Chrome'da işareti kaldırabilir). Bugün'den dokunuşla
   * gelmek (yumuşak geçiş) de yetmeyebilir: dokunuşun etkileşimini Next'in `/me/antrenman` için yaptığı `pushState`
   * harcayabilir, bu effect'in itmeleri o zaman yine atlanabilir. Doğrulanmadı: gerçek geri tuşu/hareketiyle denenmeli
   * (Puppeteer `goBack`, CDP ve `history.back()` müdahaleyi atlar). Kabul edilen sınır; itmeyi ilk dokunuşa ertelemek
   * açılışı (odakla açılma) bozardı.
   *
   * Neden ilk mount effect'inde değil: Next'in `pushState`/`replaceState` yaması (`app-router.js`) ata bileşenin
   * (AppRouter) `useEffect`'inde kurulur; sert yüklemede çocuğun mount effect'i ondan önce çalışır ve yamasız
   * `pushState` Next'in durumunu (`__NA`, ağaç) girdiye yazmaz, geri dönüşte Next o girdiyi tanımaz. Bu effect ise
   * `load` 'ready' olunca çalışır: 'ready' en erken mount effect'indeki `setLoad`'ın yeniden çiziminde gelir ve React o
   * yeniden çizimden önce mount commit'inin bütün effect'lerini bitirir (AppRouter aynı commit'teyse onunki dahil;
   * değilse onunki zaten önce çalıştı). Yama kurulu olduğundan `setTimeout` ertelemesi gerekmez. İki itme aynı tick'te:
   * Next'in ikinci `ACTION_RESTORE`'u ilkini atar (eylem kuyruğu, `app-router-instance.js`), adres son itilene
   * eşitlenir; ilk girdi kendi adresiyle kalır.
   *
   * Karar verilene kadar ekran iskeletle bekler (`awaitingOpening`): 'ready' çizimi effect'ten önce boyanır, liste bir
   * kare görünüp odağa atlardı. `setOpened` ile Next'in adres güncellemesi aynı çizime düşer (ikisi de normal
   * öncelikli; Next'inki mikro görevde, React'in çizim görevinden önce).
   */
  const [opened, setOpened] = useState<string | null>(null);
  const openingDoc = load.phase === 'ready' ? (local?.doc.id ?? null) : null;
  const awaitingOpening = openingDoc !== null && opened !== openingDoc && !params.has(LIST_PARAM) && !params.has(FOCUS_PARAM);
  useEffect(() => {
    const current = localRef.current;
    if (!openingDoc || !current || opened === openingDoc) return;
    // Karar antrenman başına bir kez verilir ve iskeleti kaldırır; adres tarayıcıdan (useSearchParams geçişte gecikir).
    setOpened(openingDoc);
    const address = new URLSearchParams(window.location.search);
    const fresh = !address.has(LIST_PARAM) && !address.has(FOCUS_PARAM);
    const plan = planOf(current);
    const list = listView(plan, current.doc);
    // Açılan hareket: yeni açılışta "şu an" (hepsi bittiyse ya da bitiş sorusuyla açıldıysa yok); adres liste ya da odak
    // taşıyorsa (yenileme, geri/ileri) adresin gösterdiği (`validFocus`; liste işaretinde yok).
    const target = fresh ? (finishOnOpen || list.allDone ? null : list.current) : validFocus(plan, current.doc, focusOf(address));
    // Telefonda kalmış süreli set sayacı yalnız açılan hareketin sıradaki setindeyse sürer (bip boşuna çalmasın): listede
    // ve başka hareketin odağında yenilenince de düşer.
    const next = target ? nextSet(plan, current.doc, current.draft, target) : null;
    if (current.timer && !(next && current.timer.rowId === next.rowId && current.timer.setIndex === next.setIndex)) commit({ ...current, timer: null });
    if (!fresh) return;
    window.history.pushState(null, '', workoutHref(window.location.pathname, window.location.search, { list: true }));
    // Korkuluk adres işaretli çizilince kurulur (`armPending`): "Ara verilsin mi?" bir kare bile işaretsiz adresle açılmaz.
    armPending.current = true;
    if (!target) return;
    focusRef.current = target;
    focusPushed.current = true;
    window.history.pushState(null, '', workoutHref(window.location.pathname, window.location.search, { focus: target }));
  }, [openingDoc, opened, finishOnOpen, commit]);

  // Bekleyen korkuluk (`armPending`): adres işaretli çizildi, artık kurulabilir.
  useEffect(() => {
    if (!armPending.current || !(params.has(LIST_PARAM) || params.has(FOCUS_PARAM))) return;
    armPending.current = false;
    setArmed(true);
  }, [params]);

  // Ses bağlamı ilk dokunuşta açılır: sayfa dinlenmenin ortasında yenilendiyse de bitiş çalsın.
  useEffect(() => {
    const unlock = () => unlockAudio();
    document.addEventListener('pointerdown', unlock, { capture: true, once: true });
    return () => document.removeEventListener('pointerdown', unlock, { capture: true });
  }, []);

  // Toast'lar alt panelin üstünde çıksın (telefonda bildirimler altta, `ui/sonner.tsx`).
  useEffect(() => {
    const element = bottomRef.current;
    if (!element) return;
    const style = document.documentElement.style;
    const observer = new ResizeObserver(() => style.setProperty('--dock-clearance', `${element.offsetHeight + 8}px`));
    observer.observe(element);
    return () => {
      observer.disconnect();
      style.removeProperty('--dock-clearance');
    };
  }, [load.phase, awaitingOpening]);

  /* --- dinlenme sayacı: kare kare, zaman damgasından --- */

  const restKey = local?.rest ? `${local.rest.setId}@${local.rest.startedAt}` : null;
  const handleRestEvents = useCallback(
    (events: RestEvent[], heartHigh: boolean) => {
      for (const event of events) {
        if (event === 'warn') {
          beep(1, 660);
          announce('10 saniye kaldı');
        } else if (event === 'hold') {
          // Süre doldu ama nabız yüksek: sessiz uzar, ekranda "Nabzın 120'ye inince devam".
          announce('Nabzın yüksek; dinlenme uzuyor.');
        } else {
          beep(3);
          vibrate([80, 60, 80]);
          if (event === 'end') {
            announce(heartHigh ? 'Dinlenme bitti. Nabız hâlâ yüksek.' : 'Dinlenme bitti. Hazırsın.');
            guard();
          }
        }
      }
    },
    [announce, guard],
  );

  // Görünüm hangi dinlenmenin: dinlenme bitince (ya da yenisi başlayınca) eskisinin görünümü kendiliğinden düşer.
  const restView = restTick && restTick.key === restKey ? restTick.view : null;
  useEffect(() => {
    if (!restKey) return;
    let frame = 0;
    let shown = '';
    const loop = () => {
      const current = localRef.current;
      if (!current?.rest) return;
      const tick = tickRest(current.rest, Date.now(), restHeart.current);
      const heartHigh = tick.timer.heartHigh === true;
      if (tick.events.length > 0) handleRestEvents(tick.events, heartHigh);
      if (tick.timer !== current.rest) commit({ ...current, rest: tick.timer });
      const seconds =
        tick.state === 'ended'
          ? Math.floor(tick.overrunMs / 1000)
          : tick.state === 'hold'
            ? Math.floor(-tick.remainingMs / 1000)
            : Math.ceil(tick.remainingMs / 1000);
      const pending = alarmPending(tick.timer);
      const key = `${tick.state}:${seconds}:${pending}:${heartHigh}`;
      if (key !== shown) {
        shown = key;
        setRestTick({ key: restKey, view: { state: tick.state, seconds, alarmPending: pending, heartHigh } });
      }
      frame = window.requestAnimationFrame(loop);
    };
    loop();
    return () => window.cancelAnimationFrame(frame);
  }, [restKey, commit, handleRestEvents]);

  /* --- süreli set sayacı ve devrenin istasyon geçişi: zaman damgasından --- */

  const timerKey = local?.timer ? `${local.timer.rowId}#${local.timer.setIndex}@${local.timer.startedAt}` : null;
  const timerView = timerTick && timerTick.key === timerKey ? timerTick.view : null;
  useEffect(() => {
    if (!timerKey) return;
    let frame = 0;
    let shown = '';
    const loop = () => {
      const current = localRef.current;
      if (!current?.timer) return;
      const tick = tickSetTimer(current.timer, Date.now());
      if (tick.events.length > 0) {
        beep(1, 990);
        vibrate(20);
        announce('Hedefe ulaştın');
      }
      if (tick.timer !== current.timer) commit({ ...current, timer: tick.timer });
      const key = `${tick.seconds}:${tick.phase}`;
      if (key !== shown) {
        shown = key;
        setTimerTick({ key: timerKey, view: { seconds: tick.seconds, toMin: tick.toMin, fraction: tick.fraction, phase: tick.phase } });
      }
      frame = window.requestAnimationFrame(loop);
    };
    loop();
    return () => window.cancelAnimationFrame(frame);
  }, [timerKey, commit, announce]);

  // Geçiş bitince tek kısa bip (geç fark edildiyse sessiz); tam dinlenme değil, alarm yok.
  useEffect(() => {
    if (!transition) return;
    const id = window.setTimeout(() => {
      setTransition(null);
      if (Date.now() - transition.endsAt <= LATE_MS) beep(1, 660);
    }, Math.max(0, transition.endsAt - Date.now()));
    return () => window.clearTimeout(id);
  }, [transition]);

  const updateRest = useCallback(
    (change: (rest: RestTimer) => RestTimer | null) => {
      const current = localRef.current;
      if (!current?.rest) return;
      commit({ ...current, rest: change(current.rest) });
    },
    [commit],
  );

  /**
   * Dinlenme açılır: odakta tam panel; listede (kendiliğinden geçişten önce "‹ Liste"ye basıldı) küçük, listeyi örtmez,
   * alt çubuğun üstündeki şeritte sayar.
   */
  const openRest = useCallback(
    (setId: string, seconds: number) => {
      const current = localRef.current;
      if (!current) return;
      const inList = validFocus(planOf(current), current.doc, focusRef.current) === null;
      const rest = startRest(setId, seconds, Date.now());
      commit({ ...current, rest: inList ? { ...rest, mode: 'mini' } : rest, restCount: current.restCount + 1 });
      guard();
      if (!inList) focusLater('rest-title', DURATION.base);
    },
    [commit, guard, focusLater],
  );

  /**
   * Dinlenmeden çıkınca (bitti ya da küçüldü) klavye odağı: listede listenin başlığı; odakta "Set bitti" (süreli sette
   * sayarken "Bitir"), o yoksa (biten hareket: "Bu hareket bitti" paneli) hareketin başlığı. Hedef çalışma anında seçilir:
   * o arada kip değişmiş olabilir; odak bir an geçersizse liste çizilidir.
   */
  const focusAfterRest = useCallback(
    (ms: number) =>
      later(ms, () => {
        const ids = focusRef.current === null ? [LIST_TITLE_ID] : ['set-done', ROW_DONE_ID, 'exercise-title', LIST_TITLE_ID];
        for (const id of ids) {
          const element = document.getElementById(id);
          if (element) {
            element.focus({ preventScroll: true });
            return;
          }
        }
      }),
    [later],
  );

  // Dinlenme bitti ("Atla", "Sonraki sete geç"; listede şeritteki "Atla").
  const endRest = useCallback(() => {
    updateRest(() => null);
    guard();
    focusAfterRest(DURATION.fast);
  }, [updateRest, guard, focusAfterRest]);

  /* --- görünüm --- */

  const view = useMemo(() => {
    if (!local) return null;
    const plan = planOf(local);
    const doc = local.doc;
    // Odak yoksa liste. Geçersiz odak (birim günde yok, atlandı ya da plan dışı kayıt: kartın satırı yok) bir an bile
    // çizilmez: liste çizilir, effect adresten düşürür (`listView`'ın kuralı). Geçerli odakta kartın satırı hep var.
    const shownFocus = validFocus(plan, doc, focus);
    const list = listView(plan, doc, shownFocus);
    const cursor = cursorOf(plan, doc, shownFocus);
    const next = nextSet(plan, doc, local.draft, shownFocus, local.drafts);
    // Kaydedilirken kart ve panel az önce kaydedilen seti gösterir (✓ önce satırda), sonra sıradakine geçer.
    // Odaktaki birimde set kalmadıysa (biten hareket açıldı) kart yine o birimin: setleri ve tablosu görünür.
    const shown = saving?.next ?? next;
    const unitKey = shown?.unitKey ?? shownFocus;
    const unit = unitKey ? cursor.units.find((item) => item.key === unitKey) : undefined;
    // Panelde düzenlenen set: kart onun satırının tablosunu gösterir (grupta şu anki üye başkası olabilir; dinlenmenin
    // "Düzenle"si), şerit onun satırında.
    const edit = editing && shownFocus && !saving ? editOf(plan, doc, editing, shownFocus) : null;
    const rowId = edit?.row.rowId ?? shown?.rowId ?? (unit ? restingRowOf(unit, doc) : null);
    const row = rowId ? (plan.rows[rowId] ?? null) : null;
    return {
      plan,
      doc,
      focus: shownFocus,
      list,
      cursor,
      next,
      // Kendiliğinden geçişin açacağı birim (odaktaki hariç; listede "Devam et"inki): "Sıradaki" satırı, biten hareketin
      // birincil düğmesi ve dinlenmenin "Sıradaki"si. Başka birimde bekleyen fazladan set sayılmaz.
      following: nextUnitAfter(plan, doc, shownFocus),
      // "‹ Önceki": listede gösterilen birimin önündeki açılabilen birim (ilk birimde yok).
      previous: shownFocus ? previousUnitBefore(plan, doc, shownFocus) : null,
      edit,
      unitKey,
      row,
      sets: row ? setViews(plan, doc, row.rowId) : [],
      group: unitKey ? groupView(plan, doc, unitKey, shown) : null,
      warmups: row ? warmupViews(plan, doc, row.rowId) : [],
      setupNote: row ? setupNoteOf(plan, doc, row.rowId) : undefined,
    };
  }, [local, saving, focus, editing]);

  // Adresteki odak geçersiz (başka cihazda silindi, adres elle değişti, birim atlandı, plan dışı kayıt): listeye
  // dönülür (`goToList`: altında bu sayfanın liste girdisi varsa geri, yoksa `replaceState`). Odak bu arada yine
  // değiştiyse (`openFocus` ya da `goToList` kopyayı yazdı, adres henüz çizilmedi) dokunulmaz. Çıkılırken de dokunulmaz
  // (`exitTo`: adres Bugün'e ya da özete gidiyor); çıkış düşerse effect yeniden çalışır. Odak eşitleme effect'inin
  // altında kalmalı (yukarıda).
  useEffect(() => {
    if (pausing || !view || !focus || view.focus !== null || focusRef.current !== focus) return;
    goToList();
  }, [pausing, view, focus, goToList]);

  // Odaktan listeye dönüldü ("‹ Liste", geri tuşu, geçersiz odak, odaktaki hareketi atlayıp kalan olmaması): liste
  // çizilince az önce bırakılan hareketin satırına kaydırılır ve klavye odağı oraya taşınır (yoksa "şu an" satırı, o da
  // yoksa başlık). Sabit bir zamanlayıcı değil: `history.back()` adresi `popstate`'te, Next de bir geçişte günceller;
  // liste ne zaman çizilirse o zaman. Niyetle (`returningToList`): açılışta (iskeletten listeye) ve odak bir an geçersiz
  // kalıp liste kendiliğinden çizildiğinde taşınmaz. Tam dinlenme paneli listeyi örtüyorsa (`inert`) küçülene kadar
  // bekler (geri tuşunda küçültme odak eşitleme effect'inde, liste çizildikten sonra yazılır).
  const shownMode = load.phase === 'ready' && !awaitingOpening && view ? (view.focus === null ? 'list' : 'focus') : null;
  const listCurrent = view?.list.current ?? null;
  // Tam dinlenme paneli açık: altındaki kart, giriş paneli ya da liste erişilemez (ekran okuyucu, klavye).
  const covered = Boolean(local?.rest && local.rest.mode === 'full' && restView);
  useEffect(() => {
    if (shownMode !== 'list' || !returningToList.current || covered) return;
    returningToList.current = false;
    const left = leftUnit.current;
    leftUnit.current = null;
    const row = (key: string | null) => (key ? document.getElementById(listRowId(key)) : null);
    const target = row(left) ?? row(listCurrent) ?? document.getElementById(LIST_TITLE_ID);
    target?.scrollIntoView({ block: 'center' });
    target?.focus({ preventScroll: true });
  }, [shownMode, listCurrent, covered]);

  /* --- işler --- */

  /**
   * "Set bitti" (süreli sette "Bitir ■": geçen saniye). Bitiş (ya da iptal, değiştirme) yoldayken set yazılmaz: belge
   * gönderildi, başarıda yerel kopya düşer ve set kaybolurdu (ekran o arada zaten `inert`; bu, ekranın dışından çağrılara).
   */
  const onDone = useCallback(
    (seconds?: number) => {
      const current = localRef.current;
      if (!current || saving || finishingRef.current) return;
      // Set yazmak günün etkin planını değiştirmez (muadil ve eklenenler aynı): önce ve sonra aynı plan.
      const plan = planOf(current);
      const focused = focusRef.current;
      const next = nextSet(plan, current.doc, current.draft, focused, current.drafts);
      if (!next) return;
      unlockAudio();
      const row = plan.rows[next.rowId];
      const value = seconds ?? next.value;
      // İnsan sınırı: bu sürede bu mesafe yapılamıyorsa set yazılmaz, nedeni söylenir ("1 saniyede 1000 metre").
      const speedIssue = row?.cardio ? cardioSpeedIssue(row.cardio, { seconds: value, distanceM: next.distanceM }) : null;
      if (speedIssue) {
        toast.error(speedIssue);
        announce(speedIssue);
        return;
      }
      // Aşırı yük: "Onayla · Set bitti" (ilk kez) ya da bu harekette zaten onaylanmış.
      const overload = overloadState(plan, current.doc, next, next.kg) !== 'none';
      const { doc, setId } = logSet(plan, current.doc, {
        rowId: next.rowId,
        setIndex: next.setIndex,
        kg: next.kg,
        value,
        distanceM: next.distanceM,
        inclinePct: next.inclinePct,
        overload,
        extra: next.extra === true,
        stamp: stampOf(current),
      });
      const achievement = row?achievementNotice(current.doc,doc,row,row.achievements,current.achievementSeen):null;
      const after = afterLog(plan, current.doc, doc, focused, next);
      // Birim bitti: açılacak sıradaki birim sırada planı bitmemiş ilk birim (`nextUnitAfter`); başka birimde bekleyen
      // "+ Set ekle" seti sayılmaz (önceki bir hareketin fazladan setine geri dönülmez). Yoksa planın bütün setleri
      // yapıldı (kalan yalnız fazladan set olabilir): bitiş sorusu; fazladan set için hareket listeden açılır.
      const followingKey = after.kind === 'next' ? nextUnitAfter(plan, doc, next.unitKey) : null;
      // Yapılan setin (ve o arada başka cihazda yapılanların) yazılanı düşer; ✓'lanmayan setlerinki kalır.
      const drafts = current.drafts && pendingTyped(plan, doc, current.drafts);
      commit(withChange({ ...current, draft: null, ...(drafts ? { drafts } : {}), rest: null, timer: null, ...(achievement?{achievementSeen:[...(current.achievementSeen??[]),achievement.key]}:{}) }, doc, { send: true }));
      outbox.schedule();
      if(achievement){toast.success(achievement.title,{id:`achievement-${doc.id}-${achievement.key}`,description:`${row?.title} · ${achievement.description}`,duration:6000});if(achievement.kind==='record')vibrate([20,40,20]);}
      setTransition(null);
      setFresh(setId);
      setSaving({ next: { ...next, value } });
      vibrate(10);
      const logged = findSet(doc, setId)?.set;
      announce(`Set ${next.position + 1} kaydedildi${logged ? `: ${setValueText(logged, plan.bodyMassKg)}` : ''}`);

      if (after.kind === 'member') {
        // Grupta turun sıradaki üyesi: dinlenme yok; kart 12 px kayar, devrede istasyon geçişi sayar.
        const following = nextSet(plan, doc, null, focused);
        guard(DURATION.base + WORKOUT.tapGuardMs);
        later(DURATION.base, () => {
          setSaving(null);
          guard();
          if (after.transitionSeconds > 0) setTransition({ endsAt: Date.now() + after.transitionSeconds * 1000, total: after.transitionSeconds });
          const title = following ? plan.rows[following.rowId]?.title : undefined;
          if (title) announce(`Sıradaki: ${title}`);
        });
      } else if (after.kind === 'same') {
        guard(DURATION.base + WORKOUT.tapGuardMs);
        later(DURATION.base, () => {
          setSaving(null);
          if (after.restSeconds > 0) openRest(setId, after.restSeconds);
          else guard();
        });
      } else if (after.kind === 'next' && followingKey) {
        const following = nextSet(plan, doc, null, followingKey);
        // Grupta bütün üyeler: "Romanian Deadlift ve Şınav tamamlandı."
        const unit = cursorOf(plan, doc).units.find((item) => item.key === next.unitKey);
        const names = unit?.members.flatMap((member) => (member.rowId && plan.rows[member.rowId] ? [plan.rows[member.rowId]?.title ?? ''] : [])) ?? [];
        const done = names.length > 0 ? names.join(' ve ') : (row?.title ?? 'Hareket');
        guard(NEXT_REST_MS + WORKOUT.tapGuardMs);
        later(NEXT_SLIDE_MS, () => {
          // Kart sıradaki birime geçer (adres değişir, sıra değişmez), yalnız ekran hâlâ biten birimdeyse: bu arada
          // listeye ya da başka harekete geçildiyse dokunulmaz. Adres ve kopya birlikte denetlenir: geri tuşu adresi
          // hemen değiştirir, kopya (`focusRef`) effect'te yetişir; "‹ Liste" (`goToList`) kopyayı hemen yazar, adres
          // `history.back()`'in `popstate`'inde değişir.
          // Kaydedilen set geçişle (`startTransition`) bırakılır: Next adresi zaman uyumsuz eylem sarmalayıcısından
          // yazar (`setState` mikro görevde, geçişin dışında, normal öncelikle); geçiş daha düşük öncelikli olduğundan
          // adres önce (ya da birlikte) çizilir, arada biten birimin "Bu hareket bitti" paneli bir kare bile görünmez.
          // Çıkılırken (`pausingRef`) de kalınmış sayılmaz: odak itmek bekleyen geçişi (Bugün ya da özet) düşürürdü.
          const stayed = !pausingRef.current && addressFocus() === next.unitKey && focusRef.current === next.unitKey;
          if (stayed) {
            openFocus(followingKey);
            startTransition(() => setSaving(null));
          } else {
            setSaving(null);
          }
          vibrate(20);
          const title = following ? plan.rows[following.rowId]?.title : undefined;
          // Başka yere geçildiyse "Sıradaki" söylenmez ve klavye odağı taşınmaz (kullanıcı oradadır).
          announce(stayed && title ? `${done} tamamlandı. Sıradaki: ${title}.` : `${done} tamamlandı.`);
          if (stayed && after.restSeconds <= 0) focusLater('exercise-title', DURATION.base);
        });
        later(NEXT_REST_MS, () => {
          if (after.restSeconds > 0) openRest(setId, after.restSeconds);
          else guard();
        });
      } else {
        // Hiçbir yerde set kalmadı (`done`) ya da birim bitti ve kalan yalnız fazladan set: bitiş sorusu.
        guard(DURATION.slow + 50 + WORKOUT.tapGuardMs);
        later(DURATION.slow + 50, () => {
          setSaving(null);
          if (!pausingRef.current) setFinishOpen(true);
        });
      }
    },
    [saving, commit, outbox, announce, guard, later, openRest, focusLater, openFocus],
  );

  const onStartTimer = useCallback(() => {
    const current = localRef.current;
    if (!current || saving) return;
    const next = nextSet(planOf(current), current.doc, current.draft, focusRef.current);
    if (!next) return;
    unlockAudio();
    // Sayaç başlarsa set başlamıştır: küçültülmüş dinlenme biter.
    commit({ ...current, rest: null, timer: startSetTimer({ rowId: next.rowId, setIndex: next.setIndex, target: next.target }, Date.now()) });
    guard();
    announce('Sayaç başladı');
  }, [saving, commit, guard, announce]);

  const onStopTimer = useCallback(() => {
    const timer = localRef.current?.timer;
    if (timer) onDone(stopSetTimer(timer, Date.now()));
  }, [onDone]);

  const onCancelTimer = useCallback(() => {
    const current = localRef.current;
    if (!current?.timer) return;
    commit({ ...current, timer: null });
    guard();
    announce('Sayaç durdu');
  }, [commit, guard, announce]);

  /** Aşırı yük uyarısında "Düzelt": ağırlık planınkine döner. */
  const onResetKg = useCallback(() => {
    const current = localRef.current;
    if (!current) return;
    const next = nextSet(planOf(current), current.doc, current.draft, focusRef.current, current.drafts);
    if (!next) return;
    commit({ ...current, draft: { rowId: next.rowId, setIndex: next.setIndex, kg: next.plannedKg, value: next.value } });
    guard();
    announce(`Ağırlık ${formatKg(next.plannedKg)}`);
  }, [commit, guard, announce]);

  const onToggleWarmup = useCallback(
    (rowId: string, index: number, done: boolean) => {
      const current = localRef.current;
      if (!current) return;
      const stamp = stampOf(current);
      const doc = done ? logWarmup(planOf(current), current.doc, { rowId, index, stamp }) : unlogWarmup(planOf(current), current.doc, { rowId, index, stamp });
      if (doc === current.doc) return;
      commit(withChange(current, doc, { send: false }));
      vibrate(10);
      announce(done ? `Isınma ${index + 1} yapıldı` : `Isınma ${index + 1} geri alındı`);
    },
    [commit, announce],
  );

  const onSetupNote = useCallback(
    (rowId: string, text: string) => {
      const current = localRef.current;
      if (!current) return;
      const doc = setSetupNote(planOf(current), current.doc, { rowId, note: text, stamp: stampOf(current) });
      if (doc === current.doc) return;
      commit(withChange(current, doc, { send: false }));
      announce(text.trim() ? 'Ayar notu kaydedildi' : 'Ayar notu silindi');
    },
    [commit, announce],
  );

  /**
   * "<Hareket> nasıldı?": cevap o hareketin (AMRAP olmayan) bütün çalışma setlerine. Bitiş yoldayken yazılmaz: bitiş
   * sorusu portalda, ekranın `inert`'i onu kapsamaz; cevap gönderilen belgede yok, başarıda kaybolurdu.
   */
  const onEffort = useCallback(
    (entryId: string, effort: EffortChoice) => {
      const current = localRef.current;
      if (!current || finishingRef.current) return;
      const doc = setEntryEffort(current.doc, entryId, effort, stampOf(current));
      commit(withChange(current.rest ? { ...current, rest: acknowledgeRest(current.rest) } : current, doc, { send: false }));
      const title = doc.entries.find((entry) => entry.id === entryId)?.title;
      announce(`${title ?? 'Hareket'}: ${EFFORT_LABELS[effort]}`);
    },
    [commit, announce],
  );

  /** "Kolaydı · sonraki set X kg": o sete "Kolay", sonraki set bir adım (yeniden dokunmak geri alır). */
  const onEasy = useCallback(() => {
    const current = localRef.current;
    if (!current?.rest) return;
    const shortcut = easyShortcut(planOf(current), current.doc, current.rest.setId, focusRef.current);
    if (!shortcut) return;
    const doc = setSetEffort(current.doc, current.rest.setId, shortcut.taken ? undefined : 'easy', stampOf(current));
    commit(withChange({ ...current, draft: null, rest: acknowledgeRest(current.rest) }, doc, { send: false }));
    const kg = nextSet(planOf(current), doc, null, focusRef.current)?.kg;
    announce(kg !== undefined ? `Sonraki set ${formatKg(kg)}` : 'Kaydedildi');
  }, [commit, announce]);

  /** AMRAP'ta set bittikten sonra "Kaç tekrar yaptın?". Bitiş yoldayken yazılmaz (`onEffort` gibi). */
  const onAmrapReps = useCallback(
    (setId: string, reps: number) => {
      const current = localRef.current;
      const found = current ? findSet(current.doc, setId) : null;
      if (!current || !found || finishingRef.current) return;
      const doc = editSet(current.doc, setId, { kg: found.set.kg, value: reps }, stampOf(current));
      commit(withChange(current.rest ? { ...current, rest: acknowledgeRest(current.rest) } : current, doc, { send: false }));
    },
    [commit],
  );

  const onDraft = useCallback(
    (values: SetValues) => {
      const current = localRef.current;
      if (!current || saving) return;
      const next = nextSet(planOf(current), current.doc, current.draft, focusRef.current, current.drafts);
      if (!next) return;
      // Setin yazılanı artık taslakta: listede kalmaz.
      const drafts = current.drafts && withoutTyped(current.drafts, next.rowId, next.setIndex);
      commit({ ...current, draft: { rowId: next.rowId, setIndex: next.setIndex, ...valuesOf(next, values) }, ...(drafts ? { drafts } : {}) });
    },
    [commit, saving],
  );

  /**
   * Tablodan bekleyen bir seti seçmek (kutusuna ya da satırına dokunmak, kutusuna yazmak): taslak o setin olur, sıradaki set
   * odur (panel ve şerit ona geçer; `nextSet`'in seçimi). Setler istenen sırayla yapılır. Seçimden çıkan sete yazılan o
   * satırda kalır (`keepTyped`; set ✓'lanmadıkça yapılmış sayılmaz), seçilen setin daha önce yazılanı taslağa döner.
   * Seçilemeyen sette (yapıldı, üye geçildi), kaydedilirken ve süreli set sayarken bir şey olmaz. Seçildiyse seçilen set.
   */
  const onPick = useCallback(
    (rowId: string, setIndex: number, values: SetValues = {}): NextSet | null => {
      const current = localRef.current;
      if (!current || saving || finishingRef.current || timedSetRunning(current, focusRef.current)) return null;
      const plan = planOf(current);
      const typed = current.drafts ?? [];
      const was = current.draft;
      const own = was?.rowId === rowId && was.setIndex === setIndex ? was : { rowId, setIndex };
      const picked = nextSet(plan, current.doc, own, focusRef.current, typed);
      // Bekleyen fazladan setler birbirinin aynısı: hangisine dokunulursa ilki seçilir.
      if (!picked || picked.rowId !== rowId || (picked.setIndex !== setIndex && !picked.extra)) return null;
      const draft = { rowId, setIndex: picked.setIndex, ...valuesOf(picked, values) };
      const moving = was !== null && (was.rowId !== draft.rowId || was.setIndex !== draft.setIndex);
      // Önerinin aynısı tutulmaz: öneri sonra (önceki set yapılınca) değişebilir.
      const suggested = moving ? nextSet(plan, current.doc, { rowId: was.rowId, setIndex: was.setIndex }, focusRef.current) : null;
      const typedThere = moving && suggested?.rowId === was.rowId && suggested.setIndex === was.setIndex && !sameValues(suggested, was);
      const drafts = withoutTyped(typedThere ? keepTyped(typed, was) : typed, draft.rowId, draft.setIndex);
      const same = was !== null && !moving && sameValues(was, draft);
      // İmlecin kendi setine taslaksız dokunmak bir şey değiştirmez.
      const already = !was && !picked.chosen && sameValues(values, {});
      if (drafts !== typed || (!same && !already)) commit({ ...current, draft, drafts });
      return picked;
    },
    [commit, saving],
  );

  /**
   * Yapılan setin değerini tablodan yerinde düzeltmek (kutudan çıkınca): panelin "Kaydet"inin yazımı (`editSet`), hemen
   * gönderilir; değişmediyse yazılmaz. Kaydedilirken ve bitiş yoldayken yazılmaz (kutular o arada kapalı).
   */
  const onFixSet: FixSet = useCallback(
    (setId, values) => {
      const current = localRef.current;
      const found = current ? findSet(current.doc, setId) : null;
      if (!current || !found || saving || finishingRef.current) return;
      const { set } = found;
      const old = set.reps ?? set.seconds ?? 0;
      const fixed = { kg: values.kg ?? set.kg, value: values.value ?? old, distanceM: values.distanceM ?? set.distanceM, inclinePct: values.inclinePct ?? set.inclinePct };
      if (sameValues(fixed, { kg: set.kg, value: old, distanceM: set.distanceM, inclinePct: set.inclinePct })) return;
      // İnsan sınırı: düzeltme de yapılamayacak hızı yazmaz.
      const rowKey = rowKeyOf(found.entry);
      const cardio = rowKey ? planOf(current).rows[rowKey]?.cardio : undefined;
      const speedIssue = cardio && set.seconds !== undefined ? cardioSpeedIssue(cardio, { seconds: fixed.value, distanceM: fixed.distanceM }) : null;
      if (speedIssue) {
        toast.error(speedIssue);
        announce(speedIssue);
        return;
      }
      const doc = editSet(current.doc, setId, fixed, stampOf(current));
      commit(withChange(current, doc, { send: true }));
      outbox.schedule();
      const saved = findSet(doc, setId)?.set;
      announce(`Set düzeltildi${saved ? `: ${setValueText(saved)}` : ''}`);
    },
    [saving, commit, outbox, announce],
  );

  const onWater = useCallback(() => {
    const current = localRef.current;
    if (!current) return;
    const { doc } = addWaterTap(current.doc, 1, stampOf(current));
    commit(withChange(current.rest ? { ...current, rest: acknowledgeRest(current.rest) } : current, doc, { send: false }));
    vibrate(10);
    announce(`Su: ${waterOf(doc)} bardak`);
    setUndoWater(true);
    window.clearTimeout(waterTimer.current);
    waterTimer.current = window.setTimeout(() => setUndoWater(false), WORKOUT.waterUndoMs);
  }, [commit, announce]);

  const onUndoWater = useCallback(() => {
    const current = localRef.current;
    if (!current) return;
    const { doc } = addWaterTap(current.doc, -1, stampOf(current));
    commit(withChange(current, doc, { send: false }));
    window.clearTimeout(waterTimer.current);
    setUndoWater(false);
    announce(`Su: ${waterOf(doc)} bardak`);
  }, [commit, announce]);

  /**
   * Kaydedilmiş seti alttaki panelde düzenlemek (tasarım §2.4): tablodaki satıra (klavyede set numarasına) ya da dinlenmenin
   * "Düzenle"sine dokunmak. Panel giriş panelinin yerinde (`SetEditPanel`), satır tabloda vurgulu. Set başka birimdeyse
   * (hareket bitti, kart sıradakine geçti; dinlenmenin "Düzenle"si) önce o birimin odağı açılır: danışan düzenlediği satırı
   * görür. Set kaydedilirken ve bitiş yoldayken açılmaz; süreli set sayarken de (düzenleme sayacı bırakırdı, süren set
   * kaybolurdu): toast önce bitirmeyi ya da vazgeçmeyi söyler. Açıldıysa true.
   */
  const onEditSet = useCallback(
    (setId: string): boolean => {
      const current = localRef.current;
      if (!current || saving || finishingRef.current) return false;
      if (timedSetRunning(current, focusRef.current)) {
        toast('Süre sayıyor', { description: 'Seti düzenlemek için önce bitir ya da vazgeç.' });
        return false;
      }
      const plan = planOf(current);
      const found = findSet(current.doc, setId);
      const rowKey = found ? rowKeyOf(found.entry) : undefined;
      const unitKey = rowKey ? unitKeyOfRow(plan, rowKey) : undefined;
      const edit = unitKey && validFocus(plan, current.doc, unitKey) !== null ? editOf(plan, current.doc, setId, unitKey) : null;
      if (!unitKey || !edit) return false;
      if (focusRef.current !== unitKey) openFocus(unitKey);
      setEditing(setId);
      guard();
      announce(`Set ${edit.position + 1} düzenleniyor`);
      focusLater('set-edit-title', DURATION.fast);
      return true;
    },
    [saving, openFocus, guard, announce, focusLater],
  );

  /** Dinlenmenin "Düzenle"si: set alttaki panelde düzenlenir, dinlenme küçülüp şeritte sürer (panel görünsün). */
  const onEditFromRest = useCallback(
    (setId: string) => {
      if (onEditSet(setId)) updateRest((timer) => ({ ...acknowledgeRest(timer), mode: 'mini' }));
    },
    [onEditSet, updateRest],
  );

  /** Panel kapanınca klavye odağı açan yere: düzenlenen satırın düğmesine; o yoksa "Set bitti"ye ya da başlığa. */
  const returnFocus = useCallback(
    (setId: string) =>
      later(DURATION.fast, () => {
        for (const id of [setEditButtonId(setId), 'set-done', ROW_DONE_ID, 'exercise-title']) {
          const element = document.getElementById(id);
          if (element) {
            element.focus({ preventScroll: true });
            return;
          }
        }
      }),
    [later],
  );

  /** Panelin "Kaydet"i: eski set sheet'inin yazımı (`editSet`, zorluk `setSetEffort`), hemen gönderilir. */
  const onSaveEdit = useCallback(
    (values: SetEditValues) => {
      const current = localRef.current;
      if (!current || !editing || finishingRef.current) return;
      const stamp = stampOf(current);
      let doc = editSet(current.doc, editing, values, stamp);
      if ('effort' in values) doc = setSetEffort(doc, editing, values.effort, stamp);
      commit(withChange(current, doc, { send: true }));
      outbox.schedule();
      setEditing(null);
      guard();
      toast.success('Set düzenlendi');
      returnFocus(editing);
    },
    [commit, editing, outbox, guard, returnFocus],
  );

  /** Panelin "Vazgeç"i (ve Esc): hiçbir şey yazılmaz, panel sıradaki sete döner. */
  const onCancelEdit = useCallback(() => {
    if (!editing) return;
    setEditing(null);
    guard();
    returnFocus(editing);
  }, [editing, guard, returnFocus]);

  /**
   * Seti kaldırır: ✓'u kaldırmak (`untick`: set yapılmadı) ya da sola kaydırıp "Sil", panelin "Seti sil"i (`delete`). İkisi
   * de eski onaylı silmenin yazımı (`deleteSet`, hemen gönderilir), onay sormaz: 8 sn "Geri al" seti geri getirir
   * (`restoreSet`: yeni kimlikle, aynı yerine). Fark fazladan sette: silmek tek harekette istenen turu da bırakır (yeniden
   * beklemesin), ✓'u kaldırmak bırakmaz (satır bekleyen fazladan set olur). Setin dinlenmesi biter. Taslağa dokunulmaz:
   * tablodan seçilen set (taslağın seti) seçili kalır; kaldırılan set yeniden yazılırsa `onDone` taslağı düşürür (`draft: null`). Set kaydedilirken, bitiş yoldayken ve
   * süreli set sayarken yapılmaz (`onEditSet` gibi); "Geri al" da süreli set sayarken geri getirmez.
   *
   * "Geri al" toast'ı ekranın dışında (genel Toaster): ara verilirken, bitiş yoldayken ya da ekran kapandıktan sonra hiçbir
   * şey yazmaz (`mountedRef`, `pausingRef`, `finishingRef`; atlamanın "Geri al"ı gibi).
   */
  const removeSet = useCallback(
    (setId: string, kind: 'untick' | 'delete') => {
      const current = localRef.current;
      if (!current || saving || finishingRef.current) return;
      if (timedSetRunning(current, focusRef.current)) {
        toast('Süre sayıyor', { description: 'Seti değiştirmek için önce bitir ya da vazgeç.' });
        return;
      }
      const plan = planOf(current);
      const found = findSet(current.doc, setId);
      const rowKey = found ? rowKeyOf(found.entry) : undefined;
      if (!found || !rowKey || found.set.type !== 'working') return;
      const position = setViews(plan, current.doc, rowKey).find((item) => item.logged?.id === setId)?.position ?? 0;
      const title = plan.rows[rowKey]?.title ?? found.entry.title;
      const unitKey = unitKeyOfRow(plan, rowKey);
      const single = unitKey ? plan.blocks.find((block) => block.id === unitKey)?.rows.length === 1 : false;
      const dropped = kind === 'delete' && found.set.extra === true && unitKey !== undefined && single && (plan.extraRounds?.[unitKey] ?? 0) > 0;
      const stamp = stampOf(current);
      // Silmenin anı: "Geri al" o andan sonra yapılan fazladan sete rağmen seti geri getirmez (`restoreSet`).
      const removedAt = stamp.at;
      const doc = deleteSet(plan, current.doc, setId, stamp);
      const rest = current.rest?.setId === setId ? null : current.rest;
      const extraRounds = dropped && unitKey ? dropExtraRound(plan, unitKey) : current.extraRounds;
      const focused = document.activeElement;
      commit(withChange({ ...current, rest, extraRounds }, doc, { send: true }));
      outbox.schedule();
      setEditing((now) => (now === setId ? null : now));
      guard();
      const text = `Set ${position + 1} ${kind === 'untick' ? 'geri alındı' : 'silindi'}`;
      announce(text);
      // Klavye odağı kalkan düğmedeyse (✓, "Seti sil") "Set bitti"ye, o yoksa başlığa.
      later(DURATION.fast, () => {
        if (!(focused instanceof HTMLElement) || focused.isConnected) return;
        (document.getElementById('set-done') ?? document.getElementById(ROW_DONE_ID) ?? document.getElementById('exercise-title'))?.focus({ preventScroll: true });
      });
      const sessionId = current.doc.id;
      showUndoToast(
        text,
        () => {
          const latest = localRef.current;
          if (!mountedRef.current || pausingRef.current || !latest || latest.doc.id !== sessionId || finishingRef.current) return;
          // Süreli set sayarken geri getirmek sıradaki seti değiştirip süren seti bırakırdı (`removeSet` gibi).
          if (timedSetRunning(latest, focusRef.current)) {
            toast('Süre sayıyor', { description: 'Seti geri getirmek için önce bitir ya da vazgeç.' });
            return;
          }
          // Silmenin bıraktığı fazladan tur da geri gelir; fazladan setin denetimi de o turla (`restoreSet`).
          const rounds = dropped && unitKey ? { ...latest.extraRounds, [unitKey]: (latest.extraRounds[unitKey] ?? 0) + 1 } : latest.extraRounds;
          const next = { ...latest, extraRounds: rounds };
          const back = restoreSet(planOf(next), latest.doc, { ...found, removedAt }, stampOf(latest));
          if (!back) {
            toast(`Set ${position + 1} geri getirilemedi`, { description: 'O arada yeniden yapıldı ya da hareket değişti.' });
            return;
          }
          // Geri gelen set sıradaki setin yerindeyse sıradaki set değişir (`onDropExtra` gibi): süreli setin sayacı düşer,
          // taslak yalnız yeni sıradaki setinse kalır (silmeden önce yazılan taslak böylece kendi setine döner).
          const before = nextSet(planOf(latest), latest.doc, latest.draft, focusRef.current);
          const after = nextSet(localWorkoutDay(next, back.doc), back.doc, latest.draft, focusRef.current);
          const moved = before?.rowId !== after?.rowId || before?.setIndex !== after?.setIndex;
          const draft = latest.draft && after && latest.draft.rowId === after.rowId && latest.draft.setIndex === after.setIndex ? latest.draft : null;
          // Geri gelen setin (o arada yazılmışsa) yazılanı düşer.
          const drafts = latest.drafts && pendingTyped(localWorkoutDay(next, back.doc), back.doc, latest.drafts);
          const restored = drafts ? { ...next, drafts } : next;
          commit(withChange(moved ? { ...restored, draft, timer: null } : restored, back.doc, { send: true }));
          outbox.schedule();
          announce(`Set ${position + 1} geri geldi`);
        },
        // Hangi hareketin seti: bildirim başka harekete geçildikten sonra da görünür (grupta "Set 2" iki üyede de var).
        { description: `${title} · ${setValueText(found.set)}` },
      );
    },
    [saving, commit, outbox, guard, announce, later],
  );
  const onUntickSet = useCallback((setId: string) => removeSet(setId, 'untick'), [removeSet]);
  const onDeleteSet = useCallback((setId: string) => removeSet(setId, 'delete'), [removeSet]);

  /**
   * "Antrenmanı değiştir"in sonu (eski antrenman silindi ya da bitti, yerel kopyası düştü): seçilen gün açılır.
   * `router.replace` yalnız arama parametresini değiştirir ve `WorkoutScreen` yeniden bağlanmaz (layout-router'ın
   * önbellek anahtarı arama parametresini atar: `createRouterCacheKey(segment, true)`): eski antrenmanın durumu elle
   * sıfırlanır. Bitişin meşguliyeti, değiştirme sheet'i (istek bitene kadar açık kalmıştı) ve güncelleme sorusu kalkar,
   * durdurulan gönderim kuyruğu sıfırlanır (eski antrenmanın yoldaki PUT'unun yanıtı artık yok sayılır) ve yeniden çalışır
   * (yoksa yeni antrenmanın setleri hiç gönderilmez, "Bitir" meşgul kalırdı; eski kuyruğun durması, beklemesi ve sorunu
   * yeni antrenmana taşınmaz), ekran yeni plan gelene kadar iskelette bekler. Açılış
   * kuralının bayrağı (`opened`) ve `focusPushed` de sıfırlanır: yeni antrenman Bugün'den açılmış gibi önce liste
   * işaretini, sonra ilk hareketin odağını iter (bayrak `doc.id` başına olduğundan yeni kimlikle zaten yeniden karar
   * verilirdi; sıfırlamak bunu kimliğe bırakmaz). Gün ve program sayfanın props'larıyla aynıysa (sunucu başka programın yarım
   * antrenmanını açmıştı) props değişmez, açılış effect'i kendiliğinden çalışmaz: adres yerinde değişir, açılış yeniden
   * denenir (`attempt`).
   */
  const restartWith = useCallback(
    (target: { program: string; day: string }) => {
      setFinishing(false);
      setUpdate(null);
      setFinishOpen(false);
      setSwitchOpen(false);
      setSaving(null);
      setTransition(null);
      setEditing(null);
      setLoad({ phase: 'loading' });
      setOpened(null);
      // Korkuluğun tek sıfırlandığı yer: adres birazdan işaretsiz (seçilen gün) olur, eski korkuluk orada sormamalı. Yeni
      // antrenmanın açılış kuralı yeniden kurar.
      setArmed(false);
      armPending.current = false;
      focusPushed.current = false;
      focusRef.current = null;
      leftUnit.current = null;
      returningToList.current = false;
      outbox.reset();
      outbox.resume();
      const href = `/me/antrenman?program=${encodeURIComponent(target.program)}&day=${encodeURIComponent(target.day)}`;
      if (target.program === programParam && target.day === dayParam) {
        window.history.replaceState(null, '', href);
        setAttempt((value) => value + 1);
      } else {
        router.replace(href);
      }
    },
    [outbox, router, dayParam, programParam],
  );

  /**
   * Bitişi gönderir (tek commit): `feedback` "Programını güncelleyelim mi?"nin kararları; uygulanmayan ağırlık
   * önce seansa işlenir (`oneOff` / `lighter`). Başarılıysa özet karuseli açılır (§2.8, dock yok); program
   * güncellemesi bir an sonra bildirimle söylenir. Bugün'ün sayıları ("Bu hafta x/y", su, yarım kart) hemen
   * bitişin yanıtıyla güncellenir (`afterFinish`): Bugün'e dönünce eski sayı bir an bile görünmez, taze veri
   * arkadan gelir. Bitirilemediyse (antrenman bu telefonda sürüyor) false.
   */
  const submitFinish = useCallback(
    async (health: FinishHealth | undefined, feedback: FinishFeedback | undefined): Promise<boolean> => {
      let current = localRef.current;
      if (!current) return false;
      if (feedback) {
        const flagged = withFeedbackFlags(current.doc, feedback.items, stampOf(current));
        if (flagged !== current.doc) {
          current = withChange(current, flagged, { send: false });
          commit(current);
        }
      }
      setFinishing(true);
      outbox.stop();
      const doc: SessionDoc = { ...current.doc, status: 'finished', finishedAt: new Date().toISOString() };
      try {
        const result = await fetchJson<{ doc?: SessionDoc; feedback?: FeedbackOutcome }>(`/api/me/sessions/${current.doc.id}/finish`, {
          method: 'POST',
          body: JSON.stringify({ doc, ...(health ? { health } : {}), ...(feedback ? { feedback } : {}) }),
        });
        // Tarih sunucunun (ilk yazımda koyduğu); yanıt gelmediyse telefondaki.
        const saved = result.doc ?? doc;
        void queryClient.invalidateQueries({ queryKey: ['coach', clientId, 'highlights'] });
        queryClient.setQueriesData<WorkoutResponse>({ queryKey: WORKOUT_OVERVIEW_KEY }, (old) => (old ? afterFinish(old, saved) : old));
        release();
        // Antrenman bitti (özete gidiliyor): nabız bandı kesilir. Başka antrenmana geçilirken bağlı kalır.
        if (!mountedRef.current || !switchTarget.current) disconnectHeartRate();
        if (!mountedRef.current) {
          // İstek sürerken ekran kapandı (danışan başka sayfaya geçti): bulunduğu sayfa değiştirilmez, seçilen antrenman da
          // açılmaz. Antrenman bitti ve yerel kopya düştü; özet Geçmiş'teki ayrıntıdan açılır.
          switchTarget.current = null;
        } else if (switchTarget.current) {
          const target = switchTarget.current;
          switchTarget.current = null;
          restartWith(target);
          toast.success('Yaptığın setler kaydedildi; seçtiğin antrenman açılıyor.');
        } else {
          // Özet işaretsiz girdinin yerine (`exitTo`): özette geri tuşu antrenmanın altındakine (genellikle Bugün) gider;
          // liste girdisine inseydi ekran boş bağlanır, varsayılan programdan yeni antrenman başlatırdı.
          exitTo(`/me/antrenman/ozet/${current.doc.id}`, { canStay: false });
        }
        // Kendi programda mesaj programın adıyla; yazılamayan madde varsa [Programı aç] (§2.9).
        const ownPlan = current.plan.source === 'own' && current.plan.programId ? { id: current.plan.programId, name: current.plan.programName ?? 'Programın' } : null;
        const message = result.feedback ? feedbackMessage(result.feedback, ownPlan) : null;
        // Özet açılırken bir an sonra (prototip): önce özetin ilk kartı görünsün.
        if (message) {
          window.setTimeout(
            () =>
              toast(message.title, {
                description: message.description,
                ...(message.open && ownPlan ? { action: { label: 'Programı aç', onClick: () => router.push(`/me/programlar/${ownPlan.id}`) } } : {}),
              }),
            450,
          );
        }
        return true;
      } catch (error) {
        if (error instanceof ApiError && error.status === 410) {
          leave('Bu antrenman silinmiş.', 'info');
          return true;
        }
        switchTarget.current = null;
        outbox.resume();
        setFinishing(false);
        setUpdate(null);
        toast.error(
          error instanceof ApiError && error.status === 0
            ? 'Bağlantı yok; antrenmanın bu telefonda duruyor. Bağlantı gelince yeniden bitir.'
            : error instanceof ApiError
              ? error.message
              : 'Antrenman bitirilemedi. Biraz sonra tekrar dene.',
        );
        return false;
      }
    },
    [clientId, outbox, leave, release, restartWith, exitTo, router, commit, queryClient],
  );

  /**
   * Bitir; `reason`: yapılmayanların isteğe bağlı nedeni (ağrı yalnız onayla, ayrıntısı `health.json`'a). Plandan
   * sapma ya da öneri varsa önce "Programını güncelleyelim mi?" (§2.7 c), özetten önce; öneri katmanının set
   * artışı adayları (`plan.setIncrease`, §5.6) orada "Antrenörüne öner" olarak. Günün her satırının kaydı
   * açılır (`ensureEntries`): hafifletilen günde planın set sayısı kayda yazılır, sunucunun "yarım bırakıldı
   * (x/y set)" sayısı sheet'tekiyle aynı olur.
   */
  const onFinish = useCallback(
    (reason: FinishReason | null) => {
      let current = localRef.current;
      if (!current) return;
      const ready = ensureEntries(planOf(current), current.doc, stampOf(current));
      if (ready !== current.doc) {
        current = withChange(current, ready, { send: false });
        commit(current);
      }
      let health: FinishHealth | undefined;
      if (reason) {
        const result = withFinishReason(planOf(current), current.doc, reason, stampOf(current));
        if (result.skippedRows.length > 0) health = { skippedRows: result.skippedRows };
        current = withChange(current, result.doc, { send: false });
        commit(current);
      }
      const items = feedbackItems({ day: current.plan, doc: current.doc, extras: current.extras, suggestions: current.plan.setIncrease });
      if (items.length === 0) {
        void submitFinish(health, undefined);
        return;
      }
      setFinishOpen(false);
      setUpdate({ items, health });
    },
    [commit, submitFinish],
  );

  /** "Programını güncelleyelim mi?"nin cevabı; sheet kararsız kapandıysa cevapsız (`none`). */
  const onProgramAnswer = useCallback(
    (answer: ProgramAnswer | null) => {
      const pending = update;
      if (!pending) return;
      // Kararsız kapandı: sheet kapanır, bitiş arkada gider; cevapta sheet düğmesinde bekler.
      if (!answer) setUpdate(null);
      const feedback = resolveFeedback(pending.items, answer?.answer ?? 'none', answer?.picked);
      void submitFinish(pending.health, feedback);
    },
    [update, submitFinish],
  );

  /* --- liste ve odak: aç, geç, geri al, değiştir, hareket ekle (§2.6) --- */

  /**
   * Sıra ya da hareket değişti: kendi başına gönderilmez (sonraki set yazımına ya da bitişe biner).
   * Gösterilen set değiştiyse taslak ve süreli setin sayacı düşer; dinlenme sürer ("Sıradaki" yenilenir).
   * `focusAfter`: işin ardından açılacak odak (`openFocus` ile çağıran yazar); verilmezse odak aynı kalır.
   * Listede (önce ve sonra odak yok) set gösterilmez: sıra değiştirmek imlecin sıradaki setini oynatsa da yazılan taslak
   * kalır (taslak yalnız kendi setinde geçerli, `nextSet`; hiçbir birimin kendi sıradaki seti sırayla değişmez).
   */
  const commitFlow = useCallback(
    (current: LocalWorkout, doc: SessionDoc, extra: Partial<LocalWorkout> = {}, focusAfter: string | null = focusRef.current) => {
      const before = nextSet(planOf(current), current.doc, current.draft, focusRef.current);
      const next = { ...current, ...extra };
      const after = nextSet(localWorkoutDay(next, doc), doc, next.draft, focusAfter);
      const shownSomething = focusRef.current !== null || focusAfter !== null;
      const moved = shownSomething && (before?.rowId !== after?.rowId || before?.setIndex !== after?.setIndex);
      commit(withChange(moved ? { ...next, draft: null, timer: null } : next, doc, { send: false }));
      if (moved) setTransition(null);
      guard();
      return { moved, after };
    },
    [commit, guard],
  );

  /** Listede geri alınan, atlanan ya da taşınan satır bir an vurgulu (`DRAG.highlightMs`). */
  const highlightUnit = useCallback((key: string) => {
    setListHighlight(key);
    window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => setListHighlight(null), DRAG.highlightMs);
  }, []);

  /**
   * Tüm hareketler yapıldıysa (geçilenler hariç) bitirme sorusu. Sheet bir an sonra açılır; o arada toast'taki "Geri al"
   * hareketi geri getirdiyse (ya da başka antrenmana geçildiyse) açılmaz: zamanlayıcı telefondaki son hâle yeniden bakar.
   */
  const finishIfDone = useCallback(
    (doc: SessionDoc) => {
      const current = localRef.current;
      if (!current || !cursorOf(planOf(current), doc).allDone) return;
      const sessionId = current.doc.id;
      later(DURATION.slow + 50, () => {
        const latest = localRef.current;
        if (latest && !pausingRef.current && latest.doc.id === sessionId && cursorOf(planOf(latest), latest.doc).allDone) setFinishOpen(true);
      });
    },
    [later],
  );

  /**
   * Listede satıra dokunmak (ya da alt çubukta "Başla/Devam et"), eklenen hareketin "Şimdi yap"ı, bitişte "Geçileni
   * yap": hareket odakta açılır, sıra yazılmaz (Faz 2: sıra kendiliğinden değişmez). Atlanan hareket önce geri alınır;
   * biten hareket setleriyle açılır. Plan dışı kayıt (planda satırı yok, `validFocus`) açılmaz ve geri alınmaz: kartın
   * gösterecek satırı yok; odak itilseydi ekran listeyi çizer, geçersiz odak effect'i adresi hemen geri düşürürdü.
   * Dokunuş sessiz kalmasın diye toast söyler.
   */
  const onOpenUnit = useCallback(
    (key: string) => {
      const current = localRef.current;
      if (!current || saving) return;
      const plan = planOf(current);
      const unit = cursorOf(plan, current.doc).units.find((item) => item.key === key);
      if (!unit) return;
      const skipped = unit.members.every((member) => member.skipped);
      const doc = skipped ? restoreAt(plan, current.doc, key, stampOf(current)) : current.doc;
      if (validFocus(plan, doc, key) === null) {
        toast('Bu hareketin planı bu telefonda yok', { description: 'Setleri listede duruyor.' });
        return;
      }
      if (skipped) commitFlow(current, doc, {}, key);
      openFocus(key);
      setFinishOpen(false);
      announce(unitTitle(plan, current.doc, unit));
      focusLater('exercise-title', DURATION.slow);
    },
    [saving, commitFlow, openFocus, announce, focusLater],
  );

  /**
   * "Ara ver" (⋯ menüsü ve listeden geri tuşunun "Ara verilsin mi?"si): Bugün'e, antrenman telefonda kalır (Bugün'de "Devam
   * et"). Ara vermek antrenmandan çıkmaktır, ileri bir adım değil: `exitTo` Bugün'ü işaretsiz girdinin yerine koyar, Bugün'de
   * geri tuşu antrenmanın altındakine (genellikle geldiği Bugün) gider. Kalınabilir çıkış: bağlantı yoksa yapılmaz (ekran
   * sürer, toast söyler), geri/ileri tuşu düşürürse ekran sürer. Ara verilirken ikinci dokunuş bir şey yapmaz; dialog'un
   * düğmeleri kilitli (`busy`).
   */
  const onPause = useCallback(() => exitTo('/me', { canStay: true }), [exitTo]);

  /** "Ara verilsin mi?"de "Devam et" (ya da dialog'u kapatmak): liste işareti geri konur, ikinci geri tuşu yine sorar. */
  const onStay = useCallback(() => {
    if (!new URLSearchParams(window.location.search).has(LIST_PARAM)) pushMark();
  }, [pushMark]);

  /**
   * "‹ Liste" (odakta üst çubuğun solu): listeye döner; canlı bölge "Liste" der. Klavye odağı liste çizilince az önce
   * bırakılan hareketin satırına (`leftUnit`, liste effect'i).
   */
  const onList = useCallback(() => {
    goToList();
    announce('Liste');
  }, [goToList, announce]);

  /**
   * Listede Alt + ↑/↓ ya da gizli "Yukarı/Aşağı taşı": birim bir adım (`moveUnit`; biten ve atlanan yerinde kalır, aradan
   * atlanır). Kendi başına gönderilmez (`commitFlow`, sonraki set yazımına biner). Canlı bölge yeni yerini söyler
   * ("Plank 3. sırada", sürüklemedeki gibi).
   */
  const onMoveUnit = useCallback(
    (key: string, direction: -1 | 1) => {
      const current = localRef.current;
      if (!current || saving) return;
      const plan = planOf(current);
      const unit = cursorOf(plan, current.doc).units.find((item) => item.key === key);
      const doc = moveUnit(plan, current.doc, key, direction, stampOf(current));
      if (!unit || doc === current.doc) return;
      commitFlow(current, doc);
      highlightUnit(key);
      const position = listView(plan, doc).items.findIndex((item) => item.key === key) + 1;
      announce(`${unitTitle(plan, current.doc, unit)} ${position}. sırada`);
    },
    [saving, commitFlow, highlightUnit, announce],
  );

  /** Sürükleyip bırakmak (listede tutamaçtan): birim bırakıldığı bitmemiş birimin yerine (`moveUnitTo`). */
  const onMoveUnitTo = useCallback(
    (key: string, targetKey: string) => {
      const current = localRef.current;
      if (!current || saving) return;
      const plan = planOf(current);
      const unit = cursorOf(plan, current.doc).units.find((item) => item.key === key);
      const doc = moveUnitTo(plan, current.doc, key, targetKey, stampOf(current));
      if (!unit || doc === current.doc) return;
      commitFlow(current, doc);
      highlightUnit(key);
      const position = listView(plan, doc).items.findIndex((item) => item.key === key) + 1;
      announce(`${unitTitle(plan, current.doc, unit)} ${position}. sırada`);
    },
    [saving, commitFlow, highlightUnit, announce],
  );

  /**
   * "Bu hareketi atla" (odakta ⋯): tek dokunuş, neden sorulmaz (bitişte sorulur). Birim atlananlara (`dropWithUndo`; biten
   * birimde yok, öğe devre dışı), odak sıradaki birime (`nextUnitAfter`: sıra değişmez, başka birimde bekleyen fazladan
   * set sayılmaz); kalmadıysa listeye (klavye odağı atlanan satıra) ve hepsi yapıldıysa bitiş sorusu. 8 sn bildirimde
   * "Geri al" (`undoSkip`) hareketi ve odağı geri getirir.
   *
   * Liste bir kare bile görünmez: belge ve odak tek geçişte (`startTransition`) yazılır. Atlanan birim adreste odakta
   * durur; belge adresten önce çizilseydi odak bir kare geçersiz kalır, ekran listeyi çizer, sonra yeni odağa atlardı.
   * Next adresi geçişin dışında yazar: yamalı `pushState`/`replaceState`'in eylemi zaman uyumsuz, `setState`'i mikro
   * görevde (`app-router-instance.js`), `startTransition`'ın kapsamı o zaman bitmiştir. Önceliği o anki olaydan gelir:
   * ⋯ menüsündeki tıklamada büyük olasılıkla eşzamanlı (Sync: mikro görev tıklama olayı sürerken çalışır), bir
   * zamanlayıcıdan çağrılsaydı varsayılan (Default; `onDone`'daki kendiliğinden geçiş). İkisi de geçişten öncelikli:
   * önce adres çizilir (yeni odak eski belgede de geçerli: bitmemiş, atlanmamış birim), sonra belge. "Geri al"da tersi:
   * belge önce (tıklamanın içinde, eşzamanlı), adres sonra (mikro görevde); geri gelen birim adres yetiştiğinde geçerlidir.
   */
  const onDropUnit = useCallback(
    (key: string) => {
      const current = localRef.current;
      if (!current || saving) return;
      const plan = planOf(current);
      const unit = cursorOf(plan, current.doc).units.find((item) => item.key === key);
      const result = unit ? dropWithUndo(plan, current.doc, key, stampOf(current)) : null;
      if (!unit || !result) return;
      const title = unitTitle(plan, current.doc, unit);
      const done = unit.members.reduce((sum, member) => sum + Math.min(member.done, member.planned), 0);
      const planned = unit.members.reduce((sum, member) => sum + member.planned, 0);
      // Sıradaki atlamadan önceki sırayla: atlanan sona iner, sıradaki onun eski yerinin ardından (geri dönmez).
      const target = nextUnitAfter(plan, current.doc, key);
      startTransition(() => {
        commitFlow(current, result.doc, {}, target);
        if (target) openFocus(target);
        else goToList();
      });
      // Listede klavye odağı atlanan satıra (sonda, ⤼ ve "Geri al"); belge önce yazıldığından `leaveShown` onu bulamaz
      // (gösterilen hareketten dönüldüğünü de bilemez: niyet burada yazılır).
      if (!target) {
        leftUnit.current = key;
        returningToList.current = true;
      }
      highlightUnit(key);
      announce(`${title} atlandı`);
      if (target) focusLater('exercise-title', DURATION.base);
      const sessionId = current.doc.id;
      showUndoToast(
        `${title} atlandı`,
        () => {
          const latest = localRef.current;
          // Bitiş (ya da iptal, değiştirme) gönderilirken geri alınmaz: belge yolda, meşgul bitiş sorusu kapanmamalı. Ara
          // verilirken ya da ekran kapandıktan sonra da (toast Bugün'de kalır) hiçbir şey yapmaz (`pausingRef`, `mountedRef`).
          if (!mountedRef.current || pausingRef.current || !latest || latest.doc.id !== sessionId || finishingRef.current) return;
          commitFlow(latest, undoSkip(planOf(latest), latest.doc, result.undo, stampOf(latest)), {}, key);
          // Son hareket atlanınca açılan bitiş sorusu kapanır (hareket yine yapılacak); açılmadıysa zamanlayıcısı açmaz.
          setFinishOpen(false);
          openFocus(key);
          highlightUnit(key);
          announce(`${title} geri alındı`);
          focusLater('exercise-title', DURATION.base);
        },
        done > 0 ? { description: `${done}/${planned} set yapıldı` } : {},
      );
      finishIfDone(result.doc);
    },
    [saving, commitFlow, openFocus, goToList, highlightUnit, announce, focusLater, finishIfDone],
  );

  /**
   * Listede atlanan satırın "Geri al"ı (`restoreAt`): hareket yeniden yapılacak, sonda kalır; odak açılmaz (satıra
   * dokunmak geri alıp açar, `onOpenUnit`).
   */
  const onRestore = useCallback(
    (key: string) => {
      const current = localRef.current;
      if (!current) return;
      const plan = planOf(current);
      const unit = cursorOf(plan, current.doc).units.find((item) => item.key === key);
      const doc = restoreAt(plan, current.doc, key, stampOf(current));
      if (!unit || doc === current.doc) return;
      commitFlow(current, doc);
      highlightUnit(key);
      announce(`${unitTitle(plan, current.doc, unit)} yeniden sırada`);
    },
    [commitFlow, highlightUnit, announce],
  );

  /**
   * Antrenmanda eklenen ve seti yazılmamış hareketi siler (listede sola kaydırma, odakta ⋯ "Hareketi sil"; `removeAdded`):
   * kayıt kalıcı iz listesine girer, satırı `extras`'tan düşer; odaktaysa listeye dönülür. 8 sn "Geri al" hareketi yeni
   * kimlikle yeniden ekler (silme izi her kopyada kazanır, aynı kimlik geri gelemez); yapılacakların sonuna girer.
   */
  const onRemoveAdded = useCallback(
    (key: string) => {
      const current = localRef.current;
      if (!current || saving) return;
      const plan = planOf(current);
      const unit = cursorOf(plan, current.doc).units.find((item) => item.key === key);
      const entry = current.doc.entries.find((item) => item.id === key);
      const doc = removeAdded(current.doc, key);
      if (!unit || !entry || !doc) return;
      const title = unitTitle(plan, current.doc, unit);
      const extraId = extraKey(key, entry.exerciseId);
      const extra = current.extras?.[extraId];
      const { [extraId]: _removed, ...extras } = current.extras ?? {};
      const focused = focusRef.current === key;
      commitFlow(current, doc, { extras }, focused ? null : focusRef.current);
      if (focused) goToList();
      announce(`${title} silindi`);
      const sessionId = current.doc.id;
      if (!extra) {
        // Planı bu telefonda yok (başka cihazda eklendi): geri getirilecek satır yok.
        toast(`${title} silindi`);
        return;
      }
      showUndoToast(`${title} silindi`, () => {
        const latest = localRef.current;
        // Ara verilirken, ekran kapandıktan sonra ya da bitiş yoldayken hiçbir şey yapmaz (atlamanın "Geri al"ı gibi).
        if (!mountedRef.current || pausingRef.current || !latest || latest.doc.id !== sessionId || finishingRef.current) return;
        const entryId = newEntryId(latest.doc);
        const keyed = rekeyExtra(extra, entryId);
        const back = addExercise(planOf(latest), latest.doc, { entryId, extra: keyed, stamp: stampOf(latest) });
        commitFlow(latest, back, { extras: { ...latest.extras, [extraKey(entryId, keyed.exerciseId)]: keyed } });
        highlightUnit(entryId);
        announce(`${title} geri geldi`);
      });
    },
    [saving, commitFlow, goToList, highlightUnit, announce],
  );

  /** "Değiştir": sheet'i şu anki hareket için açar; muadil seçildiyse başta asıl hareket. */
  const openSwap = useCallback((rowId: string) => {
    const current = localRef.current;
    if (!current) return;
    const row = planOf(current).rows[rowId];
    const original = current.plan.rows[rowId];
    if (!row || !original) return;
    setSwapTarget({
      dayId: current.plan.dayId,
      program: planProgram(current.plan),
      rowId,
      title: row.title,
      original: row.exerciseId !== original.exerciseId ? original.title : null,
    });
  }, []);

  const onPickSwap = useCallback(
    (option: SwapOption | null) => {
      const current = localRef.current;
      const target = swapTarget;
      if (!current || !target) return;
      const from = planOf(current).rows[target.rowId]?.title ?? target.title;
      const doc = swapRow(current.plan, current.doc, { rowId: target.rowId, extra: option?.extra ?? null, stamp: stampOf(current) });
      setSwapTarget(null);
      if (doc === current.doc) return;
      const extras = option ? { ...current.extras, [extraKey(target.rowId, option.exerciseId)]: option.extra } : current.extras;
      // Hareket değişti: eski hareketin taslağı, yazılanları ve sayacı yenisine taşınmaz (muadil kendi önerisiyle).
      const drafts = current.drafts?.filter((item) => item.rowId !== target.rowId);
      commitFlow(current, doc, { extras, draft: null, ...(drafts ? { drafts } : {}), timer: null });
      const to = option?.title ?? current.plan.rows[target.rowId]?.title ?? '';
      toast.success(option ? `${from} yerine ${to}` : `Yeniden ${to}`);
      announce(option ? `${from} yerine ${to}` : `Asıl hareket: ${to}`);
      focusLater('exercise-title', DURATION.slow);
    },
    [swapTarget, commitFlow, announce, focusLater],
  );

  /** "Hareket ekle": planı sunucudan (kendi geçmişiyle), kayıt hemen açılır; yapılacakların sonuna. */
  const onPickAdd = useCallback(
    async (item: LibraryItem) => {
      if (addBusy) return;
      setAddBusy(item.id);
      try {
        const planned = localRef.current;
        const { extra } = await fetchJson<AddedRowResponse>(
          `/api/me/workout/exercises?add=${encodeURIComponent(item.id)}${planned ? `&program=${encodeURIComponent(planProgram(planned.plan))}` : ''}`,
        );
        const current = localRef.current;
        if (!current) return;
        const entryId = newEntryId(current.doc);
        const keyed = rekeyExtra(extra, entryId);
        const doc = addExercise(planOf(current), current.doc, { entryId, extra: keyed, stamp: stampOf(current) });
        commitFlow(current, doc, { extras: { ...current.extras, [extraKey(entryId, keyed.exerciseId)]: keyed } });
        setAddOpen(false);
        setFinishOpen(false);
        announce(`${item.title} eklendi`);
        toast.success(`${item.title} eklendi`, {
          description: 'Yapılacakların sonunda',
          duration: WORKOUT.addedToastMs,
          classNames: TOAST_BUTTONS,
          // Ara verilirken ya da ekran kapandıktan sonra (toast Bugün'de kalır) hiçbir şey yapmaz (`pausingRef`, `mountedRef`).
          action: { label: 'Şimdi yap', onClick: () => (mountedRef.current && !pausingRef.current ? onOpenUnit(entryId) : undefined) },
        });
      } catch (error) {
        toast.error(error instanceof ApiError && error.status === 0 ? 'Bağlantı yok; hareket eklenemedi.' : error instanceof ApiError ? error.message : 'Hareket eklenemedi.');
        // Kısıt değişmiş (409): önbellekteki kütüphane tazelenir, hareket listeden düşer.
        if (error instanceof ApiError && error.status === 409) void queryClient.invalidateQueries({ queryKey: ['me', 'workout', 'library'] });
      } finally {
        setAddBusy(null);
      }
    },
    [addBusy, commitFlow, announce, onOpenUnit, queryClient],
  );

  /**
   * "+ Set ekle" (§2.4; grupta tur) ya da biten hareketin panelindeki "Set ekle": harekete fazladan set,
   * yalnız telefonda istenir (kendi başına gönderilmez); yapılan set `extra` işaretiyle yazılır. Planın setleri
   * bittiyse imleç fazladan sete geçer, bitirme sorusu kapanır.
   */
  const onAddSet = useCallback(
    (key: string) => {
      const current = localRef.current;
      if (!current || saving) return;
      const plan = planOf(current);
      const extraRounds = addExtraRound(plan, current.doc, key);
      if ((extraRounds[key] ?? 0) <= (plan.extraRounds?.[key] ?? 0)) return;
      const group = (plan.blocks.find((block) => block.id === key)?.rows.length ?? 1) > 1;
      const before = nextSet(plan, current.doc, current.draft, focusRef.current);
      const next = { ...current, extraRounds };
      const after = nextSet(planOf(next), current.doc, current.draft, focusRef.current);
      const moved = before?.rowId !== after?.rowId || before?.setIndex !== after?.setIndex;
      commit(moved ? { ...next, draft: null, timer: null } : next);
      guard();
      setFinishOpen(false);
      announce(group ? 'Fazladan tur eklendi' : 'Fazladan set eklendi');
      if (moved) focusLater('exercise-title', DURATION.base);
    },
    [saving, commit, guard, announce, focusLater],
  );

  /**
   * Bekleyen fazladan seti (grupta turu) siler (8 sn "Geri al"); geriye bir şey kalmadıysa bitirme sorusu. Dokunuş kilidi açıkken yok
   * sayılır: fazladan setin ✓'u kaldırılınca aynı hücrede ✕ çıkar, çift dokunuşun ikincisi turu da bırakırdı.
   */
  const onDropExtra = useCallback(
    (key: string) => {
      const current = localRef.current;
      if (!current || saving || performance.now() < guardUntil.current) return;
      const plan = planOf(current);
      const before = nextSet(plan, current.doc, current.draft, focusRef.current);
      const dropped = { ...current, extraRounds: dropExtraRound(plan, key) };
      // Bırakılan setin yazılanı düşer (yeniden istenen fazladan set boş gelsin).
      const drafts = current.drafts && pendingTyped(planOf(dropped), current.doc, current.drafts);
      const next = drafts ? { ...dropped, drafts } : dropped;
      const after = nextSet(planOf(next), current.doc, current.draft, focusRef.current);
      const moved = before?.rowId !== after?.rowId || before?.setIndex !== after?.setIndex;
      commit(moved ? { ...next, draft: null, timer: null } : next);
      guard();
      announce('Fazladan set silindi');
      // 8 sn "Geri al": istenen tur sayısı geri yazılır; o arada değiştiyse (yeni tur istendi, set yapıldı) yazılmaz.
      const sessionId = current.doc.id;
      const roundsOf = (local: LocalWorkout) => local.extraRounds[key] ?? 0;
      showGuardedUndo(
        'Fazladan set silindi',
        {
          locate: () => {
            const latest = localRef.current;
            return latest && mountedRef.current && !pausingRef.current && !finishingRef.current && latest.doc.id === sessionId ? latest : null;
          },
          read: roundsOf,
          write: (latest, rounds) => commit({ ...latest, extraRounds: { ...latest.extraRounds, [key]: rounds } }),
          before: roundsOf(current),
        },
        { onUndone: () => announce('Fazladan set geri geldi') },
      );
      // Odakta yalnız odaktaki birim bitmiş olabilir: bitirme sorusu hiçbir yerde set kalmadıysa.
      if (before && !after && !nextSet(planOf(next), current.doc)) {
        later(DURATION.slow + 50, () => {
          if (!pausingRef.current) setFinishOpen(true);
        });
      }
    },
    [saving, commit, guard, announce, later],
  );

  /**
   * Bekleyen planlı seti bugünden siler (sola kaydırıp "Sil", 8 sn "Geri al"): set günün planından düşer (`withDroppedSets`),
   * yapılmış setlerin planlanan sayısı ve hareketin durumu belgede güncellenir (`syncPlannedCount`). Geriye bir şey
   * kalmadıysa bitirme sorusu (fazladan setteki gibi).
   */
  const onDropSet = useCallback(
    (rowId: string, setIndex: number) => {
      const current = localRef.current;
      if (!current || saving || performance.now() < guardUntil.current) return;
      const plan = planOf(current);
      if (!canDropSet(plan, current.doc, rowId, setIndex)) return;
      const label = `Set ${(setViews(plan, current.doc, rowId).find((view) => view.setIndex === setIndex)?.position ?? 0) + 1}`;
      const before = nextSet(plan, current.doc, current.draft, focusRef.current);
      // Silinen ya da geri gelen setle günün planı ve kaydın planlanan sayısı birlikte yazılır.
      const apply = (local: LocalWorkout, on: boolean): LocalWorkout => {
        const next = { ...local, droppedSets: droppedWith(local.droppedSets ?? {}, rowId, setIndex, on) };
        const doc = syncPlannedCount(planOf(next), local.doc, rowId, stampOf(local));
        return doc === local.doc ? next : withChange(next, doc, { send: true });
      };
      const applied = apply(current, true);
      // Silinen setin yazılanı düşer (geri gelince boş, önceden dolu değerle gelsin).
      const drafts = applied.drafts && pendingTyped(planOf(applied), applied.doc, applied.drafts);
      const next = drafts ? { ...applied, drafts } : applied;
      const after = nextSet(planOf(next), next.doc, current.draft, focusRef.current);
      const moved = before?.rowId !== after?.rowId || before?.setIndex !== after?.setIndex;
      commit(moved ? { ...next, draft: null, timer: null } : next);
      guard();
      announce(`${label} silindi`);
      const sessionId = current.doc.id;
      showGuardedUndo(
        `${label} silindi`,
        {
          locate: () => {
            const latest = localRef.current;
            return latest && mountedRef.current && !pausingRef.current && !finishingRef.current && latest.doc.id === sessionId ? latest : null;
          },
          read: (local) => (local.droppedSets?.[rowId] ?? []).includes(setIndex),
          write: (latest, on) => commit(apply(latest, on)),
          before: false,
        },
        { onUndone: () => announce(`${label} geri geldi`) },
      );
      if (before && !after && !nextSet(planOf(next), next.doc)) {
        later(DURATION.slow + 50, () => {
          if (!pausingRef.current) setFinishOpen(true);
        });
      }
    },
    [saving, commit, guard, announce, later],
  );

  /** Bitişte "Geçileni yap": ilk geçilen hareket şimdi. */
  const onDoSkipped = useCallback(() => {
    const current = localRef.current;
    const key = current ? firstSkippedKey(planOf(current), current.doc) : null;
    if (key) onOpenUnit(key);
  }, [onOpenUnit]);

  const onCancelWorkout = useCallback(async () => {
    const current = localRef.current;
    if (!current) return;
    setFinishing(true);
    outbox.stop();
    // Dosya yazılmış olabilir (onaylı ya da yolda bir PUT): iz dosyasına döner; hiç gönderilmediyse silinecek bir şey yok.
    if (current.acked || current.lastSentAt !== null) {
      try {
        await fetchJson(`/api/me/sessions/${current.doc.id}`, { method: 'DELETE' });
      } catch (error) {
        switchTarget.current = null;
        outbox.resume();
        setFinishing(false);
        toast.error(error instanceof ApiError ? error.message : 'Antrenman iptal edilemedi.');
        return;
      }
    }
    leave('Antrenman iptal edildi.', 'info');
  }, [outbox, leave]);

  /**
   * "Antrenmanı değiştir" (⋯ menüsü): set yoksa antrenman silinir (sunucuya yazıldıysa), varsa yapılanlar "başka
   * antrenmana geçti" nedeniyle bitirilir (`submitFinish`); ikisinde de ardından seçilen gün `restartWith` ile açılır.
   * Bitirilemezse antrenman sürer ve değiştirmenin hazırlığı geri alınır (`undoSwitchPrep`).
   *
   * İstek sürerken sheet açık ve meşgul kalır (`finishing`; FinishSheet gibi): sheet modal olduğundan alttaki ekran
   * dokunulmaz, bitişin gönderdiği belgeden sonra set yazılamaz (yazılsaydı başarıda kaybolurdu). Danışan beklediğini
   * dokunduğu yerde görür, hatada sheet açık kalır (yeniden dene ya da vazgeç). Ekranın kökü de bitiş sürerken `inert`
   * (çizimde): bitiş sorusu ve "Programını güncelleyelim mi?" istek sürerken kapatılabilir. Başarıda `restartWith` sheet'i
   * kapatır.
   */
  const onSwitchWorkout = useCallback(
    async (program: string, day: string) => {
      const current = localRef.current;
      if (!current || finishing) return;
      if (program === planProgram(current.plan) && day === current.plan.dayId) {
        toast('Zaten bu antrenmandasın.');
        return;
      }
      if (!current.doc.entries.some((entry) => entry.sets.length > 0)) {
        setFinishing(true);
        outbox.stop();
        try {
          if (current.acked || current.lastSentAt !== null) {
            await fetchJson(`/api/me/sessions/${current.doc.id}`, { method: 'DELETE' });
          }
        } catch (error) {
          outbox.resume();
          setFinishing(false);
          toast.error(error instanceof ApiError ? error.message : 'Antrenman değiştirilemedi.');
          return;
        }
        release();
        restartWith({ program, day });
        return;
      }
      switchTarget.current = { program, day };
      const ready = ensureEntries(planOf(current), current.doc, stampOf(current));
      const changed = withFinishReason(planOf(current), ready, 'other', stampOf(current));
      commit(withChange(current, changed.doc, { send: false }));
      if (await submitFinish(undefined, undefined)) return;
      const latest = localRef.current;
      if (!latest || latest.doc.id !== current.doc.id) return;
      commit(withChange(latest, undoSwitchPrep(latest.doc, current.doc, changed.doc, stampOf(latest)), { send: false }));
    },
    [finishing, outbox, release, restartWith, commit, submitFinish],
  );

  const onAddElsewhere = useCallback(async () => {
    const current = localRef.current;
    if (!current || !elsewhere) return;
    setElsewhereBusy(true);
    try {
      await fetchJson(`/api/me/sessions/${current.doc.id}`, { method: 'PATCH', body: JSON.stringify({ writer: current.doc.writer, addSets: current.doc.entries }) });
      leave('Setler eklendi.');
    } catch (error) {
      setElsewhereBusy(false);
      toast.error(error instanceof ApiError ? error.message : 'Setler eklenemedi.');
    }
  }, [elsewhere, leave]);

  /* --- açık katmanın altında geri tuşu --- */

  /*
   * Geri tuşu açık bir sheet ya da dialog'un altında geçmişi oynatabilir (iPhone Safari'nin kenar kaydırması, masaüstünün geri
   * düğmesi; Android'de Base UI'nin `CloseWatcher`'ı geri hareketini katmana verir, geçmiş oynamaz). Listeden işaretsiz girdiye
   * dönülünce "Ara verilsin mi?" katmanın üstünde açılırdı; ikisi de Esc'i `document`'tan dinlediği için tek Esc ikisini
   * birden kapatırdı (yoklamanın sorusunda "Bugün atla" yazılır, "Bugün yük yok"ta Bugün'e çıkılırdı). Şimdi Android'deki gibi:
   * katman açıkken soru sorulmaz (`pauseAsked`), işaret geri konur (`pushMark`), üstteki katman kapanır; listede kalınır.
   * Kapatmak katmanın kendi kapanışıdır (yoklamanın sorusunda "atlandı" değil, kaydırıp kapatmak gibi; "Programını
   * güncelleyelim mi?"de kararsız kapanış, bitiş cevapsız gider). "Başka cihazda bitirildi" yalnız düğmeleriyle, bitiş ya da
   * değiştirme sürerken sheet'i meşgul: kapanmaz, yalnız işaret geri konur.
   *
   * Yalnız işaretli adresten işaretsize geçişte (geri tuşu): "Ara verilsin mi?" açıkken sonradan açılan katman (yoklama, "Başka
   * cihazda bitirildi", bitiş sorusunun zamanlayıcısı) soruyu yalnız erteler, kapanınca soru yine görünür. Katman, işaret
   * çizildikten sonra kapanır (`armPending` gibi): önce kapansaydı adres bir kare işaretsizken soru açılırdı. O arada katman
   * kendiliğinden kapandıysa ya da üstüne başkası açıldıysa dokunulmaz. Odaktan listeye geri tuşu adresi işaretli bırakır:
   * katman açık kalır (soru yok).
   */
  const topLayer: Layer | null = elsewhere
    ? 'elsewhere'
    : checkOpen
      ? 'check'
      : swapTarget
        ? 'swap'
        : addOpen
          ? 'add'
          : update
            ? 'update'
            : finishOpen
              ? 'finish'
              : switchOpen
                ? 'switch'
                : heartOpen
                  ? 'heart'
                  : null;
  const layerClosable =
    topLayer !== null && topLayer !== 'elsewhere' && !(finishing && (topLayer === 'update' || topLayer === 'finish' || topLayer === 'switch'));
  const marked = params.has(LIST_PARAM) || params.has(FOCUS_PARAM);
  const wasMarked = useRef(false);
  const layerToClose = useRef<Layer | null>(null);
  const closeLayer = useCallback(
    (layer: Layer) => {
      if (layer === 'check') checkRef.current?.close();
      else if (layer === 'swap') setSwapTarget(null);
      else if (layer === 'add') setAddOpen(false);
      else if (layer === 'update') onProgramAnswer(null);
      else if (layer === 'finish') setFinishOpen(false);
      else if (layer === 'switch') setSwitchOpen(false);
      else if (layer === 'heart') setHeartOpen(false);
    },
    [onProgramAnswer],
  );
  useEffect(() => {
    const before = wasMarked.current;
    wasMarked.current = marked;
    if (!before || marked || !armed || pausing || topLayer === null || addressMarked()) return;
    pushMark();
    layerToClose.current = layerClosable ? topLayer : null;
  }, [marked, armed, pausing, topLayer, layerClosable, pushMark]);
  useEffect(() => {
    const layer = layerToClose.current;
    if (!layer || !marked) return;
    layerToClose.current = null;
    if (layer === topLayer) closeLayer(layer);
  }, [marked, topLayer, closeLayer]);

  /* --- çizim --- */

  if (load.phase === 'loading' || awaitingOpening) return <WorkoutSkeleton />;
  if (load.phase === 'error' || load.phase === 'empty' || !view || !local) {
    const error = load.phase === 'error';
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 pt-[env(safe-area-inset-top)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">{error ? <WarningCircle weight="fill" /> : <Barbell weight="fill" />}</EmptyMedia>
            <EmptyTitle>{error ? 'Antrenman açılamadı' : 'Henüz program yok'}</EmptyTitle>
            <EmptyDescription>
              {error
                ? load.message
                : load.phase === 'empty' && load.problem
                  ? load.problem
                  : 'Antrenörün programını hazırladığında antrenmanın burada açılacak.'}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="gap-2">
            {error ? (
              <Button size="lg" className="h-11 w-full" onClick={() => setAttempt((value) => value + 1)}>
                <ArrowClockwise data-icon="inline-start" />
                Tekrar dene
              </Button>
            ) : null}
            <Button size="lg" variant={error ? 'outline' : 'default'} className="h-11 w-full" nativeButton={false} render={<Link href="/me" />}>
              Bugün&apos;e dön
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  const { plan, doc, focus: shownFocus, list, cursor, next, following: followingKey, previous: previousKey, edit, unitKey, row, sets, group, warmups, setupNote } = view;
  // Odak yoksa (ya da geçersizse) ana ekran liste; varsa o hareketin kartı ve giriş paneli.
  const listMode = shownFocus === null;
  // Listeden geri tuşu (9. görev): korkuluk kurulu ve adres işaretsiz girdide → "Ara verilsin mi?". İşaretsiz bir odak
  // adresinde sormaz; antrenman bitiriliyor ya da değiştiriliyorsa da (sonu zaten başka yere gider, olmazsa sorar), bir çıkış
  // işaretsiz girdiye dönerken de (`pausing` 'back') ve başka bir katman açıkken de (geri tuşu onu kapatır, yukarıda).
  const pauseAsked = armed && pausing !== 'back' && !marked && !finishing && topLayer === null;
  const rest = local.rest;
  const shown = saving?.next ?? next;
  const shownRow = shown ? (plan.rows[shown.rowId] ?? null) : null;
  const summary = workoutSummary(plan, doc, new Date(now));
  // "+ Set ekle": birim sınırda değilse (en çok `EXTRA_ROUNDS_MAX` tur).
  const addable = (key: string) => (addExtraRound(plan, doc, key)[key] ?? 0) > (plan.extraRounds?.[key] ?? 0);
  const todayIds = new Set(Object.values(plan.rows).map((item) => item.exerciseId));
  // "Hareket 2/5": listenin "şu an" satırının sırası (odakta odaktaki hareket; listede yarım bırakılan ya da sıradaki,
  // satırdaki ▶ ve alttaki "Devam et" ile aynı); hepsi bittiyse son. İmlecin sıradaki seti değil.
  const openItems = list.items.filter((item) => item.state !== 'skipped');
  const unitIndex = list.current ? openItems.findIndex((item) => item.key === list.current) + 1 : openItems.length;
  const unsent = unsentSets(local);
  const water = waterOf(doc);
  // Süreli setin sayacı yalnız sıradaki setinse çalışıyor sayılır (set silindiyse, düzenlendiyse değil).
  const timerRunning = Boolean(local.timer && next && local.timer.rowId === next.rowId && local.timer.setIndex === next.setIndex);
  const overload = next && !saving ? overloadState(plan, doc, next, next.kg) : 'none';
  const nextKey = next ? `${next.rowId}:${next.setIndex}` : null;
  const collapsed = panelClosed && (forcedOpen === null || forcedOpen !== nextKey);
  // Bekleyen her setin satırdan girişi (kg/tekrar kutuları ve ✓): şu anki setinki paneldekiyle aynı taslak, diğerlerinde o
  // sete yazılan ya da önceden dolu değerler; dokunulan set seçilir (`onPick`). Düzenleme açıkken yok: aynı anda iki düzenleyici olmasın.
  // Aşırı yük soruluyorsa ✓ önce seti seçip uyarıyı panelde gösterir (panel kapalıysa bu set için açılır); uyarı panelde
  // görünürken ✓ onaylar ("Onayla · Set bitti" gibi).
  const entryOf = (set: SetView): RowEntry | null => {
    if (!row || edit || shownFocus === null) return null;
    const current = next && next.rowId === row.rowId && (next.setIndex === set.setIndex || (next.extra && set.extra)) ? next : null;
    const values = current ?? nextSet(plan, doc, { rowId: row.rowId, setIndex: set.setIndex }, shownFocus, local.drafts);
    if (!values || values.rowId !== row.rowId || (values.setIndex !== set.setIndex && !(values.extra && set.extra))) return null;
    const asks = overloadState(plan, doc, values, values.kg) === 'ask';
    return {
      kg: values.kg,
      value: values.value,
      distanceM: values.distanceM,
      inclinePct: values.inclinePct,
      invalid: asks,
      disabled: saving !== null || timerRunning,
      onSelect: () => {
        if (!current) onPick(row.rowId, set.setIndex);
      },
      onChange: (changed) => (current ? onDraft(changed) : onPick(row.rowId, set.setIndex, changed)),
      onDone: () => {
        if (asks && (!current || collapsed)) {
          const picked = current ?? onPick(row.rowId, set.setIndex);
          if (picked) setForcedOpen(`${picked.rowId}:${picked.setIndex}`);
          return;
        }
        if (current || onPick(row.rowId, set.setIndex)) onDone();
      },
    };
  };
  // Paneli aç/kapat: düğme yer değiştirir (⌄ üst satırda, ⌃ alt satırda), odak yenisine geçer.
  const togglePanel = () => {
    if (collapsed) setPanelClosed(false);
    else {
      setForcedOpen(null);
      setPanelClosed(true);
    }
    window.requestAnimationFrame(() => document.getElementById(ENTRY_PANEL_TOGGLE_ID)?.focus({ preventScroll: true }));
  };
  // Odakta "Sıradaki: <ad>" (giriş panelinin altında; biten harekette birincil düğme): kendiliğinden geçişin açacağı birim.
  const followingItem = followingKey ? list.items.find((item) => item.key === followingKey) : undefined;
  const following = followingItem ? { name: itemName(followingItem), onOpen: () => onOpenUnit(followingItem.key) } : null;
  // Solunda "‹ Önceki" (listede önceki açılabilen birim): "Sıradaki" gibi açılır, gizlendiği yerler de aynı.
  const previousItem = previousKey ? list.items.find((item) => item.key === previousKey) : undefined;
  const previous = previousItem ? { name: itemName(previousItem), onOpen: () => onOpenUnit(previousItem.key) } : null;
  // Odakta ⋯: "Muadil seç" kartın satırında (odaktaki birimin şu anki üyesi; set kaydedildiyse ya da eklenen harekette
  // nedeniyle devre dışı), "Bu hareketi atla" bitmemiş birimde (`dropWithUndo`'nun kuralı). Set kaydedilirken ikisi de
  // devre dışı (işleyiciler o arada bir şey yapmaz; kart birazdan sıradaki sete ya da harekete geçer).
  const savingNote = { note: 'Set kaydediliyor…' };
  const focusActions: FocusActions | null =
    shownFocus !== null && row
      ? {
          swap: saving
            ? savingNote
            : canSwap(local.plan, doc, row.rowId)
              ? { onSelect: () => openSwap(row.rowId) }
              : { note: local.plan.rows[row.rowId] ? 'Set kaydedildi, muadil seçilemez' : 'Bu hareketin muadili yok' },
          skip: saving
            ? savingNote
            : list.items.find((item) => item.key === shownFocus)?.state === 'done'
              ? { note: 'Bu hareket bitti' }
              : { onSelect: () => onDropUnit(shownFocus) },
          // Yalnız antrenmanda eklenen harekette: seti yoksa silinir, varsa nedeni yazar (plandaki hareket atlanır).
          ...(list.items.find((item) => item.key === shownFocus)?.added
            ? {
                remove: saving
                  ? savingNote
                  : canRemoveAdded(doc, shownFocus)
                    ? { onSelect: () => onRemoveAdded(shownFocus) }
                    : { note: 'Seti var; önce setleri sil ya da atla' },
              }
            : {}),
        }
      : null;

  const restFound = rest ? findSet(doc, rest.setId) : null;
  const restRowId = restFound ? rowKeyOf(restFound.entry) : undefined;
  const restSet = restFound?.set;
  const restUnit = restFound ? cursor.units.find((unit) => unit.members.some((member) => member.entryId === restFound.entry.id)) : undefined;
  const restSummary = restUnit
    ? {
        title: restUnit.members.flatMap((member) => (member.rowId && plan.rows[member.rowId] ? [plan.rows[member.rowId]?.title ?? ''] : [])).join(' + '),
        done: restUnit.members.reduce((sum, member) => sum + Math.min(member.done, member.planned), 0),
        planned: restUnit.members.reduce((sum, member) => sum + (member.skipped ? Math.min(member.done, member.planned) : member.planned), 0),
        finished: restUnit.members.every((member) => member.skipped || member.done >= member.planned),
      }
    : null;
  const restPosition = rest && restRowId ? setViews(plan, doc, restRowId).find((item) => item.logged?.id === rest.setId)?.position : undefined;
  const restEffort = rest ? promptOf(effortQuestions(plan, doc, rest.setId)) : null;
  const restEasy = rest && !restEffort ? easyShortcut(plan, doc, rest.setId, shownFocus) : null;
  // Dinlenmenin "Sıradaki"si: odakta odaktaki hareketin sıradaki seti (hareket sürüyor); o bittiyse ve listede sıradaki
  // birimin seti (Sıradaki satırı ve "Devam et" ile aynı kaynak; başka birimde bekleyen fazladan set değil).
  const restNext = (listMode ? null : next) ?? (followingKey ? nextSet(plan, doc, null, followingKey) : null);

  // Bitiş sorusu: son hareketin dinlenmesi yok; onun zorluğu ve (AMRAP'sa) tekrarı sheet'te.
  const lastSetId = lastWorkingSetId(doc);
  const lastSet = lastSetId ? findSet(doc, lastSetId)?.set : undefined;
  const finishEffort = lastSetId ? promptOf(effortQuestions(plan, doc, lastSetId)) : null;

  // Bitiş (ya da iptal) yolda ve sheet'i kapatıldı ("Programını güncelleyelim mi?" kaydırıldı, bitiş sorusunda "Kalanlara
  // dön"): ekran `inert`, bağlantı ağırsa donmuş görünürdü; üst çubuk söyler. Sheet açıkken (değiştirme sheet'i istek boyunca
  // açık) sheet kendisi söyler. Setsiz antrenmanda yalnız iptal var (bitiş sorusunda "Antrenmanı iptal et").
  const status: WorkoutStatus | null =
    finishing && topLayer === null
      ? { tone: 'busy' as const, text: summary.sets === 0 ? 'Antrenman iptal ediliyor…' : 'Antrenman bitiriliyor…' }
      : problem === 'session'
        ? { tone: 'warn' as const, text: 'Oturumun kapandı; kayıtların bu telefonda. Antrenörüne yaz.' }
        : problem === 'error'
          ? { tone: 'warn' as const, text: 'Kayıt gönderilemedi', retry: true }
          : !online || problem === 'offline'
            ? { tone: 'offline' as const, text: `Çevrimdışı${unsent > 0 ? ` · ${unsent} set telefonda` : ''}` }
            : problem === 'limited' && unsent > 0
              ? { tone: 'offline' as const, text: `Şu an yoğun · ${unsent} set telefonda, birazdan gönderilecek` }
              : null;

  // Çıkılırken ekrana dokunulmaz (`inert`): satır, alt çubuk ya da ⋯'deki öğeler adresi değiştirip bekleyen geçişi (Bugün
  // ya da özet) düşürmesin. Bitiş (ya da iptal, değiştirme) yoldayken de: bitiş sorusu ya da "Programını güncelleyelim mi?"
  // kapatılırsa ekran yeniden dokunulur olurdu, o arada yazılan set gönderilen belgede yok, başarıda kaybolurdu. Sheet'ler
  // ve "Ara verilsin mi?" portalda, etkilenmez.
  const busy = pausing !== null || finishing;
  return (
    <div inert={busy} aria-busy={busy || undefined} className="mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden bg-background">
      <WorkoutHeader
        program={plan.source === 'own' && plan.programName ? plan.programName : null}
        day={doc.program?.dayName ?? plan.dayName}
        elapsed={elapsedText((now - Date.parse(doc.startedAt)) / 1000)}
        unit={{ index: unitIndex, total: openItems.length }}
        sets={{ done: list.doneSets, planned: list.plannedSets }}
        water={water}
        status={status}
        busy={finishing}
        focusActions={focusActions}
        heart={<HeartBadge heart={heart} limits={heartLimits} onOpen={() => setHeartOpen(true)} />}
        onList={listMode ? null : onList}
        onFinish={() => setFinishOpen(true)}
        onSwitch={() => setSwitchOpen(true)}
        onPause={onPause}
        onRetry={() => outbox.retry()}
      />
      {heartAlarm !== null ? <HeartAlertBanner bpm={heartAlarm} onDismiss={() => setHeartAlarm(null)} /> : null}

      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* Kip değişince kaydırma yeri sıfırlanır (anahtar): listede aşağı kaydırıp açılan hareket kartın başından görünür. */}
        <main
          key={listMode ? 'list' : 'focus'}
          inert={covered}
          className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pt-3 pb-4">
          {listMode ? (
            <WorkoutList
              view={list}
              highlight={listHighlight}
              onOpen={onOpenUnit}
              onRestore={onRestore}
              onAdd={() => setAddOpen(true)}
              onMove={onMoveUnit}
              onMoveTo={onMoveUnitTo}
              canRemove={(key) => canRemoveAdded(doc, key)}
              onRemove={onRemoveAdded}
            />
          ) : (
            <AnimatePresence mode="popLayout" initial={false}>
              {row && unitKey ? (
                <motion.div
                  key={unitKey}
                  initial={{ opacity: 0, x: WORKOUT.slidePx }}
                  animate={{ opacity: 1, x: 0, transition: tween(DURATION.base) }}
                  exit={{ opacity: 0, x: -WORKOUT.slidePx, transition: tween(DURATION.fast, EASE.exit) }}
                  // Satırın ✓'u da "Set bitti" gibi kilitli: kayıttan hemen sonraki ikinci dokunuş aynı yerdeki ✓'u kaldırmaz,
                  // grupta sıradaki üyenin setini kaydetmez.
                  onPointerDownCapture={swallow}
                  onClickCapture={swallow}>
                  <WorkoutExerciseCard
                    row={row}
                    bodyMassKg={plan.bodyMassKg}
                    group={group}
                    sets={sets}
                    warmups={warmups}
                    setupNote={setupNote}
                    currentSetIndex={
                      // Kaydedilirken vurgu kaydedilen satırda kalır; panel değişince sonraki sete kayar.
                      saving ? (saving.next.rowId === row.rowId ? saving.next.setIndex : null) : next && next.rowId === row.rowId ? next.setIndex : null
                    }
                    editingSetId={edit?.setId ?? null}
                    currentKg={next?.kg}
                    entryOf={entryOf}
                    onFixSet={edit ? null : onFixSet}
                    freshSetId={fresh}
                    locked={saving !== null || timerRunning}
                    onEditSet={onEditSet}
                    onUntickSet={onUntickSet}
                    onDeleteSet={onDeleteSet}
                    onToggleWarmup={(index, done) => onToggleWarmup(row.rowId, index, done)}
                    onSetupNote={(text) => onSetupNote(row.rowId, text)}
                    onSwap={!saving && canSwap(local.plan, doc, row.rowId) ? () => openSwap(row.rowId) : null}
                    // Biten harekette "Set ekle" giriş panelinde (ikincil düğme); kartta ikinci kez yok.
                    onAddSet={!saving && next && addable(unitKey) ? () => onAddSet(unitKey) : null}
                    onDropExtra={() => onDropExtra(unitKey)}
                    dropOf={(set) =>
                      !saving && !timerRunning && !set.extra && canDropSet(plan, doc, row.rowId, set.setIndex) ? () => onDropSet(row.rowId, set.setIndex) : null
                    }
                    ownProgram={local.plan.source === 'own'}
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>
          )}
        </main>

        <div ref={bottomRef} inert={covered} className="shrink-0">
          {rest && rest.mode === 'mini' && restView ? (
            <div onPointerDownCapture={swallow} onClickCapture={swallow}>
              <RestStrip
                view={restView}
                bpm={heart.status === 'connected' ? heart.bpm : null}
                onExpand={() => {
                  updateRest((timer) => ({ ...timer, mode: 'full' }));
                  guard();
                }}
                onSkip={endRest}
              />
            </div>
          ) : null}
          {listMode ? (
            <div onPointerDownCapture={swallow} onClickCapture={swallow} className="border-t bg-card px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              <WorkoutListBar view={list} onOpen={onOpenUnit} onFinish={() => setFinishOpen(true)} />
            </div>
          ) : (
            <section
              aria-label="Set girişi"
              onPointerDownCapture={swallow}
              onClickCapture={swallow}
              className="relative border-t bg-card px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              {/* Yapılan sete dokunulduysa panel o seti düzenler (`SetEditPanel`); değilse sıradaki set. */}
              {edit ? (
                <SetEditPanel key={edit.setId} edit={edit} onSave={onSaveEdit} onCancel={onCancelEdit} onDelete={() => onDeleteSet(edit.setId)} />
              ) : (
                <EntryPanel
                  row={shownRow}
                  next={shown}
                  frozen={saving !== null}
                  overload={overload}
                  nextLetter={saving ? null : nextMemberLetter(plan, doc, shownFocus, next)}
                  transition={transition}
                  timer={timerRunning ? timerView : null}
                  now={now}
                  onChange={onDraft}
                  onResetKg={onResetKg}
                  onDone={() => onDone()}
                  onStartTimer={onStartTimer}
                  onStopTimer={onStopTimer}
                  onCancelTimer={onCancelTimer}
                  onDropExtra={() => (next ? onDropExtra(next.unitKey) : undefined)}
                  onFinish={() => setFinishOpen(true)}
                  previous={previous}
                  following={following}
                  addSet={!saving && unitKey && addable(unitKey) ? { label: group ? 'Tur ekle' : 'Set ekle', onAdd: () => onAddSet(unitKey) } : null}
                  collapsed={collapsed}
                  onToggleCollapsed={togglePanel}
                />
              )}
            </section>
          )}
        </div>

        <AnimatePresence>
          {rest && rest.mode === 'full' && restView ? (
            <motion.section
              key="rest"
              aria-label="Dinlenme"
              initial={{ y: '100%' }}
              animate={{ y: 0, transition: tween(DURATION.base) }}
              exit={{ y: '100%', transition: tween(DURATION.fast, EASE.exit) }}
              onPointerDownCapture={swallow}
              onClickCapture={swallow}
              className="absolute inset-0 z-20 bg-background">
              <RestPanel
                endsAt={rest.endsAt}
                total={rest.total}
                view={restView}
                heart={heart.status === 'connected' || heart.status === 'lost' ? { bpm: heart.bpm, recovery: heartLimits.recovery } : null}
                summary={restSummary}
                saved={restSet ? { text: `Set ${(restPosition ?? 0) + 1} kaydedildi · ${setValueText(restSet, plan.bodyMassKg)}`, setId: restSet.id } : null}
                lockWarning={local.restCount === 1 && (isIOS() || !wakeHeld)}
                amrap={restSet?.target?.amrap ? { reps: restSet.reps ?? 0 } : null}
                effort={restEffort}
                easy={restEasy}
                onAmrap={(reps) => onAmrapReps(rest.setId, reps)}
                onEffort={onEffort}
                onEasy={onEasy}
                water={water}
                undoWater={undoWater}
                next={restNext ? nextText(restNext, plan.rows[restNext.rowId] ?? { title: '', trackingType: 'weight_reps' }, restNext.rowId !== restRowId) : null}
                onSkip={endRest}
                onMinimize={() => {
                  updateRest((timer) => ({ ...acknowledgeRest(timer), mode: 'mini' }));
                  guard();
                  focusAfterRest(DURATION.fast);
                }}
                onAdjust={(seconds) => updateRest((timer) => adjustRest(acknowledgeRest(timer), seconds, Date.now()))}
                onWater={onWater}
                onUndoWater={onUndoWater}
                onEditSaved={onEditFromRest}
                onTouch={() => {
                  if (localRef.current?.rest && alarmPending(localRef.current.rest)) updateRest(acknowledgeRest);
                }}
              />
            </motion.section>
          ) : null}
        </AnimatePresence>
      </div>

      <FinishSheet
        open={finishOpen}
        onOpenChange={setFinishOpen}
        summary={summary}
        busy={finishing}
        effort={finishEffort}
        amrap={lastSet?.target?.amrap ? { reps: lastSet.reps ?? 0 } : null}
        pain={local.pain}
        onEffort={onEffort}
        onAmrap={(reps) => (lastSetId ? onAmrapReps(lastSetId, reps) : undefined)}
        onDoSkipped={onDoSkipped}
        onFinish={(reason) => void onFinish(reason)}
        onCancelWorkout={onCancelWorkout}
      />
      <WorkoutSwitchSheet
        open={switchOpen}
        busy={finishing}
        onOpenChange={setSwitchOpen}
        onSwitch={(program, day) => void onSwitchWorkout(program, day)}
      />
      <SwapSheet target={swapTarget} onClose={() => setSwapTarget(null)} onPick={onPickSwap} />
      <HeartSheet open={heartOpen} onOpenChange={setHeartOpen} heart={heart} limits={heartLimits} />
      <AddExerciseSheet open={addOpen} onOpenChange={setAddOpen} todayIds={todayIds} busyId={addBusy} onPick={(item) => void onPickAdd(item)} />
      <ProgramUpdateSheet
        items={update?.items ?? null}
        busy={finishing}
        ownName={local?.plan.source === 'own' ? (local.plan.programName ?? null) : null}
        onAnswer={onProgramAnswer}
        onDismiss={() => onProgramAnswer(null)}
      />
      <FinishedElsewhereDialog count={elsewhere?.count ?? null} busy={elsewhereBusy} onAdd={onAddElsewhere} onSkip={() => leave('Bu antrenman başka bir cihazda bitirildi.', 'info')} />
      <PauseDialog open={pauseAsked} busy={pausing !== null} onContinue={onStay} onPause={onPause} />
      {/* Yoklama (§2.2): yalnız sağlık onayı varken ve antrenman yeni başlıyorken açılır. */}
      <StartCheck ref={checkRef} clientId={clientId} local={local} onApply={applyCheck} onLeave={leave} onOpenChange={setCheckOpen} />
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

/** Açılış: plan telefonda yoksa bir an; üst çubuk, kart ve panel yerinde. */
function WorkoutSkeleton() {
  return (
    <div className="mx-auto flex h-dvh w-full max-w-md flex-col bg-background" aria-busy="true">
      <span role="status" className="sr-only">
        Antrenman açılıyor…
      </span>
      <div className="shrink-0 border-b pt-[env(safe-area-inset-top)]">
        <div className="flex h-13 items-center justify-between px-3">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-5 w-12" />
        </div>
        <div className="flex h-11 items-center gap-3 px-4">
          <Skeleton className="h-1 flex-1" />
          <Skeleton className="h-4 w-36" />
        </div>
      </div>
      <div className="flex-1 px-4 pt-3">
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
      <div className="flex shrink-0 flex-col gap-2 border-t px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    </div>
  );
}
