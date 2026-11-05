'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fetchJson } from '@/lib/query/errors';
import { useMessages } from '@/i18n/client';
import { coachMessages } from '@/i18n/messages/coach';
export function CoachConnection({ clientId, enabled, connected, busy, action, transport = fetchJson }: { clientId: string; enabled: boolean; connected: boolean; busy: boolean; transport?: typeof fetchJson; action: (run: () => Promise<unknown>) => Promise<void> }) {
  const t = useMessages(coachMessages).connection;
  const [key, setKey] = useState('');
  const query = useQuery({ queryKey: ['coach', clientId, 'own-key'], queryFn: () => transport<{ ownKey: boolean }>('/api/me/coach/connection') });
  const own = query.data?.ownKey ?? connected;
  return <details className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">{t.summary(own)}</summary>
    <p className="mt-3 text-sm text-muted-foreground">{t.intro}</p>
    {!enabled ? <p className="mt-2 text-sm text-muted-foreground">{t.disabled}</p> : null}
    <a className="mt-2 inline-block text-sm underline" href="https://aistudio.google.com/api-keys" target="_blank" rel="noreferrer">{t.getKey}</a>
    <label className="mt-3 flex flex-col gap-2 text-sm">{t.keyLabel}<Input type="password" autoComplete="off" value={key} onChange={event => setKey(event.target.value)} placeholder={own ? t.changePlaceholder : t.newPlaceholder} className="h-11" /></label>
    <div className="mt-3 flex flex-wrap gap-2"><Button className="h-11" disabled={busy || !enabled || !key.trim()} onClick={() => void action(async () => { await transport('/api/me/coach/connection', { method: 'PUT', body: JSON.stringify({ key: key.trim() }) }); setKey(''); await query.refetch(); })}>{t.save}</Button>{own ? <Button variant="outline" className="h-11" disabled={busy} onClick={() => void action(async () => { await transport('/api/me/coach/connection', { method: 'PUT', body: JSON.stringify({ key: null }) }); await query.refetch(); })}>{t.remove}</Button> : null}</div>
  </details>;
}
