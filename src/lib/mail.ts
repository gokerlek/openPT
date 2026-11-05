import 'server-only';
import { DEFAULT_LOCALE, type Locale } from '../i18n/locale';
import { LocalizedError } from '../i18n/errors';
import { authMessages } from '../i18n/messages/auth';
import { installMessages } from '../i18n/messages/install';
import { serverEnv } from './env';

/**
 * Giriş kodu e-postası. Yalnız yedek e-posta yolu açıkken (`RESEND_API_KEY`) çağrılır; kod
 * hiçbir koşulda günlüğe ya da HTTP yanıtına yazılmaz (yerel geliştirmede `/api/dev/login`).
 */
export async function sendOtpEmail(email: string, code: string, locale: Locale = DEFAULT_LOCALE): Promise<void> {
  const env = serverEnv();
  const t = authMessages(locale).mail;

  if (!env.resendApiKey) throw new LocalizedError((l) => installMessages(l).env.resendMissing);

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM ?? 'openPT <onboarding@resend.dev>',
      to: email,
      subject: t.subject(code),
      text: t.body(code),
    }),
  });

  if (!response.ok) {
    // Kod gövdeye yazılmaz; yalnız durum kodu günlüğe düşer.
    console.error(`[giris] e-posta gönderilemedi: ${response.status}`);
    throw new Error('mail_gonderilemedi');
  }
}
