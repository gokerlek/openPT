'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { hasAssignments } from '@/lib/day-assignments';
import { displayDays, PROGRAM_LIMITS, frequencyLabel, mergePhases, mergePhasesCheck, type ProgramPhase } from '@/lib/program-plan';
import { useLocale, useMessages } from '@/i18n/client';
import { lower } from '@/i18n/text';
import { ptProgramMessages } from '@/i18n/messages/pt-program';
import { commonMessages } from '@/i18n/messages/common';

/**
 * Evreleri kaldırma onayı (birden çok evrede): programlar sırasıyla tek listede birleşir, aynı adlı program "… 2"
 * olur, evre adları ve süreleri silinir. Yalnız şu anki evrenin gün atamaları kalır (`mergePhases`): öteki evrelerin
 * programları onların günleriyle çakışabilirdi, atanmamış gelir; pencere bunu söyler (herhangi bir evrede atama
 * varken). Sıklık şu anki evreden kalır; o evre atamalıysa sıklık atanmış gün sayısıdır, cümlesi yazılmaz.
 * Birleşince 7 antrenmanı aşacaksa kaldırılamaz.
 */
export function UnphaseDialog({
  open,
  onOpenChange,
  phases,
  currentPhaseId,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phases: ProgramPhase[];
  currentPhaseId: string;
  onConfirm: () => void;
}) {
  const t = useMessages(ptProgramMessages).unphaseDialog;
  const locale = useLocale();
  const common = useMessages(commonMessages);
  const check = mergePhasesCheck(phases);
  const { phases: merged, renamed } = mergePhases(phases, currentPhaseId, locale);
  const current = phases.find((phase) => phase.id === currentPhaseId) ?? phases[0];
  const names = displayDays(merged[0]?.days ?? []).map((day) => day.name).join(', ');
  const phaseOf = (dayId: string) => phases.find((phase) => phase.days.some((day) => day.id === dayId))?.name ?? '';
  const frequencyText = frequencyLabel(current?.daysPerWeek, locale);
  const frequency = frequencyText === null ? undefined : lower(locale, frequencyText);
  const currentAssigned = current ? hasAssignments(current.days) : false;
  const anyAssigned = phases.some((phase) => hasAssignments(phase.days));

  return (
    <AlertDialog open={open} onOpenChange={(next) => onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.title}</AlertDialogTitle>
          <AlertDialogDescription>
            {check.ok ? (
              <>
                {t.merged(phases.length, check.days, names)}
                {currentAssigned ? '.' : t.keepsFrequency(current?.name ?? '', frequency ?? t.frequencyNone)}
                {anyAssigned ? t.assignedOnly(current?.name ?? '') : null}
              </>
            ) : (
              <>
                {t.tooMany(check.days, PROGRAM_LIMITS.daysPerPhase)}
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {check.ok && renamed.length > 0 ? (
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{t.renamedLabel}</span>
            <ul className="flex flex-col gap-0.5">
              {renamed.map((item) => (
                <li key={item.dayId}>
                  {phaseOf(item.dayId)} · {item.from} → {item.to}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>{common.actions.cancel}</AlertDialogCancel>
          <AlertDialogAction
            disabled={!check.ok}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}>
            {t.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
