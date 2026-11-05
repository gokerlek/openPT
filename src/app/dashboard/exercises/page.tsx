import type { Metadata } from 'next';
import { loadEditorCare } from '@/lib/client-care';
import { loadClient } from '@/lib/clients';
import { readAppConfig } from '@/lib/config';
import { listDevices } from '@/lib/devices';
import { CUSTOM_EXERCISES_PATH, listExercises, readCustomExercises } from '@/lib/exercises';
import { todayIn } from '@/lib/format';
import { CLIENT_ID_PATTERN } from '@/lib/schemas/client';
import { ExerciseList } from './exercise-list';
import { UnreadableRecordsAlert } from '../unreadable-records-alert';
import { requirePt } from '@/lib/guards';
import { getLocale, getMessages } from '@/i18n/server';
import { ptLibraryMessages } from '@/i18n/messages/pt-library';

export async function generateMetadata(): Promise<Metadata> {
  const t = (await getMessages(ptLibraryMessages)).exercisesPage;
  return { title: t.title };
}

/**
 * Egzersiz kütüphanesi: hazır liste + PT'nin kendi egzersizleri. Kabuk yetkiyi zaten denetler.
 * `?client=c_…` (tasarım `kisit-tarama.md` §2.3): danışanın kayıtlı kısıtlarıyla önizleme; kısıtlar sunucuda,
 * yalnız o parçanın onayı sürdükçe okunur. Adreste sağlık verisi durmaz, yalnız danışan kimliği.
 */
export default async function ExercisesPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  await requirePt();
  const locale = await getLocale();
  const t = ptLibraryMessages(locale).exercisesPage;
  const { client: clientId } = await searchParams;
  const [file, devices, config] = await Promise.all([readCustomExercises(), listDevices(undefined, locale), readAppConfig()]);
  const exercises = await listExercises(file, locale);
  const deviceNames = Object.fromEntries(devices.map((device) => [device.id, device.name]));
  let clientCare: { name: string; care: NonNullable<Awaited<ReturnType<typeof loadEditorCare>>> } | null = null;
  if (clientId && CLIENT_ID_PATTERN.test(clientId)) {
    const loaded = await loadClient(clientId).catch(() => null);
    if (loaded?.ok) {
      const care = await loadEditorCare(loaded.client, exercises, todayIn(config.timeZone), { screening: false, locale });
      clientCare = {
        name: loaded.client.name,
        care: care ?? { clientId, unavailable: t.unavailable, summary: [], pending: [], map: {} },
      };
    }
  }
  return (
    <ExerciseList
      initial={exercises}
      deviceNames={deviceNames}
      clientCare={clientCare}
      notice={<UnreadableRecordsAlert count={file.invalid} path={CUSTOM_EXERCISES_PATH} />}
    />
  );
}
