import { plural, type Shape } from '../../define.ts';
import type tr from './tr.ts';

const weeksText = (n: number) => `${n} ${plural('en', n, { one: 'week', other: 'weeks' })}`;
const daysText = (n: number) => `${n} ${plural('en', n, { one: 'day', other: 'days' })}`;

const en: Shape<typeof tr> = {
  metrics: {
    top: { label: 'Heaviest set', short: 'Heaviest', unit: 'kg' },
    e1rm: { label: 'Estimated max', short: 'Max', unit: 'kg' },
    volume: { label: 'Total weight', short: 'Total', unit: 'kg' },
    reps: { label: 'Most reps', short: 'Most', unit: 'reps' },
    total_reps: { label: 'Total reps', short: 'Total', unit: 'reps' },
    seconds: { label: 'Longest set', short: 'Longest', unit: 's' },
    total_seconds: { label: 'Total time', short: 'Total', unit: 's' },
  },
  duration: (minutes, seconds, parts) =>
    parts === 'seconds' ? `${seconds} s` : parts === 'minutes' ? `${minutes} min` : `${minutes} min ${seconds} s`,
  trend: {
    tooFewPoints: 'A forecast needs at least 4 workouts.',
    tooShortSpan: 'A forecast needs records spread over at least 3 weeks.',
    stale: (days) => `Last record ${daysText(days)} ago; the forecast updates with the next workout.`,
    slope: (slope) => `Trend: ${slope} a week.`,
    range: (low, high) => `; likely range ${low}–${high}`,
    forecast: (trend, weeks, date, value, range) =>
      `${trend} At this rate, in ${weeksText(weeks)} (${date}) ≈ ${value}${range}. The forecast assumes the trend continues.`,
  },
  highRepDays: (count, max, pt) => {
    const days = count === 1 ? 'On the last workout day' : `On the last ${count} workout days`;
    const where = pt
      ? 'Weight shows under “Heaviest” and strength gains under Strength.'
      : 'Your weight shows under “Heaviest” and your strength gains under Strength.';
    return `${days}, every set was over ${max} reps, so the estimated max isn't calculated for ${count === 1 ? 'that day' : 'those days'}. ${where}`;
  },
  e1rmNote: (max, pt) => {
    const lead = pt
      ? "An estimate of the heaviest weight they could lift for one rep. It's not a target to hit; it shows the trend."
      : "An estimate of the heaviest weight you could lift for one rep. It's not a target to hit; it shows the trend.";
    return `${lead} Calculated with the Epley formula: weight × (1 + reps ÷ 30). Only sets of 1–${max} reps count: the estimate drifts as reps go up, so sets with fewer reps are the most accurate.`;
  },
  records: {
    heaviest: 'Heaviest set',
    heaviestAdded: 'Heaviest added weight',
    e1rm: 'Estimated max',
    repsAtWeight: 'Most reps at the same weight',
    mostReps: 'Most reps',
    longest: 'Longest time',
    reps: (reps) => `${reps} ${plural('en', Number(reps), { one: 'rep', other: 'reps' })}`,
    previousEstimate: (value) => `previous ≈ ${value}`,
    previousBest: (value) => `previous best ${value}`,
  },
  achievements: {
    titles: {
      first_workout: 'First workout',
      workouts_10: '10 workouts',
      workouts_25: '25 workouts',
      workouts_50: '50 workouts',
      streak_4: '4 weeks in a row',
      streak_12: '12 weeks in a row',
      first_record: 'First PR',
    },
    firstWorkout: (pt) => (pt ? 'When they finish their first workout.' : 'Finish your first workout.'),
    firstRecord: (pt) => (pt ? 'When they beat their best on an exercise.' : 'Beat your best on an exercise.'),
    streak: (weeklyTarget, current, target) => `At least ${daysText(weeklyTarget)} of workouts every week · ${current}/${target} weeks`,
    workouts: (current, target) => `${current}/${target} workouts`,
  },
  streak: {
    week: (done, target) => `This week ${done}/${target} days`,
    bestStreak: (best) => ` · longest streak ${weeksText(best)}`,
    best: (best) => ` · longest ${weeksText(best)}`,
    current: (current, best, week) => `${weeksText(current)} in a row${best} · ${week.charAt(0).toLowerCase()}${week.slice(1)}`,
  },
  strengthStatus: {
    improved: 'Improved',
    stable: 'Stable',
    declined: 'Declined',
    insufficient: 'Not enough data',
  },
  strength: {
    shortSpan: (weeks, days) => `Records need to span at least ${weeksText(weeks)}; in this period they cover ${daysText(days)}.`,
    fewPoints: (points, count) => `A verdict needs at least ${points} workout days in this period; so far ${count}.`,
    detail: (start, end, pct, range) => `≈ ${start} → ${end}${pct} · likely change ${range}`,
    methodFirst: (max, pt) =>
      pt
        ? `For each exercise, the best of the workout days in the selected period is used: estimated max for weighted exercises, most reps for bodyweight ones, longest set for timed ones. Days where every set was over ${max} reps count too: that day's estimated max comes from the heaviest set.`
        : `For each exercise, the best of your workout days in the period you picked is used: estimated max for weighted exercises, most reps for bodyweight ones, longest set for timed ones. Days where you did every set for more than ${max} reps count too: that day's estimated max comes from your heaviest set.`,
    methodRest: (points, weeks) => [
      "A trend line that one bad day can't throw off (Theil–Sen) is drawn through these values. If the likely range of the line's change (≈80%) is entirely positive, it reads “improved”; entirely negative, “declined”; if it includes zero, “stable”.",
      `A verdict needs at least ${points} workout days and ${weeksText(weeks)} in the period.`,
      "A muscle is scored from the exercises that work it: as a primary muscle it counts fully, as a secondary muscle half, as a stabilizer a quarter. Exercises where it only works as a stabilizer don't decide its verdict.",
      "This is strength progress: on its own it doesn't show muscle growth, since skill and the nervous system also make you stronger.",
    ],
  },
  circumference: {
    left: 'left',
    right: 'right',
    label: (label, side) => `${label}${side ? `, ${side}` : ''}`,
    noise: ' · within measurement error',
  },
  adherence: (weeks, done, planned, pct) =>
    `${weeks === 1 ? 'Last week' : `In the last ${weeks} completed weeks`}: ${done}/${planned} days (${pct}%).`,
  windows: {
    '4h': { label: '4 weeks', period: 'Last 4 weeks', periodIn: 'In the last 4 weeks' },
    '8h': { label: '8 weeks', period: 'Last 8 weeks', periodIn: 'In the last 8 weeks' },
    '12h': { label: '12 weeks', period: 'Last 12 weeks', periodIn: 'In the last 12 weeks' },
    tumu: { label: 'All', period: 'All records', periodIn: 'Across all records' },
  },
  ranges: {
    '4h': 'Last 4 weeks',
    '3a': 'Last 3 months',
    '6a': 'Last 6 months',
    '1y': 'Last year',
    tumu: 'All',
  },
  stage: (stage, week) => `${stage} · week ${week}`,
  loadError: "Your progress can't be opened right now. Try again in a bit; if it keeps happening, let your trainer know.",
  history: {
    ownProgram: 'Own program',
    lastDays: (days) => `Last ${days} days`,
    workouts: (count, n) => `${count} ${plural('en', n, { one: 'workout', other: 'workouts' })}`,
    records: (count, n) => `${count} ${plural('en', n, { one: 'PR', other: 'PRs' })}`,
    sets: (count, n) => `${count} ${plural('en', n, { one: 'set', other: 'sets' })}`,
    setsOf: (done, planned, n) => `${done}/${planned} ${plural('en', n, { one: 'set', other: 'sets' })}`,
    skipped: 'skipped',
    skippedFor: (reason) => `skipped · ${reason}`,
    oneOff: 'one-off',
    lighter: 'lighter',
    warmup: 'Warm-up',
    effort: (value) => `Effort ${value}/10`,
    subject: (title, sets, n) => `${title} · ${sets} ${plural('en', n, { one: 'set', other: 'sets' })} and its summary`,
    deleteBody: "It's removed from the app and can't be restored. It stays in the history of your trainer's data repository.",
    deleteDetail:
      'It stays in older versions of the repository and in commit notes. The change log in your program (e.g. "Bench Press 60 → 65 kg") isn\'t deleted. Your PRs and suggestions are recalculated from the remaining records. To have it fully deleted, message your trainer.',
    deleteSession: 'Delete this workout?',
    deleteEntry: 'Delete this exercise?',
    deleteSet: 'Delete this set?',
    set: (label) => `Set ${label}`,
  },
  client: 'The client',
  copy: (pt, who, minPoints, minWeeks) => ({
    emptyTitle: pt ? 'No finished workouts yet' : 'Your progress will show up here',
    emptyText: pt
      ? `Once ${who} finishes their first workout, each exercise's weight chart, how much each muscle worked, PRs and achievements start building up here.`
      : 'Once you finish your first workout, a chart of the weight you lift for each exercise, how much you work each muscle, your PRs and your achievements start building up here.',
    firstWorkout: (day) => (pt ? `First workout ${day}` : `Your first workout ${day}`),

    strengthIntro: pt
      ? `Where ${who} got stronger: the trend of the best sets in their exercises.`
      : 'Where you got stronger: the trend of the best sets in your exercises.',
    strengthNoData: (periodIn) =>
      `${periodIn} there isn't enough data for a verdict. An exercise needs at least ${minPoints} workout days and ${weeksText(minWeeks)} in the period; ${pt ? 'pick a longer period.' : 'pick a longer period or keep training.'}`,
    strengthHint: pt ? 'Pick a muscle: its exercises and charts' : 'Tap a muscle: its exercises and charts',
    strengthFootnote: `This is strength progress; on its own it doesn't show muscle growth. ${pt ? 'Pick a muscle' : 'Tap a muscle'} to see its exercises, charts and how it's calculated.`,
    measurementsUnavailable: pt ? "Measurements can't be loaded right now." : "Your measurements can't be loaded right now.",

    exerciseIntro: pt ? 'Pick an exercise: the trend of weight, reps and PRs.' : 'Pick an exercise: the trend of your weight, reps and PRs.',
    stageNote: pt ? 'their experience with this exercise' : 'your experience with this exercise',
    bestTitle: pt ? 'Their bests' : 'Your bests',
    recordSessions: (count, countText) =>
      `${pt ? 'Set a PR in' : 'You set a PR in'} ${countText} ${plural('en', count, { one: 'workout', other: 'workouts' })}`,
    pickerDescription: pt ? 'Exercises done, most recent first.' : 'Exercises you did, most recent first.',
    pickerList: pt ? 'Exercises done' : 'Exercises you did',

    unavailable: (what) =>
      `${what} can't be loaded right now. ${pt ? 'Refresh the page in a bit.' : 'Try again in a bit; if it keeps happening, let your trainer know.'}`,
    weeklyLoadIntro: pt
      ? 'Total weight lifted or working sets done per week; warm-up sets excluded.'
      : 'Total weight you lifted or working sets you did per week; warm-up sets excluded.',
    workingSetsNote: `Working sets: every set ${pt ? 'done' : 'you did'} except warm-ups (extra sets included).`,
    adherenceIntro: pt ? 'How many days a week they trained, and the plan.' : 'How many days a week you trained, and your plan.',
    adherenceNoPlan: pt
      ? 'The program has no days per week, so only the days trained are shown.'
      : 'Your program has no days per week, so only the days you trained are shown.',
    adherencePlanNote: `The plan is ${pt ? "today's plan" : 'your plan as of today'} and is applied to past weeks too. Two workouts on the same day count as one day.`,
    adherenceWeeksNote: `This week is still in progress; ${pt ? 'the first week' : 'your first week'} (the start) isn't included in the summary.`,
    readinessWhat: pt ? 'Readiness answers' : 'Your readiness answers',
    readinessFirst: (score) => `${pt ? 'first score' : 'your first score'} ${score}`,
    painIntro: `0 is no pain, 10 is unbearable. Before a workout: ${pt ? 'pain' : 'your pain'} over the last 24 hours; during a workout: ${pt ? 'the highest pain' : 'your highest pain'}.`,
    painWhat: pt ? 'Pain answers' : 'Your pain answers',
    painFootnote: pt
      ? `If the pain is rising or not going away, talk it over with ${who} and adjust the program to match.`
      : "If your pain is rising or isn't going away, tell your trainer.",
    effortEmpty: `${pt ? `As ${who} answers` : 'As you answer'} “How did it go?” after workouts, the answers build up here; the chart appears after two answers.`,
    waterIntro: pt
      ? 'Glasses of water per day over the last 30 days: the glasses on the Today screen plus those logged during workouts.'
      : 'Glasses you drank per day over the last 30 days: the glasses on Today plus those from your workouts.',
    waterWhat: pt ? 'Water log' : 'Your water log',
    waterEmpty: pt
      ? `As ${who} adds glasses with the water button on the Today screen or during workouts, they build up here day by day.`
      : 'Glasses you add with the water button on the Today screen or during workouts build up here day by day.',
    waterDays: (days, daysText) => `Average over the ${daysText} ${plural('en', days, { one: 'day', other: 'days' })} ${pt ? 'with water logged' : 'you logged water'}`,
    musclesIntro: pt ? 'How many sets each muscle worked per week.' : 'How many sets you worked each muscle per week.',
    musclesHint: pt ? 'Pick a muscle: set count' : 'Tap a muscle: set count',

    recordsIntro: pt ? 'Workouts where they beat their best on an exercise.' : 'Workouts where you beat your best on an exercise.',
    recordsEmpty: pt
      ? `No PRs yet. They show up here when ${who} lifts heavier on an exercise or does more reps at the same weight.`
      : 'No PRs yet. They show up here when you lift heavier on an exercise or do more reps at the same weight.',
  }),
};

export default en;
