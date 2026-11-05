import * as v from 'valibot';
import {LocalizedError} from '../../i18n/errors.ts';
import {DEFAULT_LOCALE,type Locale} from '../../i18n/locale.ts';
import {installMessages} from '../../i18n/messages/install/index.ts';
import {normalizePrivateKey,isPrivateKey} from '../github/private-key.ts';

/**
 * Kurulumun GitHub uygulaması (GitHub App) parçası — saf: ağ, ortam ve Node'a özgü modül yok; sihirbaz
 * (tarayıcı) ve sunucu aynı kuralları kullanır. Akış (tasarım B2):
 *   1. Sihirbaz manifest'i GitHub'a form ile gönderir (`githubAppManifest`, `manifestFormAction`).
 *   2. GitHub `redirect_url`'e kodla döner; sunucu kodu bilgilere çevirir (`parseConversion`) ve bilgileri
 *      yalnız bu sekmenin sessionStorage'ına koyan sayfayı döner (`handoffPage`), oradan kurulum sayfasına.
 *   3. Kurulumdan sonra GitHub `setup_url`'e (`/install`) döner; kurulum doğrulanır (`installationProblems`).
 */

/** Uygulamanın izinleri: repo açma/silme (administration), veri (contents), güncelleme (actions, workflows). */
export const APP_PERMISSIONS={administration:'write',contents:'write',actions:'write',workflows:'write',metadata:'read'} as const;
/** Bu sekmenin sessionStorage anahtarı: GitHub uygulamasının bilgileri kurulum bitene kadar yalnız burada durur. */
export const INSTALL_STORAGE_KEY='axon-fit:kurulum:github';

const NAME_LIMIT=34;
const SUFFIX=/^[a-z]{6}$/;
const SLUG=/^[a-z0-9][a-z0-9-]{0,99}$/;
const LOGIN=/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;
const CREDENTIAL=/^[A-Za-z0-9_.-]{1,200}$/;
const TURKISH:Record<string,string>={ç:'c',Ç:'C',ğ:'g',Ğ:'G',ı:'i',İ:'I',ö:'o',Ö:'O',ş:'s',Ş:'S',ü:'u',Ü:'U'};

export type GithubAppManifest={
  name:string;url:string;description:string;public:false;
  redirect_url:string;callback_urls:string[];setup_url:string;setup_on_update:boolean;request_oauth_on_install:false;
  hook_attributes:{url:string;active:false};default_permissions:Record<keyof typeof APP_PERMISSIONS,string>;default_events:string[];
};

/** Uygulama adının sonuna eklenen 6 küçük harf: ad GitHub'da benzersiz olmalı. */
export function randomSuffix(bytes:Uint8Array):string {
  if(bytes.length<6)throw new LocalizedError(l=>installMessages(l).githubApp.randomBytes);
  return Array.from(bytes.slice(0,6),byte=>String.fromCharCode(97+byte%26)).join('');
}

function productionOrigin(homepage:string):string {
  let url:URL;
  try{url=new URL(homepage);}catch{throw new LocalizedError(l=>installMessages(l).githubApp.homepageUnreadable);}
  const local=url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname);
  if(url.protocol!=='https:'&&!local)throw new LocalizedError(l=>installMessages(l).githubApp.needHttps);
  return url.origin;
}

export function githubAppManifest({homepage,appName='openPT',suffix,locale=DEFAULT_LOCALE}:{homepage:string;appName?:string;suffix:string;locale?:Locale}):GithubAppManifest {
  if(!SUFFIX.test(suffix))throw new LocalizedError(l=>installMessages(l).githubApp.badSuffix);
  const origin=productionOrigin(homepage);
  // GitHub adı en çok 34 karakter ve benzersiz: "<ad> <6 harf>". Türkçe harfler sadeleşir, kalan işaretler atılır.
  const base=appName.replace(/[çÇğĞıİöÖşŞüÜ]/g,letter=>TURKISH[letter]!).replace(/[^A-Za-z0-9 ._-]/g,'').replace(/\s+/g,' ').trim().slice(0,NAME_LIMIT-suffix.length-1).trim()||'openPT';
  return {
    name:`${base} ${suffix}`,
    url:origin,
    description:installMessages(locale).githubApp.description,
    public:false,
    redirect_url:`${origin}/api/install/github-app`,
    callback_urls:[`${origin}/api/auth/github/callback`],
    setup_url:`${origin}/install`,
    // Kurulum sonradan değişirse (ör. "All repositories" seçildi) GitHub sihirbaza döner, yeniden doğrulanır.
    setup_on_update:true,
    request_oauth_on_install:false,
    hook_attributes:{url:origin,active:false},
    default_permissions:{...APP_PERMISSIONS},
    default_events:[],
  };
}

export function manifestFormAction(state:string):string {
  return `https://github.com/settings/apps/new?${new URLSearchParams({state})}`;
}
export function installUrl(slug:string):string {
  if(!SLUG.test(slug))throw new LocalizedError(l=>installMessages(l).githubApp.badApp);
  return `https://github.com/apps/${slug}/installations/new`;
}
export function installationSettingsUrl(installationId:number|string):string {
  return `https://github.com/settings/installations/${encodeURIComponent(String(installationId))}`;
}

/** Dönüşümden alınan bilgiler. Webhook sırrı alınmaz (webhook kapalı). */
export type AppCredentials={appId:string;slug:string;owner:string;clientId:string;clientSecret:string;privateKey:string};
const conversionSchema=v.object({
  id:v.pipe(v.number(),v.integer(),v.minValue(1)),
  slug:v.pipe(v.string(),v.regex(SLUG)),
  owner:v.object({login:v.pipe(v.string(),v.regex(LOGIN))}),
  client_id:v.pipe(v.string(),v.regex(CREDENTIAL)),
  client_secret:v.pipe(v.string(),v.regex(CREDENTIAL)),
  pem:v.pipe(v.string(),v.check(isPrivateKey)),
});
export function parseConversion(json:unknown):AppCredentials {
  const parsed=v.safeParse(conversionSchema,json);
  if(!parsed.success)throw new LocalizedError(l=>installMessages(l).githubApp.badConversion);
  const data=parsed.output;
  return {appId:String(data.id),slug:data.slug,owner:data.owner.login,clientId:data.client_id,clientSecret:data.client_secret,privateKey:normalizePrivateKey(data.pem)};
}

const storedSchema=v.object({
  appId:v.pipe(v.string(),v.regex(/^[1-9]\d{0,14}$/)),
  slug:v.pipe(v.string(),v.regex(SLUG)),
  owner:v.pipe(v.string(),v.regex(LOGIN)),
  clientId:v.pipe(v.string(),v.regex(CREDENTIAL)),
  clientSecret:v.pipe(v.string(),v.regex(CREDENTIAL)),
  privateKey:v.pipe(v.string(),v.check(isPrivateKey)),
});
/** Sekmenin sessionStorage'ındaki bilgiler (dönüş sayfası yazar); bozuk ya da eksikse null. */
export function readStoredCredentials(text:string|null):AppCredentials|null {
  if(!text)return null;
  try{
    const parsed=v.safeParse(storedSchema,JSON.parse(text));
    return parsed.success?{...parsed.output,privateKey:normalizePrivateKey(parsed.output.privateKey)}:null;
  }catch{return null;}
}

export type InstallationInfo={id:number;account:string;selection:'all'|'selected';permissions:Record<string,string>;suspended:boolean};
const installationSchema=v.object({
  id:v.pipe(v.number(),v.integer(),v.minValue(1)),
  account:v.object({login:v.pipe(v.string(),v.regex(LOGIN))}),
  repository_selection:v.picklist(['all','selected']),
  permissions:v.record(v.string(),v.string()),
  suspended_at:v.optional(v.nullable(v.string())),
});
export function parseInstallation(json:unknown):InstallationInfo {
  const parsed=v.safeParse(installationSchema,json);
  if(!parsed.success)throw new LocalizedError(l=>installMessages(l).githubApp.badInstallation);
  const data=parsed.output;
  return {id:data.id,account:data.account.login,selection:data.repository_selection,permissions:data.permissions,suspended:Boolean(data.suspended_at)};
}

/**
 * Kurulumun sorunları, PT'ye söylenecek sırayla (boşsa sorun yok). "All repositories" şart: danışan
 * repoları sonradan açılır ve seçili repolarla kurulmuş uygulama onları göremez.
 */
export function installationProblems(info:InstallationInfo,owner:string,locale:Locale=DEFAULT_LOCALE):string[] {
  const t=installMessages(locale).githubApp;
  const problems:string[]=[];
  if(info.account.toLowerCase()!==owner.toLowerCase())problems.push(t.wrongAccount(info.account,owner));
  if(info.suspended)problems.push(t.suspended);
  const missing=Object.entries(APP_PERMISSIONS).filter(([name,level])=>!grants(info.permissions[name],level)).map(([name])=>name);
  if(missing.length)problems.push(t.missingPermissions(missing.join(', ')));
  if(info.selection!=='all')problems.push(t.selectedOnly);
  return problems;
}
function grants(granted:string|undefined,needed:'read'|'write'):boolean {
  return granted==='write'||granted==='admin'||(needed==='read'&&granted==='read');
}

/** Güncelleme dosyası hazırlığı (`ensureUpdateWorkflow`) kapsam listesi bekler: uygulamada bu `workflows` yazma iznidir. */
export function workflowScopes(permissions:Record<string,string>):string[] {
  return permissions.workflows==='write'?['workflow']:[];
}

/** Betik içine gömülecek JSON: `</script>`, HTML ve satır ayırıcıları betikten çıkamaz. */
function scriptJson(value:unknown):string {
  return JSON.stringify(value).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
}
const NONCE=/^[A-Za-z0-9+/=_-]{1,128}$/;

/**
 * Dönüşten sonraki küçük sayfa: bilgileri YALNIZ bu sekmenin sessionStorage'ına koyar ve GitHub'ın kurulum
 * sayfasına geçer (`replace`: kodlu adres geçmişte kalmaz). Depolama kapalıysa ne yapılacağını söyler.
 */
export function handoffPage(credentials:AppCredentials,nonce:string,locale:Locale=DEFAULT_LOCALE):string {
  if(!NONCE.test(nonce))throw new LocalizedError(l=>installMessages(l).githubApp.badNonce);
  const t=installMessages(locale).githubApp.handoff;
  const script=`try{sessionStorage.setItem(${scriptJson(INSTALL_STORAGE_KEY)},JSON.stringify(${scriptJson(credentials)}));location.replace(${scriptJson(installUrl(credentials.slug))});}catch(e){document.getElementById('status').hidden=true;document.getElementById('failure').hidden=false;}`;
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta name="robots" content="noindex"><title>${t.title}</title><style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;line-height:1.5;color-scheme:light dark}</style></head><body><p id="status">${t.status}</p><p id="failure" hidden>${t.error}</p><noscript><p>${t.noscript}</p></noscript><script nonce="${nonce}">${script}</script></body></html>`;
}

/** Dönüş sayfasının başlıkları: önbellek yok, referrer yok, yalnız bu sayfanın betiği çalışır. */
export function handoffHeaders(nonce:string):Record<string,string> {
  if(!NONCE.test(nonce))throw new LocalizedError(l=>installMessages(l).githubApp.badNonce);
  return {
    'Content-Type':'text/html; charset=utf-8',
    'Cache-Control':'no-store',
    'Referrer-Policy':'no-referrer',
    'X-Content-Type-Options':'nosniff',
    'Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  };
}
