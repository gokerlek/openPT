'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SetPasswordForm } from '@/app/giris/set-password-form';
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
          <CardTitle className="text-xl">Şifreni belirle</CardTitle>
          <CardDescription>Bir dahaki sefere bu telefonda ya da başka bir telefonda şifrenle girersin.</CardDescription>
        </CardHeader>
        <CardContent>
          <SetPasswordForm
            submitLabel="Şifreyi kaydet ve devam et"
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
          Uygulamayı ana ekrana ekle
        </CardTitle>
        <CardDescription>
          {installed
            ? 'Uygulama yüklendi. Programın bundan sonra ana ekrandaki simgeden açılır.'
            : 'Şifren kaydedildi. Programın ana ekrandaki simgeden, tarayıcı çubuğu olmadan tam ekran açılsın.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <InstallHelper variant="inline" audience="client" openPath={`/giris?c=${encodeURIComponent(clientId)}`} />
        <Button
          size="lg"
          variant={ownAction ? 'outline' : 'default'}
          className="h-12 w-full text-base"
          onClick={toProgram}>
          Devam
        </Button>
      </CardContent>
    </Card>
  );
}
