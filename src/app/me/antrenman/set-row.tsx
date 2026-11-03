'use client';

import { useEffect, useRef, useState } from 'react';
import { NumberField } from '@base-ui/react/number-field';
import { motion } from 'motion/react';
import { ArrowUp } from '@phosphor-icons/react';
import { Check, X } from '@/components/line-icons';
import { SwipeRow, deleteAction } from '@/components/swipe/swipe-row';
import { NUMBER_FORMAT, WHOLE_FORMAT } from '@/components/ui/stepper';
import { CARDIO_LIMITS, distanceText, durationClock, inclineText, minutesOf, walkKcal, type CardioKind } from '@/lib/cardio';
import { formatNumber } from '@/lib/format';
import { DURATION, tween } from '@/lib/motion';
import type { TrackingType } from '@/lib/progression';
import { SESSION_LIMITS } from '@/lib/schemas/session';
import { cn } from '@/lib/utils';
import { previousText, setValueText, targetCell, type SetValues, type SetView } from '@/lib/workout-session';

/** Şu anki satırın ✓'u: panel kapalıyken "Set bitti"nin yerine klavye odağının gideceği yer. */
export const ROW_DONE_ID = 'set-done-row';

/** Hücredeki kutuya dokunmak satırın tıklaması değil (yapılmış satırı panelde açmaz, bekleyeni yeniden seçmez). */
const stop = (event: React.MouseEvent) => event.stopPropagation();

/** Satırın düzenleme düğmesinin kimliği: panel kapanınca klavye odağı ona döner. */
export function setEditButtonId(setId: string): string {
  return `set-edit-${setId}`;
}

const CELL = 'flex min-w-0 items-center p-2 whitespace-nowrap';
/** Şu anki satırın kutulu hücresi: kutu sütunu doldursun diye yatay boşluk dar. */
const INPUT_CELL = 'flex min-w-0 items-center px-1 py-1.5 whitespace-nowrap';

/**
 * Bekleyen bir setin satırdan girişi: kg ve tekrar/süre kutuları alttaki panelin stepper'larıyla aynı taslağı yazar, ✓ "Set
 * bitti" ile aynı işi yapar. Setler istenen sırayla yapılır: kutusuna ya da satıra dokunmak seti seçer (sıradaki set o olur,
 * panel ve şerit ona geçer). Panel kapalıyken set yalnız buradan girilir.
 */
export type RowEntry = {
  kg: number | undefined;
  value: number;
  /** Kardiyoda önceden dolu (ya da yazılan) mesafe ve eğim. */
  distanceM: number | undefined;
  inclinePct: number | undefined;
  /** Aşırı yük soruluyor: kg kutusu kırmızı çizgili. */
  invalid: boolean;
  /** Kaydedilirken ya da süreli set sayarken kutular ve ✓ kapalı. */
  disabled: boolean;
  /** Seti seçer; zaten seçiliyse bir şey yapmaz. */
  onSelect: () => void;
  onChange: (values: SetValues) => void;
  onDone: () => void;
};

/** Yapılmış setin yerinde düzeltilmesi: kutudan çıkınca (Enter) yazılır. */
export type FixSet = (setId: string, values: SetValues) => void;

/**
 * Hücredeki sayı kutusu (Base UI NumberField, stepper'sız): dokununca klavye açılır, virgül de nokta da ondalık
 * (`NUMBER_FORMAT`). Bekleyen sette yazarken her geçerli değer taslağa gider; yapılmış sette (`settled`) değer kutudan
 * çıkınca yazılır, kutu çerçevesizdir (değer yazı gibi durur, dokununca çerçevelenir). Boş bırakılıp çıkılırsa kutu değere
 * döner. Enter klavyeyi kapatır. Dokunmatikte yazı 16 px (iOS daha küçük yazılı kutuya odaklanınca sayfayı yakınlaştırır).
 */
function CellNumber({
  value,
  max,
  decimal,
  invalid,
  disabled,
  label,
  settled = false,
  onFocus,
  onChange,
}: {
  value: number | undefined;
  max: number;
  decimal: boolean;
  invalid: boolean;
  disabled: boolean;
  label: string;
  settled?: boolean;
  onFocus?: (() => void) | undefined;
  onChange: (value: number) => void;
}) {
  // Boşaltılıp bırakılan kutu değere dönsün diye kutu yeniden kurulur (`Stepper` gibi).
  const [resetKey, setResetKey] = useState(0);
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  });
  const accept = (next: number | null) => {
    if (next !== null && Number.isFinite(next)) onChange(Math.min(max, Math.max(0, decimal ? next : Math.round(next))));
  };
  return (
    <NumberField.Root
      key={resetKey}
      value={value ?? null}
      min={0}
      max={max}
      step={decimal ? 0.5 : 1}
      locale="tr-TR"
      format={decimal ? NUMBER_FORMAT : WHOLE_FORMAT}
      disabled={disabled}
      onValueChange={settled ? undefined : accept}
      onValueCommitted={settled ? accept : undefined}>
      <NumberField.Input
        inputMode={decimal ? 'decimal' : 'numeric'}
        enterKeyHint="done"
        aria-label={label}
        aria-invalid={invalid || undefined}
        onFocus={onFocus}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
        onBlur={(event) => {
          const box = event.currentTarget;
          window.setTimeout(() => {
            if (box.value.trim() === '' && latest.current !== undefined) setResetKey((key) => key + 1);
          }, 0);
        }}
        className={cn(
          'h-9 w-full min-w-0 rounded-md border px-1 text-sm font-semibold tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 touch:text-base',
          settled ? 'border-transparent bg-transparent' : 'border-input bg-background/60',
        )}
      />
    </NumberField.Root>
  );
}

/**
 * Set tablosunun bir satırı (tasarım §2.4). ARIA tablosu (`role="row"`, `role="cell"`): satır `SwipeRow` içinde kayabilsin
 * diye `<tr>` değil; başlık ve satırlar aynı sütun şablonunu paylaşır (`columns`), ekran okuyucuda tablo kalır.
 *
 * - Yapılan sete dokunmak onu alttaki panelde düzenlemeye açar (`onEdit`); klavyede set numarası düğmedir ("Set 2, 40 kg ×
 *   6. Düzenle"). ✓ bir anahtardır: dokunmak işareti kaldırır (set silinir, 8 sn "Geri al"; `onUntick`).
 * - Sola kaydırmak her listedeki gibi kırmızı **Sil**'i açar (`SwipeRow`, `deleteAction`); sonuna kadar kaydırmak siler,
 *   onay yok, 8 sn "Geri al". Klavye ve ekran okuyucu için karşılığı panelin "Seti sil"i. Kartta aynı anda tek satır açık
 *   (`SwipeGroup`); dışarı dokunmak ve Esc kapatır, açık satıra dokunmak yalnız kapatır.
 * - `locked` (set kaydedilirken, süreli set sayarken, düzenlenen satırda) ya da bekleyen set: kaydırma yok.
 * - Her bekleyen set `entry` alır: kg ve tekrar/süre hücreleri yazılabilir kutu, son hücrede boş ✓ ("yapıldı" işaretle;
 *   "Set bitti" ile aynı). Setler istenen sırayla yapılır: kutuya ya da satıra dokunmak seti seçer. Bekleyen fazladan setin
 *   ✕'u (sil) o zaman "Önceki" hücresinde ("fazladan ✕").
 * - Yapılmış setin kg ve tekrar/süresi de yerinde düzeltilir (`onFix`): çerçevesiz kutu, kutudan çıkınca yazılır.
 */
export function SetRow({
  set,
  trackingType,
  cardio,
  bodyMassKg,
  showTarget,
  group,
  highlight,
  currentKg,
  entry,
  fresh,
  rowRef,
  columns,
  locked,
  onEdit,
  onFix,
  onUntick,
  onDelete,
  onDropExtra,
}: {
  set: SetView;
  trackingType: TrackingType;
  /** Kardiyo satırı: mesafe hücresi, yürüyüş/koşuda eğim hücresi, süre dakika ve yapılmış sette kalori (`cardio.ts`). */
  cardio: CardioKind | null;
  /** Danışanın kilosu (ölçüm onayıyla); yoksa kalori yazılmaz. */
  bodyMassKg: number | undefined;
  showTarget: boolean;
  /** Grupta bekleyen fazladan satırın ✕'u "turu sil" der. */
  group: boolean;
  /** Şeritli satır: şu anki set (`current`) ya da paneldeki düzenlenen set (`editing`). */
  highlight: 'current' | 'editing' | null;
  /** Şu anki setin önceden dolu (ya da değiştirilmiş) ağırlığı. */
  currentKg: number | undefined;
  /** Bekleyen setin satırdan girişi; yapılmış satırda ve düzenleme açıkken null. */
  entry: RowEntry | null;
  /** Az önce kaydedildi: ✓ belirerek gelir. */
  fresh: boolean;
  rowRef?: React.Ref<HTMLDivElement> | undefined;
  /** Başlıkla ortak sütun şablonu (`grid-template-columns`). */
  columns: string;
  locked: boolean;
  onEdit: (setId: string) => void;
  /** Yapılmış setin yerinde düzeltilmesi; düzenleme açıkken null. */
  onFix: FixSet | null;
  onUntick: (setId: string) => void;
  onDelete: (setId: string) => void;
  onDropExtra: () => void;
}) {
  const logged = set.logged;
  const swipeable = Boolean(logged) && !locked;
  const weighted = trackingType === 'weight_reps';
  const kg = logged ? logged.kg : highlight === 'current' ? currentKg : set.plannedKg;
  const value = logged ? (logged.reps ?? logged.seconds) : undefined;
  const label = `Set ${set.position + 1}`;
  const amrap = Boolean(set.target.amrap);
  const input = logged ? null : entry;
  const fix = logged && onFix ? onFix : null;
  const duration = trackingType === 'duration';
  const walk = cardio === 'walk';
  const valueLabel = `${label}, ${walk ? 'süre (dk)' : duration ? 'süre (sn)' : amrap ? 'yaptığın tekrar' : 'tekrar'}`;
  const kcal = logged && walk ? walkKcal(logged, bodyMassKg) : null;
  // Yürüyüş/koşuda süre kutusu dakika (saniye saklanır).
  const shownValue = (seconds: number | undefined) => (walk && seconds !== undefined ? minutesOf(seconds) : seconds);
  const storedValue = (shown: number) => (walk ? Math.round(shown * 60) : shown);
  const valueText = (seconds: number) => (walk ? durationClock(seconds) : duration ? `${seconds} sn` : String(seconds));
  const cardioCell = (key: 'distanceM' | 'inclinePct', text: (value: number) => string) => {
    const current = input ? input[key] : logged?.[key];
    return input || fix ? (
      <div role="cell" onClick={stop} className={INPUT_CELL}>
        <CellNumber
          value={current}
          max={key === 'distanceM' ? CARDIO_LIMITS.distanceMax : CARDIO_LIMITS.inclineMax}
          decimal={key === 'inclinePct'}
          invalid={false}
          disabled={input ? input.disabled : locked}
          label={`${label}, ${key === 'distanceM' ? 'mesafe (m)' : 'eğim (%)'}`}
          settled={!input}
          onFocus={input?.onSelect}
          onChange={(changed) => (input ? input.onChange({ [key]: changed }) : logged && fix?.(logged.id, { [key]: changed }))}
        />
      </div>
    ) : (
      <div role="cell" className={cn(CELL, logged ? 'font-semibold' : 'text-muted-foreground')}>
        {current !== undefined ? text(current) : '—'}
      </div>
    );
  };

  return (
    <SwipeRow
      id={logged?.id ?? `set-${set.setIndex}${set.extra ? '-extra' : ''}`}
      end={logged ? [deleteAction(() => onDelete(logged.id), { removes: false })] : []}
      disabled={!swipeable}>
      <div
        ref={rowRef}
        role="row"
        data-set-row={logged?.id}
        aria-current={highlight === 'current' ? 'step' : highlight === 'editing' ? 'true' : undefined}
        style={{ gridTemplateColumns: columns }}
        onClick={logged ? () => onEdit(logged.id) : input && !input.disabled ? input.onSelect : undefined}
        className={cn(
          'grid h-12 scroll-mb-3 border-b bg-card transition-colors',
          highlight && 'bg-[color-mix(in_oklab,var(--primary)_10%,var(--card))]',
          (logged || input) && 'cursor-pointer',
        )}>
        <div role="cell" className={cn(CELL, 'relative pl-3 font-medium')}>
          {highlight ? (
            <motion.span layoutId="current-set-strip" transition={tween(DURATION.base)} className="absolute inset-y-0 left-0 w-[3px] bg-primary-strong" aria-hidden />
          ) : null}
          {logged ? (
            <button
              type="button"
              id={setEditButtonId(logged.id)}
              aria-label={`${label}, ${setValueText(logged, bodyMassKg)}. Düzenle`}
              onClick={(event) => {
                event.stopPropagation();
                onEdit(logged.id);
              }}
              className="-my-2 -ml-1 inline-flex h-11 min-w-7 items-center rounded-md px-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              {set.position + 1}
            </button>
          ) : (
            set.position + 1
          )}
          {amrap ? <span className="sr-only">, AMRAP</span> : null}
        </div>
        <div
          role="cell"
          className={cn(CELL, 'block truncate self-center text-muted-foreground', cardio && 'text-xs leading-tight whitespace-normal')}>
          {set.extra && input ? (
            // Yalnız ✕ siler (onaysız, 8 sn "Geri al"): yazıya dokunmak satırı seçer.
            <span className="inline-flex max-w-full items-center">
              <span className="truncate">fazladan</span>
              <button
                type="button"
                disabled={input.disabled}
                aria-label={`${label}, fazladan: ${group ? 'turu' : 'seti'} sil`}
                onClick={(event) => {
                  event.stopPropagation();
                  onDropExtra();
                }}
                className="-my-2 inline-flex size-9 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 [&_svg]:size-3.5">
                <X weight="bold" />
              </button>
            </span>
          ) : set.extra ? (
            'fazladan'
          ) : (
            previousText(set.previous, trackingType, cardio)
          )}
          {kcal ? <span className="block font-medium text-primary-text">≈ {kcal} kcal</span> : null}
        </div>
        {showTarget ? (
          <div role="cell" className={cn(CELL, 'text-muted-foreground')}>
            {targetCell(set.target, trackingType, cardio)}
          </div>
        ) : null}
        {weighted && (input || fix) ? (
          <div role="cell" onClick={stop} className={cn(INPUT_CELL, 'relative')}>
            <CellNumber
              value={input ? input.kg : kg}
              max={SESSION_LIMITS.kg}
              decimal
              invalid={input?.invalid ?? false}
              disabled={input ? input.disabled : locked}
              label={`${label}, ağırlık (kg)`}
              settled={!input}
              onFocus={input?.onSelect}
              onChange={(next) => (input ? input.onChange({ kg: next }) : logged && fix?.(logged.id, { kg: next }))}
            />
            {logged?.overload ? (
              <>
                <ArrowUp weight="bold" className="pointer-events-none absolute top-1/2 right-2 size-3 -translate-y-1/2 text-destructive-text" aria-hidden />
                <span className="sr-only">, hedefin çok üzerinde</span>
              </>
            ) : null}
          </div>
        ) : weighted ? (
          <div role="cell" className={cn(CELL, logged ? 'font-semibold' : 'text-muted-foreground')}>
            <span className="inline-flex items-center gap-0.5">
              {kg !== undefined ? formatNumber(kg) : '—'}
              {logged?.overload ? (
                <>
                  <ArrowUp weight="bold" className="size-3.5 text-destructive-text" aria-hidden />
                  <span className="sr-only">, hedefin çok üzerinde</span>
                </>
              ) : null}
            </span>
          </div>
        ) : null}
        {input || fix ? (
          <div role="cell" onClick={stop} className={INPUT_CELL}>
            <CellNumber
              value={shownValue(input ? input.value : value)}
              max={walk ? SESSION_LIMITS.seconds / 60 : duration ? SESSION_LIMITS.seconds : SESSION_LIMITS.reps}
              decimal={walk}
              invalid={false}
              disabled={input ? input.disabled : locked}
              label={valueLabel}
              settled={!input}
              onFocus={input?.onSelect}
              onChange={(changed) =>
                input ? input.onChange({ value: storedValue(changed) }) : logged && fix?.(logged.id, { value: storedValue(changed) })
              }
            />
          </div>
        ) : (
          <div role="cell" className={cn(CELL, logged ? 'font-semibold' : 'text-muted-foreground')}>
            {value !== undefined ? valueText(value) : amrap && !showTarget ? targetCell(set.target, trackingType, cardio) : '—'}
          </div>
        )}
        {cardio ? cardioCell('distanceM', distanceText) : null}
        {walk ? cardioCell('inclinePct', inclineText) : null}
        <div role="cell" className={cn(CELL, 'justify-center p-0')}>
          {logged ? (
            <button
              type="button"
              aria-label={`${label}, ${setValueText(logged, bodyMassKg)}, yapıldı. İşareti kaldır`}
              onClick={(event) => {
                event.stopPropagation();
                onUntick(logged.id);
              }}
              className="inline-flex size-11 items-center justify-center rounded-full align-middle outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              <motion.span
                initial={fresh ? { scale: 0.6, opacity: 0 } : false}
                animate={{ scale: 1, opacity: 1 }}
                transition={tween(DURATION.fast)}
                className="inline-flex size-7 items-center justify-center rounded-full bg-primary/20 text-primary [&_svg]:size-4">
                <Check weight="bold" />
              </motion.span>
            </button>
          ) : input ? (
            <button
              type="button"
              id={highlight === 'current' ? ROW_DONE_ID : undefined}
              disabled={input.disabled}
              aria-label={`${label}, ${weighted && input.kg !== undefined ? `${formatNumber(input.kg)} kg × ${input.value}` : duration ? valueText(input.value) : `${input.value} tekrar`}: yapıldı olarak işaretle`}
              onClick={(event) => {
                event.stopPropagation();
                input.onDone();
              }}
              className="inline-flex size-11 items-center justify-center rounded-full align-middle outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50">
              <span className="inline-flex size-7 items-center justify-center rounded-full border-2 border-muted-foreground/50 text-muted-foreground transition-colors active:border-primary active:text-primary [&_svg]:size-4">
                <Check weight="bold" />
              </span>
            </button>
          ) : set.extra ? (
            <button
              type="button"
              aria-label={`${label}, fazladan: ${group ? 'turu' : 'seti'} sil`}
              onClick={(event) => {
                event.stopPropagation();
                onDropExtra();
              }}
              className="inline-flex size-11 items-center justify-center rounded-full align-middle text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-4">
              <X weight="bold" />
            </button>
          ) : null}
        </div>
      </div>
    </SwipeRow>
  );
}
