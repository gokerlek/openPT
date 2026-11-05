import Link from 'next/link';
import { DEFAULT_LOCALE, type Locale } from '@/i18n/locale';
import { ptLibraryMessages } from '@/i18n/messages/pt-library';
import { Badge } from '@/components/ui/badge';
import { Item, ItemContent, ItemMedia, ItemTitle } from '@/components/ui/item';
import type { DeviceWithSource } from '@/lib/devices';
import { cardioKind } from '@/lib/cardio';
import { groupWorkText, rowWorkText } from '@/lib/edit-messages';
import type { ExerciseWithSource } from '@/lib/exercises';
import { progressionLabels, rirLabels } from '@/lib/progression';
import { equipmentLabels } from '@/lib/schemas/exercise';
import type { Template } from '@/lib/schemas/template';
import { blockKindLabels, groupSkipNote, roundsOf, rowLabels, type TemplateBlock, type TemplateRow } from '@/lib/template-plan';

type Lookups = {
  exercises: ReadonlyMap<string, ExerciseWithSource>;
  devices: ReadonlyMap<string, DeviceWithSource>;
};

/**
 * Şablonun hareketleri, antrenmanın yapılış sırasıyla (detay sayfası, yalnız gösterim).
 * Her blok ızgarada bir hücre; grup tek hücrede, satırları "2a", "2b" diye. Setler, dinlenme ve
 * grubun özeti düzenleyicinin kartlarıyla aynı biçimde (`rowWorkText`, `groupWorkText`).
 */
export function TemplateSequence({ template, exercises, devices, locale = DEFAULT_LOCALE }: { template: Template; locale?: Locale } & Lookups) {
  const t = ptLibraryMessages(locale).templateSequence;
  const labels = rowLabels(template);
  const titleOf = (row: TemplateRow) => exercises.get(row.exerciseId)?.title ?? t.deletedExercise;
  return (
    <ol className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {template.blocks.map((block, index) => (
        <li key={block.id}>
          {block.kind === 'single' ? (
            block.rows.map((row) => (
              <RowItem key={row.id} row={row} block={block} label={labels.get(row.id) ?? String(index + 1)} exercises={exercises} devices={devices} locale={locale} />
            ))
          ) : (
            <div className="flex flex-col gap-2 rounded-lg border p-3">
              <div className="flex flex-col gap-1">
                <Badge variant="secondary">
                  {index + 1} · {blockKindLabels(locale)[block.kind]}
                </Badge>
                <p className="text-xs tabular-nums text-muted-foreground">{groupWorkText(block, roundsOf(block), locale)}</p>
                {groupSkipNote(block, titleOf, locale) ? <p className="text-xs text-muted-foreground">{groupSkipNote(block, titleOf, locale)}</p> : null}
              </div>
              {block.rows.map((row) => (
                <RowItem key={row.id} row={row} block={block} label={labels.get(row.id) ?? ''} exercises={exercises} devices={devices} locale={locale} />
              ))}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

function RowItem({ row, block, label, exercises, devices, locale }: { row: TemplateRow; block: TemplateBlock; label: string; locale: Locale } & Lookups) {
  const t = ptLibraryMessages(locale).templateSequence;
  const exercise = exercises.get(row.exerciseId);
  const media = (
    <ItemMedia className="w-7 justify-center self-start font-medium tabular-nums text-muted-foreground">{label}</ItemMedia>
  );

  if (!exercise) {
    return (
      <Item variant="outline" size="sm" className="border-destructive/50 bg-destructive/5">
        {media}
        <ItemContent className="min-w-0">
          <ItemTitle className="text-destructive">{t.deletedExercise}</ItemTitle>
          <span className="truncate font-mono text-xs text-muted-foreground">{row.exerciseId}</span>
          <span className="text-xs text-muted-foreground">{t.missingHint}</span>
        </ItemContent>
      </Item>
    );
  }

  const work = rowWorkText(row.sets, exercise.trackingType, block.kind === 'single' ? block.restSeconds : undefined, cardioKind(exercise), locale);
  const overridden = row.deviceId ? devices.get(row.deviceId) : undefined;
  const own = exercise.deviceId ? devices.get(exercise.deviceId) : undefined;

  return (
    <Item variant="outline" size="sm">
      {media}
      <ItemContent className="min-w-0 gap-1.5">
        <ItemTitle className="w-full">
          <Link
            href={`/dashboard/exercises/${exercise.id}`}
            className="truncate underline-offset-4 hover:underline touch:-my-3 touch:block touch:min-h-11 touch:py-3">
            {exercise.title}
          </Link>
        </ItemTitle>
        <span className="text-sm tabular-nums">{work}</span>
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {row.deviceId ? (
            overridden ? (
              <>
                {overridden.name}
                <Badge variant="outline">{t.changedBadge}</Badge>
              </>
            ) : (
              <span className="italic">{t.deletedDeviceNote}{own ? ` (${own.name})` : ''}</span>
            )
          ) : (
            (own?.name ?? equipmentLabels(locale)[exercise.equipment])
          )}
        </span>
        {row.rule ? (
          <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {progressionLabels(locale)[row.rule.scheme]} · {rirLabels(locale)[row.rule.targetRir] ?? t.rirFallback(row.rule.targetRir)}
            <Badge variant="outline">{t.ruleBadge}</Badge>
          </span>
        ) : null}
        {row.note ? <span className="text-xs italic text-muted-foreground">{row.note}</span> : null}
      </ItemContent>
    </Item>
  );
}
