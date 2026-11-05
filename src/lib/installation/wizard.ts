import * as v from 'valibot';
import {LocalizedError} from '../../i18n/errors.ts';
import {DEFAULT_LOCALE,type Locale} from '../../i18n/locale.ts';
import {installMessages} from '../../i18n/messages/install/index.ts';
import {langConfig,msg} from '../../i18n/valibot.ts';
import {escapePrivateKey,isPrivateKey} from '../github/private-key.ts';

/**
 * Kurulum sihirbazının saf çekirdeği (tarayıcı ve sunucu): adımlar, doğrulama ve Vercel'e yazılacak env.
 * GitHub tek adımda bağlanır (GitHub uygulaması, manifest akışı); kişisel anahtar ve OAuth App adımları yok.
 */
export function wizardSteps(locale:Locale=DEFAULT_LOCALE):readonly string[] {return installMessages(locale).wizard.steps;}
/** Türkçe adımlar (eski çağrılar); arayüz `wizardSteps(locale)` kullanır. */
export const WIZARD_STEPS=wizardSteps('tr');
const text=(pick:(wizard:ReturnType<typeof installMessages>['wizard'])=>string)=>msg(l=>pick(installMessages(l).wizard));
const CONNECT=text(w=>w.connect);
const secret = v.pipe(v.string(),v.trim(),v.minLength(1,text(w=>w.required)),v.maxLength(1000),v.regex(/^[A-Za-z0-9_./+=-]+$/,text(w=>w.pasteKey)));
const numericId=v.pipe(v.string(),v.trim(),v.regex(/^[1-9]\d{0,14}$/,CONNECT));
const privateKey=v.pipe(v.string(),v.maxLength(10000,CONNECT),v.check(isPrivateKey,CONNECT));
const repository = v.pipe(v.string(),v.trim(),v.regex(/^[\w.-]{1,100}$/,text(w=>w.repoName)),v.check(name=>!['.','..'].includes(name),text(w=>w.repoName)));
const githubSchema = v.object({
  owner:v.pipe(v.string(),v.trim(),v.regex(/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i,text(w=>w.owner))),
  codeRepo:repository,
  appRepo:v.pipe(repository,v.check(name=>!name.toLowerCase().startsWith('client-'),text(w=>w.dataRepoPrefix))),
  codeBranch:v.pipe(v.string(),v.trim(),v.minLength(1,text(w=>w.branchRequired)),v.maxLength(250),v.regex(/^[\w./-]+$/,text(w=>w.branchName))),
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
  return {owner,codeRepo,codeBranch:'main',appRepo:codeRepo.toLowerCase()==='openpt-data'?'openpt-private-data':'openpt-data',appId:'',installationId:'',privateKey:'',clientId:'',clientSecret:'',geminiKey:'',authSecret:''};
}
function fieldErrors(issues:v.BaseIssue<unknown>[]):WizardErrors {
  const errors:WizardErrors={};
  for(const issue of issues){const key=issue.path?.[0]?.key as keyof WizardValues|undefined;if(key && !errors[key])errors[key]=issue.message;}
  return errors;
}
const LAST=WIZARD_STEPS.length-1;
export function validateStep(step:number,values:WizardValues,locale:Locale=DEFAULT_LOCALE):WizardErrors {
  const selected=step===0?githubSchema:step===1?optionalSchema:schema;
  const parsed=v.safeParse(selected,values,langConfig(locale));
  const errors=parsed.success?{}:fieldErrors(parsed.issues);
  if(step===0 || step>=LAST){if(values.appRepo.trim().toLowerCase()===values.codeRepo.trim().toLowerCase())errors.appRepo=installMessages(locale).wizard.repoDifferent;}
  return errors;
}
/**
 * Vercel Production env'i. Özel anahtar tek satır (`\n` kaçışlı): `.env` satırı bozulmaz, sunucu
 * (`github/access.ts`) geri çevirir. Kişisel anahtar (GITHUB_TOKEN) yazılmaz.
 */
export function environmentValues(input:WizardValues):Record<string,string> {
  const errors=validateStep(LAST,input);
  if(Object.keys(errors).length)throw new LocalizedError(l=>installMessages(l).wizard.fillFirst);
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
export function environmentFile(input:WizardValues,locale:Locale=DEFAULT_LOCALE):string {
  return installMessages(locale).wizard.envHeader+Object.entries(environmentValues(input)).map(([key,value])=>`${key}=${value}`).join('\n')+'\n';
}
export function authSecret(bytes:Uint8Array):string {
  if(bytes.length!==32)throw new LocalizedError(l=>installMessages(l).wizard.randomBytes);
  return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
