import { writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { EXERCISE_LIBRARY } from '../src/data/exercise-library.ts';
import { EXERCISE_LIBRARY_EN } from '../src/data/exercise-library.en.ts';

// src/data/library-titles.ts: hazır egzersizlerin adı iki dilde, kimliğe göre. Küçük tutulur ki tarayıcı paketine
// 91 KB'lık kütüphane girmeden geçmişteki ad okuyanın diline çevrilebilsin (`localizedLibraryTitle`).
// Kütüphane ya da İngilizce tablo değişince: node --experimental-strip-types scripts/generate-library-titles.ts

const TARGET = fileURLToPath(new URL('../src/data/library-titles.ts', import.meta.url));

export function renderLibraryTitles(): string {
  const quote = (text: string) => `'${text.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
  const rows = EXERCISE_LIBRARY.map((exercise) => `  ${quote(exercise.id)}: [${quote(exercise.title)}, ${quote(EXERCISE_LIBRARY_EN[exercise.id]?.title || exercise.title)}],`);
  return [
    '// Üretildi: scripts/generate-library-titles.ts (elle değiştirme; `library-titles.test.ts` kütüphaneyle aynı olduğunu denetler).',
    "import type { Locale } from '../i18n/locale.ts';",
    '',
    '/** Hazır egzersizin kimliğine göre adı: [Türkçe, İngilizce]. İngilizcesi olmayanın ikinci değeri Türkçesidir. */',
    'export const LIBRARY_TITLES: Readonly<Record<string, readonly [tr: string, en: string]>> = {',
    ...rows,
    '};',
    '',
    '/**',
    ' * Geçmişte saklanan egzersiz adı (o günkü adın kopyası: set kaydı, geri bildirim, öneri) okuyanın dilinde: kopya o',
    " * kimliğin kütüphanedeki adıyla (herhangi bir dilde) aynıysa kütüphanenin bu dildeki adı; değilse kopya (PT'nin verdiği",
    ' * ad, sonradan değişen ya da silinen egzersiz). Türkçe çıktı değişmez; İngilizce kaydedilmiş geçmiş Türkçe okuyana',
    ' * Türkçe görünür. İstemci bileşenleri bunu BURADAN alır (`@/data/library-titles`): `library-text.ts` İngilizce metin',
    ' * tablolarını da içe alır, istemci paketine girmesin.',
    ' */',
    'export function localizedLibraryTitle(exerciseId: string, snapshot: string, locale: Locale): string {',
    '  const entry = Object.hasOwn(LIBRARY_TITLES, exerciseId) ? LIBRARY_TITLES[exerciseId] : undefined;',
    '  if (!entry || (snapshot !== entry[0] && snapshot !== entry[1])) return snapshot;',
    "  return locale === 'en' ? entry[1] : entry[0];",
    '}',
    '',
  ].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) writeFileSync(TARGET, renderLibraryTitles());
