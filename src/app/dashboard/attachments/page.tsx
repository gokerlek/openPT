import type { Metadata } from 'next';
import Link from 'next/link';
import { ImageSquare } from '@phosphor-icons/react/dist/ssr';
import { ImagePlaceholder } from '@/components/image-placeholder';
import { Plus } from '@/components/line-icons';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { attachmentImageUrl } from '@/lib/attachment-media';
import { CUSTOM_ATTACHMENTS_PATH, listAttachments, readCustomAttachments } from '@/lib/attachments';
import { listDevices } from '@/lib/devices';
import { listExercises } from '@/lib/exercises';
import { TrainingTabs } from '../training-tabs';
import { UnreadableRecordsAlert } from '../unreadable-records-alert';
import { requirePt } from '@/lib/guards';
import { getLocale, getMessages } from '@/i18n/server';
import { ptLibraryMessages } from '@/i18n/messages/pt-library';

export async function generateMetadata(): Promise<Metadata> {
  const t = (await getMessages(ptLibraryMessages)).attachmentsPage;
  return { title: t.title };
}

/**
 * Aparat havuzu: hazır liste + PT'nin aparatları. Cihazlar buradan seçer, egzersiz
 * hangisiyle yapıldığını söyler; fotoğraf bir kez burada yüklenir.
 */
export default async function AttachmentsPage() {
  await requirePt();
  const locale = await getLocale();
  const t = ptLibraryMessages(locale).attachmentsPage;
  const [file, devices, exercises] = await Promise.all([readCustomAttachments(), listDevices(undefined, locale), listExercises(undefined, locale)]);
  const attachments = await listAttachments(file, locale);
  const deviceCount = new Map<string, number>();
  for (const device of devices) {
    for (const id of new Set(device.attachments ?? [])) deviceCount.set(id, (deviceCount.get(id) ?? 0) + 1);
  }
  const exerciseCount = new Map<string, number>();
  for (const exercise of exercises) {
    if (exercise.attachmentId) exerciseCount.set(exercise.attachmentId, (exerciseCount.get(exercise.attachmentId) ?? 0) + 1);
  }
  const custom = attachments.filter((attachment) => attachment.source === 'custom').length;

  return (
    <div className="flex flex-col gap-6">
      <TrainingTabs />
      <PageHeader
        title={t.title}
        description={<span className="tabular-nums">{t.summary(attachments.length, custom)}</span>}
        actions={
          <Button nativeButton={false} render={<Link href="/dashboard/attachments/new" />}>
            <Plus data-icon="inline-start" />
            {t.add}
          </Button>
        }
      />
      <UnreadableRecordsAlert count={file.invalid} path={CUSTOM_ATTACHMENTS_PATH} />

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {attachments.map((attachment) => {
          const imageUrl = attachmentImageUrl(attachment);
          const devicesUsing = deviceCount.get(attachment.id) ?? 0;
          const exercisesUsing = exerciseCount.get(attachment.id) ?? 0;
          return (
            <li key={attachment.id}>
              <Link
                href={`/dashboard/attachments/${attachment.id}`}
                className="block h-full rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                <Card size="sm" className="h-full transition-colors hover:bg-muted/40">
                  <CardHeader>
                    {imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageUrl} alt="" loading="lazy" className="mb-2 h-28 w-full rounded-lg border bg-muted object-cover" />
                    ) : (
                      <ImagePlaceholder className="mb-2 h-28 w-full">
                        <ImageSquare className="size-8" weight="fill" />
                      </ImagePlaceholder>
                    )}
                    <CardTitle>{attachment.name}</CardTitle>
                    <CardDescription>
                      {devicesUsing > 0 ? t.usedOnDevices(devicesUsing) : t.notUsed}
                    </CardDescription>
                    {attachment.source === 'custom' ? (
                      <CardAction>
                        <Badge variant="secondary">{t.mine}</Badge>
                      </CardAction>
                    ) : null}
                  </CardHeader>
                  <CardFooter className="justify-between text-xs text-muted-foreground">
                    <span>
                      <span className="tabular-nums">{t.exerciseCount(exercisesUsing)}</span>
                    </span>
                    <span>{attachment.source === 'library' ? t.sourceLibrary : t.sourceCustom}</span>
                  </CardFooter>
                </Card>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
