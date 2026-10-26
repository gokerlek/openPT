'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CaretRight, MagnifyingGlass, UserCircle, WarningCircle } from '@phosphor-icons/react';
import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
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
  /** Dikkat maddelerinin sayısı; `urgent`: sağlık güvenliği maddesi var. Arşivdeki ya da özeti okunamayan danışanda yok. */
  attention: { count: number; urgent: boolean } | null;
  /** "Son antrenman 23 Eki" ya da "Son 35 günde antrenman yok"; özet yoksa yok. */
  lastWorkout: string | null;
};

export type ClientSectionData = { status: ClientStatus; label: string; cards: ClientCardData[] };

const HEALTH_VARIANT: Record<HealthWork['tone'], 'outline' | 'secondary'> = { waiting: 'outline', info: 'secondary' };

/**
 * Danışanlar listesi, ada göre aramayla (`matchesName`: Türkçe harfler katlanır). Bölümler durumuna göre
 * (arşivdekiler en altta); aramadan sonra boş kalan bölüm başlığıyla gizlenir.
 */
export function ClientList({ sections }: { sections: ClientSectionData[] }) {
  const [query, setQuery] = useState('');
  const visible = sections
    .map((section) => ({ ...section, cards: section.cards.filter((card) => matchesName(card.name, query)) }))
    .filter((section) => section.cards.length > 0);
  const matches = visible.reduce((sum, section) => sum + section.cards.length, 0);
  const searching = query.trim() !== '';

  return (
    <>
      <InputGroup className="sm:max-w-sm">
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
      {/* Ekran okuyucu için sonuç sayısı; görünür liste zaten değişiyor. */}
      <p className="sr-only" aria-live="polite">
        {searching ? `${formatNumber(matches)} danışan` : ''}
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
                <ClientCard card={card} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function ClientCard({ card }: { card: ClientCardData }) {
  const { work, attention } = card;
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
            {attention && attention.count > 0 ? (
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
            {card.lastWorkout ? <span className="text-xs text-muted-foreground tabular-nums">{card.lastWorkout}</span> : null}
          </CardFooter>
        ) : null}
      </Card>
    </Link>
  );
}
