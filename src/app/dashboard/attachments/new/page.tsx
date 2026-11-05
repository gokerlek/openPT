import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getMessages } from '@/i18n/server';
import { ptLibraryMessages } from '@/i18n/messages/pt-library';
import { AttachmentForm } from '../attachment-form';
import { requirePt } from '@/lib/guards';

export async function generateMetadata(): Promise<Metadata> {
  const t = (await getMessages(ptLibraryMessages)).attachmentNew;
  return { title: t.title };
}

export default async function NewAttachmentPage() {
  await requirePt();
  const t = (await getMessages(ptLibraryMessages)).attachmentNew;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[{ label: t.crumbList, href: '/dashboard/attachments' }, { label: t.title }]}
        title={t.title}
        description={t.description}
      />
      <Card>
        <CardContent>
          <AttachmentForm editing={null} />
        </CardContent>
      </Card>
    </div>
  );
}
