'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash } from '@phosphor-icons/react';
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';
import { Button } from '@/components/ui/button';
import { commonMessages } from '@/i18n/messages/common';
import { measurementsMessages } from '@/i18n/messages/measurements';
import { useMessages } from '@/i18n/client';
import { fetchJson } from '@/lib/query/errors';
import { useServiceMutation } from '@/lib/query/use-service';

/** Düzenleme sayfasının yıkıcı eylemi (SPEC §6): o günün bütün ölçümlerini siler. */
export function MeasurementActions({ clientId, date, dateLabel }: { clientId: string; date: string; dateLabel: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const t = useMessages(measurementsMessages).actions;
  const common = useMessages(commonMessages).actions;
  const base = `/dashboard/clients/${clientId}/measurements`;

  const remove = useServiceMutation({
    fn: () => fetchJson<{ ok: true }>(`/api/clients/${clientId}/measurements/${date}`, { method: 'DELETE' }),
    notify: { success: t.deleted },
    onSuccess: () => {
      router.push(base);
      router.refresh();
    },
  });

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
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
