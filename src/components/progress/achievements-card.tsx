'use client';

import { Barbell, Fire, FlagCheckered, Trophy } from '@phosphor-icons/react/dist/ssr';
import { useLocale } from '@/i18n/client';
import { clientProgressMessages } from '@/i18n/messages/client-progress';
import type { Achievement, AchievementId, Streak } from '@/lib/progress';
import { achievementDetail, achievementTitles, streakText, type ProgressViewer } from '@/lib/progress-text';
import { cn } from '@/lib/utils';
import { ProgressCard } from './progress-card';

const ICONS: Record<AchievementId, typeof Trophy> = {
  first_workout: FlagCheckered,
  workouts_10: Barbell,
  workouts_25: Barbell,
  workouts_50: Barbell,
  streak_4: Fire,
  streak_12: Fire,
  first_record: Trophy,
};

/**
 * Başarılar (tasarım §0): az ve anlamlı — ilk antrenman; 10, 25, 50 antrenman; 4 ve 12 hafta üst üste
 * haftalık hedef; ilk rekor. Kazanılan dolu ikon ve günüyle, kazanılmayan soluk ve ilerlemesiyle
 * (durum renkle değil metinle de yazılır). Üstte haftalık seri. Danışan ve PT aynı kartı kullanır
 * (`viewer`); kart genişse (PT masaüstü, kap sorgusu) dört sütun.
 */
export function AchievementsCard({ viewer, achievements, streak }: { viewer: ProgressViewer; achievements: Achievement[]; streak: Streak }) {
  const locale = useLocale();
  const t = clientProgressMessages(locale).cards;
  const titles = achievementTitles(locale);
  const earned = achievements.filter((item) => item.achievedOn).length;
  return (
    <ProgressCard
      viewer={viewer}
      title={t.achievements}
      description={t.achievementsSummary(streakText(streak, locale), earned, achievements.length)}
      contentClassName="@container">
      <ul className="grid grid-cols-2 gap-2 @2xl:grid-cols-4">
        {achievements.map((item) => {
          const Icon = ICONS[item.id];
          const done = Boolean(item.achievedOn);
          return (
            <li
              key={item.id}
              className={cn('flex min-h-20 flex-col gap-1.5 rounded-lg border p-3', done ? 'border-primary-strong/40 bg-primary-strong/5' : 'border-dashed')}>
              <span className="flex items-center gap-2">
                <Icon weight={done ? 'fill' : 'regular'} className={cn('size-5 shrink-0', done ? 'text-primary-text' : 'text-muted-foreground')} aria-hidden />
                <span className={cn('text-sm leading-tight font-medium', !done && 'text-muted-foreground')}>{titles[item.id]}</span>
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                <span className="sr-only">{done ? t.earned : t.notYet}</span>
                {achievementDetail(item, streak.target, viewer, locale)}
              </span>
              {!done && item.current > 0 && item.target > 1 ? (
                <span className="mt-auto h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
                  <span className="block h-full rounded-full bg-primary-strong" style={{ width: `${Math.round((item.current / item.target) * 100)}%` }} />
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </ProgressCard>
  );
}
