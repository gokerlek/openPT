'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Field as FormField, Form, getDeepError, setInput, useForm } from '@formisch/react';
import { WarningCircle } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { ImageField, KEEP, type ImageChange } from '@/components/image-field';
import { LabeledSelect } from '@/components/labeled-select';
import { ToggleTiles } from '@/components/toggle-tiles';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  deviceKindLabels,
  deviceLoads,
  PULLEY_RATIOS,
  takesAttachments,
  type DeviceKind,
  type DeviceLoadSettings,
  type PulleyRatio,
} from '@/lib/device-loads';
import { attachmentImageUrl } from '@/lib/attachment-media';
import { deviceImageUrl } from '@/lib/device-media';
import { ATTACHMENTS_MAX, type Attachment } from '@/lib/schemas/attachment';
import { ApiError, fetchJson } from '@/lib/query/errors';
import { applyFieldErrors } from '@/lib/query/field-errors';
import { useServiceMutation } from '@/lib/query/use-service';
import {
  ADD_ON_OPTIONS,
  deviceFormSchema,
  needsBase,
  needsMax,
  needsStep,
  needsWeights,
  takesAddOns,
  type Device,
  type DeviceInput,
} from '@/lib/schemas/device';
import { useLocale, useMessages } from '@/i18n/client';
import { getFormat } from '@/lib/format';
import { ptLibraryMessages } from '@/i18n/messages/pt-library';
import { commonMessages } from '@/i18n/messages/common';

/** Tür seçilince gelen başlangıç ayarları (yaygın değerler; PT değiştirir). */
const KIND_DEFAULTS: Record<DeviceKind, Partial<DeviceInput>> = {
  selectorized: { baseKg: 5, stepKg: 5, maxKg: 100, addOnsKg: [2.5] },
  cable: { baseKg: 5, stepKg: 5, maxKg: 100, addOnsKg: [2.5], pulleyRatio: 1 },
  plate_loaded: { baseKg: 20, stepKg: 5 },
  barbell: { baseKg: 20, stepKg: 2.5 },
  dumbbell: { weightsKg: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30] },
  kettlebell: { weightsKg: [4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32] },
  bodyweight: {},
  band: {},
  cardio: {},
};

/** "2 4 6 12,5" → [2, 4, 6, 12.5]; ondalıkta virgül ya da nokta. */
function parseWeights(text: string): number[] {
  return text
    .split(/[\s;]+/)
    .map((part) => Number(part.replace(',', '.')))
    .filter((value) => Number.isFinite(value) && value > 0);
}

type FormStart = Partial<DeviceInput> & Pick<DeviceInput, 'name' | 'kind'>;

const BLANK: FormStart = { name: '', kind: 'selectorized', ...KIND_DEFAULTS.selectorized };

/**
 * Cihaza takılabilen aparatlar: havuzdan seçilir (`/dashboard/attachments`).
 *
 * Aparat cihazın içinde tanımlanmaz — fotoğrafı ve adı havuzda bir kez durur, aynı
 * aparat birden çok cihazda kullanılabilir. Burada yalnız hangilerinin bu cihaza
 * takıldığı işaretlenir.
 */
function AttachmentPicker({
  form,
  pool,
}: {
  form: ReturnType<typeof useForm<typeof deviceFormSchema>>;
  pool: Attachment[];
}) {
  const t = useMessages(ptLibraryMessages).deviceForm;
  return (
    <FormField of={form} path={['attachments']}>
      {(field) => {
        const selected = (field.input ?? []).filter((id): id is string => typeof id === 'string');
        const toggle = (id: string) => {
          const next = selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id];
          if (next.length > ATTACHMENTS_MAX) return;
          setInput(form, { path: ['attachments'], input: next });
        };

        return (
          <FieldSet className="lg:col-span-2">
            <FieldLegend>{t.attachmentsLegend}</FieldLegend>
            <Field data-invalid={Boolean(field.errors) || undefined}>
              <FieldDescription>
                {t.poolNote.lead}
                <Link href="/dashboard/attachments/new" className="font-medium text-foreground underline underline-offset-4">
                  {t.poolNote.link}
                </Link>
                {t.poolNote.tail}
              </FieldDescription>
              <ToggleTiles
                items={pool.map((attachment) => ({ id: attachment.id, title: attachment.name, image: attachmentImageUrl(attachment) ?? null }))}
                selected={selected}
                onToggle={toggle}
                max={ATTACHMENTS_MAX}
              />
              <FieldError>{field.errors?.[0]}</FieldError>
            </Field>
          </FieldSet>
        );
      }}
    </FormField>
  );
}

/** Sayı alanı: Formisch değeri metin verir, şema sayı bekler. */
function NumberField({
  form,
  path,
  label,
  description,
}: {
  form: ReturnType<typeof useForm<typeof deviceFormSchema>>;
  path: 'baseKg' | 'stepKg' | 'maxKg';
  label: string;
  description?: string;
}) {
  return (
    <FormField of={form} path={[path]}>
      {(field) => (
        <Field data-invalid={Boolean(field.errors) || undefined}>
          <FieldLabel htmlFor={path}>{label}</FieldLabel>
          <Input
            {...field.props}
            id={path}
            type="number"
            step="0.25"
            min="0"
            className="tabular-nums"
            value={typeof field.input === 'number' && !Number.isNaN(field.input) ? field.input : ''}
            onChange={(event) =>
              setInput(form, {
                path: [path],
                // Okunamayan sayı ("2,5") boş sayılmaz: NaN doğrulamada "Sayı gir." der.
                input: event.currentTarget.validity.badInput
                  ? Number.NaN
                  : event.currentTarget.value === ''
                    ? undefined
                    : event.currentTarget.valueAsNumber,
              })
            }
          />
          {description ? <FieldDescription>{description}</FieldDescription> : null}
          <FieldError>{field.errors?.[0]}</FieldError>
        </Field>
      )}
    </FormField>
  );
}

/**
 * Cihaz ekleme/düzenleme formu — kendi sayfasında (modal değil). Alanlar türe göre
 * değişir; altta cihazda ayarlanabilen ağırlıkların canlı önizlemesi var.
 */
export function DeviceForm({ editing, attachments }: { editing: Device | null; attachments: Attachment[] }) {
  const t = useMessages(ptLibraryMessages).deviceForm;
  const locale = useLocale();
  const format = getFormat(locale);
  const common = useMessages(commonMessages);
  const router = useRouter();
  // Görsel formun şemasında yok; ayrı uçtan yönetilir. Havuzda artık olmayan (silinmiş)
  // aparat forma alınmaz: seçicide görünmez, kaldırılamaz olurdu ve sunucu da reddeder.
  const pool = new Set(attachments.map((attachment) => attachment.id));
  const start: FormStart = editing
    ? (({ id: _id, image: _image, ...rest }) => ({ ...rest, attachments: rest.attachments?.filter((id) => pool.has(id)) }))(editing)
    : BLANK;
  const form = useForm({ schema: deviceFormSchema, initialInput: start });
  const [weightsText, setWeightsText] = useState((start.weightsKg ?? []).map(format.number).join(' '));
  const [image, setImage] = useState<ImageChange>(KEEP);
  const [imageError, setImageError] = useState<string | null>(null);
  const currentImageUrl = editing ? deviceImageUrl(editing) : null;

  const save = useServiceMutation({
    fn: async (values: DeviceInput) => {
      const { id } = await fetchJson<{ id: string }>('/api/devices', {
        method: 'POST',
        body: JSON.stringify(editing ? { ...values, id: editing.id } : values),
      });
      // Görsel ayrı uca gider. Cihaz kaydedildiyse görsel hatası kaydı geri almaz.
      try {
        if (image.kind === 'upload') {
          const body = new FormData();
          body.set('image', image.file);
          await fetchJson(`/api/devices/${id}/image`, { method: 'POST', body });
        } else if (image.kind === 'remove') {
          await fetchJson(`/api/devices/${id}/image`, { method: 'DELETE' });
        }
      } catch (error) {
        return { id, imageFailed: error instanceof ApiError ? error.message : t.imageFailed };
      }
      return { id, imageFailed: null };
    },
    invalidate: [['devices'], ['exercises']],
    notify: { success: editing ? t.updated : t.added },
    onError: (error) => applyFieldErrors(form as never, error),
    onSuccess: ({ id, imageFailed }) => {
      if (imageFailed) {
        toast.error(t.savedButImage(imageFailed));
        router.push(`/dashboard/devices/${id}/edit`);
      } else {
        router.push(`/dashboard/devices/${id}`);
      }
      router.refresh();
    },
  });

  const hiddenError = getDeepError(form);

  return (
    <Form of={form} className="grid gap-x-8 gap-y-6 lg:grid-cols-2" onSubmit={(values) => save.mutateAsync(values as DeviceInput).catch(() => undefined)}>
      <div className="flex flex-col gap-5">
        <FormField of={form} path={['name']}>
          {(field) => (
            <Field data-invalid={Boolean(field.errors) || undefined}>
              <FieldLabel htmlFor="name">{t.nameLabel}</FieldLabel>
              <Input {...field.props} id="name" value={field.input ?? ''} placeholder={t.namePlaceholder} />
              <FieldError>{field.errors?.[0]}</FieldError>
            </Field>
          )}
        </FormField>

        <FormField of={form} path={['kind']}>
          {(field) => (
            <Field>
              <FieldLabel htmlFor="kind">{t.kindLabel}</FieldLabel>
              <LabeledSelect
                id="kind"
                value={field.input}
                labels={deviceKindLabels(locale)}
                onChange={(kind) => {
                  setInput(form, { path: ['kind'], input: kind });
                  // Yeni türün yaygın ayarları gelsin; PT sonra değiştirir.
                  const defaults = KIND_DEFAULTS[kind];
                  setInput(form, { path: ['baseKg'], input: defaults.baseKg });
                  setInput(form, { path: ['stepKg'], input: defaults.stepKg });
                  setInput(form, { path: ['maxKg'], input: defaults.maxKg });
                  setInput(form, { path: ['addOnsKg'], input: defaults.addOnsKg ? [...defaults.addOnsKg] : undefined });
                  setInput(form, { path: ['pulleyRatio'], input: defaults.pulleyRatio });
                  setInput(form, { path: ['weightsKg'], input: defaults.weightsKg ? [...defaults.weightsKg] : undefined });
                  setWeightsText((defaults.weightsKg ?? []).map(format.number).join(' '));
                }}
              />
            </Field>
          )}
        </FormField>

        <ImageField
          currentUrl={currentImageUrl}
          change={image}
          onChange={setImage}
          error={imageError}
          onError={setImageError}
        />

        <FormField of={form} path={['notes']}>
          {(field) => (
            <Field>
              <FieldLabel htmlFor="notes">{t.notesLabel}</FieldLabel>
              <Textarea {...field.props} id="notes" rows={2} value={field.input ?? ''} placeholder={t.notesPlaceholder} />
              <FieldError>{field.errors?.[0]}</FieldError>
            </Field>
          )}
        </FormField>
      </div>

      <FormField of={form} path={['kind']}>
        {(kindField) => {
          const kind = kindField.input ?? 'selectorized';
          const hasLoads = needsBase(kind) || needsWeights(kind);
          return (
            <FieldSet>
              <FieldLegend>{t.loadLegend}</FieldLegend>
              {!hasLoads && !takesAttachments(kind) ? (
                <FieldDescription>
                  {t.noLoad}
                </FieldDescription>
              ) : null}

              {needsBase(kind) ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <NumberField form={form} path="baseKg" label={(t.baseLabels as Partial<Record<DeviceKind, string>>)[kind] ?? t.baseDefault} />
                  {needsStep(kind) ? (
                    <NumberField
                      form={form}
                      path="stepKg"
                      label={kind === 'selectorized' || kind === 'cable' ? t.stackStep : t.smallestIncrement}
                      description={kind === 'barbell' || kind === 'plate_loaded' ? t.plateHint : undefined}
                    />
                  ) : null}
                  {needsMax(kind) || kind === 'plate_loaded' ? (
                    <NumberField
                      form={form}
                      path="maxKg"
                      label={kind === 'plate_loaded' ? t.maxOptional : t.maxStack}
                    />
                  ) : null}
                </div>
              ) : null}

              {takesAddOns(kind) ? (
                <FormField of={form} path={['addOnsKg']}>
                  {(field) => (
                    <Field>
                      <FieldLabel>{t.addOnsLabel}</FieldLabel>
                      <ToggleGroup
                        multiple
                        variant="outline"
                        size="sm"
                        className="flex-wrap justify-start"
                        aria-label={t.addOnsAria}
                        value={(field.input ?? []).map(String)}
                        onValueChange={(value) =>
                          setInput(form, { path: ['addOnsKg'], input: (value as string[]).map(Number).sort((a, b) => a - b) })
                        }>
                        {ADD_ON_OPTIONS.map((option) => (
                          <ToggleGroupItem key={option} value={String(option)} className="tabular-nums touch:h-11">
                            {t.addOnOption(format.number(option))}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                      <FieldDescription>
                        {t.addOnsHint}
                      </FieldDescription>
                      <FieldError>{field.errors?.[0]}</FieldError>
                    </Field>
                  )}
                </FormField>
              ) : null}

              {kind === 'cable' ? (
                <FormField of={form} path={['pulleyRatio']}>
                  {(field) => (
                    <Field>
                      <FieldLabel>{t.pulleyLabel}</FieldLabel>
                      <ToggleGroup
                        variant="outline"
                        size="sm"
                        spacing={0}
                        aria-label={t.pulleyAria}
                        value={[String(field.input ?? 1)]}
                        onValueChange={(value) => {
                          const next = Number(value[0]) as PulleyRatio;
                          if (next) setInput(form, { path: ['pulleyRatio'], input: next });
                        }}>
                        {PULLEY_RATIOS.map((ratio) => (
                          <ToggleGroupItem key={ratio} value={String(ratio)} className="px-3 tabular-nums touch:h-11">
                            {ratio === 1 ? t.pulleySingle : ratio === 2 ? t.pulleyDouble : `${ratio}:1`}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                      <FieldDescription>{t.pulleyHelp[(field.input ?? 1) as PulleyRatio]}</FieldDescription>
                    </Field>
                  )}
                </FormField>
              ) : null}

              {needsWeights(kind) ? (
                <FormField of={form} path={['weightsKg']}>
                  {(field) => (
                    <Field data-invalid={Boolean(field.errors) || undefined}>
                      <FieldLabel htmlFor="weightsKg">{t.weightsLabel}</FieldLabel>
                      <Textarea
                        id="weightsKg"
                        rows={2}
                        className="tabular-nums"
                        value={weightsText}
                        onChange={(event) => {
                          setWeightsText(event.currentTarget.value);
                          setInput(form, { path: ['weightsKg'], input: parseWeights(event.currentTarget.value) });
                        }}
                        placeholder="2 4 6 8 10 12,5"
                      />
                      <FieldDescription>{t.weightsHint}</FieldDescription>
                      <FieldError>{field.errors?.[0]}</FieldError>
                    </Field>
                  )}
                </FormField>
              ) : null}

              {hasLoads ? <LoadsPreview form={form} kind={kind} /> : null}
            </FieldSet>
          );
        }}
      </FormField>

      <FormField of={form} path={['kind']}>
        {(kindField) => (takesAttachments(kindField.input ?? 'selectorized') ? <AttachmentPicker form={form} pool={attachments} /> : <></>)}
      </FormField>

      {hiddenError ? (
        <Alert variant="destructive" className="lg:col-span-2">
          <WarningCircle />
          <AlertTitle>{t.errorTitle}</AlertTitle>
          <AlertDescription>{hiddenError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex justify-end gap-2 border-t pt-4 lg:col-span-2">
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={editing ? `/dashboard/devices/${editing.id}` : '/dashboard/devices'} />}>
          {common.actions.cancel}
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? <Spinner data-icon="inline-start" /> : null}
          {save.isPending ? common.actions.saving : common.actions.save}
        </Button>
      </div>
    </Form>
  );
}

/** Cihazda ayarlanabilen ağırlıkların canlı önizlemesi (öneriler bunlardan seçilir). */
function LoadsPreview({ form, kind }: { form: ReturnType<typeof useForm<typeof deviceFormSchema>>; kind: DeviceKind }) {
  const t = useMessages(ptLibraryMessages).deviceForm;
  const format = getFormat(useLocale());
  return (
    <FormField of={form} path={['baseKg']}>
      {(base) => (
        <FormField of={form} path={['stepKg']}>
          {(step) => (
            <FormField of={form} path={['maxKg']}>
              {(max) => (
                <FormField of={form} path={['addOnsKg']}>
                  {(addOns) => (
                    <FormField of={form} path={['weightsKg']}>
                      {(weights) => {
                        const settings: DeviceLoadSettings = {
                          kind,
                          baseKg: base.input ?? undefined,
                          stepKg: step.input ?? undefined,
                          maxKg: max.input ?? undefined,
                          addOnsKg: (addOns.input ?? []).filter((value): value is number => typeof value === 'number'),
                          weightsKg: (weights.input ?? []).filter((value): value is number => typeof value === 'number'),
                        };
                        const loads = deviceLoads(settings);
                        const shown = loads?.slice(0, 24) ?? [];
                        return (
                          <Field>
                            <FieldLabel>{t.adjustableLabel}</FieldLabel>
                            {loads?.length ? (
                              <div className="flex flex-wrap gap-1.5">
                                {shown.map((load) => (
                                  <Badge key={load} variant="secondary" className="tabular-nums">
                                    {format.number(load)}
                                  </Badge>
                                ))}
                                {loads.length > shown.length ? (
                                  <Badge variant="outline" className="tabular-nums">
                                    {t.moreWeights(loads.length - shown.length)}
                                  </Badge>
                                ) : null}
                              </div>
                            ) : (
                              <FieldDescription>{t.adjustableEmpty}</FieldDescription>
                            )}
                          </Field>
                        );
                      }}
                    </FormField>
                  )}
                </FormField>
              )}
            </FormField>
          )}
        </FormField>
      )}
    </FormField>
  );
}
