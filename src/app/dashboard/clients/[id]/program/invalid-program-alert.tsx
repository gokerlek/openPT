import { WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getMessages } from '@/i18n/server';
import { ptProgramMessages } from '@/i18n/messages/pt-program';

/** Okunamayan program dosyası: ne olduğu ve nasıl düzeltileceği (görünüm ve düzenleme ortak). */
export async function InvalidProgramAlert({ problem }: { problem: string }) {
  const t = (await getMessages(ptProgramMessages)).invalidProgramAlert;
  return (
    <Alert variant="destructive">
      <WarningCircle weight="fill" />
      <AlertTitle>
        <code>program.json</code>
        {t.invalidSuffix}
      </AlertTitle>
      <AlertDescription>{t.description(problem)}</AlertDescription>
    </Alert>
  );
}
