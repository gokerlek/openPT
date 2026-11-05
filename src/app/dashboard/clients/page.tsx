import type { Metadata } from 'next';
import Link from 'next/link';
import { UsersThree } from '@phosphor-icons/react/dist/ssr';
import { Plus } from '@/components/line-icons';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { ptClientsMessages } from '@/i18n/messages/pt-clients';
import { getLocale } from '@/i18n/server';
import { listClients, readInvite } from '@/lib/clients';
import { readAppConfig } from '@/lib/config';
import { clientCardExtras, type CardExtras } from '@/lib/client-card-extras';
import { clientStatusLabels, CLIENT_STATUSES } from '@/lib/schemas/client';
import { requirePt } from '@/lib/guards';
import { clientOverviews } from '../client-overviews';
import { ClientList, type ClientCardData, type ClientSectionData } from './client-list';
import { clientsSummary, clientWork } from './client-work';
import { passwordOf } from './invite-state';

export async function generateMetadata(): Promise<Metadata> {
  return { title: ptClientsMessages(await getLocale()).list.title };
}

/**
 * Danışanlar: durumuna göre gruplu (arşivdekiler en altta), ada göre aranır (`ClientList`). Her satır detaya
 * tek dokunuşla açılır ve PT'nin işini gösterir: giriş durumu (davet yok / bekliyor / süresi doldu; katıldıysa
 * şifre belirledi mi), sağlık onayı bekliyorsa o (`clientWork`), dikkat maddelerinin sayısı ve son antrenman
 * günü. Başlıkta bekleyenlerin sayısı.
 *
 * Dikkat ve son antrenman Genel bakış'la aynı danışan özetlerinden (`client-overviews.ts`; önbellekli,
 * arşivdekiler hariç); özeti okunamayan danışanda yok. Beklenmez: liste hemen çizilir, kartların altı özetler
 * gelince dolar (önbellek boşken danışan başına GitHub okuması sürebilir). Kartın alt satırı `client-card-extras.ts`.
 */
export default async function ClientsPage() {
  await requirePt();
  const locale = await getLocale();
  const t = ptClientsMessages(locale).list;
  // Listeyle aynı anda başlar; reddedilmez (okunamazsa kartlarda dikkat bilgisi yok).
  const digests = Promise.all([clientOverviews(), readAppConfig()]).catch(() => null);
  const clients = await listClients();
  const invites = new Map(
    await Promise.all(
      clients.map(async (entry) => [entry.id, await readInvite(entry.id).catch(() => null)] as const),
    ),
  );
  const now = new Date();

  const rows = clients.map((entry) => ({
    entry,
    work: entry.ok ? clientWork(entry.client, invites.get(entry.id)?.invite ?? null, now, locale) : null,
  }));
  const summary = clientsSummary(rows.map(({ entry, work }) => ({ status: entry.status, work })), locale);

  const extras: Promise<Record<string, CardExtras>> = digests
    .then((loaded) => {
      if (!loaded) return {};
      const [{ overviews }, config] = loaded;
      return clientCardExtras(
        rows.map(({ entry, work }) => ({ id: entry.id, ok: entry.ok, status: entry.status, access: work?.access ?? null })),
        new Map(overviews.map((overview) => [overview.id, overview.attention])),
        { now, timeZone: config.timeZone, locale },
      );
    })
    .catch(() => ({}));

  const cards = rows.map(
    ({ entry, work }): ClientCardData => ({
      id: entry.id,
      name: entry.ok ? entry.client.name : entry.id,
      status: entry.status,
      ok: entry.ok,
      note: entry.ok ? (entry.client.note ?? null) : null,
      problem: entry.ok ? null : entry.problem,
      work:
        entry.ok && work
          ? { access: work.access, password: passwordOf(entry.client), health: work.healthWork }
          : null,
    }),
  );
  const statusLabels = clientStatusLabels(locale);
  const sections = CLIENT_STATUSES.flatMap((status): ClientSectionData[] => {
    const group = cards.filter((card) => card.status === status);
    return group.length > 0 ? [{ status, label: statusLabels[status], cards: group }] : [];
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t.title}
        description={<span className="tabular-nums">{summary}.</span>}
        actions={
          <Button nativeButton={false} render={<Link href="/dashboard/clients/new" />}>
            <Plus data-icon="inline-start" />
            {t.newClient}
          </Button>
        }
      />

      {clients.length === 0 ? (
        <Card>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UsersThree weight="fill" />
              </EmptyMedia>
              <EmptyTitle>{t.emptyTitle}</EmptyTitle>
              <EmptyDescription>{t.emptyBody}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button nativeButton={false} render={<Link href="/dashboard/clients/new" />}>
                <Plus data-icon="inline-start" />
                {t.addFirst}
              </Button>
            </EmptyContent>
          </Empty>
        </Card>
      ) : (
        <ClientList sections={sections} extras={extras} />
      )}
    </div>
  );
}
