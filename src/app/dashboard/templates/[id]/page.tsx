import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { EditButton } from '@/components/edit-button';
import { MuscleMap } from '@/components/muscle-map/muscle-map';
import { loadDescription, loadMapProps } from '@/lib/muscle-tiers';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { readAppConfig } from '@/lib/config';
import { listDevices } from '@/lib/devices';
import { listExercises } from '@/lib/exercises';
import { getFormat } from '@/lib/format';
import { requirePt } from '@/lib/guards';
import { exerciseSetWeights } from '@/lib/muscles';
import { TEMPLATE_ID_PATTERN } from '@/lib/schemas/template';
import { templateMuscleLoad, templateSummary } from '@/lib/template-plan';
import { readTemplateFile } from '@/lib/templates';
import { InvalidTemplateAlert } from '../invalid-template-alert';
import { TemplateSequence } from '../template-sequence';
import { getLocale } from '@/i18n/server';
import type { Locale } from '@/i18n/locale';
import { ptLibraryMessages } from '@/i18n/messages/pt-library';

/** Sayfa ve başlığı (metadata) aynı isteğin tek okumasını paylaşır. */
const readTemplate = cache((id: string, locale: Locale) => readTemplateFile(id, locale));

/** Sekme başlığı: şablonun adı. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  await requirePt();
  const { id } = await params;
  if (!TEMPLATE_ID_PATTERN.test(id)) return {};
  const file = await readTemplate(id, await getLocale());
  return file ? { title: file.template?.name ?? file.name ?? id } : {};
}

/** Satır içi bağlantılar (cihazlar) dokunmatikte 44 px yüksekliğinde. */
const TOUCH_LINK = 'touch:inline-flex touch:min-h-11 touch:items-center';

/** Şablon detayı — yalnız gösterim; tek eylem "Düzenle" (SPEC §6). */
export default async function TemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePt();
  const locale = await getLocale();
  const t = ptLibraryMessages(locale).templateDetail;
  const format = getFormat(locale);
  const { id } = await params;
  if (!TEMPLATE_ID_PATTERN.test(id)) notFound();
  const [file, exercises, devices, config] = await Promise.all([readTemplate(id, locale), listExercises(undefined, locale), listDevices(undefined, locale), readAppConfig()]);
  if (!file) notFound();

  if (!file.template) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          crumbs={[{ label: t.crumbList, href: '/dashboard/templates' }, { label: file.name ?? file.id }]}
          title={file.name ?? file.id}
          description={t.unreadable}
          actions={<EditButton href={`/dashboard/templates/${id}/edit`} />}
        />
        <InvalidTemplateAlert id={id} problem={file.problem} />
      </div>
    );
  }

  const template = file.template;
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const deviceById = new Map(devices.map((device) => [device.id, device]));
  const { load } = templateMuscleLoad(template, byId, exerciseSetWeights);
  const summary = templateSummary(template, byId, new Set(deviceById.keys()));
  const counted = Object.values(load).some((value) => value > 0);

  const groupParts = [
    summary.groups.superset ? t.groupSuperset(summary.groups.superset) : null,
    summary.groups.circuit ? t.groupCircuit(summary.groups.circuit) : null,
    summary.groups.complex ? t.groupComplex(summary.groups.complex) : null,
  ].filter(Boolean);

  const rows: [string, React.ReactNode][] = [
    [t.rowExercises, `${format.number(summary.rows)}${groupParts.length ? ` (${groupParts.join(', ')})` : ''}`],
    [t.rowWorkingSets, format.number(summary.workingSets)],
    [t.rowEstimated, t.approxMinutes(format.number(summary.minutes))],
    [
      t.rowDevices,
      summary.deviceIds.length > 0 ? (
        <span className="flex flex-wrap gap-x-1">
          {summary.deviceIds.map((deviceId, index) => {
            const device = deviceById.get(deviceId);
            const comma = index < summary.deviceIds.length - 1 ? ',' : '';
            return device ? (
              <span key={deviceId}>
                <Link href={`/dashboard/devices/${device.id}`} className={`underline underline-offset-4 ${TOUCH_LINK}`}>
                  {device.name}
                </Link>
                {comma}
              </span>
            ) : (
              <span key={deviceId} className="text-muted-foreground">
                {t.deletedDevice(comma)}
              </span>
            );
          })}
        </span>
      ) : (
        <span className="text-muted-foreground">{t.noDevice}</span>
      ),
    ],
    [t.rowWarmup, t.warmupNote],
    [t.rowCreated, format.date(template.createdAt, config.timeZone)],
    [t.rowUpdated, format.date(template.updatedAt, config.timeZone)],
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[{ label: t.crumbList, href: '/dashboard/templates' }, { label: template.name }]}
        title={template.name}
        description={template.description || undefined}
        actions={<EditButton href={`/dashboard/templates/${template.id}/edit`} />}
      />

      {summary.missingRowIds.length > 0 ? (
        <Alert>
          <WarningCircle weight="fill" />
          <AlertTitle>{t.missingTitle(summary.missingRowIds.length)}</AlertTitle>
          <AlertDescription>
            {t.missingBody}
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Solda şablonun kas haritası, sağda özeti; hareketler altta tam genişlikte. */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t.loadTitle}</CardTitle>
            <CardDescription>{loadDescription(locale)}</CardDescription>
          </CardHeader>
          <CardContent>
            {counted ? (
              <MuscleMap layout="split" bodyClassName="h-72" {...loadMapProps(load, 'session', t.loadLabel, {}, locale)} />
            ) : (
              <p className="text-sm text-muted-foreground">{t.noLoad}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.summaryTitle}</CardTitle>
            <CardDescription>{t.summaryHint}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            <Table>
              <TableBody>
                {rows.map(([label, value]) => (
                  <TableRow key={label}>
                    <TableCell className="w-32 align-top text-muted-foreground">{label}</TableCell>
                    <TableCell className="whitespace-normal tabular-nums">{value}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.exercisesTitle}</CardTitle>
          <CardDescription>{t.exercisesHint}</CardDescription>
        </CardHeader>
        <CardContent>
          <TemplateSequence template={template} exercises={byId} devices={deviceById} locale={locale} />
        </CardContent>
      </Card>
    </div>
  );
}
