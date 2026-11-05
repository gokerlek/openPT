import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import ts from 'typescript';

/**
 * Arayüz dosyaları (`src/app/**`, `src/components/**`) Türkçe takma adları içe aktarmaz (plan §7 I.4): `MUSCLE_LABELS`,
 * `WEEKDAY_NAMES` gibi sabitler eski çağrılar için Türkçe kalır; arayüz `muscleLabels(locale)` gibi erişimciyi çağırır,
 * metin dışı kural gerekiyorsa dilsiz tabloyu (`MEASUREMENT_RULES`, `TEST_RULES`, `STRENGTH_WINDOW_KEYS`) okur. `src/lib`
 * dosyaları takma adı kullanabilir (dilsiz eski çağrılar), ama kapsamda `locale` varken okuyamaz: dil oradadır.
 * Yalnız türde geçmesi (`typeof GOAL_LABELS`) sayılmaz.
 * Takma ad elle listelenmez, kaynaktan bulunur: dışa verilen BÜYÜK_HARFLİ `const`, değeri Türkçeyle çağrılan bir erişimci
 * (`muscleLabels('tr')`, `text('tr').regions`, `x(DEFAULT_LOCALE)`); başka modülden yeniden dışa verilmesi de sayılır.
 */
const ROOT = join(import.meta.dirname, '..', '..', '..');
const SRC = join(ROOT, 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const parse = (file: string) =>
  ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

function resolveImport(from: string, specifier: string): string | null {
  const base = specifier.startsWith('@/') ? join(SRC, specifier.slice(2)) : specifier.startsWith('.') ? join(dirname(from), specifier) : null;
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (/\.tsx?$/.test(candidate) && existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Değer Türkçeyle çağrılmış bir erişimciden mi (`f('tr')`, `f(DEFAULT_LOCALE).alan`, `f('tr') as X`). */
function isTurkishAccessor(expression: ts.Expression): boolean {
  let node = expression;
  while (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)) {
    node = node.expression;
  }
  return ts.isCallExpression(node) && node.arguments.some((argument) => (ts.isStringLiteral(argument) && argument.text === 'tr') || (ts.isIdentifier(argument) && argument.text === 'DEFAULT_LOCALE'));
}

const isExported = (statement: ts.Statement) => ts.canHaveModifiers(statement) && (ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false);

/** Dosya → dışa verdiği Türkçe takma adlar. */
function turkishAliases(files: readonly string[]): Map<string, Set<string>> {
  const aliases = new Map<string, Set<string>>();
  const add = (file: string, name: string) => {
    if (!aliases.has(file)) aliases.set(file, new Set());
    aliases.get(file)!.add(name);
  };
  const reexports: { file: string; from: string; name: string; as: string }[] = [];
  for (const file of files) {
    for (const statement of parse(file).statements) {
      if (ts.isVariableStatement(statement) && isExported(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name) && /^[A-Z][A-Z0-9_]+$/.test(declaration.name.text) && declaration.initializer && isTurkishAccessor(declaration.initializer)) {
            add(file, declaration.name.text);
          }
        }
      } else if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        const from = resolveImport(file, statement.moduleSpecifier.text);
        if (from) for (const element of statement.exportClause.elements) reexports.push({ file, from, name: (element.propertyName ?? element.name).text, as: element.name.text });
      }
    }
  }
  // Yeniden dışa vermeler zincir olabilir: yeni ad çıkmayana kadar.
  for (let changed = true; changed; ) {
    changed = false;
    for (const { file, from, name, as } of reexports) {
      if (aliases.get(from)?.has(name) && !aliases.get(file)?.has(as)) {
        add(file, as);
        changed = true;
      }
    }
  }
  return aliases;
}

const ALL = sourceFiles(SRC);
const ALIASES = turkishAliases(ALL);
const UI = ALL.filter((file) => file.startsWith(join(SRC, 'app') + sep) || file.startsWith(join(SRC, 'components') + sep));
const LIB = ALL.filter((file) => file.startsWith(join(SRC, 'lib') + sep));
const path = (file: string) => relative(ROOT, file).split(sep).join('/');

const bindsLocale = (name: ts.BindingName): boolean =>
  ts.isIdentifier(name) ? name.text === 'locale' : name.elements.some((element) => !ts.isOmittedExpression(element) && bindsLocale(element.name));

/** Kapsamda `locale` adlı değişken: kuşatan işlevin parametresi ya da kuşatan blokta, döngüde, dosyada bildirilmiş. */
function localeInScope(node: ts.Node): boolean {
  for (let scope = node.parent; scope; scope = scope.parent) {
    if (ts.isFunctionLike(scope) && scope.parameters.some((parameter) => bindsLocale(parameter.name))) return true;
    if ((ts.isForOfStatement(scope) || ts.isForInStatement(scope) || ts.isForStatement(scope)) && scope.initializer && ts.isVariableDeclarationList(scope.initializer)) {
      if (scope.initializer.declarations.some((declaration) => bindsLocale(declaration.name))) return true;
    }
    if (ts.isBlock(scope) || ts.isSourceFile(scope) || ts.isCaseClause(scope) || ts.isDefaultClause(scope)) {
      if (scope.statements.some((statement) => ts.isVariableStatement(statement) && statement.declarationList.declarations.some((declaration) => bindsLocale(declaration.name)))) return true;
    }
  }
  return false;
}

/** Ad yalnız türde mi (`typeof X`, `typeof X.y`): çalışırken metin okunmaz. */
function inTypeQuery(node: ts.Node): boolean {
  let child: ts.Node = node;
  while (ts.isQualifiedName(child.parent)) child = child.parent;
  return ts.isTypeQueryNode(child.parent);
}

/** `src/lib` dosyasının Türkçe takma ad okuduğu ve kapsamda dilin olduğu yerler. */
function libAliasReads(file: string): string[] {
  const source = parse(file);
  const local = new Map<string, string>([...(ALIASES.get(file) ?? [])].map((name) => [name, `${name} (${path(file)})`]));
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const target = resolveImport(file, statement.moduleSpecifier.text);
    const names = target ? ALIASES.get(target) : undefined;
    const bindings = statement.importClause?.namedBindings;
    if (!names || !bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      const name = (element.propertyName ?? element.name).text;
      if (names.has(name)) local.set(element.name.text, `${name} (${path(target!)})`);
    }
  }
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && local.has(node.text)) {
      const parent = node.parent;
      const declaration = ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent) || (ts.isVariableDeclaration(parent) && parent.name === node);
      const member = (ts.isPropertyAccessExpression(parent) && parent.name === node) || (ts.isPropertyAssignment(parent) && parent.name === node);
      if (!declaration && !member && !inTypeQuery(node) && localeInScope(node)) {
        found.push(`${path(file)}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}: ${local.get(node.text)}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe('arayüz Türkçe takma adları içe aktarmaz', () => {
  test('takma adlar kaynaktan bulunur', () => {
    const names = new Set([...ALIASES.values()].flatMap((set) => [...set]));
    for (const expected of ['MUSCLE_LABELS', 'EQUIPMENT_LABELS', 'CATEGORY_LABELS', 'BLOCK_KIND_LABELS', 'OUTCOME_LABELS', 'WEEKDAY_NAMES', 'SCREENING_TESTS', 'MEASUREMENTS']) {
      assert.ok(names.has(expected), expected);
    }
    assert.ok(names.size > 100, `${names.size} takma ad`);
    assert.ok(UI.length > 400, `${UI.length} arayüz dosyası`);
  });

  test('`src/app/**` ve `src/components/**` Türkçe takma ad içe aktarmaz (erişimciyi dille çağırır)', () => {
    const found: string[] = [];
    for (const file of UI) {
      for (const statement of parse(file).statements) {
        const specifier = (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : null;
        const target = specifier ? resolveImport(file, specifier) : null;
        const names = target ? ALIASES.get(target) : undefined;
        if (!names) continue;
        const bindings = ts.isImportDeclaration(statement) ? statement.importClause?.namedBindings : ts.isExportDeclaration(statement) ? statement.exportClause : undefined;
        if (!bindings || ts.isNamespaceImport(bindings) || ts.isNamespaceExport(bindings)) continue;
        for (const element of bindings.elements) {
          const name = (element.propertyName ?? element.name).text;
          if (names.has(name)) found.push(`${path(file)}: ${name} (${path(target!)})`);
        }
      }
    }
    assert.deepEqual(found, []);
  });

  test('`src/lib`: kapsamda dil varken Türkçe takma ad okunmaz (erişimci dille ya da dilsiz tablo)', () => {
    assert.ok(LIB.length > 200, `${LIB.length} kütüphane dosyası`);
    assert.deepEqual(LIB.flatMap(libAliasReads), []);
  });
});
