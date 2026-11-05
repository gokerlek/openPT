import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { findHardcodedText } from '../audit.ts';

/**
 * T3'ün (danışan uygulaması: Bugün, antrenman, Programlar, İlerleme, Geçmiş) dosyalarında sözlüğe taşınmamış metin yok.
 * Dosyalar görevin sahiplik kuralından toplanır (yeni dosya da denetlenir); testler sayılmaz. Unutulan dil parametresi
 * denetimi bütün `src/` için `locale-args.test.ts`'te.
 */
const ROOT = join(import.meta.dirname, '..', '..', '..');

const DIRECTORIES = ['src/app/me', 'src/app/api/me', 'src/components/workout', 'src/components/progress'];
/** Başka görevlerin alt ağaçları: AI koç (T5). */
const EXCLUDED_DIRECTORIES = ['src/app/me/(sekmeler)/programlar/ai/', 'src/app/api/me/coach/'];
const LIBRARIES =
  /^src\/lib\/(?:session-[^/]+|workout-[^/]+|own-program-[^/]+|own-programs[^/]*|history-store|progress[^/]*|personal-records|weekly-goals|trend|muscle-progress|water|pain-report[^/]*|heart-rate|client-set-text|client-tabs|check-in-routes|me-constraint-routes|recommend|program-feedback|live-session)\.ts$/;
/** `session-core.ts` T2'nin, `progression.ts` temelin. */
const EXCLUDED_FILES = new Set(['src/lib/session-core.ts', 'src/lib/progression.ts']);

function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function ownedFiles(): string[] {
  const inDirectories = DIRECTORIES.flatMap(sourceFiles).filter((file) => !EXCLUDED_DIRECTORIES.some((dir) => file.startsWith(dir)));
  const libraries = sourceFiles('src/lib').filter((file) => LIBRARIES.test(file) && !EXCLUDED_FILES.has(file));
  return [...inDirectories, ...libraries, 'src/lib/schemas/session.ts'].sort();
}

/**
 * Arayüzde görünmeyen dizeler: her biri dosyasıyla (ya da dosya kalıbıyla) sınırlı, nedeni üstünde. Çevrilecek metin
 * buraya girmez, sözlüğe gider. Sunucu günlüğü (`deps.log`, `repo.log`, `console.error`) burada değil: çağrının içindeki
 * metin ayrıca izinli (`insideLogCall`).
 */
const ALLOWED: readonly { file: RegExp; text: RegExp }[] = [
  // Uygulamanın kendi rotaları ve sorgu dizeleri (`/me/programlar/…`, `/me/antrenman?bitir=1`): adres, çevrilmez.
  { file: /^src\/(?:app\/me\/|lib\/client-tabs\.ts$)/, text: /^\/me(?:[/?]|$)/ },
  // Antrenman odağının adres parametresi (`?hareket=`) ve İlerleme'nin bölüm kimlikleri (`#hareket-rekorlari`): kod.
  { file: /^src\/(?:lib\/workout-nav\.ts|components\/progress\/exercise-progress\.tsx)$/, text: /^(?:hareket|hareketler|hareket-rekorlari)$/ },
  // Web Bluetooth'un iç hatası: yakalanır, danışan sözlükteki "Bağlanılamadı…" metnini görür.
  { file: /^src\/app\/me\/antrenman\/use-heart-rate\.ts$/, text: /^GATT yok$/ },
  // Günlüğe düşen GitHub hataları: `session-routes` yanıtta durumuna göre sözlükteki metni verir (500 ve 422 → "Kayıt
  // gönderilemedi"), mesajları danışana gitmez.
  { file: /^src\/lib\/session-files-core\.ts$/, text: /^(?:beklenen biçimde değil\.|Kayıt sınırları aşıyor; gönderilen değişiklik kabul edilmedi\.)$/ },
  // Değişmez ihlali (programlama hatası): yol kurulamaz, birleştirme çağrısı yanlış. Yakalanmaz, günlüğe düşer.
  { file: /^src\/lib\/own-programs\.ts$/, text: /^Geçersiz program kimliği:$/ },
  { file: /^src\/lib\/session-merge\.ts$/, text: /^(?:Birleştirilecek belge yok\.|Farklı antrenmanlar birleştirilemez\.)$/ },
  // Okunamayan kendi programın tanısı: Programlar sayfası sözlükteki "okunamadı" metnini gösterir, bu dize gösterilmez.
  { file: /^src\/lib\/own-program-index\.ts$/, text: /^(?:Dosyadaki kimlik dosya adıyla uyuşmuyor\.|Dosya JSON olarak okunamadı\.)$/ },
  // Haftalık hedeflerin sistem commit'i (danışanın ya da PT'nin eylemi değil; veri reposunun geçmişi) ve yalnız günlüğe
  // düşen hatası (`progress-load.ts` yakalar).
  { file: /^src\/lib\/weekly-goals\.ts$/, text: /^(?:Haftalık antrenman hedefleri sabitlendi|Haftalık hedefler kaydedilemedi\.)$/ },
];

/** Sunucu günlüğü çağrıları (`console.error`, `deps.log(…)`, `repo.log(…)`): işletmeciye yazılır, danışana gitmez. */
const LOG_OPEN = /\b(?:console\.(?:error|warn|info|log)|log)\(/g;

/** Metin, satırdaki bir günlük çağrısının parantezleri içinde mi (satırın başka yerinde olması yetmez). */
function insideLogCall(source: string, text: string): boolean {
  const at = source.indexOf(text);
  if (at < 0) return false;
  for (const match of source.matchAll(LOG_OPEN)) {
    const from = match.index + match[0].length;
    if (from > at) continue;
    let depth = 1;
    for (let index = from; index < at && depth > 0; index += 1) {
      if (source[index] === '(') depth += 1;
      else if (source[index] === ')') depth -= 1;
    }
    if (depth > 0) return true;
  }
  return false;
}

function sourceLine(file: string, line: number): string {
  return readFileSync(join(ROOT, file), 'utf8').split('\n')[line - 1] ?? '';
}

describe('T3 dosyalarında gömülü metin yok', () => {
  const files = ownedFiles();

  test('sahiplik kuralı dosya bulur', () => {
    assert.ok(files.length > 100, `${files.length} dosya`);
    assert.ok(files.includes('src/app/me/antrenman/workout-screen.tsx'));
    assert.ok(files.includes('src/lib/schemas/session.ts'));
    assert.ok(!files.some((file) => file.startsWith('src/app/me/(sekmeler)/programlar/ai/') || file === 'src/lib/progression.ts'));
  });

  test('Türkçe dize, JSX metni, metin öznitelikleri ve bildirimler sözlükte; izin listesinde eskiyen kayıt yok', () => {
    const used = new Set<number>();
    const found = findHardcodedText(files.map((file) => join(ROOT, file)))
      .map(({ file, line, text }) => ({ file: relative(ROOT, file).split(sep).join('/'), line, text }))
      .filter(({ file, line, text }) => {
        const index = ALLOWED.findIndex((allowed) => allowed.file.test(file) && allowed.text.test(text));
        if (index >= 0) {
          used.add(index);
          return false;
        }
        return !insideLogCall(sourceLine(file, line), text);
      });
    assert.deepEqual(found, []);
    assert.deepEqual(
      ALLOWED.filter((_, index) => !used.has(index)),
      [],
      'kullanılmayan izin kayıtları',
    );
  });

  test('günlük çağrısı yalnız çağrının içindeki metni izinli kılar', () => {
    const line = "deps.log(`[seans] okunamadı: ${x}`); const ekran = 'Kaydedilemedi';";
    assert.equal(insideLogCall(line, 'okunamadı:'), true);
    assert.equal(insideLogCall(line, 'Kaydedilemedi'), false);
    assert.equal(insideLogCall("console.error('Kaydedilemedi', error);", 'Kaydedilemedi'), true);
    assert.equal(insideLogCall("toast.error('Kaydedilemedi'); log('x');", 'Kaydedilemedi'), false);
  });
});
