import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SectionHeader } from '@/components/section-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ptClientsMessages } from '@/i18n/messages/pt-clients';
import { getLocale } from '@/i18n/server';
import { readClient, readInvite } from '@/lib/clients';
import { inviteStatus } from '@/lib/client-status';
import { readAppConfig } from '@/lib/config';
import { CLIENT_ID_PATTERN } from '@/lib/schemas/client';
import { AccessBadge, accessDetail, accessOf, passwordOf } from '../../invite-state';
import { InvitePanel } from './invite-panel';
import { requirePt } from '@/lib/guards';

export async function generateMetadata(): Promise<Metadata> {
  return { title: ptClientsMessages(await getLocale()).invite.title };
}

/**
 * Davet ekranı (SPEC §5): solda kare kod, sağda durum ve adımlar. Danışan ilk kez kare kodla
 * girer, şifre belirler ve uygulamayı ana ekrana ekler (tasarım Paket A), sonra şifresiyle girer; şifresini
 * unutursa PT yeni kare kod üretir (tek sıfırlama yolu). "Nasıl katılır" PT'nin danışana söyleyeceği sırayı
 * verir. Kod ancak "üret" denince oluşur — sayfayı açmak eski kodu geçersiz kılmaz.
 */
export default async function InvitePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePt();
  const { id } = await params;
  if (!CLIENT_ID_PATTERN.test(id)) notFound();
  const [stored, invite, config, locale] = await Promise.all([readClient(id), readInvite(id), readAppConfig(), getLocale()]);
  if (!stored) notFound();
  const t = ptClientsMessages(locale).invite;
  const { client } = stored;
  const access = accessOf(client, invite?.invite ?? null);
  const archived = client.status === 'archived';

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        back={{ href: `/dashboard/clients/${id}`, label: t.back }}
        title={t.title}
        description={t.description(client.name)}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {archived ? (
          <Card>
            <CardHeader>
              <CardTitle>{t.archivedTitle}</CardTitle>
              <CardDescription>{t.archivedBody}</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <InvitePanel
            clientId={id}
            clientName={client.name}
            hasPending={inviteStatus(invite?.invite ?? null, new Date()) === 'pending'}
            joined={access === 'joined'}
            timeZone={config.timeZone}
          />
        )}

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t.stateTitle}</CardTitle>
              <CardDescription>{accessDetail(client, invite?.invite ?? null, config.timeZone, new Date(), locale)}</CardDescription>
              <div>
                <AccessBadge state={access} password={passwordOf(client)} locale={locale} />
              </div>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t.howTitle}</CardTitle>
              <CardDescription>{t.howSummary}</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
                {t.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
                <li>
                  {t.lastStep.before}
                  <Badge variant="outline">{t.lastStep.badge}</Badge>
                  {t.lastStep.after}
                </li>
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
