import { currentClientLocale } from '@/i18n/client-locale';
import { commonMessages } from '@/i18n/messages/common';

/**
 * Uygulama genelinde tek hata tipi.
 *
 * Sunucu uçları `{ error: "mesaj" }` ya da alan bazlı hata için
 * `{ error: "mesaj", fields: { ad: "mesaj" } }` döner. `fetchJson` bunu `ApiError`'a
 * çevirir; bildirim gösterme işi tek merkezde (query/client.ts), alan hatalarını
 * forma basma işi `applyFieldErrors` içinde olur.
 */
export type FieldErrors = Record<string, string>;

export class ApiError extends Error {
  readonly status: number;
  /** GitHub'da aynı dosyaya eşzamanlı yazma (sha çakışması). Yeniden denemeye değer. */
  readonly conflict: boolean;
  /** Sunucunun tek tek alanlar için döndürdüğü hatalar. */
  readonly fields: FieldErrors;

  constructor(message: string, status: number, fields: FieldErrors = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.conflict = status === 409;
    this.fields = fields;
  }
}

export async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData;
    response = await fetch(input, {
      ...init,
      // FormData'da Content-Type'ı tarayıcı kurar (sınır değeri gerekir); elle konursa yükleme bozulur.
      headers: isFormData ? init?.headers : { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiError(commonMessages(currentClientLocale()).errors.network, 0);
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: string; fields?: FieldErrors }
      | null;
    // Sunucu mesajı yoksa sayfanın dilinde genel mesaj.
    const t = commonMessages(currentClientLocale()).errors;
    const defaultMessages: Record<number, string> = t.status;
    const message = body?.error ?? defaultMessages[response.status] ?? t.unexpected;
    throw new ApiError(message, response.status, body?.fields ?? {});
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
