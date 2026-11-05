import {LocalizedError} from '../../i18n/errors.ts';
import {installMessages} from '../../i18n/messages/install/index.ts';
export async function requireUpdateWorkflow(repo:string,fileExists:()=>Promise<boolean>,loadWorkflow:()=>Promise<{state:string}|null>) {
  if(!(await fileExists()))throw new LocalizedError(l=>installMessages(l).updates.workflowMissing(repo));
  const workflow=await loadWorkflow();
  if(!workflow)throw new LocalizedError(l=>installMessages(l).updates.workflowUnreachable(repo));
  if(workflow.state!=='active')throw new LocalizedError(l=>installMessages(l).updates.workflowDisabled(repo));
}
