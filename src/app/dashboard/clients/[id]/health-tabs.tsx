'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TabsNav, TabsNavLink } from '@/components/ui/tabs';
import type { HealthField } from '@/lib/schemas/client';
import { activeHealthPart, HEALTH_PARTS } from './health-parts';

/**
 * "Sağlık"ın ikinci şeridi (tasarım `kisit-tarama.md` §1): Kısıtlar · Ölçümler · Hareket, onay parçası başına bir
 * sekme. Kamera ölçümü sihirbazı (`measurements/camera`) Hareket'te sayılır (`activeHealthPart`). Yalnız modülde
 * seçili parçalar etkin; seçili olmayan pasif ve "seçili değil" notlu. Bekleyen danışan bildirimi ya da gözden
 * geçirilmemiş tarama ağrısı varsa parçanın yanında nokta (ekran okuyucuya "bekleyen var").
 */
export function HealthTabs({ clientId, selected, pending = [] }: { clientId: string; selected: readonly HealthField[]; pending?: readonly HealthField[] }) {
  const pathname = usePathname();
  const base = `/dashboard/clients/${clientId}`;
  const current = activeHealthPart(pathname, base);
  return (
    <TabsNav aria-label="Sağlık bölümleri" className="w-full sm:w-fit">
      {HEALTH_PARTS.map((part) => {
        const href = `${base}/${part.path}`;
        const active = current === part;
        // Etkin sayfa seçili olmasa da gezilebilir (kilit uyarısı neden ve ne yapılacağını söyler).
        if (!selected.includes(part.field) && !active) {
          return (
            <TabsNavLink key={part.path} disabled note="seçili değil">
              {part.label}
            </TabsNavLink>
          );
        }
        return (
          <TabsNavLink key={part.path} active={active} render={<Link href={href} />}>
            {part.label}
            {pending.includes(part.field) ? (
              <>
                <span aria-hidden className="size-1.5 rounded-full bg-primary" />
                <span className="sr-only">(bekleyen var)</span>
              </>
            ) : null}
          </TabsNavLink>
        );
      })}
    </TabsNav>
  );
}
