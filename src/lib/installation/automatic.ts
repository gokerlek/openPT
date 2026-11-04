import * as v from 'valibot';
import {installationProblems,workflowScopes,type InstallationInfo} from './github-app.ts';
import {environmentValues,wizardSchema,type WizardValues} from './wizard.ts';
export const automaticSchema=v.strictObject({
  values:wizardSchema,
  vercelToken:v.pipe(v.string(),v.trim(),v.minLength(1),v.maxLength(1000),v.regex(/^[A-Za-z0-9_./+=-]+$/)),
  resumeOnly:v.optional(v.boolean(),false),
});
export type Project={id:string;name:string;link?:{type:string;org?:string;repo?:string;repoId?:number|string;productionBranch?:string}};
export type Environment={key:string;value?:string;target?:string[]};
export type EnvironmentItem={key:string;value:string;target:['production'];type:'plain'|'sensitive';visibility:'config'|'secret'};
export type InstallGateway={
  project:(id:string)=>Promise<Project>;
  env:(id:string)=>Promise<Environment[]>;
  /** GitHub uygulamasının kurulumu (uygulama JWT'siyle): hesap, repo seçimi, izinler. */
  installation:(appId:string,privateKey:string,installationId:string)=>Promise<InstallationInfo>;
  installationToken:(appId:string,privateKey:string,installationId:string)=>Promise<string>;
  ensureWorkflow:(token:string,repo:string,branch:string,scopes:string[])=>Promise<void>;
  create:(id:string,items:EnvironmentItem[])=>Promise<void>;
  deploy:(project:Project)=>Promise<{id:string}>;
};
/** Vercel'de "sensitive" (bir daha okunamaz) saklanan anahtarlar. */
const SENSITIVE=/TOKEN|SECRET|API_KEY|PRIVATE_KEY/;
export class InstallationError extends Error {
  readonly canRetryDeploy:boolean;
  constructor(message:string,canRetryDeploy=false){super(message);this.canRetryDeploy=canRetryDeploy;}
}
export async function automaticInstall(projectId:string,values:WizardValues,resumeOnly:boolean,gateway:InstallGateway) {
  // Project identity is injected by this deployment, never selected by the caller.
  const entries=environmentValues(values);
  const project=await gateway.project(projectId);
  if(project.id!==projectId || project.link?.type!=='github' || project.link.org?.toLowerCase()!==values.owner.trim().toLowerCase() || project.link.repo?.toLowerCase()!==values.codeRepo.trim().toLowerCase())throw new InstallationError('Bu yayın kendi GitHub kod repona bağlı olmalı. Proje ve hesap bilgilerini kontrol et.');
  if(project.link.productionBranch!==values.codeBranch.trim() || !Number.isSafeInteger(Number(project.link.repoId)) || Number(project.link.repoId)<1)throw new InstallationError('Vercel üretim dalı veya GitHub repo bağlantısı eşleşmiyor.');
  const existing=(await gateway.env(project.id)).filter(e=>e.target?.includes('production'));
  if(resumeOnly){
    for(const key of ['GITHUB_OWNER','APP_REPO','AXON_CODE_REPO','AXON_CODE_BRANCH','GITHUB_CLIENT_ID','GITHUB_APP_ID','GITHUB_APP_INSTALLATION_ID']){
      const saved=existing.find(e=>e.key===key);
      if(saved && saved.value?.toLowerCase()!==entries[key]!.toLowerCase())throw new InstallationError('Kaydedilmiş ayarlar bu kurulumla eşleşmiyor. Mevcut değerler değiştirilmedi.');
    }
  }else{
    if(existing.some(e=>Object.keys(entries).includes(e.key)))throw new InstallationError('Bu projede kaydedilmiş kurulum ayarları var. Aynı bilgilerle Kurulumu tamamlamayı tekrar dene; mevcut değerler korunacak.',true);
  }
  // Kurulum her denemede (yeniden denemede de) PT hesabında, "All repositories" ve tam izinlerle mi: değilse hiçbir şey yazılmaz.
  const app={appId:values.appId.trim(),privateKey:values.privateKey,installationId:values.installationId.trim()};
  const installation=await gateway.installation(app.appId,app.privateKey,app.installationId);
  const problems=installationProblems(installation,values.owner.trim());
  if(problems.length)throw new InstallationError(problems.join(' '));
  const token=await gateway.installationToken(app.appId,app.privateKey,app.installationId);
  await gateway.ensureWorkflow(token,`${project.link.org}/${project.link.repo}`,project.link.productionBranch,workflowScopes(installation.permissions));
  const missing=Object.entries(entries).filter(([key])=>!existing.some(saved=>saved.key===key));
  if(missing.length){
    const items:EnvironmentItem[]=missing.map(([key,value])=>({key,value,target:['production'],type:SENSITIVE.test(key)?'sensitive':'plain',visibility:SENSITIVE.test(key)?'secret':'config'}));
    try{await gateway.create(project.id,items);}
    catch{throw new InstallationError('Ayarların aktarımı tamamlanamadı. Aynı bilgilerle tekrar dene; kaydedilmiş değerler korunacak, yalnız eksik olanlar tamamlanacak.',true);}
  }
  let saved:Environment[];
  try{saved=(await gateway.env(project.id)).filter(e=>e.target?.includes('production'));}
  catch{throw new InstallationError('Kaydedilen ayarlar doğrulanamadı. Kurulumu tamamlamayı tekrar dene; mevcut değerler korunacak.',true);}
  if(Object.keys(entries).some(key=>!saved.some(e=>e.key===key)))throw new InstallationError('Bazı ayarlar Vercel’de henüz görülmüyor. Kurulumu tamamlamayı tekrar dene; mevcut değerler korunacak.',true);
  try{return await gateway.deploy(project);}
  catch{throw new InstallationError('Ayarlar kaydedildi fakat yeni yayın başlatılamadı. Yeniden yayınlamayı dene veya kendi Vercel projeninden güncel ayarlarla Production yayını başlat.',true);}
}
