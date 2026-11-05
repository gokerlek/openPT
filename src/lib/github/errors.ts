import { DEFAULT_LOCALE, type Locale } from '../../i18n/locale.ts';
import type { Localizable, LocalizedText } from '../../i18n/errors.ts';

/**
 * GitHub katmanının hata tipleri ve yeni açılan repo'ya ilk yazma — saf: `server-only`, ortam ya da
 * Octokit yok. Test edilen çekirdekler (`session-core.ts`, `clients-core.ts`, `config-update.ts`)
 * buradan alır; `github/client.ts` aynı sınıfı yeniden dışa verir, yani `instanceof` iki yoldan
 * gelen hatada da tutar.
 */

/** GitHub'ın istek sınırı bilgisi (yanıt başlıklarından; `toGithubError`). */
export type RateLimitInfo = {
  /** Sınırdan dolayı reddedildi (429 ya da sınır kaynaklı 403). */
  rateLimited?: boolean;
  /** `retry-after` başlığı, saniye. */
  retryAfter?: number;
  /** `x-ratelimit-remaining`: saatlik kotadan kalan. */
  remaining?: number;
};

/**
 * `message` düz metin ya da dile göre metin (`LocalizedText`) olabilir: `.message` Türkçe kalır (günlükler ve
 * testler), kullanıcıya giden metni uçlar `messageOf(error, locale)` ile alır.
 */
export class GithubError extends Error implements Localizable {
  readonly status: number;
  readonly rateLimited: boolean;
  readonly retryAfter: number | undefined;
  readonly remaining: number | undefined;
  readonly text: LocalizedText | undefined;
  constructor(message: string | LocalizedText, status: number, rate: RateLimitInfo = {}) {
    super(typeof message === 'function' ? message(DEFAULT_LOCALE) : message);
    this.text = typeof message === 'function' ? message : undefined;
    this.name = 'GithubError';
    this.status = status;
    this.rateLimited = rate.rateLimited ?? false;
    this.retryAfter = rate.retryAfter;
    this.remaining = rate.remaining;
  }

  localized(locale: Locale): string {
    return this.text ? this.text(locale) : this.message;
  }
}

/**
 * Yanıt başlıklarından istek sınırı. 429 her zaman sınırdır; 403 ancak kota bittiyse
 * (`x-ratelimit-remaining: 0`), `retry-after` geldiyse ya da ikincil sınır mesajıysa: izin 403'ü sınır değildir.
 */
export function rateLimitOf(status: number, headers: Record<string, unknown> | undefined, message = ''): RateLimitInfo {
  const header = (name: string) => {
    const value = headers?.[name];
    const number = typeof value === 'string' || typeof value === 'number' ? Number(value) : Number.NaN;
    return Number.isFinite(number) ? number : undefined;
  };
  const retryAfter = header('retry-after');
  const remaining = header('x-ratelimit-remaining');
  const limited = status === 429 || (status === 403 && (remaining === 0 || retryAfter !== undefined || /rate limit/i.test(message)));
  return {
    ...(limited ? { rateLimited: true } : {}),
    ...(retryAfter !== undefined ? { retryAfter } : {}),
    ...(remaining !== undefined ? { remaining } : {}),
  };
}

/**
 * Dosya var ama JSON olarak okunamıyor (ör. elle yapılan düzenleme yarım kaldı). `sha` aynı okumadan
 * gelir: dosyayı onarmak isteyen (kurulum sihirbazı) ikinci bir okuma yapmadan üzerine yazabilir ve
 * yazdığı taban, sha'sını taşıdığı içerikle aynı kalır.
 */
export class BrokenJsonError extends GithubError {
  readonly sha: string;
  constructor(path: string, sha: string) {
    super(`${path} bozuk JSON içeriyor.`, 500);
    this.name = 'BrokenJsonError';
    this.sha = sha;
  }
}

/** Hatanın günlüğe yazılacak özeti: mesaj ve (varsa) durum kodu. Çağıran koda ya da adrese yer vermez. */
export function describeError(error: unknown): string {
  if (error instanceof GithubError) return `${error.message} (${error.status})`;
  return error instanceof Error ? error.message : String(error);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const FRESH_REPO_RETRIES = 3;

/**
 * Repo yeni açıldığında içerik ucu kısa bir süre 404/409 verebilir: ilk yazma birkaç kez denenir
 * (0,6 · 1,2 · 1,8 sn arayla). Başka hatalar ve son denemenin hatası yukarı çıkar.
 *
 * `refreshAccess` (GitHub uygulaması modu): ilk 404'te yeniden denemeden önce bir kez çağrılır. Önbellekteki
 * kurulum anahtarı repo açılmadan alınmış ve yeni repoyu görmüyor olabilir. Yenileme düşerse yazma yine denenir.
 */
export async function writeToFreshRepo<T>(
  write: () => Promise<T>,
  wait: (ms: number) => Promise<void> = sleep,
  refreshAccess?: () => Promise<void>,
): Promise<T> {
  let refreshed = false;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await write();
    } catch (error) {
      const retryable = error instanceof GithubError && (error.status === 404 || error.status === 409);
      if (!retryable || attempt >= FRESH_REPO_RETRIES) throw error;
      if (error.status === 404 && refreshAccess && !refreshed) {
        refreshed = true;
        await refreshAccess().catch(() => undefined);
      }
      await wait(600 * (attempt + 1));
    }
  }
}
