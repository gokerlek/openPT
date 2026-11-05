import {messageOf} from '../../i18n/errors.ts';
import {DEFAULT_LOCALE,type Locale} from '../../i18n/locale.ts';
import {githubAccessMessages} from '../../i18n/messages/github-access/index.ts';
import {githubAccessFrom} from '../github/access.ts';

/**
 * Kurulum tamam mı (sihirbaz, `proxy.ts` ve ayar okuması buna bakar). GitHub erişimi iki yoldan biri:
 * GitHub uygulaması (`GITHUB_APP_ID` + `GITHUB_APP_PRIVATE_KEY`) ya da kişisel anahtar (`GITHUB_TOKEN`, eski
 * kurulumlar). Seçim ve denetim çalışma zamanıyla aynı (`githubAccessFrom`): sayı olmayan uygulama kimliği,
 * okunamayan PEM ya da yarım uygulama ayarı "hazır" sayılmaz; sihirbaz açık kalır ve sebebi söyler.
 */
export function environmentStatus(env: Record<string,string|undefined>): 'missing'|'ready' {
  const base=['GITHUB_OWNER','APP_REPO','AUTH_SECRET'];
  const oauth=Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);
  if(base.some(k=>!env[k]) || new TextEncoder().encode(env.AUTH_SECRET ?? '').length<32 || (!oauth && !env.RESEND_API_KEY))return 'missing';
  try{githubAccessFrom(env);}catch{return 'missing';}
  return 'ready';
}

/**
 * GitHub uygulaması ayarı var ama bozuksa sihirbazda gösterilecek sebep (`locale` dilinde; anahtarın kendisini
 * tekrarlamaz). Hiç uygulama ayarı yoksa (ilk kurulum, eski kurulum) ya da ayar sağlamsa null.
 */
export function githubSetupProblem(env: Record<string,string|undefined>, locale: Locale = DEFAULT_LOCALE): string|null {
  if(!env.GITHUB_APP_ID?.trim() && !env.GITHUB_APP_PRIVATE_KEY?.trim() && !env.GITHUB_APP_INSTALLATION_ID?.trim())return null;
  try{githubAccessFrom(env);return null;}
  catch(error){return messageOf(error,locale)??githubAccessMessages(locale).setupUnreadable;}
}
