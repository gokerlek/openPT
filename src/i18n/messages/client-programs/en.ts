import { listText, plural, type Shape } from '../../define.ts';
import type tr from './tr.ts';

const en: Shape<typeof tr> = {
  ptProgramName: "Your trainer's program",
  defaultName: 'My program',
  line: {
    workouts: (count, n) => `${count} ${plural('en', n, { one: 'workout', other: 'workouts' })}`,
    perWeek: (count) => `${count} a week`,
    noDays: 'no days assigned',
    last: (day) => `last: ${day}`,
  },
  log: {
    created: 'Created',
    clientCreated: 'Client created',
    ptEdited: 'Your trainer edited',
    youEdited: 'You edited',
    clientEdited: 'Client edited',
    fromWorkout: 'From a workout',
    clientUpdated: 'Client updated',
    share: 'Sharing',
    phase: 'Phase change',
  },
  name: {
    empty: 'Enter a name.',
    tooLong: (max) => `${max} characters at most.`,
    reserved: (name) => `"${name}" can't be used as a name.`,
    taken: 'You already have a program with this name.',
  },
  changes: {
    fromPt: (days) => `${days} ${plural('en', days, { one: 'day', other: 'days' })} from your trainer's program`,
    fromTemplates: (names) => `from the ${listText('en', names.map((name) => `'${name}'`))} ${names.length === 1 ? 'template' : 'templates'}`,
    created: (parts) => (parts.length > 0 ? `Program created: ${parts.join(', ')}` : 'Program created'),
    renamed: (from, to) => `Name: '${from}' → '${to}'`,
    shared: 'Shared with your trainer',
    unshared: 'Sharing turned off',
    removed: (title) => `${title} removed`,
    added: (title) => `${title} added`,
  },
  commits: {
    own: (name) => `Own program (${name}): `,
    created: 'Program created',
    updated: 'Program updated',
    shared: (shared) => (shared ? 'shared with trainer' : 'sharing turned off'),
    deleted: 'Own program deleted',
    active: (name) => (name ? `Today's program: ${name}` : "Today's program: trainer's program"),
  },
  errors: {
    missing: 'Program not found.',
    badRequest: 'Invalid request.',
    check: 'Check the details.',
    deleted: 'The program was deleted.',
    staleForPt: "This program changed while you were editing. I didn't save so your changes aren't lost.",
    stale: 'This program changed while you were editing (your trainer or another device saved it).',
    exists: 'This program was created somewhere else.',
    limit: (max) => `${max} programs at most; delete one to add a new one.`,
    unshared: 'The client turned off sharing for this program.',
    activeSession: 'You have an unfinished workout from this program; finish or delete it first.',
    unavailable: "The program can't be opened right now.",
  },
};

export default en;
