import { LocalizedError } from '../../i18n/errors.ts';
import { installMessages } from '../../i18n/messages/install/index.ts';

/**
 * GitHub uygulamasının özel anahtarı (PEM) — saf: ortam ve ağ yok. Hem sunucu (`env.ts`) hem kurulum
 * sihirbazı (tarayıcıda, `installation/wizard.ts`) kullanır.
 *
 * Anahtar env'e çoğu zaman bozularak girer: satır sonları `\n` kaçışına döner (tek satırlık alanlar,
 * `.env` dosyaları), Windows'ta CRLF olur, tırnakla sarılır ya da tek satırlık bir kutuya yapıştırılınca
 * satır sonları boşluğa döner. Hepsi aynı PEM'e çevrilir; PEM'e benzemeyen değer reddedilir.
 */

export class PrivateKeyError extends LocalizedError {}

const PEM = /-----BEGIN ((?:RSA |EC )?PRIVATE KEY)-----([\s\S]*?)-----END \1-----/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** Anahtarı 64 karakterlik satırlara bölünmüş, sonda satır sonu olan PEM'e çevirir. */
export function normalizePrivateKey(raw: string): string {
  let text = raw.trim();
  if (text.length > 1 && (text[0] === '"' || text[0] === "'") && text.at(-1) === text[0]) text = text.slice(1, -1).trim();
  text = text.replace(/\\r/g, '').replace(/\\n/g, '\n').replace(/\r\n?/g, '\n');
  const match = PEM.exec(text);
  const label = match?.[1];
  const body = match?.[2]?.replace(/\s+/g, '') ?? '';
  // Mesaj değeri tekrarlamaz: hata günlüğe ya da ekrana düşerse anahtar parçası da düşmesin.
  if (!label || !BASE64.test(body)) {
    throw new PrivateKeyError((l) => installMessages(l).github.privateKey);
  }
  return `-----BEGIN ${label}-----\n${body.match(/.{1,64}/g)!.join('\n')}\n-----END ${label}-----\n`;
}

export function isPrivateKey(raw: string): boolean {
  try {
    normalizePrivateKey(raw);
    return true;
  } catch {
    return false;
  }
}

/** `.env` satırı için tek satırlık biçim: satır sonları `\n` kaçışıyla (sunucu `normalizePrivateKey` ile geri çevirir). */
export function escapePrivateKey(raw: string): string {
  return normalizePrivateKey(raw).trimEnd().replace(/\n/g, '\\n');
}
