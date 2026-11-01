import { cleanWeekdays, type AssignableDay } from '@/lib/day-assignments';
import { assignmentsText } from '@/lib/training-days';

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
