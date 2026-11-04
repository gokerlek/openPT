import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {APP_PERMISSIONS,githubAppManifest,handoffHeaders,handoffPage,installationProblems,installationSettingsUrl,installUrl,manifestFormAction,parseConversion,parseInstallation,randomSuffix,workflowScopes,type InstallationInfo} from './github-app.ts';

const {privateKey:pem}=generateKeyPairSync('rsa',{modulusLength:1024,privateKeyEncoding:{type:'pkcs1',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
const conversion={id:123456,slug:'axon-fit-qwerty',node_id:'node',name:'Axon Fit qwerty',owner:{login:'coach',type:'User'},client_id:'Iv23liTestOnly',client_secret:'test-client-secret',webhook_secret:null,pem,html_url:'https://github.com/apps/axon-fit-qwerty'};
const installation:InstallationInfo={id:42,account:'coach',selection:'all',permissions:{...APP_PERMISSIONS},suspended:false};

test('manifest: Production adresine bağlı dönüşler, webhook kapalı, yalnız gereken izinler, özel uygulama',()=>{
  const manifest=githubAppManifest({homepage:'https://coach.example.com/',suffix:'qwerty'});
  assert.equal(manifest.name,'Axon Fit qwerty');
  assert.equal(manifest.url,'https://coach.example.com');
  assert.equal(manifest.redirect_url,'https://coach.example.com/api/install/github-app');
  assert.deepEqual(manifest.callback_urls,['https://coach.example.com/api/auth/github/callback']);
  assert.equal(manifest.setup_url,'https://coach.example.com/install');
  assert.equal(manifest.public,false);
  assert.deepEqual(manifest.hook_attributes,{url:'https://coach.example.com',active:false});
  assert.deepEqual(manifest.default_permissions,{administration:'write',contents:'write',actions:'write',workflows:'write',metadata:'read'});
  assert.deepEqual(manifest.default_events,[]);
  // Kurulumdan sonra GitHub setup_url'e dönsün (OAuth'a değil): sihirbaz kurulumu orada doğrular.
  assert.equal(manifest.request_oauth_on_install,false);
});
test('manifest adı GitHub sınırında (34) kalır, son ek 6 küçük harf; geçersiz adres ve son ek reddedilir',()=>{
  const long=githubAppManifest({homepage:'https://a.vercel.app',appName:'Çok uzun bir antrenör uygulaması adı burada',suffix:'abcdef'});
  assert.ok(long.name.length<=34);assert.match(long.name,/ abcdef$/);
  assert.doesNotMatch(long.name,/[^A-Za-z0-9 ._-]/);
  assert.equal(githubAppManifest({homepage:'http://localhost:3000',suffix:'abcdef'}).url,'http://localhost:3000');
  for(const homepage of ['http://coach.example.com','javascript:alert(1)','not a url'])assert.throws(()=>githubAppManifest({homepage,suffix:'abcdef'}));
  for(const suffix of ['ABCDEF','abc','abcdefg','abc12!'])assert.throws(()=>githubAppManifest({homepage:'https://a.vercel.app',suffix}));
  const suffix=randomSuffix(new Uint8Array([0,25,26,51,255,7]));
  assert.match(suffix,/^[a-z]{6}$/);assert.equal(suffix.slice(0,4),'azaz');
  assert.throws(()=>randomSuffix(new Uint8Array(3)));
});
test('form adresi state’i taşır; kurulum ve ayar adresleri GitHub’a gider',()=>{
  assert.equal(manifestFormAction('a b&c'),'https://github.com/settings/apps/new?state=a+b%26c');
  assert.equal(installUrl('axon-fit-qwerty'),'https://github.com/apps/axon-fit-qwerty/installations/new');
  assert.throws(()=>installUrl('../evil'));
  assert.equal(installationSettingsUrl(42),'https://github.com/settings/installations/42');
});
test('dönüşüm yanıtı: yalnız gereken bilgiler alınır, PEM düzeltilir; eksik/bozuk yanıt reddedilir',()=>{
  const parsed=parseConversion({...conversion,pem:pem.replace(/\n/g,'\r\n')});
  assert.deepEqual(parsed,{appId:'123456',slug:'axon-fit-qwerty',owner:'coach',clientId:'Iv23liTestOnly',clientSecret:'test-client-secret',privateKey:pem});
  assert.equal('webhookSecret' in parsed,false);
  for(const broken of [{...conversion,pem:'x'},{...conversion,id:'1'},{...conversion,slug:'Bad Slug'},{...conversion,owner:{name:'enterprise',slug:'e'}},{...conversion,client_secret:'a b'},null])assert.throws(()=>parseConversion(broken));
});
test('kurulum yanıtı ve sorunları: sahip, askı, izinler, "All repositories"',()=>{
  assert.deepEqual(parseInstallation({id:42,account:{login:'coach'},repository_selection:'selected',permissions:{contents:'write'},suspended_at:null,app_slug:'x'}),{id:42,account:'coach',selection:'selected',permissions:{contents:'write'},suspended:false});
  assert.equal(parseInstallation({id:1,account:{login:'c'},repository_selection:'all',permissions:{},suspended_at:'2026-01-01T00:00:00Z'}).suspended,true);
  assert.throws(()=>parseInstallation({id:1,account:null,repository_selection:'all',permissions:{}}));
  assert.deepEqual(installationProblems(installation,'COACH'),[]);
  assert.match(installationProblems({...installation,account:'someone'},'coach').join(' '),/someone.*PT hesabına.*coach/);
  assert.match(installationProblems({...installation,selection:'selected'},'coach').join(' '),/All repositories/);
  assert.match(installationProblems({...installation,suspended:true},'coach').join(' '),/askıya/);
  const missing=installationProblems({...installation,permissions:{...APP_PERMISSIONS,workflows:'read',administration:'read'}},'coach').join(' ');
  assert.match(missing,/administration/);assert.match(missing,/workflows/);
  // Okuma izni yazmanın yerini tutmaz; yazma okumanın yerini tutar.
  assert.deepEqual(installationProblems({...installation,permissions:{...APP_PERMISSIONS,metadata:'write'}},'coach'),[]);
});
test('güncelleme dosyası için izin köprüsü: workflows yazma = workflow kapsamı',()=>{
  assert.deepEqual(workflowScopes({workflows:'write'}),['workflow']);
  assert.deepEqual(workflowScopes({workflows:'read'}),[]);
  assert.deepEqual(workflowScopes({}),[]);
});
test('dönüş sayfası: bilgiler yalnız bu sekmenin sessionStorage’ına, sonra GitHub kurulum sayfasına; önbellek ve referrer yok',()=>{
  const credentials=parseConversion(conversion);
  const html=handoffPage(credentials,'n0nce');
  assert.match(html,/sessionStorage\.setItem/);
  assert.doesNotMatch(html,/localStorage/);
  assert.match(html,/location\.replace\("https:\/\/github\.com\/apps\/axon-fit-qwerty\/installations\/new"\)/);
  assert.match(html,/<script nonce="n0nce">/);
  assert.match(html,/<meta name="referrer" content="no-referrer">/);
  const headers=handoffHeaders('n0nce');
  assert.equal(headers['Cache-Control'],'no-store');
  assert.equal(headers['Referrer-Policy'],'no-referrer');
  assert.match(headers['Content-Security-Policy']!,/script-src 'nonce-n0nce'/);
  assert.match(headers['Content-Security-Policy']!,/default-src 'none'/);
  assert.throws(()=>handoffPage(credentials,'bad"nonce'));
});
test('dönüş sayfası betiği kaçışlı: bilgideki </script> ya da satır ayırıcı betikten çıkamaz',()=>{
  const html=handoffPage({...parseConversion(conversion),owner:'coach',clientSecret:'</script><script>alert(1)</script> '},'n0nce');
  assert.equal(html.match(/<\/script>/g)?.length,1);
  assert.ok(!html.includes(' '));
});
