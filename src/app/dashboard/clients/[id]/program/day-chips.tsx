'use client';

import { getDeepError } from '@formisch/react';
import { Copy, FileText, Square, WarningCircle } from '@phosphor-icons/react';
import { Plus } from '@/components/line-icons';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { displayDays, blankDay, canAddDay, copyDay, programIdSource, addDay, type ProgramPhase } from '@/lib/program-plan';
import { weekdayNamesText, weekdaysText } from '@/lib/training-days';
import { cn } from '@/lib/utils';
import type { PhaseActions, ProgramFormStore } from './program-form';
import { useLocale, useMessages } from '@/i18n/client';
import { ptProgramMessages } from '@/i18n/messages/pt-program';

/** Evreye program eklenir: evreyi güncel hâlinden bulur, yeni programı seçer. */
function addDayTo(
  actions: PhaseActions,
  phaseId: string,
  make: (phase: ProgramPhase, all: ProgramPhase[]) => ProgramPhase['days'][number],
  announce: (name: string) => string,
  after?: string,
) {
  const all = actions.current();
  const phase = all.find((item) => item.id === phaseId);
  if (!phase) return;
  const day = make(phase, all);
  actions.update((phasesNow) => addDay(phasesNow, phaseId, day, after), { select: day.id, announce: announce(day.name) });
}

/** "+ Program": boş program, şablondan, seçili programın kopyası (kopya ve yeni program atamasız gelir). */
export function AddDayMenu({
  phase,
  phases,
  phased,
  selectedDayId,
  hasTemplates,
  actions,
}: {
  phase: ProgramPhase;
  phases: ProgramPhase[];
  phased: boolean;
  selectedDayId: string | null;
  hasTemplates: boolean;
  actions: PhaseActions;
}) {
  const t = useMessages(ptProgramMessages).dayChips;
  const locale = useLocale();
  const selectedHere = phase.days.find((day) => day.id === selectedDayId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={!canAddDay(phases, phase.id)}
        render={<Button type="button" variant="outline" size="sm" aria-label={phased ? t.addToPhase(phase.name) : t.addAria} />}>
        <Plus data-icon="inline-start" />
        {t.trigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-52 touch:**:data-[slot=dropdown-menu-item]:min-h-11 touch:**:data-[slot=dropdown-menu-sub-trigger]:min-h-11">
        <DropdownMenuItem onClick={() => addDayTo(actions, phase.id, (target, all) => blankDay(target, programIdSource(all), locale), t.added)}>
          <Square />
          {t.blank}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!hasTemplates} onClick={() => actions.openAddDay(phase.id)}>
          <FileText />
          {hasTemplates ? t.fromTemplate : t.fromTemplateNone}
        </DropdownMenuItem>
        {selectedHere ? (
          <DropdownMenuItem
            onClick={() =>
              addDayTo(
                actions,
                phase.id,
                (target, all) => {
                  const source = target.days.find((day) => day.id === selectedHere.id) ?? selectedHere;
                  return copyDay(target, source, programIdSource(all), locale);
                },
                t.added,
                selectedHere.id,
              )
            }>
            <Copy />
            {t.copySelected}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Evrenin (evresizde bütün planın) programları: seçilebilir çipler; seçili program aşağıdaki düzenleyicide açılır.
 * Çipte adın yanında atandığı günler küçük ve soluk ("Alt vücut Sal"); dönüş olmadığı için "sıradaki" işareti yok
 * (Faz 3). Hatalı program kırmızı çerçeveyle işaretlenir. Sonuna `children` (ör. "+ Program") eklenir.
 */
export function DayChips({
  form,
  phase,
  phaseIndex,
  phased,
  selectedDayId,
  missingDayIds,
  actions,
  children,
}: {
  form: ProgramFormStore;
  phase: ProgramPhase;
  phaseIndex: number;
  phased: boolean;
  selectedDayId: string | null;
  missingDayIds: ReadonlySet<string>;
  actions: PhaseActions;
  children?: React.ReactNode;
}) {
  const t = useMessages(ptProgramMessages).dayChips;
  const locale = useLocale();
  return (
    <div className="flex flex-wrap gap-2">
      {displayDays(phase.days).map((day) => {
        const dayIndex = phase.days.indexOf(day);
        const selected = day.id === selectedDayId;
        const failing = Boolean(getDeepError(form, { path: ['phases', phaseIndex, 'days', dayIndex] })) || missingDayIds.has(day.id);
        const assigned = day.weekdays ?? [];
        // 375 px'te uzun ad ve günler satıra sığmazsa ad kırpılır (tam adı erişilebilir adda); günler hep görünür.
        return (
          <Button
            key={day.id}
            type="button"
            size="sm"
            variant={selected ? 'default' : 'outline'}
            aria-pressed={selected}
            aria-label={`${phased ? `${phase.name} · ` : ''}${day.name}, ${weekdayNamesText(assigned, locale) || t.noDays}${failing ? t.failing : ''}`}
            className={cn('max-w-full', failing && 'ring-2 ring-destructive')}
            onClick={() => actions.select(day.id)}>
            {failing ? <WarningCircle data-icon="inline-start" className="text-destructive" /> : null}
            <span className="min-w-0 truncate">{day.name}</span>
            {assigned.length > 0 ? (
              // Seçili (dolu) çipte soluk gri okunmaz: yazının kendi rengi biraz açılır.
              <span className={cn('shrink-0 text-xs font-normal', selected ? 'opacity-80' : 'text-muted-foreground')} aria-hidden>
                {weekdaysText(assigned, locale)}
              </span>
            ) : null}
          </Button>
        );
      })}
      {children}
    </div>
  );
}
