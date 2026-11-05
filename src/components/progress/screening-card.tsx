'use client';

import Link from 'next/link';
import { ArrowDown, ArrowUp, CaretRight, WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { useLocale } from '@/i18n/client';
import { clientProgressMessages } from '@/i18n/messages/client-progress';
import { getFormat } from '@/lib/format';
import type { ProgressInsights } from '@/lib/progress-insights';
import { progressCopy, type ProgressViewer } from '@/lib/progress-text';
import { progressScreening, type ClientScreeningRow } from '@/lib/screening';
import { ProgressCard } from './progress-card';

/**
 * Tarama satırları (tasarım `kisit-tarama.md` §5.2): test başına sözcük, taraf, önceki taramaya göre ok ve en çok bir
 * odak. Sayı ve toplam yok; renk tek başına bilgi taşımaz (ok ekran okuyucuya yazıyla). Danışanın Sağlık sayfası ve
 * İlerleme'deki tarama kartı ortak.
 */
export function ScreeningRows({ rows }: { rows: readonly ClientScreeningRow[] }) {
  const t = clientProgressMessages(useLocale()).cards;
  return (
    <ul className="flex flex-col divide-y rounded-lg border">
      {rows.map((row) => (
        <li key={row.testId} className="flex flex-col gap-1 p-3 text-sm">
          <p className="font-medium">{row.title}</p>
          {row.sides.map((side) => (
            <p key={side.side} className="flex items-start gap-2">
              {side.label ? <span className="w-8 shrink-0 text-muted-foreground">{side.label}</span> : null}
              <span className="flex-1">{side.text}</span>
              {side.change === 'up' ? <ArrowUp weight="bold" className="mt-0.5 size-4 shrink-0 text-primary" aria-label={t.screeningUp} /> : null}
              {side.change === 'down' ? <ArrowDown weight="bold" className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label={t.screeningDown} /> : null}
            </p>
          ))}
          {row.focus ? (
            <p className="text-muted-foreground">
              {t.screeningFocus} {row.focus}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * İlerleme'de tarama kartı (tasarım `kisit-tarama.md` §6, faz 6): en yeni hareket taraması sözcükle, bir önceki
 * taramaya göre ↑ ↓ ve odak satırı; puan, sayı ve toplam yok. Yalnız `screening` onayı varken (`off` ise hiç
 * çizilmez; kayıt okunamadıysa söyler). Danışanda Sağlık sayfasının metinleri ve "Sağlık sayfan"; PT'de tarama
 * sayfasının sözcükleri ve tarama sayfasına bağlantı. Danışanda tarama yoksa kart yok; PT'de boş durum.
 */
export function ScreeningCard({
  viewer,
  screening,
  clientId,
}: {
  viewer: ProgressViewer;
  screening: ProgressInsights['screening'];
  /** PT: tarama sayfasının bağlantısı. */
  clientId?: string;
}) {
  const locale = useLocale();
  const t = clientProgressMessages(locale).cards;
  const f = getFormat(locale);
  if (screening.state === 'off') return null;
  const pt = viewer === 'pt';
  const view = screening.state === 'ok' ? progressScreening(screening.screenings, viewer, locale) : null;
  if (!view && !pt && screening.state === 'ok') return null;
  const href = pt ? `/dashboard/clients/${clientId}/screening${view ? '' : '/new'}` : '/me/saglik';
  const description = view
    ? `${f.day(view.date)} · ${pt ? t.screeningPt : t.screeningClient}`
    : pt
      ? t.screeningNone
      : undefined;
  return (
    <ProgressCard viewer={viewer} title={t.screening} description={description}>
      {screening.state === 'unavailable' ? (
        <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
          <WarningCircle weight="fill" className="mt-0.5 size-4 shrink-0" aria-hidden />
          {progressCopy(viewer, undefined, locale).unavailable(t.screeningResults(pt))}
        </p>
      ) : null}
      {view ? <ScreeningRows rows={view.rows} /> : null}
      {view?.previousDate ? <p className="text-xs text-muted-foreground">{t.screeningPrevious(f.day(view.previousDate))}</p> : null}
      {pt || view ? (
        <Link
          href={href}
          className="flex min-h-11 items-center gap-1 self-start text-sm font-medium text-primary-text underline-offset-4 hover:underline">
          {pt ? (view ? t.screeningPage : t.screeningStart) : t.healthPage}
          <CaretRight weight="bold" className="size-3.5" aria-hidden />
        </Link>
      ) : null}
    </ProgressCard>
  );
}
