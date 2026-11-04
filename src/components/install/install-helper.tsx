'use client';

import { useRef } from 'react';
import { ArrowSquareOut, CheckCircle, Compass, Copy, DeviceMobile, DownloadSimple, Export, PlusSquare } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { focusAfterRemoval } from '@/components/focus-next';
import { DotsThree } from '@/components/line-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { chromeIntentUrl, safariUrl, type InstallAudience, type InstallGuide } from '@/lib/install-guide';
import { cn } from '@/lib/utils';
import { useInstall } from './install-state';

const TEXT: Record<InstallAudience, { title: string; description: string; installed: string }> = {
  client: {
    title: 'Uygulamayı ana ekrana ekle',
    description: 'Antrenmanın tek dokunuşla, tarayıcı çubuğu olmadan tam ekran açılır.',
    installed: 'Uygulama bu telefonda ana ekrandan açık.',
  },
  pt: {
    title: 'Panel uygulaması',
    description: 'Panel telefonda ya da bilgisayarda ayrı simgeyle, tarayıcı çubuğu olmadan açılır.',
    installed: 'Panel bu cihazda uygulama olarak açık.',
  },
};

/**
 * Yükleme yardımcısı (tasarım Paket A): danışan ve PT aynı bileşeni kullanır; hangi anlatımın çıkacağı
 * `lib/install-guide.ts`'te, cihaz bilgisi ve "Şimdi değil" `install-state.ts`'te.
 *
 * - `card`: Bugün ekranının üstü ve PT genel bakışı. Yüklüyse ya da "Şimdi değil" denmişse (14 gün, o cihazda,
 *   danışan ve PT ayrı) hiç çizilmez. Kart kalkınca odak yerine gelen öğeye geçer (`focusAfterRemoval`).
 * - `inline`: yalnız anlatım, kartsız ve "Şimdi değil"siz: katılımın son adımı (`join/password-step.tsx`) kendi
 *   kartını ve "Devam"ını çizer.
 * - `status`: PT Ayarlar → Uygulama; her zaman görünür, yüklüyse "Yüklü" yazar.
 *
 * Sunucuda ve ilk çizimde cihaz bilinmez: `card` ve `inline` o ana kadar boş, `status` iskelet. Başka tarayıcıda
 * açma ve kopyalama `openPath`'i kullanır (danışan için kimlikli giriş adresi, PT için panel): uygulama içi
 * tarayıcının oturumu Safari'ye/Chrome'a geçmez, açılan sayfa girişe gelir.
 */
export function InstallHelper({
  variant,
  audience,
  openPath,
  className,
}: {
  variant: 'card' | 'inline' | 'status';
  audience: InstallAudience;
  /** Safari'de / Chrome'da açılacak ve kopyalanacak yol (`/giris?c=…`, `/dashboard`). */
  openPath: string;
  className?: string;
}) {
  const { state, promptInstall, snooze } = useInstall();
  const cardRef = useRef<HTMLDivElement>(null);
  const text = TEXT[audience];

  if (variant === 'inline') {
    if (!state || state.guide === 'installed') return null;
    return <GuideBody guide={state.guide} openPath={openPath} onInstall={promptInstall} className={className} />;
  }

  if (variant === 'card') {
    if (!state || state.guide === 'installed' || state.snoozed[audience]) return null;
    return (
      <Card ref={cardRef} size="sm" className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DeviceMobile weight="fill" className="size-5 shrink-0 text-primary" />
            {text.title}
          </CardTitle>
          <CardDescription>{text.description}</CardDescription>
          <CardAction>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => {
                focusAfterRemoval(cardRef.current);
                snooze(audience);
              }}>
              Şimdi değil
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <GuideBody guide={state.guide} openPath={openPath} onInstall={promptInstall} />
        </CardContent>
      </Card>
    );
  }

  const guide = state?.guide;
  const installed = guide === 'installed';
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DeviceMobile weight="fill" className="size-5 shrink-0 text-primary" />
          {text.title}
        </CardTitle>
        <CardDescription>{installed ? text.installed : text.description}</CardDescription>
        {installed ? (
          <CardAction>
            <Badge>
              <CheckCircle weight="fill" data-icon="inline-start" />
              Yüklü
            </Badge>
          </CardAction>
        ) : null}
      </CardHeader>
      {installed ? null : (
        <CardContent>
          {guide ? <GuideBody guide={guide} openPath={openPath} onInstall={promptInstall} /> : <Skeleton className="h-11 w-full" />}
        </CardContent>
      )}
    </Card>
  );
}

/** Kutulu küçük simge: adımların ve eylemlerin solunda. */
function StepIcon({ children }: { children: React.ReactNode }) {
  return (
    <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground [&_svg]:size-5">
      {children}
    </span>
  );
}

function GuideBody({
  guide,
  openPath,
  onInstall,
  className,
}: {
  guide: Exclude<InstallGuide, 'installed'>;
  openPath: string;
  onInstall: () => Promise<unknown>;
  className?: string;
}) {
  if (guide === 'prompt') {
    return (
      <div className={className}>
        <Button className="h-11 w-full" onClick={() => void onInstall()}>
          <DownloadSimple weight="fill" data-icon="inline-start" />
          Uygulamayı yükle
        </Button>
      </div>
    );
  }

  if (guide === 'ios-safari') {
    return (
      <ol className={cn('flex flex-col gap-3', className)} aria-label="Ana ekrana ekleme adımları">
        <li className="flex items-center gap-3">
          <StepIcon>
            <Export weight="bold" />
          </StepIcon>
          <span className="flex min-w-0 flex-col">
            <span>
              <span className="font-medium">Paylaş</span> simgesi (kare ve yukarı ok)
            </span>
            <span className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
              Görünmüyorsa önce <DotsThree role="img" aria-label="üç nokta" className="size-4" /> menüsü
            </span>
          </span>
        </li>
        <li className="flex items-center gap-3">
          <StepIcon>
            <PlusSquare weight="bold" />
          </StepIcon>
          <span className="flex min-w-0 flex-col">
            <span className="font-medium">Ana Ekrana Ekle</span>
            <span className="text-xs text-muted-foreground">Listede yoksa aşağı kaydırınca çıkar</span>
          </span>
        </li>
        <li className="flex items-center gap-3">
          <StepIcon>
            <span className="text-xs font-semibold text-primary">Ekle</span>
          </StepIcon>
          <span>
            Sağ üstte <span className="font-medium">Ekle</span>
          </span>
        </li>
      </ol>
    );
  }

  if (guide === 'ios-other' || guide === 'android-in-app') {
    return <OpenElsewhere ios={guide === 'ios-other'} openPath={openPath} className={className} />;
  }

  if (guide === 'mac-safari') {
    return (
      <p className={cn('text-sm', className)}>
        Safari’nin menü çubuğunda <span className="font-medium">Dosya</span> → <span className="font-medium">Dock’a Ekle</span>.
      </p>
    );
  }

  return (
    <p className={cn('text-sm', className)}>
      Tarayıcının menüsünden <span className="font-medium">Ana ekrana ekle</span> ya da{' '}
      <span className="font-medium">Uygulamayı yükle</span> seçilir.
    </p>
  );
}

/** iPhone'da Safari dışı ya da Android'de uygulama içi tarayıcı: asıl tarayıcıda aç ya da bağlantıyı kopyala. */
function OpenElsewhere({ ios, openPath, className }: { ios: boolean; openPath: string; className?: string }) {
  const href = new URL(openPath, window.location.origin).href;
  const open = ios ? safariUrl(href) : chromeIntentUrl(href);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(href);
      toast.success('Bağlantı kopyalandı.');
    } catch {
      toast.error('Kopyalanamadı. Aşağıdaki bağlantı elle seçilebilir.');
    }
  };

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <p className="text-sm">
        {ios
          ? "Ana ekrana ekleme Safari'den yapılır; bu sayfa Safari'de açılmalı."
          : "Sayfa bir uygulamanın içinde açık; yükleme Chrome'dan yapılır."}
      </p>
      <div className="flex flex-wrap gap-2">
        {open ? (
          <Button className="h-11 grow" nativeButton={false} render={<a href={open} />}>
            {ios ? <Compass weight="fill" data-icon="inline-start" /> : <ArrowSquareOut weight="fill" data-icon="inline-start" />}
            {ios ? "Safari'de aç" : "Chrome'da aç"}
          </Button>
        ) : null}
        <Button variant="outline" className="h-11 grow" onClick={copy}>
          <Copy weight="fill" data-icon="inline-start" />
          Bağlantıyı kopyala
        </Button>
      </div>
      <span className="text-xs break-all text-muted-foreground select-all">{href}</span>
    </div>
  );
}
