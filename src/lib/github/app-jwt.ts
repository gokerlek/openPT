import 'server-only';
import { createAppAuth } from '@octokit/auth-app';
import type { AppJwt } from '../installation/github-app-api';

/**
 * GitHub uygulamasının JWT'si (RS256, 10 dk) — yerelde imzalanır, ağa çıkmaz. `@octokit/auth-app`
 * `octokit` paketinin kendi bağımlılığı (`@octokit/app` üzerinden); ayrı paket eklenmedi.
 */
export const appJwt: AppJwt = async (appId, privateKey) => (await createAppAuth({ appId, privateKey })({ type: 'app' })).token;
