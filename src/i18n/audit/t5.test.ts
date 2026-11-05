import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { findHardcodedText } from '../audit.ts';

/**
 * T5 (kütüphane okuma anında çeviri, AI koç): sahip olunan dosyalarda sözlüğe taşınmamış metin yok. Dile göre
 * değişen her metin `src/i18n/messages/coach/` altında. Gemini'ye giden komutlar İngilizce yazılı ve
 * `lib/ai/prompt-language.ts` kullanıcının dilini ekler; bunlar Türkçe harf ya da arayüz sözcüğü içermediği için
 * ayrıca izin gerekmedi. `src/data/*-library*.ts` ve `library-titles.ts` veri tablolarıdır (PT'nin okuduğu kütüphane
 * metni, çevirisi ayrı tabloda), bu denetimin konusu değil.
 */
const ROOT = join(import.meta.dirname, '..', '..', '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const OWNED_DIRECTORIES = [
  'src/lib/ai',
  'src/components/coach',
  'src/app/dashboard/clients/[id]/coach',
  'src/app/dashboard/settings/ai',
  'src/app/me/(sekmeler)/programlar/ai',
  'src/app/api/coach',
  'src/app/api/settings',
  'src/app/api/clients/[id]/coach',
  'src/app/api/me/coach',
];
const OWNED_FILES = [
  'src/lib/exercises.ts',
  'src/lib/devices.ts',
  'src/lib/attachments.ts',
  'src/lib/library-lists.ts',
  'src/data/library-text.ts',
];

/** Rota adları çevrilmez (`/me/programlar/…`); adresler dile göre değişmez. */
const ROUTES = [/^\/(?:me|dashboard|api)\//];

const files = [...OWNED_DIRECTORIES.flatMap((dir) => walk(join(ROOT, dir))), ...OWNED_FILES.map((file) => join(ROOT, file))];

describe('T5 dosyalarında gömülü metin yok', () => {
  test('sahip olunan dosyalar bulundu', () => {
    const names = files.map((file) => relative(ROOT, file));
    for (const expected of [
      'src/lib/ai/coach-engine.ts',
      'src/lib/ai/assistant-routes.ts',
      'src/components/coach/coach-panel.tsx',
      'src/app/dashboard/settings/ai/gemini-settings.tsx',
      'src/app/api/me/coach/connection/route.ts',
      'src/lib/exercises.ts',
    ]) {
      assert.ok(names.includes(expected), expected);
    }
    assert.ok(files.length > 40, `${files.length} dosya`);
  });

  test('Türkçe dize, JSX metni ve metin öznitelikleri sözlükte', () => {
    assert.deepEqual(findHardcodedText(files, { allow: ROUTES }), []);
  });
});
