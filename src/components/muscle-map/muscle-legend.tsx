'use client';

import { WarningCircle } from '@phosphor-icons/react';
import { RemovableChip } from '@/components/removable-chip';
import { formatNumber } from '@/lib/format';
import type { MuscleLegendData } from '@/lib/muscle-tiers';
import { MuscleSwatch } from './muscle-patterns';

/**
 * Haritanın açıklama kutusu: haritadaki kademelere bölünmüş tek liste. Her grup desen örneği ve anlamıyla açılır, altında o
 * kademedeki kaslar adı ve değeriyle ("Ön bacak 6 set"). Ad kesilmez, gerekirse alt satıra kayar. Kardiyo kas değildir, en
 * altta ayrı satırdır. `onRemoveRow` verilirse satırlar çıkarılabilir çiptir (egzersiz formu).
 */
export function MuscleLegend({ data, onRemoveRow }: { data: MuscleLegendData; onRemoveRow?: (key: string) => void }) {
  if (data.groups.length === 0 && !data.cardioSets) return null;
  return (
    <div className="flex w-full min-w-0 flex-col gap-3 text-sm" aria-label="Harita açıklaması" role="group">
      {data.groups.map((group) => (
        <section key={`${group.mark}-${group.title}`} className="flex flex-col gap-1">
          <h4 className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <MuscleSwatch mark={group.mark} />
            {group.title}
          </h4>
          {group.rows.length === 0 ? null : onRemoveRow ? (
            <div className="flex flex-wrap gap-1.5 pl-5.5">
              {group.rows.map((row) => (
                <RemovableChip key={row.key} label={row.label} removeLabel={`${row.label} kasını kaldır`} onRemove={() => onRemoveRow(row.key)} />
              ))}
            </div>
          ) : (
            <dl className="flex flex-col gap-0.5 pl-5.5">
              {group.rows.map((row) => (
                <div key={row.key} className="flex min-h-6 items-baseline justify-between gap-3">
                  <dt className="min-w-0 [overflow-wrap:anywhere]">{row.label}</dt>
                  {row.sets !== undefined ? (
                    <dd className="flex shrink-0 items-center gap-1.5 text-muted-foreground tabular-nums">
                      {formatNumber(row.sets)} set
                      {row.note ? (
                        <span className={row.warn ? 'flex items-center gap-1 font-medium text-foreground' : undefined}>
                          {row.warn ? <WarningCircle weight="fill" className="size-3.5" aria-hidden /> : null}· {row.note}
                        </span>
                      ) : null}
                    </dd>
                  ) : null}
                </div>
              ))}
            </dl>
          )}
        </section>
      ))}
      {data.cardioSets ? (
        <p className="flex items-baseline justify-between gap-3 border-t pt-2">
          <span>Kardiyo</span>
          <span className="text-muted-foreground tabular-nums">{formatNumber(data.cardioSets)} set</span>
        </p>
      ) : null}
    </div>
  );
}
