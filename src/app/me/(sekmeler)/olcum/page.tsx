import type { Metadata } from 'next';
import Link from 'next/link';
import { loadHealthPart } from '@/lib/health';
import { CameraWizard } from '@/components/measurements/camera-wizard';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { clientHomeMessages } from '@/i18n/messages/client-home';
import { getLocale, getMessages } from '@/i18n/server';
import { readAppConfig } from '@/lib/config';
import { currentClient } from '@/lib/guards';
import { ClientHeader } from '../../client-header';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(clientHomeMessages)).health.camera };
}

export default async function ClientCameraPage() {
  const [client, config, locale] = await Promise.all([currentClient(), readAppConfig(), getLocale()]);
  const t = clientHomeMessages(locale).health;
  const view = await loadHealthPart(client, 'screening', locale);
  return (
    <main className="flex flex-col gap-6">
      <ClientHeader client={client} appName={config.appName} title={t.camera} back={{ href: '/me/saglik', label: t.title }} />
      {view.state === 'ok' ? (
        <CameraWizard clientName={client.name} clientId={client.id} backHref="/me/saglik" backLabel={t.backToHealth} manualHref="/me/saglik" manualLabel={t.seeResults} timeZone={config.timeZone} records={view.record.cameraMeasurements ?? []} />
      ) : view.state === 'locked' ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.cameraClosed}</CardTitle>
            <CardDescription>
              {t.cameraLocked.before}
              <Link className="underline underline-offset-4" href="/me/ayarlar">
                {t.cameraLocked.link}
              </Link>
              {t.cameraLocked.after}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t.cameraUnreadable}</CardTitle>
            <CardDescription>
              {t.cameraBroken.before}
              <Link className="underline underline-offset-4" href="/me/ayarlar">
                {t.cameraBroken.link}
              </Link>
              {t.cameraBroken.after}
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </main>
  );
}
