'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { getInput, setInput, useField } from '@formisch/react';
import { ArrowSquareRight, Copy, FloppyDisk, Trash } from '@phosphor-icons/react';
import { BlockEditor, useBlocks } from '@/components/block-editor/block-editor';
import { DotsThreeVertical } from '@/components/line-icons';
import type { EditorCare } from '@/lib/constraint-filter';
import type { BlocksFormStore } from '@/components/block-editor/block-items';
import type { RowClientTarget } from '@/components/block-editor/editor-context';
import { keepLineEnter } from '@/components/block-editor/enter-key';
import { MuscleMap } from '@/components/muscle-map/muscle-map';
import { loadDescription, loadMapProps } from '@/lib/muscle-tiers';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { WeekdayToggle } from '@/components/weekday-toggle';
import { assignWeekdays, takenWeekdays, weekdaysInput } from '@/lib/day-assignments';
import { dayBlocksPath } from '@/lib/editor-undo';
import { getFormat } from '@/lib/format';
import { exerciseSetWeights } from '@/lib/muscles';
import {
  PROGRAM_LIMITS,
  addDay,
  canAddDay,
  canMoveDay,
  copyDay,
  programIdSource,
  removeDay,
  type ProgramDay,
  type ProgramPhase,
} from '@/lib/program-plan';
import type { EditorDevice, PickerExercise } from '@/lib/template-edit';
import { templateMuscleLoad } from '@/lib/template-plan';
import { weekdayNamesText, weekdayShortLabels, type Weekday } from '@/lib/training-days';
import type { PhaseActions, ProgramFormStore } from './program-form';
import { useLocale, useMessages } from '@/i18n/client';
import { ptProgramMessages } from '@/i18n/messages/pt-program';
import { commonMessages } from '@/i18n/messages/common';

/**
 * Seçili program (Faz 3: evrenin bir antrenmanı; kodda "gün"): adı, atandığı hafta günleri ("Günleri"), geldiği
 * şablon, program menüsü (sıra, başka evreye taşı, kopyala, şablon olarak kaydet, kaldır); hareketleri şablonlarla
 * ortak hareket düzenleyicide, hemen altında formun uyarıları (`footer`), en altta programın kas yükü. Evresiz
 * programda evreden söz edilmez.
 *
 * Gün çipleri: evrede bir hafta günü en çok bir programa atanır; başka programın günü kapalı, nedeni çipin adında ve
 * altındaki satırda ("Başka programda: Per · Üst vücut"). Danışan atanan programı o gün Bugün ekranında görür.
 */
export function DayEditor({
  form,
  phases,
  phased,
  phase,
  phaseIndex,
  day,
  dayIndex,
  templateIds,
  exercises,
  devices,
  timeZone,
  actions,
  footer,
  clientTargets,
  care = null,
  startedWithDays = false,
}: {
  form: ProgramFormStore;
  phases: ProgramPhase[];
  phased: boolean;
  phase: ProgramPhase;
  phaseIndex: number;
  day: ProgramDay;
  dayIndex: number;
  /** Hâlâ var olan şablonlar (kaynağa bağlantı için). */
  templateIds: ReadonlySet<string>;
  exercises: PickerExercise[];
  devices: EditorDevice[];
  timeZone: string;
  actions: PhaseActions;
  /** Formun uyarıları: hareket listesinin hemen altında. */
  footer?: React.ReactNode;
  /** Danışanın satır hedefleri (satır kimliğiyle). */
  clientTargets?: Readonly<Record<string, RowClientTarget>> | undefined;
  /** Danışanın kısıtları: sheet'te işaret, kartta rozet. */
  care?: EditorCare | null;
  /** Programın formdaki başlangıç değerinde gün alanı var mı (`weekdaysInput`: boş seçim alanı yazar mı). */
  startedWithDays?: boolean;
}) {
  const t = useMessages(ptProgramMessages).dayEditor;
  const locale = useLocale();
  const format = getFormat(locale);
  const common = useMessages(commonMessages);
  const nameField = useField(form, { path: ['phases', phaseIndex, 'days', dayIndex, 'name'] });
  const path = ['phases', phaseIndex, 'days', dayIndex, 'blocks'] as const;
  const blocksForm = form as unknown as BlocksFormStore;
  const blocks = useBlocks(blocksForm, path);
  const exerciseById = useMemo(() => new Map(exercises.map((exercise) => [exercise.id, exercise])), [exercises]);
  const load = useMemo(() => templateMuscleLoad({ blocks }, exerciseById, exerciseSetWeights).load, [blocks, exerciseById]);
  const source = day.source;
  const neighbour = phase.days[dayIndex - 1] ?? phase.days[dayIndex + 1];
  const otherPhases = phased ? phases.filter((item) => item.id !== phase.id) : [];
  const onlyDay = phase.days.length <= 1;
  const weekdays = day.weekdays ?? [];
  // Bu programın dışında atanmış günler (sahibinin adıyla): çipte kapalı, altta satır.
  const taken = takenWeekdays(phase.days, day.id);
  const takenText = [...taken].map(([weekday, name]) => `${weekdayShortLabels(locale)[weekday as Weekday]} · ${name}`).join(', ');
  const weekdaysLabelId = `day-weekdays-${day.id}`;

  // Güncel evre olay anında okunur (ardışık dokunuşlar birbirini ezmesin); `assignWeekdays` başka programın gününü
  // yine de dışarıda bırakır. Yalnız bu programın alanı yazılır: bütün evreleri yazmak hareket düzenleyicisini
  // yeniden kurardı.
  const assign = (next: readonly number[]) => {
    const days = actions.current().find((item) => item.id === phase.id)?.days ?? [];
    const assigned = assignWeekdays(days, day.id, next).find((item) => item.id === day.id);
    if (!assigned) return;
    setInput(form, { path: ['phases', phaseIndex, 'days', dayIndex, 'weekdays'], input: weekdaysInput(assigned.weekdays, startedWithDays) });
  };

  const copy = () => {
    const all = actions.current();
    const target = all.find((item) => item.id === phase.id);
    const current = target?.days.find((item) => item.id === day.id);
    if (!target || !current) return;
    const created = copyDay(target, current, programIdSource(all), locale);
    actions.update((phasesNow) => addDay(phasesNow, phase.id, created, day.id), {
      select: created.id,
      announce: t.added(created.name),
    });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{phased ? `${phase.name} · ${day.name}` : day.name}</CardTitle>
          <CardDescription>{weekdayNamesText(weekdays, locale) || t.noDays}</CardDescription>
          <CardAction>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon" aria-label={t.menuAria(day.name)} />}>
                <DotsThreeVertical weight="bold" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-52 touch:**:data-[slot=dropdown-menu-item]:min-h-11 touch:**:data-[slot=dropdown-menu-sub-trigger]:min-h-11">
                {otherPhases.length > 0 ? (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger disabled={onlyDay}>
                      <ArrowSquareRight />
                      {onlyDay ? t.moveToPhaseOnly : t.moveToPhase}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="min-w-48 touch:**:data-[slot=dropdown-menu-item]:min-h-11 touch:**:data-[slot=dropdown-menu-sub-trigger]:min-h-11">
                      {otherPhases.map((target) => {
                        const full = !canMoveDay(phases, day.id, target.id);
                        return (
                          <DropdownMenuItem key={target.id} disabled={full} onClick={() => actions.moveToPhase(day.id, target.id)}>
                            {t.moveTarget(target.name, full)}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                ) : null}
                <DropdownMenuItem disabled={!canAddDay(phases, phase.id)} onClick={copy}>
                  <Copy />
                  {t.copy}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={actions.openSaveTemplate}>
                  <FloppyDisk />
                  {t.saveTemplate}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={phase.days.length <= 1}
                  onClick={() =>
                    actions.updateWithUndo((all) => removeDay(all, phase.id, day.id), t.deleted(day.name), {
                      select: neighbour?.id,
                    })
                  }>
                  <Trash />
                  {common.actions.delete}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Field data-invalid={Boolean(nameField.errors) || undefined}>
            <FieldLabel htmlFor={`day-name-${day.id}`}>{t.nameLabel}</FieldLabel>
            <Input
              {...nameField.props}
              id={`day-name-${day.id}`}
              className="max-w-sm"
              maxLength={PROGRAM_LIMITS.dayName}
              value={nameField.input ?? ''}
              placeholder={t.namePlaceholder}
              aria-invalid={Boolean(nameField.errors) || undefined}
              onKeyDown={keepLineEnter}
            />
            <FieldError>{nameField.errors?.[0]}</FieldError>
          </Field>
          <Field className="gap-1.5">
            <FieldLabel id={weekdaysLabelId}>{t.daysLabel}</FieldLabel>
            <WeekdayToggle id={weekdaysLabelId} describedBy={`${weekdaysLabelId}-hint`} value={weekdays} taken={taken} onChange={assign} className="max-w-sm" />
            <FieldDescription id={`${weekdaysLabelId}-hint`}>
              {taken.size > 0 ? t.takenOther(takenText) : t.see}
            </FieldDescription>
          </Field>
          {source ? (
            <p className="text-sm text-muted-foreground">
              {templateIds.has(source.templateId) ? (
                <Link
                  href={`/dashboard/templates/${source.templateId}`}
                  className="underline underline-offset-4 touch:inline-flex touch:min-h-11 touch:items-center">
                  {t.fromTemplate(source.templateName)}
                </Link>
              ) : (
                <>{t.fromTemplateDeleted(source.templateName)}</>
              )}{' '}
              · {format.date(source.at, timeZone)}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <BlockEditor
        key={day.id}
        form={blocksForm}
        path={path}
        // "Geri al" günü kimliğiyle bulur: toast açıkken gün taşınsa (sıra, evre, araya gün) da kendi gününe yazar.
        undoPath={() => dayBlocksPath(actions.current(), day.id)}
        exercises={exercises}
        devices={devices}
        newIds={() => programIdSource((getInput(form, { path: ['phases'] }) ?? []) as unknown as ProgramPhase[])}
        noteHint={t.noteHint}
        libraryDescription={t.libraryDescription}
        listLabel={t.listLabel(day.name)}
        addLabel={t.addLabel(day.name)}
        {...(clientTargets ? { clientTargets } : {})}
        care={care}
      />

      {footer}

      <Card>
        <CardHeader>
          <CardTitle>{t.loadTitle}</CardTitle>
          <CardDescription>{loadDescription(locale)}</CardDescription>
        </CardHeader>
        <CardContent>
          {blocks.length > 0 ? (
            <MuscleMap layout="split" bodyClassName="h-56 lg:h-64" {...loadMapProps(load, 'session', t.loadLabel(day.name), {}, locale)} />
          ) : (
            <p className="text-sm text-muted-foreground">{t.loadEmpty}</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
