'use client';

import { useState } from 'react';
import { Info, WarningCircle } from '@phosphor-icons/react';
import * as v from 'valibot';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { dayToTemplate, type TemplateOption } from '@/lib/program-plan';
import { fetchJson } from '@/lib/query/errors';
import { useServiceMutation } from '@/lib/query/use-service';
import { dayBlocksSchema } from '@/lib/schemas/program';
import { templateNameSchema } from '@/lib/schemas/template';
import { TEMPLATE_LIMITS, countRows, type TemplateBlock } from '@/lib/template-plan';
import { useMessages } from '@/i18n/client';
import { ptProgramMessages } from '@/i18n/messages/pt-program';
import { commonMessages } from '@/i18n/messages/common';

/**
 * Bir program (antrenman) yeni şablon olur. Şablonlar uygulama repo'sunda durur ve başka
 * danışanlarda da kullanılır: kişisel veri girmesin diye satır notları kopyalanmaz
 * (sunucu da siler), adı PT verir. Bloklar düzenleyicideki hâliyle gider.
 */
export function SaveTemplateDialog({
  open,
  onOpenChange,
  blocks,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dialog açılırken programın blokları. */
  blocks: TemplateBlock[];
  /** Yeni şablon: "Şablondan…" hemen kullanabilsin. */
  onCreated: (template: TemplateOption) => void;
}) {
  const t = useMessages(ptProgramMessages).saveTemplateDialog;
  const common = useMessages(commonMessages);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const valid = v.safeParse(dayBlocksSchema, blocks).success;
  const { droppedNotes } = dayToTemplate({ blocks }, name);

  const create = useServiceMutation({
    fn: (input: { name: string; blocks: TemplateBlock[] }) =>
      fetchJson<{ id: string }>('/api/templates/from-day', { method: 'POST', body: JSON.stringify(input) }),
    invalidate: [['templates']],
    notify: 'none',
    onError: (error) => {
      if (error.fields.name) setNameError(error.fields.name);
      else setFailure(error.message);
    },
    onSuccess: ({ id }, input) => {
      onOpenChange(false);
      toast.success(t.created(input.name), {
        action: { label: t.open, onClick: () => window.open(`/dashboard/templates/${id}`, '_blank') },
      });
      onCreated({ id, name: input.name, blocks: dayToTemplate({ blocks: input.blocks }, input.name).template.blocks });
    },
  });

  const submit = () => {
    const parsed = v.safeParse(templateNameSchema, name);
    if (!parsed.success) {
      setNameError(parsed.issues[0].message);
      return;
    }
    setNameError(null);
    setFailure(null);
    create.mutate({ name: parsed.output, blocks });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>
            {t.description(countRows(blocks))}
          </DialogDescription>
        </DialogHeader>
        <Field data-invalid={Boolean(nameError) || undefined}>
          <FieldLabel htmlFor="template-from-day-name">{t.nameLabel}</FieldLabel>
          <Input
            id="template-from-day-name"
            value={name}
            maxLength={TEMPLATE_LIMITS.name}
            placeholder={t.namePlaceholder}
            aria-invalid={Boolean(nameError) || undefined}
            onChange={(event) => setName(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              if (valid && !create.isPending) submit();
            }}
          />
          <FieldDescription>{t.nameHint}</FieldDescription>
          <FieldError>{nameError}</FieldError>
        </Field>
        <Alert>
          <Info />
          <AlertDescription>
            {t.notesNote}
            {droppedNotes > 0 ? t.notesCount(droppedNotes) : null}
          </AlertDescription>
        </Alert>
        {valid ? null : (
          <Alert variant="destructive">
            <WarningCircle />
            <AlertDescription>{t.invalid}</AlertDescription>
          </Alert>
        )}
        {failure ? <p className="text-sm text-destructive">{failure}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {common.actions.cancel}
          </Button>
          <Button type="button" disabled={!valid || create.isPending} onClick={submit}>
            {create.isPending ? <Spinner data-icon="inline-start" /> : null}
            {t.create}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
