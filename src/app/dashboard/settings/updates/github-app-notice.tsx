import { WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { messageOf } from '@/i18n/errors';
import { installMessages } from '@/i18n/messages/install';
import { getLocale } from '@/i18n/server';
import { githubConnection, githubMode } from '@/lib/github/client';

/**
 * GitHub uygulaması kurulumunun sorunları (tasarım B1): kurulum "All repositories" değilse yeni danışan
 * repoları uygulamaya görünmez; izin eksikse güncelleme ve repo işleri düşer. Kişisel anahtar (PAT)
 * kurulumunda hiç görünmez. Kurulum okunamazsa sebebi (isteğin dilinde, sırsız) söylenir; sayfa düşmez.
 */
export async function GithubAppNotice() {
  if (githubMode() !== 'app') return null;
  const locale = await getLocale();
  const t = installMessages(locale).updates.panel;
  let problems: string[];
  let settingsUrl: string | undefined;
  try {
    const connection = await githubConnection(locale);
    problems = connection.problems;
    settingsUrl = connection.settingsUrl;
  } catch (error) {
    problems = [messageOf(error, locale) ?? t.appNoticeUnreadable];
  }
  if (problems.length === 0) return null;
  return (
    <Alert variant="destructive">
      <WarningCircle weight="fill" />
      <AlertTitle>{t.appNoticeTitle}</AlertTitle>
      <AlertDescription>
        {problems.map((problem) => (
          <p key={problem}>{problem}</p>
        ))}
        {settingsUrl && (
          <p>
            <a href={settingsUrl} target="_blank" rel="noreferrer">
              {installMessages(locale).ui.github.openSettings}
            </a>
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}
