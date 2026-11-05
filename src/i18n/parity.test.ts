import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Bütün sözlükler (`messages/<ad>/index.ts`, merkezi kayıt yok: her görev kendi alanını ekler) iki dilde aynı şekilde:
 * aynı anahtarlar, aynı değer türleri, fonksiyonların parametre sayısı ve dizilerin uzunluğu eşit; İngilizcede Türkçe
 * harf yok (dillerin kendi adları hariç). Eksik/fazla anahtarı `tsc` de yakalar; bu, tür silinince kalan farkları.
 */

const MESSAGES_DIR = join(import.meta.dirname, 'messages');
/** İngilizce metinde Türkçe harf: unutulmuş çeviri. */
const TURKISH = /[çğıİşÇĞŞ]/;
/** İngilizcede geçebilecek Türkçe adlar (dil seçicinin "Türkçe"si gibi). */
const ALLOW = [/Türkçe/g];

function withoutAllowed(text: string): string {
  return ALLOW.reduce((rest, pattern) => rest.replace(pattern, ''), text);
}

function kind(value: unknown): string {
  return Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
}

/** İki ağacın farkları (yol: açıklama). */
function differences(tr: unknown, en: unknown, path: string, out: string[]): string[] {
  if (kind(tr) !== kind(en)) {
    out.push(`${path}: ${kind(tr)} ≠ ${kind(en)}`);
    return out;
  }
  if (typeof tr === 'function' && typeof en === 'function') {
    if (tr.length !== en.length) out.push(`${path}: ${tr.length} parametre ≠ ${en.length}`);
    if (TURKISH.test(withoutAllowed(String(en)))) out.push(`${path}: İngilizce fonksiyonda Türkçe harf`);
    return out;
  }
  if (typeof en === 'string') {
    if (TURKISH.test(withoutAllowed(en))) out.push(`${path}: İngilizcede Türkçe harf: ${en}`);
    return out;
  }
  if (Array.isArray(tr) && Array.isArray(en)) {
    if (tr.length !== en.length) out.push(`${path}: ${tr.length} öğe ≠ ${en.length}`);
    tr.forEach((item, index) => differences(item, en[index], `${path}[${index}]`, out));
    return out;
  }
  if (kind(tr) === 'object') {
    const trKeys = Object.keys(tr as object).sort();
    const enKeys = Object.keys(en as object).sort();
    for (const key of trKeys.filter((key) => !enKeys.includes(key))) out.push(`${path}.${key}: İngilizcede yok`);
    for (const key of enKeys.filter((key) => !trKeys.includes(key))) out.push(`${path}.${key}: Türkçede yok`);
    for (const key of trKeys.filter((key) => enKeys.includes(key))) {
      differences((tr as Record<string, unknown>)[key], (en as Record<string, unknown>)[key], `${path}.${key}`, out);
    }
  }
  return out;
}

const namespaces = readdirSync(MESSAGES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(MESSAGES_DIR, entry.name, 'index.ts')))
  .map((entry) => entry.name)
  .sort();

describe('sözlükler iki dilde aynı şekilde', () => {
  test('alanlar bulundu', () => {
    for (const name of ['common', 'shell']) assert.ok(namespaces.includes(name), name);
  });

  for (const name of namespaces) {
    test(name, async () => {
      const namespace = (await import(pathToFileURL(join(MESSAGES_DIR, name, 'index.ts')).href)) as Record<string, unknown>;
      const exported = Object.entries(namespace).filter(
        ([, value]) => typeof value === 'function' && 'dictionary' in value,
      ) as [string, { dictionary: { tr: unknown; en: unknown } }][];
      assert.ok(exported.length > 0, `${name}/index.ts defineMessages dışa açmıyor`);
      for (const [exportName, messages] of exported) {
        assert.deepEqual(differences(messages.dictionary.tr, messages.dictionary.en, exportName, []), []);
      }
    });
  }
});
