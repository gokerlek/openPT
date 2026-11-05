import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { findHardcodedText } from '../audit.ts';

/**
 * T2 (PT kabuğu, danışan kayıtları, giriş, kurulum, arayüz kiti) dosyalarında sözlüğe taşınmamış metin yok.
 * Dosya listesi görevin sahiplik listesinden (plan §7) kurulur; yeni bir dosya o dizine eklenince otomatik taranır.
 */
const ROOT = join(import.meta.dirname, '..', '..', '..');
const SRC = join(ROOT, 'src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** Yalnız bu dizinin kendi dosyaları (alt dizinler hariç). */
function own(dir: string): string[] {
  return readdirSync(dir)
    .map((name) => join(dir, name))
    .filter((path) => statSync(path).isFile());
}

const DASHBOARD = join(SRC, 'app', 'dashboard');
const CLIENT = join(DASHBOARD, 'clients', '[id]');
const LIB = join(SRC, 'lib');

const SOURCES = [
  ...own(DASHBOARD),
  ...walk(join(DASHBOARD, '[...rest]')),
  ...walk(join(DASHBOARD, 'settings')).filter((path) => !path.includes(`${join(DASHBOARD, 'settings', 'ai')}/`)),
  ...own(join(DASHBOARD, 'clients')),
  ...walk(join(DASHBOARD, 'clients', 'new')),
  ...['layout', 'page', 'loading', 'client-tabs', 'client-title', 'live-session'].flatMap((name) =>
    own(CLIENT).filter((path) => path.startsWith(join(CLIENT, `${name}.`))),
  ),
  ...['edit', 'invite', 'sessions', 'ilerleme'].flatMap((name) => walk(join(CLIENT, name))),
  ...['giris', 'join', 'login', 'setup', 'install'].flatMap((name) => walk(join(SRC, 'app', name))),
  ...own(join(SRC, 'components')).filter((path) => !/\/(providers|not-found-view)\.tsx$/.test(path)),
  ...['ui', 'list', 'swipe', 'dock', 'muscle-map', 'install'].flatMap((name) => walk(join(SRC, 'components', name))),
  // `api/dev/**` aşağıda dışarıda (gerekçesi orada).
  ...['auth', 'install', 'setup', 'updates', 'giris', 'join', 'notices', 'live', 'brand'].flatMap((name) => walk(join(SRC, 'app', 'api', name))),
  join(SRC, 'app', 'api', 'clients', 'route.ts'),
  join(SRC, 'app', 'api', 'clients', '[id]', 'route.ts'),
  ...['invite', 'revoke', 'live'].flatMap((name) => walk(join(SRC, 'app', 'api', 'clients', '[id]', name))),
  ...[
    'clients', 'clients-core', 'client-record', 'client-status', 'attention', 'notices', 'notices-store', 'live-store', 'live-text',
    'pt-sessions', 'pt-login', 'session', 'session-core', 'guards', 'client-auth', 'client-auth-routes', 'client-access',
    'password-rules', 'mail', 'env', 'config', 'config-update', 'github-oauth', 'theme-palette', 'client-card-extras',
  ].map((name) => join(LIB, `${name}.ts`)),
  ...['github', 'installation', 'updates'].flatMap((name) => walk(join(LIB, name))),
  ...['auth', 'setup', 'config', 'client'].map((name) => join(LIB, 'schemas', `${name}.ts`)),
]
  .filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path))
  .sort();

/*
 * Taranmayanlar:
 * - `src/app/api/dev/**` ve `src/lib/demo-*.ts`: yalnız geliştirmede çalışan deneme verisi araçları; mesajları ve tohum
 *   verisi (`SEED_MESSAGE`, "Alt vücut" günleri) bilerek Türkçe (plan §8.4).
 * - Testler.
 */

/** İzinli metinler: her biri kullanıcıya gösterilmeyen bir şey. */
const ALLOW: readonly RegExp[] = [
  // Dillerin kendi adı.
  /^Türkçe$/,
  // Ortam değişkeni adları (çevrilmez): giriş sayfasının `<code>` içindeki adları.
  /^GITHUB_[A-Z_]+$/,
  // Giriş kodu gönderilemeyince yalnız sunucu günlüğüne yazılan sebep (`api/auth/otp`).
  /^e-posta gönderilemedi\.$/,
  // Sürüm numarasının "v" öneki.
  /^v$/,
  // `/api/setup/status` yanıtının Türkçe anahtar değerleri (JSON sözleşmesi, ekranda yazılmaz).
  /^uygulama$/,
  // Yaygın şifre listesinde Türkçe bir şifre (veri, ekranda yazılmaz).
  /^antrenman$/,
  // Eski vurgu rengi listesi (`ACCENT_PRESETS`): arayüzde kullanılmaz, `color.test.ts` kaynağından okur.
  /^(Tema|Nane|Gökyüzü|Lavanta|Gül|Kehribar|Turuncu|Grafit)$/,
  // Hazır paletlerin adları marka adı gibi çevrilmez.
  /^(Volt|Ocean|Forest|Violet|Ember|Slate)$/,
  // PT'nin GitHub hesabında bir kez açılan repoların açıklaması (GitHub'daki üst veri, ekranda yazılmaz).
  /^openPT — uygulama ayarları ve antrenman kütüphanesi$/,
  /^openPT danışan verisi$/,
  // Kod reposuna eklenen güncelleme dosyasının commit mesajı (zaten İngilizce).
  /^Set up openPT automatic updates$/,
  // PT'nin veri repolarına yazılan commit mesajları: depo geçmişinde görünür, uygulamada hiçbir yerde gösterilmez ve
  // bir önbellek (`unstable_cache`) ya da arka plan işi içinde yazılırlar (istek dili okunamaz).
  /^(Danışan (güncellendi|durumu değişti|silindi|giriş yaptı|şifre belirledi|eklendi|kaydı oluşturuldu)|Yeni (davet|giriş) kodu|Davet kullanıldı|Kare kodla girildi: eski şifre geçersiz|Danışanın erişimi kapatıldı|Şifreyle giriş (denendi|yapıldı)|Şifre girişi kapandı: çok sayıda yanlış deneme|Sağlık verisi onayı (verildi|geri çekildi)|Giriş kodu (denendi|kullanıldı)|Görünüm ayarları güncellendi|Kurulum tamamlandı|Logo (ayarı güncellendi|ayarı temizlendi|güncellendi|kaldırıldı)|Eski logo kaldırıldı|Kurulum: .*)$/,
];

/** Sunucu günlüğü satırları (`console.error`, `log(...)`): geliştiriciye yazılır, kullanıcıya gösterilmez. */
const LOG_CALL = /\b(?:console\.(?:error|warn|info|log)|log)\(/;

function sourceLine(file: string, line: number): string {
  return readFileSync(file, 'utf8').split('\n')[line - 1] ?? '';
}

describe('T2 dosyalarında gömülü metin yok', () => {
  test('dosya listesi bulundu', () => {
    assert.ok(SOURCES.length > 200, `${SOURCES.length} dosya`);
    for (const expected of ['src/app/giris/page.tsx', 'src/lib/attention.ts', 'src/components/date-picker.tsx', 'src/app/install/installation-wizard.tsx']) {
      assert.ok(SOURCES.includes(join(ROOT, expected)), expected);
    }
    assert.ok(!SOURCES.some((path) => path.includes('/api/dev/') || /\/demo-[^/]*\.ts$/.test(path)));
  });

  test('Türkçe dize, JSX metni ve metin öznitelikleri sözlükte', () => {
    const found = findHardcodedText(SOURCES, { allow: ALLOW }).filter(({ file, line }) => !LOG_CALL.test(sourceLine(file, line)));
    assert.deepEqual(
      found.map(({ file, line, text }) => `${relative(ROOT, file)}:${line}: ${text.slice(0, 80)}`),
      [],
    );
  });
});
