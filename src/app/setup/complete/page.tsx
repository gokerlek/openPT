import { redirect } from 'next/navigation';
import Link from 'next/link';
import { setupMessages } from '@/i18n/messages/setup';
import { getLocale } from '@/i18n/server';
import { requirePt } from '@/lib/guards';
import { loadAppConfig } from '@/lib/config';
import { Button } from '@/components/ui/button';
export default async function CompletePage() {
  await requirePt();
  const config = await loadAppConfig();
  if (!config.setupCompleted) redirect('/setup');
  const t = setupMessages(await getLocale()).complete;
  return <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-5 px-4 py-12"><p className="text-sm font-medium text-primary">{t.badge}</p><h1 className="font-heading text-3xl font-semibold">{t.ready(config.appName)}</h1><p className="text-muted-foreground">{t.body}</p><Button render={<Link href="/dashboard/clients" />}>{t.toClients}</Button><Button variant="outline" render={<Link href="/dashboard" />}>{t.openPanel}</Button></main>;
}
