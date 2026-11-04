import { normalizePrivateKey, PrivateKeyError } from './private-key.ts';

/**
 * GitHub'a hangi kimlikle gidileceği — saf; seçim TEK yerde, burada (`env.ts` bunu çağırır).
 *
 * - `app`: GitHub uygulaması (yeni kurulumlar). `GITHUB_APP_ID` + `GITHUB_APP_PRIVATE_KEY` varsa seçilir;
 *   okuma/yazma kurulum anahtarıyla (installation token), repo açma/silme PT'nin GitHub girişinden gelen
 *   kullanıcı anahtarıyla yapılır. `GITHUB_APP_INSTALLATION_ID` isteğe bağlı: yoksa sahibin kurulumu bulunur.
 * - `token`: kişisel anahtar (PAT, bugünkü kurulumlar). Yalnız uygulama ayarı yokken; davranış aynen sürer.
 *
 * Yarım uygulama ayarı (yalnız biri) kişisel anahtara sessizce düşmez: kurulum yarım kalmış demektir.
 */

export type GithubAccess =
  | { mode: 'token'; token: string }
  | { mode: 'app'; appId: string; privateKey: string; installationId: number | null };

export class GithubAccessError extends Error {}

const NUMERIC_ID = /^[1-9]\d{0,14}$/;

export function githubAccessFrom(env: Record<string, string | undefined>): GithubAccess {
  const appId = env.GITHUB_APP_ID?.trim() || undefined;
  const privateKey = env.GITHUB_APP_PRIVATE_KEY?.trim() || undefined;
  if (appId || privateKey) {
    if (!appId || !privateKey) {
      throw new GithubAccessError('GITHUB_APP_ID ve GITHUB_APP_PRIVATE_KEY birlikte tanımlanmalı (GitHub uygulamasıyla kurulum).');
    }
    if (!NUMERIC_ID.test(appId)) throw new GithubAccessError('GITHUB_APP_ID bir sayı olmalı (GitHub uygulamasının "App ID" değeri).');
    const installation = env.GITHUB_APP_INSTALLATION_ID?.trim() || undefined;
    if (installation && !NUMERIC_ID.test(installation)) {
      throw new GithubAccessError('GITHUB_APP_INSTALLATION_ID bir sayı olmalı; bilmiyorsan boş bırak, sahibin kurulumu bulunur.');
    }
    let key: string;
    try {
      key = normalizePrivateKey(privateKey);
    } catch (error) {
      if (error instanceof PrivateKeyError) throw new GithubAccessError(`GITHUB_APP_PRIVATE_KEY: ${error.message}`);
      throw error;
    }
    return { mode: 'app', appId, privateKey: key, installationId: installation ? Number(installation) : null };
  }
  const token = env.GITHUB_TOKEN;
  if (!token) {
    throw new GithubAccessError(
      'GitHub erişimi tanımlı değil: GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY (GitHub uygulaması) ya da GITHUB_TOKEN. Vercel → Settings → Environment Variables altına ekle (şablon: .env.example).',
    );
  }
  return { mode: 'token', token };
}
