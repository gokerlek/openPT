'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ArrowUpRight, CheckCircle, Bell } from '@phosphor-icons/react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { WaterGlass } from '@/components/water-glass';
import { useLocale, useMessages } from '@/i18n/client';
import { setupMessages } from '@/i18n/messages/setup';
import { getFormat } from '@/lib/format';

export function AppearancePreview({ appName }: { appName: string }) {
  const t = useMessages(setupMessages).preview;
  const { number } = getFormat(useLocale());
  const [water, setWater] = useState(3);
  return (
    <section aria-label={t.label} className="flex min-w-0 flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div><h2 className="font-semibold">{t.title}</h2><p className="mt-1 text-sm text-muted-foreground">{t.body}</p></div>
        <Badge variant="outline" className="shrink-0">{t.sample}</Badge>
      </div>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Avatar className="size-12 rounded-lg"><AvatarFallback className="rounded-lg bg-primary text-primary-foreground text-xl font-semibold">{(appName.trim() || 'P').charAt(0).toUpperCase()}</AvatarFallback></Avatar>
            <div className="min-w-0"><CardTitle className="truncate">{appName || t.fallbackName}</CardTitle><CardDescription className="mt-1">{t.tagline}</CardDescription></div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs text-muted-foreground">{t.nextWorkout}</p><p className="mt-1 text-lg font-semibold">{t.nextWorkoutName}</p><p className="mt-1 text-sm text-muted-foreground">{t.nextWorkoutMeta}</p></div><Badge>{t.ready}</Badge></div>
          <div className="flex flex-wrap gap-2"><Button type="button" onClick={() => toast.info(t.startToast.title, { description: t.startToast.description })}>{t.start} <ArrowUpRight /></Button><Button type="button" variant="outline" onClick={() => toast(t.historyToast.title, { description: t.historyToast.description })}>{t.history}</Button></div>
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card size="sm">
          <CardHeader><CardTitle>{t.thisWeek}</CardTitle><CardDescription>{t.thisWeekHint}</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p><span className="text-3xl font-semibold tabular-nums">3</span><span className="text-muted-foreground">{t.workoutsOf}</span></p>
            <Progress value={75} aria-label={t.weeklyProgress} />
            <p className="flex items-center gap-2 text-sm text-primary"><CheckCircle className="size-4" />{t.oneLeft}</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader><CardTitle>{t.newRecord}</CardTitle><CardDescription>{t.exercise}</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-3"><p className="text-3xl font-semibold tabular-nums">{number(62.5)} <span className="text-sm font-normal text-muted-foreground">{t.repsSuffix}</span></p><Badge className="w-fit"><ArrowUpRight /> {t.gain(number(2.5))}</Badge><p className="text-sm text-muted-foreground">{t.previousBest}</p></CardContent>
        </Card>
      </div>
      <Card size="sm">
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between"><p className="font-medium">{t.clientView}</p><Badge variant="secondary">{t.active}</Badge></div>
          <div className="flex items-center gap-3"><Avatar><AvatarFallback>{t.clientInitials}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><p className="font-medium">{t.clientName}</p><p className="text-sm text-muted-foreground">{t.lastWorkout}</p></div><span className="text-sm font-medium text-primary">{t.workoutCount}</span></div>
        </CardContent>
      </Card>
      <Card size="sm">
        <CardContent className="flex items-center gap-3">
          <WaterGlass count={water} />
          <div className="min-w-0 flex-1"><p className="text-sm text-muted-foreground">{t.water}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{water} <span className="text-sm font-normal text-muted-foreground">{t.glasses}</span></p></div>
          <Button type="button" variant="outline" className="h-11 border-sky-500/40 text-sky-700 hover:bg-sky-500/10 dark:text-sky-300" onClick={() => setWater((value) => value + 1)} aria-label={t.waterTry}>+1</Button>
        </CardContent>
      </Card>
      <Card size="sm">
        <CardHeader><CardTitle className="flex items-center gap-2"><Bell className="size-4 text-primary" />{t.notifications}</CardTitle><CardDescription>{t.notificationsHint}</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => toast.success(t.successToast.title, { description: t.successToast.description, id: 'theme-preview', action: { label: t.successToast.action, onClick: () => undefined } })}>{t.success}</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => toast.info(t.infoToast.title, { description: t.infoToast.description, id: 'theme-preview' })}>{t.info}</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => toast.error(t.errorToast.title, { description: t.errorToast.description, id: 'theme-preview' })}>{t.error}</Button>
        </CardContent>
      </Card>
    </section>
  );
}
