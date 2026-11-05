'use client';

import { setInput, useField } from '@formisch/react';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PROGRAM_LIMITS } from '@/lib/program-plan';
import { cn } from '@/lib/utils';
import type { ProgramFormStore } from './program-form';
import { useMessages } from '@/i18n/client';
import { ptProgramMessages } from '@/i18n/messages/pt-program';
import { commonMessages } from '@/i18n/messages/common';

/** Base UI boş metni "değer yok" sayar: "belirtilmedi" için boş olmayan bir işaret. */
const NONE = 'none';
const DAYS = Array.from({ length: PROGRAM_LIMITS.daysPerWeek }, (_, index) => index + 1);

/**
 * Haftada kaç gün (1–7) ya da belirtilmedi: evresiz programda programın, evrede evrenin
 * sıklığı. Danışanın ekranında ve planlanan haftalık kas yükünde kullanılır.
 */
export function FrequencySelect({
  form,
  phaseIndex,
  id,
  label,
  description,
  compact = false,
  className,
}: {
  form: ProgramFormStore;
  phaseIndex: number;
  id: string;
  label: string;
  description?: string;
  /** Dar alanda (evre satırı): "3 gün". */
  compact?: boolean;
  className?: string;
}) {
  const t = useMessages(ptProgramMessages).frequencySelect;
  const common = useMessages(commonMessages);
  const field = useField(form, { path: ['phases', phaseIndex, 'daysPerWeek'] });
  const value = typeof field.input === 'number' ? String(field.input) : NONE;
  const items = [
    { value: NONE, label: common.states.notSpecified },
    ...DAYS.map((days) => ({ value: String(days), label: compact ? t.daysShort(days) : t.daysPerWeek(days) })),
  ];
  return (
    <Field data-invalid={Boolean(field.errors) || undefined} className={cn('gap-1.5', className)}>
      <FieldLabel htmlFor={id} className={compact ? 'text-xs text-muted-foreground' : undefined}>
        {label}
      </FieldLabel>
      <Select
        items={items}
        value={value}
        onValueChange={(next) =>
          setInput(form, { path: ['phases', phaseIndex, 'daysPerWeek'], input: !next || next === NONE ? undefined : Number(next) })
        }>
        <SelectTrigger id={id} className="w-full" aria-invalid={Boolean(field.errors) || undefined}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      <FieldError>{field.errors?.[0]}</FieldError>
    </Field>
  );
}
