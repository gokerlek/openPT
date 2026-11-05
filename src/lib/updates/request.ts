import {LocalizedError} from '../../i18n/errors.ts';
import type {Locale} from '../../i18n/locale.ts';
import {installMessages} from '../../i18n/messages/install/index.ts';
function failure(path:string,status:number):(locale:Locale)=>string {
  const repo=path.match(/^\/repos\/([^/]+\/[^/?]+)/)?.[1]??'GitHub';
  if(status===404){
    if(path.includes('/actions/workflows/'))return l=>installMessages(l).updates.request.workflow404(repo);
    const branch=path.match(/\/git\/ref\/heads\/(.+)$/)?.[1];
    if(branch)return l=>installMessages(l).updates.request.branch404(decodeURIComponent(branch),repo);
    return l=>installMessages(l).updates.request.repo404(repo);
  }
  if(status===401)return l=>installMessages(l).updates.request.unauthorized;
  if(status===403)return l=>installMessages(l).updates.request.forbidden(repo);
  return l=>installMessages(l).updates.request.failed(repo,status);
}

export async function githubRequest<T>(token:string|undefined,path:string,init:RequestInit={},allowMissing=false,fetcher:typeof fetch=fetch):Promise<T|null> {
  const headers=new Headers(init.headers);
  headers.set('Accept','application/vnd.github+json');
  headers.set('X-GitHub-Api-Version','2022-11-28');
  headers.set('Content-Type','application/json');
  if(token)headers.set('Authorization',`Bearer ${token}`);
  else headers.delete('Authorization');
  const response=await fetcher(`https://api.github.com${path}`,{...init,headers,cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(allowMissing && response.status===404)return null;
  if(!response.ok)throw new LocalizedError(failure(path,response.status));
  return response.status===204?null:response.json();
}
