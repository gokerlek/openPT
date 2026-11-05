import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { listAttachments } from '@/lib/attachments';
import { listDevices } from '@/lib/devices';
import { ExerciseForm } from '../exercise-form';
import { requirePt } from '@/lib/guards';
import { getMessages } from '@/i18n/server';
import { ptLibraryMessages } from '@/i18n/messages/pt-library';

export async function generateMetadata(): Promise<Metadata> {
  const t = (await getMessages(ptLibraryMessages)).exerciseNew;
  return { title: t.title };
}

export default async function NewExercisePage() {
  const t = (await getMessages(ptLibraryMessages)).exerciseNew;
  await requirePt();
  const [devices, attachments] = await Promise.all([listDevices(), listAttachments()]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[{ label: t.crumbList, href: '/dashboard/exercises' }, { label: t.title }]}
        title={t.title}
        description={t.description}
      />
      <ExerciseForm editing={null} devices={devices} attachments={attachments} />
    </div>
  );
}
