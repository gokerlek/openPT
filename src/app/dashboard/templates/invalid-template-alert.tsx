import { WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getMessages } from '@/i18n/server';
import { ptLibraryMessages } from '@/i18n/messages/pt-library';

/** Okunamayan şablon dosyası: ne olduğu ve nasıl düzeltileceği (detay ve düzenleme ortak). */
export async function InvalidTemplateAlert({ id, problem }: { id: string; problem: string }) {
  const t = (await getMessages(ptLibraryMessages)).invalidTemplateAlert;
  return (
    <Alert variant="destructive">
      <WarningCircle weight="fill" />
      <AlertTitle>
        <code>data/templates/{id}.json</code>
        {t.invalidSuffix}
      </AlertTitle>
      <AlertDescription>{t.description(problem)}</AlertDescription>
    </Alert>
  );
}
