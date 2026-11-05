import {LocalizedError,type LocalizedText} from '../../i18n/errors.ts';
import {installMessages} from '../../i18n/messages/install/index.ts';
import template from './axon-update-workflow.json' with {type:'json'};
/** `message`: dile göre metin ya da düz Türkçe metin. */
export class WorkflowSetupError extends LocalizedError {
  constructor(message:string|LocalizedText){super(typeof message==='function'?message:()=>message);}
}

export async function ensureUpdateWorkflow(token:string,repo:string,branch:string,scopes:string[],fetcher:typeof fetch=fetch):Promise<void> {
  const headers={Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'};
  const request=(path:string,init:RequestInit={})=>fetcher(`https://api.github.com${path}`,{...init,headers,cache:'no-store',signal:AbortSignal.timeout(15000)});
  const repository=await request(`/repos/${repo}`);
  if(!repository.ok)throw new WorkflowSetupError(l=>installMessages(l).vercel.workflowRepo(repo,repository.status));
  const metadata=await repository.json() as {full_name?:string};
  if(metadata.full_name?.toLowerCase()!==repo.toLowerCase())throw new WorkflowSetupError(l=>installMessages(l).vercel.workflowMismatch);
  const path=`/repos/${repo}/contents/.github/workflows/axon-update.yml`;
  async function exists() {
    const response=await request(`${path}?ref=${encodeURIComponent(branch)}`);
    if(response.status===404)return false;
    if(!response.ok)throw new WorkflowSetupError(l=>installMessages(l).vercel.workflowCheck(response.status));
    const file=await response.json() as {type?:string};
    if(file.type!=='file')throw new WorkflowSetupError(l=>installMessages(l).vercel.workflowNotFile);
    return true;
  }
  if(await exists())return;
  if(!scopes.includes('workflow'))throw new WorkflowSetupError(l=>installMessages(l).vercel.workflowPermission);
  const created=await request(path,{method:'PUT',body:JSON.stringify({message:'Set up openPT automatic updates',branch,content:Buffer.from(template.content).toString('base64')})});
  // No SHA is sent: GitHub refuses to replace a file created concurrently.
  if([409,422].includes(created.status)&&await exists())return;
  if(!created.ok)throw new WorkflowSetupError(l=>installMessages(l).vercel.workflowCreate(created.status,branch));
}
