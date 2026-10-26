import Link from 'next/link';
import { CheckCircle, WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { CoachButton } from '@/components/coach/coach-button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { attentionGroups } from '@/lib/attention';
import { formatNumber } from '@/lib/format';
import { AttentionRow } from './attention-row';
import { clientOverviews } from './client-overviews';

/** Dokunmatik ekranda en az 44 px yükseklikte metin bağlantısı. */
const TOUCH_LINK = 'underline-offset-4 hover:underline touch:inline-flex touch:min-h-11 touch:items-center';

/**
 * Genel bakış'ın "Dikkat gerektirenler"i (tasarım §2.11, §8 satır 12; SPEC §6): danışan başına kaçan antrenman
 * günü, ilerlemeyen hareket, süresi dolan evre, bekleyen öneriler, ölçümde gerileme ve kullanılmamış davet.
 * Danışana göre gruplu (`attentionGroups`): en acil maddesi olan danışan üstte, her grupta en acil birkaç madde;
 * başlık danışana, her madde danışanın ilgili sekmesine götürür. Başlıktaki sayı maddesi olan danışan sayısı.
 *
 * Maliyet: "Bildirimler"le aynı danışan özetlerinden (`client-overviews.ts`; önbellekli, danışanın yazımlarında
 * düşer); sayfa açılışında danışan başına GitHub okuması yok. Hareket adları sayfanın zaten okuduğu kütüphaneden
 * (`titles`). Zamana bağlı kararlar (kaçan gün, evrenin bitişi) her açılışta şimdiye göre verilir.
 */
export async function AttentionCard({ timeZone, titles }: { timeZone: string; titles: ReadonlyMap<string, string> }) {
  const { overviews, failed } = await clientOverviews();
  // AI koç açık danışanlar (özetten): grubun başlığında "AI'ya sor". `attentionGroups` saf kalsın diye ayrı.
  const coach = new Set(overviews.filter((overview) => overview.coach).map((overview) => overview.id));
  const { groups, total, hidden } = attentionGroups(
    overviews.map((overview) => ({ id: overview.id, name: overview.name, facts: overview.attention })),
    { now: new Date(), timeZone, titleOf: (exerciseId) => titles.get(exerciseId) ?? exerciseId },
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Dikkat gerektirenler
          {total > 0 ? (
            <Badge variant="secondary" className="tabular-nums">
              {formatNumber(total)}
              <span className="sr-only"> danışan</span>
            </Badge>
          ) : null}
        </CardTitle>
        <CardDescription>
          En acil danışan üstte; kırmızı ünlem sağlık güvenliği.
          {failed > 0 ? ` ${formatNumber(failed)} danışanın kaydı okunamadı.` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {groups.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CheckCircle weight="fill" />
              </EmptyMedia>
              <EmptyTitle>Şu an dikkat gerektiren bir şey yok</EmptyTitle>
              <EmptyDescription>
                Danışan antrenman gününü kaçırdığında, bir hareket ilerlemediğinde ya da bir karar beklediğinde burada görünür.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul role="list" className="flex flex-col divide-y">
            {groups.map((group) => (
              <li key={group.clientId} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-1.5 px-3">
                  <Link href={`/dashboard/clients/${group.clientId}`} className={`font-medium ${TOUCH_LINK}`}>
                    {group.clientName}
                  </Link>
                  {group.urgent ? (
                    // Sağlık güvenliği maddesi var: renk tek başına bilgi taşımaz, ekran okuyucu "Acil" duyar.
                    <>
                      <WarningCircle weight="fill" aria-hidden className="size-4 shrink-0 text-destructive" />
                      <span className="sr-only">Acil</span>
                    </>
                  ) : null}
                  {/* Grubun düğmeleri: AI koç açıksa "AI'ya sor" (paneli bu danışanla açar, hemen değerlendirir). */}
                  <div className="ms-auto flex items-center gap-1">
                    {coach.has(group.clientId) ? (
                      <CoachButton
                        variant="ghost"
                        size="sm"
                        label="AI'ya sor"
                        srLabel={`: ${group.clientName}`}
                        detail={{ clientId: group.clientId, autoReview: true }}
                        className="touch:h-11"
                      />
                    ) : null}
                  </div>
                </div>
                <ul role="list" className="flex flex-col gap-1">
                  {group.items.map((item) => (
                    <li key={item.key}>
                      <AttentionRow clientId={group.clientId} item={{ ...item, clientName: group.clientName }} showClient={false} />
                    </li>
                  ))}
                </ul>
                {group.more > 0 ? (
                  <Link href={`/dashboard/clients/${group.clientId}`} className={`w-fit px-3 text-sm text-muted-foreground ${TOUCH_LINK}`}>
                    +{formatNumber(group.more)} madde daha
                    <span className="sr-only">: {group.clientName}</span>
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {hidden > 0 ? (
          <Link href="/dashboard/clients" className={`w-fit px-3 text-sm text-muted-foreground ${TOUCH_LINK}`}>
            +{formatNumber(hidden)} danışan daha
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}
