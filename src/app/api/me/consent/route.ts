import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { DEFAULT_LOCALE, localeFromRequest } from '@/i18n/locale';
import { clientHomeMessages } from '@/i18n/messages/client-home';
import { setHealthConsent } from '@/lib/clients';
import { GithubError } from '@/lib/github/client';
import { sessionClient } from '@/lib/guards';
import { HEALTH_FIELDS } from '@/lib/schemas/client';
import { readClientSession } from '@/lib/session';

/** Danışanın ekranda gördüğü parçalar ve metin sürümü de gelir: onay yalnız onları kapsar. */
const bodySchema = v.object({
  granted: v.boolean(),
  fields: v.pipe(v.array(v.picklist(HEALTH_FIELDS)), v.maxLength(HEALTH_FIELDS.length)),
  version: v.pipe(v.string(), v.maxLength(20)),
});

/**
 * Danışanın sağlık verisi onayı ya da onayı geri çekmesi (SPEC §9.4). Yalnız danışanın
 * kendisi verebilir; kimlik adresten değil oturumdan okunur.
 */
export async function POST(request: Request) {
  const locale = localeFromRequest(request);
  const t = clientHomeMessages(locale).consentApi;
  const session = await readClientSession();
  if (session?.role !== 'client') return NextResponse.json({ error: t.sessionRequired }, { status: 401 });

  const body = v.safeParse(bodySchema, await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: t.badRequest }, { status: 400 });

  try {
    const client = await sessionClient(session);
    if (!client) return NextResponse.json({ error: t.expired }, { status: 401 });
    await setHealthConsent(client.id, body.output);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const failure = error instanceof GithubError ? error : null;
    // Dile göre metni olan GitHub hatası o dilde; düz (Türkçe) metinli olan Türkçede kendi metniyle, öteki dilde genel mesaj.
    const message = failure && (failure.text || locale === DEFAULT_LOCALE) ? failure.localized(locale) : t.failed;
    return NextResponse.json({ error: message }, { status: failure?.status ?? 502 });
  }
}
