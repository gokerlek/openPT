'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LockSimple, Trash } from '@phosphor-icons/react';
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
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { ApiError, fetchJson } from '@/lib/query/errors';
import { useServiceMutation } from '@/lib/query/use-service';

/**
 * Düzenleme sayfasının yıkıcı eylemleri (SPEC §6, §11):
 * - "Erişimi kapat": açık oturumlar düşer, bekleyen davet iptal olur, şifre artık açmaz (ör. telefon
 *   kayboldu). Danışan yeni kare kodla girip yeni şifre belirler. Şifreyi unutmak için gerekmez:
 *   yeni kare kod yeter (davet ekranı).
 * - "Sil": repo ve içindeki her şey gider. PT danışanın adını yazarak doğrular (SPEC §9.2)
 */
export function ClientActions({ id, name }: { id: string; name: string | null }) {
  const router = useRouter();
  const [typed, setTyped] = useState('');
  const [confirming, setConfirming] = useState(false);
  // Kaydı okunamayan danışanda ad bilinmez: onay olarak kimlik yazılır (sunucu da öyle bekler).
  const expected = name ?? id;
  const label = name ?? 'Bu danışan';
  const matches = typed.trim().toLocaleLowerCase('tr') === expected.toLocaleLowerCase('tr');

  const revoke = useServiceMutation({
    fn: () => fetchJson<{ ok: true }>(`/api/clients/${id}/revoke`, { method: 'POST' }),
    invalidate: [['clients']],
    notify: { success: 'Erişim kapatıldı. Yeniden girmesi için yeni kare kod üret.' },
    onSuccess: () => {
      router.push(`/dashboard/clients/${id}`);
      router.refresh();
    },
  });

  const remove = useServiceMutation({
    fn: () =>
      fetchJson<{ ok: true }>(`/api/clients/${id}`, { method: 'DELETE', body: JSON.stringify({ confirmName: typed }) }),
    invalidate: [['clients']],
    notify: { success: name ? `${name} ve bütün verisi silindi.` : 'Danışan listeden çıkarıldı.' },
    onSuccess: () => {
      router.push('/dashboard/clients');
      router.refresh();
    },
  });
  const removeError = remove.error instanceof ApiError ? remove.error.fields.confirmName : undefined;

  return (
    <>
      {name ? (
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="outline" />}>
            <LockSimple data-icon="inline-start" />
            Erişimi kapat
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{name} için erişim kapatılsın mı?</AlertDialogTitle>
              <AlertDialogDescription>
                Açık oturumları hemen düşer, kullanılmamış kare kod ve şifresi artık açmaz. Verisi yerinde kalır; yeni kare
                kodla girip yeni şifre belirler. Yalnız şifresini unuttuysa bunu yapma: davet ekranında yeni kare kod yeter.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Vazgeç</AlertDialogCancel>
              <AlertDialogAction disabled={revoke.isPending} onClick={() => revoke.mutate()}>
                {revoke.isPending ? <Spinner data-icon="inline-start" /> : null}
                Erişimi kapat
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}

      <Button variant="destructive" onClick={() => setConfirming(true)}>
        <Trash data-icon="inline-start" />
        Sil
      </Button>
      <ConfirmDeleteDialog
        open={confirming}
        onOpenChange={(open) => {
          setConfirming(open);
          if (!open) setTyped('');
        }}
        title={`${label} kalıcı olarak silinsin mi?`}
        body="Danışanın repo'su ve içindeki her şey (kayıt, antrenmanlar, sağlık verisi) silinir. GitHub silinen repo'yu 90 gün boyunca yalnız hesap sahibine geri alma imkânı verir; sonra tamamen gider."
        confirmLabel="Kalıcı olarak sil"
        confirmDisabled={!matches}
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}>
        <Field data-invalid={Boolean(removeError) || undefined}>
          <FieldLabel htmlFor="confirm-name">
            {name ? 'Onaylamak için danışanın adını yaz' : `Onaylamak için kimliği yaz: ${id}`}
          </FieldLabel>
          <Input
            id="confirm-name"
            autoComplete="off"
            value={typed}
            placeholder={expected}
            aria-invalid={Boolean(removeError) || undefined}
            onChange={(event) => setTyped(event.currentTarget.value)}
          />
          <FieldDescription>Büyük-küçük harf fark etmez.</FieldDescription>
          <FieldError>{removeError}</FieldError>
        </Field>
      </ConfirmDeleteDialog>
    </>
  );
}
