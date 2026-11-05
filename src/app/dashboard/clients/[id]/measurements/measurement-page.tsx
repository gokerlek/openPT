import 'server-only';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Info, WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { measurementsMessages } from '@/i18n/messages/measurements';
import { getLocale } from '@/i18n/server';
import { loadClient } from '@/lib/clients';
import { healthLockInfo, type MeasurementLock } from '@/lib/measurement-log';
import type { Client } from '@/lib/schemas/client';
import { CLIENT_ID_PATTERN } from '@/lib/schemas/client';

/** Ölçüm sayfalarının ortak parçaları (yalnız sunucu). */

/**
 * Danışan kaydı; kimlik geçersiz ya da danışan yoksa 404. Kayıt okunamıyorsa sorunu.
 * i18n-followup(T2): `loadClient`'in `problem` metni (`lib/clients.ts`) Türkçe; dile göre metin ya da kod gerekir.
 */
export async function measurementClient(id: string): Promise<{ ok: true; client: Client } | { ok: false; problem: string }> {
  if (!CLIENT_ID_PATTERN.test(id)) notFound();
  const loaded = await loadClient(id);
  if (!loaded) notFound();
  return loaded;
}

/** Modül kapalı ya da onay yoksa formun ve grafiklerin yerine: neden ve ne yapılmalı. */
export async function MeasurementLockAlert({ lock, clientId }: { lock: MeasurementLock; clientId: string }) {
  const locale = await getLocale();
  const t = measurementsMessages(locale).page;
  const info = healthLockInfo('measurements', lock, locale);
  // Modülü PT açar (düzenleme sayfası); onay danışanın elinde (danışan sayfasında durumu görünür).
  const byPt = lock === 'off' || lock === 'not_selected';
  return (
    <Alert>
      <Info weight="fill" />
      <AlertTitle>{info.title}</AlertTitle>
      <AlertDescription>
        <p>{info.description}</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-1"
          nativeButton={false}
          render={<Link href={byPt ? `/dashboard/clients/${clientId}/edit` : `/dashboard/clients/${clientId}`} />}>
          {byPt ? t.lockEdit : t.lockBack}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export function MeasurementProblemAlert({ title, problem }: { title: string; problem: string }) {
  return (
    <Alert variant="destructive">
      <WarningCircle weight="fill" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{problem}</AlertDescription>
    </Alert>
  );
}
