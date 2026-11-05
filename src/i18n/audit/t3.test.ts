import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { findHardcodedText } from '../audit.ts';

/**
 * T3'ün (danışan uygulaması: Bugün, antrenman, Programlar, İlerleme, Geçmiş) dosyalarında sözlüğe taşınmamış metin yok.
 * Dosyalar görevin sahiplik kuralından toplanır (yeni dosya da denetlenir); testler sayılmaz.
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
 * buraya girmez, sözlüğe gider.
 */
const ALLOWED: readonly { file: RegExp; text: RegExp }[] = [
  // Uygulamanın kendi rotaları ve sorgu dizeleri (`/me/programlar/…`, `/me/antrenman?bitir=1`): adres, çevrilmez.
  { file: /^src\/(?:app\/me|lib)\//, text: /^\/me(?:[/?]|$)/ },
  // Antrenman odağının adres parametresi (`?hareket=`) ve İlerleme'nin bölüm kimlikleri (`#hareket-rekorlari`): kod.
  { file: /^src\/(?:lib\/workout-nav\.ts|components\/progress\/exercise-progress\.tsx)$/, text: /^(?:hareket|hareketler|hareket-rekorlari)$/ },
  // Web Bluetooth'un iç hatası: yakalanır, danışan sözlükteki "Bağlanılamadı…" metnini görür.
  { file: /^src\/app\/me\/antrenman\/use-heart-rate\.ts$/, text: /^GATT yok$/ },
  // Sunucu günlüğü (`deps.log`, `repo.log`, `console.error`): yalnız işletmeci okur, danışana gitmez.
  { file: /^src\/lib\/check-in-routes\.ts$/, text: /^(?:okunamadı\.|bozuk, yazılmadı\.|kaydedildi)$/ },
  { file: /^src\/lib\/me-constraint-routes\.ts$/, text: /^(?:\[kısıt\]|bozuk, yazılmadı\.)$/ },
  { file: /^src\/lib\/own-program-files\.ts$/, text: /^(?:satır okunamadı,|dosya okunamadı\.|\[kendi program\] oluşturuldu|danışan)$/ },
  { file: /^src\/lib\/own-program-routes\.ts$/, text: /^silindi$/ },
  { file: /^src\/lib\/pain-report-store\.ts$/, text: /^\[ağrı kısayolu\]$/ },
  { file: /^src\/lib\/progress-load\.ts$/, text: /^(?:: sağlık kaydı okunamadı \(|antrenman dosyası okunamadı\.|: haftalık hedefler okunamadı veya sabitlenemedi\.)$/ },
  { file: /^src\/lib\/workout-routes\.ts$/, text: /^(?:\[antrenman\]|okunamadı \(bozuk JSON\)\.|dokunuş okunamadı\.|dokunuş)$/ },
  {
    file: /^src\/lib\/session-files-core\.ts$/,
    text: /^(?:okunamadı \(bozuk JSON\)\.|satır okunamadı,|dosya okunamadı\.|: health\.json okunamadı; sağlık ayrıntısı yazılmadı\.|: proposals\.json okunamadı; öneriler yazılmadı\.)$/,
  },
  // Günlüğe düşen GitHub hataları: `session-routes` yanıtta durumuna göre sözlükteki metni verir (500 ve 422 → "Kayıt
  // gönderilemedi"), mesajları danışana gitmez.
  { file: /^src\/lib\/session-files-core\.ts$/, text: /^(?:beklenen biçimde değil\.|Kayıt sınırları aşıyor; gönderilen değişiklik kabul edilmedi\.)$/ },
  // Değişmez ihlali (programlama hatası): yol kurulamaz, birleştirme çağrısı yanlış. Yakalanmaz, günlüğe düşer.
  { file: /^src\/lib\/own-programs\.ts$/, text: /^Geçersiz program kimliği:$/ },
  { file: /^src\/lib\/session-merge\.ts$/, text: /^(?:Birleştirilecek belge yok\.|Farklı antrenmanlar birleştirilemez\.)$/ },
  // Okunamayan kendi programın tanısı: Programlar sayfası sözlükteki "okunamadı" metnini gösterir, bu dize gösterilmez.
  { file: /^src\/lib\/own-program-index\.ts$/, text: /^(?:Dosyadaki kimlik dosya adıyla uyuşmuyor\.|Dosya JSON olarak okunamadı\.)$/ },
  // Haftalık hedeflerin sistem commit'i (danışanın ya da PT'nin eylemi değil) ve yalnız günlüğe düşen hatası.
  { file: /^src\/lib\/weekly-goals\.ts$/, text: /^(?:Haftalık antrenman hedefleri sabitlendi|Haftalık hedefler kaydedilemedi\.)$/ },
];

describe('T3 dosyalarında gömülü metin yok', () => {
  const files = ownedFiles();

  test('sahiplik kuralı dosya bulur', () => {
    assert.ok(files.length > 100, `${files.length} dosya`);
    assert.ok(files.includes('src/app/me/antrenman/workout-screen.tsx'));
    assert.ok(files.includes('src/lib/schemas/session.ts'));
    assert.ok(!files.some((file) => file.startsWith('src/app/me/(sekmeler)/programlar/ai/') || file === 'src/lib/progression.ts'));
  });

  test('Türkçe dize, JSX metni, metin öznitelikleri ve bildirimler sözlükte', () => {
    const found = findHardcodedText(files.map((file) => join(ROOT, file)))
      .map(({ file, line, text }) => ({ file: relative(ROOT, file).split(sep).join('/'), line, text }))
      .filter(({ file, text }) => !ALLOWED.some((allowed) => allowed.file.test(file) && allowed.text.test(text)));
    assert.deepEqual(found, []);
  });

  test('izin listesinde kullanılmayan kayıt yok', () => {
    const found = findHardcodedText(files.map((file) => join(ROOT, file))).map(({ file, text }) => ({ file: relative(ROOT, file).split(sep).join('/'), text }));
    const unused = ALLOWED.filter((allowed) => !found.some(({ file, text }) => allowed.file.test(file) && allowed.text.test(text)));
    assert.deepEqual(unused, []);
  });
});
