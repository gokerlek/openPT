'use client';

import { Suspense, use, useState } from 'react';
import Link from 'next/link';
import { CaretRight, MagnifyingGlass, UserCircle, WarningCircle } from '@phosphor-icons/react';
import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Skeleton } from '@/components/ui/skeleton';
import type { CardExtras } from '@/lib/client-card-extras';
import type { AccessState, passwordState } from '@/lib/client-status';
import { formatNumber } from '@/lib/format';
import { matchesName } from '@/lib/name-search';
import type { ClientStatus } from '@/lib/schemas/client';
import type { HealthWork } from './client-work';
import { AccessBadge } from './invite-state';
import { StatusDot } from './status-dot';

/** Listedeki bir danışan kartı: sayfada (sunucuda) hazırlanır, yalnız düz veri. */
export type ClientCardData = {
  id: string;
  /** Kaydı okunamayan danışanda kimliği. */
  name: string;
  status: ClientStatus;
  ok: boolean;
  /** PT'nin notu (okunan kayıtta). */
  note: string | null;
  /** Kaydın neden okunamadığı. */
  problem: string | null;
  /** Giriş ve sağlık onayı rozetleri (okunan kayıtta). */
  work: { access: AccessState; password: ReturnType<typeof passwordState>; health: HealthWork | null } | null;
};

export type ClientSectionData = { status: ClientStatus; label: string; cards: ClientCardData[] };

const HEALTH_VARIANT: Record<HealthWork['tone'], 'outline' | 'secondary'> = { waiting: 'outline', info: 'secondary' };

/**
 * Danışanlar listesi, ada göre aramayla (`matchesName`: Türkçe harfler katlanır). Bölümler durumuna göre
 * (arşivdekiler en altta); aramadan sonra boş kalan bölüm başlığıyla gizlenir. Liste hiç beklemez: dikkat ve
 * son antrenman (`extras`) her kartın altında kendi `Suspense`'inde gelir, arama durumu korunur.
 */
export function ClientList({ sections, extras }: { sections: ClientSectionData[]; extras: Promise<Record<string, CardExtras>> }) {
  const [query, setQuery] = useState('');
  const visible = sections
    .map((section) => ({ ...section, cards: section.cards.filter((card) => matchesName(card.name, query)) }))
    .filter((section) => section.cards.length > 0);
  const matches = visible.reduce((sum, section) => sum + section.cards.length, 0);
  const searching = query.trim() !== '';

  return (
    <>
      <div role="search" className="sm:max-w-sm">
        <InputGroup>
          <InputGroupAddon>
            <MagnifyingGlass />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Danışan ara"
            aria-label="Danışan ara"
          />
        </InputGroup>
      </div>
      {/* Ekran okuyucu için sonuç sayısı; görünür liste zaten değişiyor. */}
      <p role="status" className="sr-only">
        {searching ? (matches > 0 ? `${formatNumber(matches)} danışan` : 'Eşleşen danışan yok') : ''}
      </p>

      {visible.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MagnifyingGlass />
            </EmptyMedia>
            <EmptyTitle>“{query.trim()}” ile eşleşen danışan yok</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : null}

      {visible.map((section) => (
        <section key={section.status} className="flex flex-col gap-3" aria-label={section.label}>
          <h2 className="text-sm font-medium text-muted-foreground">{section.label}</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {section.cards.map((card) => (
              <li key={card.id}>
                <ClientCard card={card} extras={extras} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function ClientCard({ card, extras }: { card: ClientCardData; extras: Promise<Record<string, CardExtras>> }) {
  const { work } = card;
  return (
    <Link
      href={`/dashboard/clients/${card.id}`}
      className="block h-full rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <Card size="sm" className="h-full min-h-11 transition-colors hover:bg-muted/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {card.ok ? (
              <UserCircle className="size-5 shrink-0 text-muted-foreground" weight="fill" />
            ) : (
              <WarningCircle className="size-5 shrink-0 text-destructive" weight="fill" />
            )}
            <span className="truncate">{card.name}</span>
            <StatusDot status={card.status} />
          </CardTitle>
          {card.problem ? (
            <CardDescription>{card.problem}</CardDescription>
          ) : card.note ? (
            <CardDescription className="line-clamp-2">{card.note}</CardDescription>
          ) : null}
          <CardAction>
            <CaretRight aria-hidden className="size-4 text-muted-foreground" />
          </CardAction>
        </CardHeader>
        {work ? (
          <CardFooter className="flex flex-wrap items-center gap-1.5">
            <AccessBadge state={work.access} password={work.password} />
            {work.health ? <Badge variant={HEALTH_VARIANT[work.health.tone]}>{work.health.label}</Badge> : null}
            <Suspense fallback={<Skeleton aria-hidden className="h-5 w-14 rounded-4xl" />}>
              <CardExtrasView extras={extras} id={card.id} />
            </Suspense>
          </CardFooter>
        ) : null}
      </Card>
    </Link>
  );
}

/** Kartın altındaki dikkat rozeti ve son antrenman; özet gelene kadar yerinde iskelet. */
function CardExtrasView({ extras, id }: { extras: Promise<Record<string, CardExtras>>; id: string }) {
  const extra = use(extras)[id];
  if (!extra) return null;
  const { attention, lastWorkout } = extra;
  return (
    <>
      {attention.count > 0 ? (
        <Badge variant="outline" className="tabular-nums">
          {attention.urgent ? (
            // Sağlık güvenliği maddesi var: renk tek başına bilgi taşımaz, ekran okuyucu "Acil" duyar.
            <>
              <WarningCircle data-icon="inline-start" weight="fill" aria-hidden className="text-destructive" />
              <span className="sr-only">Acil: </span>
            </>
          ) : null}
          {formatNumber(attention.count)} dikkat
        </Badge>
      ) : null}
      {lastWorkout ? <span className="text-xs text-muted-foreground tabular-nums">{lastWorkout}</span> : null}
    </>
  );
}
