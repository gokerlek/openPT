import type { Metadata } from 'next';
import Link from 'next/link';
import { InstallHelper } from '@/components/install/install-helper';
import { PageHeader } from '@/components/page-header';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LocaleSwitch } from '@/i18n/locale-switch';
import { requirePt } from '@/lib/guards';

export const metadata: Metadata = { title: 'Uygulama' };

/**
 * Ayarlar → Uygulama (tasarım Paket A): panelin uygulama olarak yüklenmesi. Yükleme yardımcısı burada her
 * zaman görünür ("Şimdi değil" yok); panel uygulama olarak açıksa "Yüklü" yazar. Altında danışan
 * uygulamasının nasıl yüklendiği: davet ekranındaki sıra.
 */
export default async function AppSettingsPage() {
  await requirePt();
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader
        title="Uygulama"
        description="Panel ve danışan uygulaması telefona yüklenir; simge ve ad Görünüm ayarlarından gelir."
      />
      <InstallHelper variant="status" audience="pt" openPath="/dashboard" />
      <Card>
        <CardHeader>
          <CardTitle>Danışan uygulaması</CardTitle>
          <CardDescription>
            Danışan davet kare kodunu telefon kamerasıyla okutur, şifresini belirler ve ekrandaki adımlarla uygulamayı ana
            ekrana ekler. Panelden ayrı bir simgedir; ikisi aynı telefonda da durabilir. Sıra her danışanın{' '}
            <Link href="/dashboard/clients" className="font-medium underline underline-offset-4">
              davet ekranında
            </Link>{' '}
            da yazar.
          </CardDescription>
        </CardHeader>
      </Card>
      <LocaleSwitch variant="card" />
    </div>
  );
}
