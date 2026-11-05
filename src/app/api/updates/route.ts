import {NextResponse} from 'next/server';
import * as v from 'valibot';
import {messageOf} from '@/i18n/errors';
import {localeFromRequest} from '@/i18n/locale';
import {installMessages} from '@/i18n/messages/install';
import {langConfig} from '@/i18n/valibot';
import {readPtSession} from '@/lib/session';
import {sameOrigin} from '@/lib/updates/core';
import {availableRelease,currentVersion,startUpdate,updateStatus,applyUpdate} from '@/lib/updates/github';
import {checkUpdates} from '@/lib/updates/check';

export const dynamic='force-dynamic';
export async function GET(request:Request) {
  const locale=localeFromRequest(request);
  const t=installMessages(locale).updates;
  if(!(await readPtSession()))return NextResponse.json({error:t.forbidden},{status:403});
  try {return NextResponse.json(await checkUpdates(currentVersion,availableRelease,updateStatus,locale),{headers:{'Cache-Control':'no-store'}});}
  catch(error){return NextResponse.json({error:messageOf(error,locale)??t.checkFailed},{status:502});}
}
const schema=v.variant('action',[
  v.object({action:v.literal('start'),tag:v.string(),overwriteAccepted:v.literal(true)}),
  v.object({action:v.literal('apply'),runId:v.pipe(v.number(),v.integer(),v.minValue(1)),overwriteAccepted:v.literal(true)}),
]);
export async function POST(request:Request) {
  const locale=localeFromRequest(request);
  const t=installMessages(locale).updates;
  if(!sameOrigin(request) || !(await readPtSession()))return NextResponse.json({error:t.forbidden},{status:403});
  const input=v.safeParse(schema,await request.json().catch(()=>null),langConfig(locale));
  if(!input.success)return NextResponse.json({error:t.confirmOverwrite},{status:400});
  try {if(input.output.action==='apply'){await applyUpdate(input.output.runId);return NextResponse.json({ok:true});}return NextResponse.json(await startUpdate(input.output.tag));}
  catch(error){return NextResponse.json({error:messageOf(error,locale)??t.startFailed},{status:502});}
}
