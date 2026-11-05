import * as v from 'valibot';
import { DEFAULT_LOCALE, type Locale } from '../../i18n/locale.ts';
import { measurementsMessages } from '../../i18n/messages/measurements/index.ts';
import { langConfig } from '../../i18n/valibot.ts';
import {postGuard,type RouteResult} from '../client-auth-routes.ts';
import {clientIdSchema,type Client} from '../schemas/client.ts';
import {cameraMeasurementSchema,type CameraMeasurement} from '../schemas/camera-measurement.ts';
export type CameraRouteDeps={session:()=>Promise<{role:'pt'|'client';clientId?:string}|null>;loadClient:(id:string)=>Promise<Client|null>;allowed:(client:Client)=>boolean;save:(id:string,entry:CameraMeasurement)=>Promise<void>;now:()=>Date;/** Yanıtların dili; yoksa Türkçe. */locale?:Locale};
const text=(deps:{locale?:Locale})=>measurementsMessages(deps.locale??DEFAULT_LOCALE).camera.route;
export async function saveCameraRoute(deps:CameraRouteDeps,headers:Headers,origin:string,id:string,input:unknown):Promise<RouteResult>{
 const blocked=postGuard(headers,origin,deps.locale);if(blocked)return blocked;
 const t=text(deps);
 const session=await deps.session();
 if(!session || (session.role==='client' && session.clientId!==id))return{status:403,body:{error:t.saveForbidden}};
 if(!v.is(clientIdSchema,id))return{status:404,body:{error:t.clientNotFound}};
 const client=await deps.loadClient(id);if(!client)return{status:404,body:{error:t.clientNotFound}};
 if(!deps.allowed(client))return{status:403,body:{error:t.saveLocked}};
 const parsed=v.safeParse(cameraMeasurementSchema,input,langConfig(deps.locale??DEFAULT_LOCALE));
 if(!parsed.success || parsed.output.deletedAt!==undefined)return{status:400,body:{error:t.invalidSummary}};
 const time=Date.parse(parsed.output.capturedAt),now=deps.now().getTime();
 if(time>now+600000 || time<now-86400000)return{status:400,body:{error:t.invalidTime}};
 await deps.save(id,parsed.output);
 return{status:201,body:{ok:true,id:parsed.output.id}};
}

export type CameraTrashDeps=Omit<CameraRouteDeps,'save'> & {trash:(clientId:string,recordId:string,deleted:boolean,at:string)=>Promise<void>};
const trashSchema=v.strictObject({id:v.pipe(v.string(),v.uuid()),action:v.picklist(['trash','restore'])});
export async function trashCameraRoute(deps:CameraTrashDeps,headers:Headers,origin:string,id:string,input:unknown):Promise<RouteResult>{
 const blocked=postGuard(headers,origin,deps.locale);if(blocked)return blocked;
 const t=text(deps);
 const session=await deps.session();
 if(!session || (session.role==='client' && session.clientId!==id))return {status:403,body:{error:t.changeForbidden}};
 if(!v.is(clientIdSchema,id))return {status:404,body:{error:t.clientNotFound}};
 const client=await deps.loadClient(id);
 if(!client)return {status:404,body:{error:t.clientNotFound}};
 if(!deps.allowed(client))return {status:403,body:{error:t.locked}};
 const parsed=v.safeParse(trashSchema,input);
 if(!parsed.success)return {status:400,body:{error:t.invalidAction}};
 await deps.trash(id,parsed.output.id,parsed.output.action==='trash',deps.now().toISOString());
 return {status:200,body:{ok:true}};
}
