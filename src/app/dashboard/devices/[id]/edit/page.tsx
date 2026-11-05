import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { commonMessages } from '@/i18n/messages/common';
import { getMessages } from '@/i18n/server';
import { ptLibraryMessages } from '@/i18n/messages/pt-library';
import { listAttachments } from '@/lib/attachments';
import { getDevice } from '@/lib/devices';
import { DeviceActions } from '../device-actions';
import { DeviceForm } from '../../device-form';
import { requirePt } from '@/lib/guards';

/** Sayfa başlığı ile sayfa aynı okumayı paylaşır (istek başına bir kez). */
const loadDevice = cache((id: string) => getDevice(id));

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  await requirePt();
  const t = (await getMessages(ptLibraryMessages)).deviceEdit;
  const device = await loadDevice((await params).id);
  return { title: device ? t.metaTitle(device.name) : t.notFound };
}

export default async function EditDevicePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePt();
  const t = (await getMessages(ptLibraryMessages)).deviceEdit;
  const common = await getMessages(commonMessages);
  const { id } = await params;
  // i18n-followup(T5): listAttachments(…, locale) için kütüphane öğeleri henüz yerelleşmedi.
  const [device, attachments] = await Promise.all([loadDevice(id), listAttachments()]);
  if (!device) notFound();
  const { source: _source, overridesLibrary: _override, ...editable } = device;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[
          { label: t.crumbList, href: '/dashboard/devices' },
          { label: device.name, href: `/dashboard/devices/${id}` },
          { label: common.actions.edit },
        ]}
        title={t.title}
        actions={
          <DeviceActions
            id={id}
            title={device.name}
            source={device.source}
            overridesLibrary={device.overridesLibrary}
          />
        }
        description={
          device.source === 'library'
            ? t.libraryNote
            : undefined
        }
      />
      <Card>
        <CardContent>
          <DeviceForm editing={editable} attachments={attachments} />
        </CardContent>
      </Card>
    </div>
  );
}
