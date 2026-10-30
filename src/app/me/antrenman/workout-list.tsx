'use client';

import { useState } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useDraggable, useDroppable, useSensor, useSensors, type Announcements, type UniqueIdentifier } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { CaretDown, CaretUp, FlagCheckered, Play } from '@phosphor-icons/react';
import { DotsSixVertical, Plus } from '@/components/line-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { UNIT_STATE_TEXT, UnitStateIcon } from '@/components/workout/unit-state';
import { formatKg } from '@/lib/format';
import { cn } from '@/lib/utils';
import { itemName, type ListItem, type ListView } from '@/lib/workout-flow';

/** Listenin başlığının kimliği: listeye dönünce satır bulunamazsa klavye odağı buraya (`workout-screen.tsx`). */
export const LIST_TITLE_ID = 'list-title';

/** Satırın düğmesinin kimliği: listeye dönünce az önce bırakılan hareketin satırına kaydırılır ve odaklanır. */
export function listRowId(key: string): string {
  return `list-row-${key}`;
}

const moveButtonId = (key: string, direction: -1 | 1) => `${listRowId(key)}-${direction < 0 ? 'up' : 'down'}`;
const handleId = (key: string) => `${listRowId(key)}-drag`;

/** Sırası değişebilen satır: bitmemiş ve atlanmamış (`moveUnit`/`moveUnitTo`'nun kuralı; biten ve atlanan yerinde kalır). */
function movable(item: ListItem): boolean {
  return item.state === 'current' || item.state === 'pending';
}

/** Satırın ağırlığı: bugün kaydedilen son set "40 kg", geçen antrenmandan "Geçen: 40 kg"; ağırlıksız (süreli) hareket yok. */
function weightText(item: ListItem): string | null {
  if (item.lastKg === null) return null;
  return item.lastFrom === 'last' ? `Geçen: ${formatKg(item.lastKg)}` : formatKg(item.lastKg);
}

/** Satırın `li` sınıfı: "şu an" ve az önce değişen satır vurgulu, ardındaki çizgi kalkar. */
function rowClass(item: ListItem, highlight: boolean): string {
  return cn(
    'flex items-center gap-2 rounded-lg border-t transition-colors duration-300 first:border-t-0',
    (item.state === 'current' || highlight) && 'border-transparent bg-primary/10 [&+li]:border-t-transparent',
  );
}

/** Satırın gövdesi: durum ikonu (sözcüğü ekran okuyucuya), numara ve ad; `compact` değilse sağda "2/4 set" ve ağırlık. */
function RowContent({ item, compact }: { item: ListItem; compact: boolean }) {
  const current = item.state === 'current';
  const muted = item.state === 'done' || item.state === 'skipped';
  const weight = weightText(item);
  return (
    <>
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
      {compact ? null : (
        <span className="flex shrink-0 flex-col items-end gap-0.5 text-[0.8125rem] text-muted-foreground tabular-nums">
          <span className={cn(current && 'font-medium text-foreground')}>
            {item.done}/{item.planned} set
          </span>
          {weight ? <span>{weight}</span> : null}
        </span>
      )}
    </>
  );
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
  return (
    <li className={rowClass(item, highlight)}>
      <button
        type="button"
        id={listRowId(item.key)}
        aria-current={item.state === 'current' ? 'step' : undefined}
        onClick={() => onOpen(item.key)}
        className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-lg py-2 pr-2 pl-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <RowContent item={item} compact={false} />
      </button>
      {item.state === 'skipped' ? (
        <Button variant="secondary" className="h-11 shrink-0 px-3.5" aria-label={`${itemName(item)}: geri al`} onClick={() => onRestore(item.key)}>
          Geri al
        </Button>
      ) : null}
    </li>
  );
}

/** "Sırayı değiştir" kipinde biten ya da atlanan satır: taşınmaz, sürüklenen satır üstüne bırakılamaz (hedef değil). */
function FixedRow({ item, highlight }: { item: ListItem; highlight: boolean }) {
  return (
    <li className={rowClass(item, highlight)}>
      {/* Tutamacın yeri: adlar taşınabilen satırlarınkiyle hizada. */}
      <span aria-hidden className="size-11 shrink-0" />
      <div className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 pr-2">
        <RowContent item={item} compact />
      </div>
    </li>
  );
}

/**
 * "Sırayı değiştir" kipinde taşınabilen satır: solda sürükleme tutamacı (dnd-kit; klavyede boşlukla tut, oklarla taşı,
 * ya da Alt + ↑/↓ bir adım), sağda ▲/▼ (44 px; uçta devre dışı ama odakta kalır). Satıra dokunmak odak açmaz.
 */
function ReorderRow({
  item,
  highlight,
  first,
  last,
  onMove,
}: {
  item: ListItem;
  highlight: boolean;
  first: boolean;
  last: boolean;
  onMove: (key: string, direction: -1 | 1, from: 'button' | 'handle') => void;
}) {
  const drag = useDraggable({ id: item.key, attributes: { roleDescription: 'sürüklenebilir' } });
  const drop = useDroppable({ id: item.key });
  const name = itemName(item);
  return (
    <li
      ref={(node) => {
        drag.setNodeRef(node);
        drop.setNodeRef(node);
      }}
      style={{ transform: CSS.Translate.toString(drag.transform), position: 'relative', zIndex: drag.isDragging ? 10 : undefined }}
      className={cn(rowClass(item, highlight), drag.isDragging && 'bg-card shadow-md', drop.isOver && !drag.isDragging && 'ring-2 ring-primary/40')}>
      <button
        type="button"
        id={handleId(item.key)}
        {...drag.attributes}
        {...drag.listeners}
        aria-label={`${name}: sürükle`}
        title="Sürükle ya da Alt + yukarı/aşağı ok"
        onKeyDown={(event) => {
          if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
            event.preventDefault();
            const direction = event.key === 'ArrowUp' ? -1 : 1;
            if (direction < 0 ? !first : !last) onMove(item.key, direction, 'handle');
          } else {
            drag.listeners?.onKeyDown?.(event);
          }
        }}
        className="grid size-11 shrink-0 touch-none place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50">
        <DotsSixVertical className="size-5" />
      </button>
      <div className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2">
        <RowContent item={item} compact />
      </div>
      <span className="flex shrink-0">
        <Button
          variant="ghost"
          id={moveButtonId(item.key, -1)}
          className="size-11 p-0 aria-disabled:opacity-40"
          aria-label={`${name} yukarı`}
          disabled={first}
          focusableWhenDisabled
          onClick={() => onMove(item.key, -1, 'button')}>
          <CaretUp weight="bold" className="size-5" />
        </Button>
        <Button
          variant="ghost"
          id={moveButtonId(item.key, 1)}
          className="size-11 p-0 aria-disabled:opacity-40"
          aria-label={`${name} aşağı`}
          disabled={last}
          focusableWhenDisabled
          onClick={() => onMove(item.key, 1, 'button')}>
          <CaretDown weight="bold" className="size-5" />
        </Button>
      </span>
    </li>
  );
}

/**
 * Taşımadan sonra klavye odağı aynı düğmede kalsın: React aşağı inen satırın düğümünü DOM'da yeniden yerleştirir, odak
 * düşer. Düğme uca geldiyse (devre dışı) öbür yön; tutamaçtan taşındıysa tutamaç.
 */
function refocus(key: string, direction: -1 | 1, from: 'button' | 'handle') {
  window.requestAnimationFrame(() => {
    if (from === 'handle') {
      document.getElementById(handleId(key))?.focus();
      return;
    }
    const preferred = document.getElementById(moveButtonId(key, direction));
    const target = preferred?.getAttribute('aria-disabled') === 'true' ? document.getElementById(moveButtonId(key, direction < 0 ? 1 : -1)) : preferred;
    target?.focus();
  });
}

/**
 * Antrenmanın listesi (Faz 2: liste ana ekran; tasarım `antrenman-ekrani.md`): yapılış sırasında her birim bir satır,
 * satırın bütünü düğme (`min-h-14`) ve o hareketin odağını açar; biten hareket de açılır (setleri düzeltmek için),
 * atlanan önce geri alınır. Satırda durum ikonu (✓ ▶ ○ ⤼, Bugün'ün "Devam et" kartıyla aynı; durum sözcüğü ekran
 * okuyucuya), numara ve ad (grupta tür rozeti, üyeler alt alta "3a/3b"), sağda "2/4 set" ve son ağırlık. Atlanan
 * satırda ayrıca "Geri al" (sıranın sonuna döner). Altta "Hareket ekle". Sıra burada kendiliğinden değişmez.
 *
 * **Sırayı değiştir** (başlığın sağında; en az iki taşınabilen hareket varken): bitmemiş, atlanmamış her satırda ▲/▼
 * (`moveUnit`) ve sürükleme tutamacı (`moveUnitTo`; kısayol). Biten ve atlanan satır yerinde kalır, hedef olmaz.
 * Kipte satıra dokunmak odak açmaz; "Geri al" ve "Hareket ekle" gizlenir. "Bitti" kipi kapatır. Taşıma kendi başına
 * gönderilmez (ekran `commitFlow` ile yazar, sonraki set yazımına biner); canlı bölge yeni yerini söyler
 * ("Plank 3. sırada").
 */
export function WorkoutList({
  view,
  highlight,
  onOpen,
  onRestore,
  onAdd,
  onMove,
  onMoveTo,
  onAnnounce,
}: {
  view: ListView;
  /** Az önce geri alınan, geçilen ya da taşınan birim: satır bir an vurgulu (`DRAG.highlightMs`). */
  highlight: string | null;
  /** Satıra dokunmak: hareket odakta açılır (atlanan önce geri alınır), sıra yazılmaz. */
  onOpen: (key: string) => void;
  /** Atlanan satırda "Geri al". */
  onRestore: (key: string) => void;
  onAdd: () => void;
  /** ▲/▼ ya da Alt + ↑/↓: bir adım. */
  onMove: (key: string, direction: -1 | 1) => void;
  /** Sürükleyip bırakmak: bırakıldığı (taşınabilen) satırın yerine. */
  onMoveTo: (key: string, targetKey: string) => void;
  /** Ekranın tek canlı bölgesi. */
  onAnnounce: (text: string) => void;
}) {
  const [reordering, setReordering] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor));
  const order = view.items.filter(movable).map((item) => item.key);
  const nameOf = (id: UniqueIdentifier) => {
    const item = view.items.find((candidate) => candidate.key === String(id));
    return item ? itemName(item) : 'Hareket';
  };
  // dnd-kit'in kendi canlı bölgesi Türkçe; bırakmanın sonucunu ("Plank 3. sırada") ekranın canlı bölgesi söyler.
  const announcements: Announcements = {
    onDragStart: ({ active }) => `${nameOf(active.id)} tutuldu`,
    onDragOver: ({ active, over }) => (over && over.id !== active.id ? `${nameOf(over.id)} yerine` : undefined),
    onDragEnd: ({ active, over }) => (over && over.id !== active.id ? undefined : `${nameOf(active.id)} bırakıldı; sıra değişmedi`),
    onDragCancel: ({ active }) => `${nameOf(active.id)} bırakıldı; sıra değişmedi`,
  };
  const move = (key: string, direction: -1 | 1, from: 'button' | 'handle') => {
    onMove(key, direction);
    refocus(key, direction, from);
  };
  const toggle = () => {
    setReordering((on) => !on);
    onAnnounce(reordering ? 'Sıra değiştirme kapandı' : 'Sırayı değiştir: yukarı ve aşağı düğmeleriyle taşı');
  };

  const rows = (
    <ol role="list" className="flex flex-col">
      {view.items.map((item) => {
        const highlighted = item.key === highlight;
        if (!reordering) return <ListRow key={item.key} item={item} highlight={highlighted} onOpen={onOpen} onRestore={onRestore} />;
        if (!movable(item)) return <FixedRow key={item.key} item={item} highlight={highlighted} />;
        const index = order.indexOf(item.key);
        return <ReorderRow key={item.key} item={item} highlight={highlighted} first={index === 0} last={index === order.length - 1} onMove={move} />;
      })}
    </ol>
  );

  return (
    <section aria-labelledby={LIST_TITLE_ID} className="flex flex-col gap-1">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <h2 id={LIST_TITLE_ID} tabIndex={-1} className="font-heading text-base font-semibold outline-none">
          Hareketler
        </h2>
        {reordering || order.length > 1 ? (
          <Button variant={reordering ? 'secondary' : 'ghost'} className="-mr-1 h-11 px-3" onClick={toggle}>
            {reordering ? 'Bitti' : 'Sırayı değiştir'}
          </Button>
        ) : null}
      </div>
      {reordering ? <p className="pb-1 text-sm text-muted-foreground">Oklarla ya da tutamaçtan sürükleyerek taşı. Biten ve atlanan hareketler yerinde kalır.</p> : null}
      {reordering ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          accessibility={{
            announcements,
            screenReaderInstructions: {
              draggable: 'Tutmak için boşluk tuşuna bas, ok tuşlarıyla taşı, bırakmak için yeniden boşluk; vazgeçmek için Esc. Alt ile yukarı ya da aşağı ok bir adım taşır.',
            },
          }}
          onDragEnd={({ active, over }) => {
            if (over && over.id !== active.id) onMoveTo(String(active.id), String(over.id));
          }}>
          {rows}
        </DndContext>
      ) : (
        rows
      )}
      {reordering ? null : (
        <Button variant="ghost" size="lg" className="mt-2 h-12 w-full" onClick={onAdd}>
          <Plus data-icon="inline-start" weight="bold" />
          Hareket ekle
        </Button>
      )}
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
