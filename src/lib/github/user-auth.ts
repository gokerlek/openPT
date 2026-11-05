import 'server-only';
import { cookies } from 'next/headers';
import { Octokit } from 'octokit';
import { installMessages } from '../../i18n/messages/install';
import { serverEnv } from '../env';
import { GithubError } from './errors';
import {
  openUserToken,
  refreshUserToken,
  sealUserToken,
  USER_TOKEN_COOKIE,
  userTokenCookieMaxAge,
  userTokenStep,
  type UserToken,
} from './user-token';

/**
 * PT'nin GitHub kullanıcı anahtarı — Next'e bağlama (kurallar ve şifreleme `user-token.ts`'te, test edilir).
 * Yalnız GitHub uygulaması modunda saklanır ve yalnız repo açma/silmede kullanılır; kişisel anahtar
 * kurulumunda giriş anahtarı bugünkü gibi hiç saklanmaz.
 */

function cookieOptions(maxAge: number) {
  return { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge };
}

export function reauthError(): GithubError {
  return new GithubError((l) => installMessages(l).github.reauth, 401);
}

/** GitHub girişinden sonra (dönüş ucu): anahtar şifrelenip httpOnly çereze yazılır. */
export async function saveUserToken(token: UserToken): Promise<void> {
  const store = await cookies();
  store.set(USER_TOKEN_COOKIE, sealUserToken(token, serverEnv().authSecret), cookieOptions(userTokenCookieMaxAge(token, new Date())));
}

/** Çıkışta ve anahtar artık kullanılamazken. */
export async function clearUserToken(): Promise<void> {
  (await cookies()).delete(USER_TOKEN_COOKIE);
}

/**
 * PT'nin kullanıcı anahtarıyla Octokit. Anahtar yoksa (e-posta koduyla giriş, çerez silinmiş, başka sırla
 * mühürlenmiş), sahibine ait değilse ya da yenilenemiyorsa: "Bu işlem için GitHub ile yeniden giriş yap."
 * Süresi dolmak üzereyse yenilenir ve yeni çift çereze yazılır (eski yenileme anahtarı GitHub'da geçersizleşir).
 */
export async function userOctokit(): Promise<Octokit> {
  const env = serverEnv();
  const store = await cookies();
  let token = openUserToken(store.get(USER_TOKEN_COOKIE)?.value, env.authSecret);
  if (!token || token.login.toLowerCase() !== env.owner.toLowerCase()) throw reauthError();
  const now = new Date();
  const step = userTokenStep(token, now);
  if (step === 'login' || (step === 'refresh' && !env.github)) throw reauthError();
  if (step === 'refresh' && env.github) {
    const refreshed = await refreshUserToken(token, env.github, now);
    if (!refreshed) throw reauthError();
    token = refreshed;
    try {
      store.set(USER_TOKEN_COOKIE, sealUserToken(token, env.authSecret), cookieOptions(userTokenCookieMaxAge(token, now)));
    } catch {
      // Çerez yalnız Route Handler ve Server Function'da yazılabilir. Repo işleri oralardan gelir; başka
      // bir yerden gelirse bu istek yine yapılır, sonraki repo işi yeniden giriş ister.
    }
  }
  return new Octokit({ auth: token.accessToken, userAgent: 'openpt' });
}
