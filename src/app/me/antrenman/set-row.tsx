'use client';

import { useEffect, useRef, useState } from 'react';
import { NumberField } from '@base-ui/react/number-field';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { ArrowUp, Trash } from '@phosphor-icons/react';
import { Check, X } from '@/components/line-icons';
import { NUMBER_FORMAT, WHOLE_FORMAT } from '@/components/ui/stepper';
import { formatNumber } from '@/lib/format';
import { DURATION, INSTANT, SWIPE, tween } from '@/lib/motion';
import type { TrackingType } from '@/lib/progression';
import { SESSION_LIMITS } from '@/lib/schemas/session';
import { cn } from '@/lib/utils';
import { previousText, setValueText, targetCell, type SetView } from '@/lib/workout-session';

/** Şu anki satırın ✓'u: panel kapalıyken "Set bitti"nin yerine klavye odağının gideceği yer. */
export const ROW_DONE_ID = 'set-done-row';

/** Satırın düzenleme düğmesinin kimliği: panel kapanınca klavye odağı ona döner. */
export function setEditButtonId(setId: string): string {
  return `set-edit-${setId}`;
}

/** Açılan "Sil"in genişliği (`SwipeRow`'un düğmesiyle aynı). */
const REVEAL = SWIPE.actionWidth;

/** Sola çekme düğmenin ötesinde dirençle sürer; sağa (kapalıyken) hiç. */
function dragged(value: number): number {
  if (value >= 0) return 0;
  return value < -REVEAL ? -REVEAL + (value + REVEAL) * 0.25 : value;
}

const CELL = 'p-2 align-middle whitespace-nowrap';
/** Şu anki satırın kutulu hücresi: kutu sütunu doldursun diye yatay boşluk dar. */
const INPUT_CELL = 'px-1 py-1.5 align-middle whitespace-nowrap';

/**
 * Şu anki (sıradaki) setin satırdan girişi: kg ve tekrar/süre kutuları alttaki panelin stepper'larıyla aynı taslağı yazar,
 * ✓ "Set bitti" ile aynı işi yapar. Panel kapalıyken set yalnız buradan girilir.
 */
export type RowEntry = {
  kg: number | undefined;
  value: number;
  /** Aşırı yük soruluyor: kg kutusu kırmızı çizgili. */
  invalid: boolean;
  /** Kaydedilirken ya da süreli set sayarken kutular ve ✓ kapalı. */
  disabled: boolean;
  onChange: (values: { kg?: number | undefined; value?: number | undefined }) => void;
  onDone: () => void;
};

/**
 * Hücredeki sayı kutusu (Base UI NumberField, stepper'sız): dokununca klavye açılır, virgül de nokta da ondalık
 * (`NUMBER_FORMAT`). Yazarken her geçerli değer taslağa gider; boş bırakılıp çıkılırsa kutu taslağın değerine döner. Enter
 * klavyeyi kapatır. Dokunmatikte yazı 16 px (iOS daha küçük yazılı kutuya odaklanınca sayfayı yakınlaştırır).
 */
function CellNumber({
  value,
  max,
  decimal,
  invalid,
  disabled,
  label,
  onChange,
}: {
  value: number | undefined;
  max: number;
  decimal: boolean;
  invalid: boolean;
  disabled: boolean;
  label: string;
  onChange: (value: number) => void;
}) {
  // Boşaltılıp bırakılan kutu değere dönsün diye kutu yeniden kurulur (`Stepper` gibi).
  const [resetKey, setResetKey] = useState(0);
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  });
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
      onValueChange={(next) => {
        if (next !== null && Number.isFinite(next)) onChange(Math.min(max, Math.max(0, decimal ? next : Math.round(next))));
      }}>
      <NumberField.Input
        inputMode={decimal ? 'decimal' : 'numeric'}
        enterKeyHint="done"
        aria-label={label}
        aria-invalid={invalid || undefined}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
        onBlur={(event) => {
          const box = event.currentTarget;
          window.setTimeout(() => {
            if (box.value.trim() === '' && latest.current !== undefined) setResetKey((key) => key + 1);
          }, 0);
        }}
        className="h-9 w-full min-w-0 rounded-md border border-input bg-background/60 px-1 text-sm font-semibold tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 touch:text-base"
      />
    </NumberField.Root>
  );
}

/**
 * Bu basışın `click`'ini yutar (`SwipeRow`'daki gibi, iOS: açık "Sil" varken tablodaki ilk dokunuş yalnız kapatır, dokunulan
 * satırı düzenlemeye açmaz ya da ✓'unu kaldırmaz). Tıklama gelmezse (kaydırma, uzun basış) yutucu kendiliğinden kalkar.
 */
export function swallowClick(down: PointerEvent) {
  const onClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    release();
  };
  const onEnd = (event: PointerEvent) => {
    if (event.pointerId !== down.pointerId) return;
    window.setTimeout(release, event.type === 'pointercancel' ? 0 : 400);
  };
  const release = () => {
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('pointerup', onEnd, true);
    document.removeEventListener('pointercancel', onEnd, true);
  };
  document.addEventListener('click', onClick, true);
  document.addEventListener('pointerup', onEnd, true);
  document.addEventListener('pointercancel', onEnd, true);
}

type Track = { id: number; x: number; y: number; base: number; dragging: boolean; lastX: number; lastT: number; velocity: number };

/**
 * Set tablosunun bir satırı (tasarım §2.4). Gerçek `<tr>`: tablo ekran okuyucuda tablo kalır.
 *
 * - Yapılan sete dokunmak onu alttaki panelde düzenlemeye açar (`onEdit`); klavyede set numarası düğmedir ("Set 2, 40 kg ×
 *   6. Düzenle"). ✓ bir anahtardır: dokunmak işareti kaldırır (set silinir, toast'ta "Geri al"; `onUntick`).
 * - Yalnız dokunmatikte sola kaydırmak sağda yıkıcı **Sil**'i açar (`SwipeRow`'un eşikleri ve yayı); dokununca set silinir,
 *   onay yok, toast'ta "Geri al". Klavye ve ekran okuyucu için karşılığı panelin "Seti sil"i, bu yüzden "Sil" `aria-hidden`
 *   ve sekme sırasında değil (`SwipeRow` gibi). Kartta aynı anda tek satır açık (`open`, `onOpenChange`); dışarı dokunmak ve
 *   Esc kapatır (kart dinler), açık satıra dokunmak yalnız kapatır. Kaydırmanın ardından gelen tıklama yutulur: kaydırma
 *   düzenlemeyi açmaz.
 * - `<tr>` kaydırılmaz (tablo satırına `transform` ve `touch-action` uygulanmaz): hücreler birlikte kayar, "Sil" son hücrenin
 *   içinde satırın sağ kenarında durur ve hücrelerin bıraktığı yeri doldurur. Dikey kaydırma tarayıcıda kalır (hücrelerde
 *   `touch-action: pan-y`); dikey hareket kaydırmayı başlatmaz.
 * - Hareket azaltma tercihinde "Sil" yaysız, anında açılıp kapanır (parmağı izlemek doğrudan işlemdir, kalır).
 * - `locked` (set kaydedilirken, süreli set sayarken, düzenlenen satırda): kaydırma yok; dokunuşlar ekrana gider, o karar verir.
 * - Şu anki (sıradaki) set `entry` alır: kg ve tekrar/süre hücreleri yazılabilir kutu, son hücrede boş ✓ ("yapıldı" işaretle;
 *   "Set bitti" ile aynı). Diğer bekleyen satırlar yalnız okunur: setler sırayla girilir.
 */
export function SetRow({
  set,
  trackingType,
  showTarget,
  group,
  highlight,
  currentKg,
  entry,
  fresh,
  rowRef,
  open,
  locked,
  onOpenChange,
  onEdit,
  onUntick,
  onDelete,
  onDropExtra,
}: {
  set: SetView;
  trackingType: TrackingType;
  showTarget: boolean;
  /** Grupta bekleyen fazladan satırın ✕'u "turu kaldır" der. */
  group: boolean;
  /** Şeritli satır: şu anki set (`current`) ya da paneldeki düzenlenen set (`editing`). */
  highlight: 'current' | 'editing' | null;
  /** Şu anki setin önceden dolu (ya da değiştirilmiş) ağırlığı. */
  currentKg: number | undefined;
  /** Şu anki (bekleyen) setin satırdan girişi; diğer satırlarda null. */
  entry: RowEntry | null;
  /** Az önce kaydedildi: ✓ belirerek gelir. */
  fresh: boolean;
  rowRef?: React.Ref<HTMLTableRowElement> | undefined;
  open: boolean;
  locked: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (setId: string) => void;
  onUntick: (setId: string) => void;
  onDelete: (setId: string) => void;
  onDropExtra: () => void;
}) {
  const reduced = useReducedMotion() ?? false;
  const x = useMotionValue(0);
  const width = useTransform(x, (value) => Math.max(0, -value));
  // "Sil" çizili: kaydırma, açık panel ya da kapanış sürüyor.
  const [active, setActive] = useState(false);
  const track = useRef<Track | null>(null);
  const swiped = useRef(false);
  const logged = set.logged;
  const swipeable = Boolean(logged) && !locked;
  const weighted = trackingType === 'weight_reps';
  const kg = logged ? logged.kg : highlight === 'current' ? currentKg : set.plannedKg;
  const value = logged ? (logged.reps ?? logged.seconds) : undefined;
  const label = `Set ${set.position + 1}`;
  const amrap = Boolean(set.target.amrap);
  const input = logged ? null : entry;
  const duration = trackingType === 'duration';

  const settle = (to: 'open' | 'closed') => {
    if (to === 'open') setActive(true);
    void animate(x, to === 'open' ? -REVEAL : 0, reduced ? INSTANT : SWIPE.spring).then(() => {
      if (x.get() === 0 && !track.current?.dragging) setActive(false);
    });
  };
  const latestSettle = useRef(settle);
  useEffect(() => {
    latestSettle.current = settle;
  });

  // Kart kapattı (başka satır açıldı, dışarı dokunuldu, Esc, kilit) ya da set artık kaydırılmıyor.
  useEffect(() => {
    if ((!open || !swipeable) && !track.current?.dragging && x.get() !== 0) latestSettle.current('closed');
  }, [open, swipeable, x]);

  const end = (event: React.PointerEvent, cancelled: boolean) => {
    const start = track.current;
    if (!start || event.pointerId !== start.id) return;
    track.current = null;
    if (!start.dragging) return;
    // Yarıdan fazla çekildiyse ya da sola fırlatıldıysa açık kalır; sağa fırlatmak kapatır.
    const opened = !cancelled && (start.velocity < -SWIPE.flingVelocity || (start.velocity <= SWIPE.flingVelocity && x.get() < -REVEAL / 2));
    onOpenChange(opened);
    settle(opened ? 'open' : 'closed');
  };

  const cellStyle = { x, ...(logged ? { touchAction: 'pan-y pinch-zoom' } : {}) };

  return (
    <tr
      ref={rowRef}
      data-slot="table-row"
      data-set-row={logged?.id}
      aria-current={highlight === 'current' ? 'step' : highlight === 'editing' ? 'true' : undefined}
      onPointerDown={(event) => {
        swiped.current = false;
        track.current =
          swipeable && event.pointerType === 'touch' && event.isPrimary
            ? { id: event.pointerId, x: event.clientX, y: event.clientY, base: open ? -REVEAL : 0, dragging: false, lastX: event.clientX, lastT: event.timeStamp, velocity: 0 }
            : null;
      }}
      onPointerMove={(event) => {
        const start = track.current;
        if (!start || event.pointerId !== start.id) return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (!start.dragging) {
          // `useCardGesture`'ın hakemi: yatay niyet kaydırır, dikey niyet sayfayı (tarayıcı) kaydırır, azı dokunmadır. Kapalı
          // satırı sağa çekmek bir şey açmaz: kaydırma sayılmaz (başka satırın "Sil"ini de kapatmaz).
          if (Math.abs(dx) > SWIPE.startDistance && Math.abs(dx) > SWIPE.directionRatio * Math.abs(dy) && start.base + dx < 0) {
            start.dragging = true;
            swiped.current = true;
            setActive(true);
            onOpenChange(true);
          } else {
            if (Math.abs(dy) > SWIPE.scrollSlop) track.current = null;
            return;
          }
        }
        const elapsed = event.timeStamp - start.lastT;
        if (elapsed > 0) start.velocity = ((event.clientX - start.lastX) / elapsed) * 1000;
        start.lastX = event.clientX;
        start.lastT = event.timeStamp;
        x.set(dragged(start.base + dx));
      }}
      onPointerUp={(event) => end(event, false)}
      onPointerCancel={(event) => end(event, true)}
      onClickCapture={(event) => {
        // Klavyeyle gelen tıklama (`detail` 0) kaydırma değildir.
        if (event.detail === 0) return;
        const onAction = event.target instanceof Element && event.target.closest('[data-set-swipe-action]') !== null;
        if (swiped.current || (open && !onAction)) {
          event.preventDefault();
          event.stopPropagation();
          if (!swiped.current) onOpenChange(false);
          swiped.current = false;
        }
      }}
      onClick={logged ? () => onEdit(logged.id) : undefined}
      className={cn(
        'h-12 scroll-mb-3 border-b transition-colors',
        highlight && 'bg-primary/10',
        logged && 'cursor-pointer',
      )}>
      <motion.td data-slot="table-cell" style={cellStyle} className={cn(CELL, 'relative pl-3 font-medium')}>
        {highlight ? (
          <motion.span layoutId="current-set-strip" transition={tween(DURATION.base)} className="absolute inset-y-0 left-0 w-[3px] bg-primary-strong" aria-hidden />
        ) : null}
        {logged ? (
          <button
            type="button"
            id={setEditButtonId(logged.id)}
            aria-label={`${label}, ${setValueText(logged)}. Düzenle`}
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
      </motion.td>
      <motion.td data-slot="table-cell" style={cellStyle} className={cn(CELL, 'truncate text-muted-foreground')}>
        {set.extra ? 'fazladan' : previousText(set.previous, trackingType)}
      </motion.td>
      {showTarget ? (
        <motion.td data-slot="table-cell" style={cellStyle} className={cn(CELL, 'text-muted-foreground')}>
          {targetCell(set.target, trackingType)}
        </motion.td>
      ) : null}
      {weighted && input ? (
        <td data-slot="table-cell" className={INPUT_CELL}>
          <CellNumber
            value={input.kg}
            max={SESSION_LIMITS.kg}
            decimal
            invalid={input.invalid}
            disabled={input.disabled}
            label={`${label}, ağırlık (kg)`}
            onChange={(kg) => input.onChange({ kg })}
          />
        </td>
      ) : weighted ? (
        <motion.td data-slot="table-cell" style={cellStyle} className={cn(CELL, logged ? 'font-semibold' : 'text-muted-foreground')}>
          <span className="inline-flex items-center gap-0.5">
            {kg !== undefined ? formatNumber(kg) : '—'}
            {logged?.overload ? (
              <>
                <ArrowUp weight="bold" className="size-3.5 text-destructive-text" aria-hidden />
                <span className="sr-only">, hedefin çok üzerinde</span>
              </>
            ) : null}
          </span>
        </motion.td>
      ) : null}
      {input ? (
        <td data-slot="table-cell" className={INPUT_CELL}>
          <CellNumber
            value={input.value}
            max={duration ? SESSION_LIMITS.seconds : SESSION_LIMITS.reps}
            decimal={false}
            invalid={false}
            disabled={input.disabled}
            label={`${label}, ${duration ? 'süre (sn)' : amrap ? 'yaptığın tekrar' : 'tekrar'}`}
            onChange={(changed) => input.onChange({ value: changed })}
          />
        </td>
      ) : (
        <motion.td data-slot="table-cell" style={cellStyle} className={cn(CELL, logged ? 'font-semibold' : 'text-muted-foreground')}>
          {value !== undefined ? (duration ? `${value} sn` : value) : amrap && !showTarget ? targetCell(set.target, trackingType) : '—'}
        </motion.td>
      )}
      {/* Son hücre yerinde durur, içeriği kayar: "Sil" onun içinde satırın sağ kenarına tutunur. */}
      <td data-slot="table-cell" style={logged ? { touchAction: 'pan-y pinch-zoom' } : undefined} className={cn(CELL, 'relative p-0 text-center')}>
        <motion.div style={{ x }}>
          {logged ? (
            <button
              type="button"
              aria-label={`${label}, ${setValueText(logged)}, yapıldı. İşareti kaldır`}
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
              id={ROW_DONE_ID}
              disabled={input.disabled}
              aria-label={`${label}, ${weighted && input.kg !== undefined ? `${formatNumber(input.kg)} kg × ${input.value}` : duration ? `${input.value} sn` : `${input.value} tekrar`}: yapıldı olarak işaretle`}
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
              aria-label={`${label}, fazladan: ${group ? 'turu' : 'seti'} kaldır`}
              onClick={(event) => {
                event.stopPropagation();
                onDropExtra();
              }}
              className="inline-flex size-11 items-center justify-center rounded-full align-middle text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-4">
              <X weight="bold" />
            </button>
          ) : null}
        </motion.div>
        {active && logged ? (
          <motion.button
            type="button"
            tabIndex={-1}
            aria-hidden
            inert={!open}
            data-set-swipe-action
            onClick={(event) => {
              event.stopPropagation();
              track.current = null;
              x.jump(0);
              setActive(false);
              onOpenChange(false);
              onDelete(logged.id);
            }}
            style={{ width }}
            className="absolute inset-y-0 right-0 overflow-hidden bg-destructive text-background outline-none select-none">
            <span className="absolute inset-y-0 right-0 flex w-18 flex-col items-center justify-center gap-1 text-[11px] leading-none font-semibold [&_svg]:size-5">
              <Trash weight="bold" />
              Sil
            </span>
          </motion.button>
        ) : null}
      </td>
    </tr>
  );
}
