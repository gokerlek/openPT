'use client';
import { DatePicker } from '@/components/date-picker';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowCounterClockwise, CheckCircle, PencilSimple, Trash } from '@phosphor-icons/react';
import { ChoiceChips } from '@/components/choice-chips';
import { Check, X } from '@/components/line-icons';
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
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useMessages } from '@/i18n/client';
import { commonMessages } from '@/i18n/messages/common';
import { healthMessages } from '@/i18n/messages/health';
import { CLEARANCE_BASES, CONSTRAINT_LIMITS, type ClearanceBasis } from '@/lib/constraints';
import { fetchJson } from '@/lib/query/errors';
import { useServiceMutation } from '@/lib/query/use-service';

/** Kısıt kartlarının eylemleri (tasarım `kisit-tarama.md` §2.3, §2.6): hepsi aynı PATCH ucuna, `baseUpdatedAt` ile. */
function usePatch(clientId: string, id: string, success: string, after?: () => void) {
  const router = useRouter();
  return useServiceMutation({
    fn: (body: Record<string, unknown>) => fetchJson<{ ok: true }>(`/api/clients/${clientId}/constraints/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    notify: { success },
    onSuccess: () => {
      after?.();
      router.refresh();
    },
    // Kısıt o arada değiştiyse güncelini göster.
    onError: () => router.refresh(),
  });
}

/**
 * Danışanın karar bekleyen bildirimi: Onayla ve düzenle (form) · Olduğu gibi onayla (zorlayanlar kaçınmaya çevrilir;
 * zorlayan yoksa "Kaydet (süzgeçsiz)") · Kaydetmeden kapat (isteğe bağlı danışana notla).
 */
export function ReportActions({ clientId, id, baseUpdatedAt, avoidPreview }: { clientId: string; id: string; baseUpdatedAt: string; avoidPreview: string | null }) {
  const [note, setNote] = useState('');
  const t = useMessages(healthMessages).constraintActions;
  const common = useMessages(commonMessages).actions;
  const confirm = usePatch(clientId, id, avoidPreview ? t.reportConfirmed : t.reportSaved);
  const decline = usePatch(clientId, id, t.reportDeclined);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button nativeButton={false} render={<Link href={`/dashboard/clients/${clientId}/constraints/${id}/edit`} />}>
        <PencilSimple data-icon="inline-start" />
        {t.confirmEdit}
      </Button>
      <Button variant="outline" disabled={confirm.isPending} onClick={() => confirm.mutate({ action: 'confirm_as_is', baseUpdatedAt })}>
        {confirm.isPending ? <Spinner data-icon="inline-start" /> : <Check data-icon="inline-start" />}
        {avoidPreview ? t.confirmAsIs : t.saveUnfiltered}
      </Button>
      <AlertDialog>
        <AlertDialogTrigger render={<Button variant="ghost" />}>{t.decline}</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.declineTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.declineBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <Field>
            <FieldLabel htmlFor={`decline-${id}`}>{t.declineNote}</FieldLabel>
            <Textarea
              id={`decline-${id}`}
              maxLength={CONSTRAINT_LIMITS.reportNote}
              placeholder={t.declinePlaceholder}
              value={note}
              onChange={(event) => setNote(event.currentTarget.value)}
            />
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel>{common.cancel}</AlertDialogCancel>
            <AlertDialogAction disabled={decline.isPending} onClick={() => decline.mutate({ action: 'decline', baseUpdatedAt, note })}>
              {decline.isPending ? <Spinner data-icon="inline-start" /> : null}
              {t.decline}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Onaylı kısıtta danışanın güncellemesi: kötüleştiyse "Gördüm"; düzeldi dediyse "Kapat" ya da "Etkin kalsın". */
export function ChangeActions({ clientId, id, baseUpdatedAt, kind }: { clientId: string; id: string; baseUpdatedAt: string; kind: 'worse' | 'better' }) {
  const t = useMessages(healthMessages).constraintActions;
  const ack = usePatch(clientId, id, kind === 'worse' ? t.seenMarked : t.saved);
  if (kind === 'worse') {
    return (
      <Button size="sm" variant="outline" disabled={ack.isPending} onClick={() => ack.mutate({ action: 'ack_change', baseUpdatedAt })}>
        {ack.isPending ? <Spinner data-icon="inline-start" /> : <Check data-icon="inline-start" />}
        {t.seen}
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" disabled={ack.isPending} onClick={() => ack.mutate({ action: 'ack_change', baseUpdatedAt, close: true })}>
        <CheckCircle data-icon="inline-start" />
        {t.close}
      </Button>
      <Button size="sm" variant="outline" disabled={ack.isPending} onClick={() => ack.mutate({ action: 'ack_change', baseUpdatedAt })}>
        {t.keepActive}
      </Button>
    </div>
  );
}

/**
 * Kırmızı bayrağın iki adımı (§2.6): "Sağlık profesyoneline yönlendirdim" (tarih) ve "Görüş alındı" (tarih, dayanak,
 * kısa kapsam). Uygulama kapsamı yorumlamaz; kaçınma söylüyorsa PT onu kısıta ekler.
 */
export function RedFlagActions({
  clientId,
  id,
  baseUpdatedAt,
  step,
  today,
}: {
  clientId: string;
  id: string;
  baseUpdatedAt: string;
  step: 'refer' | 'opinion';
  today: string;
}) {
  const [referDate, setReferDate] = useState(today);
  const [date, setDate] = useState(today);
  const [basis, setBasis] = useState<ClearanceBasis | undefined>(undefined);
  const [scope, setScope] = useState('');
  const [open, setOpen] = useState(false);
  const messages = useMessages(healthMessages);
  const t = messages.constraintActions;
  const common = useMessages(commonMessages).actions;
  const refer = usePatch(clientId, id, t.referSaved);
  const clear = usePatch(clientId, id, t.opinionSaved, () => setOpen(false));
  return (
    <div className="flex flex-col gap-3">
      {step === 'refer' ? (
        <div className="flex flex-wrap items-end gap-2">
          <Field className="w-auto">
            <FieldLabel htmlFor={`refer-${id}`} className="text-xs">
              {t.referDate}
            </FieldLabel>
            <DatePicker id={`refer-${id}`} max={today} value={referDate} onValueChange={setReferDate} className="w-40" />
          </Field>
          <Button size="sm" disabled={refer.isPending || !referDate} onClick={() => refer.mutate({ action: 'refer', baseUpdatedAt, date: referDate })}>
            {refer.isPending ? <Spinner data-icon="inline-start" /> : <Check data-icon="inline-start" />}
            {t.referred}
          </Button>
        </div>
      ) : null}
      {open ? (
        <div className="flex flex-col gap-3 rounded-lg border p-3">
          <Field className="w-auto">
            <FieldLabel htmlFor={`clear-${id}`} className="text-xs">
              {t.opinionDate}
            </FieldLabel>
            <DatePicker id={`clear-${id}`} max={today} value={date} onValueChange={setDate} className="w-40" />
          </Field>
          <Field>
            <FieldLabel id={`basis-${id}`} className="text-xs">
              {t.basis}
            </FieldLabel>
            <ChoiceChips
              labelledBy={`basis-${id}`}
              value={basis}
              options={CLEARANCE_BASES.map((item) => ({ value: item, label: messages.constraints.clearanceBases[item] }))}
              onChange={setBasis}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`scope-${id}`} className="text-xs">
              {t.scope}
            </FieldLabel>
            <Input
              id={`scope-${id}`}
              maxLength={CONSTRAINT_LIMITS.scope}
              placeholder={t.scopePlaceholder}
              value={scope}
              onChange={(event) => setScope(event.currentTarget.value)}
            />
          </Field>
          <div className="flex gap-2">
            <Button size="sm" disabled={clear.isPending || !basis || !date} onClick={() => clear.mutate({ action: 'clear', baseUpdatedAt, date, basis, scope })}>
              {clear.isPending ? <Spinner data-icon="inline-start" /> : <Check data-icon="inline-start" />}
              {common.save}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              {common.cancel}
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant={step === 'opinion' ? 'default' : 'outline'} className="w-fit" onClick={() => setOpen(true)}>
          {t.opinionReceived}
        </Button>
      )}
    </div>
  );
}

/** İzni kaldırır: hareket yine kısıtın süzgecinden geçer. */
export function OverrideRemove({ clientId, exerciseId, source, title }: { clientId: string; exerciseId: string; source: string; title: string }) {
  const router = useRouter();
  const t = useMessages(healthMessages).constraintActions;
  const remove = useServiceMutation({
    fn: () => fetchJson<{ ok: true }>(`/api/clients/${clientId}/constraints/overrides/${exerciseId}?source=${source}`, { method: 'DELETE' }),
    notify: { success: t.overrideRemoved },
    onSuccess: () => router.refresh(),
  });
  return (
    <Button size="sm" variant="ghost" className="min-h-11" aria-label={t.removeOverride(title)} disabled={remove.isPending} onClick={() => remove.mutate()}>
      {remove.isPending ? <Spinner data-icon="inline-start" /> : <X data-icon="inline-start" />}
      {t.remove}
    </Button>
  );
}

/** Düzenleme sayfasının başlığındaki durum ve yıkıcı eylemler: Kapat / Yeniden aç, Sil. */
export function ConstraintEditActions({
  clientId,
  id,
  baseUpdatedAt,
  status,
  label,
}: {
  clientId: string;
  id: string;
  baseUpdatedAt: string;
  status: 'active' | 'closed' | 'pending';
  label: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const t = useMessages(healthMessages).constraintActions;
  const common = useMessages(commonMessages).actions;
  const base = `/dashboard/clients/${clientId}/constraints`;
  const toggle = usePatch(clientId, id, status === 'closed' ? t.reopened : t.closed, () => router.push(base));
  const remove = useServiceMutation({
    fn: () => fetchJson<{ ok: true }>(`/api/clients/${clientId}/constraints/${id}`, { method: 'DELETE' }),
    notify: { success: t.deleted },
    onSuccess: () => {
      router.push(base);
      router.refresh();
    },
  });
  return (
    <>
      {status !== 'pending' ? (
        <Button
          variant="outline"
          disabled={toggle.isPending}
          onClick={() => toggle.mutate({ action: status === 'closed' ? 'reopen' : 'resolve', baseUpdatedAt })}>
          {status === 'closed' ? <ArrowCounterClockwise data-icon="inline-start" /> : <CheckCircle data-icon="inline-start" />}
          {status === 'closed' ? t.reopen : t.close}
        </Button>
      ) : null}
      <Button variant="outline" className="text-destructive-text" onClick={() => setConfirming(true)}>
        <Trash data-icon="inline-start" />
        {common.delete}
      </Button>
      <ConfirmDeleteDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t.deleteTitle(label)}
        body={t.deleteBody}
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}
