'use client';

import { useRouter } from 'next/navigation';
import { ArrowCounterClockwise } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { cleanWeekdays, type AssignableDay } from '@/lib/day-assignments';
import { fetchJson } from '@/lib/query/errors';
import { useServiceMutation } from '@/lib/query/use-service';
import { assignmentsText } from '@/lib/training-days';
import { cn } from '@/lib/utils';

/**
 * [PT'nin günlerine dön]: danışanın günleri silinir, PT'nin günleri geçerli olur; hemen yazılır, revision
 * artmaz (aynı sayfadaki açık düzenleme 412 almaz). Program geçmişine yazılır. Faz 3'te hiçbir ekran çizmez
 * (Karar 3); ucuyla birlikte temizlik görevinde silinir.
 */
export function ResetDaysButton({ clientId, className }: { clientId: string; className?: string }) {
  const router = useRouter();
  const reset = useServiceMutation({
    fn: () => fetchJson<{ ok: true }>(`/api/clients/${clientId}/program/schedule`, { method: 'POST', body: JSON.stringify({ action: 'reset' }) }),
    notify: { success: 'Danışanın günleri kaldırıldı; senin günlerin geçerli.' },
    onSuccess: () => router.refresh(),
  });
  return (
    <Button type="button" variant="ghost" size="sm" className={cn('touch:h-11', className)} disabled={reset.isPending} onClick={() => reset.mutate()}>
      {reset.isPending ? <Spinner data-icon="inline-start" /> : <ArrowCounterClockwise data-icon="inline-start" />}
      Programdaki günlere dön
    </Button>
  );
}

/**
 * Haftanın programı (Faz 3, Karar 8–9): şu anki evrenin atamaları, salt okunur ("Sal · Alt vücut, Per · Üst vücut").
 * Program düzeyinde gün seçici yok: atama her programın kartındaki gün çiplerinden yapılır, bu satır yalnız özetler.
 * Evrede atama varken atanmamış programlar sonda tek satırda ("Gün atanmamış: Program D"); hiç atama yoksa yalnız
 * "Henüz gün atanmadı." Danışanın eski gün katmanı için rozet ya da geri dönüş yok (Karar 3: danışan günleri
 * değiştirmez). `label` verilirse üstte küçük etiket (evreli kart); evresiz kartta kartın kendisi bu başlığı taşır.
 */
export function AssignmentSummary({ days, label }: { days: readonly AssignableDay[]; label?: string }) {
  const text = assignmentsText(days);
  const unassigned = text ? days.filter((day) => cleanWeekdays(day.weekdays).length === 0) : [];
  return (
    <div className="flex flex-col gap-1">
      {label ? <span className="text-xs text-muted-foreground">{label}</span> : null}
      <p className="text-sm break-words">{text || 'Henüz gün atanmadı.'}</p>
      {unassigned.length > 0 ? (
        <p className="text-sm break-words text-muted-foreground">Gün atanmamış: {unassigned.map((day) => day.name).join(', ')}</p>
      ) : null}
    </div>
  );
}
