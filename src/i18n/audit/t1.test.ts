import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { findHardcodedText } from '../audit.ts';

/**
 * T1 (PT kütüphanesi ve program düzenleyicisi): sahip olunan dosyalarda sözlüğe taşınmamış metin yok. Dosya kümesi
 * görevin sahiplik listesidir; testler (`*.test.ts`) dışarıda.
 */
const ROOT = join(import.meta.dirname, '..', '..', '..');

const DIRS = [
  'src/app/dashboard/exercises',
  'src/app/dashboard/devices',
  'src/app/dashboard/attachments',
  'src/app/dashboard/templates',
  'src/app/dashboard/clients/[id]/program',
  'src/components/block-editor',
  'src/components/program',
  'src/app/api/exercises',
  'src/app/api/devices',
  'src/app/api/attachments',
  'src/app/api/templates',
  'src/app/api/clients/[id]/program',
  'src/app/api/clients/[id]/programs',
  'src/app/api/clients/[id]/proposals',
];

const LIB_FILES = [
  'catalog-actions',
  'catalog-refs',
  'catalog-store',
  'exercise-filter',
  'program-diff',
  'edit-messages',
  'editor-undo',
  'template-edit',
  'templates',
  'programs',
  'proposals',
  'proposals-store',
  'reorder',
  'drop-target',
  'slug',
  'client-targets',
  'set-suggestions',
  'program-insights',
  'localized-github-error',
  'route-failure',
].map((name) => `src/lib/${name}.ts`);

const SCHEMA_FILES = ['template', 'program', 'device', 'attachment', 'own-program', 'exercise'].map((name) => `src/lib/schemas/${name}.ts`);

function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { recursive: true, encoding: 'utf8' })
    .filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
    .map((name) => join(ROOT, dir, name));
}

const FILES = [...DIRS.flatMap(sourceFiles), ...[...LIB_FILES, ...SCHEMA_FILES].map((file) => join(ROOT, file))];

/**
 * İzinli metinler: arayüz cümlesi olmayan, çevrilmeyen dizeler (her biri tam eşleşme).
 * - Dosya yolları ve adları (`data/templates/…json`, `program.json`) kod olarak gösterilir; dil değiştirmez.
 * - Örnek bağlantı (`https://www.youtube.com/watch?v=…`) yer tutucudur, bir dilin cümlesi değil.
 * - `m` (metre) ve `AMRAP` birimi / kısaltması iki dilde de aynıdır.
 * - `useEditor` dışarıda çağrılırsa fırlatılan hata: geliştiriciye yönelik, kullanıcıya hiç görünmeyen bir değişmez
 *   koşul iletisi (sağlayıcı olmadan çizim programlama hatasıdır).
 */
const ALLOW: RegExp[] = [
  /^(?:data\/templates\/|\.json|program\.json)$/,
  /^https:\/\/www\.youtube\.com\/watch\?v=…$/,
  /^(?:m|AMRAP)$/,
  /^Hareket düzenleyicinin içinde kullanılmalı\.$/,
];

describe('T1 dosyalarında gömülü metin yok', () => {
  test('dosya kümesi boş değil', () => {
    assert.ok(FILES.length > 100, `beklenenden az dosya: ${FILES.length}`);
  });

  test('Türkçe dize, JSX metni ve metin öznitelikleri sözlükte', () => {
    assert.deepEqual(findHardcodedText(FILES, { allow: ALLOW }), []);
  });
});
