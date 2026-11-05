import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { MuscleMap } from '@/components/muscle-map/muscle-map';
import { roleMapProps } from '@/lib/muscle-tiers';
import { isDeepMuscle } from '@/lib/deep-muscles';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Item, ItemContent, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { VideoEmbed } from '@/components/video-embed';
import { getExercise, listExercises } from '@/lib/exercises';
import { listAttachments } from '@/lib/attachments';
import { listDevices } from '@/lib/devices';
import { deviceKindLabels, DEVICE_KINDS, loadSpecFor } from '@/lib/device-loads';
import { describeGrip } from '@/lib/grips';
import { deviceSwapTarget } from '@/lib/alternatives';
import Link from 'next/link';
import { patternLabels } from '@/lib/alternatives';
import { getFormat } from '@/lib/format';
import { exerciseAlternatives, familyOf, summarizeMuscles } from '@/lib/muscles';
import { describeRule, progressionLabels, progressionOf } from '@/lib/progression';
import { categoryLabels, equipmentLabels } from '@/lib/schemas/exercise';
import { AlternativesCard, type AlternativeRow, type DeviceSwap } from './alternatives-card';
import { MedicalCard } from './medical-card';
import { TOUCH_TARGETS } from '../touch-targets';
import { EditButton } from '@/components/edit-button';
import { requirePt } from '@/lib/guards';
import { getLocale } from '@/i18n/server';
import type { Locale } from '@/i18n/locale';
import { catalogMessages } from '@/i18n/messages/catalog';
import { ptLibraryMessages } from '@/i18n/messages/pt-library';

// Başlık (`generateMetadata`) ve sayfa aynı isteği paylaşır: liste bir kez okunur.
const loadAll = cache((locale: Locale) => listExercises(undefined, locale));
const loadExercise = cache(async (id: string, locale: Locale) => getExercise(id, await loadAll(locale)));

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const locale = await getLocale();
  const t = ptLibraryMessages(locale).exercisePage;
  await requirePt();
  const exercise = await loadExercise((await params).id, locale);
  return { title: exercise?.title ?? t.notFound };
}

/** Egzersiz detayı — kendi sayfası (modal değil, SPEC §6). */
export default async function ExerciseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePt();
  const locale = await getLocale();
  const t = ptLibraryMessages(locale).exercisePage;
  const format = getFormat(locale);
  const patterns = patternLabels(locale);
  const { id } = await params;
  const [all, devices, pool] = await Promise.all([loadAll(locale), listDevices(undefined, locale), listAttachments(undefined, locale)]);
  const exercise = await loadExercise(id, locale);
  if (!exercise) notFound();
  const deviceById = new Map(devices.map((device) => [device.id, device]));
  const device = exercise.deviceId ? deviceById.get(exercise.deviceId) : undefined;
  const attachment = exercise.attachmentId ? pool.find((item) => item.id === exercise.attachmentId) : undefined;

  const alternatives: AlternativeRow[] = exerciseAlternatives(exercise, all).map(({ exercise: other, pinned, samePattern }) => ({
    id: other.id,
    title: other.title,
    equipment: other.equipment,
    // Grup: cihazı varsa cihazın adı ("Dambıl seti", "Chest press makinesi"), yoksa ekipman.
    device: other.deviceId ? (deviceById.get(other.deviceId)?.name ?? null) : null,
    muscles: summarizeMuscles(other.primaryMuscles, locale).join(', '),
    pattern: samePattern && other.pattern ? patterns[other.pattern] : null,
    pinned,
  }));

  const rule = progressionOf(exercise);
  // Cihaz değişirse hangi egzersiz yapılır: düzenleyicide satırın cihazı değişince de aynı karar
  // (`deviceSwapTarget`); aynı hareket o cihazda yapılıyorsa kendisi.
  const swaps: DeviceSwap[] = DEVICE_KINDS.flatMap((kind) =>
    devices
      .filter((item) => item.kind === kind && item.id !== exercise.deviceId)
      .map((item) => {
        const match = deviceSwapTarget(exercise, item, all, familyOf);
        return {
          deviceId: item.id,
          deviceName: item.name,
          kindLabel: deviceKindLabels(locale)[kind],
          exercise: match ? { id: match.id, title: match.title } : null,
        };
      }),
  );

  // Motorun kullandığı yük tanımı: bar ve plaka yüklemelide adım ve taban cihazdan (liste vermese de).
  const loadSpec = loadSpecFor(exercise, device);
  const summary: [string, React.ReactNode][] = [
    [t.rowPrimary, summarizeMuscles(exercise.primaryMuscles, locale).join(', ')],
    ...(exercise.secondaryMuscles.length > 0
      ? ([[t.rowSecondary, summarizeMuscles(exercise.secondaryMuscles, locale).join(', ')]] as [string, React.ReactNode][])
      : []),
    ...(exercise.stabilizerMuscles.length > 0
      ? ([[t.rowStabilizers, summarizeMuscles(exercise.stabilizerMuscles, locale).join(', ')]] as [string, React.ReactNode][])
      : []),
    [t.rowEquipmentType, equipmentLabels(locale)[exercise.equipment]],
    ...(device
      ? ([
          [
            t.rowDevice,
            <Link key="cihaz" href={`/dashboard/devices/${device.id}`} className="underline underline-offset-4 relative touch:before:absolute touch:before:top-1/2 touch:before:left-1/2 touch:before:h-full touch:before:min-h-11 touch:before:w-full touch:before:min-w-11 touch:before:-translate-x-1/2 touch:before:-translate-y-1/2">
              {device.name}
            </Link>,
          ],
        ] as [string, React.ReactNode][])
      : []),
    ...(attachment
      ? ([
          [
            t.rowAttachment,
            <Link key="aparat" href={`/dashboard/attachments/${attachment.id}`} className="underline underline-offset-4 relative touch:before:absolute touch:before:top-1/2 touch:before:left-1/2 touch:before:h-full touch:before:min-h-11 touch:before:w-full touch:before:min-w-11 touch:before:-translate-x-1/2 touch:before:-translate-y-1/2">
              {attachment.name}
            </Link>,
          ],
        ] as [string, React.ReactNode][])
      : []),
    ...(describeGrip(exercise.grip, exercise.gripWidth, locale)
      ? ([[t.rowGrip, describeGrip(exercise.grip, exercise.gripWidth, locale)]] as [string, React.ReactNode][])
      : []),
    ...(exercise.pattern ? ([[t.rowPattern, patterns[exercise.pattern]]] as [string, React.ReactNode][]) : []),
    [t.rowCategory, categoryLabels(locale)[exercise.category]],
    [t.rowTracking, ptLibraryMessages(locale).trackingTypes[exercise.trackingType]],
    ...(exercise.trackingType === 'weight_reps' && !loadSpec.loadsKg
      ? ([
          [
            t.rowLoadStep,
            `${format.kg(loadSpec.loadStepKg)} / ${format.kg(loadSpec.minLoadKg)}${
              loadSpec.maxLoadKg !== undefined ? t.maxSuffix(format.kg(loadSpec.maxLoadKg)) : ''
            }`,
          ],
        ] as [string, React.ReactNode][])
      : []),
    [
      t.rowProgression,
      `${progressionLabels(locale)[rule.scheme]} · ${rule.targetMin}–${rule.targetMax} ${exercise.trackingType === 'duration' ? catalogMessages(locale).time.secondsUnit : catalogMessages(locale).time.reps(rule.targetMax)}`,
    ],
  ];

  const origin =
    exercise.source === 'library' ? t.originLibrary : exercise.overridesLibrary ? t.originOverride : t.originCustom;

  return (
    <div className={`flex flex-col gap-6 ${TOUCH_TARGETS}`}>
      <PageHeader
        crumbs={[{ label: t.crumbList, href: '/dashboard/exercises' }, { label: exercise.title }]}
        title={exercise.title}
        description={exercise.description || undefined}
        actions={<EditButton href={`/dashboard/exercises/${exercise.id}/edit`} />}
      />

      {/* Solda hareketin kendisi (görsel), sağda bilgisi; ilişki listesi altta tam genişlikte. */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t.musclesTitle}</CardTitle>
              {exercise.primaryMuscles.includes('cardio') ? (
                <CardDescription>{t.cardioNote}</CardDescription>
              ) : null}
            </CardHeader>
            <CardContent>
              <MuscleMap
                layout="split"
                bodyClassName="h-72"
                {...roleMapProps(exercise, locale)}
                deep={{ selected: (exercise.activationTargets ?? []).filter(isDeepMuscle) }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t.videoTitle}</CardTitle>
              <CardDescription>
                {exercise.video ? t.videoHint : t.videoEmpty}
              </CardDescription>
            </CardHeader>
            {exercise.video ? (
              <CardContent>
                <VideoEmbed provider={exercise.video.provider} id={exercise.video.id} title={exercise.title} />
              </CardContent>
            ) : null}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t.summaryTitle}</CardTitle>
              <CardDescription>{origin}</CardDescription>
            </CardHeader>
            <CardContent className="text-sm">
              <Table>
                <TableBody>
                  {summary.map(([label, value]) => (
                    <TableRow key={label}>
                      <TableCell className="w-40 text-muted-foreground">{label}</TableCell>
                      <TableCell className="whitespace-normal tabular-nums">{value}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-3 text-muted-foreground">{describeRule(rule, loadSpecFor(exercise, device), locale)}</p>
            </CardContent>
          </Card>

          {exercise.cues.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>{t.cuesTitle}</CardTitle>
                <CardDescription>{t.cuesHint}</CardDescription>
              </CardHeader>
              <CardContent>
                <ItemGroup className="gap-2">
                  {exercise.cues.map((cue, index) => (
                    <Item key={cue} variant="muted" size="sm">
                      <ItemMedia variant="icon" className="tabular-nums text-muted-foreground">
                        {index + 1}
                      </ItemMedia>
                      <ItemContent>
                        <ItemTitle className="font-normal">{cue}</ItemTitle>
                      </ItemContent>
                    </Item>
                  ))}
                </ItemGroup>
              </CardContent>
            </Card>
          ) : null}

          <MedicalCard exercise={exercise} />
        </div>
      </div>

      <AlternativesCard exerciseId={exercise.id} rows={alternatives} swaps={swaps} />
    </div>
  );
}
