'use client';

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useLocale, useMessages } from '@/i18n/client';
import { uiMessages } from '@/i18n/messages/ui';
import { cn } from '@/lib/utils';
import { normalizeWeekdays, weekdayLabels, weekdayShortLabels, WEEKDAYS, type Weekday } from '@/lib/training-days';

/**
 * Haftanın yedi günü, çoklu seçim (tasarım §2.11; Faz 3): programın (antrenmanın) atandığı günler, PT'nin program
 * düzenleyicisinde ve kendi program formunda aynı parça (AI koçunun gün seçimi de). Her gün 44 px (375 px'te yedisi
 * yan yana sığar); basılı gün dolu ve halkalı (`toggle.tsx`), ekran okuyucu günün tam adını duyar. Değer pazartesiden
 * sıralı.
 *
 * `taken`: evrede başka programa atanmış günler → o programın adı. Bir gün evrede en çok bir programa atanır; alınmış
 * gün kapalıdır, nedeni erişilebilir adında ("Perşembe, Üst vücut programında"). Görünen satırı ("Başka programda: …")
 * çağıran yazar ve `describedBy` ile gruba bağlar: kapalı düğme odak almaz, ekran okuyucu nedeni grupta duysun.
 * `title` yok: kapalı düğmede imleç olayı yok (`pointer-events-none`), hiç görünmezdi.
 */
export function WeekdayToggle({
  value,
  onChange,
  label,
  id,
  describedBy,
  disabled,
  invalid,
  taken,
  className,
}: {
  value: readonly number[];
  onChange: (weekdays: Weekday[]) => void;
  /** Grubun erişilebilir adı (görünen etiket yoksa). */
  label?: string;
  /** Görünen etiketin `id`'si (`aria-labelledby`). */
  id?: string;
  /** Altındaki açıklamanın `id`'si (`aria-describedby`): alınmış günlerin nedeni ("Başka programda: …"). */
  describedBy?: string;
  disabled?: boolean;
  invalid?: boolean;
  /** Başka programa atanmış günler → sahibinin adı (`takenWeekdays`); bunlar seçilemez. */
  taken?: ReadonlyMap<number, string>;
  className?: string;
}) {
  const locale = useLocale();
  const t = useMessages(uiMessages).weekdays;
  const names = weekdayLabels(locale);
  const shortNames = weekdayShortLabels(locale);
  return (
    <ToggleGroup
      multiple
      variant="outline"
      spacing={1}
      disabled={disabled}
      {...(id ? { 'aria-labelledby': id } : { 'aria-label': label ?? t.label })}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      value={normalizeWeekdays(value).map(String)}
      onValueChange={(next) => onChange(normalizeWeekdays(next.map(Number)))}
      className={cn('grid w-full grid-cols-7', className)}>
      {WEEKDAYS.map((day) => {
        const owner = taken?.get(day);
        const name = owner === undefined ? names[day] : t.taken(names[day], owner);
        return (
          <ToggleGroupItem
            key={day}
            value={String(day)}
            disabled={owner !== undefined}
            aria-label={name}
            className="h-11 min-w-0 px-0 text-sm">
            {shortNames[day]}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}
