import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { deleteClient } from '../clients-core.ts';
import { APP_REPO, clientRepo, clientStore, fakeClock, fakeGithub, INDEX_PATH, seedClient } from '../fake-github.ts';
import { GithubError } from './errors.ts';
import { repoAdminStep } from './repo-admin.ts';

/**
 * Danışan silme (uygulama modu). Kurulum sonradan "seçili repolar"a çevrildiyse repo iki anahtara da
 * görünmez: DELETE 404 döner ve `deleteClient` bunu "zaten silinmiş" sayardı. Kişisel veri GitHub'da kalır,
 * danışan listeden düşerdi. Önce "All repositories" doğrulanır; 404 ancak ondan sonra "zaten silinmiş"tir.
 */
function world(selection: 'all' | 'selected') {
  const gh = fakeGithub();
  const clock = fakeClock();
  const clients = clientStore(gh, clock);
  const client = seedClient(gh, clock);
  const checks: string[] = [];
  const requireAll = async () => {
    checks.push('requireAll');
    if (selection !== 'all') throw new GithubError('GitHub uygulaması yalnız seçili repolara erişiyor.', 409);
  };
  return { gh, clients, client, checks, requireAll };
}
const listed = (gh: ReturnType<typeof fakeGithub>, id: string) =>
  ((gh.get(APP_REPO, INDEX_PATH) as { id: string }[] | undefined) ?? []).some((item) => item.id === id);

describe('repo açma/silme sırası', () => {
  test('uygulama modunda kurulum seçili repolara çevrildiyse silme durur: repo kalır, danışan listede kalır', async () => {
    const w = world('selected');
    let removed = 0;
    // Gerçekte repo kuruluma görünmediği için DELETE 404 dönerdi.
    w.clients.store.deleteRepo = (id) => repoAdminStep('app', w.requireAll, async () => {
      removed += 1;
      await w.gh.deleteRepo(`missing-${id}`);
    });
    await assert.rejects(deleteClient(w.clients.store, w.client.id), (error) => error instanceof GithubError && error.status === 409);
    assert.equal(removed, 0);
    assert.equal(w.gh.hasRepo(clientRepo(w.client.id)), true);
    assert.equal(listed(w.gh, w.client.id), true);
  });

  test('uygulama modunda "All repositories" doğrulandıktan sonra gelen 404 "zaten silinmiş" sayılır', async () => {
    const w = world('all');
    w.clients.store.deleteRepo = (id) => repoAdminStep('app', w.requireAll, () => w.gh.deleteRepo(`missing-${id}`));
    await deleteClient(w.clients.store, w.client.id);
    assert.deepEqual(w.checks, ['requireAll']);
    assert.equal(listed(w.gh, w.client.id), false);
  });

  test('uygulama modunda normal silme: önce doğrulama, sonra repo gider', async () => {
    const w = world('all');
    w.clients.store.deleteRepo = (id) => repoAdminStep('app', w.requireAll, () => w.gh.deleteRepo(clientRepo(id)));
    await deleteClient(w.clients.store, w.client.id);
    assert.equal(w.gh.hasRepo(clientRepo(w.client.id)), false);
    assert.equal(listed(w.gh, w.client.id), false);
  });

  test('kişisel anahtar modunda doğrulama hiç çalışmaz (davranış aynı)', async () => {
    const w = world('selected');
    w.clients.store.deleteRepo = (id) => repoAdminStep('token', w.requireAll, () => w.gh.deleteRepo(clientRepo(id)));
    await deleteClient(w.clients.store, w.client.id);
    assert.deepEqual(w.checks, []);
    assert.equal(w.gh.hasRepo(clientRepo(w.client.id)), false);
  });
});
