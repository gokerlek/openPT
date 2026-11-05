import { environmentStatus } from '@/lib/installation/readiness';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { GithubLogo, WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { PulseLine } from '@/components/pulse-line';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { LocaleSwitch } from '@/i18n/locale-switch';
import { authMessages } from '@/i18n/messages/auth';
import { getMessages } from '@/i18n/server';
import { readAppConfig } from '@/lib/config';
import { emailLoginEnabled } from '@/lib/env';
import { githubLoginEnabled } from '@/lib/github-oauth';
import { ownText } from '@/lib/own-text';
import { RETURN_PARAM, safeReturnPath } from '@/lib/navigation';
import { readPtSession } from '@/lib/session';
import { LoginForm } from './login-form';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(authMessages)).login.title };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[]; next?: string | string[] }>;
}) {
  if (environmentStatus(process.env) !== 'ready') redirect('/install');
  const { error: code, next: rawNext } = await searchParams;
  // Oturumsuz açılan PT sayfası (`requirePt`): girişten sonra oraya dönülür. Yalnız aynı kökende
  // `/dashboard` altı; başka her şey yok sayılır.
  const next = safeReturnPath(typeof rawNext === 'string' ? rawNext : null);

  // PT girişi. Aynı tarayıcıda açık bir danışan oturumu buraya engel değil: iki rolün
  // oturumu ayrı çerezde, PT girince danışanınki olduğu gibi kalır.
  if (await readPtSession()) redirect(next ?? '/dashboard');

  const [config, t] = await Promise.all([readAppConfig(), getMessages(authMessages)]);
  const error = typeof code === 'string' ? (ownText(t.trainer.errors, code) ?? t.trainer.failed) : null;
  const githubHref = next ? `/api/auth/github?${RETURN_PARAM}=${encodeURIComponent(next)}` : '/api/auth/github';
  const github = githubLoginEnabled();
  // Yedek yol yalnız PT açıkça istediyse (RESEND_API_KEY) görünür; uçlar da aynı koşula bakar (SPEC §5).
  const emailFallback = emailLoginEnabled();

  return (
    <main className="grid min-h-dvh grid-rows-[1fr_auto] px-4 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex w-full max-w-sm flex-col justify-center gap-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">{config.appName}</h1>
          <PulseLine className="h-6 w-40" />
          <p className="text-muted-foreground">{t.trainer.tagline}</p>
        </div>

        <Card>
          <CardContent className="flex flex-col gap-4">
            {error ? (
              <Alert variant="destructive">
                <WarningCircle weight="fill" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            {github ? (
              <div className="flex flex-col gap-2">
                <Button size="lg" className="h-11 w-full" nativeButton={false} render={<a href={githubHref} />}>
                  <GithubLogo data-icon="inline-start" weight="fill" />
                  {t.trainer.github}
                </Button>
                <p className="text-center text-xs text-muted-foreground">{t.trainer.githubHint}</p>
              </div>
            ) : (
              <p className="text-center text-sm text-muted-foreground">
                {t.trainer.githubMissing.before}
                <code>GITHUB_CLIENT_ID</code>
                {t.trainer.githubMissing.between}
                <code>GITHUB_CLIENT_SECRET</code>
                {t.trainer.githubMissing.after}
              </p>
            )}

            {emailFallback ? (
              <>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <Separator className="flex-1" />
                  {t.trainer.fallback}
                  <Separator className="flex-1" />
                </div>
                <LoginForm next={next} />
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
      <div className="flex flex-col items-center gap-1">
        <p className="text-center text-sm text-muted-foreground">{t.trainer.clientHint}</p>
        <LocaleSwitch />
      </div>
    </main>
  );
}
