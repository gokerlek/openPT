import type { Metadata } from 'next';
import Link from 'next/link';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { ImageSquare } from '@phosphor-icons/react/dist/ssr';
import { DeviceKindIcon } from '@/components/device-kind-icon';
import { ImagePlaceholder } from '@/components/image-placeholder';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { deviceKindLabels, describeDeviceLoads, deviceLoads, effectiveLoadKg } from '@/lib/device-loads';
import { attachmentImageUrl } from '@/lib/attachment-media';
import { listAttachments } from '@/lib/attachments';
import { deviceImageUrl } from '@/lib/device-media';
import { getDevice } from '@/lib/devices';
import { listExercises } from '@/lib/exercises';
import { getFormat } from '@/lib/format';
import { summarizeMuscles } from '@/lib/muscles';
import { EditButton } from '@/components/edit-button';
import { requirePt } from '@/lib/guards';
import { getLocale, getMessages } from '@/i18n/server';
import { ptLibraryMessages } from '@/i18n/messages/pt-library';

/** Sayfa başlığı ile sayfa aynı okumayı paylaşır (istek başına bir kez). */
const loadDevice = cache((id: string) => getDevice(id));

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  await requirePt();
  const t = (await getMessages(ptLibraryMessages)).devicePage;
  const device = await loadDevice((await params).id);
  return { title: device?.name ?? t.notFound };
}

/** Cihaz detayı — kendi sayfası (modal değil). */
export default async function DeviceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePt();
  const locale = await getLocale();
  const t = ptLibraryMessages(locale).devicePage;
  const format = getFormat(locale);
  const { id } = await params;
  // i18n-followup(T5): listExercises/listAttachments(…, locale) için kütüphane öğeleri henüz yerelleşmedi.
  const [device, exercises, pool] = await Promise.all([loadDevice(id), listExercises(), listAttachments()]);
  if (!device) notFound();

  const used = exercises.filter((exercise) => exercise.deviceId === id);
  const loads = deviceLoads(device) ?? [];
  const shown = loads.slice(0, 40);
  const ratio = device.kind === 'cable' ? (device.pulleyRatio ?? 1) : 1;

  const rows: [string, string][] = [
    [t.rowKind, deviceKindLabels(locale)[device.kind]],
    ...(device.baseKg !== undefined
      ? ([[device.kind === 'barbell' ? t.rowBar : device.kind === 'plate_loaded' ? t.rowSled : t.rowFirstStack, format.kg(device.baseKg)]] as [string, string][])
      : []),
    ...(device.stepKg ? ([[device.kind === 'barbell' || device.kind === 'plate_loaded' ? t.rowSmallestIncrement : t.rowStackStep, format.kg(device.stepKg)]] as [string, string][]) : []),
    ...(device.maxKg ? ([[t.rowMax, format.kg(device.maxKg)]] as [string, string][]) : []),
    ...(device.addOnsKg?.length ? ([[t.rowAddOns, device.addOnsKg.map((kg) => `+${format.kg(kg)}`).join(', ')]] as [string, string][]) : []),

    ...(device.kind === 'cable'
      ? ([[t.rowPulley, ratio === 1 ? t.pulleySingle : t.pulleyRatio(ratio, format.kg(effectiveLoadKg(device, 20)))]] as [string, string][])
      : []),
  ];

  const origin = device.source === 'library' ? t.originLibrary : device.overridesLibrary ? t.originOverride : t.originCustom;
  const imageUrl = deviceImageUrl(device);
  // Aparatlar havuzda durur; cihazda yalnız kimlikleri yazılı. Havuzdan silinmiş kimlik düşer.
  const attachments = (device.attachments ?? []).flatMap((attachmentId) => {
    const found = pool.find((item) => item.id === attachmentId);
    return found ? [{ id: found.id, name: found.name, imageUrl: attachmentImageUrl(found) }] : [];
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[{ label: t.crumbList, href: '/dashboard/devices' }, { label: device.name }]}
        title={device.name}
        description={describeDeviceLoads(device, locale)}
        actions={<EditButton href={`/dashboard/devices/${device.id}/edit`} />}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t.loadTitle}</CardTitle>
            <CardDescription>{origin}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt={device.name} className="max-h-72 w-full rounded-lg border bg-muted object-contain" />
            ) : (
              <ImagePlaceholder className="h-40 w-full">
                <DeviceKindIcon kind={device.kind} className="size-10" />
              </ImagePlaceholder>
            )}
            <Table>
              <TableBody>
                {rows.map(([label, value]) => (
                  <TableRow key={label}>
                    <TableCell className="w-36 text-muted-foreground">{label}</TableCell>
                    <TableCell className="whitespace-normal tabular-nums">{value}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {loads.length > 0 ? (
              <div className="flex flex-col gap-2">
                <span className="text-muted-foreground">{t.adjustable}</span>
                <div className="flex flex-wrap gap-1.5">
                  {shown.map((kg) => (
                    <Badge key={kg} variant="secondary" className="tabular-nums">
                      {format.number(kg)}
                    </Badge>
                  ))}
                  {loads.length > shown.length ? (
                    <Badge variant="outline" className="tabular-nums">
                      {t.moreWeights(loads.length - shown.length)}
                    </Badge>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">{t.noLoad}</p>
            )}
            {device.notes ? <p className="text-muted-foreground">{device.notes}</p> : null}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          {attachments.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>{t.attachmentsTitle}</CardTitle>
                <CardDescription>
                  {t.poolNote.before}
                  <Link href="/dashboard/attachments" className="underline underline-offset-4">
                    {t.poolNote.link}
                  </Link>
                  {t.poolNote.after}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ItemGroup className="gap-2">
                  {attachments.map((attachment) => (
                    <Item
                      key={attachment.id}
                      variant="outline"
                      size="sm"
                      render={<Link href={`/dashboard/attachments/${attachment.id}`} />}>
                      <ItemMedia variant="image">
                        {attachment.imageUrl ? (
                          // Özel repo'dan uygulama üzerinden gelir; Next görsel iyileştiricisi oturum çerezini taşımaz.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={attachment.imageUrl} alt="" className="size-full object-cover" />
                        ) : (
                          <ImagePlaceholder className="size-full">
                            <ImageSquare className="size-4" />
                          </ImagePlaceholder>
                        )}
                      </ItemMedia>
                      <ItemContent>
                        <ItemTitle>{attachment.name}</ItemTitle>
                      </ItemContent>
                    </Item>
                  ))}
                </ItemGroup>
              </CardContent>
            </Card>
          ) : null}

        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.exercisesTitle}</CardTitle>
          <CardDescription>
            {used.length > 0
              ? t.exercisesHint
              : t.exercisesEmpty}
          </CardDescription>
        </CardHeader>
        {used.length > 0 ? (
          <CardContent>
            <ItemGroup className="gap-2 sm:grid sm:grid-cols-2 lg:grid-cols-3">
              {used.map((exercise) => (
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
