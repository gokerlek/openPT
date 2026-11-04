/**
 * Kurulum kimliği ve kurulum anahtarlarının önbelleği — saf; `app-auth.ts` `@octokit/auth-app` ile bağlar.
 *
 * - Kimlik env'den (`GITHUB_APP_INSTALLATION_ID`) ya da bir kez sahibin kurulumundan bulunur ve süreç boyunca
 *   tutulur; bulma hatası tutulmaz.
 * - Anahtar alınırken 404/401 gelirse kimlik eskimiş olabilir (uygulama kaldırılıp yeniden kuruldu, env'deki
 *   kimlik eski kaldı): önbellek düşer ve kurulum sahibin hesabından BİR KEZ yeniden bulunur. Yine olmazsa hata
 *   yukarı çıkar (çağıran Türkçe mesaja çevirir). Ağ ve sınır hataları kimliği düşürmez.
 * - `token(true)`: önbellekteki anahtarı atlayıp yenisini alır (yeni açılan repo eski anahtara görünmeyebilir).
 */
export function installationTokens<A>(deps: {
  fixedId: number | null;
  findId: () => Promise<number>;
  create: (id: number) => A;
  mint: (auth: A, refresh: boolean) => Promise<string>;
  stale: (error: unknown) => boolean;
}) {
  let idPromise: Promise<number> | null = null;
  let authPromise: Promise<A> | null = null;
  // Env'deki kimlik bir kez geçersiz çıktıysa bundan sonra sahibin kurulumu esas alınır.
  let lookup = deps.fixedId === null;

  function id(): Promise<number> {
    idPromise ??= (lookup ? deps.findId() : Promise.resolve(deps.fixedId as number)).catch((error) => {
      idPromise = null;
      throw error;
    });
    return idPromise;
  }

  function auth(): Promise<A> {
    authPromise ??= id()
      .then(deps.create)
      .catch((error) => {
        authPromise = null;
        throw error;
      });
    return authPromise;
  }

  async function token(refresh = false): Promise<string> {
    const used = auth();
    try {
      return await deps.mint(await used, refresh);
    } catch (error) {
      if (!deps.stale(error)) throw error;
      // Başka bir istek zaten yeniden bulduysa onunkini kullan; değilse önbelleği düşür ve bir kez ara.
      if (authPromise === used || authPromise === null) {
        idPromise = null;
        authPromise = null;
        lookup = true;
      }
      return deps.mint(await auth(), refresh);
    }
  }

  return { id, auth, token };
}
