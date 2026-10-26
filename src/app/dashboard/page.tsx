import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { CaretRight } from '@phosphor-icons/react/dist/ssr';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { readAppConfig } from '@/lib/config';
import { formatNumber } from '@/lib/format';
import { listExercises } from '@/lib/exercises';
import { listClientIds } from '@/lib/github/repos';
import { requirePt } from '@/lib/guards';
import { readLiveOverview } from '@/lib/live-store';
import { AttentionCard } from './attention-card';
import { LiveNow } from './live-now';
import { NoticesCard } from './notices-card';

export const metadata: Metadata = { title: 'Genel bakış' };

/**
 * Genel bakış: önce "Dikkat gerektirenler" (danışana göre gruplu; kaçan gün, ilerlemeyen hareket, evre, öneri,
 * ölçüm, davet; §2.11, §8 satır 12) ve danışanların bildirimleri (başka gün, yarım antrenman, aşırı yük, program
 * değişikliği; §4.6), sonra küçük sayılar (her sayı kartı kendi listesine götürür) ve şu an antrenmanda olanlar
 * (canlı, tasarım §4.6).
 */
export default async function DashboardPage() {
  await requirePt();
  const [exercises, clientIds, config] = await Promise.all([
    listExercises(),
    listClientIds().catch(() => [] as string[]),
    readAppConfig(),
  ]);
  const custom = exercises.filter((item) => item.source === 'custom').length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Genel bakış" description="Danışanların, şablonların ve egzersiz kütüphanen." />

      {/* Danışan başına özet önbellekten (iki kart ortak); önbellek boşken sayfanın geri kalanı beklemesin. */}
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Suspense fallback={<ListSkeleton title="Dikkat gerektirenler" />}>
          <AttentionCard timeZone={config.timeZone} titles={new Map(exercises.map((exercise) => [exercise.id, exercise.title]))} />
        </Suspense>
        <Suspense fallback={<ListSkeleton title="Bildirimler" />}>
          <NoticesCard timeZone={config.timeZone} />
        </Suspense>
      </div>

      {/* Sayılar ikincil: telefonda iki küçük kart yan yana, canlı kart altta tam genişlikte. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <CountCard href="/dashboard/clients" label="Danışan" count={clientIds.length} hint="Danışan listesini aç" />
        <CountCard
          href="/dashboard/exercises"
          label="Egzersiz"
          count={exercises.length}
          hint={`${formatNumber(custom)} tanesi senin · kütüphaneyi aç`}
        />

        {/* Danışan başına bir koşullu okuma; sayfanın geri kalanı beklemesin. */}
        <div className="col-span-2 grid lg:col-span-1">
          <Suspense fallback={<LiveSkeleton />}>
            <LiveNowCard />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

/** "Şu an antrenmanda": ilk değer sunucudan, sonra tarayıcı tazeler. */
async function LiveNowCard() {
  const now = new Date();
  const initial = await readLiveOverview(now)
    .then((overview) => ({ ...overview, checkedAt: now.toISOString() }))
    .catch(() => null);
  return <LiveNow initial={initial} />;
}

function LiveSkeleton() {
  return (
    <Card size="sm" aria-busy="true">
      <CardHeader>
        <CardDescription>Şu an antrenmanda</CardDescription>
        <Skeleton className="h-8 w-10" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-4 w-full" />
      </CardContent>
    </Card>
  );
}

function ListSkeleton({ title }: { title: string }) {
  return (
    <Card aria-busy="true">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Danışanların kayıtları okunuyor…</CardDescription>
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
function CountCard({ href, label, count, hint }: { href: string; label: string; count: number; hint: string }) {
  return (
    <Link href={href} className="group/count rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <Card size="sm" className="h-full transition-colors group-hover/count:bg-muted/50">
        <CardHeader>
          <CardDescription>{label}</CardDescription>
          <CardTitle className="tabular-nums group-data-[size=sm]/card:text-2xl">{formatNumber(count)}</CardTitle>
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
