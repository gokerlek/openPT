import { DEFAULT_LOCALE, type Locale } from '../../i18n/locale.ts';
import type { Localizable, LocalizedText } from '../../i18n/errors.ts';
import { GithubError } from '../github/errors.ts';

/**
 * Koç bağlamı ve yayın sırasında kullanıcıya gösterilen hatalar: `GithubError` gibi bir durum kodu taşır (uçlar
 * onunla yanıt verir), metni ise okuyanın dilinde verir (`localized`). `.message` Türkçe kalır (günlük ve testler).
 * Parametre özelliği yok: Node'un tür silmesi onu silemez.
 */
export class CoachError extends GithubError implements Localizable {
  readonly text: LocalizedText;

  constructor(text: LocalizedText, status: number) {
    super(text(DEFAULT_LOCALE), status);
    this.text = text;
  }

  localized(locale: Locale): string {
    return this.text(locale);
  }
}
