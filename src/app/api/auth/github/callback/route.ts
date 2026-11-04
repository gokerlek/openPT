import { NextResponse } from 'next/server';
import { consumeReturnPath, consumeState, exchangeCodeForUser, githubLoginEnabled, isOwner } from '@/lib/github-oauth';
import { githubMode } from '@/lib/github/client';
import { saveUserToken } from '@/lib/github/user-auth';
import { RETURN_PARAM } from '@/lib/navigation';
import { createSession } from '@/lib/session';
import { callbackUrl } from '@/lib/urls';

/**
 * GitHub dönüşü. Sırayla: eklenti açık mı → `state` doğru mu → kod anahtara çevrilebildi mi
 * → giren kişi repoların sahibi mi. Hepsi geçerse PT oturumu açılır ve girişten önce istenen
 * PT sayfasına (yoksa genel bakışa) dönülür; başarısızlıkta giriş sayfası o yolu korur.
 * GitHub uygulaması kurulumunda kullanıcı anahtarı (repo açma/silme için) şifreli çereze yazılır;
 * kişisel anahtar kurulumunda bugünkü gibi saklanmaz.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = await consumeReturnPath();
  const fail = (reason: string) => {
    const target = new URL('/login', request.url);
    target.searchParams.set('error', reason);
    if (next) target.searchParams.set(RETURN_PARAM, next);
    return NextResponse.redirect(target);
  };

  if (!githubLoginEnabled()) return fail('github_kapali');
  if (url.searchParams.get('error')) return fail('iptal');

  const stateOk = await consumeState(url.searchParams.get('state'));
  if (!stateOk) return fail('oturum_suresi');

  const code = url.searchParams.get('code');
  if (!code) return fail('kod_yok');

  const login = await exchangeCodeForUser(code, callbackUrl(request));
  if (!login) return fail('github_hatasi');
  // Sahibi değilse oturum AÇILMAZ ve anahtarı saklanmaz: uygulama tek kişiliktir.
  if (!isOwner(login.user)) return fail('yetkisiz');

  await createSession({ role: 'pt', via: 'github', subject: login.user.login });
  if (githubMode() === 'app' && login.token) await saveUserToken(login.token);
  return NextResponse.redirect(new URL(next ?? '/dashboard', request.url));
}
