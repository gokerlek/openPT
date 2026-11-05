'use client';

import { Field as FormField, setInput, type useForm } from '@formisch/react';
import { GroupedSelect } from '@/components/labeled-select';
import { Field, FieldDescription, FieldError, FieldLabel, FieldSet } from '@/components/ui/field';
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  axialLoadLabels,
  AXIAL_LOADS,
  contractionTypeLabels,
  CONTRACTION_TYPES,
  jointWindowLabels,
  JOINT_WINDOWS,
  kineticChainLabels,
  KINETIC_CHAINS,
  loadVectorLabels,
  LOAD_VECTORS,
  resistanceProfileLabels,
  RESISTANCE_PROFILES,
  shearLevelLabels,
  SHEAR_LEVELS,
  spinalAlignmentLabels,
  SPINAL_ALIGNMENTS,
  type JointWindow,
} from '@/lib/exercise-filter';
import type { exerciseFormSchema } from '@/lib/schemas/exercise';
import { ConditionPicker } from '@/components/condition-picker';
import { useLocale, useMessages } from '@/i18n/client';
import { ptLibraryMessages } from '@/i18n/messages/pt-library';

/**
 * Medikal etiketler: sakatlık süzgeci bunlara bakar (`src/lib/exercise-filter.ts`).
 *
 * Hiçbiri zorunlu değil — etiketlenmemiş hareket süzgeçte "kontrol edilmedi" diye görünür,
 * "uygun" sayılmaz. Yanlış etiket, etiketsizden kötüdür.
 */

type Form = ReturnType<typeof useForm<typeof exerciseFormSchema>>;

/** Tek seçimli etiket alanı; "Belirtilmemiş" seçeneği alanı boşaltır. */
function TagSelect<Value extends string>({
  form,
  path,
  label,
  values,
  labels,
  description,
}: {
  form: Form;
  path: string;
  label: string;
  values: readonly Value[];
  labels: Record<Value, string>;
  description?: string;
}) {
  const t = useMessages(ptLibraryMessages).medicalFields;
  return (
    <FormField of={form} path={[path as never]}>
      {(field) => (
        <Field data-invalid={Boolean(field.errors) || undefined}>
          <FieldLabel htmlFor={path}>{label}</FieldLabel>
          <GroupedSelect
            id={path}
            value={(field.input as string | undefined) ?? ''}
            groups={[{ label, options: values.map((value) => ({ value, label: labels[value] })) }]}
            empty={t.notSpecified}
            onChange={(value) => setInput(form, { path: [path as never], input: (value || undefined) as never })}
          />
          {description ? <FieldDescription>{description}</FieldDescription> : null}
          <FieldError>{field.errors?.[0]}</FieldError>
        </Field>
      )}
    </FormField>
  );
}

/** Seçilmiş kısıtlar: ekle/çıkar. Aynı kimliğin niteliksiz hali her şiddeti kapsar. */
function ConditionField({
  form,
  path,
  label,
  description,
}: {
  form: Form;
  path: 'contraindications' | 'safeFor';
  label: string;
  description: string;
}) {
  const t = useMessages(ptLibraryMessages).medicalFields;
  return (
    <FormField of={form} path={[path]}>
      {(field) => {
        const current = (field.input ?? []).filter((item): item is string => typeof item === 'string');
        return (
          <Field data-invalid={Boolean(field.errors) || undefined}>
            <FieldLabel htmlFor={path}>{label}</FieldLabel>
            <ConditionPicker id={path} placeholder={t.limitationPlaceholder} value={current} onChange={(next) => setInput(form, { path: [path], input: next })} />
            <FieldDescription>{description}</FieldDescription>
            <FieldError>{field.errors?.[0]}</FieldError>
          </Field>
        );
      }}
    </FormField>
  );
}

export function MedicalFields({ form }: { form: Form }) {
  const t = useMessages(ptLibraryMessages).medicalFields;
  const locale = useLocale();
  return (
    <FieldSet>
      <FieldDescription>
        {t.intro}
      </FieldDescription>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TagSelect form={form} path="kineticChain" label={t.chainLabel} values={KINETIC_CHAINS} labels={kineticChainLabels(locale)} />
        <TagSelect form={form} path="axialLoading" label={t.axialLabel} values={AXIAL_LOADS} labels={axialLoadLabels(locale)} />
        <TagSelect form={form} path="shearForce" label={t.shearLabel} values={SHEAR_LEVELS} labels={shearLevelLabels(locale)} />
        <TagSelect form={form} path="spinalAlignment" label={t.alignmentLabel} values={SPINAL_ALIGNMENTS} labels={spinalAlignmentLabels(locale)} />
        <TagSelect form={form} path="loadVector" label={t.vectorLabel} values={LOAD_VECTORS} labels={loadVectorLabels(locale)} />
        <TagSelect form={form} path="contractionType" label={t.contractionLabel} values={CONTRACTION_TYPES} labels={contractionTypeLabels(locale)} />
        <TagSelect form={form} path="resistanceProfile" label={t.resistanceLabel} values={RESISTANCE_PROFILES} labels={resistanceProfileLabels(locale)} />
      </div>

      <FormField of={form} path={['jointWindows']}>
        {(field) => {
          const current = (field.input ?? []).filter((item): item is JointWindow => typeof item === 'string');
          return (
            <Field>
              <FieldLabel>{t.windowsLabel}</FieldLabel>
              <ToggleGroup
                multiple
                variant="outline"
                size="sm"
                className="flex-wrap justify-start"
                aria-label={t.windowsAria}
                value={current}
                onValueChange={(value) => setInput(form, { path: ['jointWindows'], input: value as JointWindow[] })}>
                {JOINT_WINDOWS.map((window) => (
                  <ToggleGroupItem key={window} value={window}>
                    {jointWindowLabels(locale)[window]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <FieldDescription>
                {t.windowsHint}
              </FieldDescription>
              <FieldError>{field.errors?.[0]}</FieldError>
            </Field>
          );
        }}
      </FormField>

      <FormField of={form} path={['internalRotationUnderLoad']}>
        {(field) => (
          <Field>
            {/* Etiket düğmeye bağlı: ad "Yük altında iç rotasyon", durum basılı/değil (Var/Yok). */}
            <FieldLabel htmlFor="internalRotationUnderLoad">{t.rotationLabel}</FieldLabel>
            <div>
              <Toggle
                id="internalRotationUnderLoad"
                variant="outline"
                pressed={field.input === true}
                onPressedChange={(pressed) => setInput(form, { path: ['internalRotationUnderLoad'], input: pressed })}>
                {field.input === true ? t.present : t.absent}
              </Toggle>
            </div>
            <FieldDescription>
              {t.rotationHint}
            </FieldDescription>
          </Field>
        )}
      </FormField>

      <div className="grid gap-4 lg:grid-cols-2">
        <ConditionField
          form={form}
          path="contraindications"
          label={t.avoidLabel}
          description={t.avoidHint}
        />
        <ConditionField
          form={form}
          path="safeFor"
          label={t.safeLabel}
          description={t.safeHint}
        />
      </div>
    </FieldSet>
  );
}
