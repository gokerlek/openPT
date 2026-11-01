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
import { PROGRAM_LIMITS, frequencyLabel, mergePhases, mergePhasesCheck, type ProgramPhase } from '@/lib/program-plan';

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
  const check = mergePhasesCheck(phases);
  const { phases: merged, renamed } = mergePhases(phases, currentPhaseId);
  const current = phases.find((phase) => phase.id === currentPhaseId) ?? phases[0];
  const names = merged[0]?.days.map((day) => day.name).join(', ') ?? '';
  const phaseOf = (dayId: string) => phases.find((phase) => phase.days.some((day) => day.id === dayId))?.name ?? '';
  const frequency = frequencyLabel(current?.daysPerWeek)?.toLocaleLowerCase('tr');
  const currentAssigned = current ? hasAssignments(current.days) : false;
  const anyAssigned = phases.some((phase) => hasAssignments(phase.days));

  return (
    <AlertDialog open={open} onOpenChange={(next) => onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Evreler kaldırılsın mı?</AlertDialogTitle>
          <AlertDialogDescription>
            {check.ok ? (
              <>
                {phases.length} evredeki {check.days} antrenman tek listede birleşir: {names}. Evre adları ve süreleri silinir
                {currentAssigned ? '.' : `; sıklık '${current?.name ?? ''}' evresinden kalır (${frequency ?? 'belirtilmemiş'}).`}
                {anyAssigned
                  ? ` Yalnız '${current?.name ?? ''}' evresinin gün atamaları kalır; öteki evrelerden gelen programlar atanmamış olur.`
                  : null}
              </>
            ) : (
              <>
                Birleşince {check.days} antrenman olur; tek listede en fazla {PROGRAM_LIMITS.daysPerPhase} olabilir. Önce bazı
                programları kaldır.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {check.ok && renamed.length > 0 ? (
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Aynı adlı programlar yeniden adlanır:</span>
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
          <AlertDialogCancel>Vazgeç</AlertDialogCancel>
          <AlertDialogAction
            disabled={!check.ok}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}>
            Evreleri kaldır
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
