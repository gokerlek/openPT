'use client';

import { Button } from '@/components/ui/button';
import { useMessages } from '@/i18n/client';
import { uiMessages } from '@/i18n/messages/ui';

/**
 * Taşınabilen öğenin hemen arkasındaki sr-only şerit: klavyeyle odaklanınca görünür. Sürüklemenin klavye ve ekran okuyucu
 * yolu (kısayolu da var: odaktaki öğede Alt + ↑/↓). Düzenleyici gruplama düğmelerini `children` ile ekler.
 */
export function MoveButtons({
  name,
  canUp = true,
  canDown = true,
  onStep,
  children,
}: {
  /** Öğenin adı: şeridin ekran okuyucu adı "{ad}: taşı". */
  name: string;
  canUp?: boolean;
  canDown?: boolean;
  onStep: (target: 'up' | 'down') => void;
  children?: React.ReactNode;
}) {
  const t = useMessages(uiMessages).move;
  const button = 'h-9 touch:h-11';
  return (
    <div role="group" aria-label={t.group(name)} className="sr-only flex flex-wrap gap-1.5 px-3 pb-3 focus-within:not-sr-only">
      <Button type="button" variant="outline" size="sm" className={button} disabled={!canUp} focusableWhenDisabled onClick={() => onStep('up')}>
        {t.up}
      </Button>
      <Button type="button" variant="outline" size="sm" className={button} disabled={!canDown} focusableWhenDisabled onClick={() => onStep('down')}>
        {t.down}
      </Button>
      {children}
    </div>
  );
}
