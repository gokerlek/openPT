import Link from 'next/link';
import { Bandaids, CalendarX, ChatCircleText, Flag, PersonSimpleTaiChi, QrCode, Ruler, TrendDown, WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { Badge } from '@/components/ui/badge';
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item';
import { ATTENTION_LABELS, type AttentionItem, type AttentionKind, type AttentionTarget } from '@/lib/attention';

const ICONS: Record<AttentionKind, typeof CalendarX> = {
  constraint: Bandaids,
  missed: CalendarX,
  screening: PersonSimpleTaiChi,
  stalled: TrendDown,
  phase: Flag,
  proposals: ChatCircleText,
  measurement: Ruler,
  invite: QrCode,
};

/** Maddenin götürdüğü yer: danışanın ilgili sekmesi. */
export const TARGET_PATHS: Record<AttentionTarget, string> = {
  client: '',
  sessions: '/sessions',
  program: '/program',
  measurements: '/measurements',
  constraints: '/constraints',
  screening: '/screening',
  invite: '/invite',
};

/**
 * "Dikkat gerektirenler"in tek maddesi: türün ikonu ve rozeti, metin; satır danışanın ilgili sekmesine götürür.
 * `showClient` açıkken (ve madde `clientName` taşıyorsa) rozetin önünde danışanın adı yazılır; danışana göre
 * gruplu listede ya da danışanın kendi sayfasında ad zaten yukarıda olduğundan kapatılır.
 */
export function AttentionRow({
  clientId,
  item,
  showClient = true,
}: {
  clientId: string;
  item: AttentionItem & { clientName?: string };
  showClient?: boolean;
}) {
  const ItemIcon = ICONS[item.kind];
  return (
    <Item size="sm" render={<Link href={`/dashboard/clients/${clientId}${TARGET_PATHS[item.target]}`} />} className="touch:min-h-11">
      <ItemMedia variant="icon">
        <ItemIcon weight="fill" className="text-muted-foreground" aria-hidden />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="line-clamp-none flex-wrap gap-1.5">
          {showClient ? item.clientName : null}
          <Badge variant="outline">{ATTENTION_LABELS[item.kind]}</Badge>
        </ItemTitle>
        {item.tone === 'danger' ? (
          // Sağlık güvenliği (kırmızı bayrak, danışanın "şiddetli"si): renk tek başına bilgi taşımaz, ekran okuyucu "Acil" duyar.
          <ItemDescription className="text-foreground">
            <WarningCircle weight="fill" aria-hidden className="mr-1 inline size-4 align-[-0.1875rem] text-destructive" />
            <span className="sr-only">Acil: </span>
            {item.text}
          </ItemDescription>
        ) : (
          <ItemDescription>{item.text}</ItemDescription>
        )}
      </ItemContent>
    </Item>
  );
}
