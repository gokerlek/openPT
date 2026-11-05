'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { ChoiceChips } from '@/components/choice-chips';
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';
import { Plus, X } from '@/components/line-icons';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { useLocale } from '@/i18n/client';
import type { Locale } from '@/i18n/locale';
import { clientHomeMessages } from '@/i18n/messages/client-home';
import { lower } from '@/i18n/text';
import { afterReportText, reportSafety, SEVERITIES, severityLabels, type ClientConstraintView, type Severity } from '@/lib/constraints';
import { getFormat } from '@/lib/format';
import { fetchJson } from '@/lib/query/errors';
import { useServiceMutation } from '@/lib/query/use-service';
import { ReportSheet, type ReportDraft } from '../../report-sheet';

const EMPTY: ReportDraft = { triggers: [], note: '' };

function stateLine(view: ClientConstraintView, locale: Locale): string {
  const t = clientHomeMessages(locale).health;
  const day = getFormat(locale).dayShort(view.at.slice(0, 10));
  switch (view.state) {
    case 'pending':
      return t.pending;
    case 'confirmed':
      return t.confirmed(day);
    case 'seen':
      return t.seen(day);
    case 'declined':
      return t.declined(day);
    default:
      return t.resolved(day);
  }
}

function useReportAction(id: string, success: string) {
  const router = useRouter();
  return useServiceMutation({
    fn: (body: Record<string, unknown> | null) =>
      body === null
        ? fetchJson<{ ok: true }>(`/api/me/constraints/${id}`, { method: 'DELETE' })
        : fetchJson<{ ok: true }>(`/api/me/constraints/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    notify: { success },
    onSuccess: () => router.refresh(),
  });
}

/**
 * Onaylı kısıtta "Kötüleşti": şimdikinden yüksek şiddet sorulur, hemen yazılır. Diyalog bildirim sheet'inin ikinci
 * güvenlik kademesini de gösterir; gönderince yeni bildirimdeki gibi şiddete göre ne yapacağı söylenir.
 */
function WorseButton({ view, onWorse }: { view: ClientConstraintView; onWorse: (text: string) => void }) {
  const [severity, setSeverity] = useState<Severity | undefined>(undefined);
  const locale = useLocale();
  const t = clientHomeMessages(locale).health;
  const worse = useReportAction(view.id, t.sent);
  const rank = view.severity ? SEVERITIES.indexOf(view.severity) : -1;
  const choices = SEVERITIES.filter((_item, index) => index > rank);
  if (choices.length === 0) return null;
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="outline" className="h-11 flex-1" />}>{t.worse}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.worseQuestion(view.title)}</AlertDialogTitle>
          <AlertDialogDescription>{t.worseText(reportSafety(locale).other)}</AlertDialogDescription>
        </AlertDialogHeader>
        <ChoiceChips
          label={t.severity}
          value={severity}
          options={choices.map((item) => ({ value: item, label: severityLabels(locale)[item] }))}
          onChange={setSeverity}
          itemClassName="flex-1"
        />
        <AlertDialogFooter>
          <AlertDialogCancel className="h-11">{t.cancel}</AlertDialogCancel>
          <AlertDialogAction
            className="h-11"
            disabled={!severity || worse.isPending}
            onClick={() =>
              severity && worse.mutate({ action: 'worse', severity }, { onSuccess: () => onWorse(afterReportText({ severity, type: view.typeId }, locale)) })
            }
          >
            {worse.isPending ? <Spinner data-icon="inline-start" /> : null}
            {t.send}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function BetterButton({ view }: { view: ClientConstraintView }) {
  const t = clientHomeMessages(useLocale()).health;
  const better = useReportAction(view.id, t.sent);
  return (
    <Button variant="outline" className="h-11 flex-1" disabled={better.isPending} onClick={() => better.mutate({ action: 'better' })}>
      {better.isPending ? <Spinner data-icon="inline-start" /> : <CheckCircle data-icon="inline-start" />}
      {t.better}
    </Button>
  );
}

function WithdrawButton({ view }: { view: ClientConstraintView }) {
  const t = clientHomeMessages(useLocale()).health;
  const withdraw = useReportAction(view.id, t.withdrawn);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" className="min-h-11 flex-1" onClick={() => setOpen(true)}>
        <X data-icon="inline-start" />
        {t.withdraw}
      </Button>
      <ConfirmDeleteDialog
        open={open}
        onOpenChange={setOpen}
        title={t.withdrawQuestion}
        body={t.withdrawText}
        confirmLabel={t.withdraw}
        confirmVariant="default"
        busy={withdraw.isPending}
        onConfirm={() => withdraw.mutate(null)}
      />
    </>
  );
}

function ConstraintCard({
  view,
  onEdit,
  onWorse,
}: {
  view: ClientConstraintView;
  onEdit: (view: ClientConstraintView) => void;
  onWorse: (text: string) => void;
}) {
  const locale = useLocale();
  const t = clientHomeMessages(locale).health;
  const meta = [view.type, view.severity ? lower(locale, severityLabels(locale)[view.severity]) : null].filter(Boolean).join(' · ');
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{view.title}</CardTitle>
        <CardDescription className="flex flex-col gap-0.5">
          {view.diagnosis ? <span className="text-foreground">{view.diagnosis}</span> : null}
          <span>{meta}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5 text-sm">
        {view.clientNote ? <p>“{view.clientNote}”</p> : null}
        {view.reportNote ? (
          <p className="text-muted-foreground">
            {t.yourNote} “{view.reportNote}”
          </p>
        ) : null}
        {view.declinedNote ? (
          <p>
            {t.trainerNote} “{view.declinedNote}”
          </p>
        ) : null}
        <p className="text-muted-foreground">{stateLine(view, locale)}</p>
        {view.change === 'better' ? <p className="text-muted-foreground">{t.saidBetter}</p> : null}
        {view.change === 'worse' ? <p className="text-muted-foreground">{t.saidWorse}</p> : null}
      </CardContent>
      {view.state === 'pending' ? (
        <CardFooter className="gap-2">
          <Button variant="outline" className="h-11 flex-1" onClick={() => onEdit(view)}>
            {t.correct}
          </Button>
          <WithdrawButton view={view} />
        </CardFooter>
      ) : view.state === 'confirmed' || view.state === 'seen' ? (
        <CardFooter className="gap-2">
          <WorseButton view={view} onWorse={onWorse} />
          {view.change !== 'better' ? <BetterButton view={view} /> : null}
        </CardFooter>
      ) : null}
    </Card>
  );
}

/**
 * Danışanın kısıtları (tasarım `kisit-tarama.md` §5.2): bölge · taraf · tür · şiddet · antrenörün notu; tanı adı yalnız
 * hekim kaynaklıysa ve niteleyicisiz. Bekleyen bildirim düzeltilir ya da geri çekilir; onaylıda Kötüleşti / Düzeldi.
 * "+ Yeni bir şey bildir" sheet'i açar; gönderince şiddete göre ne yapacağı söylenir.
 */
export function HealthConstraints({ open, closed }: { open: ClientConstraintView[]; closed: ClientConstraintView[] }) {
  const router = useRouter();
  const [sheet, setSheet] = useState<{ editing: string | null; initial: ReportDraft } | null>(null);
  const [after, setAfter] = useState<string | null>(null);
  const locale = useLocale();
  const t = clientHomeMessages(locale).health;

  const edit = (view: ClientConstraintView) =>
    setSheet({
      editing: view.id,
      initial: {
        region: view.region,
        ...(view.side ? { side: view.side } : {}),
        type: view.typeId,
        ...(view.severity ? { severity: view.severity } : {}),
        triggers: view.triggers ?? [],
        note: view.reportNote ?? '',
      },
    });

  return (
    <section aria-labelledby="constraints-heading" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="constraints-heading" className="font-heading text-lg font-semibold">
          {t.constraints}
        </h2>
        <p className="text-sm text-muted-foreground">{t.constraintsText}</p>
      </div>
      {after ? (
        <Alert>
          <CheckCircle weight="fill" />
          <AlertDescription>{after}</AlertDescription>
        </Alert>
      ) : null}
      {open.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.noConstraints}</p>
      ) : (
        open.map((view) => <ConstraintCard key={view.id} view={view} onEdit={edit} onWorse={setAfter} />)
      )}
      <Button variant="outline" className="h-11 w-full" onClick={() => setSheet({ editing: null, initial: EMPTY })}>
        <Plus data-icon="inline-start" />
        {t.reportNew}
      </Button>
      {closed.length > 0 ? (
        <details className="rounded-lg border p-3 text-sm">
          <summary className="flex min-h-11 cursor-pointer items-center font-medium">{t.closedList(closed.length)}</summary>
          <ul className="mt-2 flex flex-col gap-2">
            {closed.map((view) => (
              <li key={view.id} className="flex flex-col">
                <span>{view.title}</span>
                <span className="text-muted-foreground">{stateLine(view, locale)}</span>
                {view.declinedNote ? (
                  <span className="text-muted-foreground">
                    {t.trainerNote} “{view.declinedNote}”
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <ReportSheet
        open={sheet !== null}
        onOpenChange={(next) => (next ? undefined : setSheet(null))}
        editing={sheet?.editing ?? null}
        initial={sheet?.initial ?? EMPTY}
        onSent={(draft) => {
          const text =
            draft.severity && draft.type ? afterReportText({ severity: draft.severity, type: draft.type, ...(draft.since ? { since: draft.since } : {}) }, locale) : t.sent;
          setSheet(null);
          setAfter(sheet?.editing ? t.corrected : text);
          toast.success(sheet?.editing ? t.corrected : t.sent);
          router.refresh();
        }}
      />
    </section>
  );
}
