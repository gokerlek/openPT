import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { installationTokens } from './installation-tokens.ts';

class Status extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`status ${status}`);
    this.status = status;
  }
}
type FakeAuth = { id: number };

function fixture({ fixedId = null as number | null, found = [7] as (number | Error)[], dead = new Set<number>(), down = false } = {}) {
  const calls: string[] = [];
  const tokens = installationTokens<FakeAuth>({
    fixedId,
    findId: async () => {
      const next = found.shift() ?? found.at(-1) ?? 7;
      calls.push(`find:${next instanceof Error ? 'hata' : next}`);
      if (next instanceof Error) throw next;
      return next;
    },
    create: (id) => {
      calls.push(`create:${id}`);
      return { id };
    },
    mint: async (auth, refresh) => {
      calls.push(`mint:${auth.id}${refresh ? ':yenile' : ''}`);
      if (down) throw new Status(502);
      if (dead.has(auth.id)) throw new Status(404);
      return `token-${auth.id}`;
    },
    stale: (error) => error instanceof Status && (error.status === 404 || error.status === 401),
  });
  return { tokens, calls };
}

describe('kurulum anahtarları', () => {
  test('env’deki kurulum kimliği aranmadan kullanılır; kimlik ve istemci bir kez kurulur', async () => {
    const f = fixture({ fixedId: 42 });
    assert.equal(await f.tokens.token(), 'token-42');
    assert.equal(await f.tokens.token(), 'token-42');
    assert.equal(await f.tokens.id(), 42);
    assert.deepEqual(f.calls, ['create:42', 'mint:42', 'mint:42']);
  });

  test('kimlik yoksa sahibin kurulumu bir kez bulunur ve önbellekte kalır', async () => {
    const f = fixture();
    await f.tokens.token();
    await f.tokens.token();
    assert.deepEqual(f.calls, ['find:7', 'create:7', 'mint:7', 'mint:7']);
  });

  test('anahtar alınırken 404/401: kimlik önbelleği düşer, kurulum bir kez yeniden bulunur (yeniden kurulmuş uygulama)', async () => {
    const f = fixture({ fixedId: 42, found: [99], dead: new Set([42]) });
    assert.equal(await f.tokens.token(), 'token-99');
    assert.equal(await f.tokens.id(), 99);
    assert.equal(await f.tokens.token(), 'token-99');
    assert.deepEqual(f.calls, ['create:42', 'mint:42', 'find:99', 'create:99', 'mint:99', 'mint:99']);
  });

  test('yeniden bulunan kurulum da geçersizse hata yukarı çıkar; tek istekte yalnız bir kez aranır', async () => {
    const f = fixture({ found: [7, 7], dead: new Set([7]) });
    await assert.rejects(f.tokens.token(), (error) => error instanceof Status && error.status === 404);
    assert.deepEqual(f.calls, ['find:7', 'create:7', 'mint:7', 'find:7', 'create:7', 'mint:7']);
  });

  test('ağ ya da sınır hatası kimliği düşürmez, yeniden arama yapılmaz', async () => {
    const f = fixture({ fixedId: 42, down: true });
    await assert.rejects(f.tokens.token(), (error) => error instanceof Status && error.status === 502);
    assert.deepEqual(f.calls, ['create:42', 'mint:42']);
  });

  test('arama hatası önbelleğe girmez: sonraki istek yeniden arar', async () => {
    const f = fixture({ found: [new Error('GitHub kapalı'), 7] });
    await assert.rejects(f.tokens.token(), /GitHub kapalı/);
    assert.equal(await f.tokens.token(), 'token-7');
    assert.deepEqual(f.calls, ['find:hata', 'find:7', 'create:7', 'mint:7']);
  });

  test('yeni repo için zorla yenileme önbelleği atlar (refresh)', async () => {
    const f = fixture({ fixedId: 42 });
    await f.tokens.token();
    assert.equal(await f.tokens.token(true), 'token-42');
    assert.deepEqual(f.calls, ['create:42', 'mint:42', 'mint:42:yenile']);
  });
});
