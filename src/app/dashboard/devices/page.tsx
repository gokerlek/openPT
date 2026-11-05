import type { Metadata } from 'next';
import Link from 'next/link';
import { DeviceKindIcon } from '@/components/device-kind-icon';
import { ImagePlaceholder } from '@/components/image-placeholder';
import { Plus } from '@/components/line-icons';
import { PageHeader } from '@/components/page-header';
import { TrainingTabs } from '../training-tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { deviceKindLabels, DEVICE_KINDS, describeDeviceLoads } from '@/lib/device-loads';
import { deviceImageUrl } from '@/lib/device-media';
import { CUSTOM_DEVICES_PATH, listDevices, readCustomDevices } from '@/lib/devices';
import { listExercises } from '@/lib/exercises';
import { requirePt } from '@/lib/guards';
import { getLocale, getMessages } from '@/i18n/server';
import { ptLibraryMessages } from '@/i18n/messages/pt-library';
import { UnreadableRecordsAlert } from '../unreadable-records-alert';

export async function generateMetadata(): Promise<Metadata> {
  const t = (await getMessages(ptLibraryMessages)).devicesPage;
  return { title: t.title };
}

/**
 * Cihazlar: hazır katalog + PT'nin cihazları, türe göre gruplu. Egzersizler cihaza
 * bağlanır; ağırlık önerileri cihazın ayarlanabilen ağırlıklarından seçilir.
 */
export default async function DevicesPage() {
  await requirePt();
  const locale = await getLocale();
  const t = ptLibraryMessages(locale).devicesPage;
  const kindLabels = deviceKindLabels(locale);
  // i18n-followup(T5): listDevices/listExercises(…, locale) için kütüphane öğeleri henüz yerelleşmedi.
  const [file, exercises] = await Promise.all([readCustomDevices(), listExercises()]);
  const devices = await listDevices(file);
  const usage = new Map<string, number>();
  for (const exercise of exercises) {
    if (exercise.deviceId) usage.set(exercise.deviceId, (usage.get(exercise.deviceId) ?? 0) + 1);
  }
  const custom = devices.filter((device) => device.source === 'custom').length;

  return (
    <div className="flex flex-col gap-6">
      <TrainingTabs />
      <PageHeader
        title={t.title}
        description={<span className="tabular-nums">{t.summary(devices.length, custom)}</span>}
        actions={
          <Button nativeButton={false} render={<Link href="/dashboard/devices/new" />}>
            <Plus data-icon="inline-start" />
            {t.add}
          </Button>
        }
      />
      <UnreadableRecordsAlert count={file.invalid} path={CUSTOM_DEVICES_PATH} />

      {DEVICE_KINDS.map((kind) => {
        const group = devices.filter((device) => device.kind === kind);
        if (group.length === 0) return null;
        return (
          <section key={kind} className="flex flex-col gap-3" aria-label={kindLabels[kind]}>
            <h2 className="text-sm font-medium text-muted-foreground">{kindLabels[kind]}</h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.map((device) => {
                const imageUrl = deviceImageUrl(device);
                return (
                  <li key={device.id}>
                    <Link
                      href={`/dashboard/devices/${device.id}`}
                      className="block h-full rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                      <Card size="sm" className="h-full transition-colors hover:bg-muted/40">
                        <CardHeader>
                          {imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={imageUrl} alt="" loading="lazy" className="mb-2 h-28 w-full rounded-lg border bg-muted object-cover" />
                          ) : (
                            <ImagePlaceholder className="mb-2 h-28 w-full">
                              <DeviceKindIcon kind={device.kind} className="size-8" />
                            </ImagePlaceholder>
                          )}
                          <CardTitle>{device.name}</CardTitle>
                          <CardDescription>{describeDeviceLoads(device, locale)}</CardDescription>
                          {device.source === 'custom' ? (
                            <CardAction>
                              <Badge variant="secondary">{t.mine}</Badge>
                            </CardAction>
                          ) : null}
                        </CardHeader>
                        <CardFooter className="text-xs text-muted-foreground">
                          <span className="tabular-nums">{t.exerciseCount(usage.get(device.id) ?? 0)}</span>
                        </CardFooter>
                      </Card>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
