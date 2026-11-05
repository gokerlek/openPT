'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SetPasswordForm } from '@/app/giris/set-password-form';
import { useMessages } from '@/i18n/client';
import { authMessages } from '@/i18n/messages/auth';
import { InstallHelper } from '@/components/install/install-helper';
import { useInstall } from '@/components/install/install-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { JoinStepLabel } from './step-label';

/**
 * Kare kodla girişin son iki adımı: şifre belirle, sonra bir kez "uygulamayı ana ekrana ekle" (tasarım
 * Paket A). Sıra bilerek böyle: ana ekrandaki uygulama tarayıcının oturumunu her zaman taşımaz (iPhone),
 * danışan orada şifresiyle girer. Uygulamanın içinden katıldıysa (zaten yüklü) yükleme adımı atlanır.
 * Yükleme adımı yalnız bu sekmenin belleğinde: sayfa yenilenirse doğrudan programa gidilir (`page.tsx`), orada
 * Bugün ekranının üstündeki kart aynı yardımcıyı gösterir. "Devam" programa (`/me`). Şifre kaydedilip form kalkınca
 * odak yeni adımın başlığına geçer (sayfanın başına düşmez).
 */
export function JoinPasswordStep({ clientId }: { clientId: string }) {
  const t = useMessages(authMessages).join;
  const router = useRouter();
  const { state } = useInstall();
  const [saved, setSaved] = useState(false);
  const titleRef = useRef<HTMLDivElement>(null);
  const toProgram = () => router.replace('/me');

  useEffect(() => {
    if (saved) titleRef.current?.focus();
  }, [saved]);

  if (!saved) {
    return (
      <Card>
        <CardHeader>
          <CardDescription>
            <JoinStepLabel step={2} />
          </CardDescription>
          <CardTitle className="text-xl">{t.passwordStep.title}</CardTitle>
          <CardDescription>{t.passwordStep.body}</CardDescription>
        </CardHeader>
        <CardContent>
          <SetPasswordForm
            submitLabel={t.passwordStep.submit}
            onDone={() => (state?.guide === 'installed' ? toProgram() : setSaved(true))}
          />
        </CardContent>
      </Card>
    );
  }

  const installed = state?.guide === 'installed';
  // Yardımcının kendi birincil düğmesi varsa (yükle, Safari'de/Chrome'da aç) "Devam" ikincil kalır.
  const ownAction = state?.guide === 'prompt' || state?.guide === 'ios-other' || state?.guide === 'android-in-app';
  return (
    <Card>
      <CardHeader>
        <CardDescription>
          <JoinStepLabel step={3} />
        </CardDescription>
        <CardTitle ref={titleRef} tabIndex={-1} className="text-xl outline-none">
          {t.passwordStep.installTitle}
        </CardTitle>
        <CardDescription>{installed ? t.passwordStep.installedBody : t.passwordStep.savedBody}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <InstallHelper variant="inline" audience="client" openPath={`/giris?c=${encodeURIComponent(clientId)}`} />
        <Button
          size="lg"
          variant={ownAction ? 'outline' : 'default'}
          className="h-12 w-full text-base"
          onClick={toProgram}>
          {t.continue}
        </Button>
      </CardContent>
    </Card>
  );
}
