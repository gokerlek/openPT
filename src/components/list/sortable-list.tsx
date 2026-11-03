'use client';

import { useCallback, useId, useState } from 'react';
import { DndContext, DragOverlay, closestCenter, useDraggable, useDroppable } from '@dnd-kit/core';
import { CardGrabber } from '@/components/exercise-card';
import { SwipeGroup } from '@/components/swipe/swipe-row';
import { moveTargetOf } from '@/lib/reorder';
import { cn } from '@/lib/utils';
import { LIST_ACCESSIBILITY, autoScrollEdge, listAutoScroll, setReordering, useListSensors } from './dnd-base';
import { MoveButtons } from './move-buttons';

export type SortableSlot = {
  /** Kartın üstündeki tutamaç (`CardGrabber`); taşınamayan öğede `null`. Kartın `relative` kabuğunun içine konur. */
  grabber: React.ReactNode;
  dragging: boolean;
};

type SortableListProps<T> = {
  items: readonly T[];
  keyOf: (item: T) => string;
  /** Öğenin adı: gizli taşıma şeridi ("{ad}: taşı") ve sürüklenen kopya. */
  nameOf: (item: T) => string;
  /** Taşınamayan öğe tutamaçsızdır ve bırakma hedefi değildir (ör. biten hareket). Varsayılan: hepsi. */
  canMove?: (item: T) => boolean;
  /** Klavye: Alt + ↑/↓ ya da gizli "Yukarı/Aşağı taşı". */
  onStep: (key: string, target: 'up' | 'down') => void;
  /** Sürükle-bırak: öğe, üzerine bırakıldığı öğenin sırasına (`moveTo`). */
  onDrop: (key: string, overKey: string) => void;
  renderItem: (item: T, slot: SortableSlot) => React.ReactNode;
  /** Listenin ekran okuyucu adı. */
  label: string;
  className?: string;
};

/**
 * Düz liste için tek taşıma düzeni (tasarım §A): tutamaç kartın üstündeki çizgidir (`CardGrabber`) ve sürükleme yalnız
 * ondan başlar; dokunma alanı kartın 12 px üstüne taştığı için öğeler kart aralığıyla dizilir (düzenleyici listesiyle
 * aynı). Klavyede odaktaki öğede Alt + ↑/↓, ekran okuyucuda gizli şerit. Kaydırarak silme için öğeler `SwipeGroup`
 * içindedir (aynı anda tek panel açık). Ayarlar düzenleyiciyle ortak (`dnd-base.ts`).
 */
export function SortableList<T>({ items, keyOf, nameOf, canMove = () => true, onStep, onDrop, renderItem, label, className }: SortableListProps<T>) {
  const id = useId();
  const sensors = useListSensors();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [edge, setEdge] = useState(0.1);
  const movable = items.filter(canMove).map(keyOf);
  const active = activeKey === null ? undefined : items.find((item) => keyOf(item) === activeKey);

  const finish = () => {
    setActiveKey(null);
    setReordering(false);
  };

  return (
    <DndContext
      id={id}
      sensors={sensors}
      collisionDetection={closestCenter}
      autoScroll={listAutoScroll(edge)}
      accessibility={LIST_ACCESSIBILITY}
      onDragStart={({ active: dragged }) => {
        setActiveKey(String(dragged.id));
        setEdge(autoScrollEdge());
        setReordering(true);
      }}
      onDragEnd={({ active: dragged, over }) => {
        finish();
        if (over && over.id !== dragged.id) onDrop(String(dragged.id), String(over.id));
      }}
      onDragCancel={finish}>
      <SwipeGroup>
        <ol aria-label={label} className={cn('flex flex-col gap-3 pt-2', className)}>
          {items.map((item) => {
            const key = keyOf(item);
            const position = movable.indexOf(key);
            return (
              <SortableItem
                key={key}
                itemKey={key}
                name={nameOf(item)}
                movable={position !== -1}
                canUp={position > 0}
                canDown={position !== -1 && position < movable.length - 1}
                onStep={(target) => onStep(key, target)}
                render={(slot) => renderItem(item, slot)}
              />
            );
          })}
        </ol>
      </SwipeGroup>
      <DragOverlay dropAnimation={null} zIndex={60}>
        {active ? (
          <div className="rounded-xl border bg-card px-4 py-3 text-sm font-medium shadow-lg ring-2 ring-primary-text/40">{nameOf(active)}</div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function SortableItem({
  itemKey,
  name,
  movable,
  canUp,
  canDown,
  onStep,
  render,
}: {
  itemKey: string;
  name: string;
  movable: boolean;
  canUp: boolean;
  canDown: boolean;
  onStep: (target: 'up' | 'down') => void;
  render: (slot: SortableSlot) => React.ReactNode;
}) {
  const { setNodeRef: setDragRef, setActivatorNodeRef, listeners, isDragging } = useDraggable({ id: itemKey, disabled: !movable });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: itemKey, disabled: !movable });
  const ref = useCallback(
    (element: HTMLElement | null) => {
      setDragRef(element);
      setDropRef(element);
    },
    [setDragRef, setDropRef],
  );
  const grabber = movable ? <CardGrabber ref={setActivatorNodeRef} dragging={isDragging} {...listeners} /> : null;

  return (
    <li
      ref={ref}
      className={cn(
        'relative rounded-xl motion-safe:transition-opacity',
        isDragging && 'opacity-40',
        isOver && !isDragging && 'outline-2 outline-offset-2 outline-primary-text outline-dashed',
      )}
      onKeyDown={(event) => {
        if (!movable) return;
        // Metin alanında Alt + ok imleci taşır; öğeyi değil.
        if (event.target instanceof HTMLElement && event.target.closest('input, textarea, [contenteditable="true"]')) return;
        const target = moveTargetOf(event);
        if (target !== 'up' && target !== 'down') return;
        event.preventDefault();
        if ((target === 'up' && canUp) || (target === 'down' && canDown)) onStep(target);
      }}>
      {render({ grabber, dragging: isDragging })}
      {movable ? <MoveButtons name={name} canUp={canUp} canDown={canDown} onStep={onStep} /> : null}
    </li>
  );
}
