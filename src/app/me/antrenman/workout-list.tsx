'use client';

import { FlagCheckered, Play } from '@phosphor-icons/react';
import { Plus } from '@/components/line-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { UNIT_STATE_TEXT, UnitStateIcon } from '@/components/workout/unit-state';
import { formatKg } from '@/lib/format';
import { cn } from '@/lib/utils';
import { itemName, type ListItem, type ListView } from '@/lib/workout-flow';

/** Listede "şu an" satırının ve başlığın kimliği: kip değişince klavye odağı buraya taşınır (`workout-screen.tsx`). */
export const LIST_CURRENT_ID = 'list-current';
export const LIST_TITLE_ID = 'list-title';

/** Satırın ağırlığı: bugün kaydedilen son set "40 kg", geçen antrenmandan "Geçen: 40 kg"; ağırlıksız (süreli) hareket yok. */
function weightText(item: ListItem): string | null {
  if (item.lastKg === null) return null;
  return item.lastFrom === 'last' ? `Geçen: ${formatKg(item.lastKg)}` : formatKg(item.lastKg);
}

function ListRow({
  item,
  highlight,
  onOpen,
  onRestore,
}: {
  item: ListItem;
  highlight: boolean;
  onOpen: (key: string) => void;
  onRestore: (key: string) => void;
}) {
  const current = item.state === 'current';
  const muted = item.state === 'done' || item.state === 'skipped';
  const weight = weightText(item);
  return (
    <li
      className={cn(
        'flex items-center gap-2 rounded-lg border-t transition-colors duration-300 first:border-t-0',
        (current || highlight) && 'border-transparent bg-primary/10 [&+li]:border-t-transparent',
      )}>
      <button
        type="button"
        id={current ? LIST_CURRENT_ID : undefined}
        aria-current={current ? 'step' : undefined}
        onClick={() => onOpen(item.key)}
        className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-lg py-2 pr-2 pl-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <UnitStateIcon state={item.state} />
        <span className={cn('flex min-w-0 flex-1 flex-col items-start gap-1', muted && 'text-muted-foreground')}>
          <span className="sr-only">{UNIT_STATE_TEXT[item.state]}: </span>
          {item.kindLabel ? <Badge className="bg-primary/15 text-primary">{item.kindLabel}</Badge> : null}
          {item.members.map((member) => (
            <span key={member.rowId} className="flex w-full min-w-0 items-baseline gap-2">
              <span className="w-6 shrink-0 text-sm text-muted-foreground tabular-nums">{member.number}</span>
              <span className={cn('min-w-0 break-words', current && 'font-semibold')}>{member.title}</span>
            </span>
          ))}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5 text-[0.8125rem] text-muted-foreground tabular-nums">
          <span className={cn(current && 'font-medium text-foreground')}>
            {item.done}/{item.planned} set
          </span>
          {weight ? <span>{weight}</span> : null}
        </span>
      </button>
      {item.state === 'skipped' ? (
        <Button variant="secondary" className="h-11 shrink-0 px-3.5" aria-label={`${itemName(item)}: geri al`} onClick={() => onRestore(item.key)}>
          Geri al
        </Button>
      ) : null}
    </li>
  );
}

/**
 * Antrenmanın listesi (Faz 2: liste ana ekran; tasarım `antrenman-ekrani.md`): yapılış sırasında her birim bir satır,
 * satırın bütünü düğme (`min-h-14`) ve o hareketin odağını açar; biten hareket de açılır (setleri düzeltmek için),
 * atlanan önce geri alınır. Satırda durum ikonu (✓ ▶ ○ ⤼, Bugün'ün "Devam et" kartıyla aynı; durum sözcüğü ekran
 * okuyucuya), numara ve ad (grupta tür rozeti, üyeler alt alta "3a/3b"), sağda "2/4 set" ve son ağırlık. Atlanan
 * satırda ayrıca "Geri al" (sıranın sonuna döner). Altta "Hareket ekle". Sıra burada kendiliğinden değişmez;
 * "Sırayı değiştir" kipi 7. görevde başlığın sağına gelir.
 */
export function WorkoutList({
  view,
  highlight,
  onOpen,
  onRestore,
  onAdd,
}: {
  view: ListView;
  /** Az önce geri alınan ya da geçilen birim: satır bir an vurgulu (`DRAG.highlightMs`). */
  highlight: string | null;
  /** Satıra dokunmak: hareket odakta açılır (atlanan önce geri alınır), sıra yazılmaz. */
  onOpen: (key: string) => void;
  /** Atlanan satırda "Geri al". */
  onRestore: (key: string) => void;
  onAdd: () => void;
}) {
  return (
    <section aria-labelledby={LIST_TITLE_ID} className="flex flex-col gap-1">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <h2 id={LIST_TITLE_ID} tabIndex={-1} className="font-heading text-base font-semibold outline-none">
          Hareketler
        </h2>
      </div>
      <ol className="flex flex-col">
        {view.items.map((item) => (
          <ListRow key={item.key} item={item} highlight={item.key === highlight} onOpen={onOpen} onRestore={onRestore} />
        ))}
      </ol>
      <Button variant="ghost" size="lg" className="mt-2 h-12 w-full" onClick={onAdd}>
        <Plus data-icon="inline-start" weight="bold" />
        Hareket ekle
      </Button>
    </section>
  );
}

/**
 * Listenin alt çubuğu (birincil iş): "Başla: <ad>" (henüz set yok), "Devam et: <ad>" (`listView().current`: yarım
 * bırakılan ya da sırada planı bitmemiş ilk hareket) ya da hepsi bittiyse "Antrenmanı bitir" (bitiş sheet'i).
 * Dinlenme sürüyorsa çubuğun üstünde `RestStrip` (ekran çizer).
 */
export function WorkoutListBar({ view, onOpen, onFinish }: { view: ListView; onOpen: (key: string) => void; onFinish: () => void }) {
  const current = view.current ? view.items.find((item) => item.key === view.current) : undefined;
  if (view.allDone || !current) {
    return (
      <Button size="lg" className="h-14 w-full text-base" onClick={onFinish}>
        <FlagCheckered data-icon="inline-start" weight="fill" />
        Antrenmanı bitir
      </Button>
    );
  }
  return (
    <Button size="lg" className="h-14 w-full text-base" onClick={() => onOpen(current.key)}>
      <Play data-icon="inline-start" weight="fill" />
      <span className="min-w-0 truncate">
        {view.doneSets > 0 ? 'Devam et' : 'Başla'}: {itemName(current)}
      </span>
    </Button>
  );
}
