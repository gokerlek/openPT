import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';

/**
 * İstemci paketine hazır kütüphanenin kendisi (egzersiz kütüphanesi ~91 KB) ve İngilizce tabloları girmemeli. Geçmişteki
 * adı okuyanın diline çeviren `localizedLibraryTitle` küçük, üretilmiş bir tablodan (`library-titles.ts`) okur; istemci
 * modülleri onu `@/data/library-titles`'tan alır (`library-text.ts` İngilizce tabloları içe alır, sunucuya özgü).
 * İçe aktarma grafiği TypeScript'in ayrıştırıcısıyla çıkarılır, DOLAYLI yollar da izlenir: bir istemci modülü kütüphaneye
 * bir `src/lib` yardımcısı üzerinden varsa da yakalanır. Yalnız türü getiren içe aktarmalar pakete girmez, izlenmez.
 */
const ROOT = join(import.meta.dirname, '..', '..');
const TARGETS = [
  'data/exercise-library.ts',
  'data/device-library.ts',
  'data/attachment-library.ts',
  'data/exercise-library.en.ts',
  'data/device-library.en.ts',
  'data/attachment-library.en.ts',
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

function resolveImport(src: string, from: string, specifier: string): string | null {
  const base = specifier.startsWith('@/') ? join(src, specifier.slice(2)) : specifier.startsWith('.') ? resolve(dirname(from), specifier) : null;
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (/\.tsx?$/.test(candidate) && existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Pakete giren modül belirleyicileri: `import type …` ve yalnız `type` adları getiren içe aktarmalar sayılmaz. */
function runtimeSpecifiers(source: ts.SourceFile): string[] {
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const named = clause?.namedBindings;
      const typeOnly = clause?.isTypeOnly || (!clause?.name && named && ts.isNamedImports(named) && named.elements.length > 0 && named.elements.every((element) => element.isTypeOnly));
      if (!typeOnly) found.push(node.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      if (!node.isTypeOnly) found.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      found.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function graphOf(src: string) {
  const imports = new Map<string, string[]>();
  const clients: string[] = [];
  for (const file of sourceFiles(src)) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    imports.set(file, runtimeSpecifiers(source).flatMap((specifier) => resolveImport(src, file, specifier) ?? []));
    const first = source.statements[0];
    if (first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression) && first.expression.text === 'use client') clients.push(file);
  }
  return { imports, clients };
}

/** `from`'dan hedeflere giden ilk yol (modül adlarıyla); yoksa null. */
function pathTo(imports: Map<string, string[]>, from: string, isTarget: (file: string) => boolean): string[] | null {
  const previous = new Map<string, string | null>([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const file = queue.shift()!;
    if (isTarget(file) && file !== from) {
      const chain = [file];
      for (let step = previous.get(file); step; step = previous.get(step)) chain.unshift(step);
      return chain;
    }
    for (const next of imports.get(file) ?? []) {
      if (previous.has(next)) continue;
      previous.set(next, file);
      queue.push(next);
    }
  }
  return null;
}

/** İstemci modüllerinden hedef dosyalara giden yollar ("istemci → … → hedef"). */
function leaks(src: string, targets: readonly string[]): string[] {
  const { imports, clients } = graphOf(src);
  const wanted = new Set(targets.map((target) => join(src, target)));
  return clients.flatMap((client) => {
    const chain = pathTo(imports, client, (file) => wanted.has(file));
    return chain ? [chain.map((file) => relative(src, file)).join(' → ')] : [];
  });
}

describe('istemci paketi kütüphaneyi dolaylı bile içe almaz', () => {
  const src = join(ROOT, 'src');

  test('istemci modülleri bulundu', () => {
    assert.ok(graphOf(src).clients.length > 50);
  });

  test("hiçbir istemci modülü (ve içe aldıkları, `src/components` dahil) kütüphanelerin kaynağına ya da İngilizce tablolarına varmaz", () => {
    assert.deepEqual(leaks(src, TARGETS), []);
  });

  test('library-titles.ts hiçbir şeye bağlı değil (yalnız tür)', () => {
    const { imports } = graphOf(src);
    assert.deepEqual(imports.get(join(src, 'data', 'library-titles.ts')), []);
  });

  test('library-text.ts kütüphanelerin Türkçe kaynağına varmaz; İngilizce tabloları sunucu için içe alır', () => {
    const { imports } = graphOf(src);
    const own = (imports.get(join(src, 'data', 'library-text.ts')) ?? []).map((file) => relative(src, file));
    for (const expected of ['data/attachment-library.en.ts', 'data/device-library.en.ts', 'data/exercise-library.en.ts', 'data/library-titles.ts']) {
      assert.ok(own.includes(expected), expected);
    }
    for (const target of ['data/exercise-library.ts', 'data/device-library.ts', 'data/attachment-library.ts']) {
      assert.equal(pathTo(imports, join(src, 'data', 'library-text.ts'), (file) => file === join(src, target)), null, target);
    }
  });
});

describe('tarayıcı dolaylı yolları yakalar (sentetik ağaç)', () => {
  function tree(files: Record<string, string>): string {
    const src = join(mkdtempSync(join(tmpdir(), 'bundle-')), 'src');
    for (const [name, content] of Object.entries(files)) {
      mkdirSync(dirname(join(src, name)), { recursive: true });
      writeFileSync(join(src, name), content);
    }
    return src;
  }
  const library = { 'data/exercise-library.ts': 'export const EXERCISE_LIBRARY = [];\n' };

  test('doğrudan içe aktarma', () => {
    const src = tree({ ...library, 'components/a.tsx': "'use client';\nimport { EXERCISE_LIBRARY } from '@/data/exercise-library';\nexport const A = EXERCISE_LIBRARY;\n" });
    assert.deepEqual(leaks(src, TARGETS), ['components/a.tsx → data/exercise-library.ts']);
  });

  test('bir `src/lib` yardımcısı üzerinden', () => {
    const src = tree({
      ...library,
      'lib/helper.ts': "import { EXERCISE_LIBRARY } from '../data/exercise-library.ts';\nexport const count = EXERCISE_LIBRARY.length;\n",
      'lib/deeper.ts': "export { count } from './helper.ts';\n",
      'app/x.tsx': "'use client';\nimport { count } from '@/lib/deeper';\nexport const X = count;\n",
    });
    assert.deepEqual(leaks(src, TARGETS), ['app/x.tsx → lib/deeper.ts → lib/helper.ts → data/exercise-library.ts']);
  });

  test('istemcinin içe aldığı `src/components` dosyası da; dinamik import da', () => {
    const src = tree({
      ...library,
      'data/exercise-library.en.ts': 'export const EXERCISE_LIBRARY_EN = {};\n',
      'components/shared.tsx': "import { EXERCISE_LIBRARY_EN } from '../data/exercise-library.en.ts';\nexport const S = EXERCISE_LIBRARY_EN;\n",
      'app/y.tsx': "'use client';\nimport { S } from '@/components/shared';\nexport const Y = S;\n",
      'app/z.tsx': "'use client';\nexport const load = () => import('../data/exercise-library.ts');\n",
    });
    assert.deepEqual(leaks(src, TARGETS).sort(), ['app/y.tsx → components/shared.tsx → data/exercise-library.en.ts', 'app/z.tsx → data/exercise-library.ts']);
  });

  test('yalnız tür getiren içe aktarmalar ve sunucu dosyaları sayılmaz', () => {
    const src = tree({
      ...library,
      'lib/server.ts': "import { EXERCISE_LIBRARY } from '../data/exercise-library.ts';\nexport type Item = (typeof EXERCISE_LIBRARY)[number];\n",
      'app/a.tsx': "'use client';\nimport type { Item } from '@/lib/server';\nexport const A: Item | null = null;\n",
      'app/b.tsx': "'use client';\nimport { type Item } from '@/lib/server';\nexport const B: Item | null = null;\n",
      'app/c.tsx': "import { EXERCISE_LIBRARY } from '@/data/exercise-library';\nexport const C = EXERCISE_LIBRARY;\n",
    });
    assert.deepEqual(leaks(src, TARGETS), []);
  });
});
