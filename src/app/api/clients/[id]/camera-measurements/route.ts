import{NextResponse}from'next/server';
import{localeFromRequest}from'@/i18n/locale';
import{measurementsMessages}from'@/i18n/messages/measurements';
import{readAnySession}from'@/lib/session';
import{readClient}from'@/lib/clients';
import{canRecordHealth}from'@/lib/client-status';
import{healthError,updateHealth}from'@/lib/health';
import{withCameraMeasurement,withCameraTrash}from'@/lib/schemas/camera-measurement';
import{saveCameraRoute,trashCameraRoute}from'@/lib/pose/camera-route';
import{origin}from'@/lib/urls';
import{failed}from'@/lib/health-respond';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const locale=localeFromRequest(request);const t=measurementsMessages(locale).camera.route;
 try{
 const result=await saveCameraRoute({locale,session:readAnySession,loadClient:async id=>(await readClient(id))?.client??null,allowed:client=>canRecordHealth(client,'screening'),now:()=>new Date(),save:async(id,entry)=>{
  await updateHealth(id,'screening',record=>{
   try{return withCameraMeasurement(record,entry);}catch(error){
    if(error instanceof Error && error.message==='CAMERA_ID_CONFLICT')throw healthError(l=>measurementsMessages(l).camera.route.idConflict,409);
    if(error instanceof Error && error.message==='CAMERA_LIMIT')throw healthError(l=>measurementsMessages(l).camera.route.limit,409);
    throw error;
   }
  },'Kamera ölçümü kaydedildi');
 }},request.headers,origin(request),(await params).id,await request.json().catch(()=>null));
 return NextResponse.json(result.body,{status:result.status,headers:{'Cache-Control':'no-store'}});
 }catch(error){return failed(error,t.saveFailed,locale);}
}

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
 const locale=localeFromRequest(request);const t=measurementsMessages(locale).camera.route;
 try{
  const result=await trashCameraRoute({locale,session:readAnySession,loadClient:async id=>(await readClient(id))?.client??null,allowed:client=>canRecordHealth(client,'screening'),now:()=>new Date(),trash:async(clientId,id,deleted,at)=>{
   await updateHealth(clientId,'screening',record=>{
    try{return withCameraTrash(record,id,deleted,at);}catch(error){
     if(error instanceof Error && error.message==='CAMERA_NOT_FOUND')throw healthError(l=>measurementsMessages(l).camera.route.recordNotFound,404);
     throw error;
    }
   },deleted?'Kamera ölçümü çöp kutusuna taşındı':'Kamera ölçümü geri yüklendi');
  }},request.headers,origin(request),(await params).id,await request.json().catch(()=>null));
  return NextResponse.json(result.body,{status:result.status,headers:{'Cache-Control':'no-store'}});
 }catch(error){return failed(error,t.changeFailed,locale);}
}
