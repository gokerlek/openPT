import {redirect} from 'next/navigation';
import {headers} from 'next/headers';
import {environmentStatus,githubSetupProblem} from '@/lib/installation/readiness';
import {Publishing} from './publishing';
import {InstallationWizard} from './installation-wizard';
import {installationHomepage} from '@/lib/installation/address';

export const dynamic='force-dynamic';
type Search={stage?:string;installation_id?:string;github?:string};
export default async function InstallPage({searchParams}:{searchParams:Promise<Search>}) {
  if(environmentStatus(process.env)==='ready')redirect('/login');
  const params=await searchParams;
  // GitHub kurulumdan sonra `setup_url`'e `installation_id` ile döner; dönüş ucu hata olursa kısa bir kod bırakır.
  const installationId=typeof params.installation_id==='string'&&/^[1-9]\d{0,14}$/.test(params.installation_id)?params.installation_id:undefined;
  const githubError=typeof params.github==='string'&&/^[a-z]{1,20}$/.test(params.github)?params.github:undefined;
  // Vercel'de GitHub uygulaması ayarı var ama bozuksa (sayı olmayan kimlik, okunamayan anahtar) sebebi söylenir.
  const problem=githubSetupProblem(process.env);
  const incoming=await headers();
  const homepage=installationHomepage(incoming,{VERCEL_ENV:process.env.VERCEL_ENV,VERCEL_PROJECT_PRODUCTION_URL:process.env.VERCEL_PROJECT_PRODUCTION_URL});
  return <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10 sm:px-8 sm:py-16">
    <header className="space-y-3"><p className="text-sm font-medium text-primary">OPENPT · KURULUM</p><h1 className="font-heading text-3xl font-semibold">Kendi panelin, kendi hesabın.</h1><p className="text-muted-foreground">Bu kopya kendi Vercel projen ve özel GitHub repolarınla çalışır. Ayrı bir kurulum servisi veya veritabanı kurman gerekmez.</p></header>
    {problem && <div role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm space-y-1"><p className="font-medium text-destructive">Vercel’deki GitHub ayarı okunamadı</p><p className="text-muted-foreground">{problem} Değeri kendi Vercel projenin Environment Variables ekranında düzeltip yeni Production yayını başlat.</p></div>}
    {params.stage==='publishing'?<Publishing />:<InstallationWizard homepage={homepage} installationId={installationId} githubError={githubError} demo={process.env.AXON_SETUP_DEMO==='1'} automaticAvailable={process.env.VERCEL_ENV==='production' && Boolean(process.env.VERCEL_PROJECT_ID)} initial={{owner:process.env.VERCEL_GIT_REPO_OWNER??'',codeRepo:process.env.VERCEL_GIT_REPO_SLUG??'openpt'}} />}
  </main>;
}
