import {NextResponse} from 'next/server';
import * as v from 'valibot';
import {messageOf} from '@/i18n/errors';
import {localeFromRequest} from '@/i18n/locale';
import {installMessages} from '@/i18n/messages/install';
import {langConfig} from '@/i18n/valibot';
import {automaticInstall,automaticSchema,InstallationError} from '@/lib/installation/automatic';
import {vercelGateway} from '@/lib/installation/vercel';
import {environmentStatus} from '@/lib/installation/readiness';
import {sameOrigin} from '@/lib/updates/core';

export const maxDuration=60;
export async function POST(request:Request) {
  const locale=localeFromRequest(request);
  const t=installMessages(locale).vercel.api;
  if(!sameOrigin(request))return NextResponse.json({error:t.origin},{status:403});
  if(process.env.AXON_SETUP_DEMO==='1')return NextResponse.json({error:t.demoConfigure},{status:400});
  if(environmentStatus(process.env)==='ready')return NextResponse.json({error:t.alreadyDone},{status:409});
  const projectId=process.env.VERCEL_PROJECT_ID;
  if(process.env.VERCEL_ENV!=='production' || !projectId)return NextResponse.json({error:t.productionOnly},{status:400});
  const contentLength=Number(request.headers.get('content-length')??0);
  if(contentLength>16000)return NextResponse.json({error:t.tooLarge},{status:413});
  const input=v.safeParse(automaticSchema,await request.json().catch(()=>null),langConfig(locale));
  if(!input.success)return NextResponse.json({error:t.checkAccount},{status:400});
  try{
    const deployed=await automaticInstall(projectId,input.output.values,input.output.resumeOnly,vercelGateway(input.output.vercelToken));
    return NextResponse.json({status:'publishing',deploymentId:deployed.id},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return NextResponse.json({error:messageOf(error,locale)??t.setupFailed,canRetryDeploy:error instanceof InstallationError && error.canRetryDeploy},{status:502,headers:{'Cache-Control':'no-store'}});}
}
