'use client';
import {useEffect,useMemo,useState,useSyncExternalStore} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import {Card,CardContent} from '@/components/ui/card';
import {Field,FieldLabel,FieldError,FieldDescription} from '@/components/ui/field';
import {Input} from '@/components/ui/input';
import {Spinner} from '@/components/ui/spinner';
import {APP_PERMISSIONS,INSTALL_STORAGE_KEY,installUrl,readStoredCredentials,type AppCredentials} from '@/lib/installation/github-app';
import {authSecret,environmentFile,initialWizardValues,validateStep,WIZARD_STEPS,type WizardValues,type WizardErrors} from '@/lib/installation/wizard';

const STEPS=WIZARD_STEPS;
const LAST=STEPS.length-1;
/** Manifest'teki izinlerin ne için istendiği (`APP_PERMISSIONS` ile aynı anahtarlar). */
const PERMISSIONS:Record<keyof typeof APP_PERMISSIONS,string>={
  administration:'Administration (yazma): danışan repolarını açıp silmek',
  contents:'Contents (yazma): verileri okuyup yazmak',
  actions:'Actions (yazma): güncellemeyi hazırlatmak',
  workflows:'Workflows (yazma): eksik güncelleme dosyasını kod repona eklemek',
  metadata:'Metadata (okuma): GitHub’ın her uygulamaya verdiği temel izin',
};
/** GitHub dönüş ucunun kısa hata kodları (`/api/install/github-app`); sır taşımaz. */
const GITHUB_ERRORS:Record<string,string>={
  oturum:'GitHub dönüşü bu tarayıcıdaki kurulumla eşleşmedi ya da süresi doldu. “GitHub’a bağla” ile yeniden başla.',
  kod:'GitHub dönüşünde kod yoktu. “GitHub’a bağla” ile yeniden başla.',
  sure:'GitHub dönüş kodunun süresi dolmuş ya da kullanılmış. “GitHub’a bağla” ile yeniden başla.',
  donusum:'GitHub uygulamasının bilgileri alınamadı. Biraz sonra “GitHub’a bağla” ile yeniden dene.',
  simulasyon:'Simülasyonda GitHub’a gidilmez.',
};
/** Simülasyonun örnek bilgileri: biçimce geçerli, hiçbir hesaba ait değil. */
const DEMO:AppCredentials={appId:'123456',slug:'axon-fit-ornek',owner:'ornek-pt',clientId:'Iv23liOrnekSimulasyon',clientSecret:'ornek-client-secret',privateKey:'-----BEGIN RSA PRIVATE KEY-----\nU0lNVUxBU1lPTi1PUk5FSy1BTkFIVEFS\n-----END RSA PRIVATE KEY-----\n'};

// GitHub uygulamasının bilgileri yalnız bu sekmenin sessionStorage'ında (dönüş sayfası yazar); okuma/silme try/catch içinde.
const noSubscribe=()=>()=>{};
function storedText():string|null {try{return sessionStorage.getItem(INSTALL_STORAGE_KEY);}catch{return null;}}
function forgetStored() {try{sessionStorage.removeItem(INSTALL_STORAGE_KEY);}catch{/* Depolama kapalıysa saklanan bir şey de yok. */}}

type CheckResult={owner:string}|{error:string;settingsUrl?:string};
async function verifyInstallation(credentials:AppCredentials,installationId:string,signal:AbortSignal):Promise<CheckResult> {
  try{
    const response=await fetch('/api/install/github-app/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({appId:credentials.appId,installationId,privateKey:credentials.privateKey}),signal});
    const result=await response.json() as {owner?:string;error?:string;ayarlar?:string};
    if(response.ok&&result.owner)return {owner:result.owner};
    return {error:result.error??'GitHub kurulumu doğrulanamadı.',...(result.ayarlar?{settingsUrl:result.ayarlar}:{})};
  }catch{return {error:'GitHub kurulumu doğrulanamadı. Bağlantını kontrol edip tekrar dene.'};}
}

function WizardInput({name,label,value,onChange,error,type='text',description}:{name:keyof WizardValues;label:string;value:string;onChange:(name:keyof WizardValues,value:string)=>void;error?:string;type?:string;description?:string}) {
  return <Field data-invalid={Boolean(error)||undefined}><FieldLabel htmlFor={name}>{label}</FieldLabel><Input id={name} name={name} type={type} value={value} onChange={event=>onChange(name,event.target.value)} autoComplete={type==='password'?'new-password':'off'} spellCheck={false} maxLength={1000} aria-invalid={Boolean(error)||undefined} aria-describedby={error?`${name}-error`:description?`${name}-help`:undefined} />{description && <FieldDescription id={`${name}-help`}>{description}</FieldDescription>}{error && <FieldError id={`${name}-error`}>{error}</FieldError>}</Field>;
}
export function InstallationWizard({homepage,initial,automaticAvailable,demo=false,installationId,githubError}:{homepage:string;initial:{owner:string;codeRepo:string};automaticAvailable:boolean;demo?:boolean;installationId?:string;githubError?:string}) {
  const router=useRouter();
  const [step,setStep]=useState(0);
  const [values,setValues]=useState<WizardValues>(initialWizardValues(initial.owner,initial.codeRepo));
  const [errors,setErrors]=useState<WizardErrors>({});
  const [notice,setNotice]=useState('');
  const [exported,setExported]=useState(false);
  const [vercelToken,setVercelToken]=useState('');
  const [busy,setBusy]=useState(false);
  const [automaticError,setAutomaticError]=useState('');
  const [canRetryDeploy,setCanRetryDeploy]=useState(false);
  const [connectError,setConnectError]=useState(githubError?GITHUB_ERRORS[githubError]??GITHUB_ERRORS.donusum!:'');
  const [check,setCheck]=useState<CheckResult|null>(null);
  const [attempt,setAttempt]=useState(0);
  const [forgotten,setForgotten]=useState(false);
  const text=useSyncExternalStore(noSubscribe,storedText,()=>null);
  const credentials=useMemo(()=>demo||forgotten?null:readStoredCredentials(text),[demo,forgotten,text]);
  const connected=Boolean(values.installationId);
  const verifying=Boolean(credentials&&installationId&&!check&&!connected);
  // GitHub kurulumdan sonra `setup_url`'e (buraya) `installation_id` ile döner: kurulum sunucuda doğrulanır.
  useEffect(()=>{
    if(!credentials||!installationId)return;
    const controller=new AbortController();
    void verifyInstallation(credentials,installationId,controller.signal).then(result=>{
      if(controller.signal.aborted)return;
      if('error' in result){setCheck(result);return;}
      const next={...initialWizardValues(initial.owner,initial.codeRepo),owner:result.owner,appId:credentials.appId,installationId,privateKey:credentials.privateKey,clientId:credentials.clientId,clientSecret:credentials.clientSecret,authSecret:authSecret(crypto.getRandomValues(new Uint8Array(32)))};
      if(Object.keys(validateStep(0,next)).length){setCheck({error:'Uygulamanın GitHub kod repo bağlantısı bulunamadı. Kurulumu kendi Vercel projenin Production adresinden aç.'});return;}
      setCheck(result);setValues(next);setStep(1);
    });
    return()=>controller.abort();
  },[credentials,installationId,attempt,initial.owner,initial.codeRepo]);
  const change=(name:keyof WizardValues,value:string)=>{setValues(previous=>({...previous,[name]:value}));setErrors(previous=>({...previous,[name]:undefined}));setNotice('');};
  async function connectGithub() {
    setConnectError('');setNotice('');
    if(demo){
      setValues(previous=>({...previous,owner:initial.owner||DEMO.owner,appId:DEMO.appId,installationId:'7890123',privateKey:DEMO.privateKey,clientId:DEMO.clientId,clientSecret:DEMO.clientSecret,authSecret:previous.authSecret||authSecret(crypto.getRandomValues(new Uint8Array(32)))}));
      setErrors({});setStep(1);
      setNotice('Simülasyon: gerçek kurulumda GitHub’da önce “Create GitHub App”, sonra “Install” düğmesine basarsın (All repositories seçili). GitHub seni buraya döndürür, kurulum doğrulanır. Bu denemede GitHub’a gidilmedi; örnek bilgiler dolduruldu.');
      return;
    }
    setBusy(true);
    try{
      const response=await fetch('/api/install/github-app',{method:'POST'});
      const result=await response.json() as {action?:string;manifest?:string;error?:string};
      if(!response.ok||!result.action||!result.manifest){setConnectError(result.error??'GitHub bağlantısı başlatılamadı.');setBusy(false);return;}
      // GitHub App manifest akışı: manifest GitHub'a form ile gönderilir (state adreste, GitHub geri getirir).
      const form=document.createElement('form');form.method='post';form.action=result.action;
      const input=document.createElement('input');input.type='hidden';input.name='manifest';input.value=result.manifest;
      form.append(input);document.body.append(form);form.submit();
    }catch{setConnectError('GitHub’a bağlanılamadı. Bağlantını kontrol edip tekrar dene.');setBusy(false);}
  }
  function restart() {
    forgetStored();setForgotten(true);setCheck(null);setConnectError('');setNotice('');setErrors({});
    setValues(initialWizardValues(initial.owner,initial.codeRepo));setStep(0);
    if(installationId||githubError)router.replace('/install');
  }
  function next() {
    if(step===0){if(connected)setStep(1);return;}
    const nextErrors=validateStep(step,values);setErrors(nextErrors);
    if(Object.keys(nextErrors).length)return;
    setNotice('');setStep(previous=>Math.min(previous+1,LAST));
  }
  async function copyEnvironment() {
    try{await navigator.clipboard.writeText(environmentFile(values));setNotice('Ayarlar kopyalandı. Kendi Vercel projenin Environment Variables ekranına yapıştır.');setExported(true);}
    catch{setNotice('Kopyalama yapılamadı. .env dosyasını indirerek devam edebilirsin.');}
  }
  function download() {
    try{
      const blob=new Blob([environmentFile(values)],{type:'text/plain;charset=utf-8'});
      const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='axon-fit.env';link.click();URL.revokeObjectURL(url);
      setExported(true);setNotice('Dosya hazırlandı. Kendi Vercel projenin Environment Variables ekranına aktar.');
    }catch(error){setNotice(error instanceof Error?error.message:'Dosya hazırlanamadı.');}
  }
  async function automatic(resumeOnly=false) {
    setAutomaticError('');
    if(demo){setNotice('Simülasyon tamamlandı. Gerçek kurulumda ayarlar Vercel’e aktarılır ve yeni yayın başlayınca giriş ekranı açılır. Bu denemede hiçbir hesaba yazılmadı.');return;}
    if(!vercelToken.trim()){setAutomaticError('Kendi Vercel tokenını gir. Yalnız bu projenin kurulumu için kullanılacak.');return;}
    setBusy(true);
    try{
      const response=await fetch('/api/install/configure',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({values,vercelToken:vercelToken.trim(),resumeOnly})});
      const result=await response.json() as {error?:string;canRetryDeploy?:boolean};
      if(!response.ok){setAutomaticError(result.error??'Kurulum tamamlanamadı.');setCanRetryDeploy(result.canRetryDeploy??false);return;}
      forgetStored();setVercelToken('');router.push('/install?stage=publishing');
    }catch{setAutomaticError('Bağlantı kesildi. Vercel’de ayarların ve son yayının durumunu kontrol et. Ayarlar kaydedildiyse yeniden yayınlamayı dene.');setCanRetryDeploy(true);}
    finally{setBusy(false);}
  }
  const field=(name:keyof WizardValues,label:string,description?:string,type='text')=><WizardInput name={name} label={label} value={values[name]??''} onChange={change} error={errors[name]} description={description} type={type} />;
  const failure=check&&'error' in check?check:null;
  return <Card><CardContent className="flex flex-col gap-6">
    {demo && <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm space-y-2"><p className="font-semibold">Kurulum simülasyonu</p><p>Gerçek anahtar girme. Adımları örnek bilgilerle gez; bu ekrandan GitHub’a ya da Vercel’e istek gönderilmez, hiçbir hesaba işlem yapılmaz.</p></div>}
    <div className="space-y-3"><p className="text-sm font-medium" aria-live="polite">Adım {step+1} / {STEPS.length} · {STEPS[step]}</p><div className="flex gap-2" aria-hidden="true">{STEPS.map((label,index)=><span key={label} className={`h-1.5 flex-1 rounded-full ${index<=step?'bg-primary':'bg-muted'}`} />)}</div></div>
    <form className="flex flex-col gap-5" onSubmit={event=>{event.preventDefault();next();}} noValidate>
      {step===0 && <>
        <h2 className="text-xl font-semibold">GitHub’a bağla</h2>
        {connected?<div role="status" className="rounded-lg bg-muted p-4 text-sm space-y-1"><p>GitHub hesabın bağlandı: <strong>{values.owner}</strong>.</p><p>Kurulum doğrulandı. Devam edebilirsin.</p></div>
        :verifying?<div role="status" className="flex items-center gap-3 rounded-lg bg-muted p-4 text-sm"><Spinner className="size-5" /><p>GitHub kurulumun doğrulanıyor…</p></div>
        :failure?<div className="flex flex-col gap-3 rounded-lg border border-destructive/40 p-4 text-sm"><p role="alert" className="text-destructive">{failure.error}</p>{failure.settingsUrl && <a href={failure.settingsUrl} target="_blank" rel="noreferrer" className="text-primary underline">GitHub’daki kurulum ayarını aç</a>}<p className="text-muted-foreground">Ayarı düzelttikten sonra yeniden doğrula.</p><div className="flex flex-wrap gap-3"><Button type="button" onClick={()=>{setCheck(null);setAttempt(previous=>previous+1);}}>Yeniden doğrula</Button><Button type="button" variant="outline" onClick={restart}>Baştan başla</Button></div></div>
        :credentials?<div className="flex flex-col gap-3 rounded-lg bg-muted p-4 text-sm"><p>GitHub uygulaman oluşturuldu (<strong>{credentials.slug}</strong>) ama henüz hesabına kurulmadı.</p><p>GitHub’da <strong>All repositories</strong> seçili olsun ve <strong>Install</strong> düğmesine bas; GitHub seni buraya geri getirir.</p><div className="flex flex-wrap gap-3"><Button nativeButton={false} render={<a href={installUrl(credentials.slug)} />}>GitHub’da kur</Button><Button type="button" variant="outline" onClick={restart}>Baştan başla</Button></div></div>
        :<>
          <p className="text-sm text-muted-foreground">Kendi GitHub hesabında bu kuruluma ait küçük bir GitHub uygulaması oluşturacağız. GitHub ile girişini ve özel veri repolarına erişimi bu uygulama sağlar; anahtar kopyalaman gerekmez.{initial.owner && <> Bu adımı <strong>{initial.owner}</strong> GitHub hesabında yap.</>}</p>
          <ol className="list-decimal space-y-3 pl-5 text-sm">
            <li>Aşağıdaki düğmeye bas. GitHub’da açılan sayfada adı değiştirmeden <strong>Create GitHub App</strong> düğmesine bas.</li>
            <li>Sonraki sayfada <strong>All repositories</strong> seçili olsun ve <strong>Install</strong> düğmesine bas. Danışan repoları sonradan açıldığı için uygulamanın bütün repolarına erişmesi gerekir; uygulama yalnız kendi kod, veri ve danışan repolarına dokunur.</li>
            <li>GitHub seni buraya geri getirir. Kurulumu doğrularız; kod reponda güncelleme dosyası eksikse ekleriz, var olan dosyaya dokunmayız.</li>
          </ol>
          <div className="rounded-lg bg-muted p-4 text-sm space-y-2"><p className="font-medium">Uygulamanın istediği izinler</p><ul className="list-disc space-y-1 pl-5 text-muted-foreground">{Object.entries(PERMISSIONS).map(([key,label])=><li key={key}>{label}</li>)}</ul><p className="text-muted-foreground">Webhook kapalı: uygulama hiçbir yere olay göndermez.</p></div>
          <Button type="button" disabled={busy} onClick={()=>void connectGithub()}>{busy?'GitHub’a yönlendiriliyor…':'GitHub’a bağla'}</Button>
        </>}
        {connectError && !credentials && <p role="alert" className="text-sm text-destructive">{connectError}</p>}
      </>}
      {step===1 && <>
        <h2 className="text-xl font-semibold">Gemini anahtarı eklemek ister misin?</h2>
        <p className="text-sm text-muted-foreground">Bu adımı boş bırakarak devam edebilirsin. Anahtarını sonradan Ayarlar → Yapay zekâ ve Gemini anahtarı ekranından ekleyebilirsin.</p>
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-sm text-primary underline">Kendi Gemini anahtarımı oluştur</a>
        {field('geminiKey','Gemini API anahtarı · isteğe bağlı',undefined,'password')}
      </>}
      {step===2 && <>
        <h2 className="text-xl font-semibold">Ayarları kendi Vercel projene aktar</h2>
        <div className="rounded-lg bg-muted p-4 text-sm space-y-1"><p>GitHub hesabın: {values.owner}</p><p>Uygulama adresin: {homepage}</p><p>Özel veri alanı ve güvenli oturum ayarları otomatik hazırlanır.</p></div>
        {automaticAvailable?<div className="flex flex-col gap-4 rounded-lg border p-4">
          <h3 className="font-semibold">Otomatik aktar ve yayınla</h3>
          <ol className="list-decimal space-y-3 pl-5 text-sm text-muted-foreground"><li>Aşağıdaki düğmeyle Vercel’de anahtar oluşturma ekranını aç.</li><li><strong>Create Token</strong> düğmesine bas; isim olarak <strong>Axon kurulumu</strong> yaz.</li><li><strong>Scope</strong> alanında uygulamanın bulunduğu hesabı veya team’i seç. <strong>Expiration</strong> alanında bir geçerlilik süresi seç.</li><li>Anahtarı oluştur, kopyala ve aşağıya yapıştır. <strong>Otomatik kur ve yayınla</strong> düğmesi kalan işlemleri tamamlar.</li></ol>
          <a href="https://vercel.com/account/settings/tokens" target="_blank" rel="noreferrer" className="text-sm text-primary underline">Kendi Vercel tokenımı oluştur</a>
          <Field><FieldLabel htmlFor="vercelToken">Vercel’den kopyaladığın anahtar</FieldLabel><Input id="vercelToken" name="vercelToken" type="password" value={vercelToken} onChange={event=>setVercelToken(event.target.value)} autoComplete="new-password" maxLength={1000} disabled={busy} /></Field>
          <p className="text-xs text-muted-foreground">Ayarlar yalnız kendi uygulamanın sunucusu üzerinden kendi Vercel projenine gönderilir. Vercel tokenı env, DB veya çerezde saklanmaz. Kurulum bitince Vercel’den iptal edebilirsin.</p>
          {automaticError && <p role="alert" className="text-sm text-destructive">{automaticError}</p>}
          <Button type="button" disabled={busy} onClick={()=>automatic(canRetryDeploy)}>{busy?'Ayarlar aktarılıyor…':canRetryDeploy?'Kurulumu tamamlamayı tekrar dene':'Otomatik kur ve yayınla'}</Button>
        </div>:<p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">Otomatik aktarım kendi Vercel Production yayınında açılır. Yerel veya Preview ortamında aşağıdaki manuel aktarımı kullanabilirsin.</p>}
        <details className="rounded-lg border p-4" open={!automaticAvailable}><summary className="cursor-pointer font-medium">Manuel aktarım</summary><div className="flex flex-col gap-4 pt-4">
          <ol className="list-decimal space-y-3 pl-5 text-sm text-muted-foreground"><li>Kendi Vercel projenin Settings → Environment Variables ekranını aç.</li><li>Ayarları kopyala veya dosyayı indir. Vercel’e yapıştır/aktar ve Production ortamını seç. Secret, özel anahtar ve API anahtarlarını Sensitive olarak kaydet.</li><li>Yeni ayarların kullanılması için yeni Production yayını başlat.</li></ol>
          <p className="text-xs text-muted-foreground">Manuel çıktı sunucuya gönderilmez. İndirdiğin dosya sır içerir (GitHub uygulamasının özel anahtarı dahil); kod reposuna ekleme.</p>
          <div className="flex flex-wrap gap-3"><Button type="button" disabled={busy} onClick={()=>void copyEnvironment()}>Ayarları kopyala</Button><Button type="button" disabled={busy} variant="outline" onClick={download}>.env dosyasını indir</Button></div>
          <a href="https://vercel.com/dashboard" target="_blank" rel="noreferrer" className="text-sm text-primary underline">Kendi Vercel projelerimi aç</a>
          <Button nativeButton={false} render={<Link href="/install?stage=publishing" onClick={forgetStored} />} disabled={!exported||busy}>Yeni yayını kontrol et</Button>
        </div></details>
      </>}
      {notice && <p role="status" className="text-sm text-primary">{notice}</p>}
      <div className="flex justify-between gap-3 pt-2">{step>0?<Button type="button" variant="outline" disabled={busy} onClick={()=>{setStep(previous=>previous-1);setErrors({});setNotice('');setCanRetryDeploy(false);}}>Geri</Button>:<span />}{(step===1||(step===0&&connected)) && <Button type="submit" disabled={busy}>{step===1 && !values.geminiKey?'AI anahtarını atla':'Devam et'}</Button>}</div>
    </form>
    {step<LAST && <p className="text-xs text-muted-foreground">GitHub uygulamasının bilgileri yalnız bu sekmede tutulur ve kurulum bitince silinir. Sekmeyi kapatırsan “GitHub’a bağla” adımını yeniden yapman gerekir.</p>}
  </CardContent></Card>;
}
