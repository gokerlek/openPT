'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Card,CardContent} from '@/components/ui/card';
import {fetchJson} from '@/lib/query/errors';
import {updateStep} from '@/lib/updates/core';

type Result={current:string;release:{tag:string;automatic:boolean}|null;run:{id:number;tag:string;status:string;conclusion:string|null;applied:boolean;url:string}|null;automationError:string|null};
/** Hazırlık istendi ama GitHub'daki iş henüz listelenmedi: bu sürede o sürüm "Hazırlanıyor" sayılır (en çok 2 dk). */
type Requested={tag:string;runId:number|null;at:number};
const REQUEST_WAIT_MS=120_000;

export function UpdatePanel({current}:{current:string}) {
  const [result,setResult]=useState<Result|null>(null);
  const [accepted,setAccepted]=useState(false);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [requested,setRequested]=useState<Requested|null>(null);
  // İstek yoldayken ikinci dokunuş (durum yenilenmeden gelen çift dokunuş da) ikinci istek atmaz.
  const inFlight=useRef(false);
  const refresh=useCallback(async()=>setResult(await fetchJson<Result>('/api/updates')),[]);
  async function check() {
    if(inFlight.current)return;
    inFlight.current=true;
    setBusy(true);setError('');setResult(null);setAccepted(false);
    try{await refresh();}
    catch(err){setError(err instanceof Error?err.message:'Kontrol tamamlanamadı.');}
    finally{inFlight.current=false;setBusy(false);}
  }
  async function update(action:'start'|'apply') {
    if(inFlight.current || !accepted || !result?.release || result.automationError)return;
    inFlight.current=true;
    setBusy(true);setError('');setMessage('');
    try{
      await fetchJson('/api/updates',{method:'POST',body:JSON.stringify(action==='start'?{action,tag:result.release.tag,overwriteAccepted:accepted}:{action,runId:result.run?.id,overwriteAccepted:accepted})});
      if(action==='start')setRequested({tag:result.release.tag,runId:result.run?.id??null,at:Date.now()});
      setMessage(action==='start'?'Güncelleme hazırlanıyor. Bu ekran kendiliğinden yenilenir; hazır olunca "Güncellemeyi yayınla" çıkar.':'Kod güncellendi. Vercel Production yayını hazır olduğunda yeni sürüm burada görünecek. Yayın başarısızsa Vercel’de hata kaydını kontrol et.');
      await refresh();
    }catch(err){setError(err instanceof Error?err.message:'Güncelleme tamamlanamadı.');}
    finally{inFlight.current=false;setBusy(false);}
  }
  const tag=result?.release?.tag;
  const serverStep=tag?updateStep(tag,result.run):null;
  // İstenen hazırlığın işi henüz görünmüyorsa (son iş hâlâ istekten öncekiyse) düğme yerine "Hazırlanıyor".
  const waiting=requested!==null && requested.tag===tag && (result?.run?.id??null)===requested.runId;
  const step=waiting && serverStep==='prepare'?'preparing':serverStep;
  // Hazırlanırken ve kod aktarılmışken durum kendiliğinden yenilenir (5 sn; Vercel'i beklerken 15 sn).
  useEffect(()=>{
    if(step!=='preparing' && step!=='published')return;
    const timer=window.setInterval(()=>{
      if(inFlight.current)return;
      setRequested(previous=>previous && Date.now()-previous.at>REQUEST_WAIT_MS?null:previous);
      refresh().catch(()=>{});
    },step==='preparing'?5000:15000);
    return ()=>window.clearInterval(timer);
  },[step,refresh]);
  return <Card><CardContent className="flex flex-col gap-5">
    <div><p className="text-sm text-muted-foreground">Kurulu sürüm</p><p className="font-heading text-2xl font-semibold">v{result?.current??current}</p></div>
    <Button variant="outline" onClick={check} disabled={busy}>{busy?'Kontrol ediliyor…':'Güncellemeleri kontrol et'}</Button>
    {result && <p role="status">{result.release?`Yeni kararlı sürüm: ${result.release.tag}`:'Daha yeni bir kararlı sürüm bulunamadı.'}</p>}
    {result?.release && !result.release.automatic && <p className="text-sm text-muted-foreground">Bu sürüm manuel güncelleme gerektiriyor. Sürüm notlarını takip et.</p>}
    {result?.run && <div className="rounded-lg bg-muted p-4 text-sm space-y-2"><p>{result.run.tag} · {result.run.applied?'Kod yayın dalına aktarıldı':result.run.status!=='completed'?'Hazırlanıyor':result.run.conclusion==='success'?'Yayınlanmaya hazır':'Hazırlık başarısız'}</p><a href={result.run.url} target="_blank" rel="noreferrer" className="text-primary underline">GitHub Actions ayrıntıları</a></div>}
    {result?.automationError && <p role="alert" className="text-sm text-destructive">{result.automationError}</p>}
    {result?.release?.automatic && !result.automationError && (step==='preparing'
      ? <p role="status" className="text-sm">Yeni sürüm hazırlanıyor. Bu ekran kendiliğinden yenilenir; tekrar basmana gerek yok.</p>
      : step==='published'
        ? <p role="status" className="text-sm">Kod aktarıldı. Vercel yayını bitince yeni sürüm burada görünür; tekrar basmana gerek yok.</p>
        : <>
          <p className="text-sm text-muted-foreground">Kodda yaptığın değişikliklerin üzerine yazılır. Kodun mevcut sürümü yedek etiketle saklanır. Veri repoları ve Vercel ortam değişkenleri bu işlemde değiştirilmez. Workflow dosyaları manuel güncellenir.</p>
          <label className="flex gap-3 text-sm"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)} disabled={busy} className="mt-1 size-4 shrink-0" />Kod değişikliklerimin üzerine yazılmasını kabul ediyorum.</label>
          {step==='publish' ? <Button onClick={()=>update('apply')} disabled={!accepted||busy}>Güncellemeyi yayınla</Button> : <Button onClick={()=>update('start')} disabled={!accepted||busy}>Yeni sürümü hazırla</Button>}
        </>)}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
    <a href="https://github.com/gokerlek/axon-fit/blob/main/docs/UPDATES.md" target="_blank" rel="noreferrer" className="text-sm text-primary underline">Kod değişikliklerimi koruyarak manuel güncelle</a>
  </CardContent></Card>;
}
