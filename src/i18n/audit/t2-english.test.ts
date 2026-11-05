import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';
import { loginScreen } from '../../app/giris/login-screen.ts';
import { clientsSummary, clientWork } from '../../app/dashboard/clients/client-work.ts';
import { attentionItems, type AttentionFacts } from '../../lib/attention.ts';
import { originGuard, postGuard, setPasswordRoute } from '../../lib/client-auth-routes.ts';
import { agoText, liveText } from '../../lib/live-text.ts';
import { proposalNotices, ptNoticeLabels } from '../../lib/notices.ts';
import { passwordProblem } from '../../lib/password-rules.ts';
import { ptChangeLabels } from '../../lib/pt-sessions.ts';
import { clientFormSchema, clientStatusLabels } from '../../lib/schemas/client.ts';
import { passwordLoginSchema, setPasswordSchema } from '../../lib/schemas/auth.ts';
import { setupFormSchema } from '../../lib/schemas/setup.ts';
import { contrastWarnings, themePresets } from '../../lib/theme-palette.ts';
import { githubAppManifest, handoffPage, installationProblems } from '../../lib/installation/github-app.ts';
import { githubSetupProblem } from '../../lib/installation/readiness.ts';
import { initialWizardValues, validateStep, wizardSteps } from '../../lib/installation/wizard.ts';
import { checkUpdates } from '../../lib/updates/check.ts';
import { authMessages } from '../messages/auth/index.ts';
import { installMessages } from '../messages/install/index.ts';
import { ptClientsMessages } from '../messages/pt-clients/index.ts';
import { langConfig } from '../valibot.ts';

/**
 * T2'nin saf işlevlerinin İngilizce çıktıları: Türkçe harf ve Türkçe sözcük kalmaz, cümleler İngilizce kalıpta. (Türkçe
 * çıktı her alanın kendi testlerinde değişmeden sınanıyor.)
 */
const TURKISH = /[çğıİöşüÇĞÖŞÜ]/;
function english(text: string, label = text): void {
  assert.ok(!TURKISH.test(text), `Türkçe harf: ${label}`);
}

const now = new Date('2026-11-02T12:00:00Z');
const baseFacts: AttentionFacts = {
  active: true,
  access: 'none',
  schedule: null,
  sessionDays: [],
  stalls: [],
  phase: null,
  proposals: null,
  measurements: [],
};
const ctx = { now, timeZone: 'UTC', titleOf: (id: string) => (id === 'bench' ? 'Bench press' : id), locale: 'en' as const };

describe('giriş (auth)', () => {
  test('/giris bilgi satırı İngilizce', () => {
    const screen = loginScreen({ clientId: 'c_abc123', remembered: null, loggedOut: true, passwordless: false, locale: 'en' });
    assert.deepEqual(screen, { kind: 'password', clientId: 'c_abc123', notice: "You're signed out. Enter your password to sign back in." });
    assert.equal(authMessages('en').loginScreen.noPasswordTitle, "You're signed out");
  });

  test('şifre kuralı mesajları', () => {
    assert.equal(passwordProblem('abc', 'en'), 'Password must be at least 8 characters.');
    assert.equal(passwordProblem('12345678', 'en'), 'This password is too common and easy to guess. Pick a different one.');
    assert.equal(passwordProblem('aaaaaaaa', 'en'), "Password can't be a run of sequential or repeated characters.");
    assert.equal(passwordProblem('x'.repeat(129), 'en'), 'Password can be at most 128 characters.');
    assert.equal(passwordProblem('mavi-deniz-42', 'en'), null);
  });

  test('şema mesajları isteğin dilinde (valibot `lang`)', () => {
    const weak = v.safeParse(setPasswordSchema, { password: 'abc', confirm: 'abc' }, langConfig('en'));
    assert.ok(!weak.success);
    assert.equal(weak.issues[0]?.message, 'Password must be at least 8 characters.');
    const mismatch = v.safeParse(setPasswordSchema, { password: 'mavi-deniz-42', confirm: 'baska-sifre-42' }, langConfig('en'));
    assert.ok(!mismatch.success);
    assert.equal(mismatch.issues[0]?.message, "Passwords don't match.");
    const empty = v.safeParse(passwordLoginSchema, { password: '' }, langConfig('en'));
    assert.ok(!empty.success);
    assert.equal(empty.issues[0]?.message, 'Enter your password.');
  });

  test('giriş uçlarının çekirdeği isteğin dilinde', async () => {
    const headers = new Headers({ origin: 'https://evil.example' });
    assert.deepEqual(originGuard(headers, 'https://app.example', 'en'), { status: 403, body: { error: "This request didn't come from this site." } });
    assert.deepEqual(postGuard(new Headers({ origin: 'https://app.example', 'content-type': 'text/plain' }), 'https://app.example', 'en'), {
      status: 415,
      body: { error: 'The request must be JSON.' },
    });
    const unauthenticated = await setPasswordRoute({ session: null, setPassword: async () => ({ ok: false, reason: 'session' }), log: () => {}, locale: 'en' }, {});
    assert.deepEqual(unauthenticated, { status: 401, body: { error: 'Your session has expired. Sign in again.' } });
  });
});

describe('danışan kayıtları (pt-clients)', () => {
  test('danışan durumu adları ve şema mesajları', () => {
    assert.deepEqual(clientStatusLabels('en'), { active: 'Active', paused: 'Paused', archived: 'Archived' });
    const result = v.safeParse(clientFormSchema, { name: 'A', note: '', status: 'active', healthEnabled: true, healthFields: [], heartRecovery: '150', heartAlert: '120' }, langConfig('en'));
    assert.ok(!result.success);
    const messages = result.issues.map((issue) => issue.message);
    assert.ok(messages.includes('Name is too short.'), messages.join(' | '));
    assert.ok(messages.includes('Choose at least one part when the module is on.'));
    assert.ok(messages.includes('The recovery limit must be lower than the alert limit.'));
  });

  test('liste özeti ve sağlık onayı rozeti İngilizce', () => {
    const client = {
      status: 'active' as const,
      access: { version: 1 },
      modules: { health: { enabled: true, fields: ['measurements' as const] } },
      consents: {},
    };
    const work = clientWork(client, null, now, 'en');
    assert.deepEqual(work.healthWork, { label: 'Waiting on health consent', tone: 'waiting' });
    const rows = [
      { status: 'active' as const, work },
      { status: 'active' as const, work: null },
      { status: 'archived' as const, work: null },
    ];
    assert.equal(clientsSummary(rows, 'en'), "3 clients · 2 active · 1 hasn't signed in yet · 1 waiting on health consent");
    assert.equal(clientsSummary([{ status: 'active', work: null }], 'en'), '1 client · 1 active');
  });

  test('davet adımları: beş adım ve son adımda rozet metni', () => {
    const en = ptClientsMessages('en').invite;
    const tr = ptClientsMessages('tr').invite;
    assert.equal(en.steps.length, tr.steps.length);
    assert.equal(en.steps.length, 5);
    for (const step of en.steps) english(step);
    assert.equal(en.lastStep.badge, 'Close access');
    assert.equal(en.lastStep.before + en.lastStep.badge + en.lastStep.after, 'If they lose their phone, edit the client and choose Close access (their sessions and password stop working), then create a new QR code.');
  });

  test('antrenman değişikliği etiketleri', () => {
    assert.deepEqual(ptChangeLabels('en'), { applied: 'written to the program', pending: 'awaiting approval', approved: 'approved', declined: 'declined', stale: "couldn't be applied" });
  });
});

describe('PT kabuğu (pt-shell)', () => {
  test('dikkat maddeleri: davet, öneri ve ilerlemeyen hareket', () => {
    const items = attentionItems(
      {
        ...baseFacts,
        proposals: { count: 2, at: '2026-11-01T10:00:00Z' },
        stalls: [{ exerciseId: 'bench', streak: 3, declining: false, lastDate: '2026-10-30' }],
      },
      ctx,
    );
    const texts = items.map((item) => item.text);
    assert.ok(texts.includes('Not invited yet: no QR code generated'), texts.join(' | '));
    assert.ok(texts.includes('2 suggestions awaiting approval'), texts.join(' | '));
    assert.ok(texts.includes('Bench press has stayed at the same weight for 3 workouts'), texts.join(' | '));
    for (const text of texts) english(text);
  });

  test('bildirim etiketleri ve bekleyen öneri', () => {
    assert.equal(ptNoticeLabels('en').other_day, 'Different program');
    const [one] = proposalNotices({ items: [{ status: 'pending', at: '2026-11-01T10:00:00Z', text: 'Leg press 3 → 4 sets' }] }, 'en');
    assert.equal(one?.text, 'Suggestion: Leg press 3 → 4 sets');
    const [many] = proposalNotices(
      {
        items: [
          { status: 'pending', at: '2026-11-01T10:00:00Z', text: 'a' },
          { status: 'pending', at: '2026-11-01T11:00:00Z', text: 'b' },
        ],
      },
      'en',
    );
    assert.equal(many?.text, '2 change suggestions waiting');
  });

  test('canlı antrenman metinleri', () => {
    const live = { sessionId: 's1', dayName: 'Day A', done: 7, planned: 17, startedAt: '2026-11-02T11:00:00Z', lastSetAt: '2026-11-02T11:56:00Z', updatedAt: '2026-11-02T11:56:00Z' };
    assert.equal(agoText('2026-11-02T11:59:50Z', now, 'en'), 'just now');
    assert.equal(liveText({ ...live, planned: null, done: 1, lastSetAt: null }, now, 'en').startsWith('Training now · Day A · 1 set · started '), true);
    assert.ok(liveText(live, now, 'en').startsWith('Training now · Day A · 7/17 sets · last set '));
  });
});

describe('kurulum (setup, install)', () => {
  test('kurulum şemaları ve hazır palet açıklamaları', () => {
    const result = v.safeParse(setupFormSchema, { appName: ' ', accent: 'red', theme: 'dark', radius: 'subtle' }, langConfig('en'));
    assert.ok(!result.success);
    const messages = result.issues.map((issue) => issue.message);
    assert.ok(messages.includes("The app name can't be empty."), messages.join(' | '));
    assert.ok(messages.includes('The color must be in #RRGGBB format.'));
    assert.equal(themePresets('en')[0]?.description, 'Vivid green · Charcoal');
    assert.deepEqual(contrastWarnings({ foreground: '#777777', background: '#808080' }, 'en'), ['Main text']);
  });

  test('sihirbaz adımları ve doğrulama', () => {
    assert.deepEqual(wizardSteps('en'), ['Connect GitHub', 'Optional AI', 'Transfer to Vercel']);
    const values = { ...initialWizardValues('', 'openpt'), appRepo: 'openpt' };
    const errors = validateStep(0, values, 'en');
    assert.equal(errors.owner, 'Enter the GitHub username.');
    assert.equal(errors.appId, 'Finish the “Connect GitHub” step.');
    assert.equal(errors.appRepo, 'The data repo must be different from the code repo.');
    for (const message of Object.values(errors)) english(message ?? '');
  });

  test('hazırlık mesajları: GitHub uygulaması ayarı ve kurulum sorunları', () => {
    assert.equal(
      githubSetupProblem({ GITHUB_APP_ID: '123' }, 'en'),
      'GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY must be set together (setup with a GitHub app).',
    );
    assert.equal(githubSetupProblem({}, 'en'), null);
    const info = { id: 5, account: 'someone', selection: 'selected' as const, permissions: { metadata: 'read' }, suspended: true };
    const problems = installationProblems(info, 'coach', 'en');
    assert.equal(problems[0], "The GitHub app is installed on the someone account; it must be installed on the trainer's account (coach).");
    assert.equal(problems.length, 4);
    for (const problem of problems) english(problem);
  });

  test('GitHub uygulaması bildirimi ve dönüş sayfası dili', () => {
    const manifest = githubAppManifest({ homepage: 'https://app.example', suffix: 'abcdef', locale: 'en' });
    assert.equal(manifest.description, "openPT: the trainer's own installation. GitHub sign-in, private data repos and app updates.");
    const credentials = { appId: '1', slug: 'openpt-x', owner: 'coach', clientId: 'Iv1.x', clientSecret: 'secret', privateKey: '-----BEGIN RSA PRIVATE KEY-----\nQUJD\n-----END RSA PRIVATE KEY-----\n' };
    const page = handoffPage(credentials, 'nonce123', 'en');
    assert.ok(page.includes('<html lang="en">'));
    assert.ok(page.includes('Connecting to GitHub'));
    assert.ok(handoffPage(credentials, 'nonce123').includes('<html lang="tr">'));
  });

  test('sürüm kontrolünün otomasyon hatası dilinde', async () => {
    const failing = await checkUpdates(
      '0.1.0',
      async () => null,
      async () => {
        throw new Error('boom');
      },
      'en',
    );
    assert.equal(failing.automationError, 'boom');
    assert.equal(installMessages('en').updates.panel.noRelease, 'No newer stable version found.');
  });
});
