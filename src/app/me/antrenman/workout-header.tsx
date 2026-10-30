'use client';

import { ArrowsLeftRight, CaretLeft, CloudSlash, Drop, Pause, WarningCircle } from '@phosphor-icons/react';
import { DotsThree } from '@/components/line-icons';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

/** Gönderimin durumu (üst çubuğun alt satırı): çevrimdışı ya da yoğun (soluk), hata ya da oturum kapandı (uyarı). */
export type WorkoutStatus = { tone: 'warn' | 'offline'; text: string; retry?: boolean };

/**
 * Antrenman ekranının üst çubuğu (Faz 2, tasarım `antrenman-ekrani.md` §2.4). İlk satır: solda odakta "‹ Liste" (geri
 * tuşuyla aynı yer), listede boş (başlık ortada kalır); ortada `[program ·] gün · mm:ss` (program adı daralır, gün ve
 * süre kalır); sağda **Bitir** ve ⋯ menüsü (**Antrenmanı değiştir**, **Ara ver**). İkinci satır: set ilerleme çubuğu,
 * "Hareket 2/5 · 7/17 set" ve su. Gönderim sorunu varsa üçüncü satır. Dinlenme paneli çubuğu örtmez: her an dokunulur.
 */
export function WorkoutHeader({
  program,
  day,
  elapsed,
  unit,
  sets,
  water,
  status,
  busy,
  onList,
  onFinish,
  onSwitch,
  onPause,
  onRetry,
}: {
  /** Kendi programın adı; PT programında null (gün adı yeter). */
  program: string | null;
  day: string;
  /** Geçen süre ("24:18"). */
  elapsed: string;
  /** "Hareket 2/5": listenin "şu an" satırının sırası ve atlanmamış hareket sayısı. */
  unit: { index: number; total: number };
  sets: { done: number; planned: number };
  water: number;
  status: WorkoutStatus | null;
  /** Antrenman bitiriliyor (ya da değiştiriliyor): "Antrenmanı değiştir" devre dışı. */
  busy: boolean;
  /** Odakta "‹ Liste"; listede null. */
  onList: (() => void) | null;
  onFinish: () => void;
  onSwitch: () => void;
  onPause: () => void;
  onRetry: () => void;
}) {
  return (
    <header className="shrink-0 border-b pt-[env(safe-area-inset-top)]">
      {/* Yan sütunlar eşit ve sabit: başlık ekranın ortasında kalır ("‹ Liste" görünse de görünmese de). Orta sütun daralır:
          uzun program adı kısalır, gün, süre, "Bitir" ve ⋯ ekranda kalır. */}
      <div className="grid h-13 grid-cols-[6.5rem_minmax(0,1fr)_6.5rem] items-center px-1">
        {onList ? (
          <Button variant="ghost" className="h-11 justify-self-start px-2" onClick={onList}>
            <CaretLeft data-icon="inline-start" weight="bold" />
            Liste
          </Button>
        ) : (
          <span aria-hidden />
        )}
        <p className="flex max-w-full min-w-0 justify-self-center font-heading font-semibold whitespace-nowrap tabular-nums">
          {program ? <span className="truncate">{program}</span> : null}
          <span className="shrink-0">
            {program ? '\u00a0· ' : ''}
            {day} · {elapsed}
          </span>
        </p>
        <div className="flex items-center justify-self-end">
          <Button variant="ghost" className="h-11 px-3" onClick={onFinish}>
            Bitir
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" className="size-11 p-0" aria-label="Antrenman menüsü" />}>
              <DotsThree weight="bold" className="size-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56">
              <DropdownMenuItem className="min-h-11" disabled={busy} onClick={onSwitch}>
                <ArrowsLeftRight />
                Antrenmanı değiştir
              </DropdownMenuItem>
              <DropdownMenuItem className="min-h-11" onClick={onPause}>
                <Pause />
                Ara ver
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="flex h-11 items-center gap-3 px-4">
        <Progress value={sets.planned > 0 ? (sets.done / sets.planned) * 100 : 0} aria-label="Antrenmanın ilerlemesi" className="min-w-16 flex-1" />
        <span className="text-[0.8125rem] whitespace-nowrap text-muted-foreground tabular-nums">
          Hareket {unit.index}/{unit.total} · {sets.done}/{sets.planned} set
        </span>
        {water > 0 ? (
          <span className="inline-flex items-center gap-0.5 text-[0.8125rem] text-muted-foreground tabular-nums">
            <Drop className="size-3.5 text-primary" aria-hidden />
            <span aria-hidden>{water}</span>
            <span className="sr-only">Su: {water} bardak</span>
          </span>
        ) : null}
      </div>
      {status ? (
        <div role="status" className={cn('flex min-h-9 items-center gap-2 border-t px-4 text-[0.8125rem]', status.tone === 'warn' ? 'text-destructive' : 'text-muted-foreground')}>
          {status.tone === 'offline' ? <CloudSlash className="size-4 shrink-0" /> : <WarningCircle className="size-4 shrink-0" />}
          <span className="min-w-0 flex-1">{status.text}</span>
          {status.retry ? (
            <Button variant="ghost" className="-mr-2 h-11 px-2" onClick={onRetry}>
              Tekrar dene
            </Button>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
