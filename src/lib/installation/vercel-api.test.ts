import {test} from 'node:test';
import assert from 'node:assert/strict';
import {vercelGateway} from './vercel-api.ts';
test('standalone adapter scopes to authorized team, classifies secrets and creates fresh Git deployment',async()=>{
  const calls:{url:URL;init:RequestInit|undefined}[]=[];
  const fake:typeof fetch=async(input,init)=>{
    const url=new URL(String(input));calls.push({url,init});
    const authorization=new Headers(init?.headers).get('Authorization');
    if(url.hostname==='api.github.com'){
      assert.equal(authorization,'Bearer app-jwt');
      if(url.pathname==='/app/installations/42/access_tokens')return Response.json({token:'ghs_test'},{status:201});
      return Response.json({id:42,account:{login:'coach'},repository_selection:'all',permissions:{contents:'write'}});
    }
    assert.equal(authorization,'Bearer temporary-vercel');
    if(url.pathname==='/v2/teams')return Response.json({teams:[{id:'team-own'}]});
    if(url.pathname==='/v9/projects/current')return url.searchParams.get('teamId')==='team-own'?Response.json({id:'current',name:'app',link:{type:'github',org:'coach',repo:'app',repoId:'123',productionBranch:'main'}}):Response.json({error:'temporary-vercel'},{status:404});
    if(init?.method==='POST')return Response.json({id:'new-deployment'});
    return Response.json({envs:[]});
  };
  const gateway=vercelGateway('temporary-vercel',async()=>'app-jwt',fake);
  const project=await gateway.project('current');
  await gateway.env('current');
  assert.equal((await gateway.installation('1','pem','42')).account,'coach');
  assert.equal(await gateway.installationToken('1','pem','42'),'ghs_test');
  await gateway.create('current',[{key:'GITHUB_APP_PRIVATE_KEY',value:'secret-key',type:'sensitive',visibility:'secret',target:['production']}]);
  await gateway.deploy(project);
  const writes=calls.filter(call=>call.init?.method==='POST'&&call.url.hostname==='api.vercel.com');
  assert.equal(writes[0]?.url.searchParams.get('teamId'),'team-own');
  assert.equal(writes[0]?.url.searchParams.has('upsert'),false);
  assert.ok(!String(writes[0]?.init?.body).includes('temporary-vercel'));
  const deployment=JSON.parse(String(writes[1]?.init?.body));
  assert.equal(deployment.project,'current');assert.equal(deployment.gitSource.repoId,123);
  assert.equal('deploymentId' in deployment,false);
});
test('provider rejection does not echo token or response body',async()=>{
  const fake:typeof fetch=async()=>Response.json({error:'temporary-vercel'},{status:401});
  await assert.rejects(vercelGateway('temporary-vercel',async()=>'jwt',fake).project('current'),error=>error instanceof Error && !error.message.includes('temporary-vercel'));
});
