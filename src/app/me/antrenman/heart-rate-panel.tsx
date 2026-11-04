'use client';

import { Bluetooth, Heart, Heartbeat } from '@phosphor-icons/react';
import { X } from '@/components/line-icons';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Spinner } from '@/components/ui/spinner';
import { HEART_LIMIT_SOURCE_TEXT, heartAlertText, heartZone, type HeartLimits, type HeartZone } from '@/lib/heart-rate';
import { cn } from '@/lib/utils';
import {
  connectHeartRate,
  disconnectHeartRate,
  dropFakeHeartRate,
  FAKE_HEART_RATE,
  nudgeFakeHeartRate,
  startFakeHeartRate,
  type HeartRateState,
} from './use-heart-rate';

/**
 * Nabız (Paket C): üst çubuktaki rozet, bağlantı paneli ve yüksek nabız şeridi. Danışana "sen" diye; antrenörden
 * üçüncü kişi olarak söz edilir. Bağlantı ve okumalar `use-heart-rate.ts`'te, kararlar `lib/heart-rate.ts`'te.
 */

/** Bölge rengi: toparlanma ve altı yeşil, arası amber, uyarının üstü kırmızı; ölçüm yoksa soluk. */
const ZONE_CLASS: Record<HeartZone | 'none', string> = {
  calm: 'bg-success/15 text-success',
  work: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  high: 'bg-destructive/15 text-destructive-text',
  none: 'bg-muted text-muted-foreground',
};

const ZONE_LABEL: Record<HeartZone, string> = { calm: 'toparlanmış', work: 'çalışma bölgesinde', high: 'çok yüksek' };

function linked(heart: HeartRateState): boolean {
  return heart.status === 'connected' || heart.status === 'lost' || heart.status === 'connecting';
}

/**
 * Üst çubuğun ikinci satırında: bağlıyken kalp + bpm (bölge rengiyle), koptuysa ya da ölçüm yoksa "—"; bağlı değilken
 * sade "Nabız" düğmesi. Dokununca bağlantı paneli.
 */
export function HeartBadge({ heart, limits, onOpen }: { heart: HeartRateState; limits: HeartLimits; onOpen: () => void }) {
  if (!linked(heart)) {
    return (
      <Button variant="ghost" className="-mr-2 h-8 shrink-0 gap-1 px-2 text-[0.8125rem] text-muted-foreground" onClick={onOpen} aria-label="Nabız bandı bağla">
        <Heart data-icon="inline-start" weight="regular" />
        Nabız
      </Button>
    );
  }
  const zone = heart.bpm !== null && heart.status === 'connected' ? heartZone(heart.bpm, limits) : null;
  const label =
    heart.status === 'connecting'
      ? 'Nabız bandına bağlanıyor'
      : heart.status === 'lost'
        ? 'Nabız bandı koptu, yeniden deneniyor'
        : heart.bpm === null || !zone
          ? 'Nabız ölçülemiyor'
          : `Nabız ${heart.bpm}, ${ZONE_LABEL[zone]}`;
  return (
    <Button
      variant="ghost"
      className={cn('-mr-1 h-8 shrink-0 gap-1 rounded-full px-2.5 text-[0.8125rem] font-semibold tabular-nums', ZONE_CLASS[zone ?? 'none'])}
      onClick={onOpen}
      aria-label={label}>
      {heart.status === 'connecting' ? <Spinner className="size-3.5" aria-hidden /> : <Heart weight="fill" className="size-3.5" aria-hidden />}
      <span aria-hidden className="min-w-[3ch] text-left">
        {heart.status === 'connected' && heart.bpm !== null ? heart.bpm : '—'}
      </span>
    </Button>
  );
}

/** Panelin üst metni: duruma göre ne olduğu ve ne yapılacağı. */
function statusText(heart: HeartRateState): string {
  switch (heart.status) {
    case 'unsupported':
      return "Bu tarayıcı nabız bandına bağlanamıyor. Android'de Chrome kullan; iPhone'da şimdilik yok.";
    case 'idle':
      return 'Göğüs bandını ya da nabzı yayınlayan saatini bağla: dinlenme nabzın inene kadar uzar, nabzın çok yükselirse uyarırız.';
    case 'connecting':
      return 'Bağlanıyor… Açılan listeden bandını seç.';
    case 'connected':
      return `${heart.device ?? 'Nabız bandı'} bağlı.`;
    case 'lost':
      return `${heart.device ?? 'Nabız bandı'} ile bağlantı koptu; yeniden deneniyor… Bu arada dinlenme sayacı süreyle çalışır.`;
  }
}

/**
 * Bağlantı paneli (rozete dokununca): durum ve canlı nabız, bağlan/kes, kullanılan sınırlar ve kaynağı, "Tıbbi cihaz
 * değildir". Yerel geliştirmede ayrıca "Deneme nabzı".
 */
export function HeartSheet({
  open,
  onOpenChange,
  heart,
  limits,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  heart: HeartRateState;
  limits: HeartLimits;
}) {
  const live = heart.status === 'connected' && heart.bpm !== null ? heart.bpm : null;
  const zone = live !== null ? heartZone(live, limits) : null;
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-lg">
        <DrawerHeader>
          <DrawerTitle>Nabız bandı</DrawerTitle>
          <DrawerDescription>{statusText(heart)}</DrawerDescription>
        </DrawerHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4">
          {heart.status === 'connected' ? (
            <p className="flex items-center gap-3">
              <span className={cn('inline-flex size-12 shrink-0 items-center justify-center rounded-full', ZONE_CLASS[zone ?? 'none'])}>
                <Heart weight="fill" className="size-6" aria-hidden />
              </span>
              <span className="flex flex-col">
                <span className="font-heading text-3xl leading-none font-semibold tabular-nums">
                  {live ?? '—'} <span className="text-base font-medium text-muted-foreground">bpm</span>
                </span>
                <span className="text-sm text-muted-foreground">{zone ? `Nabzın ${ZONE_LABEL[zone]}` : 'Ölçüm bekleniyor; bant tenine değsin.'}</span>
              </span>
            </p>
          ) : null}

          <section aria-labelledby="heart-limits-title" className="flex flex-col gap-2">
            <h3 id="heart-limits-title" className="text-sm font-semibold">
              Sınırların
            </h3>
            <dl className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border p-3">
                <dt className="text-[0.8125rem] text-muted-foreground">Toparlanma</dt>
                <dd className="text-lg font-semibold tabular-nums">{limits.recovery} bpm</dd>
                <dd className="text-xs text-muted-foreground">Dinlenme nabzın buna inene kadar uzar.</dd>
              </div>
              <div className="rounded-lg border p-3">
                <dt className="text-[0.8125rem] text-muted-foreground">Uyarı</dt>
                <dd className="text-lg font-semibold tabular-nums">{limits.alert} bpm</dd>
                <dd className="text-xs text-muted-foreground">Üstünde kalırsa uyarırız.</dd>
              </div>
            </dl>
            <p className="text-[0.8125rem] text-muted-foreground">{HEART_LIMIT_SOURCE_TEXT[limits.source]}</p>
          </section>

          {heart.problem ? (
            <p role="alert" className="text-sm text-destructive-text">
              {heart.problem}
            </p>
          ) : null}
          <p className="text-[0.8125rem] text-muted-foreground">Tıbbi cihaz değildir. Nabız kaydedilmez.</p>

          {FAKE_HEART_RATE ? <FakeControls heart={heart} /> : null}
        </div>
        <DrawerFooter>
          {heart.status === 'idle' ? (
            <Button size="lg" className="h-12 text-base" onClick={() => void connectHeartRate()}>
              <Bluetooth data-icon="inline-start" />
              Bağlan
            </Button>
          ) : heart.status === 'connecting' ? (
            <Button size="lg" className="h-12 text-base" disabled>
              <Spinner data-icon="inline-start" />
              Bağlanıyor…
            </Button>
          ) : heart.status === 'connected' || heart.status === 'lost' ? (
            <Button size="lg" variant="outline" className="h-12 text-base" onClick={disconnectHeartRate}>
              Bağlantıyı kes
            </Button>
          ) : null}
          <Button variant="ghost" className="h-11" onClick={() => onOpenChange(false)}>
            Kapat
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

/** Yalnız yerel geliştirmede: bant olmadan denemek için yapay nabız (sette yükselir, dinlenmede iner). */
function FakeControls({ heart }: { heart: HeartRateState }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
      <p className="text-[0.8125rem] text-muted-foreground">Yalnız geliştirmede: bant olmadan dene. Sette yükselir, dinlenmede iner.</p>
      {heart.fake ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" className="h-10 tabular-nums" onClick={() => nudgeFakeHeartRate(-15)}>
            −15
          </Button>
          <Button variant="secondary" className="h-10 tabular-nums" onClick={() => nudgeFakeHeartRate(15)}>
            +15
          </Button>
          <Button variant="secondary" className="h-10" disabled={heart.status === 'lost'} onClick={dropFakeHeartRate}>
            Kopmayı dene
          </Button>
        </div>
      ) : (
        <Button variant="secondary" className="h-10 self-start" onClick={startFakeHeartRate}>
          <Heartbeat data-icon="inline-start" />
          Deneme nabzı
        </Button>
      )}
    </div>
  );
}

/**
 * Yüksek nabız şeridi (üst çubuğun altında, dinlenme panelinin de üstünde görünür): kapatılabilir; nabız sınırın 5 altına
 * inince kendiliğinden kalkar. Titreşim ve ses ekrandan.
 */
export function HeartAlertBanner({ bpm, onDismiss }: { bpm: number; onDismiss: () => void }) {
  return (
    <div role="alert" className="flex min-h-12 shrink-0 items-center gap-2 border-b border-destructive/40 bg-destructive/15 pr-1 pl-4 text-destructive-text">
      <Heartbeat weight="fill" className="size-5 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1 py-2 text-sm leading-snug font-semibold">{heartAlertText(bpm)}</p>
      <Button variant="ghost" className="size-11 shrink-0 p-0 text-destructive-text hover:bg-destructive/15" aria-label="Uyarıyı kapat" onClick={onDismiss}>
        <X className="size-5" />
      </Button>
    </div>
  );
}
