import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';

/**
 * İstemci paketine hazır kütüphanenin kendisi (egzersiz kütüphanesi ~91 KB) girmemeli. Geçmişteki adı okuyanın diline
 * çeviren `localizedLibraryTitle` küçük, üretilmiş bir tablodan (`library-titles.ts`) okur; `library-text.ts` kütüphanelerin
 * Türkçe kaynağını hiç içe almaz. İçe aktarma grafiği TypeScript'in ayrıştırıcısıyla çıkarılır.
 */
const ROOT = join(import.meta.dirname, '..', '..');
const SRC = join(ROOT, 'src');
const LIBRARIES = ['src/data/exercise-library.ts', 'src/data/device-library.ts', 'src/data/attachment-library.ts'].map((path) => join(ROOT, path));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

function resolveImport(from: string, specifier: string): string | null {
  const base = specifier.startsWith('@/') ? join(SRC, specifier.slice(2)) : specifier.startsWith('.') ? resolve(dirname(from), specifier) : null;
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (/\.tsx?$/.test(candidate) && existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const files = sourceFiles(SRC);
const imports = new Map<string, string[]>();
const clients: string[] = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const info = ts.preProcessFile(text, true, true);
  imports.set(file, info.importedFiles.flatMap(({ fileName }) => resolveImport(file, fileName) ?? []));
  const first = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false).statements[0];
  const directive = first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression) ? first.expression.text : '';
  if (directive === 'use client' || file.startsWith(join(SRC, 'components') + '/')) clients.push(file);
}

/** `from`'dan varılabilen modüller (kendisi dahil); tür içe aktarmaları da sayılır (fazladan titiz). */
function reachable(from: string): Set<string> {
  const seen = new Set<string>();
  const queue = [from];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    queue.push(...(imports.get(file) ?? []));
  }
  return seen;
}

describe('istemci paketi kütüphaneyi içe almaz', () => {
  test('istemci modülleri bulundu', () => {
    assert.ok(clients.length > 50, `${clients.length} istemci modülü`);
  });

  test("hiçbir istemci modülü hazır kütüphanelerin Türkçe kaynağını doğrudan içe aktarmaz", () => {
    const direct = clients.filter((file) => (imports.get(file) ?? []).some((target) => LIBRARIES.includes(target))).map((file) => relative(ROOT, file));
    assert.deepEqual(direct, []);
  });

  test('library-text.ts kütüphanelerin Türkçe kaynağına (doğrudan ya da başka modülle) varmaz', () => {
    const reached = reachable(join(SRC, 'data', 'library-text.ts'));
    assert.deepEqual(LIBRARIES.filter((library) => reached.has(library)).map((file) => relative(ROOT, file)), []);
  });

  test('library-text.ts adlar tablosunu ve İngilizce tabloları içe alır', () => {
    const own = (imports.get(join(SRC, 'data', 'library-text.ts')) ?? []).map((file) => relative(SRC, file));
    for (const expected of ['data/attachment-library.en.ts', 'data/device-library.en.ts', 'data/exercise-library.en.ts', 'data/library-titles.ts']) {
      assert.ok(own.includes(expected), expected);
    }
  });

  test("`library-text.ts`'i kullanan istemci modülünün grafiği de kütüphaneye varmaz", () => {
    const text = join(SRC, 'data', 'library-text.ts');
    const viaText = clients.filter((file) => (imports.get(file) ?? []).includes(text));
    for (const file of viaText) {
      const reached = reachable(file);
      assert.deepEqual(LIBRARIES.filter((library) => reached.has(library)).map((path) => relative(ROOT, path)), [], relative(ROOT, file));
    }
  });
});
