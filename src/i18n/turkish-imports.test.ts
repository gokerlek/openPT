import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Türkçe ekler (`lib/turkish.ts`: `dative`, `accusative`) yalnız Türkçe sözlüklerden (`messages/<ad>/tr.ts`)
 * çağrılır: İngilizce metin onlardan geçmez. `PENDING`: henüz sözlüğe taşınmamış eski çağrılar (T3'ün dosyaları);
 * taşınınca listeden silinir (bu test listede kalan ama artık içe aktarmayan dosyayı da söyler).
 */

const ROOT = join(import.meta.dirname, '..', '..');
const SRC = join(ROOT, 'src');
const PENDING = new Set<string>();
const IMPORTS_TURKISH = /from\s+['"][^'"]*\/turkish(?:\.ts)?['"]/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe('Türkçe ekler yalnız Türkçe sözlükte', () => {
  const importers = sourceFiles(SRC)
    .filter((file) => IMPORTS_TURKISH.test(readFileSync(file, 'utf8')))
    .map((file) => relative(ROOT, file).split(sep).join('/'));

  test('turkish.ts’i yalnız messages/**/tr.ts içe aktarır', () => {
    const misplaced = importers.filter((file) => !/^src\/i18n\/messages\/[^/]+\/tr\.ts$/.test(file) && !PENDING.has(file));
    assert.deepEqual(misplaced, []);
  });

  test('bekleyen listede taşınmış dosya kalmaz', () => {
    assert.deepEqual([...PENDING].filter((file) => !importers.includes(file)), []);
  });
});
