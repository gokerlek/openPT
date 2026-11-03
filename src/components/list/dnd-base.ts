'use client';

import { AutoScrollActivator, MouseSensor, PointerSensor, TouchSensor, useSensor, useSensors, type Announcements } from '@dnd-kit/core';
import { DRAG } from '@/lib/motion';

/**
 * Uygulamadaki tek sürükle-bırak kurulumunun ortak parçaları: hareket düzenleyicisi (`EditorDnd`) ve düz listeler
 * (`SortableList`) aynı sensörü, aynı otomatik kaydırmayı, aynı sessiz duyuruları ve aynı `html[data-reordering]`
 * işaretini kullanır. Sürükleme yalnız tutamaçtan başlar; klavye yolu Alt + ok ve gizli "Yukarı/Aşağı taşı" düğmeleridir.
 */

/** dnd-kit'in kendi duyuruları kapalı: tutamak ekran okuyucuya kapalı, listelerin kendi canlı bölgesi var. */
export const SILENT_ANNOUNCEMENTS: Announcements = {
  onDragStart: () => undefined,
  onDragOver: () => undefined,
  onDragEnd: () => undefined,
  onDragCancel: () => undefined,
};

export const LIST_ACCESSIBILITY = {
  announcements: SILENT_ANNOUNCEMENTS,
  restoreFocus: false,
  screenReaderInstructions: { draggable: '' },
};

/**
 * Sensörler: işaretçi `DRAG.activationDistance` px kıpırdayınca başlar (dokunup bırakmak kartı açar; düzenleyici). Düz
 * listelerde (`touchHold`) parmakla sürükleme `DRAG.touchHoldMs` basılı tutunca başlar: antrenman listesini kaydırırken
 * tutamaçtan geçen parmak hareketi yerinden oynatmaz (tasarım: "kazara yer değiştirme olmaz"). Fare ve kalem aynı kalır.
 */
export function useListSensors({ touchHold = false }: { touchHold?: boolean } = {}) {
  const distance = { activationConstraint: { distance: DRAG.activationDistance } };
  const pointer = useSensor(PointerSensor, distance);
  const mouse = useSensor(MouseSensor, distance);
  const touch = useSensor(TouchSensor, { activationConstraint: { delay: DRAG.touchHoldMs, tolerance: DRAG.touchTolerance } });
  return useSensors(...(touchHold ? [mouse, touch] : [pointer]));
}

/** Otomatik kaydırma şeridi: ekranın üst ve altında `DRAG.autoScrollEdge` px, ekran yüksekliğine oran olarak. */
export function autoScrollEdge(): number {
  return Math.min(0.45, DRAG.autoScrollEdge / Math.max(1, window.innerHeight));
}

export function listAutoScroll(edge: number) {
  return { threshold: { x: 0, y: edge }, activator: AutoScrollActivator.Pointer };
}

/** Sürükleme sürerken `html[data-reordering]`: metin seçimi ve imleç sayfa boyunca kapanır. */
export function setReordering(on: boolean): void {
  if (on) document.documentElement.dataset.reordering = '';
  else delete document.documentElement.dataset.reordering;
}
