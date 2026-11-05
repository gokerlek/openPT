import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { localeFromRequest } from '@/i18n/locale';
import { authMessages } from '@/i18n/messages/auth';
import { emailLoginEnabled, serverEnv } from '@/lib/env';
import { consumeOtp, createSession, type OtpResult } from '@/lib/session';
import { verifyBodySchema } from '@/lib/schemas/auth';

/** Kodu doğrular ve PT oturumu açar (yedek yol; `RESEND_API_KEY` yoksa bu uç yoktur, SPEC §2). */
export async function POST(request: Request) {
  if (!emailLoginEnabled()) return new NextResponse(null, { status: 404 });

  // Kod hatalı, süresi dolmuş ya da kilitli: dışarıya hep aynı mesaj (`t.codeFailed`). Nedeni ayrı söylemek
  // yönetici adresini ele verirdi — öteki adresler hiç kod almadığı için hep "hatalı" alır, yöneticininki
  // üçüncü denemede "çok fazla deneme", kod yokken "süresi doldu" alırdı.
  const t = authMessages(localeFromRequest(request)).api;
  const parsed = v.safeParse(verifyBodySchema, await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: t.codeFailed }, { status: 400 });
  }

  const { email, code } = parsed.output;
  let result: OtpResult;
  try {
    result = await consumeOtp(code, email);
  } catch {
    // GitHub'a ulaşılamadı ya da aynı anda başka bir deneme sayacı yazdı: "kod hatalı" denmez.
    return NextResponse.json({ error: t.unavailable }, { status: 502 });
  }
  // Kod doğru olsa bile yönetici adresi değilse oturum açılmaz.
  if (!result.ok || email !== serverEnv().ptEmail) {
    return NextResponse.json({ error: t.codeFailed }, { status: 400 });
  }

  await createSession({ role: 'pt', via: 'email', subject: email });
  return NextResponse.json({ ok: true });
}
