'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Field as FormField, Form, getInput, setInput, useForm } from '@formisch/react';
import {
  BatteryHigh,
  FirstAidKit,
  Heartbeat,
  Info,
  PersonSimpleWalk,
  Ruler,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';
import { LabeledSelect } from '@/components/labeled-select';
import { useLocale, useMessages } from '@/i18n/client';
import { ptClientsMessages } from '@/i18n/messages/pt-clients';
import { Check, Plus } from '@/components/line-icons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { healthConsentState, healthScopeGrows } from '@/lib/client-status';
import { DEFAULT_HEART_LIMITS } from '@/lib/heart-rate';
import { fetchJson } from '@/lib/query/errors';
import { applyFieldErrors } from '@/lib/query/field-errors';
import { useServiceMutation } from '@/lib/query/use-service';
import { cn } from '@/lib/utils';
import {
  CLIENT_NOTE_MAX,
  clientFormSchema,
  clientStatusLabels,
  healthFieldInfo,
  HEALTH_FIELDS,
  trainingExperienceLabels,
  type Client,
  type ClientInput,
  type HealthField,
} from '@/lib/schemas/client';

/** Modül ilk açıldığında seçili gelen parçalar: en az veriyle en çok işe yarayanlar. */
const DEFAULT_HEALTH_FIELDS: HealthField[] = ['conditions', 'readiness'];

const HEALTH_FIELD_ICONS: Record<HealthField, PhosphorIcon> = {
  conditions: FirstAidKit,
  readiness: BatteryHigh,
  check_in: Heartbeat,
  measurements: Ruler,
  screening: PersonSimpleWalk,
};

/** Nabız sınırlarının kutuları: boşken otomatik değer soluk yazar. Adlar ve ipuçları `ptClientsMessages().form`'da. */
const HEART_RATE_FIELDS = [
  { path: 'heartRecovery', id: 'heart-recovery', auto: DEFAULT_HEART_LIMITS.recovery },
  { path: 'heartAlert', id: 'heart-alert', auto: DEFAULT_HEART_LIMITS.alert },
] as const;

/**
 * Danışan ekleme/düzenleme: kişisel bilgiler, antrenman geçmişi (öneri motorunun aşama tabanı,
 * `exposure.ts`), nabız sınırları (antrenmanda nabız bandıyla) ve izinler (sağlık modülü). Yeni danışan
 * kaydedilince sunucu özel repo'sunu açar ve PT davet ekranına geçer. Program ve ölçümler
 * danışanın bir özelliği değil, yapılan iştir: danışanın sayfasından yönetilir.
 */
export function ClientForm({ editing }: { editing: Client | null }) {
  const locale = useLocale();
  const t = useMessages(ptClientsMessages).form;
  const statusLabels = clientStatusLabels(locale);
  const fieldInfo = healthFieldInfo(locale);
  const router = useRouter();
  const form = useForm({
    schema: clientFormSchema,
    initialInput: {
      name: editing?.name ?? '',
      note: editing?.note ?? '',
      status: editing?.status ?? 'active',
      aiEnabled: editing?.modules.ai?.enabled ?? false,
      healthEnabled: editing?.modules.health.enabled ?? false,
      healthFields: editing?.modules.health.fields ?? [],
      trainingExperience: editing?.training?.experience ?? 'new',
      heartRecovery: editing?.heartRate ? String(editing.heartRate.recovery) : '',
      heartAlert: editing?.heartRate ? String(editing.heartRate.alert) : '',
    },
  });
  const consented = editing?.consents.health?.granted ? editing.consents.health.fields : null;
  const consentState = editing ? healthConsentState(editing) : 'off';

  const save = useServiceMutation({
    fn: (values: ClientInput) =>
      fetchJson<{ id: string }>('/api/clients', {
        method: 'POST',
        body: JSON.stringify(editing ? { ...values, id: editing.id } : values),
      }),
    invalidate: [['clients']],
    notify: { success: editing ? t.saved : t.created },
    onError: (error) => applyFieldErrors(form as never, error),
    onSuccess: ({ id }) => {
      // Yeni danışanın ilk işi davet: kod yalnız o ekranda üretilip gösterilir.
      router.push(editing ? `/dashboard/clients/${id}` : `/dashboard/clients/${id}/invite`);
      router.refresh();
    },
  });

  return (
    <Form
      of={form}
      className="flex flex-col gap-6"
      onSubmit={(values) => save.mutateAsync(values as ClientInput).catch(() => undefined)}>
      <Card>
        <CardHeader>
          <CardTitle>{t.person}</CardTitle>
          <CardDescription>{t.personHint}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-x-8 gap-y-5 lg:grid-cols-2">
          <div className="flex flex-col gap-5">
            <FormField of={form} path={['name']}>
              {(field) => (
                <Field data-invalid={Boolean(field.errors) || undefined}>
                  <FieldLabel htmlFor="name">{t.name}</FieldLabel>
                  <Input
                    {...field.props}
                    id="name"
                    autoComplete="off"
                    value={field.input ?? ''}
                    placeholder={t.namePlaceholder}
                    aria-invalid={Boolean(field.errors) || undefined}
                    onChange={(event) => setInput(form, { path: ['name'], input: event.currentTarget.value })}
                  />
                  <FieldDescription>{t.nameHint}</FieldDescription>
                  <FieldError>{field.errors?.[0]}</FieldError>
                </Field>
              )}
            </FormField>

            {editing ? (
              <FormField of={form} path={['status']}>
                {(field) => (
                  <Field data-invalid={Boolean(field.errors) || undefined} className="max-w-sm">
                    <FieldLabel htmlFor="status">{t.status}</FieldLabel>
                    <LabeledSelect
                      id="status"
                      value={field.input}
                      labels={statusLabels}
                      onChange={(value) => setInput(form, { path: ['status'], input: value })}
                    />
                    <FieldDescription>{t.statusHint}</FieldDescription>
                    <FieldError>{field.errors?.[0]}</FieldError>
                  </Field>
                )}
              </FormField>
            ) : null}

            <FormField of={form} path={['trainingExperience']}>
              {(field) => (
                <Field data-invalid={Boolean(field.errors) || undefined} className="max-w-sm">
                  <FieldLabel htmlFor="training-experience">{t.experience}</FieldLabel>
                  <LabeledSelect
                    id="training-experience"
                    value={field.input}
                    labels={trainingExperienceLabels(locale)}
                    onChange={(value) => setInput(form, { path: ['trainingExperience'], input: value })}
                  />
                  <FieldDescription>{t.experienceHint}</FieldDescription>
                  <FieldError>{field.errors?.[0]}</FieldError>
                </Field>
              )}
            </FormField>
          </div>

          <FormField of={form} path={['note']}>
            {(field) => (
              <Field data-invalid={Boolean(field.errors) || undefined}>
                <FieldLabel htmlFor="note">{t.note}</FieldLabel>
                <Textarea
                  {...field.props}
                  id="note"
                  rows={5}
                  value={field.input ?? ''}
                  maxLength={CLIENT_NOTE_MAX}
                  placeholder={t.notePlaceholder}
                  aria-invalid={Boolean(field.errors) || undefined}
                  onChange={(event) => setInput(form, { path: ['note'], input: event.currentTarget.value })}
                />
                <FieldDescription>{t.noteHint}</FieldDescription>
                <FieldError>{field.errors?.[0]}</FieldError>
              </Field>
            )}
          </FormField>
        </CardContent>
      </Card>

      <FormField of={form} path={['aiEnabled']}>
        {(field) => <Card>
          <CardHeader>
            <CardTitle>{t.ai}</CardTitle>
            <CardDescription>{t.aiHint}</CardDescription>
            <CardAction>
              <label className="-m-2 flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
                <Switch aria-label={t.ai} checked={Boolean(field.input)} onCheckedChange={checked => setInput(form, { path: ['aiEnabled'], input: checked })} />
              </label>
            </CardAction>
          </CardHeader>
        </Card>}
      </FormField>

      <Card>
        <CardHeader>
          <CardTitle>{t.heartTitle}</CardTitle>
          <CardDescription>{t.heartHint(DEFAULT_HEART_LIMITS.recovery, DEFAULT_HEART_LIMITS.alert)}</CardDescription>
        </CardHeader>
        <CardContent className="grid max-w-xl gap-x-6 gap-y-5 sm:grid-cols-2">
          {HEART_RATE_FIELDS.map((item) => (
            <FormField key={item.path} of={form} path={[item.path]}>
              {(field) => (
                <Field data-invalid={Boolean(field.errors) || undefined}>
                  <FieldLabel htmlFor={item.id}>{item.path === 'heartRecovery' ? t.heartRecovery : t.heartAlert}</FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      {...field.props}
                      id={item.id}
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      className="tabular-nums"
                      value={field.input ?? ''}
                      placeholder={t.heartAuto(item.auto)}
                      aria-invalid={Boolean(field.errors) || undefined}
                      onChange={(event) => setInput(form, { path: [item.path], input: event.currentTarget.value })}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupText>{t.bpm}</InputGroupText>
                    </InputGroupAddon>
                  </InputGroup>
                  <FieldDescription>{item.path === 'heartRecovery' ? t.heartRecoveryHint : t.heartAlertHint}</FieldDescription>
                  <FieldError>{field.errors?.[0]}</FieldError>
                </Field>
              )}
            </FormField>
          ))}
        </CardContent>
      </Card>

      <FormField of={form} path={['healthEnabled']}>
        {(enabledField) => (
          <Card>
            <CardHeader>
              <CardTitle>{t.healthTitle}</CardTitle>
              <CardDescription>{t.healthHint}</CardDescription>
              <CardAction>
                {/* Anahtar küçük: dokunma alanı çevresindeki etiketle 44 px (etikete dokunmak anahtarı çevirir). */}
                <label className="-m-2 flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
                  <Switch
                    aria-label={t.healthTitle}
                    checked={Boolean(enabledField.input)}
                    onCheckedChange={(checked) => {
                      setInput(form, { path: ['healthEnabled'], input: checked });
                      if (checked) {
                        // İlk açılışta en az bilgiyle başlasın: kısıtlar ve hazır oluşluk.
                        const current = getInput(form, { path: ['healthFields'] }) ?? [];
                        if (current.length === 0) setInput(form, { path: ['healthFields'], input: DEFAULT_HEALTH_FIELDS });
                      }
                    }}
                  />
                </label>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {enabledField.input ? (
                <FormField of={form} path={['healthFields']}>
                  {(field) => {
                    const selected = new Set(field.input ?? []);
                    // Sunucuyla aynı kural (`nextHealthModule`): modül yeniden açılıyor ya da kapsam genişliyorsa
                    // (çıkarılıp geri eklenen parça dahil) onay yeniden sorulur.
                    const needsReconsent =
                      consented !== null &&
                      (healthScopeGrows(editing?.modules.health ?? null, [...selected]) ||
                        [...selected].some((item) => !consented.includes(item)));
                    const toggle = (item: HealthField) =>
                      setInput(form, {
                        path: ['healthFields'],
                        input: HEALTH_FIELDS.filter((value) => (value === item ? !selected.has(item) : selected.has(value))),
                      });
                    return (
                      <Field data-invalid={Boolean(field.errors) || undefined}>
                        <ul className="grid gap-2 sm:grid-cols-2" aria-label={t.healthParts}>
                          {HEALTH_FIELDS.map((item) => {
                            const isOn = selected.has(item);
                            const Icon = HEALTH_FIELD_ICONS[item];
                            return (
                              <li key={item}>
                                <Button
                                  type="button"
                                  variant={isOn ? 'secondary' : 'outline'}
                                  aria-pressed={isOn}
                                  className={cn(
                                    'h-full w-full items-start justify-start gap-3 p-3 text-left whitespace-normal',
                                    isOn && 'ring-2 ring-primary-text',
                                  )}
                                  onClick={() => toggle(item)}>
                                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-background">
                                    <Icon weight="fill" className="size-5 text-muted-foreground" />
                                  </span>
                                  <span className="flex flex-1 flex-col gap-0.5">
                                    <span className="font-medium">{fieldInfo[item].label}</span>
                                    <span className="text-xs font-normal text-muted-foreground">
                                      {fieldInfo[item].description}
                                    </span>
                                  </span>
                                  {isOn ? <Check className="text-primary-text" /> : <Plus className="text-muted-foreground" />}
                                </Button>
                              </li>
                            );
                          })}
                        </ul>
                        <FieldError>{field.errors?.[0]}</FieldError>
                        {needsReconsent ? (
                          <Alert>
                            <Info weight="fill" />
                            <AlertDescription>{t.reconsent}</AlertDescription>
                          </Alert>
                        ) : null}
                      </Field>
                    );
                  }}
                </FormField>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t.healthOff}
                  {consentState === 'granted' || consentState === 'outdated' ? t.healthOffKept : null}
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </FormField>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={editing ? `/dashboard/clients/${editing.id}` : '/dashboard/clients'} />}>
          {t.cancel}
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? <Spinner data-icon="inline-start" /> : null}
          {save.isPending ? (editing ? t.saving : t.adding) : editing ? t.save : t.add}
        </Button>
      </div>
    </Form>
  );
}
