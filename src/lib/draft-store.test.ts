import { afterEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { discardAllDrafts, discardDraft, discardDrafts, stoppers } from './draft-store.ts';
import { DRAFT_PREFIX, ownDraftPrefix } from './unsaved-changes.ts';

/** Sahte `localStorage`: yalnız taslak deposunun kullandığı yüzey. */
function fakeStorage(entries: Record<string, string>) {
  const data = new Map(Object.entries(entries));
  const store = {
    get length() {
      return data.size;
    },
    key: (index: number) => [...data.keys()][index] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
  (globalThis as { window?: unknown }).window = { localStorage: store };
  return data;
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  stoppers.clear();
});

describe('taslak deposu (arayüzsüz)', () => {
  test('discardDraft anahtarı siler ve o anahtardaki açık düzenleyiciyi durdurur', () => {
    const data = fakeStorage({ [`${DRAFT_PREFIX}template.a`]: '1', [`${DRAFT_PREFIX}template.b`]: '2' });
    let stopped = 0;
    stoppers.set(`${DRAFT_PREFIX}template.a`, new Set([() => (stopped += 1)]));
    discardDraft(`${DRAFT_PREFIX}template.a`);
    assert.equal(stopped, 1);
    assert.deepEqual([...data.keys()], [`${DRAFT_PREFIX}template.b`]);
  });

  test('discardDrafts yalnız önekin taslaklarını siler (danışan çıkışı kendi programlarını)', () => {
    const prefix = ownDraftPrefix('c_aaaaaaaa');
    const data = fakeStorage({ [`${prefix}p1`]: '1', [`${prefix}p2`]: '2', [`${ownDraftPrefix('c_bbbbbbbb')}p1`]: '3', other: '4' });
    discardDrafts(prefix);
    assert.deepEqual([...data.keys()].sort(), [`${ownDraftPrefix('c_bbbbbbbb')}p1`, 'other'].sort());
  });

  test('discardAllDrafts bütün taslakları siler, başka anahtarlara dokunmaz', () => {
    const data = fakeStorage({ [`${DRAFT_PREFIX}program.x`]: '1', [`${DRAFT_PREFIX}template.new`]: '2', theme: 'dark' });
    discardAllDrafts();
    assert.deepEqual([...data.keys()], ['theme']);
  });

  test('depo kapalıyken (window yok ya da hata) atma sessizce geçer', () => {
    assert.doesNotThrow(() => discardDrafts(DRAFT_PREFIX));
    assert.doesNotThrow(() => discardDraft(`${DRAFT_PREFIX}template.a`));
  });
});
