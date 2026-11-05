import { readFileSync } from 'node:fs';
import ts from 'typescript';

/**
 * Test yardımcısı: sözlüğe taşınmamış metni bulur (her görevin `src/i18n/audit/<görev>.test.ts`'i kendi dosyalarına
 * çalıştırır). TypeScript'in ayrıştırıcısıyla, yorumlar sayılmaz. Bulunanlar:
 * - Türkçe harf (ç ğ ı İ ö ş ü) geçen her dize ve şablon dizesi parçası,
 * - JSX metni (harf içeren),
 * - `aria-label`, `title`, `placeholder`, `alt` özniteliklerine yazılmış dize.
 * `allow`'daki bir düzene uyan metin sayılmaz (dillerin kendi adları, kimlikler, rota adları).
 */

const TURKISH = /[çğıİöşüÇĞÖŞÜ]/;
const LETTER = /\p{L}/u;
const TEXT_ATTRIBUTES = new Set(['aria-label', 'title', 'placeholder', 'alt']);

export type HardcodedText = { file: string; line: number; text: string };

export function findHardcodedText(files: readonly string[], options: { allow?: readonly RegExp[] } = {}): HardcodedText[] {
  const allow = options.allow ?? [];
  const found: HardcodedText[] = [];
  for (const file of files) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const report = (node: ts.Node, text: string) => {
      const value = text.trim();
      if (allow.some((pattern) => pattern.test(value))) return;
      found.push({ file, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, text: value });
    };
    const visit = (node: ts.Node): void => {
      // Modül yolları metin değil.
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
      if (ts.isJsxText(node)) {
        if (LETTER.test(node.text)) report(node, node.text);
        return;
      }
      if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
        const name = node.name.getText(source);
        if (TEXT_ATTRIBUTES.has(name) && LETTER.test(node.initializer.text)) {
          report(node.initializer, node.initializer.text);
          return;
        }
      }
      if (
        ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node)
      ) {
        if (TURKISH.test(node.text)) report(node, node.text);
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return found;
}
