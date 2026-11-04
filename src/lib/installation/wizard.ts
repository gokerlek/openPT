import * as v from 'valibot';
import {escapePrivateKey,isPrivateKey} from '../github/private-key.ts';

/**
 * Kurulum sihirbazının saf çekirdeği (tarayıcı ve sunucu): adımlar, doğrulama ve Vercel'e yazılacak env.
 * GitHub tek adımda bağlanır (GitHub uygulaması, manifest akışı); kişisel anahtar ve OAuth App adımları yok.
 */
export const WIZARD_STEPS=['GitHub’a bağla','İsteğe bağlı AI','Vercel’e aktar'] as const;
const CONNECT='“GitHub’a bağla” adımını tamamla.';
const secret = v.pipe(v.string(),v.trim(),v.minLength(1,'Bu alanı doldur.'),v.maxLength(1000),v.regex(/^[A-Za-z0-9_./+=-]+$/,'Anahtarın tamamını boşluksuz yapıştır.'));
const numericId=v.pipe(v.string(),v.trim(),v.regex(/^[1-9]\d{0,14}$/,CONNECT));
const privateKey=v.pipe(v.string(),v.maxLength(10000,CONNECT),v.check(isPrivateKey,CONNECT));
const repository = v.pipe(v.string(),v.trim(),v.regex(/^[\w.-]{1,100}$/,'Geçerli bir repo adı yaz.'),v.check(name=>!['.','..'].includes(name),'Geçerli bir repo adı yaz.'));
const githubSchema = v.object({
  owner:v.pipe(v.string(),v.trim(),v.regex(/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i,'GitHub kullanıcı adını yaz.')),
  codeRepo:repository,
  appRepo:v.pipe(repository,v.check(name=>!name.toLowerCase().startsWith('client-'),'Veri reposu client- ile başlamamalı.')),
  codeBranch:v.pipe(v.string(),v.trim(),v.minLength(1,'Üretim dalını yaz.'),v.maxLength(250),v.regex(/^[\w./-]+$/,'Geçerli bir dal adı yaz.')),
  // GitHub uygulamasının bilgileri: manifest dönüşümünden (App ID, giriş bilgileri, anahtar) ve kurulumdan.
  appId:numericId,installationId:numericId,privateKey,clientId:secret,clientSecret:secret,
});
const optionalSchema=v.object({geminiKey:v.optional(v.union([v.literal(''),secret]),'')});
export const wizardSchema=v.object({...githubSchema.entries,...optionalSchema.entries,authSecret:v.pipe(secret,v.minLength(32))});
/** Kurulum doğrulama ucunun girdisi: yalnız kimlikler ve anahtar. */
export const installationCheckSchema=v.strictObject({appId:numericId,installationId:numericId,privateKey});
const schema=wizardSchema;
export type WizardValues=v.InferInput<typeof schema>;
export type WizardErrors=Partial<Record<keyof WizardValues,string>>;
export function initialWizardValues(owner:string,codeRepo:string):WizardValues {
  return {owner,codeRepo,codeBranch:'main',appRepo:codeRepo.toLowerCase()==='axon-fit-data'?'axon-fit-private-data':'axon-fit-data',appId:'',installationId:'',privateKey:'',clientId:'',clientSecret:'',geminiKey:'',authSecret:''};
}
function fieldErrors(issues:v.BaseIssue<unknown>[]):WizardErrors {
  const errors:WizardErrors={};
  for(const issue of issues){const key=issue.path?.[0]?.key as keyof WizardValues|undefined;if(key && !errors[key])errors[key]=issue.message;}
  return errors;
}
const LAST=WIZARD_STEPS.length-1;
export function validateStep(step:number,values:WizardValues):WizardErrors {
  const selected=step===0?githubSchema:step===1?optionalSchema:schema;
  const parsed=v.safeParse(selected,values);
  const errors=parsed.success?{}:fieldErrors(parsed.issues);
  if(step===0 || step>=LAST){if(values.appRepo.trim().toLowerCase()===values.codeRepo.trim().toLowerCase())errors.appRepo='Veri reposu kod reposundan farklı olmalı.';}
  return errors;
}
/**
 * Vercel Production env'i. Özel anahtar tek satır (`\n` kaçışlı): `.env` satırı bozulmaz, sunucu
 * (`github/access.ts`) geri çevirir. Kişisel anahtar (GITHUB_TOKEN) yazılmaz.
 */
export function environmentValues(input:WizardValues):Record<string,string> {
  const errors=validateStep(LAST,input);
  if(Object.keys(errors).length)throw new Error('Önce gerekli bilgileri tamamla.');
  const values=v.parse(schema,input);
  const entries:Record<string,string>={
    GITHUB_OWNER:values.owner,APP_REPO:values.appRepo,
    GITHUB_APP_ID:values.appId,GITHUB_APP_INSTALLATION_ID:values.installationId,GITHUB_APP_PRIVATE_KEY:escapePrivateKey(values.privateKey),
    GITHUB_CLIENT_ID:values.clientId,GITHUB_CLIENT_SECRET:values.clientSecret,AUTH_SECRET:values.authSecret,
    AXON_CODE_REPO:`${values.owner}/${values.codeRepo}`,AXON_CODE_BRANCH:values.codeBranch,
  };
  if(values.geminiKey)entries.GEMINI_API_KEY=values.geminiKey;
  return entries;
}
export function environmentFile(input:WizardValues):string {
  return '# Axon Fit — kendi Vercel projenin Production ortamına ekle.\n# Bu dosya sır içerir; GitHub reposuna ekleme.\n'+Object.entries(environmentValues(input)).map(([key,value])=>`${key}=${value}`).join('\n')+'\n';
}
export function authSecret(bytes:Uint8Array):string {
  if(bytes.length!==32)throw new Error('32 bayt rastgele veri gerekir.');
  return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
