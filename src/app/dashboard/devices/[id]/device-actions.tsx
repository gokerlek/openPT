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
 * - hazır cihaz → hiçbiri (kaydedince PT'ye özel sürüm oluşur)
 * - hazır cihazın PT sürümü → "Varsayılana dön" (PT sürümü silinir, hazırı geri gelir)
 * - PT'nin kendi cihazı → "Sil" (bağlı egzersizler cihazsız kalır)
 */
export function DeviceActions({
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
    fn: () => fetchJson<{ ok: true }>(`/api/devices/${id}`, { method: 'DELETE' }),
    invalidate: [['devices'], ['exercises']],
    notify: { success: overridesLibrary ? 'Varsayılan sürüme dönüldü.' : 'Cihaz silindi.' },
    onSuccess: () => {
      // Varsayılana dönüldüyse cihaz yerinde durur (hazır sürümüyle); silindiyse listeye dön.
      router.push(overridesLibrary ? `/dashboard/devices/${id}` : '/dashboard/devices');
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
          ? 'Yaptığın değişiklikler kalkar, hazır katalogdaki ayarlar geri gelir.'
          : 'Bu cihaza bağlı egzersizler cihazsız kalır ve kendi ağırlık adımlarıyla devam eder. Git geçmişinde kaydı durur.'}
        confirmLabel={overridesLibrary ? 'Varsayılana dön' : 'Sil'}
        confirmVariant={overridesLibrary ? 'default' : 'destructive'}
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}
