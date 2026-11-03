'use client';

import { AutoScrollActivator, PointerSensor, useSensor, useSensors, type Announcements } from '@dnd-kit/core';
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

/** Tek işaretçi sensörü: `DRAG.activationDistance` px kıpırdayınca başlar (dokunup bırakmak kartı açar). */
export function useListSensors() {
  return useSensors(useSensor(PointerSensor, { activationConstraint: { distance: DRAG.activationDistance } }));
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
