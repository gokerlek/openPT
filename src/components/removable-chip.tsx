'use client';

import { X } from '@/components/line-icons';
import { Button } from '@/components/ui/button';

/**
 * × ile kaldırılan çip: seçili kas, süzgeç ve kısıt çiplerinin tek biçimi. "Kaldır" bir seçimi geri alır; kayıt silmez.
 */
export function RemovableChip({
  label,
  removeLabel,
  onRemove,
  disabled,
}: {
  label: string;
  /** Ekran okuyucu adı, ör. "Ön bacak kasını kaldır". */
  removeLabel: string;
  onRemove: () => void;
  disabled?: boolean;
}) {
  return (
    <Button type="button" variant="secondary" size="xs" onClick={onRemove} disabled={disabled} aria-label={removeLabel}>
      {label}
      <X data-icon="inline-end" />
    </Button>
  );
}
