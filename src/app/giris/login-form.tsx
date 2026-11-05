'use client';

import { useRouter } from 'next/navigation';
import { Info, QrCode } from '@phosphor-icons/react';
import { Field as FormField, Form, useForm } from '@formisch/react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useLocale, useMessages } from '@/i18n/client';
import { authMessages } from '@/i18n/messages/auth';
import { fetchJson } from '@/lib/query/errors';
import { useServiceMutation } from '@/lib/query/use-service';
import { passwordLoginSchema, type PasswordLoginInput } from '@/lib/schemas/auth';
import { loginScreen } from './login-screen';
import { PasswordInput } from './password-input';
import { rememberClient, useRememberedClient } from './remembered-client';

/**
 * Şifreyle giriş formu; hangi ekranın çizileceği `login-screen.ts`'te. Kimlik adresten, yoksa
 * telefonda saklanandan; ikisi de yoksa yönlendirme metni (kimlik kutusu yok). Şifresi olmayan
 * danışan çıkınca şifre kutusu yerine yeni kare kod istenir. Sunucu yanlış şifre, kilit ve kapalı
 * hesaba aynı genel yanıtı verir; alanın altında gösterilir. "Şifremi unuttum" yok: sıfırlama yalnız
 * antrenörden, yeni kare kodla.
 */
export function ClientLoginForm({
  clientId,
  loggedOut,
  passwordless,
}: {
  clientId: string | null;
  loggedOut: boolean;
  passwordless: boolean;
}) {
  const locale = useLocale();
  const t = useMessages(authMessages);
  const remembered = useRememberedClient();
  const screen = loginScreen({ clientId, remembered, loggedOut, passwordless, locale });

  // Telefonda saklanan kimlik ilk çizimden sonra okunur: o ana kadar formun yeri tutulur.
  if (screen.kind === 'loading') return <Skeleton className="h-52 w-full" />;
  if (screen.kind === 'no-password') {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <QrCode weight="fill" />
          </EmptyMedia>
          <EmptyTitle>{t.loginScreen.noPasswordTitle}</EmptyTitle>
          <EmptyDescription>{t.loginScreen.noPasswordNotice}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  if (screen.kind === 'no-id') {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <QrCode weight="fill" />
          </EmptyMedia>
          <EmptyTitle>{t.login.openLinkTitle}</EmptyTitle>
          <EmptyDescription>{t.login.openLinkBody}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return <PasswordLogin clientId={screen.clientId} notice={screen.notice} />;
}

function PasswordLogin({ clientId, notice }: { clientId: string; notice: string | null }) {
  const t = useMessages(authMessages).login;
  const router = useRouter();
  const form = useForm({ schema: passwordLoginSchema, initialInput: { password: '' } });
  const login = useServiceMutation({
    fn: ({ password }: PasswordLoginInput) =>
      fetchJson<{ ok: true }>('/api/giris', { method: 'POST', body: JSON.stringify({ clientId, password }) }),
    onSuccess: () => {
      rememberClient(clientId);
      router.replace('/me');
    },
    notify: 'none',
  });
  const busy = login.isPending || login.isSuccess;

  return (
    <div className="flex flex-col gap-5">
      {notice ? (
        <Alert>
          <Info weight="fill" />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}
      <Form of={form} className="flex flex-col gap-5" onSubmit={(output) => login.mutateAsync(output).catch(() => undefined)}>
        {/* Parola yöneticisi şifreyi bu danışanla eşlesin diye kimlik gizli "kullanıcı adı" olarak durur. */}
        <input type="text" name="username" autoComplete="username" value={clientId} readOnly hidden />
        <FormField of={form} path={['password']}>
          {(field) => (
            <Field data-invalid={Boolean(field.errors || login.error) || undefined}>
              <FieldLabel htmlFor="current-password">{t.passwordLabel}</FieldLabel>
              <PasswordInput
                {...field.props}
                id="current-password"
                autoComplete="current-password"
                value={field.input ?? ''}
                aria-invalid={Boolean(field.errors || login.error) || undefined}
              />
              <FieldError>{field.errors?.[0] ?? login.error?.message}</FieldError>
            </Field>
          )}
        </FormField>
        <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={busy}>
          {busy ? <Spinner data-icon="inline-start" /> : null}
          {t.submit}
        </Button>
      </Form>
      <p className="text-center text-sm text-muted-foreground">{t.forgot}</p>
    </div>
  );
}
