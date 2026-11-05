import {messageOf} from '../../i18n/errors.ts';
import {DEFAULT_LOCALE,type Locale} from '../../i18n/locale.ts';
import {installMessages} from '../../i18n/messages/install/index.ts';
export async function checkUpdates<Release,Run>(current:string,releaseCheck:()=>Promise<Release>,statusCheck:()=>Promise<Run>,locale:Locale=DEFAULT_LOCALE) {
  // A private installation's permissions must not hide a public release.
  const release=await releaseCheck();
  try{return {current,release,run:await statusCheck(),automationError:null};}
  catch(error){return {current,release,run:null,automationError:messageOf(error,locale)??installMessages(locale).updates.automationCheckFailed};}
}
