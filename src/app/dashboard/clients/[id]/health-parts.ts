// Göreli ve uzantılı içe aktarma: modül `node --test` ile de sınanır (`health-parts.test.ts`).
import { healthMessages } from '../../../../i18n/messages/health/index.ts';
import type { HealthField } from '@/lib/schemas/client';

export type HealthPart = {
  field: HealthField;
  path: string;
  label: string;
  /** Parçanın kendi adresinin dışında onu etkin gösteren alt adresler (danışan sayfasına göre). */
  also?: readonly string[];
};

/**
 * Danışan sayfasındaki "Sağlık" sekmesinin parçaları (tasarım `kisit-tarama.md` §1), şeritteki sırayla; her biri
 * bir onay parçasıdır. Sekmenin bağlantısı modülde seçili ilk parçadır. Kamera ölçümü sihirbazının adresi
 * ölçümlerin altında kalır (`measurements/camera`) ama Hareket'in eylemidir: aynı `screening` onayı.
 */
const LABELS = healthMessages('tr').parts.labels;

/** `label` Türkçe (eski çağrılar); şerit adı okuyanın dilinde `healthMessages(locale).parts.labels[field]`. */
export const HEALTH_PARTS: readonly HealthPart[] = [
  { field: 'conditions', path: 'constraints', label: LABELS.conditions },
  { field: 'measurements', path: 'measurements', label: LABELS.measurements },
  { field: 'screening', path: 'screening', label: LABELS.screening, also: ['measurements/camera'] },
];

/** `prefix`'in kendisi ya da alt adresi; `measurements-x` `measurements`'ın altı değildir. */
function isUnder(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/**
 * Adresin şeritteki etkin parçası; parça dışında (Genel, Program) null. `base` danışan sayfasının kökü
 * (`/dashboard/clients/c_…`). En uzun eşleşen önek kazanır: `measurements/camera` Ölçümler'in değil Hareket'in.
 * Sondaki eğik çizgi yok sayılır.
 */
export function activeHealthPart(pathname: string, base: string): HealthPart | null {
  const path = pathname.replace(/\/+$/, '');
  if (!path.startsWith(`${base}/`)) return null;
  const rest = path.slice(base.length + 1);
  let best: { part: HealthPart; length: number } | null = null;
  for (const part of HEALTH_PARTS) {
    for (const prefix of [part.path, ...(part.also ?? [])]) {
      if (isUnder(rest, prefix) && (!best || prefix.length > best.length)) best = { part, length: prefix.length };
    }
  }
  return best?.part ?? null;
}
