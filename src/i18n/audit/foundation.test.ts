import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findHardcodedText } from '../audit.ts';

/** Temel görevin (F) dosyalarında sözlüğe taşınmamış metin yok. */
const ROOT = join(import.meta.dirname, '..', '..', '..');
const FILES = [
  'src/app/layout.tsx',
  'src/app/error.tsx',
  'src/app/not-found.tsx',
  'src/app/manifest.webmanifest/route.ts',
  'src/app/panel.webmanifest/route.ts',
  'src/app/offline/route.ts',
  'src/components/providers.tsx',
  'src/components/not-found-view.tsx',
  'src/proxy.ts',
  'src/i18n/locale.ts',
  'src/i18n/define.ts',
  'src/i18n/text.ts',
  'src/i18n/errors.ts',
  'src/i18n/valibot.ts',
  'src/i18n/server.ts',
  'src/i18n/client.tsx',
  'src/i18n/locale-switch.tsx',
  'src/lib/client-manifest.ts',
  'src/lib/panel-manifest.ts',
  'src/lib/offline-page.ts',
  'src/lib/format.ts',
  'src/lib/navigation.ts',
  'src/lib/query/errors.ts',
  'src/lib/query/client.ts',
  'src/data/library-text.ts',
];

describe('temel dosyalarda gömülü metin yok', () => {
  test('Türkçe dize, JSX metni ve metin öznitelikleri sözlükte', () => {
    // Dillerin kendi adları çevrilmez (`LOCALE_NAMES`).
    assert.deepEqual(findHardcodedText(FILES.map((file) => join(ROOT, file)), { allow: [/^Türkçe$/] }), []);
  });

  test('yardımcı bulur: Türkçe dize, JSX metni, metin öznitelikleri; yorum, modül yolu, ASCII dize ve izinli metin sayılmaz', () => {
    const dir = mkdtempSync(join(tmpdir(), 'i18n-audit-'));
    const file = join(dir, 'ornek.tsx');
    writeFileSync(
      file,
      [
        "import x from './şablon'; // 'Yorum sayılmaz'",
        "const a = 'Değiştir';",
        "const g = 'Save';",
        'const b = <p>Save</p>;',
        'const c = <i aria-label="Close" data-x="ok" />;',
        'const d = `Çıkış ${a}`;',
        "const e = <p>{' · '}{x}</p>;",
        "const f = 'Türkçe';",
      ].join('\n'),
    );
    try {
      assert.deepEqual(
        findHardcodedText([file], { allow: [/^Türkçe$/] }).map(({ line, text }) => ({ line, text })),
        [
          { line: 2, text: 'Değiştir' },
          { line: 4, text: 'Save' },
          { line: 5, text: 'Close' },
          { line: 6, text: 'Çıkış' },
        ],
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('yardımcı bulur: Türkçe harfsiz Türkçe sözcük, metin alanına yazılmış cümle, bildirim çağrısı; kodlar sayılmaz', () => {
    const dir = mkdtempSync(join(tmpdir(), 'i18n-audit-'));
    const file = join(dir, 'ornek.tsx');
    writeFileSync(
      file,
      [
        "export const metadata = { title: 'Uygulama' };",
        "const a = ['Kaydet', 'flex gap-2 [--x:var(--y)]'];",
        "const b = { label: 'kg', error: 'not_found', description: 'Shown to people' };",
        "toast.success('Saved');",
        "window.confirm('Delete?');",
        "const c = { hint: 'Add the band' };",
      ].join('\n'),
    );
    try {
      assert.deepEqual(
        findHardcodedText([file]).map(({ line, text }) => ({ line, text })),
        [
          { line: 1, text: 'Uygulama' },
          { line: 2, text: 'Kaydet' },
          { line: 3, text: 'Shown to people' },
          { line: 4, text: 'Saved' },
          { line: 5, text: 'Delete?' },
          { line: 6, text: 'Add the band' },
        ],
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
