import {NextResponse} from 'next/server';
import * as v from 'valibot';
import {messageOf} from '@/i18n/errors';
import {localeFromRequest} from '@/i18n/locale';
import {installMessages} from '@/i18n/messages/install';
import {langConfig} from '@/i18n/valibot';
import {appJwt} from '@/lib/github/app-jwt';
import {connectGithubApp,InstallationAccountError} from '@/lib/installation/account';
import {installationSettingsUrl} from '@/lib/installation/github-app';
import {githubAppApi,GithubAppError} from '@/lib/installation/github-app-api';
import {environmentStatus} from '@/lib/installation/readiness';
import {ensureUpdateWorkflow} from '@/lib/installation/update-workflow';
import {installationCheckSchema} from '@/lib/installation/wizard';
import {sameOrigin} from '@/lib/updates/core';

export const maxDuration=60;

/**
 * GitHub `setup_url` dönüşünden sonra sihirbaz kurulumu doğrulatır: hesap Vercel'in bağlı GitHub hesabı mı,
 * "All repositories" mı, izinler tam mı; kod repo bağlantısı varsa eksik güncelleme dosyası eklenir. Anahtar
 * yalnız kendi uygulamanın sunucusuna gelir, hiçbir yerde saklanmaz ve yanıta/günlüğe yazılmaz.
 */
export async function POST(request:Request) {
  const locale=localeFromRequest(request);
  const t=installMessages(locale).vercel.api;
  if(!sameOrigin(request))return NextResponse.json({error:t.origin},{status:403});
  if(environmentStatus(process.env)==='ready'||process.env.AXON_SETUP_DEMO==='1')return NextResponse.json({error:t.notUsed},{status:409});
  const body=await request.text();
  if(body.length>12000)return NextResponse.json({error:t.checkGithub},{status:400});
  let json:unknown;try{json=JSON.parse(body);}catch{json=null;}
  const input=v.safeParse(installationCheckSchema,json,langConfig(locale));
  if(!input.success)return NextResponse.json({error:t.restartConnect},{status:400});
  const headers={'Cache-Control':'no-store'};
  try{
    const result=await connectGithubApp(input.output,process.env.VERCEL_GIT_REPO_OWNER,process.env.VERCEL_GIT_REPO_SLUG,githubAppApi(appJwt),ensureUpdateWorkflow);
    return NextResponse.json(result,{headers});
  }catch(error){
    const message=error instanceof InstallationAccountError||error instanceof GithubAppError?messageOf(error,locale):installMessages(locale).githubApp.verifyFailed;
    return NextResponse.json({error:message,ayarlar:installationSettingsUrl(input.output.installationId)},{status:400,headers});
  }
}
