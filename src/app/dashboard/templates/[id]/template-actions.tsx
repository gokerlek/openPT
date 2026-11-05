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
import { useMessages } from '@/i18n/client';
import { ptLibraryMessages } from '@/i18n/messages/pt-library';
import { commonMessages } from '@/i18n/messages/common';

/** Düzenleme sayfasının yıkıcı eylemi (detayda değil, SPEC §6): şablon dosyasını siler. */
export function TemplateActions({ id, name }: { id: string; name: string }) {
  const t = useMessages(ptLibraryMessages).templateActions;
  const common = useMessages(commonMessages);
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const remove = useServiceMutation({
    fn: () => fetchJson<{ ok: true }>(`/api/templates/${id}`, { method: 'DELETE' }),
    invalidate: [['templates']],
    notify: { success: t.deleted },
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
        {common.actions.delete}
      </Button>
      <ConfirmDeleteDialog
        open={open}
        onOpenChange={setOpen}
        title={t.deleteTitle(name)}
        body={t.deleteBody}
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}
