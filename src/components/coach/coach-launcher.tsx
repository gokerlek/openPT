'use client';
import { useEffect, useEffectEvent, useState, type MouseEvent } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { X } from '@/components/line-icons';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { CoachPanel } from './coach-panel';
import { coachClientOf, coachSelection, consumeAutoReview, coachPageLabels, type CoachOpen, type CoachRequest } from '@/lib/ai/coach-context';
import { useLocale, useMessages } from '@/i18n/client';
import { coachMessages } from '@/i18n/messages/coach';
import { fetchJson } from '@/lib/query/errors';
import type { CoachHighlight } from '@/lib/ai/coach-highlights';
const OPEN_EVENT = 'pulsecoach:coach-open';
export type { CoachOpen };

/** AI koç panelini açar (PT avatar menüsündeki "AI koç", sayfalardaki `CoachButton`); panel `CoachLauncher`'da, sabit düğme yok. */
export function openCoach(detail: CoachOpen = {}) {
  window.dispatchEvent(new CustomEvent<CoachOpen>(OPEN_EVENT, { detail }));
}
export function CoachLauncher({ role, clientId }: { role: 'pt' | 'client'; clientId?: string }) {
  const t = useMessages(coachMessages).launcher, locale = useLocale();
  const pathname = usePathname(), routeClient = role === 'pt' ? coachClientOf(pathname) : clientId ?? null;
  const [open, setOpen] = useState(false), [generalPath, setGeneralPath] = useState<string | null>(null);
  // Her açılış yeni istek: bağlamı öncekinin yerine geçer (`openCoach()` boş bağlamla), `n` paneli sıfırdan kurar.
  const [request, setRequest] = useState<CoachRequest>({ n: 0, path: '', detail: {} });
  const show = useEffectEvent((detail: CoachOpen) => { setRequest(r => ({ n: r.n + 1, path: pathname, detail })); setOpen(true); });
  useEffect(() => {
    const listener = (event: Event) => show((event as CustomEvent<CoachOpen>).detail ?? {});
    window.addEventListener(OPEN_EVENT, listener);
    return () => window.removeEventListener(OPEN_EVENT, listener);
  }, []);
  // Bağlam açıldığı sayfaya ait (`coachSelection`): panel açıkken geri/ileri gidilince danışan yine yoldan gelir,
  // dönünce bağlam yeniden uygulanır. Değerlendirme yinelenmez: panel onu gönderirken `onAutoReview` isteği tüketir.
  const { selected, page, general, initialTab, autoReview, toggle, key } = coachSelection({ role, routeClient, generalPath, pathname, request });
  // Paneldeki bir bağlantıyla başka sayfaya geçilince modal açık kalıp yeni sayfayı örtmesin (yeni sekme açan tıklamalar hariç).
  const closeOnNavigate = (event: MouseEvent) => { if (followsLink(event)) setOpen(false); };
  return <>
    {role === 'client' && clientId ? <CoachNudge key={`${clientId}:${pathname}`} clientId={clientId} onOpen={() => openCoach()} /> : null}
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="w-full! sm:max-w-xl! h-dvh gap-0 pb-[env(safe-area-inset-bottom)] [&>[data-slot=sheet-close]]:size-11">
        <SheetHeader className="shrink-0 pr-14 pt-[max(1rem,env(safe-area-inset-top))]">
          <SheetTitle className="text-xl">{t.title}</SheetTitle>
          <SheetDescription>{role === 'client' ? t.scopeClient : selected ? t.scopeSelected : t.scopeAll}{coachPageLabels(locale)[page]}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6" onClickCapture={closeOnNavigate}>
          {toggle ? <Button className="mb-4 h-11 w-full" variant="outline" onClick={() => { setGeneralPath(selected ? pathname : null); setRequest(r => ({ ...r, detail: {} })); }}>{selected ? t.evaluateAll : t.backToClient}</Button> : null}
          <CoachPanel key={key} clientId={selected ?? 'c_ptgeneral'} role={role} page={page} general={general} initialTab={initialTab} autoReview={autoReview} onAutoReview={() => setRequest(consumeAutoReview)} />
          {role === 'client' ? <Link href="/me/ayarlar" className="mt-6 inline-block underline">{t.preferencesLink}</Link> : null}
        </div>
      </SheetContent>
    </Sheet>
  </>;
}
/** Aynı sekmede, bu sitede bir sayfaya götüren düz tıklama (klavyeyle Enter da `click` doğurur). */
function followsLink(event: MouseEvent) {
  const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!(link instanceof HTMLAnchorElement) || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  return (!link.target || link.target === '_self') && !link.hasAttribute('download') && link.origin === window.location.origin;
}
function CoachNudge({ clientId, onOpen }: { clientId: string; onOpen: () => void }) {
  const t = useMessages(coachMessages).launcher;
  const query = useQuery({ queryKey: ['coach', clientId, 'highlights'], queryFn: () => fetchJson<CoachHighlight[]>('/api/me/coach/highlights'), staleTime: 60000 });
  const [dismissed, setDismissed] = useState<string[]>(() => {
    try { const stored: unknown = JSON.parse(sessionStorage.getItem(`coach-dismissed:${clientId}`) ?? '[]'); return Array.isArray(stored) ? stored.filter((item): item is string => typeof item === 'string') : []; } catch { return []; }
  });
  const active = query.data?.filter(item => !dismissed.includes(item.id)) ?? [];
  if (!active.length) return null;
  const close = () => {
    const next = [...new Set([...dismissed, ...active.map(item => item.id)])].slice(-90);
    setDismissed(next); try { sessionStorage.setItem(`coach-dismissed:${clientId}`, JSON.stringify(next)); } catch { /* Dismissal still works in memory. */ }
  };
  // Düzenleyicinin yüzen Kaydet'i görünürken onun üstünde durur (`--editor-save-space`).
  return <aside aria-label={t.nudgeTitle} className="fixed right-4 bottom-[calc(var(--dock-clearance,6rem)+1rem+var(--editor-save-space,0px))] z-40 max-h-[35dvh] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border bg-popover p-4 shadow-lg">
    <div className="flex items-center justify-between"><p className="font-semibold">{t.nudgeTitle}</p><Button size="icon" variant="ghost" className="size-11" aria-label={t.nudgeClose} onClick={close}><X /></Button></div>
    {active.map(item => <p key={item.id} className="mt-2 text-sm leading-relaxed">{item.text}</p>)}
    <Button variant="outline" className="mt-3 h-11 w-full" onClick={() => { close(); onOpen(); }}>{t.nudgeOpen}</Button>
  </aside>;
}
