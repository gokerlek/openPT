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
    '/** Hazır egzersizin kimliğine göre adı: [Türkçe, İngilizce]. İngilizcesi olmayanın ikinci değeri Türkçesidir. */',
    'export const LIBRARY_TITLES: Readonly<Record<string, readonly [tr: string, en: string]>> = {',
    ...rows,
    '};',
    '',
  ].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) writeFileSync(TARGET, renderLibraryTitles());
