import 'server-only';
import type { Octokit } from 'octokit';
import { requireAllRepositories } from './app-auth';
import { appRepo, clientRepoName, gh, githubMode, GithubError, isClientRepo, owner, toGithubError } from './client';
import { reauthError, userOctokit } from './user-auth';
import { CLIENT_REPO_PREFIX } from '../env';

/**
 * Danışan repoları (SPEC §3).
 *
 * Her danışan ayrı ÖZEL repo: silme istendiğinde repo silinir, başka hiçbir verinin
 * geçmişi yeniden yazılmaz. Repo adında isim geçmez, yalnız kimlik: repo adları
 * silindikten sonra da denetim kayıtlarında kalabiliyor.
 *
 * Repo açma/silme kimliği moda göre (`repoAdmin`): kişisel anahtar kurulumunda aynı anahtar (bugünkü gibi);
 * GitHub uygulamasında PT'nin kullanıcı anahtarı — kişisel hesapta kurulum anahtarı repo açamaz. Bu işlerin
 * hepsi zaten yalnız PT'nin yaptığı işler; anahtar yoksa "Bu işlem için GitHub ile yeniden giriş yap."
 */

/**
 * Repo açacak/silecek Octokit. Uygulama modunda açmadan önce kurulumun "All repositories" olduğu
 * denetlenir: değilse yeni repo kurulum anahtarına görünmez, açılıp yazılamadan kalırdı.
 */
async function repoAdmin(purpose: 'create' | 'delete'): Promise<Octokit> {
  if (githubMode() === 'token') return gh();
  if (purpose === 'create') await requireAllRepositories();
  return userOctokit();
}

/** Repo açma/silme hatası. Uygulama modunda 401 kullanıcı anahtarınındır (iptal, süre): yeniden giriş. */
function adminError(error: unknown, context: string): GithubError {
  const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : 0;
  if (status === 401 && githubMode() === 'app') return reauthError();
  return toGithubError(error, context);
}

/**
 * Uygulama (veri) repo'sunun denetimi, OLUŞTURMADAN: yalnız `repos.get`. Repo yoksa `exists: false`.
 * Özel değilse ya da fork ise 409 fırlatır: kod fork'la dağıtılır ve açık bir repo'nun fork'u gizli
 * yapılamaz; veri repo'su kodun fork'u (APP_REPO fork'un adıyla aynı) ya da açık bir repo olursa marka
 * ayarı, danışan kimlikleri ve giriş denemeleri herkese açık olur (SPEC §9.8). Kurulumdan sonra da
 * çalışır: repo sonradan açığa çevrilmiş ya da eski bir sürümle açık bir repo'ya kurulmuş olabilir.
 */
export async function checkAppRepo(): Promise<{ exists: boolean }> {
  const repo = appRepo();
  try {
    const { data } = await gh().rest.repos.get({ owner: owner(), repo });
    if (data.fork || !data.private) {
      throw new GithubError(
        `"${repo}" ${data.fork ? 'bir fork' : 'herkese açık'}. Veri repo'su kodun fork'undan ayrı ve özel olmalı: APP_REPO'ya yeni bir ad ver (ör. pulsecoach-data).`,
        409,
      );
    }
    return { exists: true };
  } catch (error) {
    if (error instanceof GithubError) throw error;
    if (typeof error === 'object' && error && 'status' in error && error.status === 404) return { exists: false };
    throw toGithubError(error, repo);
  }
}

/**
 * Uygulama repo'sunu oluşturur (kurulumun ilk adımı).
 *
 * PT'nin GitHub arayüzüyle uğraşmasına gerek kalmasın diye uygulama kendi deposunu
 * kendisi açar. Zaten varsa dokunmaz; açık ya da fork ise durur (`checkAppRepo`). Özel
 * (private) olmak zorunda: içinde marka ayarı ve danışan kimlikleri var.
 */
export async function createAppRepo(): Promise<{ created: boolean }> {
  const repo = appRepo();
  if ((await checkAppRepo()).exists) return { created: false };

  const admin = await repoAdmin('create');
  try {
    await admin.rest.repos.createForAuthenticatedUser({
      name: repo,
      private: true,
      auto_init: true,
      description: 'PulseCoach — uygulama ayarları ve antrenman kütüphanesi',
      has_issues: false,
      has_projects: false,
      has_wiki: false,
    });
    return { created: true };
  } catch (error) {
    throw adminError(error, repo);
  }
}

export async function createClientRepo(clientId: string): Promise<{ repo: string }> {
  const repo = clientRepoName(clientId);
  const admin = await repoAdmin('create');
  try {
    await admin.rest.repos.createForAuthenticatedUser({
      name: repo,
      // ÖZEL olmak zorunda: içinde danışan adı ve antrenman kayıtları var.
      private: true,
      auto_init: true,
      description: 'PulseCoach danışan verisi',
      has_issues: false,
      has_projects: false,
      has_wiki: false,
    });
    return { repo };
  } catch (error) {
    if (typeof error === 'object' && error && 'status' in error && error.status === 422) {
      throw new GithubError('Bu kimlikle bir repo zaten var.', 409);
    }
    throw adminError(error, repo);
  }
}

/**
 * Danışan repo'sunu kalıcı siler.
 *
 * `isClientRepo` kontrolü burada ayrıca yapılır: `assertRepoAllowed` uygulama repo'suna da
 * izin verir, ama silme YALNIZ danışan repolarında olabilir. Uygulama kendi reposunu silemez.
 */
export async function deleteClientRepo(clientId: string): Promise<void> {
  const repo = clientRepoName(clientId);
  if (!isClientRepo(repo)) {
    throw new GithubError('Yalnız danışan repoları silinebilir.', 403);
  }
  const admin = await repoAdmin('delete');
  try {
    await admin.rest.repos.delete({ owner: owner(), repo });
  } catch (error) {
    throw adminError(error, repo);
  }
}

export async function clientRepoExists(clientId: string): Promise<boolean> {
  const repo = clientRepoName(clientId);
  try {
    await gh().rest.repos.get({ owner: owner(), repo });
    return true;
  } catch (error) {
    if (typeof error === 'object' && error && 'status' in error && error.status === 404) return false;
    throw toGithubError(error, repo);
  }
}

/**
 * Hesaptaki danışan repolarının kimlikleri. Uygulama repo'su ve diğer projeler elenir. Uygulama modunda
 * liste kurulumun erişebildiği repolardan (`GET /installation/repositories`), yeniden eskiye.
 */
export async function listClientIds(): Promise<string[]> {
  if (githubMode() === 'app') {
    try {
      const repos = await gh().paginate(gh().rest.apps.listReposAccessibleToInstallation, { per_page: 100 });
      return repos
        .filter((repo) => repo.owner.login.toLowerCase() === owner().toLowerCase())
        .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
        .map((repo) => repo.name)
        .filter(isClientRepo)
        .map((name) => name.slice(CLIENT_REPO_PREFIX.length));
    } catch (error) {
      throw toGithubError(error, 'repo listesi');
    }
  }
  try {
    const repos = await gh().paginate(gh().rest.repos.listForAuthenticatedUser, {
      per_page: 100,
      affiliation: 'owner',
      sort: 'created',
    });
    return repos
      .map((repo) => repo.name)
      .filter(isClientRepo)
      .map((name) => name.slice(CLIENT_REPO_PREFIX.length));
  } catch (error) {
    throw toGithubError(error, 'repo listesi');
  }
}
