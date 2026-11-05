'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CaretRight, FirstAidKit } from '@phosphor-icons/react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { useLocale } from '@/i18n/client';
import { DEFAULT_LOCALE, type Locale } from '@/i18n/locale';
import { clientHomeMessages } from '@/i18n/messages/client-home';
import type { HealthConsentState } from '@/lib/client-status';
import { fetchJson } from '@/lib/query/errors';
import { useServiceMutation } from '@/lib/query/use-service';
import { HEALTH_CONSENT_VERSION, healthFieldInfo, type HealthField } from '@/lib/schemas/client';

/** Onay kartının cümlesi için kısa adlar: "antrenörün ağrı ve ölçüm kayıtlarını görebilir". */

/** Parça adları cümle içinde ("kısıtlar ve hareket taraması için yeni onay gerekiyor"). */

/**
 * Sürümü değişen parçalar yeniden sorulurken ötekiler sürer (tasarım `kisit-tarama.md` §5.1): "Kısıtlar ve hareket
 * taraması için yeni onay gerekiyor; ağrı takibi ve ölçümler sürüyor."
 */
export function outdatedText(outdated: readonly HealthField[], continuing: readonly HealthField[], locale: Locale = DEFAULT_LOCALE): string | null {
  if (outdated.length === 0 || continuing.length === 0) return null;
  const t = clientHomeMessages(locale).consent;
  return t.outdated(
    outdated.map((field) => t.parts[field]),
    continuing.map((field) => t.parts[field]),
  );
}

/**
 * Sağlık verisi onayı (SPEC §9.4). PT modülü açsa da danışan onaylamadan hiçbir sağlık
 * kaydı tutulmaz; onay istendiği an geri çekilebilir. Metnin sürümü değişirse
 * (`HEALTH_CONSENT_VERSION`) yeniden sorulur. Telefon: karar düğmeleri 44 px, onaydan sonra da
 * kapsam listesi görünür (danışan neyin tutulduğunu her zaman görür).
 */
export function ConsentCard({
  state,
  fields,
  outdated = [],
  continuing = [],
  healthPage = false,
}: {
  state: Exclude<HealthConsentState, 'off'>;
  fields: HealthField[];
  /** Yeniden onay bekleyen parçalar (sürümü değişen ya da eklenen). */
  outdated?: HealthField[];
  /** Onayı sürenler: bu arada kayıtları kesintisiz. */
  continuing?: HealthField[];
  /** "Sağlık sayfan ›" bağlantısı (kısıtlar ya da tarama onaylıysa). */
  healthPage?: boolean;
}) {
  const router = useRouter();
  const locale = useLocale();
  const t = clientHomeMessages(locale).consent;
  const info = healthFieldInfo(locale);
  const decide = useServiceMutation({
    fn: (granted: boolean) =>
      fetchJson<{ ok: true }>('/api/me/consent', {
        method: 'POST',
        // Gösterilen liste ve metin sürümü: PT bu arada değiştirdiyse sunucu reddeder.
        body: JSON.stringify({ granted, fields, version: HEALTH_CONSENT_VERSION }),
      }),
    onSuccess: (_data, granted) => {
      toast.success(granted ? t.granted : t.declinedSaved);
      router.refresh();
    },
    // Liste değiştiyse güncelini göster.
    onError: () => router.refresh(),
  });

  const list = (
    <ul className="flex flex-col gap-3">
      {fields.map((field) => (
        <li key={field} className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">{info[field].label}</span>
          <span className="text-sm text-muted-foreground">{info[field].description}</span>
        </li>
      ))}
    </ul>
  );

  if (state === 'granted') {
    return (
      <Card size="sm">
        <CardHeader>
          <CardTitle>{t.title}</CardTitle>
          <CardDescription>{t.on(fields.map((field) => t.short[field]))}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {list}
          {healthPage ? (
            <Link href="/me/saglik" className="flex min-h-11 w-fit items-center gap-1 text-sm font-medium underline-offset-4 hover:underline">
              {t.healthPage}
              <CaretRight className="size-4" />
            </Link>
          ) : null}
        </CardContent>
        <CardFooter>
          <AlertDialog>
            <AlertDialogTrigger render={<Button variant="outline" className="h-11 w-full" />}>{t.withdraw}</AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t.withdrawQuestion}</AlertDialogTitle>
                <AlertDialogDescription>{t.withdrawText(fields.includes('conditions'))}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="h-11">{t.cancel}</AlertDialogCancel>
                <AlertDialogAction className="h-11" disabled={decide.isPending} onClick={() => decide.mutate(false)}>
                  {decide.isPending ? <Spinner data-icon="inline-start" /> : null}
                  {t.withdrawConfirm}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardFooter>
      </Card>
    );
  }

  if (state === 'declined') {
    return (
      <Card size="sm">
        <CardHeader>
          <CardTitle>{t.off}</CardTitle>
          <CardDescription>{t.offText}</CardDescription>
        </CardHeader>
        <CardContent>{list}</CardContent>
        <CardFooter>
          <Button className="h-11 w-full" disabled={decide.isPending} onClick={() => decide.mutate(true)}>
            {decide.isPending ? <Spinner data-icon="inline-start" /> : null}
            {t.agree}
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FirstAidKit weight="fill" className="size-5 text-primary" />
          {t.askTitle}
        </CardTitle>
        <CardDescription>{state === 'outdated' ? (outdatedText(outdated, continuing, locale) ?? t.restarted) : t.ask}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {list}
        <p className="text-sm text-muted-foreground">{t.privacy}</p>
      </CardContent>
      <CardFooter className="flex flex-col gap-2">
        <Button className="h-11 w-full" disabled={decide.isPending} onClick={() => decide.mutate(true)}>
          {decide.isPending && decide.variables ? <Spinner data-icon="inline-start" /> : null}
          {t.agree}
        </Button>
        <Button variant="outline" className="h-11 w-full" disabled={decide.isPending} onClick={() => decide.mutate(false)}>
          {t.notNow}
        </Button>
      </CardFooter>
    </Card>
  );
}
