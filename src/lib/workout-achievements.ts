import type {SessionDoc,SessionIndexRow,SessionSet} from './schemas/session.ts';
import {bestOf,mergeBest,recordHits,recordKey,type ExerciseBest,type RecordHit} from './session-records.ts';
import {getFormat} from './format.ts';
import { DEFAULT_LOCALE, type Locale } from '../i18n/locale.ts';
import { clientWorkoutMessages } from '../i18n/messages/client-workout/index.ts';
type Selection={exerciseId:string;deviceId?:string|undefined};
type Totals={sets:number;reps:number;volume:number};
export type AchievementBaseline={best:ExerciseBest;last:Totals|null};
const matches=(item:Selection,select:Selection)=>recordKey(item)===recordKey(select);
function setsOf(doc:Pick<SessionDoc,'entries'>,select:Selection):SessionSet[]{return doc.entries.filter(entry=>matches(entry,select)).flatMap(entry=>entry.sets).filter(set=>set.type==='working' && (set.reps??set.seconds??0)>0);}
function totals(sets:SessionSet[]):Totals{return {sets:sets.length,reps:sets.reduce((n,s)=>n+(s.reps??0),0),volume:sets.reduce((n,s)=>n+(s.kg??0)*(s.reps??0),0)};}
/** All finished-history bests; last comparable exposure supplies factual volume/set differences. */
export function achievementBaseline(rows:readonly SessionIndexRow[],history:readonly SessionDoc[],select:Selection):AchievementBaseline{
 let best:ExerciseBest={};
 for(const row of rows.filter(row=>row.finishedAt))for(const exercise of row.exercises)if(matches(exercise,select))best=mergeBest(best,exercise.best);
 const last=history.filter(doc=>doc.status==='finished').sort((a,b)=>b.startedAt.localeCompare(a.startedAt)).map(doc=>setsOf(doc,select)).find(sets=>sets.length>0);
 return {best,last:last?totals(last):null};
}
export type AchievementNotice={key:string;kind:'record'|'progress';title:string;description:string};
function recordDescription(hit:RecordHit,locale:Locale):string{
 const t=clientWorkoutMessages(locale).achievements,n=getFormat(locale).number;
 if(hit.kind==='seconds')return t.seconds(n(hit.now),n(hit.before));
 if(hit.kind==='e1rm')return t.e1rm(n(hit.now.kg),hit.now.reps);
 if(hit.kind==='heaviest')return t.heaviest(n(hit.now.kg),hit.now.reps,n(hit.before.kg));
 return t.reps(hit.now.kg?n(hit.now.kg):null,hit.now.reps,hit.before.reps);
}
/** Called on an intentional newly logged set, never on render, replay or background synchronization. */
export function achievementNotice(before:SessionDoc,after:SessionDoc,select:Selection,baseline:AchievementBaseline|undefined,seen:readonly string[]=[],locale:Locale=DEFAULT_LOCALE):AchievementNotice|null{
 const t=clientWorkoutMessages(locale).achievements,n=getFormat(locale).number;
 if(!baseline)return null;
 const oldSets=setsOf(before,select),newSets=setsOf(after,select);
 if(newSets.length<=oldSets.length)return null;
 const key=recordKey(select);
 const hit=recordHits(mergeBest(baseline.best,bestOf(oldSets)),bestOf(newSets)).find(hit=>!seen.includes(`${key}:record:${hit.kind}`));
 if(hit)return {key:`${key}:record:${hit.kind}`,kind:'record',title:t.recordTitle,description:recordDescription(hit,locale)};
 if(!baseline.last || seen.includes(`${key}:progress`))return null;
 const old=totals(oldSets),now=totals(newSets),last=baseline.last;
 const changes:string[]=[];
 if(last.volume>0 && old.volume<=last.volume && now.volume>last.volume+0.01)changes.push(t.volume(n(now.volume),n(last.volume)));
 if(last.sets>0 && old.sets<=last.sets && now.sets>last.sets)changes.push(t.sets(now.sets,last.sets));
 if(last.reps>0 && old.reps<=last.reps && now.reps>last.reps)changes.push(t.totalReps(now.reps,last.reps));
 return changes.length?{key:`${key}:progress`,kind:'progress',title:t.progressTitle,description:t.progressEnd(changes.join(' · '))}:null;
}
