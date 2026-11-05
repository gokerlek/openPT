import { NextResponse } from 'next/server';
import { messageOf } from '@/i18n/errors';
import { localeFromRequest } from '@/i18n/locale';
import { commonMessages } from '@/i18n/messages/common';
import { setupMessages } from '@/i18n/messages/setup';
import { readPtSession } from '@/lib/session';
import { appRepo, GithubError } from '@/lib/github/client';
import { createAppRepo } from '@/lib/github/repos';
import { readJson, writeJson } from '@/lib/github/files';
import { defaultConfig, type AppConfig } from '@/lib/schemas/config';

/**
 * Kurulumun ilk adımı: uygulama repo'sunu hazırlar.
 *
 * Yapılanlar (hepsi "zaten varsa dokunma" mantığıyla):
 *   1. repo yoksa oluştur (özel)
 *   2. pulsecoach.config.json yoksa varsayılanla yaz
 *   3. data/clients.json yoksa boş listeyle yaz
 *
 * Aynı istek iki kez gelirse ikincisi hiçbir şeyi bozmaz.
 */
export async function POST(request: Request) {
  const locale = localeFromRequest(request);
  const session = await readPtSession();
  if (session?.role !== 'pt') {
    return NextResponse.json({ error: commonMessages(locale).errors.status[403] }, { status: 403 });
  }

  const repo = appRepo();

  try {
    const { created } = await createAppRepo();

    const config = await readJson<AppConfig>(repo, 'pulsecoach.config.json');
    if (!config) {
      await writeJson(repo, 'pulsecoach.config.json', defaultConfig, {
        message: 'Kurulum: uygulama ayarları oluşturuldu',
      });
    }

    const clients = await readJson<unknown[]>(repo, 'data/clients.json');
    if (!clients) {
      await writeJson(repo, 'data/clients.json', [], {
        message: 'Kurulum: danışan listesi oluşturuldu',
      });
    }

    return NextResponse.json({
      repo,
      repoCreated: created,
      configCreated: !config,
      clientsCreated: !clients,
    });
  } catch (error) {
    const failure = error instanceof GithubError ? error : null;
    return NextResponse.json(
      { error: messageOf(failure, locale) ?? setupMessages(locale).api.setupFailed },
      { status: failure?.status ?? 502 },
    );
  }
}
