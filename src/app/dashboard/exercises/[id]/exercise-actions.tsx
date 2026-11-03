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
 * - hazır egzersiz → hiçbiri (kaydedince PT'ye özel sürüm oluşur)
 * - hazır egzersizin PT sürümü → "Varsayılana dön" (PT sürümü silinir, hazırı geri gelir)
 * - PT'nin kendi egzersizi → "Sil"
 */
export function ExerciseActions({
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
    fn: () => fetchJson<{ ok: true }>(`/api/exercises/${id}`, { method: 'DELETE' }),
    invalidate: [['exercises']],
    notify: { success: overridesLibrary ? 'Varsayılan sürüme dönüldü.' : 'Egzersiz silindi.' },
    onSuccess: () => {
      // Varsayılana dönüldüyse egzersiz yerinde durur (hazır sürümüyle); silindiyse listeye dön.
      router.push(overridesLibrary ? `/dashboard/exercises/${id}` : '/dashboard/exercises');
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
          ? 'Yaptığın değişiklikler kalkar, hazır kütüphanedeki sürüm geri gelir.'
          : 'Bu egzersizi kullanan şablonlar varsa oradan da kaldırman gerekir. Git geçmişinde kaydı durur.'}
        confirmLabel={overridesLibrary ? 'Varsayılana dön' : 'Sil'}
        confirmVariant={overridesLibrary ? 'default' : 'destructive'}
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}
