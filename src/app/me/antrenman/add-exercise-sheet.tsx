'use client';

import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { MagnifyingGlass, WarningCircle } from '@phosphor-icons/react';
import { Plus } from '@/components/line-icons';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { searchExercises } from '@/lib/exercise-search';
import { familyOf, summarizeMuscles } from '@/lib/muscles';
import { fetchJson } from '@/lib/query/errors';
import { useServiceQuery } from '@/lib/query/use-service';
import { EQUIPMENT_LABELS, MUSCLE_GROUPS, MUSCLE_LABELS, type Equipment, type Muscle } from '@/lib/schemas/exercise';
import type { LibraryItem, LibraryResponse } from '@/lib/workout-routes';

/** Kütüphanede en çok bu kadar sonuç; gerisi için arama daraltılır. */
const RESULT_LIMIT = 50;

const GROUP_OF = new Map<string, string>(MUSCLE_GROUPS.flatMap((group) => group.muscles.map((muscle) => [muscle, group.label] as const)));

/** Aramada bir kasın adları: kendi adı, ailesi ("Kanat"), bölgesi ("Sırt"). */
function muscleNames(muscle: string): string[] {
  const family = familyOf(muscle);
  const names = [MUSCLE_LABELS[muscle as Muscle] ?? muscle, family === muscle ? '' : family, GROUP_OF.get(muscle) ?? ''];
  return [...new Set(names.filter(Boolean))];
}

/**
 * "Hareket ekle" (tasarım §2.6): kütüphaneden ada ya da kasa göre arama; seçilen hareket yalnız bu
 * antrenmana eklenir (bitişte antrenörüne öneri olabilir). Bugün zaten yapılanlar listede "bugün var"
 * der. Seçince planı sunucudan gelir (kendi geçmişiyle); o sırada satırda bekleme işareti.
 */
export function AddExerciseSheet({
  open,
  onOpenChange,
  todayIds,
  busyId,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Bugünün hareketleri. */
  todayIds: ReadonlySet<string>;
  /** Planı yüklenen hareket. */
  busyId: string | null;
  onPick: (item: LibraryItem) => void;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  const [search, setSearch] = useState('');
  const deferred = useDeferredValue(search);
  const query = useServiceQuery<LibraryResponse>({
    key: ['me', 'workout', 'library'],
    fn: ({ signal }) => fetchJson('/api/me/workout/exercises', { signal }),
    enabled: open,
    notify: 'none',
    staleTime: 10 * 60_000,
  });
  const results = useMemo(() => searchExercises(query.data?.exercises ?? [], deferred, muscleNames).slice(0, RESULT_LIMIT), [query.data, deferred]);
  return (
    <Drawer open={open} onOpenChange={onOpenChange} onOpenChangeComplete={(next) => (next ? undefined : setSearch(''))}>
      <DrawerContent showCloseButton={false} className="h-[calc(100dvh-max(1rem,env(safe-area-inset-top)))] gap-0" initialFocus={title}>
        <DrawerHeader className="gap-1 pt-5 pb-3">
          <DrawerTitle ref={title} tabIndex={-1} className="text-lg font-semibold outline-none">
            Hareket ekle
          </DrawerTitle>
          <DrawerDescription>Yalnız bu antrenmana eklenir; bitişte antrenörüne önerebilirsin.</DrawerDescription>
          <InputGroup className="mt-2 h-11">
            <InputGroupAddon>
              <MagnifyingGlass />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              className="h-11 text-base"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.preventDefault();
              }}
              placeholder="Hareket ya da kas ara"
              aria-label="Hareket ya da kas ara"
              autoComplete="off"
              enterKeyHint="search"
            />
          </InputGroup>
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
          {query.isPending ? (
            <div className="flex flex-col gap-2" aria-busy="true">
              <span role="status" className="sr-only">
                Kütüphane yükleniyor…
              </span>
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : query.isError ? (
            <div role="alert" className="flex flex-col items-start gap-2 text-sm">
              <p className="flex items-center gap-2 text-destructive-text">
                <WarningCircle weight="fill" className="size-4.5 shrink-0" />
                {query.error.status === 0 ? 'Bağlantı yok; kütüphane açılamadı.' : query.error.message}
              </p>
              <Button variant="outline" className="h-11" onClick={() => void query.refetch()}>
                Tekrar dene
              </Button>
            </div>
          ) : results.length === 0 ? (
            <Empty className="border-0 p-4">
              <EmptyHeader>
                <EmptyTitle>Sonuç yok</EmptyTitle>
                <EmptyDescription>Başka bir ad ya da kas dene.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div role="list" aria-label="Hareketler">
              {results.map((item) => {
                const muscles = summarizeMuscles(item.primaryMuscles as Muscle[]).join(', ');
                const equipment = EQUIPMENT_LABELS[item.equipment as Equipment] ?? item.equipment;
                return (
                  <div role="listitem" key={item.id}>
                    <Item
                      size="sm"
                      className="min-h-14 flex-nowrap rounded-none border-0 border-t border-border px-0 text-left hover:bg-muted"
                      render={<button type="button" aria-label={`${item.title} ekle${item.care ? ` · ${item.care}` : ''}`} disabled={busyId !== null} onClick={() => onPick(item)} />}>
                      <ItemContent className="min-w-0">
                        <ItemTitle className="w-full truncate text-[0.9375rem]">{item.title}</ItemTitle>
                        <ItemDescription className="truncate text-[0.8125rem]">
                          {muscles} · {equipment}
                          {todayIds.has(item.id) ? ' · bugün var' : ''}
                        </ItemDescription>
                        {/* Kısıtta dikkat ("Muadil seç"teki gibi); yasaklılar listede yok. */}
                        {item.care ? <ItemDescription className="truncate text-[0.8125rem] text-primary-text">{item.care}</ItemDescription> : null}
                      </ItemContent>
                      <ItemActions className="text-muted-foreground">{busyId === item.id ? <Spinner /> : <Plus weight="bold" className="size-4" />}</ItemActions>
                    </Item>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
