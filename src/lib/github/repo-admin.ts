import type { GithubAccess } from './access.ts';

/**
 * Repo açma/silmenin sırası — saf; `repos.ts` GitHub'a bağlar, test sahtesini verir.
 *
 * Uygulama modunda iş başlamadan kurulumun bütün repoları gördüğü ("All repositories") taze olarak
 * doğrulanır:
 * - açarken: seçili repolarla kurulmuş uygulama yeni repoyu göremez; repo açılır ama yazılamaz;
 * - silerken: kurulum sonradan seçili repolara çevrildiyse repo iki anahtara da 404 döner ve
 *   `deleteClient` bunu "zaten silinmiş" sayıp danışanı listeden çıkarırdı; kişisel veri GitHub'da
 *   kalırdı. Doğrulamadan sonra gelen 404 gerçekten "repo yok" demektir.
 * Kişisel anahtar modunda doğrulama yok: anahtar hesabın bütün repolarını görür, davranış aynı.
 */
export async function repoAdminStep<T>(
  mode: GithubAccess['mode'],
  requireAllRepositories: () => Promise<void>,
  run: () => Promise<T>,
): Promise<T> {
  if (mode === 'app') await requireAllRepositories();
  return run();
}
