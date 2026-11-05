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

/**
 * İzinli metinler: her biri bir dosyaya bağlı (başka dosyada aynı metin sayılır) ve kullanıcıya gösterilmeyen bir şey.
 * Kullanılmayan kayıt testi düşürür (eskiyen izin kalmasın).
 */
const ALLOW: readonly { file: string; text: RegExp; reason: string }[] = [
  { file: 'src/app/login/page.tsx', text: /^GITHUB_CLIENT_(ID|SECRET)$/, reason: 'ortam değişkeni adları (`<code>` içinde), çevrilmez' },
  { file: 'src/app/dashboard/settings/updates/update-panel.tsx', text: /^v$/, reason: 'sürüm numarasının "v" öneki' },
  { file: 'src/app/api/setup/status/route.ts', text: /^uygulama$/, reason: '`/api/setup/status` yanıtının Türkçe anahtar değeri (JSON sözleşmesi, ekranda yazılmaz)' },
  { file: 'src/app/api/auth/otp/route.ts', text: /^e-posta gönderilemedi\.$/, reason: 'giriş kodu gönderilemeyince yalnız sunucu günlüğüne yazılan sebep' },
  { file: 'src/lib/password-rules.ts', text: /^antrenman$/, reason: 'yaygın şifre listesinde bir şifre (veri)' },
  {
    file: 'src/lib/schemas/setup.ts',
    text: /^(Tema|Nane|Gökyüzü|Lavanta|Gül|Kehribar|Turuncu|Grafit)$/,
    reason: 'eski vurgu rengi listesi (`ACCENT_PRESETS`): arayüzde kullanılmaz, `color.test.ts` kaynağından okur',
  },
  { file: 'src/lib/theme-palette.ts', text: /^(Volt|Ocean|Forest|Violet|Ember|Slate)$/, reason: 'hazır paletlerin adları marka adı gibi çevrilmez' },
  {
    file: 'src/lib/github/repos.ts',
    text: /^(openPT — uygulama ayarları ve antrenman kütüphanesi|openPT danışan verisi)$/,
    reason: "PT'nin GitHub hesabında bir kez açılan repoların açıklaması (GitHub'daki üst veri, ekranda yazılmaz)",
  },
  { file: 'src/lib/installation/update-workflow.ts', text: /^Set up openPT automatic updates$/, reason: 'kod reposuna eklenen güncelleme dosyasının commit mesajı (zaten İngilizce)' },
  // PT'nin veri repolarına yazılan commit mesajları: depo geçmişinde görünür, uygulamada hiçbir yerde gösterilmez ve bir
  // önbellek (`unstable_cache`) ya da arka plan işi içinde yazılırlar (istek dili okunamaz).
  {
    file: 'src/lib/clients-core.ts',
    text: /^(Danışan (güncellendi|durumu değişti|silindi|giriş yaptı|şifre belirledi)|Yeni davet kodu|Davet kullanıldı|Kare kodla girildi: eski şifre geçersiz|Danışanın erişimi kapatıldı|Şifreyle giriş (denendi|yapıldı)|Şifre girişi kapandı: çok sayıda yanlış deneme|Sağlık verisi onayı (verildi|geri çekildi))$/,
    reason: 'veri reposu commit mesajı',
  },
  { file: 'src/lib/clients.ts', text: /^(Danışan kaydı oluşturuldu|Danışan eklendi)$/, reason: 'veri reposu commit mesajı' },
  {
    file: 'src/lib/config-update.ts',
    text: /^(Görünüm ayarları güncellendi|Kurulum tamamlandı|Logo ayarı güncellendi|Logo ayarı temizlendi|Eski logo kaldırıldı|Logo kaldırıldı)$/,
    reason: 'uygulama reposu commit mesajı',
  },
  { file: 'src/lib/session-core.ts', text: /^(Yeni giriş kodu|Giriş kodu denendi|Giriş kodu kullanıldı)$/, reason: 'uygulama reposu commit mesajı' },
  { file: 'src/app/api/setup/init/route.ts', text: /^Kurulum: (uygulama ayarları|danışan listesi) oluşturuldu$/, reason: 'uygulama reposu commit mesajı' },
  { file: 'src/app/api/setup/logo/route.ts', text: /^Logo güncellendi$/, reason: 'uygulama reposu commit mesajı' },
];

/** Sunucu günlüğü çağrıları (`console.error`, `log(...)`): geliştiriciye yazılır, kullanıcıya gösterilmez. */
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
    const used = new Set<number>();
    const found = findHardcodedText(SOURCES).filter(({ file, line, text }) => {
      const path = relative(ROOT, file);
      const index = ALLOW.findIndex((entry) => entry.file === path && entry.text.test(text));
      if (index >= 0) {
        used.add(index);
        return false;
      }
      return !insideLogCall(sourceLine(file, line), text);
    });
    assert.deepEqual(
      found.map(({ file, line, text }) => `${relative(ROOT, file)}:${line}: ${text.slice(0, 80)}`),
      [],
    );
    assert.deepEqual(
      ALLOW.flatMap((entry, index) => (used.has(index) ? [] : [`${entry.file}: ${entry.reason}`])),
      [],
      'kullanılmayan izin kayıtları',
    );
  });

  test('günlük çağrısı yalnız çağrının içindeki metni izinli kılar', () => {
    const line = "store.log(`[ayar] okunamadı: ${x}`); const ekran = 'Kaydedilemedi';";
    assert.equal(insideLogCall(line, 'okunamadı:'), true);
    assert.equal(insideLogCall(line, 'Kaydedilemedi'), false);
    assert.equal(insideLogCall("console.error('Kaydedilemedi', error);", 'Kaydedilemedi'), true);
    assert.equal(insideLogCall("toast.error('Kaydedilemedi'); log('x');", 'Kaydedilemedi'), false);
  });

  test("`import 'server-only'` içe aktarmaların ilkidir (sınırı önce koyar)", () => {
    const late = SOURCES.filter((file) => {
      const imports = readFileSync(file, 'utf8').match(/^\s*import\b[^\n]*$/gm) ?? [];
      const index = imports.findIndex((line) => /^\s*import\s+['"]server-only['"]/.test(line));
      return index > 0;
    });
    assert.deepEqual(late.map((file) => relative(ROOT, file)), []);
  });
});
