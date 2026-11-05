'use client';
import {useEffect,useMemo,useState,useSyncExternalStore} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import {messageOf} from '@/i18n/errors';
import {Card,CardContent} from '@/components/ui/card';
import {Field,FieldLabel,FieldError,FieldDescription} from '@/components/ui/field';
import {Input} from '@/components/ui/input';
import {Spinner} from '@/components/ui/spinner';
import {RichText} from '@/components/rich-text';
import {useLocale,useMessages} from '@/i18n/client';
import {installMessages} from '@/i18n/messages/install';
import {APP_PERMISSIONS,INSTALL_STORAGE_KEY,installUrl,readStoredCredentials,type AppCredentials} from '@/lib/installation/github-app';
import {authSecret,environmentFile,initialWizardValues,validateStep,wizardSteps,type WizardValues,type WizardErrors} from '@/lib/installation/wizard';

const LAST=wizardSteps('tr').length-1;
/** Simülasyonun örnek bilgileri: biçimce geçerli, hiçbir hesaba ait değil. */
const DEMO:AppCredentials={appId:'123456',slug:'openpt-ornek',owner:'ornek-pt',clientId:'Iv23liOrnekSimulasyon',clientSecret:'ornek-client-secret',privateKey:'-----BEGIN RSA PRIVATE KEY-----\nU0lNVUxBU1lPTi1PUk5FSy1BTkFIVEFS\n-----END RSA PRIVATE KEY-----\n'};

// GitHub uygulamasının bilgileri yalnız bu sekmenin sessionStorage'ında (dönüş sayfası yazar); okuma/silme try/catch içinde.
const noSubscribe=()=>()=>{};
function storedText():string|null {try{return sessionStorage.getItem(INSTALL_STORAGE_KEY);}catch{return null;}}
function forgetStored() {try{sessionStorage.removeItem(INSTALL_STORAGE_KEY);}catch{/* Depolama kapalıysa saklanan bir şey de yok. */}}

type CheckResult={owner:string}|{error:string;settingsUrl?:string};
async function verifyInstallation(credentials:AppCredentials,installationId:string,signal:AbortSignal,t:ReturnType<typeof installMessages>['ui']):Promise<CheckResult> {
  try{
    const response=await fetch('/api/install/github-app/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({appId:credentials.appId,installationId,privateKey:credentials.privateKey}),signal});
    const result=await response.json() as {owner?:string;error?:string;ayarlar?:string};
    if(response.ok&&result.owner)return {owner:result.owner};
    return {error:result.error??t.verifyFailed,...(result.ayarlar?{settingsUrl:result.ayarlar}:{})};
  }catch{return {error:t.verifyNetwork};}
}

function WizardInput({name,label,value,onChange,error,type='text',description}:{name:keyof WizardValues;label:string;value:string;onChange:(name:keyof WizardValues,value:string)=>void;error?:string;type?:string;description?:string}) {
  return <Field data-invalid={Boolean(error)||undefined}><FieldLabel htmlFor={name}>{label}</FieldLabel><Input id={name} name={name} type={type} value={value} onChange={event=>onChange(name,event.target.value)} autoComplete={type==='password'?'new-password':'off'} spellCheck={false} maxLength={1000} aria-invalid={Boolean(error)||undefined} aria-describedby={error?`${name}-error`:description?`${name}-help`:undefined} />{description && <FieldDescription id={`${name}-help`}>{description}</FieldDescription>}{error && <FieldError id={`${name}-error`}>{error}</FieldError>}</Field>;
}
export function InstallationWizard({homepage,initial,automaticAvailable,demo=false,installationId,githubError}:{homepage:string;initial:{owner:string;codeRepo:string};automaticAvailable:boolean;demo?:boolean;installationId?:string;githubError?:string}) {
  const router=useRouter();
  const locale=useLocale();
  const t=useMessages(installMessages).ui;
  const STEPS=wizardSteps(locale);
  const [step,setStep]=useState(0);
  const [values,setValues]=useState<WizardValues>(initialWizardValues(initial.owner,initial.codeRepo));
  const [errors,setErrors]=useState<WizardErrors>({});
  const [notice,setNotice]=useState('');
  const [exported,setExported]=useState(false);
  const [vercelToken,setVercelToken]=useState('');
  const [busy,setBusy]=useState(false);
  const [automaticError,setAutomaticError]=useState('');
  const [canRetryDeploy,setCanRetryDeploy]=useState(false);
  const [connectError,setConnectError]=useState(githubError?(Object.hasOwn(t.githubErrors,githubError)?t.githubErrors[githubError as keyof typeof t.githubErrors]:t.githubErrors.donusum):'');
  const [check,setCheck]=useState<CheckResult|null>(null);
  const [attempt,setAttempt]=useState(0);
  const [forgotten,setForgotten]=useState(false);
  const text=useSyncExternalStore(noSubscribe,storedText,()=>null);
  const credentials=useMemo(()=>demo||forgotten?null:readStoredCredentials(text),[demo,forgotten,text]);
  const connected=Boolean(values.installationId);
  const verifying=Boolean(credentials&&installationId&&!check&&!connected);
  // GitHub kurulum ayarı değişince `/install`'ı yeni sekmede açabilir: o sekmenin sessionStorage'ı boştur.
  const otherTab=Boolean(installationId&&!credentials&&!connected&&!demo&&!forgotten);
  // GitHub kurulumdan sonra `setup_url`'e (buraya) `installation_id` ile döner: kurulum sunucuda doğrulanır.
  useEffect(()=>{
    if(!credentials||!installationId)return;
    const controller=new AbortController();
    void verifyInstallation(credentials,installationId,controller.signal,t).then(result=>{
      if(controller.signal.aborted)return;
      if('error' in result){setCheck(result);return;}
      const next={...initialWizardValues(initial.owner,initial.codeRepo),owner:result.owner,appId:credentials.appId,installationId,privateKey:credentials.privateKey,clientId:credentials.clientId,clientSecret:credentials.clientSecret,authSecret:authSecret(crypto.getRandomValues(new Uint8Array(32)))};
      if(Object.keys(validateStep(0,next,locale)).length){setCheck({error:t.noRepoLink});return;}
      setCheck(result);setValues(next);setStep(1);
    });
    return()=>controller.abort();
  },[credentials,installationId,attempt,initial.owner,initial.codeRepo,locale,t]);
  const change=(name:keyof WizardValues,value:string)=>{setValues(previous=>({...previous,[name]:value}));setErrors(previous=>({...previous,[name]:undefined}));setNotice('');};
  async function connectGithub() {
    setConnectError('');setNotice('');
    if(demo){
      setValues(previous=>({...previous,owner:initial.owner||DEMO.owner,appId:DEMO.appId,installationId:'7890123',privateKey:DEMO.privateKey,clientId:DEMO.clientId,clientSecret:DEMO.clientSecret,authSecret:previous.authSecret||authSecret(crypto.getRandomValues(new Uint8Array(32)))}));
      setErrors({});setStep(1);
      setNotice(t.demoNotice);
      return;
    }
    setBusy(true);
    try{
      const response=await fetch('/api/install/github-app',{method:'POST'});
      const result=await response.json() as {action?:string;manifest?:string;error?:string};
      if(!response.ok||!result.action||!result.manifest){setConnectError(result.error??t.connectFailed);setBusy(false);return;}
      // GitHub App manifest akışı: manifest GitHub'a form ile gönderilir (state adreste, GitHub geri getirir).
      const form=document.createElement('form');form.method='post';form.action=result.action;
      const input=document.createElement('input');input.type='hidden';input.name='manifest';input.value=result.manifest;
      form.append(input);document.body.append(form);form.submit();
    }catch{setConnectError(t.connectNetwork);setBusy(false);}
  }
  function restart() {
    forgetStored();setForgotten(true);setCheck(null);setConnectError('');setNotice('');setErrors({});
    setValues(initialWizardValues(initial.owner,initial.codeRepo));setStep(0);
    if(installationId||githubError)router.replace('/install');
  }
  function next() {
    if(step===0){if(connected)setStep(1);return;}
    const nextErrors=validateStep(step,values,locale);setErrors(nextErrors);
    if(Object.keys(nextErrors).length)return;
    setNotice('');setStep(previous=>Math.min(previous+1,LAST));
  }
  async function copyEnvironment() {
    try{await navigator.clipboard.writeText(environmentFile(values,locale));setNotice(t.envCopied);setExported(true);}
    catch{setNotice(t.envCopyFailed);}
  }
  function download() {
    try{
      const blob=new Blob([environmentFile(values,locale)],{type:'text/plain;charset=utf-8'});
      const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='openpt.env';link.click();URL.revokeObjectURL(url);
      setExported(true);setNotice(t.envDownloaded);
    }catch(error){setNotice(messageOf(error,locale)??t.envFailed);}
  }
  async function automatic(resumeOnly=false) {
    setAutomaticError('');
    if(demo){setNotice(t.demoDone);return;}
    if(!vercelToken.trim()){setAutomaticError(t.needToken);return;}
    setBusy(true);
    try{
      const response=await fetch('/api/install/configure',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({values,vercelToken:vercelToken.trim(),resumeOnly})});
      const result=await response.json() as {error?:string;canRetryDeploy?:boolean};
      if(!response.ok){setAutomaticError(result.error??t.setupFailed);setCanRetryDeploy(result.canRetryDeploy??false);return;}
      forgetStored();setVercelToken('');router.push('/install?stage=publishing');
    }catch{setAutomaticError(t.connectionLost);setCanRetryDeploy(true);}
    finally{setBusy(false);}
  }
  const field=(name:keyof WizardValues,label:string,description?:string,type='text')=><WizardInput name={name} label={label} value={values[name]??''} onChange={change} error={errors[name]} description={description} type={type} />;
  const failure=check&&'error' in check?check:null;
  return <Card><CardContent className="flex flex-col gap-6">
    {demo && <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm space-y-2"><p className="font-semibold">{t.demoTitle}</p><p>{t.demoBody}</p></div>}
    <div className="space-y-3"><p className="text-sm font-medium" aria-live="polite">{t.stepLabel(step+1,STEPS.length,STEPS[step]??'')}</p><div className="flex gap-2" aria-hidden="true">{STEPS.map((label,index)=><span key={label} className={`h-1.5 flex-1 rounded-full ${index<=step?'bg-primary':'bg-muted'}`} />)}</div></div>
    <form className="flex flex-col gap-5" onSubmit={event=>{event.preventDefault();next();}} noValidate>
      {step===0 && <>
        <h2 className="text-xl font-semibold">{t.github.title}</h2>
        {connected?<div role="status" className="rounded-lg bg-muted p-4 text-sm space-y-1"><p><RichText text={t.github.connected(values.owner)} /></p><p>{t.github.verified}</p></div>
        :verifying?<div role="status" className="flex items-center gap-3 rounded-lg bg-muted p-4 text-sm"><Spinner className="size-5" /><p>{t.github.verifying}</p></div>
        :failure?<div className="flex flex-col gap-3 rounded-lg border border-destructive/40 p-4 text-sm"><p role="alert" className="text-destructive">{failure.error}</p>{failure.settingsUrl && <a href={failure.settingsUrl} target="_blank" rel="noreferrer" className="text-primary underline">{t.github.openSettings}</a>}<p className="text-muted-foreground">{t.github.afterFix}</p><div className="flex flex-wrap gap-3"><Button type="button" onClick={()=>{setCheck(null);setAttempt(previous=>previous+1);}}>{t.github.reverify}</Button><Button type="button" variant="outline" onClick={restart}>{t.github.restart}</Button></div></div>
        :otherTab?<div role="status" className="flex flex-col gap-3 rounded-lg bg-muted p-4 text-sm"><p className="font-medium">{t.github.otherTabTitle}</p><p><RichText text={t.github.otherTabBody} /></p><details className="text-muted-foreground"><summary className="cursor-pointer">{t.github.firstTabClosed}</summary><div className="flex flex-col gap-3 pt-3"><p>{t.github.restartWarning}</p><Button type="button" variant="outline" onClick={restart}>{t.github.restart}</Button></div></details></div>
        :credentials?<div className="flex flex-col gap-3 rounded-lg bg-muted p-4 text-sm"><p><RichText text={t.github.created(credentials.slug)} /></p><p><RichText text={t.github.installHint} /></p><div className="flex flex-wrap gap-3"><Button nativeButton={false} render={<a href={installUrl(credentials.slug)} />}>{t.github.installOnGithub}</Button><Button type="button" variant="outline" onClick={restart}>{t.github.restart}</Button></div></div>
        :<>
          <p className="text-sm text-muted-foreground">{t.github.intro}{initial.owner && <RichText text={t.github.introOwner(initial.owner)} />}</p>
          <ol className="list-decimal space-y-3 pl-5 text-sm">
            {t.github.steps.map(step=><li key={step}><RichText text={step} /></li>)}
          </ol>
          <div className="rounded-lg bg-muted p-4 text-sm space-y-2"><p className="font-medium">{t.github.permissionsTitle}</p><ul className="list-disc space-y-1 pl-5 text-muted-foreground">{(Object.keys(APP_PERMISSIONS) as (keyof typeof APP_PERMISSIONS)[]).map(key=><li key={key}>{t.permissions[key]}</li>)}</ul><p className="text-muted-foreground">{t.github.webhook}</p></div>
          <Button type="button" disabled={busy} onClick={()=>void connectGithub()}>{busy?t.github.redirecting:t.github.connect}</Button>
        </>}
        {connectError && !credentials && <p role="alert" className="text-sm text-destructive">{connectError}</p>}
      </>}
      {step===1 && <>
        <h2 className="text-xl font-semibold">{t.ai.title}</h2>
        <p className="text-sm text-muted-foreground">{t.ai.body}</p>
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-sm text-primary underline">{t.ai.create}</a>
        {field('geminiKey',t.ai.field,undefined,'password')}
      </>}
      {step===2 && <>
        <h2 className="text-xl font-semibold">{t.vercel.title}</h2>
        <div className="rounded-lg bg-muted p-4 text-sm space-y-1"><p>{t.vercel.owner(values.owner)}</p><p>{t.vercel.homepage(homepage)}</p><p>{t.vercel.auto}</p></div>
        {automaticAvailable?<div className="flex flex-col gap-4 rounded-lg border p-4">
          <h3 className="font-semibold">{t.vercel.autoTitle}</h3>
          <ol className="list-decimal space-y-3 pl-5 text-sm text-muted-foreground">{t.vercel.autoSteps.map(step=><li key={step}><RichText text={step} /></li>)}</ol>
          <a href="https://vercel.com/account/settings/tokens" target="_blank" rel="noreferrer" className="text-sm text-primary underline">{t.vercel.createToken}</a>
          <Field><FieldLabel htmlFor="vercelToken">{t.vercel.tokenLabel}</FieldLabel><Input id="vercelToken" name="vercelToken" type="password" value={vercelToken} onChange={event=>setVercelToken(event.target.value)} autoComplete="new-password" maxLength={1000} disabled={busy} /></Field>
          <p className="text-xs text-muted-foreground">{t.vercel.tokenNote}</p>
          {automaticError && <p role="alert" className="text-sm text-destructive">{automaticError}</p>}
          <Button type="button" disabled={busy} onClick={()=>automatic(canRetryDeploy)}>{busy?t.vercel.transferring:canRetryDeploy?t.vercel.retry:t.vercel.run}</Button>
        </div>:<p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">{t.vercel.autoUnavailable}</p>}
        <details className="rounded-lg border p-4" open={!automaticAvailable}><summary className="cursor-pointer font-medium">{t.vercel.manual}</summary><div className="flex flex-col gap-4 pt-4">
          <ol className="list-decimal space-y-3 pl-5 text-sm text-muted-foreground">{t.vercel.manualSteps.map(step=><li key={step}>{step}</li>)}</ol>
          <p className="text-xs text-muted-foreground">{t.vercel.manualNote}</p>
          <div className="flex flex-wrap gap-3"><Button type="button" disabled={busy} onClick={()=>void copyEnvironment()}>{t.vercel.copy}</Button><Button type="button" disabled={busy} variant="outline" onClick={download}>{t.vercel.download}</Button></div>
          <a href="https://vercel.com/dashboard" target="_blank" rel="noreferrer" className="text-sm text-primary underline">{t.vercel.openVercel}</a>
          <Button nativeButton={false} render={<Link href="/install?stage=publishing" onClick={forgetStored} />} disabled={!exported||busy}>{t.vercel.checkPublishing}</Button>
        </div></details>
      </>}
      {notice && <p role="status" className="text-sm text-primary">{notice}</p>}
      <div className="flex justify-between gap-3 pt-2">{step>0?<Button type="button" variant="outline" disabled={busy} onClick={()=>{setStep(previous=>previous-1);setErrors({});setNotice('');setCanRetryDeploy(false);}}>{t.back}</Button>:<span />}{(step===1||(step===0&&connected)) && <Button type="submit" disabled={busy}>{step===1 && !values.geminiKey?t.ai.skip:t.next}</Button>}</div>
    </form>
    {step<LAST && <p className="text-xs text-muted-foreground">{t.tabNote}</p>}
  </CardContent></Card>;
}
