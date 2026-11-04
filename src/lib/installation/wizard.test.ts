import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import * as v from 'valibot';
import {authSecret,environmentFile,environmentValues,initialWizardValues,installationCheckSchema,validateStep,WIZARD_STEPS,type WizardValues} from './wizard.ts';
import {environmentStatus} from './readiness.ts';
const {privateKey:pem}=generateKeyPairSync('rsa',{modulusLength:1024,privateKeyEncoding:{type:'pkcs1',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
const input:WizardValues={owner:'coach',codeRepo:'coach-app',appRepo:'coach-data',codeBranch:'main',appId:'123456',installationId:'42',privateKey:pem,clientId:'Iv23liTestOnly',clientSecret:'test-secret',geminiKey:'',authSecret:'a'.repeat(64)};
test('setup derives repo defaults, always uses main and starts without sample credentials',()=>{
  const values=initialWizardValues('coach','renamed-copy');
  assert.equal(values.codeRepo,'renamed-copy');assert.equal(values.codeBranch,'main');
  assert.equal(values.appRepo,'axon-fit-data');assert.equal(values.appId,'');assert.equal(values.privateKey,'');assert.equal(values.clientSecret,'');
  assert.notEqual(initialWizardValues('coach','AXON-FIT-DATA').appRepo.toLowerCase(),'axon-fit-data');
});
test('three steps: one GitHub connection replaces the token and OAuth App steps',()=>{
  assert.deepEqual(WIZARD_STEPS,['GitHub’a bağla','İsteğe bağlı AI','Vercel’e aktar']);
});
test('standalone setup exports GitHub App keys and update repo without PAT or installer keys',()=>{
  const output=environmentFile(input);
  assert.match(output,/^GITHUB_OWNER=coach$/m);
  assert.match(output,/^AXON_CODE_REPO=coach\/coach-app$/m);
  assert.match(output,/^GITHUB_APP_ID=123456$/m);
  assert.match(output,/^GITHUB_APP_INSTALLATION_ID=42$/m);
  assert.match(output,/^GITHUB_CLIENT_ID=Iv23liTestOnly$/m);
  assert.match(output,/^GITHUB_APP_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----\\n.+\\n-----END RSA PRIVATE KEY-----$/m);
  assert.doesNotMatch(output,/GITHUB_TOKEN|VERCEL_TOKEN|BOOTSTRAP|INSTALLER|INTEGRATION|gokerlek|GEMINI_API_KEY/);
  // PEM tek satırda: her satır yorum ya da tek bir ANAHTAR=değer.
  for(const line of output.trimEnd().split('\n'))assert.match(line,/^(#.*|[A-Z_]+=\S.*)$/);
  assert.match(environmentFile({...input,geminiKey:'optional-key'}),/GEMINI_API_KEY=optional-key/);
  assert.equal(environmentValues({...input,privateKey:pem.replace(/\n/g,'\r\n')}).GITHUB_APP_PRIVATE_KEY,environmentValues(input).GITHUB_APP_PRIVATE_KEY);
});
test('wizard validates one step at a time without requiring future credentials',()=>{
  assert.deepEqual(validateStep(0,{...input,authSecret:''}),{});
  for(const key of ['appId','installationId','privateKey','clientId','clientSecret'] as const)assert.ok(validateStep(0,{...input,[key]:''})[key]);
  assert.deepEqual(validateStep(1,{...input,geminiKey:''}),{});
  assert.ok(validateStep(2,{...input,authSecret:''}).authSecret);
  assert.ok(validateStep(0,{...input,appRepo:'coach-app'}).appRepo);
});
test('dotenv injection, non-numeric ids and ambiguous data repos are rejected',()=>{
  for(const clientSecret of ['secret\nOTHER=value','${GITHUB_SECRET}','secret value','secret"'])assert.throws(()=>environmentFile({...input,clientSecret}));
  for(const privateKey of ['x\nOTHER=value','ghp_token'])assert.throws(()=>environmentFile({...input,privateKey}));
  // PEM bloğunun dışındaki her şey atılır: anahtarın arkasına eklenen satır env'e giremez.
  assert.doesNotMatch(environmentFile({...input,privateKey:`${pem}\nOTHER=value`}),/OTHER=value/);
  for(const appId of ['abc','12 3','0','1;2'])assert.throws(()=>environmentFile({...input,appId}));
  for(const installationId of ['abc','-1'])assert.throws(()=>environmentFile({...input,installationId}));
  for(const appRepo of ['COACH-APP','Client-c_test','..','.'])assert.throws(()=>environmentFile({...input,appRepo}));
});
test('installation check input accepts only ids and a PEM',()=>{
  assert.equal(v.safeParse(installationCheckSchema,{appId:'1',installationId:'2',privateKey:pem}).success,true);
  assert.equal(v.safeParse(installationCheckSchema,{appId:'1',installationId:'2',privateKey:pem,extra:'x'}).success,false);
  assert.equal(v.safeParse(installationCheckSchema,{appId:'1',installationId:'2/3',privateKey:pem}).success,false);
});
test('auth secret encodes all 32 crypto-random bytes without truncation',()=>{
  assert.equal(authSecret(new Uint8Array(32).fill(255)),'ff'.repeat(32));
  assert.throws(()=>authSecret(new Uint8Array(16)));
});
test('readiness accepts a GitHub App or a legacy token and cannot be bypassed by old bootstrap credentials',()=>{
  const env={GITHUB_OWNER:'coach',APP_REPO:'data',AUTH_SECRET:'a'.repeat(64),GITHUB_CLIENT_ID:'id',GITHUB_CLIENT_SECRET:'secret'};
  assert.equal(environmentStatus({...env,GITHUB_TOKEN:'token'}),'ready');
  assert.equal(environmentStatus({...env,GITHUB_APP_ID:'1',GITHUB_APP_PRIVATE_KEY:'pem'}),'ready');
  assert.equal(environmentStatus({...env,GITHUB_APP_ID:'1'}),'missing');
  assert.equal(environmentStatus({...env,AXON_BOOTSTRAP:'old'}),'missing');
  assert.equal(environmentStatus({...env,AUTH_SECRET:'short',GITHUB_TOKEN:'token'}),'missing');
  assert.equal(environmentStatus({GITHUB_OWNER:'coach',APP_REPO:'data',AUTH_SECRET:'a'.repeat(64),GITHUB_APP_ID:'1',GITHUB_APP_PRIVATE_KEY:'pem'}),'missing');
});
