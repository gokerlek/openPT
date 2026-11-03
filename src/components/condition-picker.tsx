'use client';

import { RemovableChip } from '@/components/removable-chip';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  CONDITION_REGIONS,
  CONDITIONS,
  conditionInfo,
  conditionLabel,
  parseCondition,
  RETIRED_CONDITION_IDS,
  type ClientCondition,
  type ConditionId,
  type ConditionQualifier,
  type ConditionRegion,
} from '@/lib/conditions';

/**
 * Kısıt seçimi: egzersiz formunda hareketin kısıt etiketleri, egzersiz listesinde "bu danışanda şu var" süzgeci (seçim
 * adres satırında, `?limit=…`).
 */

const REGION_LABELS: Record<ConditionRegion, string> = {
  spine: 'Omurga',
  neck: 'Boyun',
  shoulder: 'Omuz',
  elbow: 'Dirsek',
  wrist: 'El bileği',
  hip: 'Kalça',
  knee: 'Diz',
  ankle: 'Ayak bileği',
  systemic: 'Genel',
};

const QUALIFIER_LABELS: Record<ConditionQualifier, string> = {
  acute: 'akut',
  reactive: 'reaktif',
  severe: 'şiddetli',
  stable: 'sakin dönem',
  controlled: 'kontrollü',
  uncontrolled: 'kontrolsüz',
  postop: 'ameliyat sonrası',
};

/** Adres satırındaki değer → kısıt listesi (bilinmeyen kimlik düşer). */
export function parseConstraints(value: string | null): ClientCondition[] {
  if (!value) return [];
  const seen = new Set<string>();
  return value
    .split(',')
    .flatMap((item) => {
      const parsed = parseCondition(item.trim());
      if (!parsed) return [];
      const key = `${parsed.id}:${parsed.qualifier ?? ''}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [parsed];
    })
    .slice(0, 12);
}

export function formatConstraints(list: readonly ClientCondition[]): string {
  return list.map((item) => (item.qualifier ? `${item.id}:${item.qualifier}` : item.id)).join(',');
}

/** Kısıt seçenekleri: her kimlik + (varsa) şiddet/faz varyantı, bölgeye göre gruplu. */
function groups() {
  return CONDITION_REGIONS.map((region) => ({
    label: REGION_LABELS[region],
    options: (Object.keys(CONDITIONS) as ConditionId[])
      // Emekli kimlik (taramadaki eski ağrı işareti) hiçbir seçicide çıkmaz (`kisit-tarama.md` §2.1).
      .filter((id) => conditionInfo(id).region === region && !RETIRED_CONDITION_IDS.has(id))
      .flatMap((id) => {
        const info = conditionInfo(id);
        return [
          { value: id, label: info.label },
          ...(info.qualifiers ?? []).map((qualifier) => ({
            value: `${id}:${qualifier}`,
            label: `${info.label} (${QUALIFIER_LABELS[qualifier]})`,
          })),
        ];
      }),
  })).filter((group) => group.options.length > 0);
}

/**
 * Kısıt ekleme seçicisi: her seçim bir kısıt ekler, seçici hep boş kalır. Yer tutucu seçenek
 * değildir (listede işaretli "Kısıt ekle" satırı çıkmaz); görünür etiket yoksa `label` adı olur.
 */
export function ConditionSelect({
  id,
  placeholder,
  label,
  onSelect,
}: {
  id: string;
  placeholder: string;
  /** Görünür etiketi olmayan seçicinin erişilebilir adı. */
  label?: string;
  onSelect: (value: string) => void;
}) {
  const options = groups();
  const items = options.flatMap((group) => group.options);
  return (
    <Select items={items} value={null} onValueChange={(next) => next && onSelect(next as string)}>
      <SelectTrigger id={id} aria-label={label} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((group) => (
          <SelectGroup key={group.label}>
            <SelectLabel>{group.label}</SelectLabel>
            {group.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Kısıt seçici + seçili kısıt çipleri (egzersiz formunun medikal etiketleri ve egzersiz listesinin kısıt süzgeci ortak):
 * her seçim bir kısıt ekler (aynısı tekrar eklenmez, en çok `max`), çipin ×'i kaldırır. Değer ham kısıt metnidir
 * ("knee_pain", "knee_pain:acute"); aynı kimliğin niteliksiz hali her şiddeti kapsar.
 */
export function ConditionPicker({
  id,
  value,
  onChange,
  placeholder,
  label,
  max = 12,
}: {
  id: string;
  value: readonly string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  /** Görünür etiketi olmayan seçicinin erişilebilir adı. */
  label?: string;
  max?: number;
}) {
  const add = (raw: string) => {
    if (!raw || value.includes(raw) || value.length >= max) return;
    onChange([...value, raw]);
  };
  return (
    <div className="flex flex-col gap-3">
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1.5" aria-label="Seçili kısıtlar">
          {value.map((raw) => {
            const parsed = parseCondition(raw);
            const name = parsed ? conditionLabel(parsed) : raw;
            return (
              <RemovableChip
                key={raw}
                label={name}
                removeLabel={`${name} kısıtını kaldır`}
                onRemove={() => onChange(value.filter((item) => item !== raw))}
              />
            );
          })}
        </div>
      ) : null}
      <ConditionSelect id={id} placeholder={placeholder} label={label} onSelect={add} />
    </div>
  );
}
