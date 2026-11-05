import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { InstallHelper } from '@/components/install/install-helper';
import { PageHeader } from '@/components/page-header';
import { CaretRight } from '@phosphor-icons/react/dist/ssr';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { Locale } from '@/i18n/locale';
import { ptShellMessages } from '@/i18n/messages/pt-shell';
import { getLocale } from '@/i18n/server';
import { readAppConfig } from '@/lib/config';
import { getFormat } from '@/lib/format';
import { listExercises } from '@/lib/exercises';
import { listClientIds } from '@/lib/github/repos';
import { requirePt } from '@/lib/guards';
import { readLiveOverview } from '@/lib/live-store';
import { AttentionCard } from './attention-card';
import { clientOverviews } from './client-overviews';
import { LiveNow } from './live-now';
import { NoticesCard } from './notices-card';

export async function generateMetadata(): Promise<Metadata> {
  return { title: ptShellMessages(await getLocale()).home.title };
}

/**
 * Genel bakış: önce "Dikkat gerektirenler" (danışana göre gruplu; kaçan gün, ilerlemeyen hareket, evre, öneri,
 * ölçüm, davet; §2.11, §8 satır 12) ve danışanların bildirimleri (başka program, yarım antrenman, aşırı yük, program
 * değişikliği; §4.6), sonra küçük sayılar (her sayı kartı kendi listesine götürür) ve şu an antrenmanda olanlar
 * (canlı, tasarım §4.6). En sonda küçük "Panel uygulaması" kartı: panel uygulama olarak açılmamışsa ve "Şimdi değil"
 * denmemişse (Paket A; her zaman görünen hâli Ayarlar → Uygulama).
 */
export default async function DashboardPage() {
  await requirePt();
  const locale = await getLocale();
  const t = ptShellMessages(locale);
  const { number } = getFormat(locale);
  // Dikkat ve bildirimlerin danışan özetleri hemen başlar ama beklenmez (kartlar kendi akışında; React `cache` aynı
  // okumayı paylaştırır). Reddedilmez: okunamayan danışan sayılır (`client-overviews.ts`).
  void clientOverviews();
  const [exercises, clientIds, config] = await Promise.all([
    listExercises(undefined, locale),
    listClientIds().catch(() => [] as string[]),
    readAppConfig(),
  ]);
  const custom = exercises.filter((item) => item.source === 'custom').length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.home.title} description={t.home.description} />

      {/* Danışan başına özet önbellekten (iki kart ortak); önbellek boşken sayfanın geri kalanı beklemesin. */}
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Suspense fallback={<ListSkeleton title={t.attention.title} reading={t.home.loadingRecords} />}>
          <AttentionCard timeZone={config.timeZone} titles={new Map(exercises.map((exercise) => [exercise.id, exercise.title]))} />
        </Suspense>
        <Suspense fallback={<ListSkeleton title={t.notices.title} reading={t.home.loadingRecords} />}>
          <NoticesCard timeZone={config.timeZone} />
        </Suspense>
      </div>

      {/* Sayılar ikincil: telefonda iki küçük kart yan yana, canlı kart altta tam genişlikte. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <CountCard href="/dashboard/clients" label={t.home.clientsLabel} count={number(clientIds.length)} hint={t.home.clientsHint} />
        <CountCard
          href="/dashboard/exercises"
          label={t.home.exercisesLabel}
          count={number(exercises.length)}
          hint={t.home.exercisesHint(custom, number(custom))}
        />

        {/* Danışan başına bir koşullu okuma; sayfanın geri kalanı beklemesin. */}
        <div className="col-span-2 grid lg:col-span-1">
          <Suspense fallback={<LiveSkeleton title={t.live.title} />}>
            <LiveNowCard locale={locale} />
          </Suspense>
        </div>

        <InstallHelper variant="card" audience="pt" openPath="/dashboard" className="col-span-2 lg:col-span-1" />
      </div>
    </div>
  );
}

/** "Şu an antrenmanda": ilk değer sunucudan, sonra tarayıcı tazeler. */
async function LiveNowCard({ locale }: { locale: Locale }) {
  const now = new Date();
  const initial = await readLiveOverview(now, locale)
    .then((overview) => ({ ...overview, checkedAt: now.toISOString() }))
    .catch(() => null);
  return <LiveNow initial={initial} />;
}

function LiveSkeleton({ title }: { title: string }) {
  return (
    <Card size="sm" aria-busy="true">
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <Skeleton className="h-8 w-10" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-4 w-full" />
      </CardContent>
    </Card>
  );
}

function ListSkeleton({ title, reading }: { title: string; reading: string }) {
  return (
    <Card aria-busy="true">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{reading}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </CardContent>
    </Card>
  );
}

/** Tıklanınca listesine giden sayı kartı; bağlantı olduğu ok ve alt satırdan okunur. */
function CountCard({ href, label, count, hint }: { href: string; label: string; count: string; hint: string }) {
  return (
    <Link href={href} className="group/count rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <Card size="sm" className="h-full transition-colors group-hover/count:bg-muted/50">
        <CardHeader>
          <CardDescription>{label}</CardDescription>
          <CardTitle className="tabular-nums group-data-[size=sm]/card:text-2xl">{count}</CardTitle>
          <CardAction>
            <CaretRight
              weight="fill"
              aria-hidden
              className="size-4 text-muted-foreground transition-transform duration-160 group-hover/count:translate-x-0.5"
            />
          </CardAction>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">{hint}</CardContent>
      </Card>
    </Link>
  );
}
