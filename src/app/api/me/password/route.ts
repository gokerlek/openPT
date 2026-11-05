import { NextResponse } from 'next/server';
import { localeFromRequest } from '@/i18n/locale';
import { postGuard, setPasswordRoute } from '@/lib/client-auth-routes';
import { setClientPassword } from '@/lib/clients';
import { readClientSession } from '@/lib/session';
import { origin } from '@/lib/urls';

/**
 * Danışanın şifresini belirler (SPEC §5): kare kodla girişin ikinci adımı ya da eski akışla katılmış
 * danışanın `/me`'deki kartı. Kimlik adresten değil oturumdan; izin oturuma bağlı (hiç şifre yoksa, ya
 * da bu oturum yeni kare kodla 60 dk içinde açıldıysa). Yalnız bu siteden ve JSON'la. Şifre ne yanıta
 * ne günlüğe yazılır.
 */
export async function POST(request: Request) {
  const locale = localeFromRequest(request);
  const blocked = postGuard(request.headers, origin(request), locale);
  if (blocked) return NextResponse.json(blocked.body, { status: blocked.status });
  const result = await setPasswordRoute(
    { locale, session: await readClientSession(), setPassword: setClientPassword, log: (message) => console.error(message) },
    await request.json().catch(() => null),
  );
  return NextResponse.json(result.body, { status: result.status });
}
