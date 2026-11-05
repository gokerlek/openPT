import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { githubErrorText, GithubError, writeToFreshRepo } from './errors.ts';
import { installMessages } from '../../i18n/messages/install/index.ts';

describe('yeni repoya ilk yazma', () => {
  test('404/409 birkaç kez denenir; 404’te yeniden denemeden önce erişim bir kez yenilenir', async () => {
    const steps: string[] = [];
    let attempt = 0;
    const result = await writeToFreshRepo(
      async () => {
        attempt += 1;
        steps.push(`yaz:${attempt}`);
        if (attempt < 3) throw new GithubError('yok', 404);
        return 'tamam';
      },
      async (ms) => {
        steps.push(`bekle:${ms}`);
      },
      async () => {
        steps.push('yenile');
      },
    );
    assert.equal(result, 'tamam');
    assert.deepEqual(steps, ['yaz:1', 'yenile', 'bekle:600', 'yaz:2', 'bekle:1200', 'yaz:3']);
  });

  test('409’da yenileme yok; yenileme düşerse yazma yine denenir', async () => {
    const steps: string[] = [];
    let attempt = 0;
    await writeToFreshRepo(
      async () => {
        attempt += 1;
        if (attempt === 1) throw new GithubError('çakışma', 409);
        if (attempt === 2) throw new GithubError('yok', 404);
      },
      async () => undefined,
      async () => {
        steps.push('yenile');
        throw new Error('GitHub kapalı');
      },
    );
    assert.equal(attempt, 3);
    assert.deepEqual(steps, ['yenile']);
  });

  test('yenileme verilmezse davranış aynı; başka hatalar ve son denemenin hatası yukarı çıkar', async () => {
    let attempt = 0;
    await assert.rejects(
      writeToFreshRepo(async () => {
        attempt += 1;
        throw new GithubError('yok', 404);
      }, async () => undefined),
      (error) => error instanceof GithubError && error.status === 404,
    );
    assert.equal(attempt, 4);
    await assert.rejects(writeToFreshRepo(async () => { throw new GithubError('izin yok', 403); }, async () => undefined), /izin yok/);
  });
});

describe('kullanıcıya giden GitHub hata metni', () => {
  test('yalnız GithubError dile göre söylenir; Octokit, fetch ya da TypeError ham mesajı sızdırmaz', () => {
    const localized = new GithubError((locale) => installMessages(locale).github.onlyClientRepos, 403);
    assert.equal(githubErrorText(localized, 'tr'), 'Yalnız danışan repoları silinebilir.');
    assert.equal(githubErrorText(localized, 'en'), 'Only client repos can be deleted.');
    assert.equal(githubErrorText(new GithubError('düz metin', 500), 'en'), 'düz metin');
    assert.equal(githubErrorText(new TypeError('fetch failed'), 'en'), null);
    assert.equal(githubErrorText(Object.assign(new Error('Octokit: Bad credentials'), { status: 401 }), 'tr'), null);
    assert.equal(githubErrorText('metin', 'tr'), null);
  });
});
