'use client';

import { useFieldArray } from '@formisch/react';
import { Rows } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldError } from '@/components/ui/field';
import { hasAssignments } from '@/lib/day-assignments';
import type { ProgramPhase } from '@/lib/program-plan';
import { AddDayMenu, DayChips } from './day-chips';
import { FrequencySelect } from './frequency-select';
import type { PhaseActions, ProgramFormStore } from './program-form';
import { AssignmentSummary } from './weekday-field';
import { useMessages } from '@/i18n/client';
import { ptProgramMessages } from '@/i18n/messages/pt-program';

/**
 * Evresiz program (Faz 3): "Haftanın programı" — her program haftanın günlerine atanır (seçili programın kartındaki
 * çipler), burada atamaların salt okunur özeti, programların çipleri ve "+ Program". "Haftada kaç gün" yalnız hiç
 * atama yokken: atamalı evrede sıklık atanmış gün sayısıdır, kayıtta `daysPerWeek` düşer (`normalizeProgram`).
 * Uyum, güç gibi dönemler istenirse "Evrelere böl". Program tek, gizli bir evrede durur (`phases[0]`).
 */
export function DaysCard({
  form,
  phases,
  selectedDayId,
  missingDayIds,
  hasTemplates,
  actions,
}: {
  form: ProgramFormStore;
  phases: ProgramPhase[];
  selectedDayId: string | null;
  missingDayIds: ReadonlySet<string>;
  hasTemplates: boolean;
  actions: PhaseActions;
}) {
  const t = useMessages(ptProgramMessages).daysCard;
  const phasesArray = useFieldArray(form, { path: ['phases'] });
  const daysArray = useFieldArray(form, { path: ['phases', 0, 'days'] });
  const phase = phases[0];
  if (!phase) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.title}</CardTitle>
        <CardDescription>
          {t.description}
        </CardDescription>
        <CardAction>
          <Button type="button" variant="outline" size="sm" onClick={() => actions.setPhased(true)}>
            <Rows data-icon="inline-start" />
            {t.splitPhases}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <AssignmentSummary days={phase.days} />
        {hasAssignments(phase.days) ? null : (
          <FrequencySelect
            form={form}
            phaseIndex={0}
            id="program-frequency"
            label={t.freqLabel}
            description={t.freqHint}
            className="max-w-xs"
          />
        )}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">{t.programsLabel}</span>
          <DayChips
            form={form}
            phase={phase}
            phaseIndex={0}
            phased={false}
            selectedDayId={selectedDayId}
            missingDayIds={missingDayIds}
            actions={actions}>
            <AddDayMenu
              phase={phase}
              phases={phases}
              phased={false}
              selectedDayId={selectedDayId}
              hasTemplates={hasTemplates}
              actions={actions}
            />
          </DayChips>
          <FieldError>{daysArray.errors?.[0] ?? phasesArray.errors?.[0]}</FieldError>
        </div>
      </CardContent>
    </Card>
  );
}
