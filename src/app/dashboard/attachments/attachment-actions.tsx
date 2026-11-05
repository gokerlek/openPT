'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowCounterClockwise, Trash } from '@phosphor-icons/react';
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';
import { Button } from '@/components/ui/button';
import { commonMessages } from '@/i18n/messages/common';
import { useMessages } from '@/i18n/client';
import { ptLibraryMessages } from '@/i18n/messages/pt-library';
import { fetchJson } from '@/lib/query/errors';
import { useServiceMutation } from '@/lib/query/use-service';

/**
 * Düzenleme sayfasının yıkıcı eylemleri (detayda değil, SPEC §6):
 * - hazır aparat → hiçbiri (kaydedince PT'ye özel sürüm oluşur)
 * - hazırın PT sürümü → "Varsayılana dön"
 * - PT'nin kendi aparatı → "Sil"
 */
export function AttachmentActions({
  id,
  title,
  source,
  overridesLibrary,
}: {
  id: string;
  title: string;
  source: 'library' | 'custom';
  overridesLibrary: boolean;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const t = useMessages(ptLibraryMessages).attachmentActions;
  const common = useMessages(commonMessages);

  const remove = useServiceMutation({
    fn: () => fetchJson<{ ok: true }>(`/api/attachments/${id}`, { method: 'DELETE' }),
    invalidate: [['attachments'], ['devices'], ['exercises']],
    notify: { success: overridesLibrary ? t.resetDone : t.deleted },
    onSuccess: () => {
      // Varsayılana dönüldüyse aparat yerinde durur (hazır sürümüyle); silindiyse listeye dön.
      router.push(overridesLibrary ? `/dashboard/attachments/${id}` : '/dashboard/attachments');
      router.refresh();
    },
  });

  if (source !== 'custom') return null;

  return (
    <>
      <Button variant={overridesLibrary ? 'outline' : 'destructive'} onClick={() => setOpen(true)}>
        {overridesLibrary ? <ArrowCounterClockwise data-icon="inline-start" /> : <Trash data-icon="inline-start" />}
        {overridesLibrary ? common.actions.resetToDefault : common.actions.delete}
      </Button>
      <ConfirmDeleteDialog
        open={open}
        onOpenChange={setOpen}
        title={overridesLibrary ? t.resetTitle(title) : t.deleteTitle(title)}
        body={overridesLibrary
          ? t.resetBody
          : t.deleteBody}
        confirmLabel={overridesLibrary ? common.actions.resetToDefault : common.actions.delete}
        confirmVariant={overridesLibrary ? 'default' : 'destructive'}
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}
