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
import { useMessages } from '@/i18n/client';
import { uiMessages } from '@/i18n/messages/ui';
import { chromeIntentUrl, safariUrl, type InstallAudience, type InstallGuide } from '@/lib/install-guide';
import { cn } from '@/lib/utils';
import { useInstall } from './install-state';

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
  const t = useMessages(uiMessages).installHelper;
  const cardRef = useRef<HTMLDivElement>(null);
  const text = t[audience];

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
              {t.notNow}
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
              {t.installedBadge}
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
  const t = useMessages(uiMessages).installHelper;
  if (guide === 'prompt') {
    return (
      <div className={className}>
        <Button className="h-11 w-full" onClick={() => void onInstall()}>
          <DownloadSimple weight="fill" data-icon="inline-start" />
          {t.install}
        </Button>
      </div>
    );
  }

  if (guide === 'ios-safari') {
    return (
      <ol className={cn('flex flex-col gap-3', className)} aria-label={t.stepsLabel}>
        <li className="flex items-center gap-3">
          <StepIcon>
            <Export weight="bold" />
          </StepIcon>
          <span className="flex min-w-0 flex-col">
            <span>
              {t.iosShare.before}
              <span className="font-medium">{t.iosShare.bold}</span>
              {t.iosShare.after}
            </span>
            <span className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
              {t.iosHidden.before}
              <DotsThree role="img" aria-label={t.iosHidden.icon} className="size-4" />
              {t.iosHidden.after}
            </span>
          </span>
        </li>
        <li className="flex items-center gap-3">
          <StepIcon>
            <PlusSquare weight="bold" />
          </StepIcon>
          <span className="flex min-w-0 flex-col">
            <span className="font-medium">{t.iosAdd}</span>
            <span className="text-xs text-muted-foreground">{t.iosAddHint}</span>
          </span>
        </li>
        <li className="flex items-center gap-3">
          <StepIcon>
            <span className="text-xs font-semibold text-primary">{t.iosConfirm}</span>
          </StepIcon>
          <span>
            {t.iosTopRight.before}
            <span className="font-medium">{t.iosTopRight.bold}</span>
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
        {t.macSafari.before}
        <span className="font-medium">{t.macSafari.file}</span>
        {t.macSafari.arrow}
        <span className="font-medium">{t.macSafari.dock}</span>
        {t.macSafari.after}
      </p>
    );
  }

  return (
    <p className={cn('text-sm', className)}>
      {t.menu.before}
      <span className="font-medium">{t.menu.add}</span>
      {t.menu.or}
      <span className="font-medium">{t.menu.install}</span>
      {t.menu.after}
    </p>
  );
}

/** iPhone'da Safari dışı ya da Android'de uygulama içi tarayıcı: asıl tarayıcıda aç ya da bağlantıyı kopyala. */
function OpenElsewhere({ ios, openPath, className }: { ios: boolean; openPath: string; className?: string }) {
  const t = useMessages(uiMessages).installHelper;
  const href = new URL(openPath, window.location.origin).href;
  const open = ios ? safariUrl(href) : chromeIntentUrl(href);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(href);
      toast.success(t.copied);
    } catch {
      toast.error(t.copyFailed);
    }
  };

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <p className="text-sm">
        {ios ? t.needSafari : t.needChrome}
      </p>
      <div className="flex flex-wrap gap-2">
        {open ? (
          <Button className="h-11 grow" nativeButton={false} render={<a href={open} />}>
            {ios ? <Compass weight="fill" data-icon="inline-start" /> : <ArrowSquareOut weight="fill" data-icon="inline-start" />}
            {ios ? t.openSafari : t.openChrome}
          </Button>
        ) : null}
        <Button variant="outline" className="h-11 grow" onClick={copy}>
          <Copy weight="fill" data-icon="inline-start" />
          {t.copyLink}
        </Button>
      </div>
      <span className="text-xs break-all text-muted-foreground select-all">{href}</span>
    </div>
  );
}
