'use client';

import { WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useMessages } from '@/i18n/client';
import { ptShellMessages } from '@/i18n/messages/pt-shell';

/**
 * PT dosyasında şemaya uymayan kayıtlar ve aynı kimliğin ikinci kayıtları (`src/lib/stored-list.ts`):
 * listede görünmezler ama dosyadan da düşmezler; düzeltilene kadar o kimliklere yazılmaz (409).
 * Egzersiz, cihaz ve aparat listelerinde ortak.
 */
export function UnreadableRecordsAlert({ count, path }: { count: number; path: string }) {
  const t = useMessages(ptShellMessages).unreadable;
  if (count === 0) return null;
  const title = t.title(count);
  return (
    <Alert variant="destructive">
      <WarningCircle weight="fill" />
      <AlertTitle>
        {title.before}
        <code>{path}</code>
        {title.after}
      </AlertTitle>
      <AlertDescription>{t.description}</AlertDescription>
    </Alert>
  );
}
