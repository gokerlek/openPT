import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getMessages } from '@/i18n/server';
import { ptLibraryMessages } from '@/i18n/messages/pt-library';
import { listAttachments } from '@/lib/attachments';
import { DeviceForm } from '../device-form';
import { requirePt } from '@/lib/guards';

export async function generateMetadata(): Promise<Metadata> {
  const t = (await getMessages(ptLibraryMessages)).deviceNew;
  return { title: t.title };
}

export default async function NewDevicePage() {
  await requirePt();
  const t = (await getMessages(ptLibraryMessages)).deviceNew;
  // i18n-followup(T5): listAttachments(…, locale) için kütüphane öğeleri henüz yerelleşmedi.
  const attachments = await listAttachments();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[{ label: t.crumbList, href: '/dashboard/devices' }, { label: t.title }]}
        title={t.title}
        description={t.description}
      />
      <Card>
        <CardContent>
          <DeviceForm editing={null} attachments={attachments} />
        </CardContent>
      </Card>
    </div>
  );
}
