import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {githubAppApi,GithubAppError} from './github-app-api.ts';

const {privateKey:pem}=generateKeyPairSync('rsa',{modulusLength:1024,privateKeyEncoding:{type:'pkcs1',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
const jwt=async(appId:string,privateKey:string)=>{assert.equal(appId,'123');assert.equal(privateKey,pem);return 'test-jwt';};
const installation={id:42,account:{login:'coach'},repository_selection:'all',permissions:{contents:'write'},suspended_at:null};

test('manifest dönüşümü kimliksiz POST; yanıttan yalnız gereken bilgiler',async()=>{
  const fake:typeof fetch=async(input,init)=>{
    assert.equal(String(input),'https://api.github.com/app-manifests/abc_123/conversions');
    assert.equal(init?.method,'POST');
    assert.equal(new Headers(init?.headers).has('Authorization'),false);
    return Response.json({id:123,slug:'axon-fit-qwerty',owner:{login:'coach'},client_id:'Iv23li',client_secret:'test-secret',webhook_secret:'hook',pem},{status:201});
  };
  const credentials=await githubAppApi(jwt,fake).convert('abc_123');
  assert.equal(credentials.appId,'123');assert.equal(credentials.privateKey,pem);
});
test('dönüşüm hatası: kod tekrar ya da yol olarak kullanılamaz, yanıt gövdesi ve sırlar mesaja girmez',async()=>{
  let calls=0;
  const api=githubAppApi(jwt,async()=>{calls++;return new Response('test-secret',{status:422});});
  await assert.rejects(api.convert('../app'),GithubAppError);
  assert.equal(calls,0);
  await assert.rejects(api.convert('used-code'),(error:Error)=>/süresi dolmuş/.test(error.message)&&!error.message.includes('test-secret'));
  await assert.rejects(githubAppApi(jwt,async()=>{throw new Error('test-secret');}).convert('code'),(error:Error)=>!error.message.includes('test-secret'));
});
test('kurulum bilgisi ve kullanıcı kurulumu uygulama JWT’siyle; kurulum anahtarı JWT’yle alınır',async()=>{
  const seen:string[]=[];
  const fake:typeof fetch=async(input,init)=>{
    const url=new URL(String(input));seen.push(`${init?.method??'GET'} ${url.pathname}`);
    assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer test-jwt');
    if(url.pathname==='/app/installations/42')return Response.json(installation);
    if(url.pathname==='/users/coach/installation')return Response.json(installation);
    if(url.pathname==='/users/nobody/installation')return new Response(null,{status:404});
    if(url.pathname==='/app/installations/42/access_tokens')return Response.json({token:'ghs_test',expires_at:'2026-11-05T12:00:00Z'},{status:201});
    return new Response(null,{status:500});
  };
  const api=githubAppApi(jwt,fake);
  assert.equal((await api.installation('123',pem,'42')).account,'coach');
  assert.equal((await api.userInstallation('123',pem,'coach'))?.id,42);
  assert.equal(await api.userInstallation('123',pem,'nobody'),null);
  assert.equal(await api.installationToken('123',pem,'42'),'ghs_test');
  assert.deepEqual(seen,['GET /app/installations/42','GET /users/coach/installation','GET /users/nobody/installation','POST /app/installations/42/access_tokens']);
});
test('kurulum hataları Türkçe ve sırsız: yok, kimlik yanlış, geçersiz kimlik/ad',async()=>{
  const api=(status:number)=>githubAppApi(jwt,async()=>new Response('test-secret',{status}));
  await assert.rejects(api(404).installation('123',pem,'42'),/kurulumu bulunamadı/);
  await assert.rejects(api(401).installation('123',pem,'42'),/App ID ya da özel anahtar/);
  await assert.rejects(api(500).installationToken('123',pem,'42'),(error:Error)=>!error.message.includes('test-secret'));
  await assert.rejects(api(200).installation('123',pem,'4/2'),GithubAppError);
  await assert.rejects(api(200).userInstallation('123',pem,'bad/name'),GithubAppError);
  await assert.rejects(githubAppApi(async()=>{throw new Error('pem içeriği');},async()=>Response.json(installation)).installation('123',pem,'42'),(error:Error)=>/özel anahtar/.test(error.message)&&!error.message.includes('pem içeriği'));
});
