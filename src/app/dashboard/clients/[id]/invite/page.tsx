import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SectionHeader } from '@/components/section-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { readClient, readInvite } from '@/lib/clients';
import { inviteStatus } from '@/lib/client-status';
import { readAppConfig } from '@/lib/config';
import { CLIENT_ID_PATTERN } from '@/lib/schemas/client';
import { AccessBadge, accessDetail, accessOf, passwordOf } from '../../invite-state';
import { InvitePanel } from './invite-panel';
import { requirePt } from '@/lib/guards';

export const metadata: Metadata = { title: 'Davet' };

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
  const [stored, invite, config] = await Promise.all([readClient(id), readInvite(id), readAppConfig()]);
  if (!stored) notFound();
  const { client } = stored;
  const access = accessOf(client, invite?.invite ?? null);
  const archived = client.status === 'archived';

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        back={{ href: `/dashboard/clients/${id}`, label: 'Genel' }}
        title="Davet"
        description={`${client.name} telefon kamerasıyla kare kodu okutur, şifresini belirler ve uygulamayı ana ekrana ekler; sonra ana ekrandaki simgeden şifresiyle girer. GitHub hesabı gerekmez.`}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {archived ? (
          <Card>
            <CardHeader>
              <CardTitle>Danışan arşivde</CardTitle>
              <CardDescription>Arşivdeki danışana davet üretilemez. Önce durumunu “Aktif” yap.</CardDescription>
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
              <CardTitle>Giriş durumu</CardTitle>
              <CardDescription>{accessDetail(client, invite?.invite ?? null, config.timeZone)}</CardDescription>
              <div>
                <AccessBadge state={access} password={passwordOf(client)} />
              </div>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Nasıl katılır</CardTitle>
              <CardDescription>
                Danışana söylenecek sıra: “Telefon kamerasıyla kodu okut → şifreni belirle → uygulamayı ana ekrana ekle.”
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
                <li>Danışan telefonunun kamerasıyla kare kodu okutur ya da bağlantıyı açar; kod hazır gelir, “Devam”a dokunur.</li>
                <li>Kendine şifre belirler.</li>
                <li>
                  Ekran uygulamayı ana ekrana eklemeyi adım adım gösterir: Android’de “Uygulamayı yükle”, iPhone’da Safari’de
                  Paylaş → Ana Ekrana Ekle → Ekle. Atlarsa Bugün ekranının üstünde yeniden görür.
                </li>
                <li>Sonraki girişleri ana ekrandaki simgeden, şifreyle. Oturumu 30 gün açık kalır; kod bir kez kullanılır.</li>
                <li>
                  Şifresini unutursa PT’ye söyler, PT yeni kare kod üretir. Kod kullanılınca eski şifre geçersiz olur, danışan
                  yeni şifre belirler.
                </li>
                <li>
                  Telefonunu kaybederse danışan düzenlenip <Badge variant="outline">Erişimi kapat</Badge> denir (oturumları ve
                  şifresi geçersiz olur), sonra yeni kare kod üretilir.
                </li>
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
