import 'server-only';
import {serverEnv} from '@/lib/env';
import {DEFAULT_LOCALE,type Locale} from '@/i18n/locale';
import {LocalizedError} from '@/i18n/errors';
import {coachMessages} from '@/i18n/messages/coach';
import {appRepoFiles} from '@/lib/app-repo-files';
import {checkAppRepo} from '@/lib/github/repos';
import {resolveKey,saveKey,type KeyStore} from './credentials';

const PATH='secrets/gemini.json';
function dependencies(locale:Locale=DEFAULT_LOCALE) {
  const t=coachMessages(locale).internal;
  const env=serverEnv();const files=appRepoFiles();
  const store:KeyStore={
    checkPrivate:async()=>{if(!(await checkAppRepo()).exists)throw new LocalizedError(l=>coachMessages(l).internal.keys.appRepo);},
    read:()=>files.readJson(PATH),
    write:async(record,sha)=>{await files.writeJson(PATH,record,{sha,message:t.commits.ptKey});},
  };
  return {store,context:{secret:env.authSecret,owner:env.owner,repo:env.appRepo}};
}
/** Future AI calls must resolve here, so keys added after setup also take effect. */
export async function geminiApiKey():Promise<string|null> {
  const {store,context}=dependencies();return (await resolveKey(store,context,process.env.GEMINI_API_KEY)).key;
}
export async function geminiKeyStatus() {
  const {store,context}=dependencies();return (await resolveKey(store,context,process.env.GEMINI_API_KEY)).status;
}
export async function saveGeminiKey(key:string|null,locale:Locale=DEFAULT_LOCALE) {
  const {store,context}=dependencies(locale);await saveKey(store,context,key);
}
