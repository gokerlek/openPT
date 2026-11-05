import { plural, type Shape } from '../../define.ts';
import type tr from './tr.ts';

const en: Shape<typeof tr> = {
  nav: {
    ariaLabel: 'Main menu',
    overview: 'Overview',
    overviewShort: 'Overview',
    clients: 'Clients',
    library: 'Library',
  },
  library: {
    ariaLabel: 'Library',
    templates: 'Templates',
    exercises: 'Exercises',
    devices: 'Equipment',
    attachments: 'Attachments',
  },
  userMenu: {
    ariaLabel: 'Account menu',
    role: (appName: string) => `${appName} · trainer`,
    coach: 'AI coach',
    settings: 'Settings',
    signOut: 'Sign out',
  },
  settings: {
    ariaLabel: 'Settings',
    appearance: {
      title: 'Appearance',
      description: 'The name, logo, color, corners and theme your clients see.',
    },
    app: {
      title: 'App',
      description: 'The dashboard and the client app install on a phone; the icon and name come from the Appearance settings.',
      clientAppTitle: 'Client app',
      clientAppBody: {
        before:
          "The client scans the invite QR code with their phone camera, sets a password and adds the app to their home screen by following the steps on screen. It's a separate icon from the dashboard; both can sit on the same phone. The steps are also on each client's ",
        link: 'invite screen',
        after: '.',
      },
    },
    updates: {
      title: 'Version',
      description: 'See the installed version, check for new versions and update your app.',
    },
  },
  home: {
    title: 'Overview',
    description: 'What to look at first: clients who need attention, and notifications.',
    clientsLabel: 'Clients',
    clientsHint: 'Open the client list',
    exercisesLabel: 'Exercises',
    exercisesHint: (count: number, custom: string) =>
      plural('en', count, { one: `${custom} is yours · open the library`, other: `${custom} are yours · open the library` }),
    loadingRecords: "Reading clients' records…",
  },
  skeleton: {
    loading: 'Loading page…',
  },
  unreadable: {
    title: (count: number) => ({
      before: plural('en', count, { one: `${count} record couldn't be read (`, other: `${count} records couldn't be read (` }),
      after: ')',
    }),
    description:
      "Records that don't match the schema, or that were written a second time under the same id, stay out of the list until they are fixed, and no new records can use those ids; they are kept in the file as they are. You can fix them on GitHub.",
  },
  attention: {
    title: 'Needs attention',
    clientsSr: (count: number) => plural('en', count, { one: ' client', other: ' clients' }),
    description: 'Most urgent client first; a red exclamation mark means a health safety item.',
    failedRecords: (count: number, n: string) =>
      plural('en', count, { one: `${n} client's record couldn't be read.`, other: `${n} clients' records couldn't be read.` }),
    emptyTitle: 'Nothing needs attention right now',
    emptyBody: 'It shows up here when a client misses a workout day, an exercise stalls or a decision is waiting.',
    urgent: 'Urgent',
    askAi: 'Ask AI',
    moreItems: (count: number, n: string) => plural('en', count, { one: `+${n} more item`, other: `+${n} more items` }),
    moreClients: (count: number, n: string) => plural('en', count, { one: `+${n} more client`, other: `+${n} more clients` }),
    labels: {
      constraint: 'Limitation',
      missed: 'Missed day',
      screening: 'Movement test',
      stalled: 'Progress',
      phase: 'Phase',
      proposals: 'Suggestion',
      measurement: 'Measurement',
      invite: 'Invite',
    },
    severity: { mild: 'mild', moderate: 'moderate', severe: 'severe' },
    invite: {
      none: "Not invited yet: no QR code generated",
      pending: (expires: string | null) => (expires ? `Invite not used · expires ${expires}` : 'Invite not used'),
      expired: 'The invite has expired: a new QR code is needed',
      locked: 'The invite is locked (too many wrong codes): a new QR code is needed',
    },
    stalled: {
      deloaded: (title: string) => `${title} was deloaded (stalled repeatedly)`,
      declining: (title: string, _count: number, n: string) => `${title} is declining (below target for ${n} workouts in a row)`,
      same: (title: string, _count: number, n: string) => `${title} has stayed at the same weight for ${n} workouts`,
      more: (count: number, n: string) => plural('en', count, { one: `+${n} exercise`, other: `+${n} exercises` }),
    },
    measurement: {
      decline: (parts: string) => `Declining over the last 4 weeks: ${parts}`,
    },
    missed: {
      many: (lookback: string, count: number, n: string, days: string) =>
        plural('en', count, {
          one: `Missed ${n} workout day in the last ${lookback} days: ${days}`,
          other: `Missed ${n} workout days in the last ${lookback} days: ${days}`,
        }),
      one: (day: string) => `Missed a workout day: ${day}`,
    },
    phase: {
      own: (own: string, name: string) => `The client is following ${own} · phase '${name}' has ended`,
      due: (name: string, next: string) => `Phase '${name}' has ended; next phase is '${next}'`,
    },
    proposals: {
      one: (text: string) => `Suggestion awaiting approval: ${text}`,
      many: (count: number, n: string) => plural('en', count, { one: `${n} suggestion awaiting approval`, other: `${n} suggestions awaiting approval` }),
    },
    constraints: {
      urgent: (emergency: string, label: string) => `${emergency.replace(/\.$/, '')} (${label})`,
      refer: (list: string) => `Refer to a health professional: ${list}`,
      betterAfterSevere: (label: string) => `${label} · was severe, now says it improved (awaiting review)`,
      worseToSevere: (label: string, from: string | null) => (from ? `${label} ${from} → severe` : `${label} · severe`),
      worse: (list: string) => `Limitation got worse: ${list}`,
      reportedSevere: (label: string) => `${label} (severe)`,
      reported: (list: string) => `Client reported a limitation: ${list}`,
      reportedWith: (label: string, severity: string) => `${label} (${severity})`,
      conflictNext: (list: string) => `Exercise in the next day conflicts with a limitation: ${list}`,
      conflictRow: (dayName: string, title: string) => `${dayName} · ${title}`,
      conflictOne: (row: string) => `Exercise in the program conflicts with a limitation: ${row}`,
      conflictMany: (count: number, n: string) =>
        plural('en', count, { one: `${n} exercise in the program conflicts with a limitation`, other: `${n} exercises in the program conflict with a limitation` }),
      better: (label: string, wasSevere: boolean) => `${label} · says it improved${wasSevere ? ' (had said severe before)' : ''}`,
      changed: (label: string, from: string, to: string) => `${label} ${from} → ${to}`,
      changedWorse: (label: string) => `${label} · got worse`,
      changeWorse: (list: string) => `Limitation got worse: ${list}`,
      changeUpdated: (list: string) => `Limitation updated: ${list}`,
      waitingRow: (label: string, count: number, n: string) => plural('en', count, { one: `${label} · ${n} day`, other: `${label} · ${n} days` }),
      waiting: (list: string) => `Waiting for a professional's opinion · ${list}`,
    },
    screening: {
      pain: (list: string) => `Pain in the movement test: ${list}`,
      asymmetry: (name: string) => `Large asymmetry in the movement test: ${name}`,
    },
    listMore: (n: string) => `+${n}`,
  },
  cardExtras: {
    lastWorkout: (day: string) => `Last workout ${day}`,
    noWorkout: (count: number, n: string) => plural('en', count, { one: `No workouts in the last ${n} day`, other: `No workouts in the last ${n} days` }),
  },
  notices: {
    title: 'Notifications',
    newBadge: (n: string) => `${n} new`,
    description: (days: string) => `The last ${days} days and pending suggestions: from clients' workouts and program changes.`,
    emptyTitle: 'No notifications',
    emptyBody: "It shows up here when a client does a different program than today's, or leaves a workout unfinished.",
    unreadSr: 'unread',
    markAllRead: 'Mark all as read',
    markFailed: (count: number) =>
      plural('en', count, { one: `Couldn't save for ${count} client; try again in a moment.`, other: `Couldn't save for ${count} clients; try again in a moment.` }),
    labels: {
      other_day: 'Different program',
      unfinished: 'Unfinished',
      overload: 'Overload',
      lighter: 'Lighter day',
      pain: 'Pain',
      program: 'Program',
      proposal: 'Pending suggestion',
      own_program: 'Own program',
      constraint: 'Limitation',
    },
    defaultDay: 'Workout',
    adjustReason: { readiness: 'readiness', pain: 'pain' },
    otherDayPlanned: (planned: string, day: string) => `Did ${day} instead of ${planned}`,
    otherDay: (day: string) => `Different program chosen: ${day}`,
    unfinished: (day: string, progress: { done: string; planned: string } | null) =>
      `${day} left unfinished${progress ? ` (${progress.done}/${progress.planned} sets)` : ''}`,
    overloadNone: (day: string) => `${day}: a set well above target was confirmed`,
    overloadRow: (title: string, kg: string, planned: string | null) => `${title} ${kg}${planned !== null ? ` (target ${planned})` : ''}`,
    lighter: (day: string, reason: string | null) => `${day} made lighter${reason ? ` (${reason})` : ''}`,
    painSkips: (day: string, count: number, n: string) =>
      plural('en', count, { one: `${day}: ${n} exercise skipped because of pain`, other: `${day}: ${n} exercises skipped because of pain` }),
    ownActive: (name: string) => `Today's program: ${name}`,
    ownDefaultName: 'own program',
    ownBack: "Switched back to the trainer's program",
    ownShared: (name: string) => `Shared: ${name}`,
    ownEdited: (name: string, text: string) => `${name} · ${text}`,
    ownDeleted: (name: string) => `Deleted: ${name}`,
    ownUnshared: (name: string) => `Stopped sharing: ${name}`,
    proposalOne: (text: string) => `Suggestion: ${text}`,
    proposalMany: (count: number, n: string) => plural('en', count, { one: `${n} change suggestion waiting`, other: `${n} change suggestions waiting` }),
  },
  api: {
    invalidRequest: 'Invalid request.',
    liveFailed: "Couldn't read the live status.",
    seenFailed: "Couldn't save the read status. Try again in a moment.",
  },
  live: {
    title: 'Working out now',
    reading: "Reading clients' workouts…",
    nobody: 'Nobody is working out right now. It shows up here live as a client logs sets.',
    failed: (count: number, n: string) =>
      plural('en', count, { one: `${n} client's status couldn't be read.`, other: `${n} clients' status couldn't be read.` }),
    justNow: 'just now',
    ago: (text: string) => `${text} ago`,
    sets: (done: number, doneText: string, plannedText: string | null) =>
      plannedText !== null ? `${doneText}/${plannedText} sets` : plural('en', done, { one: `${doneText} set`, other: `${doneText} sets` }),
    lastSet: (ago: string) => `last set ${ago}`,
    started: (ago: string) => `started ${ago}`,
    line: (detail: string) => `Working out now · ${detail}`,
    defaultClient: 'Client',
  },
};

export default en;
