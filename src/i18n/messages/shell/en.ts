import type { Shape } from '../../define.ts';
import type tr from './tr.ts';

const en: Shape<typeof tr> = {
  appDescription: (appName: string) => `${appName} — workout tracking`,
  panelDescription: (appName: string) => `${appName} — trainer dashboard`,
  error: {
    title: "Couldn't load the page",
    description: "The data can't be read right now. Try again in a moment.",
    retry: 'Try again',
  },
  notFound: {
    title: 'Page not found',
    description: 'The address may be mistyped, or the record may have been deleted.',
  },
  backTo: {
    templates: 'Back to templates',
    exercises: 'Back to exercises',
    devices: 'Back to equipment',
    attachments: 'Back to attachments',
    clients: 'Back to clients',
    overview: 'Back to overview',
    home: 'Back to home',
  },
  setupRequired: 'Setup must be completed first.',
  offline: {
    title: 'No connection',
    body: "The page opens once you're back online. Sets logged during a workout stay on your phone and are sent when the connection returns.",
    retry: 'Try again',
  },
  settingsSections: {
    appearance: 'Appearance',
    ai: 'AI',
    updates: 'Version',
    app: 'App',
  },
  language: {
    label: 'Language',
    hint: 'The app language in this browser. Programs, notes and names stay in the language they were written in.',
  },
};

export default en;
