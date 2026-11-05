import type { Metadata } from 'next';
import Link from 'next/link';
import { ClipboardText } from '@phosphor-icons/react/dist/ssr';
import { Plus } from '@/components/line-icons';
import { MuscleMap } from '@/components/muscle-map/muscle-map';
import { loadMapProps } from '@/lib/muscle-tiers';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { listExercises } from '@/lib/exercises';
import { requirePt } from '@/lib/guards';
import { BODY_MUSCLES, exerciseSetWeights, summarizeMuscles } from '@/lib/muscles';
import { templateMuscleLoad, templateSummary } from '@/lib/template-plan';
import { listTemplates } from '@/lib/templates';
import { TrainingTabs } from '../training-tabs';
import { getLocale, getMessages } from '@/i18n/server';
import { ptLibraryMessages } from '@/i18n/messages/pt-library';

export async function generateMetadata(): Promise<Metadata> {
  const t = (await getMessages(ptLibraryMessages)).templatesPage;
  return { title: t.title };
}

/**
 * Şablonlar: danışana program kurarken başlangıç olan antrenmanlar (programa kopyalanır). Kartta şablonun kas haritası, adı ve
 * özeti; ayrıntı ve düzenleme kendi sayfalarında (SPEC §6).
 */
export default async function TemplatesPage() {
  await requirePt();
  const locale = await getLocale();
  const t = ptLibraryMessages(locale).templatesPage;
  const [templates, exercises] = await Promise.all([listTemplates(locale), listExercises(undefined, locale)]);
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));

  return (
    <div className="flex flex-col gap-6">
      <TrainingTabs />
      <PageHeader
        title={t.title}
        description={
          <span className="tabular-nums">{t.count(templates.length)}</span>
        }
        actions={
          <Button nativeButton={false} render={<Link href="/dashboard/templates/new" />}>
            <Plus data-icon="inline-start" />
            {t.add}
          </Button>
        }
      />

      {templates.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ClipboardText weight="fill" />
            </EmptyMedia>
            <EmptyTitle>{t.emptyTitle}</EmptyTitle>
            <EmptyDescription>
              {t.emptyDescription}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button nativeButton={false} render={<Link href="/dashboard/templates/new" />}>
              <Plus data-icon="inline-start" />
              {t.createFirst}
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((file) => {
            if (!file.template) {
              return (
                <li key={file.id}>
                  <Link
                    href={`/dashboard/templates/${file.id}/edit`}
                    className="block h-full rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                    <Card size="sm" className="h-full bg-destructive/5 ring-destructive/40 transition-colors hover:bg-destructive/10">
                      <CardHeader>
                        <CardTitle>{file.name ?? file.id}</CardTitle>
                        <CardDescription className="break-words">{t.unreadable(file.problem)}</CardDescription>
                      </CardHeader>
                    </Card>
                  </Link>
                </li>
              );
            }

            const template = file.template;
            const { load, missingRowIds } = templateMuscleLoad(template, byId, exerciseSetWeights);
            const summary = templateSummary(template, byId);
            const top = BODY_MUSCLES.filter((muscle) => (load[muscle] ?? 0) > 0)
              .sort((a, b) => (load[b] ?? 0) - (load[a] ?? 0))
              .slice(0, 3);
            return (
              <li key={template.id}>
                {/* Uzatılmış bağlantı: başlıktaki bağlantı kartın tamamını kaplar (after:inset-0). */}
                <Card size="sm" className="relative h-full transition-colors hover:bg-muted/40">
                  <div className="mx-(--card-spacing) rounded-lg bg-muted/40 py-3">
                    <MuscleMap layout="split" bodyClassName="h-80" {...loadMapProps(load, 'session', t.loadLabel, { legend: false }, locale)} />
                  </div>
                  <CardHeader>
                    <CardTitle>
                      <Link
                        href={`/dashboard/templates/${template.id}`}
                        className="outline-none after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:after:ring-3 focus-visible:after:ring-ring/50">
                        {template.name}
                      </Link>
                    </CardTitle>
                    <CardDescription className="line-clamp-2">
                      {template.description || summarizeMuscles(top, locale).join(', ') || t.noLoad}
                    </CardDescription>
                    {missingRowIds.length > 0 || template.sharedWithClients ? (
                      <CardAction className="flex flex-col items-end gap-1">
                        {missingRowIds.length > 0 ? <Badge variant="destructive">{t.missing}</Badge> : null}
                        {/* Danışanlar kendi programlarına kopyalayabilir (kendi-program.md §3.8). */}
                        {template.sharedWithClients ? <Badge variant="secondary">{t.shared}</Badge> : null}
                      </CardAction>
                    ) : null}
                  </CardHeader>
                  <CardFooter className="mt-auto text-xs text-muted-foreground tabular-nums">{t.footer(summary.rows, summary.workingSets, summary.minutes)}
                  </CardFooter>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
