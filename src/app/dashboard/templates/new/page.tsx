import type { Metadata } from 'next';
import { EditorBackLink } from '@/components/block-editor/editor-back-link';
import { PageHeader } from '@/components/page-header';
import { USER_MENU_GUTTER } from '@/components/user-menu-spot';
import { readAppConfig } from '@/lib/config';
import { listDevices } from '@/lib/devices';
import { listExercises } from '@/lib/exercises';
import { requirePt } from '@/lib/guards';
import { pickerDevices, pickerExercises } from '@/lib/templates';
import { TemplateForm } from '../template-form';
import { getLocale, getMessages } from '@/i18n/server';
import { ptLibraryMessages } from '@/i18n/messages/pt-library';

export async function generateMetadata(): Promise<Metadata> {
  const t = (await getMessages(ptLibraryMessages)).templateNew;
  return { title: t.title };
}

/** Şablon oluşturma: düzenleme sayfasıyla aynı desen ("‹ Şablonlar", Kaydet "Hareketler" başlığında). */
export default async function NewTemplatePage() {
  const locale = await getLocale();
  const t = ptLibraryMessages(locale).templateNew;
  await requirePt();
  const [exercises, devices, config] = await Promise.all([listExercises(undefined, locale), listDevices(undefined, locale), readAppConfig()]);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <EditorBackLink href="/dashboard/templates" label={t.crumbList} className={USER_MENU_GUTTER} />
        <PageHeader
          title={t.title}
          description={t.description}
        />
      </div>
      <TemplateForm editing={null} exercises={pickerExercises(exercises)} devices={pickerDevices(devices)} timeZone={config.timeZone} />
    </div>
  );
}
