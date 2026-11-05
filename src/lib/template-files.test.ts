import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';
import { langConfig } from '../i18n/valibot.ts';
import { ptProgramMessages } from '../i18n/messages/pt-program/index.ts';
import { LOCALES } from '../i18n/locale.ts';
import { templateSchema } from './schemas/template.ts';
import { createTemplateCache, resolveTemplates, type RawTemplate } from './template-files.ts';

const at = '2026-09-24T09:00:00.000Z';
const row = { id: 'r_aaaaaa', exerciseId: 'squat', target: { min: 5, max: 8 } };
const template = (id: string, sets: number) => ({
  id,
  name: `Şablon ${id}`,
  description: '',
  blocks: [{ id: 'b_aaaaaa', kind: 'single', sets, restSeconds: 90, rows: [row] }],
  createdAt: at,
  updatedAt: at,
});

/** Okunan dosyaları sayan yükleyici (GitHub okuması yerine). */
function loader(files: Record<string, RawTemplate>) {
  const reads: string[] = [];
  return { reads, load: async (id: string) => (reads.push(id), files[id] ?? null) };
}
const entry = (id: string, sha: string) => ({ name: `${id}.json`, sha });

/** Beklenen sorun: aynı şema, aynı dilde (`yol: ileti`). */
function expectedProblem(content: unknown, locale: (typeof LOCALES)[number]): string {
  const issue = v.safeParse(templateSchema, content, langConfig(locale)).issues?.[0];
  assert.ok(issue, 'içerik geçersiz olmalı');
  return `${v.getDotPath(issue) ?? ptProgramMessages(locale).templatesLib.fileFallback}: ${issue.message}`;
}

describe('okunamayan şablon yapı olarak önbelleğe girer, sorunu okuyanın dilinde üretilir', () => {
  const bad = template('t_aaaaaaaa', 0);
  const files: Record<string, RawTemplate> = {
    t_aaaaaaaa: { id: 't_aaaaaaaa', sha: 'sha-a', content: bad },
    t_bbbbbbbb: { id: 't_bbbbbbbb', sha: 'sha-b', content: template('t_bbbbbbbb', 3) },
    t_cccccccc: { id: 't_cccccccc', sha: 'sha-c', unreadable: true },
  };
  const entries = [entry('t_aaaaaaaa', 'sha-a'), entry('t_bbbbbbbb', 'sha-b'), entry('t_cccccccc', 'sha-c')];

  test('ikinci listeleme (başka dil) hiçbir dosyayı yeniden okumaz; sorun metni o dilde', async () => {
    const cache = createTemplateCache();
    const source = loader(files);
    const turkish = await resolveTemplates(entries, cache, source.load, 'tr');
    assert.deepEqual(source.reads.sort(), ['t_aaaaaaaa', 't_bbbbbbbb', 't_cccccccc']);
    const english = await resolveTemplates(entries, cache, source.load, 'en');
    assert.equal(source.reads.length, 3, 'yeniden okuma yok');

    const problemOf = (list: typeof turkish, id: string) => list.find((file) => (file.template ? file.template.id : file.id) === id)?.problem;
    assert.equal(problemOf(turkish, 't_aaaaaaaa'), expectedProblem(bad, 'tr'));
    assert.equal(problemOf(english, 't_aaaaaaaa'), expectedProblem(bad, 'en'));
    assert.notEqual(problemOf(turkish, 't_aaaaaaaa'), problemOf(english, 't_aaaaaaaa'));
    assert.equal(problemOf(turkish, 't_cccccccc'), ptProgramMessages('tr').templatesLib.unreadable);
    assert.equal(problemOf(english, 't_cccccccc'), ptProgramMessages('en').templatesLib.unreadable);
    assert.equal(problemOf(english, 't_bbbbbbbb'), null);
  });

  test('içerik değişince (yeni sha) yeniden okunur', async () => {
    const cache = createTemplateCache();
    const source = loader(files);
    await resolveTemplates(entries, cache, source.load, 'tr');
    await resolveTemplates([entry('t_aaaaaaaa', 'sha-a2'), entries[1]!, entries[2]!], cache, source.load, 'tr');
    assert.deepEqual(source.reads.filter((id) => id === 't_aaaaaaaa').length, 2);
    assert.equal(source.reads.length, 4);
  });

  test('okuma hatası önbelleğe girmez: sonraki listeleme yeniden dener', async () => {
    const cache = createTemplateCache();
    let failing = true;
    const load = async (id: string) => {
      if (failing && id === 't_bbbbbbbb') throw new Error('ağ');
      return files[id] ?? null;
    };
    const first = await resolveTemplates(entries, cache, load, 'tr');
    assert.equal(first.filter((file) => file.template).length, 0);
    assert.equal(first.length, 3);
    failing = false;
    const second = await resolveTemplates(entries, cache, load, 'tr');
    assert.deepEqual(second.filter((file) => file.template).map((file) => file.template?.id), ['t_bbbbbbbb']);
  });

  test('geçerliler ada göre, okunamayanlar sonda', async () => {
    const list = await resolveTemplates(entries, createTemplateCache(), loader(files).load, 'en');
    assert.deepEqual(
      list.map((file) => (file.template ? 'ok' : 'bozuk')),
      ['ok', 'bozuk', 'bozuk'],
    );
  });
});
