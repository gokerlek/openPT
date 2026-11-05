import type { Shape } from '../../define.ts';
import type tr from './tr.ts';

const en: Shape<typeof tr> = {
  appIncomplete: 'GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY must be set together (setup with a GitHub app).',
  appIdNumber: 'GITHUB_APP_ID must be a number (the GitHub app\'s "App ID").',
  installationNumber: "GITHUB_APP_INSTALLATION_ID must be a number; if you don't know it, leave it empty and the owner's installation is found.",
  privateKeyProblem: (reason: string) => `GITHUB_APP_PRIVATE_KEY: ${reason}`,
  missing: 'GitHub access is not configured: GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY (GitHub app) or GITHUB_TOKEN. Add it under Vercel → Settings → Environment Variables (template: .env.example).',
  setupUnreadable: "Couldn't read the GitHub app's settings.",
  privateKey: "The GitHub app's private key isn't in PEM format. Use the whole .pem file you downloaded from GitHub.",
};

export default en;
