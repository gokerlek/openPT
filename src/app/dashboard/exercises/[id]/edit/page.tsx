import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { listAttachments } from '@/lib/attachments';
import { listDevices } from '@/lib/devices';
import { getExercise, listExercises, readCustomExercises } from '@/lib/exercises';
import { exerciseAlternatives, summarizeMuscles } from '@/lib/muscles';
import { equipmentLabels } from '@/lib/schemas/exercise';
import { ExerciseActions } from '../exercise-actions';
import { ExerciseForm } from '../../exercise-form';
import { TOUCH_TARGETS } from '../../touch-targets';
import { requirePt } from '@/lib/guards';
import { getLocale } from '@/i18n/server';
import type { Locale } from '@/i18n/locale';
import { ptLibraryMessages } from '@/i18n/messages/pt-library';
import { commonMessages } from '@/i18n/messages/common';

/*
 * HAM: düzenlenen kayıt dil verilmeden okunur (`listExercises(custom)`). Hazır egzersizin formu okuyanın dilindeki çeviriyle
 * dolarsa kaydedince İngilizce metin PT'nin geçersiz kılmasına (override) donardı; form ham (Türkçe) kayıtla dolar.
 * Başlık, kırıntı ve muadil adı gibi yalnız gösterilen yerler okuyanın dilindeki listeden (`loadShown`).
 * Başlık (`generateMetadata`) ve sayfa aynı isteği paylaşır: PT dosyası ve listeler bir kez okunur.
 */
const loadCustom = cache(() => readCustomExercises());
const loadRaw = cache(async () => listExercises(await loadCustom()));
const loadShown = cache(async (locale: Locale) => listExercises(await loadCustom(), locale));
const loadExercise = cache(async (id: string) => getExercise(id, await loadRaw()));
const loadShownExercise = cache(async (id: string, locale: Locale) => getExercise(id, await loadShown(locale), locale));

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const locale = await getLocale();
  const t = ptLibraryMessages(locale).exerciseEdit;
  await requirePt();
  const exercise = await loadShownExercise((await params).id, locale);
  return { title: exercise ? t.metaTitle(exercise.title) : t.notFound };
}

export default async function EditExercisePage({ params }: { params: Promise<{ id: string }> }) {
  const locale = await getLocale();
  const t = ptLibraryMessages(locale).exerciseEdit;
  const common = commonMessages(locale);
  const equipment = equipmentLabels(locale);
  await requirePt();
  const { id } = await params;
  const [all, devices, attachments] = await Promise.all([loadShown(locale), listDevices(undefined, locale), listAttachments(undefined, locale)]);
  const exercise = await loadExercise(id);
  if (!exercise) notFound();
  const shownTitle = all.find((item) => item.id === id)?.title ?? exercise.title;

  const { source: _source, overridesLibrary: _override, ...editable } = exercise;
  // Sabitlenebilecek muadiller detaydakiyle aynı sırada gelir (önerinin sırası).
  const deviceById = new Map(devices.map((device) => [device.id, device]));
  // Detayda ilk 8 öneri görünür; burada seçim havuzu geniş tutulur.
  const alternativeOptions = exerciseAlternatives(exercise, all, 20).map(({ exercise: other }) => ({
    id: other.id,
    title: other.title,
    detail: [
      other.deviceId ? (deviceById.get(other.deviceId)?.name ?? equipment[other.equipment]) : equipment[other.equipment],
      summarizeMuscles(other.primaryMuscles, locale).join(', '),
    ].join(' · '),
  }));

  return (
    <div className={`flex flex-col gap-6 ${TOUCH_TARGETS}`}>
      <PageHeader
        crumbs={[
          { label: t.crumbList, href: '/dashboard/exercises' },
          { label: shownTitle, href: `/dashboard/exercises/${id}` },
          { label: common.actions.edit },
        ]}
        title={t.title}
        actions={
          <ExerciseActions
            id={id}
            title={shownTitle}
            source={exercise.source}
            overridesLibrary={exercise.overridesLibrary}
          />
        }
        description={
          exercise.source === 'library'
            ? t.libraryNote
            : undefined
        }
      />
      <ExerciseForm
            editing={editable}
            devices={devices}
            attachments={attachments}
            alternativeOptions={alternativeOptions}
      />
    </div>
  );
}
