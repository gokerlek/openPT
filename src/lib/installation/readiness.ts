/**
 * Kurulum tamam mı (sihirbaz, `proxy.ts` ve ayar okuması buna bakar). Yalnız varlık denetimi; değerlerin
 * doğruluğu çalışırken (`env.ts`) denetlenir. GitHub erişimi iki yoldan biri: GitHub uygulaması
 * (`GITHUB_APP_ID` + `GITHUB_APP_PRIVATE_KEY`) ya da kişisel anahtar (`GITHUB_TOKEN`, eski kurulumlar).
 */
export function environmentStatus(env: Record<string,string|undefined>): 'missing'|'ready' {
  const base=['GITHUB_OWNER','APP_REPO','AUTH_SECRET'];
  const oauth=Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);
  if(base.some(k=>!env[k]) || new TextEncoder().encode(env.AUTH_SECRET ?? '').length<32 || (!oauth && !env.RESEND_API_KEY))return 'missing';
  const app=Boolean(env.GITHUB_APP_ID && env.GITHUB_APP_PRIVATE_KEY);
  if(!app && !env.GITHUB_TOKEN)return 'missing';
  return 'ready';
}
