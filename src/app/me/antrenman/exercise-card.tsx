'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'motion/react';
import { ArrowBendUpRight, ArrowDown, ArrowUp, Bandaids, NotePencil, Play, Sparkle, Swap, Wrench } from '@phosphor-icons/react';
import { Check, Equals, Plus } from '@/components/line-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SwipeGroup } from '@/components/swipe/swipe-row';
import { useLocale } from '@/i18n/client';
import { clientWorkoutMessages } from '@/i18n/messages/client-workout';
import { rowCareText } from '@/lib/constraint-filter';
import { minutesOf } from '@/lib/cardio';
import { getFormat } from '@/lib/format';
import { DURATION, EASE, tween, WORKOUT } from '@/lib/motion';
import { reasonLabels, type SuggestionReason } from '@/lib/progression';
import type { Why } from '@/lib/recommend';
import { SESSION_LIMITS } from '@/lib/schemas/session';
import { isStraight } from '@/lib/set-plan';
import { cn } from '@/lib/utils';
import type { GroupMemberStatus, GroupView } from '@/lib/workout-groups';
import type { WorkoutRow } from '@/lib/workout-plan';
import { boxColumn, carriesLastTime, lastSetOf, type SetView, type WarmupView } from '@/lib/workout-session';
import { WorkoutSetRow, type FixSet, type RowEntry } from './set-row';

const UP = new Set<string>(['increase', 'range_increase']);
const DOWN = new Set<string>(['decrease', 'deload', 'calibrate', 'pain_reduce']);

/** Gerekçenin ikonu: öneri katmanının tonu (`why.tone`), yoksa gerekçeden. */
function ReasonIcon({ reason, tone }: { reason: string; tone: Why['tone'] | undefined }) {
  if (tone ? tone === 'new' : reason === 'first_time') return <Sparkle />;
  if (tone ? tone === 'up' : UP.has(reason)) return <ArrowUp />;
  if (tone ? tone === 'down' : DOWN.has(reason)) return <ArrowDown />;
  return <Equals />;
}

/** Tek satırlık çip: taşarsa kırpılır; dokununca tamamı altında açılır (tasarım §2.4). */
function Chip({
  open,
  onToggle,
  tone,
  icon,
  label,
  className,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  tone: 'up' | 'plain' | 'muted';
  icon: React.ReactNode;
  /** Metni görünmeyen çipin erişilebilir adı. */
  label?: string;
  className?: string;
  children?: string;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={label}
      onClick={onToggle}
      className={cn(
        "relative inline-flex h-7 min-w-0 shrink items-center gap-1 rounded-full px-2.5 text-[0.8125rem] outline-none before:absolute before:-inset-x-0.5 before:-inset-y-2 before:content-[''] focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-3.5 [&_svg]:shrink-0",
        tone === 'up' ? 'bg-primary/15 text-primary' : tone === 'muted' ? 'bg-muted text-muted-foreground' : 'bg-muted text-foreground',
        className,
      )}>
      {icon}
      {children ? <span className="truncate">{children}</span> : null}
    </button>
  );
}

/** Grubun başı (tasarım §2.4 "Gruplar"): "Süperset · Tur 2/3" ve üyeler; şu anki üye vurgulu. */
function GroupHeader({ group }: { group: GroupView }) {
  const t = clientWorkoutMessages(useLocale()).card;
  const statusText: Record<GroupMemberStatus, string> = t.memberStatus;
  return (
    <div className="flex flex-col gap-1 px-2 pt-2.5 pb-1">
      <div className="flex h-6 items-center gap-2 px-1 text-[0.8125rem] text-muted-foreground tabular-nums">
        <Badge className="bg-primary/15 text-primary">{group.label}</Badge>
        <span className="flex-1">{t.round(group.round + 1, group.rounds)}</span>
      </div>
      <ul className="flex flex-col">
        {group.members.map((member) => (
          <li
            key={member.rowId}
            aria-current={member.status === 'current' ? 'step' : undefined}
            className={cn(
              'grid h-9 grid-cols-[1.5rem_minmax(0,1fr)_auto_1.25rem] items-center gap-2 rounded-md px-1 text-sm transition-colors duration-220',
              member.status === 'current' && 'bg-primary/10',
              (member.status === 'finished' || member.status === 'skipped') && 'text-muted-foreground',
            )}>
            <span className="grid size-6 place-items-center rounded-md bg-primary/15 text-xs font-semibold text-primary" aria-hidden>
              {member.letter}
            </span>
            <span className={cn('truncate', member.status === 'current' && 'font-semibold')}>
              <span className="sr-only">{member.letter}: </span>
              {member.title}
            </span>
            <span className="text-[0.8125rem] whitespace-nowrap text-muted-foreground tabular-nums">{member.status === 'finished' ? '—' : member.text}</span>
            <span className="grid place-items-center text-primary [&_svg]:size-4">
              {member.status === 'done' ? <Check weight="bold" aria-hidden /> : member.status === 'current' ? <Play weight="fill" aria-hidden /> : member.status === 'skipped' ? <ArrowBendUpRight aria-hidden className="text-muted-foreground" /> : null}
              <span className="sr-only">{statusText[member.status]}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Isınma satırı (tasarım §2.4): "Isınma 20×10 · 40×5" ve her set için ✓ (dokununca yapıldı / geri al). */
function WarmupRow({ warmups, onToggle }: { warmups: readonly WarmupView[]; onToggle: (index: number, done: boolean) => void }) {
  const locale = useLocale();
  const t = clientWorkoutMessages(locale).card;
  const f = getFormat(locale);
  return (
    <div className="flex min-h-11 items-center gap-1 border-t pr-1.5 pl-3 text-sm tabular-nums">
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{t.warmups(warmups.map((warmup) => `${f.number(warmup.kg)}×${warmup.reps}`).join(' · '))}</span>
      {warmups.map((warmup) => (
        <button
          key={warmup.index}
          type="button"
          aria-pressed={Boolean(warmup.logged)}
          aria-label={t.warmupSet(warmup.index + 1, f.number(warmup.kg), warmup.reps)}
          onClick={() => onToggle(warmup.index, !warmup.logged)}
          className="grid size-11 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <span
            className={cn(
              'grid size-8 place-items-center rounded-full border transition-colors duration-160 [&_svg]:size-4',
              warmup.logged ? 'border-transparent bg-primary/20 text-primary' : 'border-dashed border-input text-muted-foreground',
            )}>
            {warmup.logged ? <Check weight="bold" /> : null}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Ayar notunu düzeltme: tek satır, Kaydet; boş bırakmak notu siler. */
function SetupNoteForm({ note, onSave }: { note: string | undefined; onSave: (text: string) => void }) {
  const t = clientWorkoutMessages(useLocale()).card;
  const [text, setText] = useState(note ?? '');
  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(text);
      }}>
      <label htmlFor="setup-note" className="text-[0.8125rem] text-muted-foreground">
        {t.setupHint}
      </label>
      <div className="flex gap-2">
        <Input
          id="setup-note"
          value={text}
          maxLength={SESSION_LIMITS.setupNote}
          onChange={(event) => setText(event.target.value)}
          placeholder={t.setupPlaceholder}
          autoComplete="off"
          enterKeyHint="done"
          className="h-11 min-w-0 flex-1 text-base"
        />
        <Button type="submit" variant="secondary" className="h-11 px-4">
          {t.save}
        </Button>
      </div>
    </form>
  );
}

/**
 * Hareket kartı (tasarım §2.4): başlık ≤ 2 satır, altında tek satırlık çipler (planın gerekçesi, danışanın
 * ayar notu, PT'nin notu), gerekiyorsa ısınma satırı ve set tablosu. Tablo gerçek `<table>`: Set ·
 * Önceki · (setlerin hedefi farklıysa Hedef) · kg · Tekrar/Süre · durum. Planın değerleri bir kez
 * görünür: düz setlerde hedef paneldedir; AMRAP set "8+". Şu anki satır vurgulu (şerit sonraki sete
 * kayar). Bekleyen her satırın kg ve tekrar hücreleri yazılabilir, boş ✓ seti kaydeder ("Set bitti" ile aynı, `entryOf`);
 * setler istenen sırayla yapılır, dokunulan satır şu anki set olur. Yapılan setin değerleri yerinde düzeltilir (`onFixSet`);
 * satırın geri kalanına dokunmak onu alttaki panelde düzenlemeye açar (şerit o satıra geçer); ✓'a dokunmak
 * işareti kaldırır, sola kaydırmak "Sil"i açar (`WorkoutSetRow`). Yeni kaydın ✓'u satıra, panel değişmeden önce düşer
 * (iOS'ta titreşim yok; kaydedildiğini bu gösterir). Onaylanmış aşırı yük satırda ↑ ile görünür.
 *
 * Grupta (süperset, devre, kompleks) başlığın yerinde tur ve üyeler; altta şu anki üyenin çipleri ve
 * tablosu. Üye değişince bu kısım 12 px kayarak gelir (`WORKOUT.groupSlidePx`).
 *
 * Muadil (§2.6) üst çubuğun ⋯ menüsünde ("Muadil seç", 8. görev); kartta yalnız kısıt notunun açılan metninde
 * "Değiştir" (kaçınılacak harekette), hareketin çalışma seti kaydedilmemişken.
 *
 * "+ Set ekle" (§2.4) tablonun altında: planın son setini tekrarlayan fazladan bir set (grupta "+ Tur ekle":
 * her üyeye bir set). Fazladan satırın "Önceki" hücresinde "fazladan" yazar; bekleyen fazladan set oradaki
 * ✕ ile bırakılır (düzenleme açıkken son hücrede).
 */
export function WorkoutExerciseCard({
  row,
  group,
  sets,
  warmups,
  setupNote,
  currentSetIndex,
  editingSetId,
  currentKg,
  entryOf,
  onFixSet,
  freshSetId,
  locked,
  onEditSet,
  onUntickSet,
  onDeleteSet,
  onToggleWarmup,
  onSetupNote,
  onSwap,
  onAddSet,
  onDropExtra,
  dropOf,
  ownProgram = false,
  bodyMassKg,
}: {
  row: WorkoutRow;
  group: GroupView | null;
  sets: readonly SetView[];
  warmups: readonly WarmupView[];
  setupNote: string | undefined;
  /** Şu anki set (satırdaki yeri); hareket bittiyse null. */
  currentSetIndex: number | null;
  /** Panelde düzenlenen set: şerit onun satırında (şu anki setin değil). */
  editingSetId: string | null;
  /** Şu anki setin önceden dolu (ya da değiştirilmiş) ağırlığı. */
  currentKg: number | undefined;
  /** Bekleyen setin satırdan girişi (kg/tekrar kutuları ve ✓); düzenleme açıkken ve seçilemeyen sette null. */
  entryOf: (set: SetView) => RowEntry | null;
  /** Yapılan setin yerinde düzeltilmesi; düzenleme açıkken null. */
  onFixSet: FixSet | null;
  /** Az önce kaydedilen set: ✓'u belirerek gelir. */
  freshSetId: string | null;
  /** Set kaydedilirken ya da süreli set sayarken satırlar kaydırılmaz (dokunuşlara ekran karar verir). */
  locked: boolean;
  /** Yapılan sete dokunmak: alttaki panelde düzenlemek. */
  onEditSet: (setId: string) => void;
  /** ✓'u kaldırmak: set yapılmadı (silinir, "Geri al" toast'ta). */
  onUntickSet: (setId: string) => void;
  /** Sola kaydırıp "Sil": set silinir ("Geri al" toast'ta). */
  onDeleteSet: (setId: string) => void;
  onToggleWarmup: (index: number, done: boolean) => void;
  onSetupNote: (text: string) => void;
  /** Kısıt notundaki "Değiştir": muadil açıksa sheet'ini açar; kapalıysa null. */
  onSwap: (() => void) | null;
  /** "+ Set ekle" (grupta tur); kapalıysa (kaydedilirken, sınırda) null. */
  onAddSet: (() => void) | null;
  /** Bekleyen fazladan seti bırakır. */
  onDropExtra: () => void;
  /** Bekleyen planlı setin sola kaydırıp silinmesi (`canDropSet`); silinemiyorsa null. */
  dropOf: (set: SetView) => (() => void) | null;
  /** Kendi programda satır notu danışanın kendi notudur: etiket "Not:" (`docs/design/kendi-program.md` §2.9). */
  ownProgram?: boolean;
  /** Danışanın kilosu (ölçüm onayıyla): yürüyüş/koşu setinin kalorisi; yoksa kalori yok, kartta not. */
  bodyMassKg?: number | undefined;
}) {
  const locale = useLocale();
  const t = clientWorkoutMessages(locale).card;
  const [open, setOpen] = useState<'reason' | 'note' | 'setup' | 'care' | null>(null);
  const [warmOpen, setWarmOpen] = useState(false);
  // Grupta üye değişince (ya da hareket muadille değişince) açık çip kapanır (her hareketin kendi notu var).
  const shownKey = `${row.rowId}:${row.exerciseId}`;
  const [shownRow, setShownRow] = useState(shownKey);
  if (shownRow !== shownKey) {
    setShownRow(shownKey);
    setOpen(null);
    setWarmOpen(false);
  }
  const reduced = useReducedMotion();
  // Hareket değişirken çıkan kart başlığın kimliğini bırakır: odak yeni kartın başlığına gider.
  const present = useIsPresent();
  const currentRef = useRef<HTMLDivElement>(null);
  const weighted = row.trackingType === 'weight_reps';
  const showTarget = !isStraight(sets.map((set) => set.target));
  const cardio = row.cardio ?? null;
  const walk = cardio === 'walk';
  // Bekleyen satırların girişi (kutulardaki değerler) bir kez; girişsiz bekleyen satır geçen seferkini (yoksa planı) gösterir.
  const entries = sets.map((set) => (set.logged ? null : entryOf(set)));
  const waitingKg = (set: SetView) => lastSetOf(row, set.setIndex)?.kg ?? set.plannedKg;
  const shown = sets.map((set, index) => {
    const entry = entries[index];
    const logged = set.logged;
    const text = (value: number | undefined) => (value !== undefined ? getFormat(locale).number(value) : '');
    const value = logged ? (logged.reps ?? logged.seconds) : entry?.value;
    return {
      kg: text(logged ? logged.kg : (entry?.kg ?? waitingKg(set))),
      value: text(walk && value !== undefined ? minutesOf(value) : value),
      distance: text(logged ? logged.distanceM : entry?.distanceM),
      incline: text(logged ? logged.inclinePct : entry?.inclinePct),
    };
  });
  // Set tablosunun sütunları (başlık ve satırlar ortak): Set · Önceki · (Hedef) · (kg) · tekrar/süre · (metre) · (eğim) · durum.
  // Kutulu sütunlar içlerindeki en uzun değere göre genişler (`boxColumn`); "Önceki" kalanı alır.
  const columns = [
    '2.5rem',
    'minmax(0,1fr)',
    ...(showTarget ? ['3rem'] : []),
    ...(weighted ? [boxColumn(shown.map((item) => item.kg), 3)] : []),
    boxColumn(shown.map((item) => item.value), 3.5),
    ...(cardio ? [boxColumn(shown.map((item) => item.distance), 3.5)] : []),
    ...(walk ? [boxColumn(shown.map((item) => item.incline), 3)] : []),
    '2.75rem',
  ].join(' ');
  const valueHead = walk ? t.minutesHead : row.trackingType === 'duration' ? t.durationHead : t.repsHead;
  const reason = row.plan.reason as SuggestionReason;
  // Öneri katmanının gerekçesi (§5.7): kısa çip ve tamamı; eski anlık görüntüde gerekçenin genel metni.
  const reasons = reasonLabels(locale);
  const reasonChip = row.why?.chip ?? reasons[reason] ?? '';
  // Kutular geçen seferkiyle dolu: öneri (artış, iniş) yalnız burada, danışan isterse kendisi uygular.
  const reasonDetail = t.reasonDetail(row.why?.detail ?? reasons[reason] ?? '', carriesLastTime(row));
  const reasonUp = row.why ? row.why.tone === 'up' : UP.has(reason);
  const warmDone = warmups.length > 0 && warmups.every((warmup) => warmup.logged);
  const toggle = (chip: 'reason' | 'note' | 'setup' | 'care') => setOpen(open === chip ? null : chip);
  // Danışanın kısıtından not (tasarım `kisit-tarama.md` §3.5): tanı adı yok, bölge ve taraf var.
  const care = row.care ? rowCareText(row.care, locale) : null;

  // Şu anki (ya da düzenlenen) satır panelin üstünde görünür kalsın (4+ sette, grupta tablo kayar).
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  }, [currentSetIndex, editingSetId, row.rowId, reduced]);

  const title = group ? `${group.members.find((member) => member.rowId === row.rowId)?.letter ?? ''}: ${row.title}` : row.title;

  return (
    <Card className="gap-0 py-0">
      {group ? <GroupHeader group={group} /> : null}
      <div className="relative">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={shownKey}
            initial={{ opacity: 0, x: WORKOUT.groupSlidePx }}
            animate={{ opacity: 1, x: 0, transition: tween(DURATION.base) }}
            exit={{ opacity: 0, x: -WORKOUT.groupSlidePx, transition: tween(DURATION.fast, EASE.exit) }}>
            <div className={cn('flex flex-col gap-1.5 px-3 pb-2', group ? 'pt-1' : 'pt-3')}>
              <h2
                id={present ? 'exercise-title' : undefined}
                tabIndex={-1}
                className={cn(group ? 'sr-only' : 'line-clamp-2 min-w-0 font-heading text-[1.1875rem] leading-tight font-semibold outline-none')}>
                {title}
              </h2>
              {care ? (
                <Chip
                  open={open === 'care'}
                  onToggle={() => toggle('care')}
                  tone={row.care?.kind === 'avoid' ? 'up' : 'plain'}
                  icon={<Bandaids />}
                  label={t.openCare(care.title)}
                  className="my-1.5 w-fit max-w-full">
                  {care.title}
                </Chip>
              ) : null}
              {open === 'care' && care ? (
                <div className="flex flex-col gap-2">
                  <p className="text-[0.8125rem] text-muted-foreground">{care.text}</p>
                  {row.care?.kind === 'avoid' && onSwap ? (
                    <Button className="h-11 w-fit" onClick={onSwap}>
                      {/* ⋯ menüsündeki "Muadil seç" ile aynı ikon: aynı iş. */}
                      <Swap data-icon="inline-start" />
                      {t.swap}
                    </Button>
                  ) : null}
                </div>
              ) : null}
              <div className="flex min-h-8 items-center gap-1.5 overflow-hidden">
                <Chip open={open === 'reason'} onToggle={() => toggle('reason')} tone={reasonUp ? 'up' : 'plain'} icon={<ReasonIcon reason={reason} tone={row.why?.tone} />}>
                  {reasonChip}
                </Chip>
                {setupNote ? (
                  <Chip open={open === 'setup'} onToggle={() => toggle('setup')} tone="plain" icon={<Wrench />} label={t.setupNamed(setupNote)} className="max-w-[45%]">
                    {setupNote}
                  </Chip>
                ) : null}
                {row.note ? (
                  <Chip open={open === 'note'} onToggle={() => toggle('note')} tone="plain" icon={<NotePencil />}>
                    {row.note}
                  </Chip>
                ) : null}
                {warmDone && !warmOpen ? (
                  <Chip open={false} onToggle={() => setWarmOpen(true)} tone="muted" icon={<Check weight="bold" />} className="shrink-0" label={t.warmupDone}>
                    {t.warmup}
                  </Chip>
                ) : null}
                {setupNote ? null : (
                  <Chip open={open === 'setup'} onToggle={() => toggle('setup')} tone="muted" icon={<Plus weight="bold" />} label={t.addSetup} className="shrink-0 px-2" />
                )}
              </div>
              {open === 'reason' ? <p className="text-[0.8125rem] text-muted-foreground">{reasonDetail}</p> : null}
              {open === 'note' ? <p className="text-[0.8125rem] text-muted-foreground">{ownProgram ? t.ownNote(row.note ?? '') : t.ptNote(row.note ?? '')}</p> : null}
              {open === 'setup' ? (
                <SetupNoteForm
                  note={setupNote}
                  onSave={(text) => {
                    onSetupNote(text);
                    setOpen(null);
                  }}
                />
              ) : null}
            </div>

            {warmups.length > 0 && (!warmDone || warmOpen) ? <WarmupRow warmups={warmups} onToggle={onToggleWarmup} /> : null}

            {/* ARIA tablosu: satırlar `SwipeRow` içinde kayabilsin diye `<table>` değil (`WorkoutSetRow`). 375 px'te: 40 + Önceki +
                (48) + kg (en az 48) + tekrar (en az 56) + 44; kutulu sütunlar içlerindeki en uzun değer kadar genişler ("102,5" 70 px).
                Kardiyoda kg yerine süreden sonra mesafe ve yürüyüş/koşuda eğim; "Önceki" iki satıra sarar. Başlık ve satırlar aynı
                şablonu paylaşır. */}
            <div role="table" aria-label={t.table(row.title)} className="text-sm tabular-nums">
              <div role="rowgroup">
                <div role="row" style={{ gridTemplateColumns: columns }} className="grid h-6 items-center border-t">
                  <span role="columnheader" className="pl-3 text-xs font-medium text-muted-foreground">
                    {t.setHead}
                  </span>
                  <span role="columnheader" className="px-2 text-xs font-medium text-muted-foreground">
                    {t.previousHead}
                  </span>
                  {showTarget ? (
                    <span role="columnheader" className="px-2 text-xs font-medium text-muted-foreground">
                      {t.targetHead}
                    </span>
                  ) : null}
                  {weighted ? (
                    <span role="columnheader" className="px-2 text-xs font-medium text-muted-foreground">
                      {t.kgHead}
                    </span>
                  ) : null}
                  <span role="columnheader" className="px-2 text-xs font-medium text-muted-foreground">
                    {valueHead}
                  </span>
                  {cardio ? (
                    <span role="columnheader" className="px-2 text-xs font-medium text-muted-foreground">
                      {t.metersHead}
                    </span>
                  ) : null}
                  {walk ? (
                    <span role="columnheader" className="px-2 text-xs font-medium text-muted-foreground">
                      {t.inclineHead}
                    </span>
                  ) : null}
                  <span role="columnheader">
                    <span className="sr-only">{t.statusHead}</span>
                  </span>
                </div>
              </div>
              <SwipeGroup>
                <div role="rowgroup">
                  {sets.map((set, index) => {
                    const logged = set.logged;
                    const highlight = editingSetId !== null ? (logged?.id === editingSetId ? 'editing' : null) : set.setIndex === currentSetIndex ? 'current' : null;
                    return (
                      <WorkoutSetRow
                        key={set.extra ? `extra-${set.setIndex}` : set.setIndex}
                        set={set}
                        trackingType={row.trackingType}
                        cardio={cardio}
                        bodyMassKg={bodyMassKg}
                        showTarget={showTarget}
                        group={group !== null}
                        highlight={highlight}
                        currentKg={currentKg}
                        waitingKg={waitingKg(set)}
                        entry={entries[index] ?? null}
                        fresh={logged !== undefined && logged.id === freshSetId}
                        rowRef={highlight ? currentRef : undefined}
                        columns={columns}
                        locked={locked || highlight === 'editing'}
                        onEdit={onEditSet}
                        onFix={onFixSet}
                        onUntick={onUntickSet}
                        onDelete={onDeleteSet}
                        onDropExtra={onDropExtra}
                        onDrop={logged ? null : dropOf(set)}
                      />
                    );
                  })}
                </div>
              </SwipeGroup>
            </div>
            {walk && bodyMassKg === undefined ? (
              <p className="border-t px-3 py-2 text-xs text-muted-foreground">{t.kcalNote}</p>
            ) : null}
            {onAddSet ? (
              <Button variant="ghost" className="h-11 w-full justify-start gap-2 rounded-none border-t px-3 text-primary hover:text-primary" onClick={onAddSet}>
                <Plus data-icon="inline-start" weight="bold" />
                {group ? t.addRound : t.addSet}
              </Button>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>
    </Card>
  );
}
