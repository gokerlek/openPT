import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDayShort } from '@/lib/format';
import { weekdayNamesText } from '@/lib/training-days';
import { templateSummary, type PlanExercise, type TemplateBlock } from '@/lib/template-plan';
import { ClientDayPlan } from '../../client-day-plan';

type Day = { id: string; name: string; weekdays?: readonly number[] | undefined; blocks: readonly TemplateBlock[] };

/**
 * Programın antrenmanları, salt okuma (`docs/design/kendi-program.md` §2.2, §2.3; Faz 3): her program bir kart,
 * başlıkta atandığı hafta günleri, bugüne atanmışsa "bugün" ve "son: 22 Eyl" ("Salı · bugün · son: 21 Eki"); dönüş
 * yok, "sıradaki" de yok. Setler danışanın dilinde (`ClientDayPlan`). `action` programın altına (PT programında
 * "Kendi programına kopyala"). Kütüphanede olmayan hareket çizilmez (Bugün'deki gibi).
 */
export function ProgramDays({
  days,
  exercises,
  todayId,
  lastByDay,
  action,
}: {
  days: readonly Day[];
  exercises: ReadonlyMap<string, PlanExercise>;
  /** Bugüne atanmış program (`todayAssigned`); öteki evrelerde null. */
  todayId: string | null;
  lastByDay: ReadonlyMap<string, string>;
  action?: (day: Day) => React.ReactNode;
}) {
  return (
    <ul className="flex flex-col gap-3">
      {days.map((day) => {
        const summary = templateSummary({ blocks: day.blocks }, exercises);
        const last = lastByDay.get(day.id);
        const status = [weekdayNamesText(day.weekdays ?? []) || null, day.id === todayId ? 'bugün' : null, last ? `son: ${formatDayShort(last)}` : null]
          .filter(Boolean)
          .join(' · ');
        return (
          <li key={day.id}>
            <Card size="sm">
              <CardHeader>
                <CardTitle className="break-words">
                  {day.name}
                  {status ? <span className="font-normal text-muted-foreground"> · {status}</span> : null}
                </CardTitle>
                <CardDescription className="tabular-nums">
                  {summary.rows} hareket · {summary.workingSets} set · ≈ {summary.minutes} dk
                </CardDescription>
              </CardHeader>
              <CardContent>
                {summary.rows > 0 ? (
                  <ClientDayPlan blocks={day.blocks} exercises={exercises} />
                ) : (
                  <p className="text-sm text-muted-foreground">Bu programda hareket yok.</p>
                )}
              </CardContent>
              {action ? <CardFooter>{action(day)}</CardFooter> : null}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
