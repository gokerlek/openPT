'use client';

import { toast } from 'sonner';
import { undoAt } from '@/lib/editor-undo';

let current: string | number | null = null;

/**
 * Dokunmatikte "Geri al" ve kapatma düğmesi 44 px (SPEC §6): düğme yüksekliği büyür, 20 px'lik ×'in
 * dokunma alanı görünmez bir katmanla genişler. Sonner'ın kendi ölçüleri özgül seçicide: `min-h` ve
 * `!` ile ezilir. Telefonda bildirimler altta, dock'un üstünde (`ui/sonner.tsx`).
 */
const TOUCH_CLASSES = {
  actionButton: 'touch:min-h-11 touch:px-3! touch:text-sm!',
  closeButton: "touch:before:absolute touch:before:-inset-3 touch:before:content-['']",
};

/** Geri al'dan önce aynı yerde başka değişiklik yapıldıysa. */
export const UNDO_CONFLICT = 'Sonrasında başka değişiklik yapıldı; geri alınamadı.';

/**
 * "Geri al" bildirimi (8 sn). Aynı anda tek bildirim: yenisi öncekini kapatır (uygulamadaki her yerel silme ve geri
 * alınabilir düzenleme ortak). "Sonrasında başka değişiklik yapıldı" denetimi gerekiyorsa `showGuardedUndo`.
 */
export function showUndoToast(message: string, onUndo: () => void, options: { description?: string } = {}): void {
  if (current !== null) toast.dismiss(current);
  current = toast(message, {
    description: options.description,
    action: { label: 'Geri al', onClick: onUndo },
    duration: 8000,
    classNames: TOUCH_CLASSES,
  });
}

/**
 * Denetimli "Geri al": işlemden hemen sonraki hâl (`after`, çağrı anında okunur) geri alma anında yerinde duruyorsa önceki
 * hâl (`before`) yazılır; o arada başka değişiklik olduysa hiçbir şey yazılmaz ve `UNDO_CONFLICT` söylenir. Yer geri alma
 * anında bulunur (`locate`; program günü o arada taşınmış olabilir), sabit yerde `() => 'root'` yeter (`undoAt`).
 */
export function showGuardedUndo<P, T>(
  message: string,
  guard: { locate: () => P | null; read: (at: P) => T; write: (at: P, value: T) => void; before: T },
  options: { description?: string; onUndone?: () => void } = {},
): void {
  const at = guard.locate();
  if (at === null) return;
  const after = guard.read(at);
  showUndoToast(
    message,
    () => {
      if (!undoAt(guard.locate, guard.read, guard.write, guard.before, after)) {
        toast.error(UNDO_CONFLICT);
        return;
      }
      options.onUndone?.();
    },
    { description: options.description },
  );
}
