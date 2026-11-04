import type {Environment,EnvironmentItem,InstallGateway,Project} from './automatic.ts';
import {githubAppApi,type AppJwt} from './github-app-api.ts';
import {ensureUpdateWorkflow} from './update-workflow.ts';

class VercelError extends Error {
  readonly status:number;
  constructor(status:number){super(`Vercel işlemi tamamlanamadı (${status}). Tokenın kapsamını ve proje erişimini kontrol et.`);this.status=status;}
}
/** Otomatik kurulumun dış dünyası: PT'nin kendi Vercel projesi (geçici Vercel anahtarıyla) ve GitHub uygulamasının kurulumu (JWT). */
export function vercelGateway(token:string,jwt:AppJwt,fetcher:typeof fetch=fetch):InstallGateway {
  const github=githubAppApi(jwt,fetcher);
  let teamId:string|undefined;
  async function api<T>(path:string,init:RequestInit={},team=teamId):Promise<T> {
    const url=new URL(path,'https://api.vercel.com');
    if(url.origin!=='https://api.vercel.com')throw new Error('Geçersiz Vercel adresi.');
    if(team)url.searchParams.set('teamId',team);
    const response=await fetcher(url,{...init,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new VercelError(response.status);
    if(response.status===204)return undefined as T;
    return response.json() as Promise<T>;
  }
  return {
    async project(id){
      const path=`/v9/projects/${encodeURIComponent(id)}`;
      try{return await api<Project>(path);}catch(error){if(!(error instanceof VercelError) || ![403,404].includes(error.status))throw error;}
      // A token can be scoped to a team; detect the granted team, not another project.
      const teams=await api<{teams:{id:string}[]}>('/v2/teams?limit=20');
      for(const team of teams.teams){try{const project=await api<Project>(path,{},team.id);teamId=team.id;return project;}catch(error){if(!(error instanceof VercelError)||![403,404].includes(error.status))throw error;}}
      throw new Error('Bu Vercel tokenının mevcut projeye erişimi yok. Projenin bulunduğu hesabın/team’in kapsamını seç.');
    },
    async env(id){return (await api<{envs:Environment[]}>(`/v9/projects/${encodeURIComponent(id)}/env`)).envs;},
    installation:(appId,privateKey,installationId)=>github.installation(appId,privateKey,installationId),
    installationToken:(appId,privateKey,installationId)=>github.installationToken(appId,privateKey,installationId),
    async create(id,items:EnvironmentItem[]){
      const result=await api<{failed?:unknown[];error?:unknown}>(`/v10/projects/${encodeURIComponent(id)}/env`,{method:'POST',body:JSON.stringify(items)});
      if(result.failed?.length || result.error)throw new Error('Bazı ayarlar kaydedilemedi; yayın başlatılmadı. Kendi Vercel env ekranını kontrol et. Mevcut sırlar değiştirilmedi.');
    },
    async ensureWorkflow(githubToken,repo,branch,scopes){await ensureUpdateWorkflow(githubToken,repo,branch,scopes,fetcher);},
    async deploy(project){return api<{id:string}>('/v13/deployments',{method:'POST',body:JSON.stringify({name:project.name,project:project.id,target:'production',gitSource:{type:'github',repoId:Number(project.link!.repoId),ref:project.link!.productionBranch}})});},
  };
}
