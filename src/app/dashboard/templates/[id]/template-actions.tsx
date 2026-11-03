'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash } from '@phosphor-icons/react';
import { discardDraft } from '@/components/block-editor/editor-draft';
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';
import { Button } from '@/components/ui/button';
import { fetchJson } from '@/lib/query/errors';
import { useServiceMutation } from '@/lib/query/use-service';
import { templateDraftKey } from '@/lib/unsaved-changes';

/** Düzenleme sayfasının yıkıcı eylemi (detayda değil, SPEC §6): şablon dosyasını siler. */
export function TemplateActions({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const remove = useServiceMutation({
    fn: () => fetchJson<{ ok: true }>(`/api/templates/${id}`, { method: 'DELETE' }),
    invalidate: [['templates']],
    notify: { success: 'Şablon silindi.' },
    onSuccess: () => {
      discardDraft(templateDraftKey(id));
      router.push('/dashboard/templates');
      router.refresh();
    },
  });

  return (
    <>
      {/* Başlıktaki tek renkli düğme yıkıcı olmasın: ikincil görünüm, yalnız metni kırmızı. */}
      <Button variant="outline" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setOpen(true)}>
        <Trash data-icon="inline-start" />
        Sil
      </Button>
      <ConfirmDeleteDialog
        open={open}
        onOpenChange={setOpen}
        title={`"${name}" silinsin mi?`}
        body="Şablon dosyası uygulama repo'ndan silinir; git geçmişinde kaydı durur."
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}
