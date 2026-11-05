'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useMessages } from '@/i18n/client';
import { authMessages } from '@/i18n/messages/auth';
import { useRememberedClient } from '@/app/giris/remembered-client';

/**
 * "Zaten hesabın var mı? Şifreyle gir": kimlik adresten ya da telefonda saklanandan biliniyorsa.
 * Kimlik bilinmiyorsa hiç çizilmez (danışan kimlik yazmaz).
 */
export function PasswordLoginLink({ clientId }: { clientId: string | null }) {
  const t = useMessages(authMessages).join;
  const remembered = useRememberedClient();
  const id = clientId ?? remembered;
  if (!id) return null;
  return (
    <div className="flex flex-col items-center gap-1 border-t pt-4 text-center">
      <span className="text-sm text-muted-foreground">{t.haveAccount}</span>
      <Button
        variant="outline"
        className="h-11 w-full"
        nativeButton={false}
        render={<Link href={clientId ? `/giris?c=${encodeURIComponent(clientId)}` : '/giris'} />}>
        {t.passwordLogin}
      </Button>
    </div>
  );
}
