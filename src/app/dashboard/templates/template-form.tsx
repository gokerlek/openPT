'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Field as FormField, Form, getDeepError, setErrors, setInput, useForm } from '@formisch/react';
import { ArrowClockwise, ArrowSquareOut, WarningCircle } from '@phosphor-icons/react';
import { BlockEditor, useBlocks } from '@/components/block-editor/block-editor';
import type { BlocksFormStore } from '@/components/block-editor/block-items';
import { DraftAutosave, DraftNotice, useEditorDraft } from '@/components/block-editor/editor-draft';
import { keepLineEnter } from '@/components/block-editor/enter-key';
import { EditorSaveProvider, FloatingSaveButton } from '@/components/block-editor/editor-save';
import { MuscleMap } from '@/components/muscle-map/muscle-map';
import { loadDescription, loadMapProps } from '@/lib/muscle-tiers';
import { catalogMessages } from '@/i18n/messages/catalog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { UnsavedChangesGuard, type UnsavedChangesGuardHandle } from '@/components/unsaved-changes-guard';
import { exerciseSetWeights } from '@/lib/muscles';
import { fetchJson } from '@/lib/query/errors';
import { applyFieldErrors } from '@/lib/query/field-errors';
import { useServiceMutation } from '@/lib/query/use-service';
import { templateFormSchema, type Template, type TemplateFormValues, type TemplateInput } from '@/lib/schemas/template';
import { idSource, prepareForEditing, type EditorDevice, type PickerExercise } from '@/lib/template-edit';
import { templateMuscleLoad } from '@/lib/template-plan';
import { TEMPLATE_DRAFT_BASE, templateDraftKey } from '@/lib/unsaved-changes';
import { useLocale, useMessages } from '@/i18n/client';
import { ptLibraryMessages } from '@/i18n/messages/pt-library';

const BLANK: TemplateInput = { name: '', description: '', blocks: [], sharedWithClients: false };

/**
 * Şablon düzenleyici — kendi sayfasında (modal değil, SPEC §6).
 *
 * Tek Formisch formu: şablonun adı ve açıklaması burada, hareketler ortak hareket
 * düzenleyicide (`BlockEditor`, program günleriyle aynı). Listelerin anahtarları blok ve
 * satır kimlikleridir; sürükle-bırak sıralar ve gruplar, ekleme kütüphaneden dokunarak
 * yapılır. Kaydet "Hareketler" başlığında, yalnız değişiklik varken (`EditorSaveProvider`); telefonda
 * başlık ekran dışındayken dock'un üstünde yüzen kopyası (PT kararı 17). Kaydedilmemiş değişiklik
 * yerel taslakta durur ve sayfadan çıkış sorulur (PT kararı 16).
 */
export function TemplateForm({
  editing,
  exercises,
  devices,
  timeZone,
}: {
  editing: { template: Template; sha: string } | null;
  exercises: PickerExercise[];
  devices: EditorDevice[];
  timeZone: string;
}) {
  const t = useMessages(ptLibraryMessages).templateForm;
  const locale = useLocale();
  const router = useRouter();
  const exerciseById = useMemo(() => new Map(exercises.map((exercise) => [exercise.id, exercise])), [exercises]);

  // Düzenlemede artık olmayan cihaza yazılmış satırlar egzersizin cihazına döner (kaydedince kalıcı).
  const [start] = useState(() => {
    if (!editing) return { input: BLANK, dropped: 0 };
    const prepared = prepareForEditing(editing.template, new Set(devices.map((device) => device.id)));
    const input: TemplateInput = {
      name: editing.template.name,
      description: editing.template.description,
      blocks: prepared.blocks.map((block) => ({ ...block, rows: block.rows.map((row) => ({ ...row, note: row.note ?? '' })) })),
      sharedWithClients: editing.template.sharedWithClients ?? false,
    };
    return { input, dropped: prepared.droppedDeviceRowIds.length };
  });
  const form = useForm({ schema: templateFormSchema, initialInput: start.input });
  const blocks = useBlocks(form as unknown as BlocksFormStore, ['blocks']);
  const load = useMemo(() => templateMuscleLoad({ blocks }, exerciseById, exerciseSetWeights).load, [blocks, exerciseById]);
  const [stale, setStale] = useState(false);
  const guard = useRef<UnsavedChangesGuardHandle>(null);
  const draft = useEditorDraft({
    form,
    schema: templateFormSchema,
    storageKey: templateDraftKey(editing?.template.id ?? null),
    base: editing?.sha ?? null,
    baseSchema: TEMPLATE_DRAFT_BASE,
  });

  const save = useServiceMutation({
    fn: (values: TemplateFormValues) =>
      fetchJson<{ id: string; sha: string }>('/api/templates', {
        method: 'POST',
        body: JSON.stringify({ ...values, ...(editing ? { id: editing.template.id, baseSha: draft.saveBase ?? editing.sha } : {}) }),
      }),
    invalidate: [['templates']],
    notify: { success: editing ? t.updated : t.added },
    onError: (error) => {
      if (error.status === 412) setStale(true);
      else applyFieldErrors(form as never, error);
    },
    onSuccess: ({ id }) => {
      draft.discard();
      router.push(`/dashboard/templates/${id}`);
      router.refresh();
    },
  });

  // Kaydedilmemiş değişiklik varken sayfadan çıkış sorulur; cihazı silinmiş satırların düzeltmesi
  // de kaydedilmemiş iştir (Kaydet görünür).
  const dirty = form.isDirty || start.dropped > 0;
  const guarded = dirty && !save.isPending && !save.isSuccess;

  const submit = (values: TemplateFormValues) => {
    // Kütüphanede olmayan egzersiz kaydedilmez: satırın altında söylenir.
    let missing = false;
    values.blocks.forEach((block, blockIndex) =>
      block.rows.forEach((row, rowIndex) => {
        if (exerciseById.has(row.exerciseId)) return;
        missing = true;
        setErrors(form, {
          path: ['blocks', blockIndex, 'rows', rowIndex, 'exerciseId'],
          errors: [catalogMessages(locale).blocks.missingExercise],
        });
      }),
    );
    if (missing) return;
    return save.mutateAsync(values).then(
      () => undefined,
      () => undefined,
    );
  };

  const hiddenError = getDeepError(form);
  const detailHref = editing ? `/dashboard/templates/${editing.template.id}` : '/dashboard/templates';

  return (
    <EditorSaveProvider
      value={{
        dirty,
        pending: save.isPending || save.isSuccess,
        creating: !editing,
        submitLabel: editing ? t.saveButton : t.createButton,
      }}>
      <Form of={form} className="flex flex-col gap-6" onSubmit={submit}>
        {draft.offer ? <DraftNotice offer={draft.offer} timeZone={timeZone} onRestore={draft.restore} onDismiss={draft.dismiss} /> : null}

        <Card>
          <CardHeader>
            <CardTitle>{t.cardTitle}</CardTitle>
            <CardDescription>{t.cardDescription}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 lg:grid-cols-2">
            <FormField of={form} path={['name']}>
              {(field) => (
                <Field data-invalid={Boolean(field.errors) || undefined}>
                  <FieldLabel htmlFor="name">{t.nameLabel}</FieldLabel>
                  <Input
                    {...field.props}
                    id="name"
                    className="max-w-sm"
                    value={field.input ?? ''}
                    placeholder={t.namePlaceholder}
                    aria-invalid={Boolean(field.errors) || undefined}
                    onKeyDown={keepLineEnter}
                  />
                  <FieldError>{field.errors?.[0]}</FieldError>
                </Field>
              )}
            </FormField>
            <FormField of={form} path={['description']}>
              {(field) => (
                <Field data-invalid={Boolean(field.errors) || undefined}>
                  <FieldLabel htmlFor="description">{t.descriptionLabel}</FieldLabel>
                  <Textarea {...field.props} id="description" rows={2} value={field.input ?? ''} placeholder={t.descriptionPlaceholder} />
                  <FieldDescription>
                    {t.descriptionHint}
                  </FieldDescription>
                  <FieldError>{field.errors?.[0]}</FieldError>
                </Field>
              )}
            </FormField>
            <FormField of={form} path={['sharedWithClients']}>
              {(field) => (
                <Field orientation="horizontal" className="lg:col-span-2">
                  {/* Anahtar küçük: dokunma alanı çevresindeki etiketle 44 px. */}
                  <label className="-m-2 flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center">
                    <Switch
                      id="sharedWithClients"
                      checked={Boolean(field.input)}
                      onCheckedChange={(checked) => setInput(form, { path: ['sharedWithClients'], input: checked })}
                    />
                  </label>
                  <FieldContent>
                    <FieldLabel htmlFor="sharedWithClients">{t.sharedLabel}</FieldLabel>
                    <FieldDescription>
                      {t.sharedHint}
                    </FieldDescription>
                  </FieldContent>
                </Field>
              )}
            </FormField>
          </CardContent>
        </Card>

        <BlockEditor
          key={draft.generation}
          form={form as unknown as BlocksFormStore}
          path={['blocks']}
          exercises={exercises}
          devices={devices}
          newIds={idSource}
          noteHint={t.noteHint}
          libraryDescription={t.libraryDescription}
          notice={
            start.dropped > 0 ? (
              <Alert>
                <WarningCircle />
                <AlertDescription>{t.droppedDevices(start.dropped)}
                </AlertDescription>
              </Alert>
            ) : null
          }
        />

        {stale ? (
          <Alert variant="destructive">
            <WarningCircle />
            <AlertTitle>{t.staleTitle}</AlertTitle>
            <AlertDescription>
              {t.staleBody}
            </AlertDescription>
            <div className="col-start-2 mt-2 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" nativeButton={false} render={<Link href={detailHref} target="_blank" rel="noopener" />}>
                <ArrowSquareOut data-icon="inline-start" />
                {t.openNewTab}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  // Değişiklikler gider (metin öyle söylüyor): taslak da atılır, tarayıcı ayrıca sormaz.
                  draft.discard();
                  guard.current?.release();
                  router.refresh();
                  window.location.reload();
                }}>
                <ArrowClockwise data-icon="inline-start" />
                {t.reload}
              </Button>
            </div>
          </Alert>
        ) : null}

        {hiddenError ? (
          <Alert variant="destructive" data-form-error>
            <WarningCircle />
            <AlertTitle>{t.errorTitle}</AlertTitle>
            <AlertDescription>{hiddenError}</AlertDescription>
          </Alert>
        ) : null}


        <Card>
          <CardHeader>
            <CardTitle>{t.loadTitle}</CardTitle>
            <CardDescription>{loadDescription(locale)}</CardDescription>
          </CardHeader>
          <CardContent>
            {blocks.length > 0 ? (
              <MuscleMap layout="split" bodyClassName="h-56 lg:h-64" {...loadMapProps(load, 'session', t.loadLabel, {}, locale)} />
            ) : (
              <p className="text-sm text-muted-foreground">{t.loadEmpty}</p>
            )}
          </CardContent>
        </Card>

        <FloatingSaveButton />
      </Form>
      <DraftAutosave form={form} onChange={draft.sync} />
      <UnsavedChangesGuard ref={guard} active={guarded} description={t.guardDescription} onLeave={draft.leave} />
    </EditorSaveProvider>
  );
}
