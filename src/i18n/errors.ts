import { DEFAULT_LOCALE, type Locale } from './locale.ts';

/**
 * Dile göre hata mesajı. `LocalizedError`'ın `.message`'ı Türkçe kalır (kayıtlar ve testler değişmez); kullanıcıya
 * giden metni uçlar ve hata sınırları `messageOf(error, locale)` ile alır.
 *
 * Parametre özelliği (`constructor(readonly x)`) yok: Node'un tür silmesi onu silemez.
 */

export type LocalizedText = (locale: Locale) => string;

export interface Localizable {
  localized(locale: Locale): string;
}

export class LocalizedError extends Error implements Localizable {
  readonly text: LocalizedText;

  constructor(text: LocalizedText, options?: ErrorOptions) {
    super(text(DEFAULT_LOCALE), options);
    this.text = text;
  }

  localized(locale: Locale): string {
    return this.text(locale);
  }
}

function isLocalizable(value: unknown): value is Localizable {
  return typeof value === 'object' && value !== null && typeof (value as Partial<Localizable>).localized === 'function';
}

/**
 * Kullanıcıya gösterilecek mesaj: dile göre metni olan hata o dilde, düz `Error` kendi mesajıyla; hata değilse null
 * (çağıran kendi genel mesajını koyar).
 */
export function messageOf(error: unknown, locale: Locale): string | null {
  if (isLocalizable(error)) return error.localized(locale);
  if (error instanceof Error) return error.message;
  return null;
}
