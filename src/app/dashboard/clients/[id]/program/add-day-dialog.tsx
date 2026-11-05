'use client';

import { useMemo, useState } from 'react';
import { LabeledSelect } from '@/components/labeled-select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import type { TemplateOption } from '@/lib/program-plan';
import type { PickerExercise } from '@/lib/template-edit';
import { templateSummary } from '@/lib/template-plan';
import { useMessages } from '@/i18n/client';
import { ptProgramMessages } from '@/i18n/messages/pt-program';
import { commonMessages } from '@/i18n/messages/common';

/**
 * Şablondan program ekleme: şablonun blokları yeni kimlikle kopyalanır; program şablona bağlı
 * kalmaz (burada yapılan değişiklik şablonu, şablonda sonradan yapılan değişiklik programı
 * etkilemez). Yeni program atamasız gelir; günleri kartındaki çiplerle seçilir.
 */
export function AddDayDialog({
  open,
  onOpenChange,
  phaseName,
  templates,
  exercises,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Evreli programda evrenin adı; evresizde `null`. */
  phaseName: string | null;
  templates: TemplateOption[];
  exercises: ReadonlyMap<string, PickerExercise>;
  onAdd: (template: TemplateOption) => void;
}) {
  const t = useMessages(ptProgramMessages).addDayDialog;
  const common = useMessages(commonMessages);
  const sorted = useMemo(() => [...templates].sort((a, b) => a.name.localeCompare(b.name, 'tr')), [templates]);
  const [templateId, setTemplateId] = useState(sorted[0]?.id ?? '');
  const template = sorted.find((item) => item.id === templateId);
  const summary = template ? templateSummary({ blocks: template.blocks }, exercises) : null;
  const labels = Object.fromEntries(sorted.map((item) => [item.id, item.name]));

  return (
    <Dialog open={open} onOpenChange={(next) => onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>
            {t.description(phaseName)}
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="add-day-template">{t.templateLabel}</FieldLabel>
          <LabeledSelect id="add-day-template" value={templateId || undefined} labels={labels} onChange={setTemplateId} />
          {summary ? (
            <FieldDescription className="tabular-nums">{t.summary(summary.rows, summary.workingSets, summary.minutes)}
            </FieldDescription>
          ) : null}
        </Field>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {common.actions.cancel}
          </Button>
          <Button type="button" disabled={!template} onClick={() => template && onAdd(template)}>
            {common.actions.add}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
