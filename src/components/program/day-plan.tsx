import { DEFAULT_LOCALE, type Locale } from '@/i18n/locale';
import { ptProgramMessages } from '@/i18n/messages/pt-program';
import { Badge } from '@/components/ui/badge';
import { cardioKind } from '@/lib/cardio';
import { groupWorkText, rowWorkText } from '@/lib/edit-messages';
import { formatSets } from '@/lib/set-plan';
import {
  blockKindLabels,
  describeBlock,
  formatRest,
  groupSkipNote,
  roundsOf,
  rowLabels,
  type PlanExercise,
  type TemplateBlock,
} from '@/lib/template-plan';
import { cn } from '@/lib/utils';

/**
 * Bir antrenman gününün (ya da şablonun) yapılış sırası: gruplar rozet ve anlatımla,
 * satırda etiket, hareket, setler (tek harekette dinlenmeyle) ve not. PT'ye düzenleyicinin
 * kartlarıyla aynı biçim ("3×8–12 · 90 sn", grupta "2 hareket · 3 tur · 90 sn tur sonu";
 * `rowWorkText`, `groupWorkText`); danışana (`audience="client"`) açık dil ("3 × 8–12 tekrar ·
 * 1 dk 30 sn dinlenme", AMRAP "yapabildiğin kadar"). Kancasız: sunucu bileşenlerinde de çalışır.
 *
 * Kütüphanede olmayan egzersiz: `missing="show"` (PT) "Silinmiş egzersiz" olarak
 * kimliğiyle görünür; `missing="hide"` (danışan) satır hiç çizilmez. `rowNotes`: satır kimliğiyle kısa not;
 * PT'nin programında danışanın geçerli hedefi ("Danışan güncelledi · hedef 10–14 · 26 Eyl", tasarım §6.2).
 */
export function DayPlan({
  blocks,
  exercises,
  missing,
  audience = 'pt',
  rowNotes,
  className,
  locale = DEFAULT_LOCALE,
}: {
  blocks: readonly TemplateBlock[];
  exercises: ReadonlyMap<string, Pick<PlanExercise, 'title' | 'trackingType' | 'pattern' | 'locomotion'>>;
  missing: 'show' | 'hide';
  audience?: 'pt' | 'client';
  rowNotes?: Readonly<Record<string, string>>;
  className?: string;
  /** Metinlerin dili (sunucu ve istemci ortak; kancasız); yoksa Türkçe. */
  locale?: Locale;
}) {
  const t = ptProgramMessages(locale).dayPlan;
  const labels = rowLabels({ blocks });
  return (
    <ol className={cn('flex flex-col gap-3', className)}>
      {blocks.map((block) => {
        const rows = missing === 'hide' ? block.rows.filter((row) => exercises.has(row.exerciseId)) : block.rows;
        if (rows.length === 0) return null;
        return (
          <li key={block.id} className={block.kind === 'single' ? '' : 'flex flex-col gap-2 rounded-lg border p-3'}>
            {block.kind !== 'single' ? (
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{blockKindLabels(locale)[block.kind]}</Badge>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {audience === 'pt' ? groupWorkText({ ...block, rows }, roundsOf({ rows }), locale) : describeBlock({ ...block, sets: roundsOf({ rows }) }, locale)}
                  </span>
                </div>
                {skipNote({ ...block, rows }, exercises, locale)}
              </div>
            ) : null}
            {rows.map((row) => {
              const exercise = exercises.get(row.exerciseId);
              const trackingType = exercise?.trackingType ?? 'weight_reps';
              const rest = block.kind === 'single' ? block.restSeconds : undefined;
              const cardio = exercise ? cardioKind(exercise) : null;
              const work =
                audience === 'pt'
                  ? rowWorkText(row.sets, trackingType, rest, cardio, locale)
                  : rest !== undefined && rest > 0
                    ? t.workWithRest(formatSets(row.sets, trackingType, 'client', cardio, locale), formatRest(rest, locale))
                    : formatSets(row.sets, trackingType, 'client', cardio, locale);
              return (
                <div key={row.id} className="flex items-baseline gap-3">
                  <span className="w-6 shrink-0 text-sm font-medium tabular-nums text-muted-foreground">{labels.get(row.id)}</span>
                  <div className="flex min-w-0 flex-col">
                    {exercise ? (
                      <span className="font-medium">{exercise.title}</span>
                    ) : (
                      <span className="font-medium text-destructive">
                        {t.deletedExercise} <span className="font-mono text-xs font-normal text-muted-foreground">{row.exerciseId}</span>
                      </span>
                    )}
                    <span className="text-sm tabular-nums text-muted-foreground">{work}</span>
                    {rowNotes?.[row.id] ? (
                      <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
                        <Badge variant="secondary">{t.clientUpdated}</Badge>
                        {rowNotes[row.id]}
                      </span>
                    ) : null}
                    {row.note ? <span className="text-xs italic text-muted-foreground">{row.note}</span> : null}
                  </div>
                </div>
              );
            })}
          </li>
        );
      })}
    </ol>
  );
}

function skipNote(block: TemplateBlock, exercises: ReadonlyMap<string, Pick<PlanExercise, 'title'>>, locale: Locale) {
  const note = groupSkipNote(block, (row) => exercises.get(row.exerciseId)?.title ?? ptProgramMessages(locale).dayPlan.deletedExercise, locale);
  return note ? <span className="text-xs text-muted-foreground">{note}</span> : null;
}
