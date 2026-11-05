import 'server-only';
import { serverEnv } from '@/lib/env';
import { DEFAULT_LOCALE, type Locale } from '@/i18n/locale';
import { LocalizedError } from '@/i18n/errors';
import { coachMessages } from '@/i18n/messages/coach';
import { clientRepoName, gh, owner } from '@/lib/github/client';
import { readJson, writeJson } from '@/lib/github/files';
import { resolveKey, saveKey, type KeyStore } from './credentials';
import { geminiApiKey } from './gemini-key';

function clientKeyStore(clientId: string, locale: Locale = DEFAULT_LOCALE) {
  const t = coachMessages(locale).internal;
  const env = serverEnv();
  const repo = clientRepoName(clientId);
  const path = 'secrets/coach-gemini.json';
  const store: KeyStore = {
    checkPrivate: async () => {
      const response = await gh().rest.repos.get({ owner: owner(), repo });
      if (!response.data.private || response.data.fork) throw new LocalizedError(l => coachMessages(l).internal.keys.clientRepo);
    },
    read: () => readJson(repo, path),
    write: async (record, sha) => { await writeJson(repo, path, record, { sha, message: t.commits.clientKey }); },
  };
  return { store, context: { secret: env.authSecret, owner: env.owner, repo } };
}
export async function ownCoachKey(clientId: string) {
  const { store, context } = clientKeyStore(clientId);
  return (await resolveKey(store, context)).key;
}
export async function setOwnCoachKey(clientId: string, key: string | null, locale: Locale = DEFAULT_LOCALE) {
  const { store, context } = clientKeyStore(clientId, locale);
  await saveKey(store, context, key);
}
/** PT questions never spend a client's key. Client questions prefer the client's optional key. */
export async function coachingKey(clientId: string, role: 'pt' | 'client') {
  if (role === 'client') {
    const own = await ownCoachKey(clientId);
    if (own) return { key: own, source: 'client' as const };
  }
  const key = await geminiApiKey();
  return { key, source: key ? 'pt' as const : null };
}
