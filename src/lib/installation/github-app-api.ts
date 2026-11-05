import {LocalizedError,type LocalizedText} from '../../i18n/errors.ts';
import {installMessages} from '../../i18n/messages/install/index.ts';
import {parseConversion,parseInstallation,type AppCredentials,type InstallationInfo} from './github-app.ts';

/**
 * GitHub uygulamasının kurulum ve çalışma zamanında gereken uçları — `fetch` dışarıdan verilir (testler
 * sahtesini verir), JWT imzalayıcı da (`app-jwt.ts`, sunucuda `@octokit/auth-app`). Hata mesajları Türkçe;
 * yanıt gövdesi, kod, anahtar ya da JWT hiçbir mesaja girmez.
 *
 * - `POST /app-manifests/{code}/conversions`: kimlik gerekmez (kod tek kullanımlık, bir saat geçerli).
 * - `GET /app/installations/{id}`, `GET /users/{username}/installation`, `POST …/access_tokens`: uygulama JWT'siyle.
 */

export type AppJwt=(appId:string,privateKey:string)=>Promise<string>;
export class GithubAppError extends LocalizedError {
  readonly status:number;
  constructor(text:string|LocalizedText,status:number){super(typeof text==='function'?text:()=>text);this.status=status;}
}

const ID=/^[1-9]\d{0,14}$/;
const LOGIN=/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;
const CODE=/^[\w-]{1,200}$/;

export function githubAppApi(jwt:AppJwt,fetcher:typeof fetch=fetch) {
  async function request(path:string,init:RequestInit={},bearer?:string):Promise<Response> {
    const headers=new Headers({Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'});
    if(bearer)headers.set('Authorization',`Bearer ${bearer}`);
    try{return await fetcher(`https://api.github.com${path}`,{...init,headers,cache:'no-store',signal:AbortSignal.timeout(15000)});}
    catch{throw new GithubAppError(l=>installMessages(l).githubApp.api.unreachable,502);}
  }
  async function signed(appId:string,privateKey:string):Promise<string> {
    // JWT yerelde imzalanır; anahtar okunamazsa sebebi (anahtar parçası taşıyabilir) mesaja girmez.
    try{return await jwt(appId,privateKey);}
    catch{throw new GithubAppError(l=>installMessages(l).githubApp.api.keyUnreadable,400);}
  }
  async function json<T>(response:Response,parse:(value:unknown)=>T):Promise<T> {
    try{return parse(await response.json());}
    catch{throw new GithubAppError(l=>installMessages(l).githubApp.api.unexpected,502);}
  }
  function failure(status:number):GithubAppError {
    if(status===401)return new GithubAppError(l=>installMessages(l).githubApp.api.unauthorized,401);
    if(status===404)return new GithubAppError(l=>installMessages(l).githubApp.api.notInstalled,404);
    if(status===403||status===429)return new GithubAppError(l=>installMessages(l).githubApp.api.refused(status),status);
    return new GithubAppError(l=>installMessages(l).githubApp.api.failed(status),502);
  }
  function id(value:string|number):string {
    const text=String(value);
    if(!ID.test(text))throw new GithubAppError(l=>installMessages(l).githubApp.api.badInstallationId,400);
    return text;
  }
  return {
    /** Manifest akışının kodunu uygulama bilgilerine çevirir. */
    async convert(code:string):Promise<AppCredentials> {
      if(!CODE.test(code))throw new GithubAppError(l=>installMessages(l).githubApp.api.badCode,400);
      const response=await request(`/app-manifests/${code}/conversions`,{method:'POST'});
      if(response.status===404||response.status===422)throw new GithubAppError(l=>installMessages(l).githubApp.api.codeExpired,410);
      if(!response.ok)throw failure(response.status);
      return json(response,parseConversion);
    },
    async installation(appId:string,privateKey:string,installationId:string|number):Promise<InstallationInfo> {
      const path=`/app/installations/${id(installationId)}`;
      const response=await request(path,{},await signed(appId,privateKey));
      if(!response.ok)throw failure(response.status);
      return json(response,parseInstallation);
    },
    /** Kullanıcı hesabındaki kurulum; uygulama o hesaba kurulu değilse null. */
    async userInstallation(appId:string,privateKey:string,username:string):Promise<InstallationInfo|null> {
      if(!LOGIN.test(username))throw new GithubAppError(l=>installMessages(l).githubApp.api.badUsername,400);
      const response=await request(`/users/${username}/installation`,{},await signed(appId,privateKey));
      if(response.status===404)return null;
      if(!response.ok)throw failure(response.status);
      return json(response,parseInstallation);
    },
    /** Kurulum anahtarı (bir saat geçerli). Yalnız kurulumun repolarına, kurulumun izinleriyle erişir. */
    async installationToken(appId:string,privateKey:string,installationId:string|number):Promise<string> {
      const path=`/app/installations/${id(installationId)}/access_tokens`;
      const response=await request(path,{method:'POST'},await signed(appId,privateKey));
      if(!response.ok)throw failure(response.status);
      return json(response,value=>{
        const token=(value as {token?:unknown}|null)?.token;
        if(typeof token!=='string'||!token)throw new Error('no token');
        return token;
      });
    },
  };
}
export type GithubAppApi=ReturnType<typeof githubAppApi>;
