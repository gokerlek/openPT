import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { commonMessages } from '@/i18n/messages/common';
import { getMessages } from '@/i18n/server';
import { ptLibraryMessages } from '@/i18n/messages/pt-library';
import { getAttachment } from '@/lib/attachments';
import { AttachmentActions } from '../../attachment-actions';
import { AttachmentForm } from '../../attachment-form';
import { requirePt } from '@/lib/guards';

/** Sayfa başlığı ile sayfa aynı okumayı paylaşır (istek başına bir kez). */
const loadAttachment = cache((id: string) => getAttachment(id));

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  await requirePt();
  const t = (await getMessages(ptLibraryMessages)).attachmentEdit;
  const attachment = await loadAttachment((await params).id);
  return { title: attachment ? t.metaTitle(attachment.name) : t.notFound };
}

export default async function EditAttachmentPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePt();
  const t = (await getMessages(ptLibraryMessages)).attachmentEdit;
  const common = await getMessages(commonMessages);
  const { id } = await params;
  const attachment = await loadAttachment(id);
  if (!attachment) notFound();
  const { source, overridesLibrary, ...editable } = attachment;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[
          { label: t.crumbList, href: '/dashboard/attachments' },
          { label: attachment.name, href: `/dashboard/attachments/${id}` },
          { label: common.actions.edit },
        ]}
        title={t.title}
        actions={<AttachmentActions id={id} title={attachment.name} source={source} overridesLibrary={overridesLibrary} />}
        description={
          source === 'library'
            ? t.libraryNote
            : undefined
        }
      />
      <Card>
        <CardContent>
          <AttachmentForm editing={editable} />
        </CardContent>
      </Card>
    </div>
  );
}
