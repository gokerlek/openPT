'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, QrCode as QrIcon, WarningCircle } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { QrCode } from '@/components/qr-code';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { Spinner } from '@/components/ui/spinner';
import { useLocale, useMessages } from '@/i18n/client';
import { ptClientsMessages } from '@/i18n/messages/pt-clients';
import { formatInviteCode } from '@/lib/client-status';
import { getFormat } from '@/lib/format';
import { fetchJson } from '@/lib/query/errors';
import { useServiceMutation } from '@/lib/query/use-service';

type Issued = { code: string; expiresAt: string; url: string };

/**
 * Kare kod üretir ve gösterir. Birincil öğe kare kod ve bağlantı; 8 haneli kod ikincil (bağlantı
 * açılmazsa elle yazılır). Kod yalnız bu bileşenin belleğinde yaşar: repo'ya özeti yazılır, sayfadan
 * çıkınca bir daha gösterilemez — gerekirse yenisi üretilir. Yeni kare kod aynı zamanda şifre
 * sıfırlamanın tek yolu: danışan onunla girip yeni şifre belirler (SPEC §5).
 */
export function InvitePanel({
  clientId,
  clientName,
  hasPending,
  joined,
  timeZone,
}: {
  clientId: string;
  clientName: string;
  /** Geçerli, kullanılmamış bir davet var: yenisi onu geçersiz kılar. */
  hasPending: boolean;
  /** Danışan zaten girdi: yeni kare kod şifre sıfırlamak içindir, açık oturumu kapatmaz. */
  joined: boolean;
  /** Uygulama ayarındaki saat dilimi: son kullanma saati PT'nin saatiyle yazılır. */
  timeZone: string;
}) {
  const t = useMessages(ptClientsMessages).invite.panel;
  const { dateTime } = getFormat(useLocale());
  const router = useRouter();
  const [issued, setIssued] = useState<Issued | null>(null);

  const issue = useServiceMutation({
    fn: () => fetchJson<Issued>(`/api/clients/${clientId}/invite`, { method: 'POST' }),
    onSuccess: (result) => {
      setIssued(result);
      // Sağdaki durum kartı yeni daveti göstersin; bu bileşenin durumu korunur.
      router.refresh();
    },
  });

  const copy = async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.url);
      toast.success(t.copied);
    } catch {
      toast.error(t.copyFailed);
    }
  };

  const again = joined || hasPending || Boolean(issued);
  const generate = (
    <div className="flex flex-col items-center gap-2 text-center">
      <Button onClick={() => issue.mutate()} disabled={issue.isPending}>
        {issue.isPending ? <Spinner data-icon="inline-start" /> : <QrIcon data-icon="inline-start" weight="fill" />}
        {again ? t.generateAgain : t.generate}
      </Button>
      {again ? (
        <p className="text-xs text-muted-foreground">{t.passwordReset}</p>
      ) : null}
    </div>
  );

  if (!issued) {
    return (
      <Card>
        <CardContent>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <QrIcon weight="fill" />
              </EmptyMedia>
              <EmptyTitle>
                {joined ? t.joinedTitle(clientName) : hasPending ? t.pendingTitle : t.noneTitle}
              </EmptyTitle>
              <EmptyDescription>
                {joined ? t.joinedBody : hasPending ? t.pendingBody : t.noneBody(clientName)}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>{generate}</EmptyContent>
          </Empty>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.codeTitle(clientName)}</CardTitle>
        <CardDescription>{t.expires(dateTime(issued.expiresAt, timeZone))}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-5">
        <QrCode value={issued.url} label={t.qrLabel(clientName)} className="w-full max-w-64 border" />

        <InputGroup className="w-full">
          <InputGroupInput readOnly value={issued.url} aria-label={t.linkLabel} onFocus={(e) => e.currentTarget.select()} />
          <InputGroupAddon align="inline-end">
            <InputGroupButton onClick={copy} aria-label={t.copyLabel}>
              <Copy weight="fill" />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>

        <div className="flex w-full flex-col gap-1 rounded-lg border border-dashed p-3 text-sm">
          <span className="text-muted-foreground">{t.manualTitle}</span>
          <span className="font-mono font-medium tabular-nums">{formatInviteCode(issued.code)}</span>
          <span className="text-xs text-muted-foreground">{t.manualHint}</span>
        </div>

        <Alert>
          <WarningCircle weight="fill" />
          <AlertDescription>{t.once(clientName)}</AlertDescription>
        </Alert>

        {generate}
      </CardContent>
    </Card>
  );
}
