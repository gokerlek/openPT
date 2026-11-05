import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SectionHeader } from '@/components/section-header';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ptClientsMessages } from '@/i18n/messages/pt-clients';
import { getLocale } from '@/i18n/server';
import { loadClient } from '@/lib/clients';
import { requirePt } from '@/lib/guards';
import { CLIENT_ID_PATTERN } from '@/lib/schemas/client';
import { ClientForm } from '../../client-form';
import { ClientActions } from './client-actions';

export async function generateMetadata(): Promise<Metadata> {
  return { title: ptClientsMessages(await getLocale()).form.editTitle };
}

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePt();
  const { id } = await params;
  if (!CLIENT_ID_PATTERN.test(id)) notFound();
  const loaded = await loadClient(id);
  if (!loaded) notFound();
  const t = ptClientsMessages(await getLocale());

  // Kaydı okunamayan danışan: düzenlenecek bir şey yok, yalnız listeden silinebilir.
  if (!loaded.ok) {
    return (
      <div className="flex flex-col gap-6">
        <SectionHeader
          back={{ href: `/dashboard/clients/${id}`, label: t.form.back }}
          title={t.form.editHeader}
          actions={<ClientActions id={id} name={null} />}
        />
        <Card>
          <CardHeader>
            <CardTitle>{t.list.unreadableTitle}</CardTitle>
            <CardDescription>{t.form.editUnreadable(loaded.problem)}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const { client } = loaded;
  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        back={{ href: `/dashboard/clients/${id}`, label: t.form.back }}
        title={t.form.editHeader}
        description={t.form.editDescription}
        actions={<ClientActions id={id} name={client.name} />}
      />
      <ClientForm editing={client} />
    </div>
  );
}
