import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { ptShellMessages } from '@/i18n/messages/pt-shell';
import { getLocale } from '@/i18n/server';
import { loadAppConfig } from '@/lib/config';
import { SetupForm } from '@/app/setup/setup-form';
import { requirePt } from '@/lib/guards';

export async function generateMetadata(): Promise<Metadata> {
  return { title: ptShellMessages(await getLocale()).settings.appearance.title };
}

/** Ayarlar → Görünüm. Kurulum sihirbazıyla aynı form; kaydedince sayfada kalır. */
export default async function SettingsPage() {
  await requirePt();
  const t = ptShellMessages(await getLocale()).settings.appearance;
  // Sihirbazla aynı kural: okunamazsa varsayılanlarla dolu form gösterilmez.
  const config = await loadAppConfig();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.title} description={t.description} />
      <SetupForm
        firstRun={false}
        hasLogo={Boolean(config.logo)}
        afterSave="/dashboard/settings"
        initial={{
          appName: config.appName,
          accent: config.accent,
          theme: config.theme,
          radius: config.radius,
          palette: config.palette,
        }}
      />
    </div>
  );
}
