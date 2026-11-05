'use client';

import Link from 'next/link';
import { PencilSimple } from '@phosphor-icons/react/dist/ssr';
import { Button } from '@/components/ui/button';
import { useMessages } from '@/i18n/client';
import { commonMessages } from '@/i18n/messages/common';

/**
 * Detay sayfasının tek eylemi: düzenlemeye götürür. Silme ve varsayılana dönme
 * düzenleme sayfasındadır — detay yalnız gösterir (SPEC §6).
 */
export function EditButton({ href }: { href: string }) {
  const t = useMessages(commonMessages).actions;
  return (
    <Button variant="outline" nativeButton={false} render={<Link href={href} />}>
      <PencilSimple data-icon="inline-start" weight="fill" />
      {t.edit}
    </Button>
  );
}
