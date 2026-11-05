'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { discardDraft } from '@/components/block-editor/editor-draft';
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';
import { Check } from '@/components/line-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { useMessages } from '@/i18n/client';
import { clientProgramsMessages } from '@/i18n/messages/client-programs';
import { fetchJson } from '@/lib/query/errors';
import { ownProgramDraftKey } from '@/lib/unsaved-changes';
import { clearLocalWorkout, clearWorkoutCache } from '../../workout-storage';

/**
 * Program sekmesinin eylemleri (`docs/design/kendi-program.md` §2.3, §2.7, §2.8) — istemcide: Bugün'ün programı
 * yap (kalıcı seçim), antrenörle paylaş (sheet'le onay; kapatma yerelde, "Geri al" süresi bitince gider), onaylı
 * silme (yarım antrenman bu programdansa satır içi [Yarım antrenmanı sil]) ve "Antrenörün düzenledi" rozetinin
 * görüldü bilgisi (telefonda).
 */

const JSON_HEADERS = { 'Content-Type': 'application/json' };
/** Kapatmanın "Geri al" süresi (§2.7). */
const UNSHARE_DELAY_MS = 8000;
const TOAST_BUTTONS = { actionButton: 'touch:min-h-11 touch:px-3! touch:text-sm!' };

/** "Bugün'ün programı yap" (kalıcı seçim): PT'ye bildirilir; `programId` null PT'nin programı. */
export function MakeActiveButton({ programId, name, className }: { programId: string | null; name: string; className?: string }) {
  const router = useRouter();
  const t = useMessages(clientProgramsMessages).actions;
  const [busy, setBusy] = useState(false);
  const select = async () => {
    setBusy(true);
    try {
      await fetchJson('/api/me/programs/active', { method: 'POST', body: JSON.stringify({ programId }) });
      toast.success(programId ? t.activeOwn(name) : t.activePt);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.selectFailed);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button variant="outline" className={className ?? 'h-11'} disabled={busy} onClick={() => void select()}>
      {busy ? <Spinner data-icon="inline-start" /> : <Check data-icon="inline-start" />}
      {t.makeActive}
    </Button>
  );
}

/**
 * "Antrenörünle paylaş" (§2.7): açmak sheet'le onaylanır ve hemen yazılır; kapatmak Switch'i yerelde kapatır,
 * istek "Geri al" süresi dolunca, sayfa gizlenince ya da sayfadan çıkınca `keepalive`'la gider ("Geri al" bedava).
 * Gönderilemezse Switch açığa döner ve söylenir: kapattığını sanan danışanın programı açık kalmasın.
 */
export function ShareSwitch({ programId, name, shared: initial }: { programId: string; name: string; shared: boolean }) {
  const router = useRouter();
  const t = useMessages(clientProgramsMessages).actions;
  const [shared, setShared] = useState(initial);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef<{ timer: number; toast: string | number } | null>(null);

  const post = useCallback(
    (value: boolean, keepalive = false) =>
      fetch(`/api/me/programs/${programId}/share`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ shared: value }), keepalive }),
    [programId],
  );

  /** Bekleyen kapatmayı gönderir (bir kez). */
  const flush = useCallback(
    (keepalive: boolean) => {
      const current = pending.current;
      if (!current) return;
      pending.current = null;
      window.clearTimeout(current.timer);
      toast.dismiss(current.toast);
      const failed = () => {
        setShared(true);
        toast.error(t.unshareFailed);
      };
      post(false, keepalive).then((response) => {
        if (!response.ok) failed();
        else if (!keepalive) router.refresh();
      }, failed);
    },
    [post, router, t],
  );

  useEffect(() => {
    const onHide = () => flush(true);
    const hidden = () => {
      if (document.visibilityState === 'hidden') flush(true);
    };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', hidden);
      // Sayfadan çıkış (uygulama içi gezinme): bekleyen kapatma hemen gider.
      flush(true);
    };
  }, [flush]);

  /** Bekleyen kapatmayı iptal eder (sunucu hâlâ paylaşımlı); iptal ettiyse true. */
  const cancelPending = () => {
    const current = pending.current;
    if (!current) return false;
    pending.current = null;
    window.clearTimeout(current.timer);
    // "Geri al" tostu kendisi kapatır; Switch'e dokunulunca tost açık kalırdı.
    toast.dismiss(current.toast);
    setShared(true);
    return true;
  };

  const unshare = () => {
    setShared(false);
    const id = toast(t.unsharing, {
      description: t.unsharingText(name),
      duration: UNSHARE_DELAY_MS,
      classNames: TOAST_BUTTONS,
      action: {
        label: t.undo,
        onClick: () => {
          cancelPending();
        },
      },
    });
    pending.current = { timer: window.setTimeout(() => flush(false), UNSHARE_DELAY_MS), toast: id };
  };

  const share = async () => {
    // Bekleyen kapatma paylaşımı sonradan geri almasın.
    cancelPending();
    setBusy(true);
    try {
      const response = await post(true);
      if (!response.ok) throw new Error();
      setShared(true);
      setAsking(false);
      toast.success(t.sharedToast);
      router.refresh();
    } catch {
      toast.error(t.shareFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
        <span className="flex flex-col gap-0.5">
          <span className="font-medium">{t.share}</span>
          <span className="text-sm text-muted-foreground">{shared ? t.sharedOn : t.sharedOff}</span>
        </span>
        {/* Anahtar küçük: dokunma alanı satırın tamamı (44 px). Kapatma beklerken açmak "Geri al"dır (sunucu hâlâ paylaşımlı). */}
        <Switch
          checked={shared}
          disabled={busy}
          onCheckedChange={(checked) => (checked ? cancelPending() || setAsking(true) : unshare())}
          aria-label={t.share}
        />
      </label>
      <Drawer open={asking} onOpenChange={(open) => (busy ? undefined : setAsking(open))}>
        <DrawerContent showCloseButton={false} className="gap-0" data-base-ui-swipe-ignore={busy || undefined}>
          <DrawerHeader className="gap-1.5 pt-5">
            <DrawerTitle className="text-lg font-semibold">{t.shareQuestion(name)}</DrawerTitle>
            <DrawerDescription render={<div />} className="flex flex-col gap-3">
              <ul className="flex list-disc flex-col gap-1 pl-5">
                {t.sharePoints.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
              <span>{t.shareNote}</span>
            </DrawerDescription>
          </DrawerHeader>
          <DrawerFooter className="pt-4">
            <Button size="lg" className="h-11 w-full" disabled={busy} onClick={() => void share()}>
              {busy ? <Spinner data-icon="inline-start" /> : null}
              {t.shareConfirm}
            </Button>
            <Button variant="outline" size="lg" className="h-11 w-full" autoFocus disabled={busy} onClick={() => setAsking(false)}>
              {t.cancel}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}

type DeleteState = { kind: 'confirm' } | { kind: 'session'; sessionId: string } | { kind: 'sessionConfirm'; sessionId: string };

/**
 * "Programı sil" (§2.8): onaylı; "uygulamadan kalkar, deponun geçmişinde kalır", "Ayrıntı" neyin silinmediğini
 * söyler. Bugün'ün programıysa ve paylaşılmışsa ek satırlar. Yarım antrenman bu programdansa sunucu 409 döner:
 * diyalog [Yarım antrenmanı sil]'i sunar (onaylı), sonra silme yeniden denenir. Başarıda Program'a dönülür.
 */
export function DeleteOwnProgram({
  clientId,
  programId,
  name,
  active,
  shared,
}: {
  clientId: string;
  programId: string;
  name: string;
  active: boolean;
  shared: boolean;
}) {
  const router = useRouter();
  const t = useMessages(clientProgramsMessages).actions;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<DeleteState>({ kind: 'confirm' });
  const [note, setNote] = useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    try {
      const response = await fetch(`/api/me/programs/${programId}`, { method: 'DELETE' });
      const body = (await response.json().catch(() => null)) as { error?: string; reason?: string; sessionId?: string } | null;
      if (response.status === 409 && body?.reason === 'active_session' && body.sessionId) {
        setState({ kind: 'session', sessionId: body.sessionId });
        return;
      }
      if (!response.ok && response.status !== 404) throw new Error(body?.error ?? t.deleteFailed);
      discardDraft(ownProgramDraftKey(clientId, programId));
      setOpen(false);
      toast.success(t.deleted);
      router.replace('/me/programlar');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.deleteFailed);
    } finally {
      setBusy(false);
    }
  };

  const removeSession = async (sessionId: string) => {
    setBusy(true);
    try {
      await fetchJson(`/api/me/sessions/${sessionId}`, { method: 'DELETE' });
      // Telefondaki kopya (bu antrenmansa) ve saklanan plan da düşer (antrenman ekranı açılmasın).
      clearLocalWorkout(clientId, sessionId);
      clearWorkoutCache(clientId);
      setNote(t.sessionDeleted);
      setState({ kind: 'confirm' });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.sessionDeleteFailed);
    } finally {
      setBusy(false);
    }
  };

  const sessionStep = state.kind === 'sessionConfirm';
  return (
    <>
      <Button
        variant="ghost"
        className="h-11 self-start px-2 text-destructive hover:text-destructive"
        onClick={() => {
          setState({ kind: 'confirm' });
          setNote(null);
          setOpen(true);
        }}>
        {t.deleteProgram}
      </Button>
      <ConfirmDeleteDialog
        open={open}
        onOpenChange={setOpen}
        title={sessionStep ? t.deleteSessionTitle : t.deleteTitle(name)}
        body={
          sessionStep
            ? t.deleteSessionBody
            : [t.deleteBody, active ? t.deleteActive : null, shared ? t.deleteShared : null].filter(Boolean).join(' ')
        }
        detail={sessionStep ? null : t.deleteDetail}
        confirmLabel={state.kind === 'confirm' ? t.deleteProgram : t.deleteSession}
        busy={busy}
        onConfirm={() => {
          if (state.kind === 'session') setState({ kind: 'sessionConfirm', sessionId: state.sessionId });
          else if (state.kind === 'sessionConfirm') void removeSession(state.sessionId);
          else void remove();
        }}>
        {state.kind === 'session' ? (
          <p className="rounded-lg bg-muted p-3 text-left text-sm" role="status">
            {t.activeSession}
          </p>
        ) : null}
        {note && !sessionStep ? (
          <p className="text-left text-sm text-muted-foreground" role="status">
            {note}
          </p>
        ) : null}
      </ConfirmDeleteDialog>
    </>
  );
}

/* --- "Antrenörün düzenledi": görüldü bilgisi telefonda (§7.2) --- */

const SEEN_EVENT = 'pulsecoach:own-seen';

function seenKey(clientId: string, programId: string): string {
  return `pulsecoach.own-seen.${clientId}.${programId}`;
}

function readSeen(clientId: string, programId: string): string | null {
  try {
    return window.localStorage.getItem(seenKey(clientId, programId));
  } catch {
    return null;
  }
}

function subscribeSeen(callback: () => void): () => void {
  window.addEventListener(SEEN_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(SEEN_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

/** PT'nin düzenlemesi görülmedi mi (bu telefonda): görüldü anı düzenlemeden eskiyse ya da yoksa. */
export function useUnseenPtEdit(clientId: string, programId: string, editedAt: string | undefined): boolean {
  const seen = useSyncExternalStore(
    subscribeSeen,
    () => readSeen(clientId, programId),
    () => null,
  );
  if (!editedAt) return false;
  return !seen || Date.parse(seen) < Date.parse(editedAt);
}

/** Programın sayfası açılınca: PT'nin düzenlemesi görüldü (rozet ve Bugün'deki satır düşer). */
export function MarkPtEditSeen({ clientId, programId, editedAt }: { clientId: string; programId: string; editedAt: string | undefined }) {
  useEffect(() => {
    if (!editedAt) return;
    try {
      window.localStorage.setItem(seenKey(clientId, programId), editedAt);
      window.dispatchEvent(new Event(SEEN_EVENT));
    } catch {
      // Depo kapalı: rozet yeniden görünebilir; kabul (§7.2).
    }
  }, [clientId, programId, editedAt]);
  return null;
}

/** Program'daki "Antrenörün düzenledi" rozeti: görülmediyse. */
export function PtEditBadge({ clientId, programId, editedAt }: { clientId: string; programId: string; editedAt: string | undefined }) {
  const unseen = useUnseenPtEdit(clientId, programId, editedAt);
  const t = useMessages(clientProgramsMessages).actions;
  return unseen ? <Badge>{t.ptEdited}</Badge> : null;
}
