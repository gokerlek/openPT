'use client';

import { useRef } from 'react';
import { CaretRight, WarningCircle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { fetchJson } from '@/lib/query/errors';
import { useServiceQuery } from '@/lib/query/use-service';
import { optionText } from '@/lib/workout-flow';
import type { AlternativesResponse, SwapOption } from '@/lib/workout-routes';

export type SwapTarget = {
  dayId: string;
  /** Planın programı (`op_…` ya da `pt`): muadiller o programın geçmişiyle planlanır. */
  program: string;
  rowId: string;
  /** Şu anki hareket (muadil seçildiyse muadil). */
  title: string;
  /** Muadil seçildiyse asıl hareketin adı: listenin başında "Asıl hareket". */
  original: string | null;
};

function OptionButton({ title, text, care, busy, onPick }: { title: string; text: string; care?: string | undefined; busy?: boolean; onPick: () => void }) {
  return (
    <Item
      size="sm"
      className="min-h-14 flex-nowrap rounded-none border-0 border-t border-border px-0 text-left first:border-t-0 hover:bg-muted"
      render={<button type="button" aria-label={`${title} yap${care ? ` · ${care}` : ''}`} onClick={onPick} disabled={busy} />}>
      <ItemContent className="min-w-0">
        <ItemTitle className="w-full truncate text-[0.9375rem]">{title}</ItemTitle>
        {text ? <ItemDescription className="truncate text-[0.8125rem] tabular-nums">{text}</ItemDescription> : null}
        {/* Danışanın kısıtında dikkat (tasarım `kisit-tarama.md` §3.4): "Sol diz için dikkatli". */}
        {care ? <ItemDescription className="truncate text-[0.8125rem] text-primary-text">{care}</ItemDescription> : null}
      </ItemContent>
      <ItemActions className="text-muted-foreground">{busy ? <Spinner /> : <CaretRight weight="bold" className="size-4" />}</ItemActions>
    </Item>
  );
}

/**
 * "Muadil seç" (odakta ⋯; kısıt notunda "Değiştir"; tasarım §2.6): "<Hareket> yerine" muadiller, ekipmana göre gruplu
 * (vücut ağırlığı önce); her biri kendi geçmişiyle planlı ("30 kg ile başla"). Muadil seçildiyse en üstte asıl hareket.
 * Liste sunucudan gelir (bağlantı yoksa söylenir, "Tekrar dene").
 */
export function SwapSheet({
  target,
  onClose,
  onPick,
}: {
  target: SwapTarget | null;
  onClose: () => void;
  /** `null`: asıl harekete dön. */
  onPick: (option: SwapOption | null) => void;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  const query = useServiceQuery<AlternativesResponse>({
    key: ['me', 'workout', 'alternatives', target?.program, target?.dayId, target?.rowId],
    fn: ({ signal }) =>
      fetchJson(
        `/api/me/workout/alternatives?day=${encodeURIComponent(target?.dayId ?? '')}&row=${encodeURIComponent(target?.rowId ?? '')}&program=${encodeURIComponent(target?.program ?? 'pt')}`,
        { signal },
      ),
    enabled: target !== null,
    notify: 'none',
    staleTime: 5 * 60_000,
  });
  const groups = query.data?.groups ?? [];
  return (
    <Drawer open={target !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DrawerContent showCloseButton={false} className="gap-0" initialFocus={title}>
        <DrawerHeader className="gap-1 pt-5 pb-2">
          <DrawerTitle ref={title} tabIndex={-1} className="truncate text-lg font-semibold outline-none">
            {target?.title} yerine
          </DrawerTitle>
          <DrawerDescription>
            Aynı kaslar, ekipmana göre. {query.data?.careNote ?? 'Geçmişin yoksa rahat bir ağırlıkla başlarsın.'}
          </DrawerDescription>
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
          {target?.original ? (
            <section aria-label="Asıl hareket">
              <p className="pt-2 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Asıl hareket</p>
              <OptionButton title={target.original} text="Programındaki hareket" onPick={() => onPick(null)} />
            </section>
          ) : null}
          {query.isPending && target ? (
            <div className="flex flex-col gap-3 pt-3" aria-busy="true">
              <span role="status" className="sr-only">
                Muadiller yükleniyor…
              </span>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : query.isError ? (
            <div role="alert" className="flex flex-col items-start gap-2 pt-3 text-sm">
              <p className="flex items-center gap-2 text-destructive-text">
                <WarningCircle weight="fill" className="size-4.5 shrink-0" />
                {query.error.status === 0 ? 'Bağlantı yok; muadiller açılamadı.' : query.error.message}
              </p>
              <Button variant="outline" className="h-11" onClick={() => void query.refetch()}>
                Tekrar dene
              </Button>
            </div>
          ) : groups.length === 0 && query.data ? (
            <Empty className="border-0 p-4">
              <EmptyHeader>
                <EmptyTitle>Muadil bulunamadı</EmptyTitle>
                <EmptyDescription>Alet doluysa ⋯ menüsünden hareketi atlayabilirsin.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            groups.map((group) => (
              <section key={group.equipment} aria-label={group.label}>
                <p className="pt-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{group.label}</p>
                {group.options.map((option) => (
                  <OptionButton key={option.exerciseId} title={option.title} text={optionText(option.extra)} care={option.care} onPick={() => onPick(option)} />
                ))}
              </section>
            ))
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
