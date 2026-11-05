import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { ptClientsMessages } from '@/i18n/messages/pt-clients';
import { getLocale } from '@/i18n/server';
import { ClientForm } from '../client-form';
import { requirePt } from '@/lib/guards';

export async function generateMetadata(): Promise<Metadata> {
  return { title: ptClientsMessages(await getLocale()).form.newTitle };
}

export default async function NewClientPage() {
  await requirePt();
  const locale = await getLocale();
  const t = ptClientsMessages(locale);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[{ label: t.shell.breadcrumb, href: '/dashboard/clients' }, { label: t.form.newTitle }]}
        title={t.form.newTitle}
        description={t.form.newDescription}
      />
      <ClientForm editing={null} />
    </div>
  );
}
