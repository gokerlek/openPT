'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash } from '@phosphor-icons/react';
import { Check, Plus } from '@/components/line-icons';
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
import { Spinner } from '@/components/ui/spinner';
import { useMessages } from '@/i18n/client';
import { commonMessages } from '@/i18n/messages/common';
import { screeningMessages } from '@/i18n/messages/screening';
import type { ConstraintForm } from '@/lib/schemas/constraint';
import { fetchJson } from '@/lib/query/errors';
import { useServiceMutation } from '@/lib/query/use-service';

/**
 * Taramadaki ağrının iki eylemi (tasarım `kisit-tarama.md` §4.4): "Gördüm" (değerlendirmeye yönlendirdim) ve "Kısıt
 * olarak ekle" (kısa onaydan sonra tanısız hareket kısıtı yazılır, ağrı gözden geçirilmiş olur, kısıtın düzenleme
 * sayfası açılır). Kısıt adreste taşınmaz: yalnız kimliği.
 */
export function PainActions({
  clientId,
  date,
  cellKey,
  title,
  constraint,
  suggestion,
}: {
  clientId: string;
  date: string;
  cellKey: string;
  title: string;
  /** Kısıtlar onaylı değilse yok. */
  constraint: ConstraintForm | null;
  /** "Sağ omuz · kaçın: kol baş üstünde". */
  suggestion: string | null;
}) {
  const router = useRouter();
  const t = useMessages(screeningMessages).actions;
  const common = useMessages(commonMessages).actions;
  const review = useServiceMutation({
    fn: () => fetchJson<{ ok: true }>(`/api/clients/${clientId}/screenings/${date}/review`, { method: 'POST', body: JSON.stringify({ key: cellKey }) }),
    notify: { success: t.reviewed },
    onSuccess: () => router.refresh(),
  });
  const add = useServiceMutation({
    fn: () =>
      fetchJson<{ ok: true; id: string }>(`/api/clients/${clientId}/constraints`, {
        method: 'POST',
        body: JSON.stringify({ constraint, fromScreening: { date, key: cellKey } }),
      }),
    notify: { success: t.constraintAdded },
    onSuccess: (data) => {
      router.push(`/dashboard/clients/${clientId}/constraints/${data.id}/edit`);
      router.refresh();
    },
  });
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={review.isPending} onClick={() => review.mutate()}>
        {review.isPending ? <Spinner data-icon="inline-start" /> : <Check data-icon="inline-start" />}
        {t.seen}
      </Button>
      {constraint ? (
        <AlertDialog>
          <AlertDialogTrigger render={<Button size="sm" variant="outline" />}>
            <Plus data-icon="inline-start" />
            {t.addConstraint}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t.addTitle(title)}</AlertDialogTitle>
              <AlertDialogDescription>{t.addDescription(suggestion)}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{common.cancel}</AlertDialogCancel>
              <AlertDialogAction disabled={add.isPending} onClick={() => add.mutate()}>
                {add.isPending ? <Spinner data-icon="inline-start" /> : null}
                {t.addConstraint}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  );
}

/** Düzenleme sayfasının yıkıcı eylemi: o günün taramasını siler. */
export function ScreeningDelete({ clientId, date, dateLabel }: { clientId: string; date: string; dateLabel: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const t = useMessages(screeningMessages).actions;
  const common = useMessages(commonMessages).actions;
  const remove = useServiceMutation({
    fn: () => fetchJson<{ ok: true }>(`/api/clients/${clientId}/screenings/${date}`, { method: 'DELETE' }),
    notify: { success: t.deleted },
    onSuccess: () => {
      router.push(`/dashboard/clients/${clientId}/screening`);
      router.refresh();
    },
  });
  return (
    <>
      <Button variant="outline" className="text-destructive-text" onClick={() => setOpen(true)}>
        <Trash data-icon="inline-start" />
        {common.delete}
      </Button>
      <ConfirmDeleteDialog
        open={open}
        onOpenChange={setOpen}
        title={t.deleteTitle(dateLabel)}
        body={t.deleteBody}
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}
