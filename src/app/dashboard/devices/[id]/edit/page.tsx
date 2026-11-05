import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { commonMessages } from '@/i18n/messages/common';
import { getLocale } from '@/i18n/server';
import type { Locale } from '@/i18n/locale';
import { ptLibraryMessages } from '@/i18n/messages/pt-library';
import { listAttachments } from '@/lib/attachments';
import { getDevice, listDevices, readCustomDevices } from '@/lib/devices';
import { DeviceActions } from '../device-actions';
import { DeviceForm } from '../../device-form';
import { requirePt } from '@/lib/guards';

/*
 * HAM: düzenlenen cihaz dil verilmeden okunur (`listDevices(custom)`). Hazır cihazın formu okuyanın dilindeki çeviriyle
 * dolarsa kaydedince İngilizce metin PT'nin geçersiz kılmasına (override) donardı; form ham (Türkçe) kayıtla dolar.
 * Başlık ve kırıntı gibi yalnız gösterilen yerler okuyanın dilindeki listeden (`loadShownDevice`).
 * Sayfa başlığı ile sayfa aynı okumayı paylaşır (istek başına bir kez).
 */
const loadCustom = cache(() => readCustomDevices());
const loadDevice = cache(async (id: string) => getDevice(id, await listDevices(await loadCustom())));
const loadShownDevice = cache(async (id: string, locale: Locale) => getDevice(id, await listDevices(await loadCustom(), locale)));

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  await requirePt();
  const locale = await getLocale();
  const t = ptLibraryMessages(locale).deviceEdit;
  const device = await loadShownDevice((await params).id, locale);
  return { title: device ? t.metaTitle(device.name) : t.notFound };
}

export default async function EditDevicePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePt();
  const locale = await getLocale();
  const t = ptLibraryMessages(locale).deviceEdit;
  const common = commonMessages(locale);
  const { id } = await params;
  const [device, shown, attachments] = await Promise.all([loadDevice(id), loadShownDevice(id, locale), listAttachments(undefined, locale)]);
  if (!device) notFound();
  const shownName = (shown ?? device).name;
  const { source: _source, overridesLibrary: _override, ...editable } = device;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[
          { label: t.crumbList, href: '/dashboard/devices' },
          { label: shownName, href: `/dashboard/devices/${id}` },
          { label: common.actions.edit },
        ]}
        title={t.title}
        actions={
          <DeviceActions
            id={id}
            title={shownName}
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
