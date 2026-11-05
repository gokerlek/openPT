'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { fetchJson } from '@/lib/query/errors';
import type { CoachPreferences } from '@/lib/ai/coach-contract';
import { useMessages } from '@/i18n/client';
import { coachMessages } from '@/i18n/messages/coach';
export function CoachPreferenceForm({ clientId }: { clientId: string }) {
  const t = useMessages(coachMessages).preferences;
  const cache = useQueryClient();
  const query = useQuery({ queryKey: ['coach', clientId, 'preferences'], queryFn: () => fetchJson<CoachPreferences>('/api/me/coach/preferences') });
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function change(field: keyof CoachPreferences, checked: boolean) {
    if (!query.data || busy) return;
    setBusy(true); setError('');
    try {
      const data = await fetchJson<CoachPreferences>('/api/me/coach/preferences', { method: 'PUT', body: JSON.stringify({ ...query.data, [field]: checked }) });
      cache.setQueryData(['coach', clientId, 'preferences'], data);
      await cache.invalidateQueries({ queryKey: ['coach', clientId, 'highlights'] });
    } catch (error) { setError(error instanceof Error ? error.message : t.saveFailed); }
    finally { setBusy(false); }
  }
  return <section className="rounded-xl border p-4" aria-label={t.title}><h2 className="text-lg font-semibold">{t.title}</h2><p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
    {query.isPending ? <p className="mt-3" role="status">{t.loading}</p> : query.data ? <div className="mt-4 flex flex-col gap-4">{(['comments', 'celebrations', 'suggestions'] as const).map(field => <div key={field} className="flex min-h-11 items-center justify-between gap-4"><label htmlFor={`coach-${field}`} className="flex-1"><span className="font-medium">{t[field].label}</span><span className="mt-1 block text-sm text-muted-foreground">{t[field].hint}</span></label><Switch id={`coach-${field}`} disabled={busy} checked={query.data![field]} onCheckedChange={checked => void change(field, checked)} /></div>)}</div> : <Button variant="outline" className="mt-3" onClick={() => void query.refetch()}>{t.reload}</Button>}
    {error ? <p role="alert" className="mt-3 text-destructive">{error}</p> : null}
  </section>;
}
