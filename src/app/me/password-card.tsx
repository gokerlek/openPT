'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Key } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { SetPasswordForm } from '@/app/giris/set-password-form';
import { focusAfterRemoval } from '@/components/focus-next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useMessages } from '@/i18n/client';
import { clientHomeMessages } from '@/i18n/messages/client-home';

/**
 * Şifre kartı (SPEC §5): eski akışla (yalnız kare kodla) katılmış ya da kare koddan sonra şifre
 * adımını kapatmış danışan için; PT'nin sıfırlamasından (yeni kare kod) sonra da çıkar. Zorunlu
 * değil ama görünür: şifresi olmayan çıkış yaparsa yeniden girmek için yeni kare kod gerekir.
 * Telefonda programı aşağı itmesin diye form dokununca açılır. Kaydedince kart kalkar; odak yerine gelen
 * öğeye geçer (sayfanın başına düşmez).
 */
export function PasswordCard({ reset }: { reset: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const t = useMessages(clientHomeMessages).password;
  return (
    <Card ref={cardRef} className="border-primary/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key weight="fill" className="size-5 text-primary" />
          {reset ? t.resetTitle : t.title}
        </CardTitle>
        <CardDescription>{reset ? t.resetText : t.text}</CardDescription>
      </CardHeader>
      <CardContent>
        {open ? (
          <SetPasswordForm
            submitLabel={t.save}
            onDone={() => {
              focusAfterRemoval(cardRef.current);
              toast.success(t.saved);
              router.refresh();
            }}
          />
        ) : (
          <Button className="h-11 w-full" onClick={() => setOpen(true)}>
            {t.set}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
