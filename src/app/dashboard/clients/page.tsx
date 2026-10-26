import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus, UsersThree } from '@phosphor-icons/react/dist/ssr';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { ATTENTION_TUNING, attentionItems, type AttentionFacts } from '@/lib/attention';
import { listClients, readInvite } from '@/lib/clients';
import { readAppConfig } from '@/lib/config';
import { formatDayShort, formatNumber } from '@/lib/format';
import { CLIENT_STATUS_LABELS, CLIENT_STATUSES } from '@/lib/schemas/client';
import { requirePt } from '@/lib/guards';
import { clientOverviews } from '../client-overviews';
import { ClientList, type ClientCardData, type ClientSectionData } from './client-list';
import { clientsSummary, clientWork } from './client-work';
import { passwordOf } from './invite-state';

export const metadata: Metadata = { title: 'Danışanlar' };

/**
 * Danışanlar: durumuna göre gruplu (arşivdekiler en altta), ada göre aranır (`ClientList`). Her satır detaya
 * tek dokunuşla açılır ve PT'nin işini gösterir: giriş durumu (davet yok / bekliyor / süresi doldu; katıldıysa
 * şifre belirledi mi), sağlık onayı bekliyorsa o (`clientWork`), dikkat maddelerinin sayısı ve son antrenman
 * günü. Başlıkta bekleyenlerin sayısı.
 *
 * Dikkat ve son antrenman Genel bakış'la aynı danışan özetlerinden (`client-overviews.ts`; önbellekli,
 * arşivdekiler hariç); özeti okunamayan danışanda yok.
 */
export default async function ClientsPage() {
  await requirePt();
  const [clients, { overviews }, config] = await Promise.all([listClients(), clientOverviews(), readAppConfig()]);
  const invites = new Map(
    await Promise.all(
      clients.map(async (entry) => [entry.id, await readInvite(entry.id).catch(() => null)] as const),
    ),
  );
  const facts = new Map(overviews.map((overview) => [overview.id, overview.attention]));
  const now = new Date();
  // Yalnız sayı gösterilir: maddelerin metnindeki hareket adı gerekmez, kütüphane okunmaz.
  const ctx = { now, timeZone: config.timeZone, titleOf: (exerciseId: string) => exerciseId };

  const rows = clients.map((entry) => ({
    entry,
    work: entry.ok ? clientWork(entry.client, invites.get(entry.id)?.invite ?? null, now) : null,
  }));
  const summary = clientsSummary(rows.map(({ entry, work }) => ({ status: entry.status, work })));

  const cards = rows.map(({ entry, work }): ClientCardData => {
    const attention = entry.ok && entry.status !== 'archived' ? (facts.get(entry.id) ?? null) : null;
    const items = attention ? attentionItems(attention, ctx) : [];
    return {
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
      attention: attention ? { count: items.length, urgent: items.some((item) => item.tone === 'danger') } : null,
      lastWorkout: attention ? lastWorkoutText(attention, entry.status === 'active') : null,
    };
  });
  const sections = CLIENT_STATUSES.flatMap((status): ClientSectionData[] => {
    const group = cards.filter((card) => card.status === status);
    return group.length > 0 ? [{ status, label: CLIENT_STATUS_LABELS[status], cards: group }] : [];
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Danışanlar"
        description={<span className="tabular-nums">{summary}.</span>}
        actions={
          <Button nativeButton={false} render={<Link href="/dashboard/clients/new" />}>
            <Plus data-icon="inline-start" weight="fill" />
            Yeni danışan
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
              <EmptyTitle>Henüz danışan yok</EmptyTitle>
              <EmptyDescription>
                Danışanı ekle, sonra kare kodla davet et; programını ve ölçümlerini buradan yönetirsin.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button nativeButton={false} render={<Link href="/dashboard/clients/new" />}>
                <Plus data-icon="inline-start" weight="fill" />
                İlk danışanı ekle
              </Button>
            </EmptyContent>
          </Empty>
        </Card>
      ) : (
        <ClientList sections={sections} />
      )}
    </div>
  );
}

/**
 * Son antrenman günü (özetteki son 35 gün): "Son antrenman 23 Eki". O günlerde antrenman yoksa yalnız aktif
 * danışanda söylenir (duraklatılmışta beklenen bir şey değil).
 */
function lastWorkoutText(facts: AttentionFacts, active: boolean): string | null {
  // Özet günleri sıralı tutar; yine de en büyüğü alınır.
  const last = facts.sessionDays.reduce<string | null>((latest, day) => (latest === null || day > latest ? day : latest), null);
  if (last) return `Son antrenman ${formatDayShort(last)}`;
  return active ? `Son ${formatNumber(ATTENTION_TUNING.sessionDaysKept)} günde antrenman yok` : null;
}
