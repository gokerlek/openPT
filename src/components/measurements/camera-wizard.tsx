'use client';
import Link from 'next/link';
import {createPortal} from 'react-dom';
import {useRouter} from 'next/navigation';
import {useCallback,useEffect,useReducer,useRef,useState,useSyncExternalStore} from 'react';
import {ArrowLeft,ArrowRight,Camera} from '@phosphor-icons/react';
import {Check,X} from '@/components/line-icons';
import {Button} from '@/components/ui/button';
import {Checkbox} from '@/components/ui/checkbox';
import {Input} from '@/components/ui/input';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {UnsavedChangesGuard} from '@/components/unsaved-changes-guard';
import {useLocale,useMessages} from '@/i18n/client';
import {intlLocale} from '@/i18n/locale';
import {measurementsMessages} from '@/i18n/messages/measurements';
import {CameraPreviewSession,cameraErrorMessage} from '@/lib/camera-preview';
import {qualityMessagesFor} from '@/lib/pose/geometry';
import {protocols,POSE_TASKS,metricLabels,viewLabels,type PoseTask} from '@/lib/pose/protocols';
import {movementCues,metricExplanations,measurementMeaning} from '@/lib/pose/guidance';
import {authoritativeRecords} from '@/lib/pose/record-set';
import {initialSession,sessionReducer} from '@/lib/pose/session-flow';
import {comparable,type CameraMeasurement} from '@/lib/schemas/camera-measurement';
import {CameraCapturePanel} from './camera-capture-panel';
import {MovementReference} from './movement-reference';
import {CameraHistory} from './camera-history';
import {PoseOverlay} from './pose-overlay';
import {usePoseDetection} from './use-pose-detection';
const SETTINGS_EVENT='axon-camera-settings';
const DEFAULT_CAMERA='default';
function subscribe(listener:()=>void){window.addEventListener('storage',listener);window.addEventListener(SETTINGS_EVENT,listener);return()=>{window.removeEventListener('storage',listener);window.removeEventListener(SETTINGS_EVENT,listener);};}
function readSetting(key:string){try{return localStorage.getItem(key)??'';}catch{return '';}}
function writeSetting(key:string,value:string){try{localStorage.setItem(key,value);}catch{}window.dispatchEvent(new Event(SETTINGS_EVENT));}
/**
 * Kamera ölçümü sihirbazı (PT ve danışan). Altta dönüş bağlantısı (`backHref`/`backLabel`, ikisi de çağıranın) ve
 * isteğe bağlı ikinci bağlantı: `manualHref` verilmezse görünmez (PT'de yalnız "Ölçümler" onayı varken elle ölçüm).
 */
export function CameraWizard({manualHref,backHref,manualLabel,clientId,clientName,records=[],timeZone='Europe/Istanbul',initialTask='front',backLabel}:{manualHref?:string;backHref:string;manualLabel?:string;clientId:string;clientName?:string;records?:CameraMeasurement[];timeZone?:string;initialTask?:PoseTask;backLabel:string}){
 const locale=useLocale();const messages=useMessages(measurementsMessages);const t=messages.camera.wizard;
 const PROTOCOLS=protocols(locale),METRIC_LABELS=metricLabels(locale),METRIC_EXPLANATIONS=metricExplanations(locale),MOVEMENT_CUES=movementCues(locale),views=viewLabels(locale),qualityMessages=qualityMessagesFor(locale);
 const [flow,dispatch]=useReducer(sessionReducer,initialSession);
 const [selected,setSelected]=useState<PoseTask[]>([initialTask]);
 const [drafts,setDrafts]=useState<Record<string,CameraMeasurement>>({});
 const [trashChanges,setTrashChanges]=useState<Record<string,boolean>>({});
 const [savedIds,setSavedIds]=useState<string[]>([]);
 const [saving,setSaving]=useState<string|null>(null);
 const [error,setError]=useState<string|null>(null);
 const [status,setStatus]=useState<'idle'|'requesting'|'active'|'error'>('idle');
 const [session]=useState(()=>new CameraPreviewSession<MediaStream>());
 const [devices,setDevices]=useState<MediaDeviceInfo[]>([]);
 const [deviceId,setDeviceId]=useState('');
 const [checks,setChecks]=useState([false,false,false]);
 const [capturing,setCapturing]=useState(false);
 const [chairHeight,setChairHeight]=useState('');const [armSupport,setArmSupport]=useState(false);
 const videoRef=useRef<HTMLVideoElement>(null);
 const headingRef=useRef<HTMLHeadingElement>(null);
 const overlayRef=useRef<HTMLDivElement>(null);
 const requestTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const openRef=useRef(false);
 const consentKey=`axon-camera-processing-v1:${clientId}`;
 const consent=useSyncExternalStore(subscribe,()=>readSetting(consentKey)==='yes',()=>false);
 const router=useRouter();
 const taskId=flow.queue[flow.index]??'front',task=PROTOCOLS[taskId];
 const inSession=flow.stage!=='list';
 const detection=usePoseDetection(videoRef,status==='active' && flow.stage==='capture',taskId,session.stream);
 const resultId=flow.results[taskId]?.id;const result=resultId?drafts[resultId]:undefined;
 const pending=Object.values(drafts).filter(record=>!savedIds.includes(record.id));
 const completeRecords=Object.values(flow.results).flatMap(r=>r && drafts[r.id]?[drafts[r.id]!]:[]);
 const release=useCallback(()=>{session.stop();if(requestTimer.current)clearTimeout(requestTimer.current);requestTimer.current=null;if(videoRef.current)videoRef.current.srcObject=null;openRef.current=false;},[session]);
 const stop=useCallback(()=>{release();setStatus('idle');setChecks([false,false,false]);setCapturing(false);},[release]);
 useEffect(()=>{
  const hidden=()=>{if(document.visibilityState!=='visible')stop();};
  document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',stop);
  return()=>{document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',stop);release();};
 },[release,stop]);
 useEffect(()=>{
  const video=videoRef.current;if(video && status==='active' && flow.stage==='capture')video.srcObject=session.stream;
  return()=>{if(video)video.srcObject=null;};
 },[status,session,flow.stage]);
 useEffect(()=>{
  if(!inSession)return;const before=document.body.style.overflow;document.body.style.overflow='hidden';
  const siblings=Array.from(document.body.children).filter((node):node is HTMLElement=>node instanceof HTMLElement && !node.hasAttribute('data-camera-session')).map(node=>({node,inert:node.inert}));
  siblings.forEach(({node})=>{node.inert=true;});headingRef.current?.focus();
  return()=>{document.body.style.overflow=before;siblings.forEach(({node,inert})=>{node.inert=inert;});};
 },[inSession,flow.stage]);
 useEffect(()=>{
  if(!pending.length)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
 },[pending.length]);
 useEffect(()=>{
  if(!navigator.mediaDevices?.enumerateDevices)return;
  let disposed=false;const refresh=()=>{void navigator.mediaDevices.enumerateDevices().then(all=>{if(!disposed)setDevices(all.filter(d=>d.kind==='videoinput'));}).catch(()=>{});};
  refresh();navigator.mediaDevices.addEventListener('devicechange',refresh);
  return()=>{disposed=true;navigator.mediaDevices.removeEventListener('devicechange',refresh);};
 },[status]);
 async function openCamera(chosen=deviceId){
  if(!consent || openRef.current)return;
  if(!window.isSecureContext || !navigator.mediaDevices?.getUserMedia){setError(t.needsHttps);return;}
  release();openRef.current=true;setStatus('requesting');setError(null);setChecks([false,false,false]);
  const stored=chosen || readSetting('axon-camera-device-v1');
  const present=stored && devices.some(d=>d.deviceId===stored);
  requestTimer.current=setTimeout(()=>{release();setStatus('error');setError(t.permissionWait);},30000);
  try{
   const stream=await session.open(()=>navigator.mediaDevices.getUserMedia({audio:false,video:{...(present?{deviceId:{exact:stored}}:{facingMode:'user'}),width:{ideal:1280},height:{ideal:720}}}));
   if(!stream)return;
   if(requestTimer.current)clearTimeout(requestTimer.current);requestTimer.current=null;openRef.current=false;
   if(document.visibilityState!=='visible'){stop();return;}
   stream.getVideoTracks().forEach(track=>track.addEventListener('ended',stop,{once:true}));
   const actual=stream.getVideoTracks()[0]?.getSettings().deviceId??'';setDeviceId(actual);writeSetting('axon-camera-device-v1',actual);setStatus('active');dispatch({type:'capture'});
  }catch(cause){release();setStatus('error');setError(cameraErrorMessage(cause,locale));}
 }
 function list(){stop();setError(null);dispatch({type:'list'});}
 function start(tasks=selected){setError(null);dispatch({type:'start',tasks});}
 function advance(type:'next'|'skip'){setError(null);if(flow.index===flow.queue.length-1)stop();dispatch({type});}
 function prepareNext(){advance('next');}
 function repeat(task:PoseTask){setSelected([task]);setError(null);dispatch({type:'start',tasks:[task]});}
 async function save(record:CameraMeasurement,advance=false){
  if(saving)return;if(savedIds.includes(record.id)){if(advance)prepareNext();return;}
  setSaving(record.id);setError(null);
  try{
   const response=await fetch(`/api/clients/${clientId}/camera-measurements`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(record)});
   const body=await response.json();if(!response.ok)throw new Error(body.error??t.saveFailed);
   setSavedIds(ids=>[...ids,record.id]);dispatch({type:'saved',id:record.id});router.refresh();if(advance)prepareNext();
  }catch(cause){setError(cause instanceof Error?cause.message:t.saveIncomplete);}
  finally{setSaving(null);}
 }
 // "Varsayılan kamera" seçilmiş bir değer (`DEFAULT_CAMERA`); ayarda ve kamerayı açarken boş kimliktir. İzin öncesi
 // kimliği boş kameralar onunla aynı anlama gelir; listede yinelenmesin.
 const cameraItems=[{value:DEFAULT_CAMERA,label:t.defaultCamera},...devices.flatMap((device,index)=>device.deviceId && device.deviceId!==DEFAULT_CAMERA?[{value:device.deviceId,label:device.label || t.cameraN(index+1)}]:[])];
 // Liste oturum kaplamasının içine açılır: kaplama z-[70] ve dışındaki her şeyi `inert` yapar.
 const cameraPicker=<div className="flex min-w-0 items-center gap-2 text-xs"><Camera aria-hidden className="size-4 shrink-0"/><Select items={cameraItems} value={deviceId && cameraItems.some(item=>item.value===deviceId)?deviceId:DEFAULT_CAMERA} disabled={capturing || status==='requesting'} onValueChange={next=>{const id=next && next!==DEFAULT_CAMERA?next:'';setDeviceId(id);writeSetting('axon-camera-device-v1',id);if(status==='active')void openCamera(id);}}><SelectTrigger aria-label={t.chooseCamera} className="min-w-0 max-w-48 data-[size=default]:h-10"><SelectValue/></SelectTrigger><SelectContent container={overlayRef}>{cameraItems.map(item=><SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>;
 function resultContent(record:CameraMeasurement){
  const protocol=PROTOCOLS[record.task];
  const previous=authoritativeRecords(records,Object.values(drafts).filter(r=>savedIds.includes(r.id)),trashChanges).filter(r=>r.id!==record.id && r.capturedAt<record.capturedAt && comparable(r,record)).sort((a,b)=>b.capturedAt.localeCompare(a.capturedAt))[0];
  return <div className="flex flex-col gap-5">
   <p className="text-sm text-muted-foreground">{t.shot(measurementMeaning(record.task,locale),views[protocol.view],record.repetitions)}</p>
   <dl className="flex flex-col divide-y">{record.metrics.map(metric=>{
    const value=protocol.dynamic?metric.range:metric.median;const before=previous?.metrics.find(m=>m.id===metric.id);const delta=before?value-(protocol.dynamic?before.range:before.median):null;
    return <div key={metric.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 py-4"><dt className="font-medium">{METRIC_LABELS[metric.id]}{protocol.dynamic?t.angleChange:''}</dt><dd className="text-2xl font-semibold tabular-nums">{value.toFixed(1)}°</dd><dd className="col-span-2 max-w-2xl text-sm text-muted-foreground">{METRIC_EXPLANATIONS[metric.id]}{delta!==null?<span className="mt-1 block">{t.deltaSameConditions(`${delta>0?'+':''}${delta.toFixed(1)}`)}</span>:null}</dd></div>;
   })}</dl>
   <p className="text-sm">{t.purpose}</p>
   <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">{t.conditions}</summary><p className="mt-2 text-xs text-muted-foreground">{t.technical(t.sides[record.side],(record.durationMs/1000).toFixed(1),record.validSamples,record.totalSamples,`${record.width}×${record.height}`,record.protocol)}</p></details>
  </div>;
 }
 const overlay=inSession?<div ref={overlayRef} role="dialog" aria-modal="true" aria-labelledby="camera-session-title" data-camera-session="true" className="fixed inset-0 z-[70] flex h-dvh flex-col bg-background text-foreground" onKeyDown={event=>{if(event.key==='Escape' && !capturing && !saving)list();}}>
  <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:px-6">
   <div className="min-w-0"><p className="truncate text-xs text-muted-foreground">{clientName?`${clientName} · `:''}{t.position(flow.index+1,flow.queue.length)}</p><h2 id="camera-session-title" ref={headingRef} tabIndex={-1} className="truncate font-heading text-lg font-semibold outline-none">{flow.stage==='complete'?t.summaryTitle:task.title}</h2></div>
   <Button variant="ghost" className="size-11 shrink-0" aria-label={t.backToList} disabled={capturing || Boolean(saving)} onClick={list}><X/></Button>
  </header>
  {flow.stage==='capture'?<>
   <div className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-2">{cameraPicker}<Button variant="ghost" size="sm" disabled={capturing} onClick={()=>{stop();dispatch({type:'repeat'});}}>{status==='active'?t.closeCamera:t.backToPrepare}</Button></div>
   {!checks.every(Boolean)?<div className="flex shrink-0 flex-wrap gap-x-5 gap-y-2 border-b px-4 py-3 text-xs" aria-label={t.verifyPosition}>{t.checks.map((label,index)=><label key={label} className="flex min-h-9 items-center gap-2"><Checkbox checked={checks[index]} disabled={status!=='active'} onCheckedChange={value=>setChecks(current=>current.map((old,i)=>i===index?value:old))}/>{label}</label>)}</div>:null}
   <div className="relative min-h-0 flex-1 overflow-hidden bg-muted/20">
    <video ref={videoRef} autoPlay muted playsInline aria-label={t.preview} onError={()=>{stop();setError(t.previewFailed);}} className="absolute inset-0 size-full object-contain -scale-x-100"/>
    <PoseOverlay detection={detection} task={taskId}/>
    <div className="absolute top-3 left-3 right-3 flex flex-wrap justify-between gap-2"><p className="max-w-lg rounded-lg bg-background/95 px-3 py-2 text-xs" role="status">{error??(status!=='active'?t.cameraOff:detection?.state==='error'?t.detectionFailed:detection?.state!=='tracking'?t.detectionLoading:qualityMessages[detection.analysis.quality])}</p><span className="rounded-lg bg-background/95 px-2 py-2 text-xs">{t.mirrored(views[task.view])}</span></div>
    <div className="absolute right-3 bottom-3 rounded-xl border bg-background/95 p-2"><MovementReference key={taskId} task={taskId} compact/></div>
    <div className="absolute bottom-3 left-3 flex max-w-[55%] flex-col gap-1 rounded-lg bg-background/95 p-2" aria-label={t.liveAngles}>{task.metrics.map(id=>{const metric=detection?.analysis.quality==='ready'?detection.analysis.metrics.find(m=>m.id===id):null;return <p key={id} className="grid grid-cols-[minmax(0,1fr)_4.5rem] gap-2 text-xs"><span>{METRIC_LABELS[id]}</span><span className="text-right font-mono tabular-nums">{metric?`${metric.degrees.toFixed(1)}°`:'—'}</span></p>;})}</div>
   </div>
   <footer className="shrink-0 border-t bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
    <div className="mx-auto max-w-4xl"><CameraCapturePanel key={`${session.stream?.id}-${taskId}-${checks.every(Boolean)}`} detection={detection} task={taskId} enabled={status==='active' && checks.every(Boolean)} chairHeight={chairHeight?Number(chairHeight):undefined} armSupport={armSupport} onBusyChange={setCapturing} onComplete={record=>{setDrafts(all=>({...all,[record.id]:record}));dispatch({type:'result',id:record.id});}}/></div>
   </footer>
  </>:<>
   <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
    <div className="mx-auto max-w-4xl">
     {error?<p role="alert" className="mb-4 rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error}</p>:null}
     {flow.stage==='prepare'?<div className="grid items-start gap-6 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <div className="flex justify-center rounded-xl bg-muted/30 p-4"><MovementReference key={taskId} task={taskId}/></div>
      <div className="flex flex-col gap-5"><div><h3 className="font-semibold">{t.howTitle}</h3><p className="mt-2 text-sm">{MOVEMENT_CUES[taskId].start}</p><ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-sm">{task.dynamic?<><li>{MOVEMENT_CUES[taskId].away}</li><li>{MOVEMENT_CUES[taskId].back}</li><li>{t.repeatThree}</li></>:<li>{t.holdSix}</li>}</ol></div>
       <div><h3 className="font-semibold">{t.whatTitle}</h3><p className="mt-2 text-sm text-muted-foreground">{task.metrics.map(id=>METRIC_LABELS[id]).join(', ')}. {measurementMeaning(taskId,locale)}</p></div>
       <div className="flex flex-col gap-3"><p className="text-sm">{t.phone(views[task.view])}</p>{cameraPicker}
        {!consent?<label className="flex items-start gap-3 text-sm"><Checkbox checked={consent} onCheckedChange={value=>writeSetting(consentKey,value?'yes':'no')}/>{t.consent}</label>:<p className="text-xs text-muted-foreground">{t.consentRemembered} <button type="button" className="underline" onClick={()=>{writeSetting(consentKey,'no');stop();}}>{t.withdrawConsent}</button></p>}
        <p className="text-xs text-muted-foreground">{t.permissionNote}</p>
       </div>
       {taskId==='sit_stand'?<div className="flex flex-col gap-3"><label className="text-sm">{t.chairHeight}<Input type="number" min={20} max={100} value={chairHeight} onChange={e=>setChairHeight(e.target.value)} className="mt-1"/></label><label className="flex items-center gap-2 text-sm"><Checkbox checked={armSupport} onCheckedChange={setArmSupport}/>{t.armSupport}</label></div>:null}
       {status==='active'?<div className="flex flex-col gap-2">{t.checks.map((label,index)=><label key={label} className="flex items-center gap-3 text-sm"><Checkbox checked={checks[index]} onCheckedChange={value=>setChecks(current=>current.map((old,i)=>i===index?value:old))}/>{label}</label>)}</div>:null}
      </div>
     </div>:null}
     {flow.stage==='result' && result?resultContent(result):null}
     {flow.stage==='complete'?<div className="flex flex-col gap-5"><p className="text-sm text-muted-foreground">{t.sessionSummary(completeRecords.length,flow.skipped.length)}</p>{completeRecords.map(record=><div key={record.id} className="rounded-xl border p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">{PROTOCOLS[record.task].title}</h3><Button variant="outline" disabled={Boolean(saving) || savedIds.includes(record.id)} onClick={()=>void save(record)}>{savedIds.includes(record.id)?t.saved:saving===record.id?t.saving:t.saveMeasurement}</Button></div>{resultContent(record)}</div>)}{!completeRecords.length?<p>{t.nothingMeasured}</p>:null}</div>:null}
    </div>
   </div>
   <footer className="shrink-0 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6"><div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
    <Button variant="ghost" disabled={Boolean(saving) || status==='requesting'} onClick={list}><ArrowLeft/>{t.list}</Button>
    <div className="flex flex-wrap gap-2">
     {flow.stage==='prepare'?<><Button variant="outline" disabled={status==='requesting'} onClick={()=>{setError(null);advance('skip');}}>{t.skip}</Button><Button disabled={!consent || status==='requesting'} onClick={()=>{if(status==='active')dispatch({type:'capture'});else void openCamera();}}>{status==='requesting'?t.waitingPermission:status==='active'?t.toCapture:t.openCamera}<ArrowRight/></Button></>:null}
     {flow.stage==='result' && result?<><Button variant="outline" disabled={Boolean(saving)} onClick={()=>{setError(null);dispatch({type:'repeat'});}}>{t.measureAgain}</Button><Button disabled={Boolean(saving)} onClick={()=>void save(result,true)}>{saving?t.saving:flow.index+1<flow.queue.length?t.saveNext:t.saveFinish}<ArrowRight/></Button><Button variant="ghost" disabled={Boolean(saving)} onClick={prepareNext}>{t.continueUnsaved}</Button></>:null}
     {flow.stage==='complete'?<Button disabled={Boolean(saving)} onClick={list}>{t.backToList}</Button>:null}
    </div>
   </div></footer>
  </>}
 </div>:null;
 return <>
  <UnsavedChangesGuard active={flow.stage==='list' && pending.length>0 && !saving} description={t.leave} onLeave={()=>{}}/>
  <div className="flex flex-col gap-6">
   <div><h3 className="font-heading text-xl font-semibold">{t.chooseTitle}</h3><p className="mt-1 text-sm text-muted-foreground">{t.chooseHint}{clientName?t.measuredPerson(clientName):''}</p></div>
   <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="group" aria-label={t.selection}>{POSE_TASKS.map(id=><button key={id} type="button" aria-pressed={selected.includes(id)} onClick={()=>setSelected(current=>current.includes(id)?current.filter(task=>task!==id):[...current,id])} className={`flex min-h-24 items-start gap-3 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${selected.includes(id)?'border-primary/40 bg-primary/5':'bg-card hover:bg-muted/50'}`}><span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border ${selected.includes(id)?'border-primary bg-primary text-primary-foreground':'border-input'}`}>{selected.includes(id)?<Check className="size-3"/>:null}</span><span><span className="block font-medium">{PROTOCOLS[id].title}</span><span className="mt-1 block text-sm text-muted-foreground">{PROTOCOLS[id].subtitle}</span></span></button>)}</div>
   <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{t.selected(selected.length,selected.length?selected.map(id=>PROTOCOLS[id].title).join(' → '):null)}</p><div className="flex flex-wrap gap-2">{flow.queue.length?<Button variant="outline" onClick={()=>dispatch({type:'resume'})}>{t.resume}</Button>:null}<Button disabled={!selected.length || Boolean(saving)} onClick={()=>start()}>{flow.queue.length?t.newSession:t.startSelected}<ArrowRight/></Button></div></div>
   {error?<p role="alert" className="text-sm text-destructive">{error}</p>:null}
   {pending.length?<section className="flex flex-col gap-3 rounded-xl border p-4"><h3 className="font-medium">{t.unsaved(pending.length)}</h3>{pending.map(record=><div key={record.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{PROTOCOLS[record.task].title} · {new Date(record.capturedAt).toLocaleTimeString(intlLocale(locale),{timeZone})}</span><Button variant="outline" disabled={Boolean(saving)} onClick={()=>void save(record)}>{saving===record.id?t.saving:t.saveMeasurement}</Button></div>)}</section>:null}
   <CameraHistory clientId={clientId} timeZone={timeZone} records={records} onRepeat={repeat} onTrashChange={(id,removed)=>setTrashChanges(old=>({...old,[id]:removed}))}/>
   <div className="flex flex-wrap gap-3 border-t pt-4"><Button nativeButton={false} variant="ghost" render={<Link href={backHref}/>}>{backLabel}</Button>{manualHref?<Button nativeButton={false} variant="outline" render={<Link href={manualHref}/>}>{manualLabel??t.manual}</Button>:null}</div>
   <p className="text-xs text-muted-foreground">{t.privacy}</p>
  </div>
  {overlay?createPortal(overlay,document.body):null}
 </>;
}
