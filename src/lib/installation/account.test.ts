import {test} from 'node:test';
import assert from 'node:assert/strict';
import {connectGithubApp,InstallationAccountError,type InstallationReader} from './account.ts';
import {APP_PERMISSIONS,type InstallationInfo} from './github-app.ts';
import {WorkflowSetupError} from './update-workflow.ts';
const app={appId:'123',privateKey:'pem',installationId:'42'};
const installation:InstallationInfo={id:42,account:'coach',selection:'all',permissions:{...APP_PERMISSIONS},suspended:false};
function reader(info:Partial<InstallationInfo>={}):InstallationReader&{calls:string[]} {
  const calls:string[]=[];
  return {calls,
    async installation(appId,privateKey,installationId){assert.deepEqual({appId,privateKey,installationId},app);calls.push('installation');return {...installation,...info};},
    async installationToken(){calls.push('token');return 'ghs_test';},
  };
}
test('setup identifies the account from the GitHub installation instead of trusting typed owner',async()=>{
  assert.deepEqual(await connectGithubApp(app,'COACH',undefined,reader(),async()=>{throw new Error('yazmamalı');}),{owner:'coach',installationId:42});
  assert.deepEqual(await connectGithubApp(app,undefined,undefined,reader(),async()=>{throw new Error('yazmamalı');}),{owner:'coach',installationId:42});
});
test('another account, selected repositories, missing permissions or suspension are rejected before any write',async()=>{
  for(const info of [{account:'someone-else'},{selection:'selected' as const},{permissions:{contents:'write'}},{suspended:true},{account:'bad/owner'}]){
    const github=reader(info);
    await assert.rejects(connectGithubApp(app,'coach','app',github,async()=>{throw new Error('yazmamalı');}),InstallationAccountError);
    assert.ok(!github.calls.includes('token'));
  }
});
test('the bound code repo gets the update workflow with the installation token; local setup never writes',async()=>{
  const calls:string[]=[];
  const prepare=async(token:string,repo:string,branch:string,scopes:string[])=>{calls.push(`${token}:${repo}:${branch}:${scopes.join(',')}`);};
  await connectGithubApp(app,'coach','app',reader(),prepare);
  await connectGithubApp(app,undefined,undefined,reader(),prepare);
  await connectGithubApp(app,'coach',undefined,reader(),prepare);
  assert.deepEqual(calls,['ghs_test:coach/app:main:workflow']);
});
test('workflow setup failure becomes a Turkish installation error; other failures pass through',async()=>{
  await assert.rejects(connectGithubApp(app,'coach','app',reader(),async()=>{throw new WorkflowSetupError('Güncelleme dosyası oluşturulamadı (403).');}),error=>error instanceof InstallationAccountError&&/Güncelleme dosyası/.test(error.message));
  await assert.rejects(connectGithubApp(app,'coach','app',reader(),async()=>{throw new Error('ağ');}),error=>!(error instanceof InstallationAccountError));
});
