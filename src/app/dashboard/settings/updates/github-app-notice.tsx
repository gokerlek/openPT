import { WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { githubConnection, githubMode, GithubError } from '@/lib/github/client';

/**
 * GitHub uygulaması kurulumunun sorunları (tasarım B1): kurulum "All repositories" değilse yeni danışan
 * repoları uygulamaya görünmez; izin eksikse güncelleme ve repo işleri düşer. Kişisel anahtar (PAT)
 * kurulumunda hiç görünmez. Kurulum okunamazsa sebebi (Türkçe, sırsız) söylenir; sayfa düşmez.
 */
export async function GithubAppNotice() {
  if (githubMode() !== 'app') return null;
  let problems: string[];
  let settingsUrl: string | undefined;
  try {
    const connection = await githubConnection();
    problems = connection.problems;
    settingsUrl = connection.settingsUrl;
  } catch (error) {
    problems = [error instanceof GithubError ? error.message : 'GitHub uygulamasının kurulumu okunamadı. Biraz sonra tekrar dene.'];
  }
  if (problems.length === 0) return null;
  return (
    <Alert variant="destructive">
      <WarningCircle weight="fill" />
      <AlertTitle>GitHub uygulamasının kurulumu eksik</AlertTitle>
      <AlertDescription>
        {problems.map((problem) => (
          <p key={problem}>{problem}</p>
        ))}
        {settingsUrl && (
          <p>
            <a href={settingsUrl} target="_blank" rel="noreferrer">
              GitHub’daki kurulum ayarını aç
            </a>
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}
