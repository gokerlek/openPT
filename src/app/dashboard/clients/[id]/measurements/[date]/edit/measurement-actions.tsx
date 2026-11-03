'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash } from '@phosphor-icons/react';
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';
import { Button } from '@/components/ui/button';
import { fetchJson } from '@/lib/query/errors';
import { useServiceMutation } from '@/lib/query/use-service';

/** Düzenleme sayfasının yıkıcı eylemi (SPEC §6): o günün bütün ölçümlerini siler. */
export function MeasurementActions({ clientId, date, dateLabel }: { clientId: string; date: string; dateLabel: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const base = `/dashboard/clients/${clientId}/measurements`;

  const remove = useServiceMutation({
    fn: () => fetchJson<{ ok: true }>(`/api/clients/${clientId}/measurements/${date}`, { method: 'DELETE' }),
    notify: { success: 'O günün ölçümleri silindi.' },
    onSuccess: () => {
      router.push(base);
      router.refresh();
    },
  });

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        <Trash data-icon="inline-start" />
        Sil
      </Button>
      <ConfirmDeleteDialog
        open={open}
        onOpenChange={setOpen}
        title={`${dateLabel} ölçümleri silinsin mi?`}
        body="O günün bütün değerleri kayıttan ve grafiklerden çıkar. Danışanın kaydının değişiklik geçmişinde bir kopyası kalır; tamamen gitmesi için danışanın kendisi silinmelidir."
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}
