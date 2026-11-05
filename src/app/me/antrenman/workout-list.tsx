'use client';

import { FlagCheckered, Play } from '@phosphor-icons/react';
import { Plus } from '@/components/line-icons';
import { SortableList } from '@/components/list/sortable-list';
import { SwipeRow, deleteAction } from '@/components/swipe/swipe-row';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { unitStateText, UnitStateIcon } from '@/components/workout/unit-state';
import { useLocale } from '@/i18n/client';
import type { Locale } from '@/i18n/locale';
import { clientWorkoutMessages } from '@/i18n/messages/client-workout';
import { getFormat } from '@/lib/format';
import { blockKindLabels } from '@/lib/template-plan';
import { cn } from '@/lib/utils';
import { itemName, type ListItem, type ListView } from '@/lib/workout-flow';

/** Listenin başlığının kimliği: listeye dönünce satır bulunamazsa klavye odağı buraya (`workout-screen.tsx`). */
export const LIST_TITLE_ID = 'list-title';

/** Satırın düğmesinin kimliği: listeye dönünce az önce bırakılan hareketin satırına kaydırılır ve odaklanır. */
export function listRowId(key: string): string {
  return `list-row-${key}`;
}

/** Sırası değişebilen satır: bitmemiş ve atlanmamış (`moveUnit`/`moveUnitTo`'nun kuralı; biten ve atlanan yerinde kalır). */
function movable(item: ListItem): boolean {
  return item.state === 'current' || item.state === 'pending';
}

/** Satırın ağırlığı: bugün kaydedilen son set "40 kg", geçen antrenmandan "Geçen: 40 kg"; ağırlıksız (süreli) hareket yok. */
function weightText(item: ListItem, locale: Locale): string | null {
  if (item.lastKg === null) return null;
  const kg = getFormat(locale).kg(item.lastKg);
  return item.lastFrom === 'last' ? clientWorkoutMessages(locale).list.previousKg(kg) : kg;
}

/** Satırın gövdesi: durum ikonu (sözcüğü ekran okuyucuya), numara ve ad; sağda "2/4 set" ve ağırlık. */
function RowContent({ item }: { item: ListItem }) {
  const current = item.state === 'current';
  const muted = item.state === 'done' || item.state === 'skipped';
  const locale = useLocale();
  const weight = weightText(item, locale);
  const kindLabel = item.kind === 'single' ? null : blockKindLabels(locale)[item.kind];
  return (
    <>
      <UnitStateIcon state={item.state} />
      <span className={cn('flex min-w-0 flex-1 flex-col items-start gap-1', muted && 'text-muted-foreground')}>
        <span className="sr-only">{unitStateText(locale)[item.state]}: </span>
        {kindLabel ? <Badge className="bg-primary/15 text-primary">{kindLabel}</Badge> : null}
        {item.members.map((member) => (
          <span key={member.rowId} className="flex w-full min-w-0 items-baseline gap-2">
            <span className="w-6 shrink-0 text-sm text-muted-foreground tabular-nums">{member.number}</span>
            <span className={cn('min-w-0 break-words', current && 'font-semibold')}>{member.title}</span>
          </span>
        ))}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5 text-[0.8125rem] text-muted-foreground tabular-nums">
        <span className={cn(current && 'font-medium text-foreground')}>
          {clientWorkoutMessages(locale).list.sets(item.done, item.planned)}
        </span>
        {weight ? <span>{weight}</span> : null}
      </span>
    </>
  );
}

/**
 * Antrenmanın listesi (Faz 2: liste ana ekran; tasarım `antrenman-ekrani.md`): yapılış sırasında her birim bir kart,
 * kartın gövdesi düğme (`min-h-14`) ve o hareketin odağını açar; biten hareket de açılır (setleri düzenlemek için),
 * atlanan önce geri alınır. Kartta durum ikonu (✓ ▶ ○ ⤼, Bugün'ün "Devam et" kartıyla aynı; durum sözcüğü ekran
 * okuyucuya), numara ve ad (grupta tür rozeti, üyeler alt alta "3a/3b"), sağda "2/4 set" ve son ağırlık. Atlanan
 * kartta ayrıca "Geri al" (sıranın sonuna döner). Altta "Hareket ekle".
 *
 * Taşıma her listedeki gibi (`SortableList`): bitmemiş, atlanmamış kartın üstünde tutamaç (`moveUnitTo`), odaktaki kartta
 * Alt + ↑/↓ ve gizli "Yukarı/Aşağı taşı" (`moveUnit`). Biten ve atlanan kart yerinde kalır, hedef olmaz. Taşıma kendi
 * başına gönderilmez (ekran `commitFlow` ile yazar, sonraki set yazımına biner); canlı bölge yeni yerini söyler.
 * Antrenmanda eklenen ve seti yazılmamış hareket sola kaydırılarak silinir (8 sn "Geri al"); plandaki hareket atlanır.
 */
export function WorkoutList({
  view,
  highlight,
  onOpen,
  onRestore,
  onAdd,
  onMove,
  onMoveTo,
  canRemove,
  onRemove,
}: {
  view: ListView;
  /** Az önce geri alınan, geçilen ya da taşınan birim: satır bir an vurgulu (`DRAG.highlightMs`). */
  highlight: string | null;
  /** Karta dokunmak: hareket odakta açılır (atlanan önce geri alınır), sıra yazılmaz. */
  onOpen: (key: string) => void;
  /** Atlanan kartta "Geri al". */
  onRestore: (key: string) => void;
  onAdd: () => void;
  /** Alt + ↑/↓ ya da gizli düğmeler: bir adım. */
  onMove: (key: string, direction: -1 | 1) => void;
  /** Sürükleyip bırakmak: bırakıldığı (taşınabilen) kartın yerine. */
  onMoveTo: (key: string, targetKey: string) => void;
  /** Antrenmanda eklenen ve seti yazılmamış hareket mi (`canRemoveAdded`). */
  canRemove: (key: string) => boolean;
  /** Eklenen hareketi siler (8 sn "Geri al"). */
  onRemove: (key: string) => void;
}) {
  const t = clientWorkoutMessages(useLocale()).list;
  return (
    <section aria-labelledby={LIST_TITLE_ID} className="flex flex-col gap-1">
      <div className="flex min-h-11 items-center">
        <h2 id={LIST_TITLE_ID} tabIndex={-1} className="font-heading text-base font-semibold outline-none">
          {t.title}
        </h2>
      </div>
      <SortableList
        items={view.items}
        keyOf={(item) => item.key}
        nameOf={itemName}
        canMove={movable}
        label={t.title}
        onStep={(key, target) => onMove(key, target === 'up' ? -1 : 1)}
        onDrop={onMoveTo}
        onTapItem={onOpen}
        renderItem={(item, slot) => {
          const card = (
            <div
              className={cn(
                'relative flex items-center gap-2 rounded-lg border bg-card transition-colors duration-300',
                (item.state === 'current' || item.key === highlight) &&
                  'border-primary/30 bg-[color-mix(in_oklab,var(--primary)_10%,var(--card))]',
              )}>
              <button
                type="button"
                id={listRowId(item.key)}
                aria-current={item.state === 'current' ? 'step' : undefined}
                onClick={() => onOpen(item.key)}
                className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-lg py-2 pr-2 pl-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                <RowContent item={item} />
              </button>
              {item.state === 'skipped' ? (
                <Button variant="secondary" className="mr-1.5 h-11 shrink-0 px-3.5" aria-label={t.restoreNamed(itemName(item))} onClick={() => onRestore(item.key)}>
                  {t.restore}
                </Button>
              ) : null}
            </div>
          );
          // Tutamaç kaydırma satırının dışında: dokunma alanı kartın üstüne taşar (`SwipeRow` kırpar).
          return (
            <>
              {slot.grabber}
              {canRemove(item.key) ? (
                <SwipeRow id={item.key} end={[deleteAction(() => onRemove(item.key))]}>
                  {card}
                </SwipeRow>
              ) : (
                card
              )}
            </>
          );
        }}
      />
      <Button variant="ghost" size="lg" className="mt-2 h-12 w-full" onClick={onAdd}>
        <Plus data-icon="inline-start" weight="bold" />
        {t.add}
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
  const t = clientWorkoutMessages(useLocale()).list;
  if (view.allDone || !current) {
    return (
      <Button size="lg" className="h-14 w-full text-base" onClick={onFinish}>
        <FlagCheckered data-icon="inline-start" weight="fill" />
        {t.finish}
      </Button>
    );
  }
  return (
    <Button size="lg" className="h-14 w-full text-base" onClick={() => onOpen(current.key)}>
      <Play data-icon="inline-start" weight="fill" />
      <span className="min-w-0 truncate">
        {view.doneSets > 0 ? t.continueWith(itemName(current)) : t.startWith(itemName(current))}
      </span>
    </Button>
  );
}
