import {installationProblems,workflowScopes,type InstallationInfo} from './github-app.ts';
import {WorkflowSetupError} from './update-workflow.ts';

/**
 * Sihirbazın GitHub adımının son işi (`/api/install/github-app/verify`): GitHub'dan dönen kurulum doğru
 * hesapta mı (Vercel'in bağlı GitHub hesabı), "All repositories" mı, izinler tam mı. Hesap yazılan değerden
 * değil kurulumdan okunur. Vercel kod repo bağlantısı varsa eksik güncelleme dosyası kurulum anahtarıyla eklenir.
 */
export type InstallationReader={
  installation:(appId:string,privateKey:string,installationId:string)=>Promise<InstallationInfo>;
  installationToken:(appId:string,privateKey:string,installationId:string)=>Promise<string>;
};
export class InstallationAccountError extends Error {}
const LOGIN=/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;
export async function connectGithubApp(app:{appId:string;privateKey:string;installationId:string},expectedOwner:string|undefined,codeRepo:string|undefined,github:InstallationReader,prepare:(token:string,repo:string,branch:string,scopes:string[])=>Promise<void>):Promise<{owner:string;installationId:number}> {
  const info=await github.installation(app.appId,app.privateKey,app.installationId);
  if(!LOGIN.test(info.account))throw new InstallationAccountError('GitHub hesabı doğrulanamadı.');
  const problems=installationProblems(info,expectedOwner??info.account);
  if(problems.length)throw new InstallationAccountError(problems.join(' '));
  if(expectedOwner&&codeRepo){
    const token=await github.installationToken(app.appId,app.privateKey,app.installationId);
    try{await prepare(token,`${expectedOwner}/${codeRepo}`,'main',workflowScopes(info.permissions));}
    catch(error){if(error instanceof WorkflowSetupError)throw new InstallationAccountError(error.message);throw error;}
  }
  return {owner:info.account,installationId:info.id};
}
