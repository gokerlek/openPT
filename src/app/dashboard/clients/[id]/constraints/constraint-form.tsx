'use client';
import { DatePicker } from '@/components/date-picker';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowSquareOut, FirstAidKit, WarningCircle } from '@phosphor-icons/react';
import * as v from 'valibot';
import { ChoiceChips, MultiChips } from '@/components/choice-chips';
import { LabeledSelect } from '@/components/labeled-select';
import { Check } from '@/components/line-icons';
import { SectionHeader } from '@/components/section-header';
import { UnsavedChangesGuard } from '@/components/unsaved-changes-guard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useLocale, useMessages } from '@/i18n/client';
import type { Locale } from '@/i18n/locale';
import { commonMessages } from '@/i18n/messages/common';
import { healthMessages } from '@/i18n/messages/health';
import { conditionInfo, conditionLabel, parseCondition } from '@/lib/conditions';
import { careCounts } from '@/lib/constraint-filter';
import {
  AVOID_TAG_IDS,
  AVOID_TAGS,
  avoidFromTriggers,
  CONSTRAINT_LIMITS,
  CONSTRAINT_REGIONS,
  CONSTRAINT_TYPES,
  conditionsForRegion,
  DIAGNOSIS_SOURCES,
  detailFields,
  isEmergency,
  isPaired,
  isRedFlag,
  SEVERITIES,
  CONSTRAINT_SIDES,
  type AvoidTagId,
  type CareTags,
  type ConstraintRegion,
  type ConstraintSide,
  type ConstraintType,
  type DiagnosisSource,
  type Graft,
  type Severity,
  type Stage,
} from '@/lib/constraints';
import { fetchJson } from '@/lib/query/errors';
import { useServiceMutation } from '@/lib/query/use-service';
import { constraintFormSchema, type ConstraintForm } from '@/lib/schemas/constraint';
import type { Constraint } from '@/lib/schemas/health';

/** Formun başlangıç değerleri (yeni kısıtta boş; düzenlemede kayıttan; bildirimi onaylarken zorlayanlardan). */
export type ConstraintDraft = {
  region?: ConstraintRegion;
  side?: ConstraintSide;
  type?: ConstraintType;
  conditionId?: string;
  diagnosisSource?: DiagnosisSource;
  findingId?: string;
  surgeryDate?: string;
  graft?: Graft;
  stage?: Stage;
  severity?: Severity;
  onset?: string;
  onsetApprox?: boolean;
  avoid: AvoidTagId[];
  note?: string;
  clientNote?: string;
};

export type ConstraintFormMode =
  | { kind: 'new' }
  /** `confirming`: danışanın bekleyen bildirimi; kaydetmek onaylar ("Onayla ve düzenle"). */
  | { kind: 'edit'; id: string; baseUpdatedAt: string; confirming: boolean };

const NONE = 'none';

function conditionOptions(region: ConstraintRegion | undefined, kind: 'diagnosis' | 'finding', locale: Locale): Record<string, string> {
  const t = healthMessages(locale).constraintForm;
  const labels: Record<string, string> = { [NONE]: kind === 'diagnosis' ? t.noDiagnosis : t.noFinding };
  for (const id of conditionsForRegion(region ?? null, kind)) {
    const info = conditionInfo(id, locale);
    labels[id] = info.label;
    for (const qualifier of info.qualifiers ?? []) labels[`${id}:${qualifier}`] = conditionLabel({ id, qualifier }, locale);
  }
  return labels;
}

/** Önizleme için taslak kısıt (kaydedilmez). */
function draftConstraint(draft: ConstraintDraft): Constraint | null {
  if (!draft.region || !draft.type) return null;
  if (draft.avoid.length === 0 && !draft.conditionId && !draft.findingId) return null;
  return {
    id: 'k_taslak',
    region: draft.region,
    ...(draft.side ? { side: draft.side } : {}),
    type: draft.type,
    ...(draft.conditionId ? { conditionId: draft.conditionId, diagnosisSource: draft.diagnosisSource ?? 'client' } : {}),
    ...(draft.findingId ? { findingId: draft.findingId } : {}),
    ...(draft.surgeryDate || draft.graft || draft.stage
      ? { details: { ...(draft.surgeryDate ? { surgeryDate: draft.surgeryDate } : {}), ...(draft.graft ? { graft: draft.graft } : {}), ...(draft.stage ? { stage: draft.stage } : {}) } }
      : {}),
    avoid: draft.avoid,
    status: 'active',
    source: 'pt',
    // Önizlemede görüş alınmış sayılır: kırmızı bayrağın bölge dikkati ayrıca söylenir.
    clearance: { at: '1970-01-01', basis: 'written_report' },
    createdAt: '1970-01-01T00:00:00.000Z',
    updatedAt: '1970-01-01T00:00:00.000Z',
  };
}

/**
 * Kısıt ekle / düzenle (tasarım `kisit-tarama.md` §2.3): Nerede · Ne · Şiddet ve başlangıç · Kaçınılacak hareketler
 * (kütüphanede önizlemeyle) · Notlar. Tanı "Sağlık profesyonelinin koyduğu tanı (varsa)", kaynağı zorunlu; PT'nin
 * gözlemi ayrı seçicide (danışan görmez). Kırmızı bayraklı tanıda yönlendirme uyarısı, kauda ekinada acil metin.
 * Kaydet başlıkta; telefonda formun sonunda. Kaydedilmemiş değişiklik varken çıkış sorulur.
 */
export function ConstraintFormView({
  clientId,
  mode,
  initial,
  library,
  today,
  title,
  description,
  actions,
  reportSummary,
}: {
  clientId: string;
  mode: ConstraintFormMode;
  initial: ConstraintDraft;
  library: readonly (CareTags & { id: string })[];
  today: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
  /** Bildirimi onaylarken danışanın yazdıkları. */
  reportSummary?: React.ReactNode;
}) {
  const router = useRouter();
  const locale = useLocale();
  const messages = useMessages(healthMessages);
  const labels = messages.constraints;
  const t = messages.constraintForm;
  const common = useMessages(commonMessages).actions;
  const base = `/dashboard/clients/${clientId}/constraints`;
  const [draft, setDraft] = useState<ConstraintDraft>(initial);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof ConstraintDraft>(key: K, value: ConstraintDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setErrors((current) => {
      const { [key]: _removed, ...rest } = current;
      return rest;
    });
  };

  const details = detailFields(draft.conditionId);
  const diagnoses = useMemo(() => conditionOptions(draft.region, 'diagnosis', locale), [draft.region, locale]);
  const findings = useMemo(() => conditionOptions(draft.region, 'finding', locale), [draft.region, locale]);
  const preview = useMemo(() => {
    const constraint = draftConstraint(draft);
    return constraint ? careCounts(library, { active: [constraint], reports: [], overrides: [], today }) : null;
  }, [draft, library, today]);
  const flagged = draft.conditionId ? isRedFlag({ conditionId: draft.conditionId }) : false;
  const emergency = draft.conditionId ? isEmergency({ conditionId: draft.conditionId }) : false;

  const body = (): ConstraintForm | null => {
    const input = {
      region: draft.region,
      ...(draft.region && isPaired(draft.region) && draft.side ? { side: draft.side } : {}),
      type: draft.type,
      ...(draft.conditionId ? { conditionId: draft.conditionId, ...(draft.diagnosisSource ? { diagnosisSource: draft.diagnosisSource } : {}) } : {}),
      ...(draft.findingId ? { findingId: draft.findingId } : {}),
      ...(details.surgery || details.graft || details.stage
        ? {
            details: {
              ...(details.surgery && draft.surgeryDate ? { surgeryDate: draft.surgeryDate } : {}),
              ...(details.graft && draft.graft ? { graft: draft.graft } : {}),
              ...(details.stage && draft.stage ? { stage: draft.stage } : {}),
            },
          }
        : {}),
      ...(draft.severity ? { severity: draft.severity } : {}),
      ...(draft.onset ? { onset: draft.onset, onsetApprox: Boolean(draft.onsetApprox) } : {}),
      avoid: draft.avoid,
      note: draft.note ?? '',
      clientNote: draft.clientNote ?? '',
    };
    const local: Record<string, string> = {};
    const validation = messages.validation;
    if (!draft.region) local.region = validation.region;
    if (draft.region && isPaired(draft.region) && !draft.side) local.side = validation.side;
    if (!draft.type) local.type = validation.type;
    if (draft.conditionId && !draft.diagnosisSource) local.diagnosisSource = validation.diagnosisSource;
    const parsed = v.safeParse(constraintFormSchema, input);
    if (!parsed.success) {
      for (const issue of parsed.issues) {
        const key = issue.path?.map((segment) => String(segment.key as PropertyKey)).join('.') ?? 'form';
        local[key] ??= issue.message;
      }
    }
    if (Object.keys(local).length > 0) {
      setErrors(local);
      return null;
    }
    return parsed.success ? parsed.output : null;
  };

  const save = useServiceMutation({
    fn: (constraint: ConstraintForm) =>
      mode.kind === 'new'
        ? fetchJson<{ ok: true; id: string }>(`/api/clients/${clientId}/constraints`, { method: 'POST', body: JSON.stringify({ constraint }) })
        : fetchJson<{ ok: true }>(`/api/clients/${clientId}/constraints/${mode.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ action: 'edit', baseUpdatedAt: mode.baseUpdatedAt, constraint }),
          }),
    notify: { success: mode.kind === 'new' ? t.saved : mode.confirming ? t.confirmed : t.updated },
    onError: (error) => setErrors(Object.fromEntries(Object.entries(error.fields).map(([key, message]) => [key.replace(/^constraint\./, ''), message]))),
    onSuccess: () => {
      router.push(base);
      router.refresh();
    },
  });

  const submit = () => {
    const constraint = body();
    if (constraint) save.mutate(constraint);
  };
  const saveLabel = save.isPending ? common.saving : mode.kind === 'edit' && mode.confirming ? t.confirmSave : common.save;
  const saveButton = (className?: string) => (
    <Button type="button" disabled={save.isPending} onClick={submit} className={className}>
      {save.isPending ? <Spinner data-icon="inline-start" /> : <Check data-icon="inline-start" />}
      {saveLabel}
    </Button>
  );
  const errorList = Object.values(errors);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        back={{ href: base, label: t.back }}
        title={title}
        description={description}
        actions={
          <>
            {actions}
            {saveButton('hidden sm:inline-flex')}
          </>
        }
      />

      {reportSummary}

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Card>
          <CardHeader>
            <CardTitle>{t.whereTitle}</CardTitle>
            <CardDescription>{t.whereHint}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <Field data-invalid={Boolean(errors.region) || undefined}>
              <FieldLabel id="region-label">{t.region}</FieldLabel>
              <ChoiceChips
                labelledBy="region-label"
                value={draft.region}
                invalid={Boolean(errors.region)}
                options={CONSTRAINT_REGIONS.map((region) => ({ value: region, label: labels.regions[region] }))}
                onChange={(region) => {
                  if (region === draft.region) return;
                  set('region', region);
                  // Başka bölgenin tanısı ve gözlemi taşınmaz.
                  setDraft((current) => ({ ...current, region, conditionId: undefined, diagnosisSource: undefined, findingId: undefined }));
                }}
              />
              <FieldError>{errors.region}</FieldError>
            </Field>
            {draft.region && isPaired(draft.region) ? (
              <Field data-invalid={Boolean(errors.side) || undefined}>
                <FieldLabel id="side-label">{t.side}</FieldLabel>
                <ChoiceChips
                  labelledBy="side-label"
                  value={draft.side}
                  invalid={Boolean(errors.side)}
                  options={CONSTRAINT_SIDES.map((side) => ({ value: side, label: labels.sides[side] }))}
                  onChange={(side) => set('side', side)}
                />
                <FieldError>{errors.side}</FieldError>
              </Field>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.whatTitle}</CardTitle>
            <CardDescription>{t.whatHint}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <Field data-invalid={Boolean(errors.type) || undefined}>
              <FieldLabel id="type-label">{t.type}</FieldLabel>
              <ChoiceChips
                labelledBy="type-label"
                value={draft.type}
                invalid={Boolean(errors.type)}
                options={CONSTRAINT_TYPES.map((type) => ({ value: type, label: labels.types[type] }))}
                onChange={(type) => set('type', type)}
              />
              <FieldError>{errors.type}</FieldError>
            </Field>
            <Field data-invalid={Boolean(errors.conditionId) || undefined}>
              <FieldLabel htmlFor="diagnosis">{t.diagnosis}</FieldLabel>
              <LabeledSelect
                id="diagnosis"
                value={draft.conditionId && diagnoses[draft.conditionId] ? draft.conditionId : NONE}
                labels={diagnoses}
                onChange={(next) => set('conditionId', next === NONE ? undefined : next)}
              />
              <FieldDescription>{t.diagnosisHint}</FieldDescription>
              <FieldError>{errors.conditionId}</FieldError>
            </Field>
            {draft.conditionId ? (
              <Field data-invalid={Boolean(errors.diagnosisSource) || undefined}>
                <FieldLabel id="source-label">{t.diagnosisSource}</FieldLabel>
                <ChoiceChips
                  labelledBy="source-label"
                  value={draft.diagnosisSource}
                  invalid={Boolean(errors.diagnosisSource)}
                  options={DIAGNOSIS_SOURCES.map((source) => ({ value: source, label: labels.diagnosisSources[source] }))}
                  onChange={(source) => set('diagnosisSource', source)}
                />
                <FieldError>{errors.diagnosisSource}</FieldError>
              </Field>
            ) : null}
            {emergency ? (
              <Alert variant="destructive">
                <WarningCircle weight="fill" />
                <AlertTitle>{labels.emergency}</AlertTitle>
                <AlertDescription>{t.emergencyDetail}</AlertDescription>
              </Alert>
            ) : flagged ? (
              <Alert>
                <FirstAidKit weight="fill" />
                <AlertTitle>{t.redFlagTitle}</AlertTitle>
                <AlertDescription>{t.redFlagDetail}</AlertDescription>
              </Alert>
            ) : null}
            {details.surgery ? (
              <Field data-invalid={Boolean(errors['details.surgeryDate']) || undefined} className="max-w-xs">
                <FieldLabel htmlFor="surgery">{t.surgery}</FieldLabel>
                <DatePicker id="surgery" max={today} value={draft.surgeryDate ?? ''} onValueChange={value => set('surgeryDate', value || undefined)} />
                <FieldDescription>{t.surgeryHint}</FieldDescription>
                <FieldError>{errors['details.surgeryDate']}</FieldError>
              </Field>
            ) : null}
            {details.graft ? (
              <Field className="max-w-xs">
                <FieldLabel htmlFor="graft">{t.graft}</FieldLabel>
                <LabeledSelect id="graft" value={draft.graft} labels={labels.grafts} placeholder={t.unknown} onChange={(graft) => set('graft', graft)} />
              </Field>
            ) : null}
            {details.stage ? (
              <Field className="max-w-xs">
                <FieldLabel htmlFor="stage">{t.stage}</FieldLabel>
                <LabeledSelect
                  id="stage"
                  value={draft.stage ? (String(draft.stage) as `${Stage}`) : undefined}
                  labels={Object.fromEntries(Object.entries(labels.stages)) as Record<`${Stage}`, string>}
                  placeholder={t.unknown}
                  onChange={(stage) => set('stage', Number(stage) as Stage)}
                />
              </Field>
            ) : null}
            <Field>
              <FieldLabel htmlFor="finding">{t.finding}</FieldLabel>
              <LabeledSelect
                id="finding"
                value={draft.findingId && findings[draft.findingId] ? draft.findingId : NONE}
                labels={findings}
                onChange={(next) => set('findingId', next === NONE ? undefined : next)}
              />
              <FieldDescription>{t.findingHint}</FieldDescription>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.severityTitle}</CardTitle>
            <CardDescription>{t.severityHint}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <Field>
              <FieldLabel id="severity-label">{t.severity}</FieldLabel>
              <ChoiceChips
                labelledBy="severity-label"
                value={draft.severity}
                options={SEVERITIES.map((severity) => ({ value: severity, label: labels.severities[severity], description: labels.severityDescriptions[severity] }))}
                onChange={(severity) => set('severity', severity)}
              />
              <FieldDescription>{draft.severity ? labels.severityDescriptions[draft.severity] : t.severityAll}</FieldDescription>
            </Field>
            <Field data-invalid={Boolean(errors.onset) || undefined} className="max-w-xs">
              <FieldLabel htmlFor="onset">{t.onset}</FieldLabel>
              <Input id="onset" inputMode="numeric" placeholder="2026-08" value={draft.onset ?? ''} onChange={(event) => set('onset', event.currentTarget.value.trim() || undefined)} />
              <FieldDescription>{t.onsetHint}</FieldDescription>
              <FieldError>{errors.onset}</FieldError>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.notesTitle}</CardTitle>
            <CardDescription>{t.notesHint}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <Field data-invalid={Boolean(errors.note) || undefined}>
              <FieldLabel htmlFor="note">{t.note}</FieldLabel>
              <Textarea id="note" maxLength={CONSTRAINT_LIMITS.note} value={draft.note ?? ''} onChange={(event) => set('note', event.currentTarget.value)} />
              <FieldError>{errors.note}</FieldError>
            </Field>
            <Field data-invalid={Boolean(errors.clientNote) || undefined}>
              <FieldLabel htmlFor="client-note">{t.clientNote}</FieldLabel>
              <Input
                id="client-note"
                maxLength={CONSTRAINT_LIMITS.clientNote}
                placeholder={t.clientNotePlaceholder}
                value={draft.clientNote ?? ''}
                onChange={(event) => set('clientNote', event.currentTarget.value)}
              />
              <FieldDescription>{t.clientNoteHint(CONSTRAINT_LIMITS.clientNote)}</FieldDescription>
              <FieldError>{errors.clientNote}</FieldError>
            </Field>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.avoidTitle}</CardTitle>
          <CardDescription>{t.avoidHint}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <MultiChips
            label={t.avoidTitle}
            value={draft.avoid}
            options={AVOID_TAG_IDS.map((tag) => ({ value: tag, label: AVOID_TAGS[tag].decision === 'warn' ? t.avoidWarn(labels.avoid[tag]) : labels.avoid[tag] }))}
            onChange={(avoid) => set('avoid', avoid)}
            itemClassName="h-auto min-h-11 whitespace-normal text-left"
          />
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {preview ? t.preview(preview.blocked, preview.warned, preview.unassessed, preview.untagged) : t.previewEmpty}{' '}
            <Link href={`/dashboard/exercises?client=${clientId}`} className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
              {t.previewLink}
              <ArrowSquareOut className="size-3.5" />
            </Link>
          </p>
        </CardContent>
      </Card>

      {errorList.length > 0 ? (
        <Alert variant="destructive" data-form-error>
          <WarningCircle />
          <AlertTitle>{t.saveFailed}</AlertTitle>
          <AlertDescription>{errorList[0]}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex justify-end sm:hidden">{saveButton('h-11 w-full')}</div>

      <UnsavedChangesGuard active={dirty && !save.isPending && !save.isSuccess} description={t.leave} onLeave={() => undefined} />
    </div>
  );
}

/** Kayıttan formun başlangıç değerleri. */
export function draftOf(constraint: Constraint, confirming: boolean): ConstraintDraft {
  // Bildirimi onaylarken danışanın zorlayanları öneri olarak işaretli gelir.
  const suggested = confirming ? avoidFromTriggers(constraint.triggers) : [];
  const avoid = AVOID_TAG_IDS.filter((tag) => constraint.avoid.includes(tag) || suggested.includes(tag));
  const parsed = constraint.conditionId ? parseCondition(constraint.conditionId) : null;
  return {
    region: constraint.region,
    ...(constraint.side ? { side: constraint.side } : {}),
    type: constraint.type,
    ...(parsed ? { conditionId: constraint.conditionId as string } : {}),
    ...(constraint.diagnosisSource ? { diagnosisSource: constraint.diagnosisSource } : {}),
    ...(constraint.findingId ? { findingId: constraint.findingId } : {}),
    ...(constraint.details?.surgeryDate ? { surgeryDate: constraint.details.surgeryDate } : {}),
    ...(constraint.details?.graft ? { graft: constraint.details.graft } : {}),
    ...(constraint.details?.stage ? { stage: constraint.details.stage } : {}),
    ...(constraint.severity ? { severity: constraint.severity } : {}),
    ...(constraint.onset ? { onset: constraint.onset, onsetApprox: Boolean(constraint.onsetApprox) } : {}),
    avoid,
    ...(constraint.note ? { note: constraint.note } : {}),
    ...(constraint.clientNote ? { clientNote: constraint.clientNote } : {}),
  };
}
