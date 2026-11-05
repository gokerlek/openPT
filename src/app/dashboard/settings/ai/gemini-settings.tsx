'use client';
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Card,CardContent} from '@/components/ui/card';
import {Field,FieldLabel,FieldDescription} from '@/components/ui/field';
import {Input} from '@/components/ui/input';
import {fetchJson} from '@/lib/query/errors';
import {geminiKeyError} from '@/lib/ai/gemini-key-input';
import {useLocale,useMessages} from '@/i18n/client';
import {coachMessages} from '@/i18n/messages/coach';
import type {KeyStatus} from '@/lib/ai/credentials';

export function GeminiSettings({initial}:{initial:KeyStatus|null}) {
  const t=useMessages(coachMessages).settings,locale=useLocale();
  const [status,setStatus]=useState(initial);const [key,setKey]=useState('');
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [message,setMessage]=useState('');
  async function save(value:string|null) {
    if(value!==null){const problem=geminiKeyError(value,locale);if(problem){setError(problem);setMessage('');return;}}
    setBusy(true);setError('');setMessage('');
    try{
      const next=await fetchJson<KeyStatus>('/api/settings/gemini',{method:'POST',body:JSON.stringify({key:value})});
      setStatus(next);setKey('');setMessage(value===null?t.removed:t.saved);
    }catch(err){setError(err instanceof Error?err.message:t.saveFailed);}
    finally{setBusy(false);}
  }
  return <Card><CardContent className="flex flex-col gap-5">
    <div className="space-y-2"><h2 className="text-lg font-semibold">{t.heading}</h2><p role="status" className="text-sm text-muted-foreground">{status===null?t.unreadable:status.configured?status.source==='environment'?t.fromEnvironment:t.fromSettings:t.none}</p></div>
    <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-sm text-primary underline">{t.create}</a>
    <form className="flex flex-col gap-4" onSubmit={event=>{event.preventDefault();void save(key);}}>
      <Field><FieldLabel htmlFor="gemini-key">{status?.configured?t.newKeyLabel:t.keyLabel}</FieldLabel><Input id="gemini-key" type="password" autoComplete="new-password" spellCheck={false} value={key} onChange={event=>setKey(event.target.value)} disabled={busy} maxLength={200} /><FieldDescription>{t.keyHint}</FieldDescription></Field>
      <Button type="submit" disabled={busy||!key.trim()} className="self-start">{busy?t.saving:status?.configured?t.change:t.save}</Button>
    </form>
    {status?.source==='settings'&&<Button type="button" variant="outline" disabled={busy} className="self-start" onClick={()=>void save(null)}>{t.remove}</Button>}
    <p className="text-xs text-muted-foreground">{t.note}</p>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{message&&<p role="status" className="text-sm text-primary">{message}</p>}
  </CardContent></Card>;
}
