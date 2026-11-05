import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

/**
 * Sözlüklerin hangi pakete girdiği: PT'ye özgü sözlükler (`pt-clients`, `pt-shell`, `install`, `setup`) danışanın
 * telefonuna gitmez, her isteği karşılayan `proxy.ts` kurulum sihirbazının büyük sözlüğünü yüklemez. Ölçü, statik `import`
 * zincirinin kapanışıdır (`import type` silinir, sayılmaz).
 */
const ROOT = join(import.meta.dirname, '..', '..', '..');
const SRC = join(ROOT, 'src');

function resolveImport(from: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith('@/')) base = join(SRC, specifier.slice(2));
  else if (specifier.startsWith('.')) base = join(dirname(from), specifier);
  else return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function importsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  return [...source.matchAll(/^\s*(?:import|export)\s+(type\s+)?(?:[^'"]*?from\s+)?['"]([^'"]+)['"]/gm)].flatMap((match) => (match[1] ? [] : [match[2]!]));
}

function closure(entries: readonly string[]): Set<string> {
  const seen = new Set<string>();
  const stack = [...entries];
  for (let file = stack.pop(); file; file = stack.pop()) {
    if (seen.has(file)) continue;
    seen.add(file);
    for (const specifier of importsOf(file)) {
      const resolved = resolveImport(file, specifier);
      if (resolved) stack.push(resolved);
    }
  }
  return seen;
}

function namespaces(files: Set<string>): string[] {
  return [...new Set([...files].flatMap((file) => relative(SRC, file).match(/^i18n\/messages\/([^/]+)\//)?.[1] ?? []))].sort();
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const isClientModule = (file: string) => /^\s*['"]use client['"]/.test(readFileSync(file, 'utf8').slice(0, 200));

describe('sözlük paketleri', () => {
  test('danışanın telefonundaki istemci modülleri PT sözlüklerini çekmez', () => {
    const entries = [
      ...walk(join(SRC, 'app', 'me')),
      ...walk(join(SRC, 'app', 'giris')),
      ...walk(join(SRC, 'app', 'join')),
      ...walk(join(SRC, 'components', 'workout')),
      ...walk(join(SRC, 'components', 'progress')),
      ...walk(join(SRC, 'components', 'ui')),
      ...readdirSync(join(SRC, 'components')).map((name) => join(SRC, 'components', name)),
    ].filter((file) => /\.tsx?$/.test(file) && !/\.test\./.test(file) && statSync(file).isFile() && isClientModule(file));
    assert.ok(entries.length > 40, `${entries.length} istemci modülü`);
    const used = namespaces(closure(entries));
    for (const forbidden of ['pt-clients', 'pt-shell', 'install', 'setup']) {
      assert.ok(!used.includes(forbidden), `${forbidden} danışan paketine giriyor (${used.join(', ')})`);
    }
  });

  test('doğrulama mesajları küçük `client-validation` sözlüğünde: şema PT metnini çekmez', () => {
    const used = namespaces(closure([join(SRC, 'lib', 'schemas', 'client.ts')]));
    assert.ok(used.includes('client-validation'), used.join(', '));
    assert.ok(!used.includes('pt-clients'), used.join(', '));
  });

  test('proxy her istekte kurulum sihirbazının sözlüğünü yüklemez', () => {
    const used = namespaces(closure([join(SRC, 'proxy.ts')]));
    assert.ok(!used.includes('install'), used.join(', '));
    assert.deepEqual(
      used.filter((name) => !['shell', 'github-access'].includes(name)),
      [],
    );
  });
});
