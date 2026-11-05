import type { Metadata } from 'next';
import Link from 'next/link';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { ImageSquare } from '@phosphor-icons/react/dist/ssr';
import { ImagePlaceholder } from '@/components/image-placeholder';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';
import { attachmentImageUrl } from '@/lib/attachment-media';
import { getAttachment } from '@/lib/attachments';
import { deviceKindLabels } from '@/lib/device-loads';
import { listDevices } from '@/lib/devices';
import { listExercises } from '@/lib/exercises';
import { summarizeMuscles } from '@/lib/muscles';
import { EditButton } from '@/components/edit-button';
import { requirePt } from '@/lib/guards';
import { getLocale, getMessages } from '@/i18n/server';
import { ptLibraryMessages } from '@/i18n/messages/pt-library';

/** Sayfa başlığı ile sayfa aynı okumayı paylaşır (istek başına bir kez). */
const loadAttachment = cache((id: string) => getAttachment(id));

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  await requirePt();
  const t = (await getMessages(ptLibraryMessages)).attachmentPage;
  const attachment = await loadAttachment((await params).id);
  return { title: attachment?.name ?? t.notFound };
}

/** Aparat detayı — yalnız gösterir; değiştirmek için "Düzenle" (SPEC §6). */
export default async function AttachmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePt();
  const locale = await getLocale();
  const t = ptLibraryMessages(locale).attachmentPage;
  const { id } = await params;
  // i18n-followup(T5): listDevices/listExercises(…, locale) için kütüphane öğeleri henüz yerelleşmedi.
  const [attachment, devices, exercises] = await Promise.all([loadAttachment(id), listDevices(), listExercises()]);
  if (!attachment) notFound();

  const imageUrl = attachmentImageUrl(attachment);
  const usedByDevices = devices.filter((device) => device.attachments?.includes(id));
  const usedByExercises = exercises.filter((exercise) => exercise.attachmentId === id);
  const origin =
    attachment.source === 'library' ? t.sourceLibrary : attachment.overridesLibrary ? t.sourceOverride : t.sourceCustom;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[{ label: t.crumbList, href: '/dashboard/attachments' }, { label: attachment.name }]}
        title={attachment.name}
        description={origin}
        actions={<EditButton href={`/dashboard/attachments/${attachment.id}/edit`} />}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t.photoTitle}</CardTitle>
            <CardDescription>{t.photoDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt={attachment.name} className="max-h-72 w-full rounded-lg border bg-muted object-contain" />
            ) : (
              <ImagePlaceholder className="h-40 w-full">
                <ImageSquare className="size-10" weight="fill" />
              </ImagePlaceholder>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t.devicesTitle}</CardTitle>
              <CardDescription>
                {usedByDevices.length > 0
                  ? t.devicesEditHint
                  : t.devicesEmpty}
              </CardDescription>
            </CardHeader>
            {usedByDevices.length > 0 ? (
              <CardContent>
                <ItemGroup className="gap-2">
                  {usedByDevices.map((device) => (
                    <Item key={device.id} variant="outline" size="sm" render={<Link href={`/dashboard/devices/${device.id}`} />}>
                      <ItemContent>
                        <ItemTitle>{device.name}</ItemTitle>
                        <ItemDescription>{deviceKindLabels(locale)[device.kind]}</ItemDescription>
                      </ItemContent>
                    </Item>
                  ))}
                </ItemGroup>
              </CardContent>
            ) : null}
          </Card>

        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.exercisesTitle}</CardTitle>
          <CardDescription>
            {usedByExercises.length > 0
              ? t.exercisesEditHint
              : t.exercisesEmpty}
          </CardDescription>
        </CardHeader>
        {usedByExercises.length > 0 ? (
          <CardContent>
            <ItemGroup className="gap-2 sm:grid sm:grid-cols-2 lg:grid-cols-3">
              {usedByExercises.map((exercise) => (
                <Item key={exercise.id} variant="outline" size="sm" render={<Link href={`/dashboard/exercises/${exercise.id}`} />}>
                  <ItemContent>
                    <ItemTitle>{exercise.title}</ItemTitle>
                    <ItemDescription>{summarizeMuscles(exercise.primaryMuscles, locale).join(', ')}</ItemDescription>
                  </ItemContent>
                </Item>
              ))}
            </ItemGroup>
          </CardContent>
        ) : null}
      </Card>
    </div>
  );
}
