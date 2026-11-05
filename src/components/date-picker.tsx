'use client';
import { useState, type AriaAttributes } from 'react';
import { format } from 'date-fns';
import { enGB, tr } from 'date-fns/locale';
import { CalendarBlank } from '@phosphor-icons/react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { useLocale, useMessages } from '@/i18n/client';
import { uiMessages } from '@/i18n/messages/ui';
import { isCalendarDate } from '@/lib/measurement-log';

function dateOf(value: string | undefined): Date | undefined {
  if (!value || !isCalendarDate(value)) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year!, month! - 1, day!);
}
/** ISO storage/GET forms, display in the viewer's language (date-fns `tr` / `enGB`); the shared shadcn Calendar handles selection. */
export function DatePicker({ value, defaultValue = '', onValueChange, id, name, min, max, disabled, className, required, ...aria }: {
  value?: string; defaultValue?: string; onValueChange?: (value: string) => void;
  id?: string; name?: string; min?: string; max?: string; disabled?: boolean; required?: boolean; className?: string;
} & Pick<AriaAttributes, 'aria-invalid' | 'aria-label' | 'aria-labelledby'>) {
  const locale = useLocale(), t = useMessages(uiMessages).datePicker, dateLocale = locale === 'en' ? enGB : tr;
  const [local, setLocal] = useState(defaultValue), [open, setOpen] = useState(false);
  const chosen = value ?? local, selected = dateOf(chosen), minimum = dateOf(min), maximum = dateOf(max);
  function change(next: string) { setLocal(next); onValueChange?.(next); setOpen(false); }
  return <><input type="hidden" name={name} value={chosen} disabled={disabled} />
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button id={id} type="button" variant="outline" disabled={disabled} className={className} aria-required={required} {...aria} />}>
        <CalendarBlank data-icon="inline-start" />{selected ? format(selected, 'd MMM yyyy', { locale: dateLocale }) : t.pick}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar className="[--cell-size:clamp(2rem,calc((100vw-3rem)/7),2.75rem)]" mode="single" labels={{ labelMonthDropdown: () => t.month, labelYearDropdown: () => t.year, labelNext: () => t.nextMonth, labelPrevious: () => t.previousMonth }} locale={dateLocale} weekStartsOn={1} selected={selected} defaultMonth={selected ?? maximum} captionLayout="dropdown" startMonth={minimum ?? new Date(1900, 0)} endMonth={maximum ?? new Date(new Date().getFullYear() + 10, 11)} disabled={date => !!((minimum && date < minimum) || (maximum && date > maximum))} onSelect={date => { if (date) change(format(date, 'yyyy-MM-dd')); }} />
        {!required && chosen ? <Button variant="ghost" onClick={() => change('')}>{t.clear}</Button> : null}
      </PopoverContent>
    </Popover>
  </>;
}
