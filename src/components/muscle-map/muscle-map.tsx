'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useLocale, useMessages } from '@/i18n/client';
import { uiMessages } from '@/i18n/messages/ui';
import { getFormat } from '@/lib/format';
import { muscleLabels } from '@/lib/schemas/exercise';
import type { BodyMuscle } from '@/lib/muscles';
import { legendText, type MuscleLegendData, type MuscleMark, type MuscleMarks } from '@/lib/muscle-tiers';
import { cn } from '@/lib/utils';
import type { DeepMuscle } from '@/lib/deep-muscles';
import { DeepMuscleSection } from './deep-muscle-section';
import { MuscleLegend } from './muscle-legend';
import { DECLINED_STROKE, MusclePatterns, markFill, usePatternId } from './muscle-patterns';
import { BACK_PATHS, FRONT_PATHS, VIEWBOX, type MusclePath } from './paths';
import { muscleOfPath } from './regions';

export type MuscleSide = 'front' | 'back';

const SIDES: readonly MuscleSide[] = ['front', 'back'];

type SideShape = {
  /** Grubu olmayan parçalar (baş, el, ayak…): yalnız siluet. */
  neutral: MusclePath[];
  /** Kas → o görünümdeki parçaları (sol ve sağ birlikte). */
  groups: [BodyMuscle, MusclePath[]][];
};

function shape(paths: readonly MusclePath[]): SideShape {
  const neutral: MusclePath[] = [];
  const groups = new Map<BodyMuscle, MusclePath[]>();
  for (const path of paths) {
    const muscle = muscleOfPath(path.id);
    if (!muscle) neutral.push(path);
    else groups.set(muscle, [...(groups.get(muscle) ?? []), path]);
  }
  return { neutral, groups: [...groups] };
}

// Parçalar modül yüklenirken bir kez gruplanır.
const SHAPES: Record<MuscleSide, SideShape> = { front: shape(FRONT_PATHS), back: shape(BACK_PATHS) };

/**
 * Kas başına işaret (`marks`, `src/lib/muscle-tiers.ts`): dolu, çizgili, noktalı ya da gerileme; desenler
 * `muscle-patterns.tsx`'te. `marks` verilmeyen haritada (süzgeç, koç paneli) seçili kas dolu. Renkler `globals.css`'teki
 * `--muscle-*` token'larından; hedef `--primary-strong` olduğu için PT'nin rengini izler ve boş kastan ≥3:1'dir.
 */

/** Bir kasın dolgusu. */
function muscleFill({
  mark,
  patternId,
  disabled,
  highlighted,
}: {
  mark: MuscleMark | undefined;
  patternId: string;
  disabled: boolean;
  highlighted: boolean;
}): string {
  if (mark) return markFill(mark, patternId);
  if (disabled) return 'var(--muscle-neutral)';
  if (highlighted) return 'color-mix(in oklab, var(--foreground) 22%, var(--card))';
  return 'var(--muscle-empty)';
}

type MuscleMapProps = {
  /** Kas başına işaret (dolu / çizgili / noktalı / gerileme). Verilmezse seçili kaslar dolu çizilir. */
  marks?: MuscleMarks;
  /** Açıklama kutusu: verilince harita ve açıklama `@container` içinde, dar alanda alt alta, geniş alanda yan yana. */
  legend?: MuscleLegendData;
  /** Açıklama satırlarını çıkarılabilir çip yapar (egzersiz formu). */
  onRemoveRow?: (key: string) => void;
  /** Haritanın altındaki "Derin kaslar" bölümü: `onToggle` verilince seçilir (form), verilmezse yalnız seçililer görünür. */
  deep?: { selected: readonly DeepMuscle[]; onToggle?: (muscle: DeepMuscle) => void };
  /** Seçili kaslar (süzgeç, form, açık grup); ekran okuyucuda basılı. */
  selected?: readonly BodyMuscle[];
  /** Tıklanamayan kaslar; rengi yine `marks`'tan gelir. */
  disabled?: readonly BodyMuscle[];
  /** Verilirse kaslar tıklanabilir olur (klavyeyle de). */
  onToggle?: (muscle: BodyMuscle) => void;
  /** Kas başına sayı; alt satırda yazar. Sayısı 0 olan kas soluk ve tıklanamaz. */
  counts?: Partial<Record<BodyMuscle, number>>;
  /** Üstüne gelinen kasın alt satırdaki açıklaması. Varsayılan: ad (+ sayı). */
  describe?: (muscle: BodyMuscle) => React.ReactNode;
  /** Tıklanabilir kasın ekran okuyucu adı. Varsayılan: ad (+ egzersiz sayısı). */
  labelOf?: (muscle: BodyMuscle) => string;
  /** Hiçbir kasın üstünde değilken alt satır. */
  hint?: React.ReactNode;
  /** `flip`: tek gövde, ön/arka çevrilir. `split`: ön ve arka yan yana. */
  layout?: 'flip' | 'split';
  /** Görünen yüz (kontrollü). Verilmezse bileşen kendi tutar. */
  side?: MuscleSide;
  defaultSide?: MuscleSide;
  onSideChange?: (side: MuscleSide) => void;
  /** Gövde çiziminin yüksekliği; genişlik orana göre çıkar. Ör. `h-64 lg:h-96`. */
  bodyClassName?: string;
  /** Ekran okuyucu için haritanın adı. */
  label: string;
  className?: string;
};

/**
 * Kas haritası: ön ve arka gövde üzerinde kaslarımızı (24 kas) gösterir.
 *
 * Veri çekmez; neyin yanacağını tamamen dışarıdan alır. Aynı bileşen egzersiz
 * detayında (çalışan kaslar), listede (süzgeç) ve ileride program kapsamında
 * (yük ısı haritası) kullanılır. Renkler tema tokenlarından: PT'nin vurgu rengi
 * haritaya da yansır.
 */
export function MuscleMap({
  marks,
  legend,
  onRemoveRow,
  deep,
  selected = [],
  disabled,
  onToggle,
  counts,
  describe,
  labelOf,
  hint,
  layout = 'flip',
  side: sideProp,
  defaultSide = 'front',
  onSideChange,
  bodyClassName = 'h-72',
  label,
  className,
}: MuscleMapProps) {
  const locale = useLocale();
  const t = useMessages(uiMessages).muscleMap;
  const names = muscleLabels(locale);
  const { number } = getFormat(locale);
  const [ownSide, setOwnSide] = useState<MuscleSide>(defaultSide);
  const [hovered, setHovered] = useState<BodyMuscle | null>(null);
  const side = sideProp ?? ownSide;

  function changeSide(next: MuscleSide) {
    setOwnSide(next);
    onSideChange?.(next);
  }

  const describeMuscle =
    describe ??
    ((muscle: BodyMuscle) =>
      (legend ? legendText(legend, muscle, locale) : null) ??
      (counts ? t.exercisesCount(counts[muscle] ?? 0, names[muscle], number(counts[muscle] ?? 0)) : names[muscle]));

  const body = (face: MuscleSide) => (
    <Body
      side={face}
      label={layout === 'flip' ? label : `${label} — ${t.sides[face]}`}
      marks={marks}
      selected={selected}
      disabled={disabled}
      counts={counts}
      labelOf={labelOf}
      onToggle={onToggle}
      highlighted={hovered}
      onHighlight={setHovered}
    />
  );

  // Seçim öbür yüzdeyse düğmede nokta çıkar; çevirmeden de görülsün.
  const selectedOn = (face: MuscleSide) =>
    SHAPES[face].groups.some(([muscle]) => selected.includes(muscle));

  const figure = (
    <figure className={cn('flex flex-col items-center gap-3', legend || deep ? 'shrink-0' : className)}>
      {layout === 'flip' ? (
        <div className={cn('relative aspect-[35/93] perspective-distant', bodyClassName)}>
          <motion.div
            className="absolute inset-0 transform-3d"
            initial={false}
            animate={{ rotateY: side === 'back' ? 180 : 0 }}
            transition={{ type: 'spring', stiffness: 120, damping: 16 }}>
            <div className="absolute inset-0 backface-hidden" inert={side !== 'front'}>
              {body('front')}
            </div>
            <div className="absolute inset-0 rotate-y-180 backface-hidden" inert={side !== 'back'}>
              {body('back')}
            </div>
          </motion.div>
        </div>
      ) : (
        <div className="flex items-end justify-center gap-6">
          {SIDES.map((face) => (
            <div key={face} className="flex flex-col items-center gap-1.5">
              <div className={cn('aspect-[35/93]', bodyClassName)}>{body(face)}</div>
              <span className="text-xs text-muted-foreground">{t.sides[face]}</span>
            </div>
          ))}
        </div>
      )}

      <figcaption className="min-h-5 text-center text-sm text-muted-foreground">
        {hovered ? <span className="text-foreground">{describeMuscle(hovered)}</span> : hint}
      </figcaption>

      {layout === 'flip' ? (
        <ToggleGroup
          variant="outline"
          size="lg"
          spacing={0}
          value={[side]}
          onValueChange={(value) => {
            const next = value[0] as MuscleSide | undefined;
            if (next) changeSide(next);
          }}
          aria-label={t.view}>
          {SIDES.map((face) => (
            <ToggleGroupItem key={face} value={face} className="px-5">
              {t.sides[face]}
              {face !== side && selectedOn(face) ? (
                <>
                  <span className="size-1.5 rounded-full bg-primary-text" aria-hidden />
                  <span className="sr-only">{t.selectedOther}</span>
                </>
              ) : null}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      ) : null}
    </figure>
  );

  if (!legend && !deep) return figure;
  return (
    <div className={cn('@container flex w-full flex-col gap-4', className)}>
      <div className="flex flex-col items-center gap-4 @xl:flex-row @xl:items-start @xl:gap-8">
        {figure}
        {legend ? <MuscleLegend data={legend} onRemoveRow={onRemoveRow} /> : null}
      </div>
      {deep ? <DeepMuscleSection selected={deep.selected} onToggle={deep.onToggle} /> : null}
    </div>
  );
}

type BodyProps = {
  side: MuscleSide;
  label: string;
  marks?: MuscleMarks | undefined;
  labelOf?: ((muscle: BodyMuscle) => string) | undefined;
  selected: readonly BodyMuscle[];
  disabled?: readonly BodyMuscle[];
  counts?: Partial<Record<BodyMuscle, number>>;
  onToggle?: (muscle: BodyMuscle) => void;
  highlighted: BodyMuscle | null;
  onHighlight: (muscle: BodyMuscle | null) => void;
};

/** Dokunma toleransı: boşluğa düşen dokunuşta bu yarıçaplarda (px) en yakın kas aranır. */
const TOLERANCE_RADII = [6, 12, 18];
const TOLERANCE_SAMPLES = 12;

/**
 * Dokunulan noktanın çevresinde en çok rastlanan seçilebilir kas.
 * Ekran koordinatıyla çalışır; arka yüzün 3B dönüşü hesabı bozmaz.
 */
function nearestMuscle(x: number, y: number, svg: SVGSVGElement): BodyMuscle | null {
  for (const radius of TOLERANCE_RADII) {
    const hits = new Map<BodyMuscle, number>();
    for (let i = 0; i < TOLERANCE_SAMPLES; i++) {
      const angle = (i / TOLERANCE_SAMPLES) * Math.PI * 2;
      const element = document.elementFromPoint(x + radius * Math.cos(angle), y + radius * Math.sin(angle));
      const group = element?.closest<SVGGElement>('[data-clickable]');
      const muscle = group && svg.contains(group) ? (group.dataset.muscle as BodyMuscle) : null;
      if (muscle) hits.set(muscle, (hits.get(muscle) ?? 0) + 1);
    }
    let best: BodyMuscle | null = null;
    for (const [muscle, count] of hits) if (!best || count > (hits.get(best) ?? 0)) best = muscle;
    if (best) return best;
  }
  return null;
}

/** Tek yüzün SVG'si. Her kas bir `g`; sol ve sağ birlikte yanar. */
function Body({ side, label, marks, labelOf, selected, disabled: locked, counts, onToggle, highlighted, onHighlight }: BodyProps) {
  const locale = useLocale();
  const t = useMessages(uiMessages).muscleMap;
  const names = muscleLabels(locale);
  const { number } = getFormat(locale);
  const { neutral, groups } = SHAPES[side];
  const interactive = Boolean(onToggle);
  const patternId = usePatternId();

  return (
    <svg
      viewBox={VIEWBOX[side]}
      className="size-full overflow-visible stroke-card [-webkit-tap-highlight-color:transparent]"
      strokeWidth={0.12}
      strokeLinejoin="round"
      role={interactive ? 'group' : 'img'}
      aria-label={label}
      onClick={
        interactive
          ? (event) => {
              // Kasın üstüne düşen dokunuşu kasın kendisi karşılar. Boşluğa ya da
              // kas olmayan parçaya (dirsek, omurga…) düşerse en yakın kas seçilir.
              if ((event.target as Element).closest('[data-muscle]')) return;
              const muscle = nearestMuscle(event.clientX, event.clientY, event.currentTarget);
              if (!muscle) return;
              onHighlight(muscle);
              onToggle?.(muscle);
            }
          : undefined
      }>
      <MusclePatterns id={patternId} />
      <g style={{ fill: 'var(--muscle-neutral)' }} aria-hidden>
        {neutral.map((path) => (
          <path key={path.id} d={path.d} />
        ))}
      </g>

      {groups.map(([muscle, paths]) => {
        const isSelected = selected.includes(muscle);
        const disabled = interactive && ((counts !== undefined && !counts[muscle]) || Boolean(locked?.includes(muscle)));
        const clickable = interactive && !disabled;
        const isHighlighted = highlighted === muscle;
        const count = counts?.[muscle];
        const mark: MuscleMark | undefined = marks ? marks[muscle] : isSelected ? 'filled' : undefined;

        return (
          <g
            key={muscle}
            data-muscle={muscle}
            data-clickable={clickable || undefined}
            role={interactive ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            aria-pressed={interactive ? isSelected : undefined}
            aria-disabled={disabled || undefined}
            aria-label={
              interactive ? (labelOf?.(muscle) ?? (count === undefined ? names[muscle] : t.exercisesCountLabel(count, names[muscle], number(count)))) : undefined
            }
            data-mark={mark ?? 'empty'}
            className={cn(
              'outline-none transition-[fill,stroke,stroke-width] duration-160',
              mark === 'declined' && DECLINED_STROKE,
              isHighlighted && 'stroke-foreground [stroke-width:0.3]',
              clickable && 'cursor-pointer',
            )}
            style={{ fill: muscleFill({ mark, patternId, disabled, highlighted: isHighlighted }) }}
            onPointerEnter={() => onHighlight(muscle)}
            onPointerLeave={(event) => {
              // Dokunmatikte parmak kalkınca da "leave" gelir; son dokunulan kas alt satırda kalsın.
              if (event.pointerType === 'mouse') onHighlight(null);
            }}
            onFocus={() => onHighlight(muscle)}
            onBlur={() => onHighlight(null)}
            onClick={clickable ? () => onToggle?.(muscle) : undefined}
            onKeyDown={
              clickable
                ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onToggle?.(muscle);
                    }
                  }
                : undefined
            }>
            {paths.map((path) => (
              <path key={path.id} d={path.d} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}
