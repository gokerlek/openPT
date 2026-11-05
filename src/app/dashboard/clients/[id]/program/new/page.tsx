import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { EditorBackLink } from '@/components/block-editor/editor-back-link';
import { SectionHeader } from '@/components/section-header';
import { loadEditorCare } from '@/lib/client-care';
import { loadClient } from '@/lib/clients';
import { readAppConfig } from '@/lib/config';
import { listDevices } from '@/lib/devices';
import { listExercises } from '@/lib/exercises';
import { todayIn } from '@/lib/format';
import { requirePt } from '@/lib/guards';
import { blankProgramBody, programIdSource } from '@/lib/program-plan';
import { readProgramFile } from '@/lib/programs';
import { CLIENT_ID_PATTERN } from '@/lib/schemas/client';
import { listTemplates, pickerDevices, pickerExercises } from '@/lib/templates';
import { ProgramForm } from '../program-form';
import { getLocale, getMessages } from '@/i18n/server';
import { ptProgramMessages } from '@/i18n/messages/pt-program';

export async function generateMetadata(): Promise<Metadata> {
  const t = (await getMessages(ptProgramMessages)).programNew;
  return { title: t.title };
}

/** Program oluşturma: düzenleyici boş iskeletle açılır; ilk "Programı oluştur" dosyayı yazar. */
export default async function NewProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const locale = await getLocale();
  const t = ptProgramMessages(locale).programNew;
  await requirePt();
  const { id } = await params;
  if (!CLIENT_ID_PATTERN.test(id)) notFound();
  const loaded = await loadClient(id);
  if (!loaded) notFound();
  if (!loaded.ok) redirect(`/dashboard/clients/${id}`);
  // Program zaten var (okunamasa da): düzenleme sayfası.
  if (await readProgramFile(id, locale)) redirect(`/dashboard/clients/${id}/program/edit`);

  const [templateFiles, exercises, devices, config] = await Promise.all([
    listTemplates(locale).catch(() => []),
    listExercises(undefined, locale),
    listDevices(undefined, locale),
    readAppConfig(),
  ]);
  const templates = templateFiles.flatMap((file) =>
    file.template ? [{ id: file.template.id, name: file.template.name, blocks: file.template.blocks }] : [],
  );
  // Danışanın kısıtları (tasarım `kisit-tarama.md` §3.2): sheet'te işaret; onay yoksa yalnız durum.
  const care = await loadEditorCare(loaded.client, exercises, todayIn(config.timeZone), { locale });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <EditorBackLink href={`/dashboard/clients/${id}/program`} label={t.backLabel} />
        <SectionHeader
          title={t.title}
          description={t.description}
        />
      </div>
      <ProgramForm
        clientId={id}
        mode="create"
        // Kimlikler sunucuda üretilir: sunucu ve tarayıcı çizimi aynı olsun.
        initial={blankProgramBody(programIdSource([]), locale)}
        base={null}
        stored={null}
        templates={templates}
        exercises={pickerExercises(exercises)}
        devices={pickerDevices(devices)}
        now={new Date().toISOString()}
        timeZone={config.timeZone}
        care={care}
      />
    </div>
  );
}
