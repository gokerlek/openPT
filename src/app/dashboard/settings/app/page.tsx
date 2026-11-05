import type { Metadata } from 'next';
import Link from 'next/link';
import { InstallHelper } from '@/components/install/install-helper';
import { PageHeader } from '@/components/page-header';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LocaleSwitch } from '@/i18n/locale-switch';
import { ptShellMessages } from '@/i18n/messages/pt-shell';
import { getLocale } from '@/i18n/server';
import { requirePt } from '@/lib/guards';

export async function generateMetadata(): Promise<Metadata> {
  return { title: ptShellMessages(await getLocale()).settings.app.title };
}

/**
 * Ayarlar → Uygulama (tasarım Paket A): panelin uygulama olarak yüklenmesi. Yükleme yardımcısı burada her
 * zaman görünür ("Şimdi değil" yok); panel uygulama olarak açıksa "Yüklü" yazar. Altında danışan
 * uygulamasının nasıl yüklendiği: davet ekranındaki sıra.
 */
export default async function AppSettingsPage() {
  await requirePt();
  const t = ptShellMessages(await getLocale()).settings.app;
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader title={t.title} description={t.description} />
      <InstallHelper variant="status" audience="pt" openPath="/dashboard" />
      <Card>
        <CardHeader>
          <CardTitle>{t.clientAppTitle}</CardTitle>
          <CardDescription>
            {t.clientAppBody.before}
            <Link href="/dashboard/clients" className="font-medium underline underline-offset-4">
              {t.clientAppBody.link}
            </Link>
            {t.clientAppBody.after}
          </CardDescription>
        </CardHeader>
      </Card>
      <LocaleSwitch variant="card" />
    </div>
  );
}
