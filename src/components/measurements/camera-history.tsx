'use client';
import Link from 'next/link';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {Card,CardHeader,CardTitle,CardDescription,CardContent} from '@/components/ui/card';
import {Button} from '@/components/ui/button';
import {useLocale,useMessages} from '@/i18n/client';
import {intlLocale} from '@/i18n/locale';
import {measurementsMessages} from '@/i18n/messages/measurements';
import {protocols,metricLabels,type PoseTask} from '@/lib/pose/protocols';
import {measurementMeaning,metricExplanations} from '@/lib/pose/guidance';
import {comparable,type CameraMeasurement} from '@/lib/schemas/camera-measurement';
export function CameraHistory({records,timeZone='Europe/Istanbul',clientId,onRepeat,onTrashChange}:{records:CameraMeasurement[];timeZone?:string;clientId?:string;onRepeat?:(task:PoseTask)=>void;onTrashChange?:(id:string,removed:boolean)=>void}){
 const [limit,setLimit]=useState(10);const [trash,setTrash]=useState(false);
 const [busy,setBusy]=useState<string|null>(null);const [error,setError]=useState<string|null>(null);
 const [changes,setChanges]=useState<Record<string,boolean>>({});const router=useRouter();
 const locale=useLocale();const messages=useMessages(measurementsMessages);const t=messages.camera.history;
 const PROTOCOLS=protocols(locale),METRIC_LABELS=metricLabels(locale),METRIC_EXPLANATIONS=metricExplanations(locale),sides=messages.camera.wizard.sides;
 const all=records.map(record=>record.id in changes?{...record,deletedAt:changes[record.id]?(record.deletedAt??new Date().toISOString()):undefined}:record).sort((a,b)=>b.capturedAt.localeCompare(a.capturedAt));
 const active=all.filter(record=>!record.deletedAt),deleted=all.filter(record=>record.deletedAt);const shown=trash?deleted:active;
 async function change(record:CameraMeasurement,remove:boolean){
  if(!clientId || busy)return;setBusy(record.id);setError(null);
  try{
   const response=await fetch(`/api/clients/${clientId}/camera-measurements`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:record.id,action:remove?'trash':'restore'})});
   const body=await response.json();if(!response.ok)throw new Error(body.error??t.changeFailed);
   setChanges(old=>({...old,[record.id]:remove}));onTrashChange?.(record.id,remove);router.refresh();
  }catch(cause){setError(cause instanceof Error?cause.message:t.actionFailed);}
  finally{setBusy(null);}
 }
 return <section className="flex flex-col gap-4" aria-label={t.label}>
  <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-heading text-lg font-semibold">{trash?t.trashTitle:t.title}</h3><p className="mt-1 text-sm text-muted-foreground">{trash?t.trashHint:t.hint}</p></div><Button variant="outline" onClick={()=>{setTrash(value=>!value);setLimit(10);}}>{trash?t.showHistory:t.showTrash(deleted.length)}</Button></div>
  {error?<p role="alert" className="text-sm text-destructive">{error}</p>:null}
  {!shown.length?<p className="rounded-lg border p-4 text-sm text-muted-foreground">{trash?t.trashEmpty:t.empty}</p>:shown.slice(0,limit).map(record=>{
   const protocol=PROTOCOLS[record.task];const previous=active.find(r=>r.capturedAt<record.capturedAt && comparable(record,r));
   return <Card key={record.id}><CardHeader><CardTitle>{protocol.title}</CardTitle><CardDescription>{new Date(record.capturedAt).toLocaleString(intlLocale(locale),{timeZone})} · {sides[record.side]}{record.repetitions?t.reps(record.repetitions):''}</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
    <dl className="flex flex-col gap-3">{record.metrics.map(metric=>{
     const old=previous?.metrics.find(m=>m.id===metric.id),value=protocol.dynamic?metric.range:metric.median,delta=old?value-(protocol.dynamic?old.range:old.median):null;
     return <div key={metric.id} className="flex flex-wrap items-baseline justify-between gap-2 text-sm"><dt>{METRIC_LABELS[metric.id]}{protocol.dynamic?t.angleChange:''}</dt><dd className="font-mono tabular-nums">{value.toFixed(1)}°{delta!==null?<span className="ml-3 text-xs text-muted-foreground">{t.deltaPrevious(`${delta>0?'+':''}${delta.toFixed(1)}`)}</span>:null}</dd></div>;
    })}</dl>
    <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">{t.whatMeans}</summary><div className="mt-2 flex flex-col gap-2 text-xs text-muted-foreground"><p>{measurementMeaning(record.task,locale)}</p>{record.metrics.map(metric=><p key={metric.id}>{METRIC_LABELS[metric.id]}: {METRIC_EXPLANATIONS[metric.id]}</p>)}<p>{t.technical((record.durationMs/1000).toFixed(1),record.validSamples,record.totalSamples,`${record.width}×${record.height}`,record.protocol)}{record.task==='sit_stand'?t.chair(record.chairHeightCm?String(record.chairHeightCm):null,Boolean(record.armSupport)):''}</p><p>{t.ptNote}</p></div></details>
    {!trash && !previous?<p className="text-xs text-muted-foreground">{t.noPrevious}</p>:null}
    <div className="flex flex-wrap gap-2">{trash?<Button variant="outline" disabled={Boolean(busy)} onClick={()=>void change(record,false)}>{busy===record.id?t.restoring:t.restore}</Button>:<>{onRepeat?<Button variant="outline" onClick={()=>onRepeat(record.task)}>{t.measureAgain}</Button>:clientId?<Button variant="outline" nativeButton={false} render={<Link href={`/dashboard/clients/${clientId}/measurements/camera?analysis=${record.task}`}/>}>{t.measureAgain}</Button>:null}{clientId?<Button variant="ghost" disabled={Boolean(busy)} onClick={()=>void change(record,true)}>{busy===record.id?t.deleting:t.delete}</Button>:null}</>}</div>
   </CardContent></Card>;
  })}
  {shown.length>limit?<Button variant="outline" onClick={()=>setLimit(value=>value+10)}>{t.more}</Button>:null}
 </section>;
}
