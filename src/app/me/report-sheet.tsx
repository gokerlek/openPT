'use client';

import { useRef, useState } from 'react';
import { WarningCircle } from '@phosphor-icons/react';
import { ChoiceChips, MultiChips } from '@/components/choice-chips';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useLocale } from '@/i18n/client';
import { clientHomeMessages } from '@/i18n/messages/client-home';
import { lower } from '@/i18n/text';
import {
  CONSTRAINT_LIMITS,
  CONSTRAINT_REGIONS,
  CONSTRAINT_TYPES,
  isPaired,
  ONSET_CHOICES,
  onsetChoiceLabels,
  regionLabels,
  reportSafety,
  SEVERITIES,
  severityDescriptions,
  severityLabels,
  triggerLabels,
  TRIGGERS,
  typeClientLabels,
  type ConstraintRegion,
  type ConstraintSide,
  type ConstraintType,
  type OnsetChoice,
  type Severity,
  type Trigger,
} from '@/lib/constraints';
import { fetchJson } from '@/lib/query/errors';
import { useServiceMutation } from '@/lib/query/use-service';

/** Danışanın bildirim formu (yeni ya da bekleyen bildirimi düzeltme). */
export type ReportDraft = {
  region?: ConstraintRegion;
  side?: ConstraintSide;
  type?: ConstraintType;
  severity?: Severity;
  since?: OnsetChoice;
  triggers: Trigger[];
  note: string;
};

const SIDES: ConstraintSide[] = ['left', 'right', 'both'];

/**
 * "Antrenörüne bildir" (tasarım `kisit-tarama.md` §2.4): tek, kaydırılan sheet. Başta acil metin (yoklamanın
 * "Bugün yük yok" ekranıyla aynı ayrım; Finucane 2020), Gönder'in üstünde öteki işaretler (Ottawa kuralları, Stiell
 * 1992/1995; seçim [sentez]); cevap istenmez, kaydedilmez. "Gönder" bölge ve şiddet seçilince (çift bölgede taraf
 * da) açılır. Çevrimdışıysa gönderilmez. Dokunma hedefleri 44 px, Gönder 56 px.
 */
export function ReportSheet({
  open,
  onOpenChange,
  editing,
  initial,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Bekleyen bildirimi düzeltme (kimliği); yoksa yeni. */
  editing: string | null;
  initial: ReportDraft;
  onSent: (draft: ReportDraft) => void;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="gap-0" initialFocus={title}>
        {open ? <ReportBody key={editing ?? 'new'} titleRef={title} editing={editing} initial={initial} onSent={onSent} /> : null}
      </DrawerContent>
    </Drawer>
  );
}

function ReportBody({
  titleRef,
  editing,
  initial,
  onSent,
}: {
  titleRef: React.RefObject<HTMLHeadingElement | null>;
  editing: string | null;
  initial: ReportDraft;
  onSent: (draft: ReportDraft) => void;
}) {
  const [draft, setDraft] = useState<ReportDraft>(initial);
  const [error, setError] = useState<string | null>(null);
  const locale = useLocale();
  const t = clientHomeMessages(locale).report;
  const safety = reportSafety(locale);
  const severityText = severityLabels(locale);
  const set = <K extends keyof ReportDraft>(key: K, value: ReportDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setError(null);
  };
  const paired = draft.region ? isPaired(draft.region) : false;
  const ready = Boolean(draft.region && draft.type && draft.severity && (!paired || draft.side));

  const send = useServiceMutation({
    fn: () => {
      const report = {
        region: draft.region,
        ...(paired && draft.side ? { side: draft.side } : {}),
        type: draft.type,
        severity: draft.severity,
        ...(draft.since ? { since: draft.since } : {}),
        triggers: draft.triggers,
        note: draft.note,
      };
      return editing
        ? fetchJson<{ ok: true }>(`/api/me/constraints/${editing}`, { method: 'PATCH', body: JSON.stringify({ action: 'edit', report }) })
        : fetchJson<{ ok: true }>('/api/me/constraints', { method: 'POST', body: JSON.stringify(report) });
    },
    notify: 'none',
    onError: (failure) => setError(failure.status === 0 ? t.offline : (Object.values(failure.fields)[0] ?? failure.message)),
    onSuccess: () => onSent(draft),
  });

  const submit = () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setError(t.offline);
      return;
    }
    send.mutate();
  };

  return (
    <>
      <DrawerHeader className="gap-1 pt-5 pb-2">
        <DrawerTitle ref={titleRef} tabIndex={-1} className="text-lg font-semibold outline-none">
          {editing ? t.editTitle : t.title}
        </DrawerTitle>
        <DrawerDescription>{t.text}</DrawerDescription>
      </DrawerHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-4 pb-4">
        <Alert variant="destructive">
          <WarningCircle weight="fill" />
          <AlertDescription className="text-sm font-medium">{safety.urgent}</AlertDescription>
        </Alert>

        <Field>
          <FieldLabel id="report-region">{t.where}</FieldLabel>
          <ChoiceChips
            labelledBy="report-region"
            value={draft.region}
            options={CONSTRAINT_REGIONS.map((region) => ({ value: region, label: regionLabels(locale)[region] }))}
            onChange={(region) => set('region', region)}
          />
        </Field>
        {paired ? (
          <Field>
            <FieldLabel id="report-side">{t.side}</FieldLabel>
            <ChoiceChips
              labelledBy="report-side"
              value={draft.side}
              options={SIDES.map((side) => ({ value: side, label: t.sides[side] }))}
              onChange={(side) => set('side', side)} itemClassName="flex-1" />
          </Field>
        ) : null}
        <Field>
          <FieldLabel id="report-type">{t.what}</FieldLabel>
          <ChoiceChips
            labelledBy="report-type"
            value={draft.type}
            options={CONSTRAINT_TYPES.map((type) => ({ value: type, label: typeClientLabels(locale)[type] }))}
            onChange={(type) => set('type', type)}
            className="flex-col items-stretch"
            itemClassName="h-auto min-h-11 justify-start whitespace-normal text-left"
          />
        </Field>
        <Field>
          <FieldLabel id="report-severity">{t.severity}</FieldLabel>
          <ChoiceChips
            labelledBy="report-severity"
            value={draft.severity}
            options={SEVERITIES.map((severity) => ({ value: severity, label: severityText[severity] }))}
            onChange={(severity) => set('severity', severity)}
            itemClassName="flex-1"
          />
          {draft.severity ? (
            <FieldDescription>
              {severityText[draft.severity]}: {lower(locale, severityDescriptions(locale)[draft.severity])}
            </FieldDescription>
          ) : null}
        </Field>
        <Field>
          <FieldLabel id="report-since">{t.since}</FieldLabel>
          <ChoiceChips
            labelledBy="report-since"
            value={draft.since}
            options={ONSET_CHOICES.map((choice) => ({ value: choice, label: onsetChoiceLabels(locale)[choice] }))}
            onChange={(since) => set('since', since)}
          />
        </Field>
        <Field>
          <FieldLabel id="report-triggers">{t.triggers}</FieldLabel>
          <MultiChips
            labelledBy="report-triggers"
            value={draft.triggers}
            options={TRIGGERS.map((trigger) => ({ value: trigger, label: triggerLabels(locale)[trigger] }))}
            onChange={(triggers) => set('triggers', triggers)}
            itemClassName="h-auto min-h-11 whitespace-normal"
          />
          <FieldDescription>{t.triggersHint}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="report-note">{t.note}</FieldLabel>
          <Textarea
            id="report-note"
            maxLength={CONSTRAINT_LIMITS.reportNote}
            placeholder={t.notePlaceholder}
            value={draft.note}
            onChange={(event) => set('note', event.currentTarget.value)}
          />
        </Field>
        <p className="text-sm text-muted-foreground">{safety.other}</p>
        {error ? <FieldError>{error}</FieldError> : null}
        <Button className="h-14 w-full text-base" disabled={!ready || send.isPending} onClick={submit}>
          {send.isPending ? <Spinner data-icon="inline-start" /> : null}
          {editing ? t.save : t.send}
        </Button>
      </div>
    </>
  );
}
