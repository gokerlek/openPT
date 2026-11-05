import { readFileSync } from 'node:fs';
import ts from 'typescript';

/**
 * Test yardımcısı: sözlüğe taşınmamış metni bulur (her görevin `src/i18n/audit/<görev>.test.ts`'i kendi dosyalarına
 * çalıştırır). TypeScript'in ayrıştırıcısıyla, yorumlar sayılmaz. Bulunanlar:
 * - Türkçe harf (ç ğ ı İ ö ş ü) ya da Türkçe harfi olmayan bilinen Türkçe sözcük ("Kaydet", "Ayarlar") geçen her dize
 *   ve şablon dizesi parçası,
 * - JSX metni (harf içeren),
 * - `aria-label`, `title`, `placeholder`, `alt` özniteliklerine yazılmış dize,
 * - `title`, `description`, `label`, `hint`, `message`, `error` … alanlarına yazılmış cümle (büyük harfle başlayan ya da
 *   boşluk içeren dize; `'kg'`, `'not_found'` gibi kodlar sayılmaz),
 * - `toast(…)`, `toast.x(…)`, `alert(…)`, `confirm(…)` çağrılarına verilen dize.
 * `allow`'daki bir düzene uyan metin sayılmaz (dillerin kendi adları, kimlikler, rota adları).
 */

const TURKISH = /[çğıİöşüÇĞÖŞÜ]/;
/** Türkçe harfi olmadığı için `TURKISH`'e takılmayan, İngilizcede sözcük olmayan yaygın arayüz sözcükleri. */
const ASCII_TURKISH =
  /\b(?:kaydet|kaydedildi|kaydedilemedi|ekle|eklendi|tamam|ayarlar|uygulama|devam|geri|yeni|hata|kapat|bitti|tekrar|genel|silindi|hareket|hareketler|programlar|antrenman|antrenmanlar|olarak|veya|icin|sonra|simdi|henuz|yok|zaten)\b/i;
const LETTER = /\p{L}/u;
const TEXT_ATTRIBUTES = new Set(['aria-label', 'title', 'placeholder', 'alt']);
const TEXT_PROPERTIES = new Set(['title', 'description', 'label', 'hint', 'placeholder', 'message', 'error', 'heading', 'caption', 'subtitle', 'summary']);
/** Kod değil cümle: büyük harfle başlar ya da boşluk içerir. */
const SENTENCE = /^\p{Lu}|\s/u;
const NOTICE_CALLS = new Set(['toast', 'alert', 'confirm']);

function isTurkish(text: string): boolean {
  return TURKISH.test(text) || ASCII_TURKISH.test(text);
}

function stringText(node: ts.Node): string | null {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : null;
}

function propertyName(name: ts.PropertyName): string | null {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : null;
}

/** `toast(…)`, `toast.success(…)`, `alert(…)`, `window.confirm(…)`. */
function isNoticeCall(callee: ts.Expression): boolean {
  if (ts.isIdentifier(callee)) return NOTICE_CALLS.has(callee.text);
  if (!ts.isPropertyAccessExpression(callee)) return false;
  if (ts.isIdentifier(callee.expression) && callee.expression.text === 'toast') return true;
  return NOTICE_CALLS.has(callee.name.text) && ts.isIdentifier(callee.expression) && callee.expression.text === 'window';
}

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
      if (ts.isPropertyAssignment(node)) {
        const name = propertyName(node.name);
        const text = stringText(node.initializer);
        if (name && text !== null && TEXT_PROPERTIES.has(name) && LETTER.test(text) && SENTENCE.test(text.trim())) {
          report(node.initializer, text);
          return;
        }
      }
      if (ts.isCallExpression(node) && isNoticeCall(node.expression)) {
        for (const argument of node.arguments) {
          const text = stringText(argument);
          if (text !== null && LETTER.test(text)) report(argument, text);
          else visit(argument);
        }
        return;
      }
      if (
        ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node)
      ) {
        if (isTurkish(node.text)) report(node, node.text);
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return found;
}
