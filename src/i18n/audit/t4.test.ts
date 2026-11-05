import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { findHardcodedText } from '../audit.ts';

/** Sağlık, tarama ve ölçüm görevinin (T4) dosyalarında sözlüğe taşınmamış metin yok. */
const ROOT = join(import.meta.dirname, '..', '..', '..');
const CLIENT = 'src/app/dashboard/clients/[id]';

/** Görevin klasörleri (içindeki bütün `.ts`/`.tsx`, testler hariç). */
const DIRECTORIES = [
  `${CLIENT}/constraints`,
  `${CLIENT}/screening`,
  `${CLIENT}/measurements`,
  'src/components/measurements',
  'src/app/api/clients/[id]/constraints',
  'src/app/api/clients/[id]/screenings',
  'src/app/api/clients/[id]/measurements',
  'src/app/api/clients/[id]/camera-measurements',
  'src/lib/pose',
];

const FILES = [
  `${CLIENT}/health-page.tsx`,
  `${CLIENT}/health-parts.ts`,
  `${CLIENT}/health-tabs.tsx`,
  `${CLIENT}/measurements-card.tsx`,
  ...[
    'screening',
    'screening-care',
    'constraints',
    'constraint-filter',
    'exercise-caution',
    'check-in',
    'health',
    'health-view',
    'health-respond',
    'measurement-log',
    'measurements',
    'measurement-trends',
    'exposure',
    'camera-preview',
    'client-care',
  ].map((name) => `src/lib/${name}.ts`),
  ...['health', 'constraint', 'measurement', 'camera-measurement'].map((name) => `src/lib/schemas/${name}.ts`),
];

function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/**
 * Arayüz metni olmayan dizeler:
 * - git commit mesajları (`updateHealth`'in son bağımsız değişkeni): danışanın repo'sunun geçmişinde kalır, ekranda
 *   gösterilmez ve dile göre değişmez;
 * - geliştirici günlüğü (`console.error`): kullanıcıya gitmez;
 * - `?onceki=yok`: adresteki kod.
 */
const ALLOW = [
  /^(Ölçüm|Kısıt|İzin|Hareket testi|Kamera ölçümü) (kaydedildi|güncellendi|silindi|kaldırıldı|çöp kutusuna taşındı|geri yüklendi)$/,
  /^\[sağlık\]$/,
  /^bilinmeyen hata$/,
  /^yok$/,
];

describe('T4 dosyalarında gömülü metin yok', () => {
  const files = [...DIRECTORIES.flatMap(sourceFiles), ...FILES];

  test('dosyalar bulundu', () => {
    assert.ok(files.length > 60, `yalnız ${files.length} dosya`);
  });

  test('Türkçe dize, JSX metni, metin öznitelikleri ve bildirimler sözlükte', () => {
    assert.deepEqual(
      findHardcodedText(
        files.map((file) => join(ROOT, file)),
        { allow: ALLOW },
      ).map(({ file, line, text }) => `${file.slice(ROOT.length + 1)}:${line}: ${text}`),
      [],
    );
  });
});
