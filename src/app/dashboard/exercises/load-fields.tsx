'use client';

import Link from 'next/link';
import { Field as FormField, getInput, setInput, type useForm } from '@formisch/react';
import { ArrowCounterClockwise, Info } from '@phosphor-icons/react';
import { LabeledSelect } from '@/components/labeled-select';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Toggle } from '@/components/ui/toggle';
import { loadSpecFor } from '@/lib/device-loads';
import { getFormat } from '@/lib/format';
import { defaultRule, describeRule, progressionLabels, rirLabels, type ProgressionRule } from '@/lib/progression';
import type { Device } from '@/lib/schemas/device';
import type { exerciseFormSchema } from '@/lib/schemas/exercise';
import { describeDefaultRule, deviceLoadFields, libraryImpactNote, sameRule } from './exercise-form-logic';
import { useLocale, useMessages } from '@/i18n/client';
import { catalogMessages } from '@/i18n/messages/catalog';
import { ptLibraryMessages } from '@/i18n/messages/pt-library';
import { commonMessages } from '@/i18n/messages/common';

/**
 * "Yük ve ilerleme": kayıt türü, ağırlık adımı ve taban, ilerleme kuralı (SPEC §7.1).
 *
 * Cihaz seçiliyse ve cihaz ağırlık veriyorsa adım ve taban cihazın ayarından gelir (öneri motoru da
 * onları kullanır): alanlar salt okunur görünür. Cihazsız harekette egzersizin kendi değerleri düzenlenir.
 * Kural türün varsayılanıyla açılır; PT isterse değiştirir, "Varsayılan kuralı kullan" geri getirir.
 */

type Form = ReturnType<typeof useForm<typeof exerciseFormSchema>>;

/** Kütüphanedeki değişikliğin şablon ve programlara geçtiğini söyleyen satır. */
export function LibraryImpactNote() {
  const locale = useLocale();
  return (
    <p role="status" className="flex items-start gap-2 text-sm text-muted-foreground">
      <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
      {libraryImpactNote(locale)}
    </p>
  );
}

/** Formisch sayı alanı: kutunun metni sayıya çevrilir (boş kutu NaN → şema "Sayı gir." der). */
function NumberField({
  form,
  path,
  label,
  description,
  step,
  min,
}: {
  form: Form;
  path: ['loadStepKg'] | ['minLoadKg'] | ['progression', 'targetMin'] | ['progression', 'targetMax'];
  label: string;
  description?: string;
  step: string;
  min: string;
}) {
  const id = path.join('-');
  return (
    <FormField of={form} path={path}>
      {(field) => (
        <Field data-invalid={Boolean(field.errors) || undefined}>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <Input
            {...field.props}
            id={id}
            type="number"
            inputMode={step === '1' ? 'numeric' : 'decimal'}
            step={step}
            min={min}
            className="tabular-nums"
            aria-invalid={Boolean(field.errors) || undefined}
            // Dört yolun hepsi sayı alanı; formisch birleşim yolu tek çağrıda daraltamıyor.
            onChange={(event) => setInput(form, { path: path as ['loadStepKg'], input: event.currentTarget.valueAsNumber })}
            value={Number.isNaN(field.input) ? '' : (field.input ?? '')}
          />
          {description ? <FieldDescription>{description}</FieldDescription> : null}
          <FieldError>{field.errors?.[0]}</FieldError>
        </Field>
      )}
    </FormField>
  );
}

/** Ağırlık adımı ve taban: cihazdan (salt okunur) ya da egzersizin kendi değerleri. */
function LoadStep({ form, deviceById }: { form: Form; deviceById: ReadonlyMap<string, Device> }) {
  const t = useMessages(ptLibraryMessages).loadFields;
  const locale = useLocale();
  const format = getFormat(locale);
  return (
    <FormField of={form} path={['deviceId']}>
      {(deviceField) => {
        const device = deviceField.input ? deviceById.get(deviceField.input) : undefined;
        const fromDevice = deviceLoadFields(device, locale);
        if (device && fromDevice) {
          return (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="loadStepKg">{t.stepLabel}</FieldLabel>
                <Input
                  id="loadStepKg"
                  readOnly
                  aria-describedby="load-from-device"
                  className="bg-muted/50 text-muted-foreground tabular-nums dark:bg-muted/50"
                  value={fromDevice.stepKg === null ? t.setWeights : format.number(fromDevice.stepKg)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="minLoadKg">{t.baseLabel}</FieldLabel>
                <Input
                  id="minLoadKg"
                  readOnly
                  aria-describedby="load-from-device"
                  className="bg-muted/50 text-muted-foreground tabular-nums dark:bg-muted/50"
                  value={format.number(fromDevice.minKg)}
                />
              </Field>
              <FieldDescription id="load-from-device" className="sm:col-span-2">
                {t.deviceNote.lead(device.name, fromDevice.summary)}
                <Link href={`/dashboard/devices/${device.id}`}>{t.seeEquipment}</Link>
                {t.deviceNote.tail}
              </FieldDescription>
            </div>
          );
        }
        return (
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              form={form}
              path={['loadStepKg']}
              label={t.stepLabel}
              description={t.stepHint}
              step="0.5"
              min="0"
            />
            <NumberField
              form={form}
              path={['minLoadKg']}
              label={t.baseLabel}
              description={t.baseHint}
              step="0.5"
              min="0"
            />
          </div>
        );
      }}
    </FormField>
  );
}

/** Süreli kardiyo harekette (deseni kardiyo) yürüyüş/koşu anahtarı: eğim ve kalori (`cardio.ts`). */
function LocomotionField({ form }: { form: Form }) {
  const t = useMessages(ptLibraryMessages).loadFields;
  const common = useMessages(commonMessages);
  return (
    <FormField of={form} path={['pattern']}>
      {(patternField) =>
        patternField.input === 'cardio' ? (
          <FormField of={form} path={['locomotion']}>
            {(field) => (
              <Field>
                <FieldLabel htmlFor="locomotion">{t.walkLabel}</FieldLabel>
                <div>
                  <Toggle
                    id="locomotion"
                    variant="outline"
                    pressed={field.input === true}
                    onPressedChange={(pressed) => setInput(form, { path: ['locomotion'], input: pressed })}>
                    {field.input === true ? common.states.on : common.states.off}
                  </Toggle>
                </div>
                <FieldDescription>
                  {t.walkHint}
                </FieldDescription>
              </Field>
            )}
          </FormField>
        ) : (
          <></>
        )
      }
    </FormField>
  );
}

export function LoadFields({
  form,
  deviceById,
  startRule,
}: {
  form: Form;
  deviceById: ReadonlyMap<string, Device>;
  /** Düzenlemede açılıştaki kural: değişirse şablon ve programlara etkisi söylenir. Yenide yok. */
  startRule?: ProgressionRule;
}) {
  const t = useMessages(ptLibraryMessages).loadFields;
  const locale = useLocale();
  const trackingLabels = ptLibraryMessages(locale).trackingTypes;
  const time = catalogMessages(locale).time;
  const rirItems: Record<string, string> = Object.fromEntries(
    Object.entries(rirLabels(locale)).map(([rir, label]) => [rir, rir === '2' ? t.recommended(label) : label]),
  );
  return (
    <FormField of={form} path={['trackingType']}>
      {(trackingField) => {
        const tracking = trackingField.input ?? 'weight_reps';
        const unit = tracking === 'duration' ? time.secondsUnit : time.reps(2);
        return (
          <div className="flex flex-col gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="trackingType">{t.trackingLabel}</FieldLabel>
                <LabeledSelect
                  id="trackingType"
                  value={trackingField.input}
                  labels={trackingLabels}
                  onChange={(value) => {
                    setInput(form, { path: ['trackingType'], input: value });
                    // Birim değişir (tekrar ↔ saniye): aralık yeni türün varsayılanına döner.
                    const category = getInput(form, { path: ['category'] }) ?? 'compound';
                    setInput(form, { path: ['progression'], input: defaultRule(category, value) });
                  }}
                />
                <FieldDescription>{t.trackingHint}</FieldDescription>
              </Field>
            </div>

            {tracking === 'weight_reps' ? <LoadStep form={form} deviceById={deviceById} /> : null}
            {tracking === 'duration' ? <LocomotionField form={form} /> : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField of={form} path={['progression', 'scheme']}>
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor="progressionScheme">{t.progressionLabel}</FieldLabel>
                    <LabeledSelect
                      id="progressionScheme"
                      value={field.input}
                      labels={progressionLabels(locale)}
                      onChange={(value) => setInput(form, { path: ['progression', 'scheme'], input: value })}
                    />
                  </Field>
                )}
              </FormField>
              {tracking !== 'duration' ? (
                <FormField of={form} path={['progression', 'targetRir']}>
                  {(field) => (
                    <Field>
                      <FieldLabel htmlFor="targetRir">{t.rirLabel}</FieldLabel>
                      <LabeledSelect
                        id="targetRir"
                        value={String(field.input ?? 2)}
                        labels={rirItems}
                        onChange={(value) => setInput(form, { path: ['progression', 'targetRir'], input: Number(value) })}
                      />
                      <FieldDescription>
                        {t.rirHint}
                      </FieldDescription>
                    </Field>
                  )}
                </FormField>
              ) : null}
              <NumberField form={form} path={['progression', 'targetMin']} label={t.targetMin(unit)} step="1" min="1" />
              <NumberField form={form} path={['progression', 'targetMax']} label={t.targetMax(unit)} step="1" min="1" />
            </div>

            {/* Kuralın düz cümleyle anlatımı, türün varsayılanı ve kütüphane etkisi. */}
            <FormField of={form} path={['progression']}>
              {(ruleField) => (
                <FormField of={form} path={['category']}>
                  {(categoryField) => (
                    <FormField of={form} path={['deviceId']}>
                      {(deviceField) => {
                        const rule = ruleField.input as ProgressionRule | undefined;
                        const category = categoryField.input ?? 'compound';
                        const fallback = defaultRule(category, tracking);
                        const isDefault = sameRule(rule, fallback);
                        const device = deviceField.input ? deviceById.get(deviceField.input) : undefined;
                        const spec = loadSpecFor(
                          {
                            trackingType: tracking,
                            loadStepKg: Number(getInput(form, { path: ['loadStepKg'] }) ?? 0),
                            minLoadKg: Number(getInput(form, { path: ['minLoadKg'] }) ?? 0),
                          },
                          device,
                        );
                        const complete = rule && rule.targetMin > 0 && rule.targetMax > 0;
                        return (
                          <div className="flex flex-col gap-3 text-sm">
                            {complete ? <p className="text-muted-foreground">{describeRule(rule, spec, locale)}</p> : null}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                              <p className="text-muted-foreground">
                                {describeDefaultRule(category, tracking, locale)}
                                {isDefault ? t.inUse : '.'}
                              </p>
                              {isDefault ? null : (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setInput(form, { path: ['progression'], input: fallback })}>
                                  <ArrowCounterClockwise data-icon="inline-start" />
                                  {t.useDefault}
                                </Button>
                              )}
                            </div>
                            {startRule && !sameRule(rule, startRule) ? <LibraryImpactNote /> : null}
                          </div>
                        );
                      }}
                    </FormField>
                  )}
                </FormField>
              )}
            </FormField>
          </div>
        );
      }}
    </FormField>
  );
}
