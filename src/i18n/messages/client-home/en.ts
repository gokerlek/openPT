import { plural, type Shape } from '../../define.ts';
import type tr from './tr.ts';

const en: Shape<typeof tr> = {
  pageLoading: 'Loading page…',
  tabs: {
    today: 'Today',
    programs: 'Program',
    progress: 'Progress',
    health: 'Health',
  },
  progressSections: {
    summary: 'Summary',
    history: 'History',
    records: 'Records',
  },
  water: {
    commit: 'Water',
    noChange: 'No changes.',
  },
  painReport: {
    exercise: (title, sessions) => `${title} (in ${sessions} ${plural('en', sessions, { one: 'workout', other: 'workouts' })})`,
    note: (items) => `Skipped because of pain: ${items.join(', ')}.`,
  },
  routes: {
    invalid: 'Invalid record.',
    check: 'Check the details.',
    noHealthConsent: "You haven't given consent for health records.",
    noConstraintConsent: "You haven't given health consent for reporting limitations.",
    healthBroken: "Your health record can't be opened right now. Let your trainer know.",
    constraintMissing: 'Limitation not found.',
  },
  consentApi: {
    sessionRequired: 'You need to be signed in.',
    badRequest: 'Invalid request.',
    expired: 'Your session has expired. Sign in again.',
    failed: "Couldn't save your consent.",
  },
  commits: {
    checkIn: 'Check-in saved',
    reported: 'Limitation reported',
    reportEdited: 'Limitation report corrected',
    updated: 'Limitation updated',
    withdrawn: 'Limitation report withdrawn',
  },
};

export default en;
