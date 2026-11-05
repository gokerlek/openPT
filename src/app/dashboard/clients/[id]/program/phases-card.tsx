'use client';

import { useState } from 'react';
import { setInput, useField, useFieldArray } from '@formisch/react';
import { ArrowRight, Copy, Info, PushPin, Rows, Trash } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { keepLineEnter } from '@/components/block-editor/enter-key';
import { DotsThreeVertical, Plus } from '@/components/line-icons';
import { SortableList, type SortableSlot } from '@/components/list/sortable-list';
import { SwipeRow, deleteAction } from '@/components/swipe/swipe-row';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { hasAssignments } from '@/lib/day-assignments';
import { getFormat } from '@/lib/format';
import {
  PROGRAM_LIMITS,
  addPhase,
  blankPhase,
  canAddPhase,
  copyPhase,
  phaseStatus,
  programIdSource,
  removePhase,
  type ProgramPhase,
} from '@/lib/program-plan';
import { moveItem, type ReorderTarget } from '@/lib/reorder';
import { cn } from '@/lib/utils';
import { AddDayMenu, DayChips } from './day-chips';
import { FrequencySelect } from './frequency-select';
import type { PhaseActions, ProgramFormStore, StoredState } from './program-form';
import { UnphaseDialog } from './unphase-dialog';
import { AssignmentSummary } from './weekday-field';
import { useLocale, useMessages } from '@/i18n/client';
import { ptProgramMessages } from '@/i18n/messages/pt-program';
import { commonMessages } from '@/i18n/messages/common';

type Messages = ReturnType<typeof ptProgramMessages>['phasesCard'];

type Shared = {
  form: ProgramFormStore;
  phases: ProgramPhase[];
  currentPhaseId: string;
  stored: StoredState | null;
  selectedDayId: string | null;
  missingDayIds: ReadonlySet<string>;
  hasTemplates: boolean;
  actions: PhaseActions;
};

/**
 * Evreyi siler (8 sn "Geri al"). Şu anki evre ve tek evre silinmez; kaydırınca nedeni söylenir (menüde soluk durur).
 */
function removePhaseWithUndo(phase: ProgramPhase, shared: Shared, t: Messages) {
  const { phases, currentPhaseId, actions } = shared;
  if (phase.id === currentPhaseId) {
    toast(t.cantDeleteCurrent);
    return;
  }
  if (phases.length <= 1) {
    toast(t.cantDeleteOnly);
    return;
  }
  actions.updateWithUndo((all) => removePhase(all, phase.id, currentPhaseId), t.deleted(phase.name));
}

/** Evrenin menüsü: kopyala, şu anki evre yap, sil. Taşıma tutamaçla (ve klavyede Alt + ↑/↓). */
function PhaseMenu({ phase, shared }: { phase: ProgramPhase; shared: Shared }) {
  const t = useMessages(ptProgramMessages).phasesCard;
  const locale = useLocale();
  const { phases, currentPhaseId, actions } = shared;
  const isCurrent = phase.id === currentPhaseId;
  const copy = () => {
    const all = actions.current();
    const source = all.find((item) => item.id === phase.id);
    if (!source) return;
    const created = copyPhase(all, source, programIdSource(all), locale);
    actions.update((phasesNow) => addPhase(phasesNow, created, phase.id), {
      select: created.days[0]?.id,
      announce: t.added(created.name),
    });
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon" aria-label={t.menuAria(phase.name)} />}>
        <DotsThreeVertical weight="bold" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48 touch:**:data-[slot=dropdown-menu-item]:min-h-11 touch:**:data-[slot=dropdown-menu-sub-trigger]:min-h-11">
        <DropdownMenuItem disabled={!canAddPhase(phases, phase.days.length)} onClick={copy}>
          <Copy />
          {t.copy}
        </DropdownMenuItem>
        {isCurrent ? null : (
          <DropdownMenuItem onClick={() => actions.setCurrentPhase(phase.id)}>
            <PushPin />
            {t.makeCurrent}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={isCurrent || phases.length <= 1}
          onClick={() => removePhaseWithUndo(phase, shared, t)}>
          <Trash />
          {t.deletePhase}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Bir evre: ad, süre, sıklık (yalnız evrede hiç atama yokken), durum rozeti, menü; altında programlar (seçilebilir
 * çipler, atandıkları günlerle) ve "+ Program".
 */
function PhaseRow({ phase, index, shared, slot }: { phase: ProgramPhase; index: number; shared: Shared; slot: SortableSlot }) {
  const t = useMessages(ptProgramMessages).phasesCard;
  const { form, phases, currentPhaseId, stored, selectedDayId, missingDayIds, hasTemplates, actions } = shared;
  const nameField = useField(form, { path: ['phases', index, 'name'] });
  const weeksField = useField(form, { path: ['phases', index, 'weeks'] });
  const daysArray = useFieldArray(form, { path: ['phases', index, 'days'] });
  const isCurrent = phase.id === currentPhaseId;
  const pending = isCurrent && stored !== null && stored.current.phaseId !== phase.id;
  const weeks = typeof weeksField.input === 'number' && !Number.isNaN(weeksField.input) ? weeksField.input : '';

  return (
    <>
    {/* Tutamaç kaydırma satırının dışında: dokunma alanı kartın üstüne taşar (`SwipeRow` kırpar). */}
    {slot.grabber}
    <SwipeRow id={phase.id} end={[deleteAction(() => removePhaseWithUndo(phase, shared, t), { disabled: isCurrent || phases.length <= 1 })]}>
    <div
      className={cn(
        'relative flex flex-col gap-3 rounded-lg border bg-card p-3 pt-4',
        isCurrent && 'border-primary-text bg-[color-mix(in_oklab,var(--primary)_5%,var(--card))]',
      )}>
      <div className="flex flex-wrap items-end gap-3">
        <Field data-invalid={Boolean(nameField.errors) || undefined} className="basis-full gap-1.5 sm:max-w-sm sm:flex-1 sm:basis-auto">
          <FieldLabel htmlFor={`phase-name-${phase.id}`} className="text-xs text-muted-foreground">
            {t.nameLabel}
          </FieldLabel>
          <div className="flex items-center gap-2">
            <span className="w-5 shrink-0 text-sm font-medium tabular-nums text-muted-foreground">{index + 1}.</span>
            <Input
              {...nameField.props}
              id={`phase-name-${phase.id}`}
              value={nameField.input ?? ''}
              maxLength={PROGRAM_LIMITS.phaseName}
              aria-invalid={Boolean(nameField.errors) || undefined}
              onKeyDown={keepLineEnter}
            />
          </div>
        </Field>
        <Field data-invalid={Boolean(weeksField.errors) || undefined} className="w-32 gap-1.5">
          <FieldLabel htmlFor={`phase-weeks-${phase.id}`} className="text-xs text-muted-foreground">
            {t.durationLabel}
          </FieldLabel>
          <InputGroup>
            <InputGroupInput
              {...weeksField.props}
              id={`phase-weeks-${phase.id}`}
              type="number"
              inputMode="numeric"
              min={1}
              max={PROGRAM_LIMITS.weeks}
              placeholder={t.openEnded}
              className="tabular-nums"
              aria-invalid={Boolean(weeksField.errors) || undefined}
              value={weeks}
              onKeyDown={keepLineEnter}
              onChange={(event) =>
                setInput(form, {
                  path: ['phases', index, 'weeks'],
                  input: event.currentTarget.value === '' ? undefined : event.currentTarget.valueAsNumber,
                })
              }
            />
            <InputGroupAddon align="inline-end">{t.weeksUnit}</InputGroupAddon>
          </InputGroup>
        </Field>
        {hasAssignments(phase.days) ? null : (
          <FrequencySelect form={form} phaseIndex={index} id={`phase-frequency-${phase.id}`} label={t.perWeekLabel} compact className="w-32" />
        )}
        <div className="flex flex-1 items-center justify-end gap-2 pb-1 sm:flex-none">
          {isCurrent ? <Badge variant="secondary">{pending ? t.currentPending : t.current}</Badge> : null}
          <PhaseMenu phase={phase} shared={shared} />
        </div>
      </div>
      {nameField.errors || weeksField.errors ? (
        <FieldError>{nameField.errors?.[0] ?? weeksField.errors?.[0]}</FieldError>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-muted-foreground">{t.programsLabel}</span>
        <DayChips
          form={form}
          phase={phase}
          phaseIndex={index}
          phased
          selectedDayId={selectedDayId}
          missingDayIds={missingDayIds}
          actions={actions}>
          <AddDayMenu
            phase={phase}
            phases={phases}
            phased
            selectedDayId={selectedDayId}
            hasTemplates={hasTemplates}
            actions={actions}
          />
        </DayChips>
        <FieldError>{daysArray.errors?.[0]}</FieldError>
      </div>
    </div>
    </SwipeRow>
    </>
  );
}

/** Evre süresi dolduysa sonraki evreye geçiş önerisi (düzenlemede; geçiş kayıtla olur). */
function Suggestion({ shared, now, timeZone }: { shared: Shared; now: string; timeZone: string }) {
  const t = useMessages(ptProgramMessages).phasesCard;
  const locale = useLocale();
  const format = getFormat(locale);
  const common = useMessages(commonMessages);
  const { phases, currentPhaseId, stored, actions } = shared;
  if (!stored) return null;
  if (currentPhaseId !== stored.current.phaseId) {
    const target = phases.find((phase) => phase.id === currentPhaseId);
    // Kayıttaki evre bu düzenlemede silindiyse geri dönülecek yer yok.
    const canRevert = phases.some((phase) => phase.id === stored.current.phaseId);
    return (
      <Alert>
        <Info />
        <AlertDescription>
          {t.willSwitch(target?.name ?? '')}
        </AlertDescription>
        {canRevert ? (
          <div className="col-start-2 mt-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => actions.setCurrentPhase(stored.current.phaseId)}>
              {common.actions.cancel}
            </Button>
          </div>
        ) : null}
      </Alert>
    );
  }
  const status = phaseStatus({ phases, current: stored.current }, new Date(now));
  const phase = phases.find((item) => item.id === stored.current.phaseId);
  if (!phase) return null;
  if (status.kind === 'due') {
    const next = phases.find((item) => item.id === status.nextPhaseId);
    return (
      <Alert>
        <Info />
        <AlertTitle>{t.expired(phase.name)}</AlertTitle>
        <AlertDescription>{t.plannedStarted(status.weeks, format.date(stored.current.startedAt, timeZone), next?.name ?? '')}</AlertDescription>
        <div className="col-start-2 mt-2">
          <Button type="button" size="sm" onClick={() => actions.setCurrentPhase(status.nextPhaseId)}>
            <ArrowRight data-icon="inline-start" />
            {t.advance}
          </Button>
        </div>
      </Alert>
    );
  }
  if (status.kind === 'ended') {
    return (
      <Alert>
        <Info />
        <AlertDescription>
          {t.endedNote(phase.name)}
        </AlertDescription>
      </Alert>
    );
  }
  return null;
}

/**
 * Evreler (program evrelere bölündüyse): şu anki evrenin "Haftanın programı" özeti (atama evre başınadır; danışan şu
 * anki evrenin atamalarını görür), evre başına ad, süre ve sıklık alanları, evre menüsü, programlar. Programlar çip
 * olarak seçilir; seçili program aşağıdaki düzenleyicide açılır, günleri orada atanır. Hatalı program kırmızı
 * çerçeveyle işaretlenir. "Evreleri kaldır" programları tek listede birleştirir; yalnız şu anki evrenin atamaları kalır.
 */
export function PhasesCard({
  now,
  timeZone,
  ...shared
}: Shared & {
  now: string;
  timeZone: string;
}) {
  const t = useMessages(ptProgramMessages).phasesCard;
  const locale = useLocale();
  const { form, phases, currentPhaseId, actions } = shared;
  const currentPhase = phases.find((phase) => phase.id === currentPhaseId) ?? phases[0];
  // Formisch kancası: günlerin `getDeepError` okumaları bu bileşenin çizimine bağlansın.
  const phasesArray = useFieldArray(form, { path: ['phases'] });
  const [unphasing, setUnphasing] = useState(false);
  const unphase = () => (phases.length <= 1 ? actions.setPhased(false) : setUnphasing(true));
  /** Evreyi taşır (tutamaç ya da Alt + ↑/↓) ve yeni sırasını söyler. */
  const movePhaseTo = (id: string, target: ReorderTarget | { over: string }) => {
    const moved = moveItem(actions.current(), (phase) => phase.id, id, target);
    const position = moved.findIndex((phase) => phase.id === id);
    const name = moved[position]?.name ?? '';
    actions.update((all) => moveItem(all, (phase) => phase.id, id, target), { announce: t.moved(name, position + 1) });
  };

  const addNewPhase = () => {
    const all = actions.current();
    const created = blankPhase(all, programIdSource(all), locale);
    actions.update((phasesNow) => addPhase(phasesNow, created), {
      select: created.days[0]?.id,
      announce: t.added(created.name),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.title}</CardTitle>
        <CardDescription>
          {t.description}
        </CardDescription>
        <CardAction className="flex items-center gap-1">
          <Button type="button" variant="outline" size="sm" disabled={!canAddPhase(phases)} onClick={addNewPhase}>
            <Plus data-icon="inline-start" />
            {t.addPhase}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon" aria-label={t.optionsAria} />}>
              <DotsThreeVertical weight="bold" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48 touch:**:data-[slot=dropdown-menu-item]:min-h-11 touch:**:data-[slot=dropdown-menu-sub-trigger]:min-h-11">
              <DropdownMenuItem onClick={unphase}>
                <Rows />
                {t.removePhases}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Suggestion shared={shared} now={now} timeZone={timeZone} />
        {currentPhase ? <AssignmentSummary days={currentPhase.days} label={t.weekProgram(currentPhase.name)} /> : null}
        <SortableList
          items={phases}
          keyOf={(phase) => phase.id}
          nameOf={(phase) => phase.name || t.phaseN(phases.indexOf(phase) + 1)}
          label={t.listLabel}
          onStep={(id, target) => movePhaseTo(id, target)}
          onDrop={(id, over) => movePhaseTo(id, { over })}
          onTapItem={(id) => document.getElementById(`phase-name-${id}`)?.focus()}
          renderItem={(phase, slot) => <PhaseRow phase={phase} index={phases.indexOf(phase)} shared={shared} slot={slot} />}
        />
        <FieldError>{phasesArray.errors?.[0]}</FieldError>
      </CardContent>
      <UnphaseDialog
        open={unphasing}
        onOpenChange={setUnphasing}
        phases={phases}
        currentPhaseId={currentPhaseId}
        onConfirm={() => actions.setPhased(false)}
      />
    </Card>
  );
}
