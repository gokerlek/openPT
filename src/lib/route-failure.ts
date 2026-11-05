import { messageOf } from '../i18n/errors.ts';
import type { Locale } from '../i18n/locale.ts';
import { GithubError } from './github/errors.ts';

/**
 * Uç hatasının kullanıcıya giden metni ve durumu: GitHub'dan gelen hata kendi nedeniyle (dile göre metni varsa o dilde),
 * başkası `fallback` ile ve 502.
 */
export function failureOf(error: unknown, fallback: string, locale: Locale): { message: string; status: number } {
  const failure = error instanceof GithubError ? error : null;
  return { message: failure ? (messageOf(failure, locale) ?? failure.message) : fallback, status: failure?.status ?? 502 };
}
