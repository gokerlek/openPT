import { DEFAULT_LOCALE, type Locale } from '../i18n/locale.ts';
import { GithubError } from './github/errors.ts';

/**
 * Metni okuyanın diline göre değişen `GithubError` (`messageOf(error, locale)`); `.message` Türkçe kalır (kayıtlar ve
 * testler değişmez). Parametre özelliği yok: Node'un tür silmesi onu silemez.
 */
export class LocalizedGithubError extends GithubError {
  readonly text: (locale: Locale) => string;

  constructor(text: (locale: Locale) => string, status: number) {
    super(text(DEFAULT_LOCALE), status);
    this.text = text;
  }

  localized(locale: Locale): string {
    return this.text(locale);
  }
}
