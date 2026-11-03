'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowCounterClockwise, Trash } from '@phosphor-icons/react';
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';
import { Button } from '@/components/ui/button';
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

  const remove = useServiceMutation({
    fn: () => fetchJson<{ ok: true }>(`/api/attachments/${id}`, { method: 'DELETE' }),
    invalidate: [['attachments'], ['devices'], ['exercises']],
    notify: { success: overridesLibrary ? 'Varsayılan sürüme dönüldü.' : 'Aparat silindi.' },
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
        {overridesLibrary ? 'Varsayılana dön' : 'Sil'}
      </Button>
      <ConfirmDeleteDialog
        open={open}
        onOpenChange={setOpen}
        title={overridesLibrary ? `"${title}" varsayılana dönsün mü?` : `"${title}" silinsin mi?`}
        body={overridesLibrary
          ? 'Adı ve fotoğrafı hazır havuzdaki haline döner.'
          : 'Fotoğrafı da silinir. Bu aparatı seçmiş cihazlardan ve egzersizlerden düşer; antrenman kaydı etkilenmez.'}
        confirmLabel={overridesLibrary ? 'Varsayılana dön' : 'Sil'}
        confirmVariant={overridesLibrary ? 'default' : 'destructive'}
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}
