import { NextResponse } from 'next/server';
import { messageOf } from '@/i18n/errors';
import { localeFromRequest } from '@/i18n/locale';
import { commonMessages } from '@/i18n/messages/common';
import { setupMessages } from '@/i18n/messages/setup';
import { readPtSession } from '@/lib/session';
import { appRepo, githubConnection, GithubError, owner } from '@/lib/github/client';
import { checkAppRepo, listClientIds } from '@/lib/github/repos';

/**
 * Kurulum durumu: token geçerli mi, uygulama repo'su var mı, özel mi, kaç danışan var.
 * Kurulum sihirbazı bununla açılır; aynı zamanda "bir şey mi bozuldu" kontrolüdür.
 * Yalnız okuma yapar. Repo'nun görünürlüğü kurulum tamamlanmış olsa da denetlenir: açık ya da
 * fork ise `uygulamaReposu.sorun` açıklamayı taşır (SPEC §9.8).
 *
 * GitHub uygulaması kurulumunda hesap kurulumun hesabıdır (kurulum anahtarı `GET /user`'ı çağıramaz);
 * kurulumun sorunları ("All repositories" değil, izin eksik, askıda) `githubUyarilari` ile ve GitHub'daki
 * kurulum ayarının adresiyle döner. Kişisel anahtarda bu alanlar boş.
 */
export async function GET(request: Request) {
  const locale = localeFromRequest(request);
  const session = await readPtSession();
  if (session?.role !== 'pt') {
    return NextResponse.json({ error: commonMessages(locale).errors.status[403] }, { status: 403 });
  }

  try {
    const connection = await githubConnection();
    const repo = appRepo();

    let appRepoExists = true;
    let problem: string | null = null;
    try {
      appRepoExists = (await checkAppRepo()).exists;
    } catch (error) {
      if (!(error instanceof GithubError && error.status === 409)) throw error;
      problem = error.localized(locale);
    }

    const clientIds = appRepoExists ? await listClientIds() : [];

    return NextResponse.json({
      githubKullanicisi: connection.login,
      sahibiyleeslesiyor: connection.login.toLowerCase() === owner().toLowerCase(),
      githubBaglantisi: connection.mode === 'app' ? 'uygulama' : 'anahtar',
      githubUyarilari: connection.problems,
      ...(connection.settingsUrl ? { githubAyarlari: connection.settingsUrl } : {}),
      uygulamaReposu: { ad: repo, var: appRepoExists, ...(problem ? { sorun: problem } : {}) },
      danisanSayisi: clientIds.length,
    });
  } catch (error) {
    const failure = error instanceof GithubError ? error : null;
    return NextResponse.json(
      { error: messageOf(failure, locale) ?? setupMessages(locale).api.githubFailed },
      { status: failure?.status ?? 502 },
    );
  }
}
