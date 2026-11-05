import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findHardcodedText } from '../audit.ts';

/**
 * Bütün arayüz (`src/app/**`, `src/components/**`) sözlükte: görev görev denetimlerin (`t1`…`t5`, `foundation`) dışında
 * kalan dosyalar da (plan §7 I.3). Testler sayılmaz; `src/app/api/dev/**` taranmaz (deneme verisi araçları bilerek
 * Türkçe, plan §8.4); sözlük dosyaları (`messages/` klasörü) bu ağaçlarda yoksa da dışarıda.
 */
const ROOT = join(import.meta.dirname, '..', '..', '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return path === 'src/app/api/dev' || entry.name === 'messages' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const FILES = ['src/app', 'src/components'].flatMap(sourceFiles).sort();

/**
 * Arayüzde görünmeyen dizeler: her biri dosyasına (ya da dar bir dosya kalıbına) bağlı, nedeni yanında. Çevrilecek metin
 * buraya girmez, sözlüğe gider. Kullanılmayan kayıt testi düşürür. Sunucu günlüğü (`console.error(…)`, `log(…)`) burada
 * değil: çağrının içindeki metin ayrıca izinli (`insideLogCall`).
 */
const ALLOWED: readonly { file: RegExp; text: RegExp; reason: string }[] = [
  // Adresler ve adres parametreleri: kod, çevrilmez.
  { file: /^src\/(?:app\/me\/|components\/coach\/coach-(?:launcher|panel)\.tsx$)/, text: /^\/me(?:[/?]|$)/, reason: 'danışan uygulamasının rotaları' },
  { file: /^src\/components\/progress\/exercise-progress\.tsx$/, text: /^(?:hareket|hareketler|hareket-rekorlari)$/, reason: 'adres parametresi (`?hareket=`) ve bölüm kimliği' },
  { file: /^src\/app\/dashboard\/clients\/\[id\]\/screening\/(?:page|compare-select)\.tsx$/, text: /^yok$/, reason: 'adres değeri (`?onceki=yok`)' },
  // Dosya yolları, ortam değişkeni adları, sürüm öneki, örnek bağlantı, birim ve kısaltma: iki dilde aynı.
  { file: /^src\/app\/dashboard\/clients\/\[id\]\/program\/invalid-program-alert\.tsx$/, text: /^program\.json$/, reason: 'dosya adı' },
  { file: /^src\/app\/dashboard\/templates\/invalid-template-alert\.tsx$/, text: /^(?:data\/templates\/|\.json)$/, reason: 'dosya yolu' },
  { file: /^src\/app\/login\/page\.tsx$/, text: /^GITHUB_CLIENT_(?:ID|SECRET)$/, reason: 'ortam değişkeni adları' },
  { file: /^src\/app\/dashboard\/settings\/updates\/update-panel\.tsx$/, text: /^v$/, reason: 'sürüm numarasının öneki' },
  { file: /^src\/app\/dashboard\/exercises\/exercise-form\.tsx$/, text: /^https:\/\/www\.youtube\.com\/watch\?v=…$/, reason: 'örnek bağlantı (yer tutucu)' },
  { file: /^src\/components\/block-editor\/set-table\.tsx$/, text: /^(?:m|AMRAP)$/, reason: 'birim (metre) ve kısaltma' },
  // JSON yanıtının Türkçe anahtar değeri (sözleşme, ekranda yazılmaz).
  { file: /^src\/app\/api\/setup\/status\/route\.ts$/, text: /^uygulama$/, reason: '`githubBaglantisi` değeri' },
  // Kullanıcıya gösterilmeyen hatalar: yakalanır ya da yalnız günlüğe düşer; değişmez ihlali programlama hatasıdır.
  { file: /^src\/app\/me\/antrenman\/use-heart-rate\.ts$/, text: /^GATT yok$/, reason: 'Bluetooth iç hatası, danışan sözlükteki metni görür' },
  { file: /^src\/app\/api\/auth\/otp\/route\.ts$/, text: /^e-posta gönderilemedi\.$/, reason: 'yalnız sunucu günlüğüne yazılan sebep' },
  { file: /^src\/components\/block-editor\/editor-context\.ts$/, text: /^Hareket düzenleyicinin içinde kullanılmalı\.$/, reason: 'değişmez ihlali (sağlayıcısız çizim)' },
  // Veri repolarına yazılan commit mesajları: repo geçmişinde kalır, uygulamada gösterilmez.
  {
    file: /^src\/app\/api\/clients\/\[id\]\/(?:camera-measurements|constraints|screenings)\//,
    text: /^(?:Kamera ölçümü|Kısıt|İzin|Hareket testi) (?:kaydedildi|güncellendi|silindi|kaldırıldı|çöp kutusuna taşındı|geri yüklendi)$/,
    reason: 'sağlık kaydı commit mesajı',
  },
  { file: /^src\/app\/api\/setup\/init\/route\.ts$/, text: /^Kurulum: (?:uygulama ayarları|danışan listesi) oluşturuldu$/, reason: 'uygulama reposu commit mesajı' },
  { file: /^src\/app\/api\/setup\/logo\/route\.ts$/, text: /^Logo güncellendi$/, reason: 'uygulama reposu commit mesajı' },
];

/** Sunucu günlüğü çağrıları (`console.error`, `log(…)`): işletmeciye yazılır, kullanıcıya gitmez. */
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

const sourceLine = (file: string, line: number) => readFileSync(join(ROOT, file), 'utf8').split('\n')[line - 1] ?? '';

describe('bütün arayüzde gömülü metin yok', () => {
  test('dosya kümesi: `src/app` ve `src/components`, deneme araçları ve testler hariç', () => {
    assert.ok(FILES.length > 400, `${FILES.length} dosya`);
    for (const expected of ['src/app/layout.tsx', 'src/app/me/antrenman/workout-screen.tsx', 'src/components/exercise-card.tsx', 'src/app/api/clients/[id]/route.ts']) {
      assert.ok(FILES.includes(expected), expected);
    }
    assert.ok(!FILES.some((file) => file.startsWith('src/app/api/dev/') || /\.test\.tsx?$/.test(file)));
  });

  test('Türkçe dize, JSX metni, metin öznitelikleri ve bildirimler sözlükte; izin listesinde eskiyen kayıt yok', () => {
    const used = new Set<number>();
    const found = findHardcodedText(FILES.map((file) => join(ROOT, file)))
      .map(({ file, line, text }) => ({ file: file.slice(ROOT.length + 1), line, text }))
      .filter(({ file, line, text }) => {
        const index = ALLOWED.findIndex((entry) => entry.file.test(file) && entry.text.test(text));
        if (index >= 0) {
          used.add(index);
          return false;
        }
        return !insideLogCall(sourceLine(file, line), text);
      });
    assert.deepEqual(
      found.map(({ file, line, text }) => `${file}:${line}: ${text.slice(0, 80)}`),
      [],
    );
    assert.deepEqual(
      ALLOWED.flatMap((entry, index) => (used.has(index) ? [] : [`${entry.file}: ${entry.reason}`])),
      [],
      'kullanılmayan izin kayıtları',
    );
  });

  test('`i18n-followup` işaretçisi kalmadı (testler dışında bütün `src/`)', () => {
    const marked = sourceFiles('src').filter((file) => readFileSync(join(ROOT, file), 'utf8').includes('i18n-followup'));
    assert.deepEqual(marked, []);
  });
});
