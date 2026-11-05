'use client';

import { usePathname, useRouter } from 'next/navigation';
import { LabeledSelect } from '@/components/labeled-select';
import { useLocale, useMessages } from '@/i18n/client';
import { screeningMessages } from '@/i18n/messages/screening';
import { getFormat } from '@/lib/format';

/** Adresteki "karşılaştırma yok" değeri (kod; `?onceki=yok`). */
const NONE = 'yok';

/** "Karşılaştır: [12 Eyl] ile [1 Ağu]" — aynı protokoldeki iki gün, adreste (`?gun=&onceki=`). */
export function CompareSelect({ dates, current, previous }: { dates: string[]; current: string; previous: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const t = useMessages(screeningMessages).compare;
  const formatDay = getFormat(locale).day;
  const labels = Object.fromEntries(dates.map((date) => [date, formatDay(date)]));
  const go = (gun: string, onceki: string | null) => router.replace(`${pathname}?gun=${gun}${onceki ? `&onceki=${onceki}` : `&onceki=${NONE}`}`, { scroll: false });
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">{t.label}</span>
      <LabeledSelect id="compare-current" value={current} labels={labels} onChange={(gun) => go(gun, previous && previous < gun ? previous : null)} triggerClassName="w-44" />
      <span className="text-muted-foreground">{t.with}</span>
      <LabeledSelect
        id="compare-previous"
        value={previous ?? NONE}
        labels={{ [NONE]: t.none, ...Object.fromEntries(dates.filter((date) => date < current).map((date) => [date, formatDay(date)])) }}
        onChange={(onceki) => go(current, onceki === NONE ? null : onceki)}
        triggerClassName="w-44"
      />
    </div>
  );
}
