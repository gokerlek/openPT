'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PushPin } from '@phosphor-icons/react';
import { GroupedSelect } from '@/components/labeled-select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';
import { equipmentLabels, type Equipment } from '@/lib/schemas/exercise';
import { useLocale, useMessages } from '@/i18n/client';
import { ptLibraryMessages } from '@/i18n/messages/pt-library';

/** Sunucuda hesaplanmış muadil satırı (kart yalnız gösterir; sabitleme düzenlemede). */
export type AlternativeRow = {
  id: string;
  title: string;
  equipment: Equipment;
  /** Hareketin yapıldığı cihazın adı; varsa grup bu olur. */
  device: string | null;
  /** Hedef kasların özeti ("Kanat", "Göğüs"…). */
  muscles: string;
  /** Aynı hareket kalıbıysa kalıbın adı. */
  pattern: string | null;
  pinned: boolean;
};

/** Cihaz değişirse geçilecek egzersiz (sunucuda hesaplanır). */
export type DeviceSwap = {
  deviceId: string;
  deviceName: string;
  kindLabel: string;
  exercise: { id: string; title: string } | null;
};

/** Satırın grubu: cihazı varsa cihaz, yoksa ekipman; ekipmansızlar "Ekipmansız". */
function groupOf(row: AlternativeRow, groupLabels: Record<Equipment, string>): string {
  return row.device ?? groupLabels[row.equipment];
}

/**
 * Muadiller: alet doluysa, yoksa ya da danışana uygun değilse yerine yapılabilecekler.
 * PT'nin sabitledikleri en üstte; diğerleri ekipmana göre gruplu (ekipmansız önce).
 *
 * Detay sayfası yalnız gösterir: sabitleme egzersizin düzenleme formundadır.
 */
export function AlternativesCard({ exerciseId, rows, swaps }: { exerciseId: string; rows: AlternativeRow[]; swaps: DeviceSwap[] }) {
  const t = useMessages(ptLibraryMessages).alternativesCard;
  const [swapDevice, setSwapDevice] = useState('');
  const locale = useLocale();
  const labels = equipmentLabels(locale);
  const groupLabels: Record<Equipment, string> = { ...labels, bodyweight: t.noEquipment };
  const swap = swaps.find((item) => item.deviceId === swapDevice);
  const swapGroups = [...new Set(swaps.map((item) => item.kindLabel))].map((label) => ({
    label,
    options: swaps.filter((item) => item.kindLabel === label).map((item) => ({ value: item.deviceId, label: item.deviceName })),
  }));

  const pinned = rows.filter((row) => row.pinned);
  const groups = new Map<string, AlternativeRow[]>();
  for (const row of rows.filter((item) => !item.pinned)) {
    groups.set(groupOf(row, groupLabels), [...(groups.get(groupOf(row, groupLabels)) ?? []), row]);
  }
  // Ekipmansız hareketler önce: alet yokken ilk bakılan yer. Diğerleri en iyi önerinin sırasıyla.
  const isBodyweight = (items: AlternativeRow[]) => items.some((item) => item.equipment === 'bodyweight' && !item.device);
  const ordered = [...groups].sort(([, a], [, b]) => Number(isBodyweight(b)) - Number(isBodyweight(a)));
  const sections: [string, AlternativeRow[]][] = [
    ...(pinned.length > 0 ? ([[t.yourPicks, pinned]] as [string, AlternativeRow[]][]) : []),
    ...ordered,
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.title}</CardTitle>
        <CardDescription>
          {t.pinNote.lead}
          {/* Cümle içi bağlantı: telefonda görünmez 44 px dokunma alanı (düğme ve sayfa yolundaki kalıp). */}
          <Link href={`/dashboard/exercises/${exerciseId}/edit`} className="relative underline underline-offset-4 touch:before:absolute touch:before:top-1/2 touch:before:left-1/2 touch:before:h-full touch:before:min-h-11 touch:before:w-full touch:before:min-w-11 touch:before:-translate-x-1/2 touch:before:-translate-y-1/2">
            {t.pinNote.link}
          </Link>
          {t.pinNote.tail}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {swaps.length > 0 ? (
          // Kart tam genişlikte; seçici onunla birlikte uzamasın.
          <Field className="max-w-sm">
            <FieldLabel htmlFor="swap-device">{t.ifEquipmentChanges}</FieldLabel>
            <GroupedSelect id="swap-device" value={swapDevice} groups={swapGroups} empty={t.pickEquipment} onChange={setSwapDevice} />
            {swap ? (
              <FieldDescription>
                {swap.exercise ? (
                  <>
                    {t.withDevice(swap.deviceName)}{' '}
                    <Link href={`/dashboard/exercises/${swap.exercise.id}`} className="font-medium text-foreground underline underline-offset-4">
                      {swap.exercise.title}
                    </Link>
                  </>
                ) : (
                  t.noMatch(swap.deviceName)
                )}
              </FieldDescription>
            ) : (
              <FieldDescription>{t.swapHint}</FieldDescription>
            )}
          </Field>
        ) : null}
        {sections.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.none}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sections.map(([label, items]) => (
              <section key={label} className="flex flex-col gap-2" aria-label={label}>
                <h3 className="text-xs font-medium text-muted-foreground">{label}</h3>
                <ItemGroup className="gap-2">
                  {items.map((row) => (
                    <Item key={row.id} variant="outline" size="sm" render={<Link href={`/dashboard/exercises/${row.id}`} />}>
                      <ItemContent>
                        <ItemTitle>{row.title}</ItemTitle>
                        <ItemDescription>
                          {row.muscles}
                          {row.pinned ? ` · ${row.device ?? labels[row.equipment]}` : ''}
                          {row.pattern ? ` · ${row.pattern}` : ''}
                        </ItemDescription>
                      </ItemContent>
                      {row.pinned ? (
                        <ItemActions>
                          <PushPin weight="fill" className="size-4 text-primary-text" aria-label={t.pinnedLabel} />
                        </ItemActions>
                      ) : null}
                    </Item>
                  ))}
                </ItemGroup>
                </section>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
