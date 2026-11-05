import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { commonMessages } from '@/i18n/messages/common';
import { getLocale } from '@/i18n/server';
import type { Locale } from '@/i18n/locale';
import { ptLibraryMessages } from '@/i18n/messages/pt-library';
import { getAttachment, listAttachments, readCustomAttachments } from '@/lib/attachments';
import { AttachmentActions } from '../../attachment-actions';
import { AttachmentForm } from '../../attachment-form';
import { requirePt } from '@/lib/guards';

/*
 * HAM: düzenlenen aparat dil verilmeden okunur (`listAttachments(custom)`). Hazır aparatın formu okuyanın dilindeki çeviriyle
 * dolarsa kaydedince İngilizce metin PT'nin geçersiz kılmasına (override) donardı; form ham (Türkçe) kayıtla dolar.
 * Başlık ve kırıntı gibi yalnız gösterilen yerler okuyanın dilindeki listeden (`loadShownAttachment`).
 * Sayfa başlığı ile sayfa aynı okumayı paylaşır (istek başına bir kez).
 */
const loadCustom = cache(() => readCustomAttachments());
const loadAttachment = cache(async (id: string) => getAttachment(id, await listAttachments(await loadCustom())));
const loadShownAttachment = cache(async (id: string, locale: Locale) => getAttachment(id, await listAttachments(await loadCustom(), locale), locale));

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  await requirePt();
  const locale = await getLocale();
  const t = ptLibraryMessages(locale).attachmentEdit;
  const attachment = await loadShownAttachment((await params).id, locale);
  return { title: attachment ? t.metaTitle(attachment.name) : t.notFound };
}

export default async function EditAttachmentPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePt();
  const locale = await getLocale();
  const t = ptLibraryMessages(locale).attachmentEdit;
  const common = commonMessages(locale);
  const { id } = await params;
  const [attachment, shown] = await Promise.all([loadAttachment(id), loadShownAttachment(id, locale)]);
  if (!attachment) notFound();
  const shownName = (shown ?? attachment).name;
  const { source, overridesLibrary, ...editable } = attachment;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[
          { label: t.crumbList, href: '/dashboard/attachments' },
          { label: shownName, href: `/dashboard/attachments/${id}` },
          { label: common.actions.edit },
        ]}
        title={t.title}
        actions={<AttachmentActions id={id} title={shownName} source={source} overridesLibrary={overridesLibrary} />}
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
