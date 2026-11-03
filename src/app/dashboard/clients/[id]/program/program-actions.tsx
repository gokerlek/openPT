'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash } from '@phosphor-icons/react';
import { discardDraft } from '@/components/block-editor/editor-draft';
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';
import { Button } from '@/components/ui/button';
import { fetchJson } from '@/lib/query/errors';
import { useServiceMutation } from '@/lib/query/use-service';
import { programDraftKey } from '@/lib/unsaved-changes';

/** Düzenleme sayfasının yıkıcı eylemi (detayda değil, SPEC §6): danışanın programını siler. */
export function ProgramActions({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const remove = useServiceMutation({
    fn: () => fetchJson<{ ok: true }>(`/api/clients/${clientId}/program`, { method: 'DELETE' }),
    notify: { success: 'Program silindi.' },
    onSuccess: () => {
      // Silinen programın taslağı "Program oluştur"da sunulmasın.
      discardDraft(programDraftKey(clientId));
      router.push(`/dashboard/clients/${clientId}`);
      router.refresh();
    },
  });

  return (
    <>
      {/* Başlıktaki tek renkli düğme yıkıcı olmasın: ikincil görünüm, yalnız metni kırmızı. */}
      <Button variant="outline" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setOpen(true)}>
        <Trash data-icon="inline-start" />
        Programı sil
      </Button>
      <ConfirmDeleteDialog
        open={open}
        onOpenChange={setOpen}
        title="Program silinsin mi?"
        body="program.json danışanın repo'sundan silinir; danışanın ekranında program görünmez. Geçmişi git'te durur, geçmiş antrenman kayıtları etkilenmez."
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}
