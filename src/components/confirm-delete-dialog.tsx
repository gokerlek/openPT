'use client';

import { useRef, useState } from 'react';
import { CaretDown } from '@phosphor-icons/react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

/**
 * Kayıt silmenin tek onay penceresi (danışan, program, geçmiş antrenman, kütüphanedeki egzersiz, cihaz, aparat, şablon,
 * ölçüm, tarama, kısıt): kayıt hemen sunucudan gider, "Geri al" yoktur. Başlık, varsa silinecek şeyin satırı (`subject`),
 * gövde ve isteğe bağlı kapalı "Ayrıntı". Telefonda düğmeler üst üste ve tam genişlikte: onay en üstte, [Vazgeç] en altta
 * (başparmağın düştüğü yer güvenli) ve odak onda. Silme sürerken pencere açık kalır, onayda dönen gösterge (ikinci dokunuş
 * ikinci istek atmaz); çağıran başarıda kapatır ya da sayfadan çıkar. `children` gövdeden sonra (ör. danışanın adını yazma).
 */
export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  subject,
  body,
  detail,
  confirmLabel = 'Sil',
  confirmVariant = 'destructive',
  confirmDisabled = false,
  busy = false,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subject?: string;
  body: string;
  detail?: string | null;
  confirmLabel?: string;
  /** "Varsayılana dön" gibi silme olmayan onaylarda `default`. */
  confirmVariant?: 'destructive' | 'default';
  confirmDisabled?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  children?: React.ReactNode;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState(false);
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => (next || !busy ? onOpenChange(next) : undefined)}
      onOpenChangeComplete={(next) => (next ? undefined : setExpanded(false))}>
      <AlertDialogContent initialFocus={cancel}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription className="flex flex-col gap-2 text-left">
            {subject ? <span className="font-medium text-foreground tabular-nums">{subject}</span> : null}
            <span>{body}</span>
          </AlertDialogDescription>
          {detail ? (
            <div className="w-full text-left">
              <Button variant="ghost" className="-ml-2 h-11 px-2 text-muted-foreground" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
                Ayrıntı
                <CaretDown data-icon="inline-end" className={expanded ? 'rotate-180' : undefined} />
              </Button>
              {expanded ? <p className="text-sm text-muted-foreground">{detail}</p> : null}
            </div>
          ) : null}
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel ref={cancel} className="h-11" disabled={busy}>
            Vazgeç
          </AlertDialogCancel>
          <Button variant={confirmVariant} className="h-11" disabled={busy || confirmDisabled} onClick={onConfirm}>
            {busy ? <Spinner data-icon="inline-start" /> : null}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
