import {randomBytes} from 'node:crypto';
import {cookies} from 'next/headers';
import {NextResponse} from 'next/server';
import {appJwt} from '@/lib/github/app-jwt';
import {installationHomepage} from '@/lib/installation/address';
import {githubAppManifest,handoffHeaders,handoffPage,manifestFormAction,randomSuffix} from '@/lib/installation/github-app';
import {githubAppApi,GithubAppError} from '@/lib/installation/github-app-api';
import {environmentStatus} from '@/lib/installation/readiness';
import {sameOrigin} from '@/lib/updates/core';

/**
 * Sihirbazın "GitHub'a bağla" adımı (tasarım B2), GitHub App manifest akışı:
 * - POST: manifest ve tek kullanımlık `state` (httpOnly çerezde) döner; sihirbaz manifest'i form ile GitHub'a gönderir.
 * - GET: GitHub'ın `redirect_url` dönüşü. `state` doğrulanır, kod bilgilere çevrilir; bilgiler yalnız bu
 *   sekmenin sessionStorage'ına giden küçük bir sayfayla döner (önbellek yok, referrer yok, yalnız kendi
 *   betiği). Sırlar adrese ve günlüğe yazılmaz; hata yalnız kısa bir kodla `/install`'a döner.
 */
const STATE_COOKIE='pc_kurulum_github';
const STATE_PATH='/api/install/github-app';
const NO_STORE={'Cache-Control':'no-store'};

export async function POST(request:Request) {
  if(!sameOrigin(request))return NextResponse.json({error:'İstek kaynağı doğrulanamadı.'},{status:403});
  if(process.env.AXON_SETUP_DEMO==='1')return NextResponse.json({error:'Bu bir simülasyon. GitHub’a istek gönderilmez.'},{status:400});
  if(environmentStatus(process.env)==='ready')return NextResponse.json({error:'Kurulum zaten tamamlanmış.'},{status:409});
  const homepage=installationHomepage(request.headers,{VERCEL_ENV:process.env.VERCEL_ENV,VERCEL_PROJECT_PRODUCTION_URL:process.env.VERCEL_PROJECT_PRODUCTION_URL});
  let manifest;
  try{manifest=githubAppManifest({homepage,suffix:randomSuffix(randomBytes(6))});}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Uygulamanın adresi okunamadı.'},{status:400,headers:NO_STORE});}
  const state=randomBytes(32).toString('base64url');
  // GitHub dönüşü üst düzey bir GET: `lax` çerez gider. Akışın üç adımı GitHub'da en çok bir saat.
  (await cookies()).set(STATE_COOKIE,state,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:STATE_PATH,maxAge:3600});
  return NextResponse.json({action:manifestFormAction(state),manifest:JSON.stringify(manifest)},{headers:NO_STORE});
}

export async function GET(request:Request) {
  const back=(reason:string)=>NextResponse.redirect(new URL(`/install?github=${reason}`,request.url),{status:303,headers:{...NO_STORE,'Referrer-Policy':'no-referrer'}});
  if(environmentStatus(process.env)==='ready')return NextResponse.redirect(new URL('/login',request.url),{status:303,headers:NO_STORE});
  if(process.env.AXON_SETUP_DEMO==='1')return back('simulasyon');
  const url=new URL(request.url);
  const store=await cookies();
  const expected=store.get(STATE_COOKIE)?.value;
  store.delete({name:STATE_COOKIE,path:STATE_PATH});
  const state=url.searchParams.get('state');
  if(!expected||!state||expected!==state)return back('oturum');
  const code=url.searchParams.get('code');
  if(!code)return back('kod');
  try{
    const credentials=await githubAppApi(appJwt).convert(code);
    const nonce=randomBytes(16).toString('base64url');
    return new Response(handoffPage(credentials,nonce),{headers:handoffHeaders(nonce)});
  }catch(error){
    return back(error instanceof GithubAppError&&error.status===410?'sure':'donusum');
  }
}
