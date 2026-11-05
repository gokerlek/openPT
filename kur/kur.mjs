/**
 * openPT — tek komutla kurulum (`kur`).
 *
 *   node --input-type=module -e "$(curl -fsSL https://raw.githubusercontent.com/gokerlek/openPT/main/kur/kur.mjs)"
 *
 * Tek dosya, bağımlılıksız (yalnız Node yerleşikleri), Node 20+, macOS ve Linux. `-e` ile ESM olarak
 * değerlendirilir: başka dosya import etmez, `import.meta.url` ve `process.argv[1]`e dayanmaz.
 * Saf parçalar dışa aktarılır ve `kur/kur.test.mjs` ile sınanır; `AXON_KUR_TEST=1` iken ana akış başlamaz.
 * Ekrana yazılan her metin `MESSAGES` içinde Türkçe ve İngilizce durur; dil `KUR_LANG` ya da sistemin yerel
 * ayarından seçilir (`detectLang`) ve `ctx.lang` ile taşınır.
 * Eski Node'da da sürüm mesajı görünsün diye yalnız eski sürümlerde de olan modüller en üstte içe
 * aktarılır (`readline` sonra, dinamik) ve mantıksal atama gibi yeni sözdizimi kullanılmaz.
 *
 * Sırlar (GitHub uygulamasının özel anahtarı ve client secret'ı, AUTH_SECRET, Vercel ve GitHub
 * anahtarları) yalnız bellekte durur: ekrana, dosyaya ya da URL'ye yazılmaz, yalnız Vercel env'ine gider.
 *
 * Doğrulanan belgeler (2026-11-05):
 * - GitHub App manifest akışı: docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest
 * - "Request user authorization (OAuth) during installation" seçiliyken Setup URL kullanılamaz; kullanıcı
 *   ilk Callback URL'e döner (creating-a-github-app, generating-a-user-access-token-for-a-github-app).
 * - Git Data API: blobs (base64), trees (`content` ya da `sha`, `base_tree` ile birleştirme, kip 100755/120000),
 *   commits (`parents` boşsa kök commit), refs (PATCH, `force`). İkincil sınırlar: içerik oluşturan istek
 *   dakikada en çok 80; `retry-after` varsa o kadar, yoksa `x-ratelimit-reset`, yoksa en az 1 dk bekle.
 * - Vercel REST: POST /v11/projects (`gitRepository`), POST /v10/projects/{id}/env, POST /v13/deployments,
 *   GET /v13/deployments/{id}, GET /v9/projects/{id}, GET /v9/projects/{id}/domains, GET /v2/user, GET /v2/teams.
 * - Vercel CLI anahtar dosyası: <veri klasörü>/com.vercel.cli/auth.json, alanlar token / expiresAt (saniye).
 */
import http from 'node:http';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const VERCEL_CLI_VERSION = '65.11.0';
export const DEFAULT_SOURCE = 'gokerlek/openPT';
export const DEFAULT_CODE_REPO = 'openpt';
export const MIN_NODE_MAJOR = 20;
export const STEP_COUNT = 8;
export const SECRET_ENV_KEYS = Object.freeze(['AUTH_SECRET', 'GITHUB_APP_PRIVATE_KEY', 'GITHUB_CLIENT_SECRET']);
/** İçerik oluşturan GitHub istekleri arası en az bu kadar: dakikada en çok 60 (sınır 80). */
export const WRITE_GAP_MS = 1000;
/** Ağaç isteği başına en çok bu kadar JSON (yaklaşık). */
export const TREE_CHUNK_BYTES = 2_000_000;
/** Bundan büyük metin dosyaları ağaca gömülmez, blob olarak yüklenir. */
export const INLINE_TEXT_MAX_BYTES = 1_000_000;

const GITHUB_API = 'https://api.github.com';
const VERCEL_API = 'https://api.vercel.com';
const USER_AGENT = 'openpt-kur';
const VERCEL_TOKENS_URL = 'https://vercel.com/account/settings/tokens';
const VERCEL_GITHUB_INSTALL_URL = 'https://github.com/apps/vercel/installations/new';
/** Vercel belgesi (docs/accounts → Login methods and connections): hesap ayarları → Authentication. */
export const VERCEL_LOGIN_CONNECTIONS_URL = 'https://vercel.com/account/authentication';
/** Kaynağın kök `axon-release.json` dosyasında olması gereken yetenek (GitHub uygulaması modu). */
export const REQUIRED_CAPABILITY = 'github-app';
const NETWORK_HINT = msg('hint.network');
const BROWSER_WAIT_MS = 30 * 60 * 1000;
const DEPLOY_WAIT_MS = 20 * 60 * 1000;
const MAX_ARCHIVE_BYTES = 300 * 1024 * 1024;
const MAX_RATE_WAIT_SECONDS = 300;
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const LOWER_DIGITS = `${LOWER}0123456789`;

// ---------------------------------------------------------------------------------------------
// İletiler (Türkçe ve İngilizce)
// ---------------------------------------------------------------------------------------------

/**
 * Ekrana ya da yerel sayfalara yazılan her metin burada: `MESSAGES.tr` ve `MESSAGES.en` aynı anahtarlara, aynı
 * türe (düz metin / işlev) ve aynı parametre sırasına sahip olmak zorunda (`kur.test.mjs` denetler). Dil
 * `ctx.lang`dan gelir (`detectLang`); verilmezse Türkçe. Çevrilmeyenler: ortam değişkeni adları (AXON_KUR_SOURCE),
 * repo, dal ve dosya adları, adresler, GitHub ile Vercel'in kendi arayüz adları ("Install", "Redeploy").
 */
export const MESSAGES = {
  tr: {
    // Başlık ve adımlar
    'main.intro': 'openPT kurulumu — her adımda ne olduğunu yazacağım. Durdurmak için Ctrl+C.',
    'step.prepare': "Hazırlık: Node sürümü kontrol ediliyor, openPT'nin son sürümü indirilip denetleniyor…",
    'step.sourceReady': (nodeVersion, sourceName, version, files, mb) => `  ✓ Node ${nodeVersion}; kaynak ${sourceName} ${version} (${files} dosya, ${mb} MB)`,
    'step.vercelLogin': 'Vercel hesabına giriş…',
    'step.name': 'Uygulamanın adı ve adresi…',
    'step.githubApp': 'GitHub uygulaması (giriş ve veri erişimi) oluşturuluyor…',
    'step.repos': "GitHub'da kod ve veri repoların açılıyor…",
    'step.vercelProject': 'Vercel projesi açılıyor ve kod reposuna bağlanıyor…',
    'step.deploy': 'Ayarlar yazılıyor ve ilk yayın başlatılıyor…',
    'step.done': 'Bitti.',
    'callback.mismatch': (siteUrl) => `  ! Adresin GitHub uygulamasına yazılandan farklı: ${siteUrl}`,
    'callback.addTo': (settingsUrl) => `    GitHub ile girişin çalışması için ${settingsUrl} sayfasında "Callback URL" listesine`,
    'callback.addAddress': (siteUrl) => `    ${siteUrl}/api/auth/github/callback adresini ekleyip "Save changes" de.`,
    'done.address': (siteUrl) => `  Adresin: ${siteUrl}`,
    'done.opened': '  Tarayıcıda açıldı: GitHub ile giriş yap.',
    'done.pressButton': '  Bu adreste "GitHub ile giriş yap" düğmesine bas.',
    'done.appSettings': (url) => `  GitHub uygulamanın ayarları: ${url}`,
    'done.vercelProject': (url) => `  Vercel projen: ${url}`,
    'done.allRepos': (installationId) => `  Unutma: https://github.com/settings/installations/${installationId} adresinde "All repositories" seç.`,

    // Hata özeti
    'fail.cancelled': 'Kurulum durduruldu.',
    'fail.cancelledEof': 'Kurulum durduruldu: terminal girişi kapandı (Ctrl+D).',
    'fail.incomplete': (detail) => `Kurulum tamamlanamadı: ${detail}`,
    'fail.whatToDo': (hint) => `Ne yapmalı: ${hint}`,
    'fail.suggests': (service, text) => `${service} öneriyor: ${text}`,
    'fail.unexpected': (detail) => `Kurulum tamamlanamadı: beklenmeyen bir hata oluştu (${detail}).`,
    'fail.unexpectedHint': "Komutu yeniden çalıştır. Sorun sürerse bu çıktıyla birlikte GitHub'da konu aç.",
    'report.nothing': 'Henüz hiçbir şey oluşturulmadı.',
    'report.created': 'Şu ana kadar oluşturulanlar (yerinde duruyor):',
    'report.rerun': 'Komutu yeniden çalıştırırsan yeni bir GitHub uygulaması açılır ve yeni ad sorulur; yukarıdakileri istersen silebilirsin.',
    'created.githubApp': (name, url) => `GitHub uygulaması "${name}": ${url}`,
    'created.codeRepo': (url) => `Kod reposu: ${url}`,
    'created.dataRepo': (url) => `Veri reposu: ${url}`,
    'created.vercelProject': (url) => `Vercel projesi: ${url}`,
    'created.env': 'Vercel projesinin Production ayarları (env) yazıldı.',
    'created.notConnected': "(GitHub'a bağlanmadı)",

    // Ne yapmalı ipuçları
    'hint.rerun': 'Komutu yeniden çalıştır.',
    'hint.network': 'İnternet bağlantını kontrol edip yeniden dene.',
    'hint.rateLimited': (service) => `${service} istek sınırına takıldın. Bir saat kadar bekleyip komutu yeniden çalıştır.`,
    'hint.unauthorized': (service) => `${service} oturumu geçersiz ya da süresi dolmuş. Komutu yeniden çalıştırıp yeniden giriş yap.`,
    'hint.forbidden': (service) => `${service} bu işleme izin vermedi. Doğru hesapla giriş yaptığını ve izinleri kontrol et.`,
    'hint.notFound': (service) => `${service} istenen kaydı bulamadı. Adları kontrol edip komutu yeniden çalıştır.`,
    'hint.nameTaken': 'Bu ad kullanılıyor. Komutu yeniden çalıştırıp başka bir ad seç.',
    'hint.rejected': 'İstek reddedildi; yukarıdaki mesaja göre düzeltip komutu yeniden çalıştır.',
    'hint.serverError': (service) => `${service} tarafında geçici bir sorun var. Birkaç dakika sonra komutu yeniden çalıştır.`,

    // API ve ağ hataları
    'api.failed': (what, status, code, message) => `${what} başarısız oldu (${status}${code ? `, ${code}` : ''})${message ? `: ${message}` : ''}`,
    'api.request': (service) => `${service} isteği`,
    'api.unexpectedReply': (what) => `${what}: GitHub beklenmeyen bir yanıt verdi.`,
    'api.retryNetwork': (wait, attempt) => `  … GitHub'a ulaşılamadı; ${wait} sn sonra yeniden deneniyor (${attempt}/3).`,
    'api.rateWait': (wait) => `  … GitHub istek sınırı: ${wait} sn bekleniyor.`,
    'net.unreachable': (service) => `${service}'a ulaşılamadı.`,
    'net.cannotCheck': (name) => `${name}.vercel.app adresine bakılamadı.`,

    // Yapılan işin adı (`api.failed` ve `api.unexpectedReply` içinde)
    'what.readRelease': 'Kaynağın son sürümünü okuma',
    'what.readSource': 'Kaynak repoyu okuma',
    'what.manifestApp': 'GitHub uygulamasının bilgilerini alma',
    'what.readAccount': 'GitHub hesabını okuma',
    'what.readInstall': 'GitHub uygulamasının kurulumunu okuma',
    'what.checkRepoName': 'Repo adına bakma',
    'what.createRepo': (label) => `${label} oluşturma`,
    'what.uploadBlob': (path) => `${path} dosyasını yükleme`,
    'what.buildTree': 'Kod ağacını kurma',
    'what.createCommit': 'Commit oluşturma',
    'what.updateBranch': (branch) => `${branch} dalını güncelleme`,
    'what.readTeams': 'Vercel ekiplerini okuma',
    'what.checkProject': 'Vercel projesine bakma',
    'what.readProject': 'Vercel projesini okuma',
    'what.openProject': 'Vercel projesini açma',
    'what.deleteProject': 'Bağlantısız projeyi silme',
    'what.writeEnv': "Ayarları Vercel'e yazma",
    'what.readEnvBack': 'Ayarları geri okuma',
    'what.startDeploy': 'Yayını başlatma',
    'what.readDeploy': 'Yayın durumunu okuma',

    // Node sürümü, ad ve kaynak denetimi
    'node.tooOld': (version, min) => `Bilgisayarındaki Node sürümü (${version}) çok eski; en az Node ${min} gerekiyor.`,
    'node.upgradeHint': 'https://nodejs.org adresinden güncel LTS sürümünü kur, sonra komutu yeniden çalıştır.',
    'name.empty': 'Bir ad yaz.',
    'name.tooLong': 'Ad en çok 63 karakter olabilir.',
    'name.chars': 'Yalnız küçük harf (a-z), rakam ve tire kullan; boşluk ve Türkçe harf olmaz.',
    'name.dashEdge': 'Ad tire ile başlayamaz ya da bitemez.',
    'name.tripleDash': 'Ad yan yana üç tire içeremez.',
    'repoName.invalid': 'Repo adında yalnız harf, rakam, nokta, tire ve alt çizgi olabilir (en çok 100 karakter).',
    'source.invalid': (value) => `Kaynak repo "${value}" geçerli değil.`,
    'source.invalidHint': 'AXON_KUR_SOURCE değeri "sahip/repo" biçiminde olmalı ya da hiç verilmemeli.',
    'source.notFound': (source) => `Kaynak repo bulunamadı: ${source}.`,
    'source.notFoundHint': 'AXON_KUR_SOURCE değerini kontrol et ya da kaldırıp yeniden dene.',
    'source.unsupported': (label) => `openPT'nin kurulacak sürümü${label ? ` (${label})` : ''} bu kurulum yolunu (GitHub uygulaması) henüz desteklemiyor.`,
    'source.unsupportedHint': "Bu kurulum yolu openPT'nin yeni sürümüyle gelecek; şimdilik README'deki Deploy düğmesini kullan.",
    'source.downloadFailed': (status) => `Kaynak kodu indirilemedi (${status}).`,
    'source.downloadFailedHint': 'Biraz bekleyip komutu yeniden çalıştır.',
    'source.downloadNetwork': 'Kaynak kodu indirilemedi.',
    'source.retrying': (wait, attempt) => `  … Kaynak indirilemedi; ${wait} sn sonra yeniden deneniyor (${attempt}/2).`,
    'archive.unreadable': (detail) => `Kaynak arşivi okunamadı (${detail}).`,
    'archive.unreadableHint': "Komutu yeniden çalıştır; sürerse GitHub'da konu aç.",
    'archive.checksum': 'başlık sağlaması',
    'archive.numberField': 'sayı alanı',
    'archive.paxRecord': 'pax kaydı',
    'archive.size': 'boyut',
    'archive.missingData': 'eksik veri',
    'archive.multipleTop': 'birden çok üst klasör',
    'archive.unsafePath': 'güvensiz yol',
    'archive.tooBig': 'arşiv çok büyük',
    'archive.gzip': 'gzip',
    'archive.empty': 'boş arşiv',

    // Tarayıcı ve yerel sayfalar
    'url.openIfNeeded': (url) => `  Tarayıcı açılmadıysa bu adresi aç: ${url}`,
    'url.openFailed': (url) => `  Tarayıcı açılamadı. Bu adresi aç: ${url}`,
    'manifest.description': (productionUrl) => `openPT kurulumun (${productionUrl}): PT girişi ve GitHub'daki verilerine erişim.`,
    'manifest.badCode': 'GitHub geçersiz bir dönüş kodu gönderdi.',
    'manifest.incomplete': 'GitHub uygulamasının bilgileri eksik geldi.',
    'oauth.badCode': 'GitHub geçersiz bir yetki kodu gönderdi.',
    'oauth.failed': (reason) => `GitHub kullanıcı yetkisi alınamadı${reason}.`,
    'oauth.failedHint': 'Tarayıcıdaki "Yeniden dene" düğmesine bas ya da komutu yeniden çalıştır.',
    'page.setupTitle': 'openPT kurulumu',
    'page.creatingApp': 'GitHub uygulaması oluşturuluyor…',
    'page.githubWillOpen': 'GitHub birazdan açılacak. Orada <b>Create GitHub App</b> düğmesine bas.',
    'page.continueToGithub': "GitHub'a devam et",
    'page.retry': 'Yeniden dene',
    'page.badAddress.title': 'Geçersiz adres',
    'page.badAddress.body': 'Bu sayfa yalnız kurulum adresinden açılır.',
    'page.badMethod.title': 'Geçersiz istek',
    'page.badMethod.body': 'Bu sayfa yalnız açılabilir.',
    'page.appReady.title': 'GitHub uygulaması hazır',
    'page.appReady.body': 'Kuruluma devam et.',
    'page.appReady.link': 'Uygulamayı kur',
    'page.foreignState.title': 'Geçersiz istek',
    'page.foreignState.body': 'Bu bağlantı bu kuruluma ait değil. Terminaldeki adımları izle.',
    'page.appFailed.title': 'GitHub uygulaması alınamadı',
    'page.appFailed.body': 'Terminale dön; ne yapacağın orada yazıyor.',
    'page.appFirst.title': 'Önce GitHub uygulaması',
    'page.appFirst.body': 'Terminaldeki adımları sırayla izle.',
    'page.foreignInstall.title': 'Geçersiz istek',
    'page.foreignInstall.body': 'Bu bağlantı bu kuruluma ait değil.',
    'page.finished.title': 'Tamam',
    'page.finished.body': 'Terminale dönebilirsin.',
    'page.noAuth.title': 'Yetki verilmedi',
    'page.noAuth.body': 'Uygulamayı kurduktan sonra yetkiyi onayla.',
    'page.authFailed.title': 'GitHub yetkisi alınamadı',
    'page.authFailed.body': 'Bir kez daha dene.',
    'page.connected.title': 'GitHub bağlandı',
    'page.connected.body': 'Bu sekmeyi kapatıp terminale dönebilirsin.',
    'page.notFound.title': 'Bulunamadı',
    'page.notFound.body': 'Bu sayfa yok.',
    'page.error.title': 'Bir sorun çıktı',
    'page.error.body': 'Terminale dön.',
    'flow.appCreated': (name) => `  ✓ GitHub uygulaması oluşturuldu: ${name}`,
    'flow.install': '  → Şimdi tarayıcıda "Install" düğmesine bas ("All repositories" seçili kalsın), sorulursa "Authorize" de.',
    'flow.installUrl': (url) => `    Kurulum sayfası açılmadıysa bu adresi aç: ${url}`,
    'flow.authorizeUrl': (url) => `    Kurulumdan sonra tarayıcı buraya dönmezse bu adresi aç: ${url}`,
    'flow.retryLine': (message) => `  ! ${message} Tarayıcıdaki "Yeniden dene" düğmesine bas.`,
    'flow.timeout': 'Tarayıcıdan dönüş beklenirken süre doldu.',
    'flow.timeoutHint': 'Komutu yeniden çalıştır; GitHub adımlarını 30 dakika içinde tamamla.',
    'flow.opening': '  → Tarayıcıda GitHub açılıyor. Sırayla:',
    'flow.step1': '    1) "Create GitHub App" düğmesine bas (ad alınmışsa sonuna bir harf ekle).',
    'flow.step2': '    2) Sonraki sayfada "Install" düğmesine bas; "All repositories" seçili kalsın.',
    'flow.step3': '    3) Sorulursa "Authorize" de, sonra terminale dön.',

    // Vercel girişi, ekip ve proje adı
    'vercel.loginOpening': '  → Tarayıcıda Vercel açılacak; orada girişi onayla. (Vercel aracı ilk seferde indirilir, biraz sürebilir.)',
    'vercel.loginNote': '    Vercel aracı bir adres yazarsa ve tarayıcı açılmazsa o adresi kendin aç.',
    'vercel.loginFailed': '  ! Vercel girişi tamamlanamadı.',
    'vercel.pasteIntro': '  Vercel girişi otomatik okunamadı. Yedek yol: Vercel anahtarı.',
    'vercel.pasteStep1': (url) => `  1) ${url} adresinde "Create" ile bir anahtar oluştur (kapsam: kendi hesabın, süre: 1 gün yeter).`,
    'vercel.pasteStep2': '  2) Anahtarı buraya yapıştır. Yazdığın ekranda görünmez.',
    'vercel.tokenPrompt': '  Vercel anahtarı: ',
    'vercel.tokenRejected': "  ! Bu anahtar Vercel'de geçmedi. Tamamını kopyalayıp yeniden yapıştır.",
    'vercel.connectFailed': 'Vercel hesabına bağlanılamadı.',
    'vercel.connectFailedHint': (url) => `${url} adresinden yeni bir anahtar oluşturup komutu yeniden çalıştır.`,
    'vercel.useAccount': (username) => `  Vercel'de "${username}" hesabıyla girişlisin. Bu hesapla devam edilsin mi?`,
    'vercel.account': (username, teamSlug) => `  ✓ Vercel hesabı: ${username}${teamSlug !== null ? ` (ekip: ${teamSlug})` : ''}`,
    'vercel.manyTeams': '  Vercel hesabında birden çok ekip var. Uygulama hangisinde dursun?',
    'vercel.teamPrompt': '  Numara',
    'vercel.teamNumber': (count) => `  ! 1 ile ${count} arasında bir numara yaz.`,
    'vercel.sessionExpiring': '  Vercel oturumunun süresi dolmak üzere; yeniden giriş yapılacak.',
    'vercel.otherAccount': (username) => `Vercel'e başka bir hesapla (${username}) giriş yapıldı.`,
    'vercel.otherAccountHint': (username) => `"${username}" hesabıyla giriş yapıp komutu yeniden çalıştır.`,
    'project.namePrompt': '  Uygulamanın adı (adresin https://<ad>.vercel.app olur)',
    'project.nameFree': (name) => `  ✓ Adres boş: https://${name}.vercel.app`,
    'project.domainTaken': (name) => `  ! ${name}.vercel.app başka biri tarafından kullanılıyor. Başka bir ad seç.`,
    'project.existsInAccount': (name) => `  ! Vercel hesabında "${name}" adlı bir proje zaten var. Başka bir ad seç.`,
    'project.otherName': '  Uygulama için başka bir ad',
    'project.nowTaken': (name) => `  ! "${name}" adı Vercel'de artık dolu.`,
    'project.recreating': (name) => `  → Önceki denemede GitHub'a bağlanmadan açılan "${name}" projesi silinip bağlı olarak yeniden açılıyor.`,
    'project.cantSeeRepo': (repo) => `  ! Vercel'in GitHub uygulaması ${repo} reposunu göremiyor.`,
    'project.installVercelApp': '    Açılan sayfada Vercel\'i kendi GitHub hesabına kur ("All repositories" ya da bu repoyu seç) ve kaydet.',
    'project.pressEnter': "  Tamam olunca Enter'a bas.",
    'project.noLoginConnection': '  ! Vercel hesabın GitHub hesabına bağlı değil. Vercel hesap ayarlarının "Authentication" bölümünde GitHub bağlantısını ekle.',
    'project.unreadable': 'Vercel projesi okunamadı.',
    'project.notLinked': 'Vercel projesi GitHub reposuna bağlanamadı.',
    'project.notLinkedHint': (url, repo) => `${url}/settings/git adresinden ${repo} reposunu bağla, sonra Vercel'de "Redeploy" de.`,
    'project.linked': (url, repo) => `  ✓ Vercel projesi: ${url} (${repo} reposuna bağlı)`,

    // GitHub hesabı ve uygulamanın kurulumu
    'github.accountUnreadable': 'GitHub hesabı okunamadı.',
    'github.ownerMismatch': (owner, login) => `GitHub uygulaması "${owner}" hesabında, yetki ise "${login}" hesabından verildi.`,
    'github.ownerMismatchHint': "Tarayıcıda GitHub'a tek hesapla giriş yapıp komutu yeniden çalıştır.",
    'github.account': (login) => `  ✓ GitHub hesabın: ${login}`,
    'install.notInstalled': 'GitHub uygulaması hesabına kurulmadı.',
    'install.notInstalledHint': (slug) => `https://github.com/apps/${slug}/installations/new adresinden kendi hesabına kur, sonra komutu yeniden çalıştır.`,
    'install.missing': (login) => `  ! Uygulama "${login}" hesabına kurulmamış görünüyor (başka bir hesap seçilmiş olabilir).`,
    'install.pauseInstall': '  Kendi hesabına "Install" ile kurduktan sonra Enter\'a bas.',
    'install.idMismatch': "  ! GitHub'ın döndüğü kurulum kimliği eşleşmedi; hesabındaki kurulum kullanılacak.",
    'install.ok': '  ✓ Uygulama hesabına kuruldu (tüm repolar).',
    'install.warnSelected': '  ! UYARI: Uygulama yalnız seçili repolara erişebiliyor. Yeni danışan repolarına erişemez;',
    'install.warnSettings': (url) => `    sonra ${url} adresinde "All repositories" seçip kaydet.`,
    'install.selectedOnly': '  ! Uygulama yalnız seçili repolarla kurulmuş. openPT\'nin yeni danışan repolarına erişebilmesi için "All repositories" gerekli.',
    'install.pauseSelectAll': '  Açılan sayfada "All repositories" seçip "Save" de, sonra Enter\'a bas.',

    // Repolar ve kodun yüklenmesi
    'repo.codeLabel': 'Kod reposu',
    'repo.dataLabel': 'Veri reposu',
    'repo.codeDescription': 'openPT — kendi kopyam (kod)',
    'repo.dataDescription': 'openPT verileri (özel)',
    'repo.reserved': '  ! Bu ad kullanılamaz; başka bir ad yaz.',
    'repo.clientPrefix': '  ! "client-" ile başlayan adlar danışanlara ayrılmış; başka bir ad yaz.',
    'repo.branchTimeout': "Yeni repo GitHub'da hazırlanırken süre doldu.",
    'repo.branchTimeoutHint': (fullName) => `https://github.com/${fullName} sayfası açılıyorsa GitHub uygulamasının "All repositories" erişimiyle kurulu olduğunu kontrol et, sonra komutu yeniden çalıştır.`,
    'repo.useExisting': (login, current, label) => `  ${login}/${current} zaten var (özel). ${label} olarak bu kullanılsın mı?`,
    'repo.notAllowed': (login, current, label) => `  ! ${login}/${current} herkese açık ya da fork; ${label.toLowerCase()} olamaz.`,
    'repo.unavailable': (login, current, label) => `  ${login}/${current} kullanılamıyor. ${label} için başka bir ad`,
    'repo.createFailed': (login, current, reason) => `  ! ${login}/${current} açılamadı (${reason}).`,
    'repo.nameInUse': 'ad kullanılıyor',
    'repo.otherName': (label) => `  ${label} için başka bir ad`,
    'repo.codeReady': (version, url) => `  ✓ Kod reposu (özel, ${version}): ${url}`,
    'repo.dataReady': (url) => `  ✓ Veri reposu (özel): ${url}`,
    'upload.start': (files, mb) => `  → Kod yükleniyor: ${files} dosya (${mb} MB). Birkaç dakika sürebilir.`,
    'upload.chunk': (done, total) => `    Dosyalar: ${done}/${total}`,
    'upload.commitSource': (name, commit) => `Kaynak: ${name}@${commit}`,

    // Ayarlar ve yayın
    'env.written': (count) => `  ✓ ${count} ayar Production ortamına yazıldı (sırlar gizli tutuluyor).`,
    'env.failed': (keys) => `Bazı ayarlar Vercel'e yazılamadı: ${keys}.`,
    'env.failedHint': 'Vercel projesinin Settings → Environment Variables ekranına bak; eksikleri ekleyip "Redeploy" de.',
    'env.missing': (keys) => `Vercel'de görünmeyen ayarlar: ${keys}.`,
    'env.missingHint': 'Vercel projesinin Settings → Environment Variables ekranına bak.',
    'env.emptyKey': (key) => `${key} boş kaldı.`,
    'authSecret.bytes': '32 bayt rastgele veri gerekir.',
    'deploy.startFailed': 'Vercel yayını başlatılamadı.',
    'deploy.startFailedHint': 'Vercel projesinde "Redeploy" ile yayını kendin başlat.',
    'deploy.started': '  → Yayın başladı; hazır olması genelde 2-5 dakika sürer.',
    'deploy.stateLine': (state) => `    Yayın durumu: ${state}`,
    'deploy.QUEUED': 'sırada',
    'deploy.INITIALIZING': 'hazırlanıyor',
    'deploy.BUILDING': 'derleniyor',
    'deploy.READY': 'hazır',
    'deploy.ERROR': 'hata verdi',
    'deploy.CANCELED': 'iptal edildi',
    'deploy.BLOCKED': 'engellendi',
    'deploy.failed': (state) => `Vercel yayını tamamlanamadı (${state}).`,
    'deploy.failedHint': (where) => `${where ? `Ayrıntı: ${where}. ` : ''}Ayarlar kaydedildi; sorun giderilince Vercel projesinde "Redeploy" yeterli.`,
    'deploy.slow': 'Yayın beklenenden uzun sürdü.',
    'deploy.slowHint': 'Vercel projesinin Deployments ekranından durumu izle; hazır olunca adresini aç.',

    // Terminal girişi
    'io.choiceYes': 'E/h',
    'io.choiceNo': 'e/H',
    'io.yesNoHint': '  "e" ya da "h" yaz.',
  },
  en: {
    // Title and steps
    'main.intro': 'openPT setup — I will say what is happening at each step. Press Ctrl+C to stop.',
    'step.prepare': 'Preparing: checking the Node version, downloading and verifying the latest openPT release…',
    'step.sourceReady': (nodeVersion, sourceName, version, files, mb) => `  ✓ Node ${nodeVersion}; source ${sourceName} ${version} (${files} files, ${mb} MB)`,
    'step.vercelLogin': 'Signing in to your Vercel account…',
    'step.name': 'App name and address…',
    'step.githubApp': 'Creating the GitHub app (sign-in and data access)…',
    'step.repos': 'Creating your code and data repos on GitHub…',
    'step.vercelProject': 'Creating the Vercel project and connecting it to the code repo…',
    'step.deploy': 'Writing the settings and starting the first deployment…',
    'step.done': 'Done.',
    'callback.mismatch': (siteUrl) => `  ! Your address differs from the one set in the GitHub app: ${siteUrl}`,
    'callback.addTo': (settingsUrl) => `    For GitHub sign-in to work, add the following address to the "Callback URL" list on ${settingsUrl}:`,
    'callback.addAddress': (siteUrl) => `    ${siteUrl}/api/auth/github/callback, then click "Save changes".`,
    'done.address': (siteUrl) => `  Your address: ${siteUrl}`,
    'done.opened': '  Opened in the browser: sign in with GitHub.',
    'done.pressButton': '  On that page, click the GitHub sign-in button.',
    'done.appSettings': (url) => `  Your GitHub app's settings: ${url}`,
    'done.vercelProject': (url) => `  Your Vercel project: ${url}`,
    'done.allRepos': (installationId) => `  Don't forget: choose "All repositories" at https://github.com/settings/installations/${installationId}.`,

    // Failure summary
    'fail.cancelled': 'Setup stopped.',
    'fail.cancelledEof': 'Setup stopped: the terminal input was closed (Ctrl+D).',
    'fail.incomplete': (detail) => `Setup could not be completed: ${detail}`,
    'fail.whatToDo': (hint) => `What to do: ${hint}`,
    'fail.suggests': (service, text) => `${service} suggests: ${text}`,
    'fail.unexpected': (detail) => `Setup could not be completed: an unexpected error occurred (${detail}).`,
    'fail.unexpectedHint': 'Run the command again. If the problem persists, open an issue on GitHub with this output.',
    'report.nothing': 'Nothing has been created yet.',
    'report.created': 'Created so far (still in place):',
    'report.rerun': 'If you run the command again, a new GitHub app is created and you are asked for a new name; you can delete the items above if you like.',
    'created.githubApp': (name, url) => `GitHub app "${name}": ${url}`,
    'created.codeRepo': (url) => `Code repo: ${url}`,
    'created.dataRepo': (url) => `Data repo: ${url}`,
    'created.vercelProject': (url) => `Vercel project: ${url}`,
    'created.env': "The Vercel project's Production settings (env) were written.",
    'created.notConnected': '(not connected to GitHub)',

    // What-to-do hints
    'hint.rerun': 'Run the command again.',
    'hint.network': 'Check your internet connection and try again.',
    'hint.rateLimited': (service) => `You hit the ${service} rate limit. Wait about an hour, then run the command again.`,
    'hint.unauthorized': (service) => `Your ${service} session is invalid or has expired. Run the command again and sign in again.`,
    'hint.forbidden': (service) => `${service} did not allow this action. Check that you signed in with the right account and that the permissions are correct.`,
    'hint.notFound': (service) => `${service} could not find the requested record. Check the names and run the command again.`,
    'hint.nameTaken': 'That name is already in use. Run the command again and choose a different name.',
    'hint.rejected': 'The request was rejected; fix it according to the message above and run the command again.',
    'hint.serverError': (service) => `${service} is having a temporary problem. Run the command again in a few minutes.`,

    // API and network errors
    'api.failed': (what, status, code, message) => `${what} failed (${status}${code ? `, ${code}` : ''})${message ? `: ${message}` : ''}`,
    'api.request': (service) => `${service} request`,
    'api.unexpectedReply': (what) => `${what}: GitHub returned an unexpected response.`,
    'api.retryNetwork': (wait, attempt) => `  … Could not reach GitHub; retrying in ${wait} s (${attempt}/3).`,
    'api.rateWait': (wait) => `  … GitHub rate limit: waiting ${wait} s.`,
    'net.unreachable': (service) => `Could not reach ${service}.`,
    'net.cannotCheck': (name) => `Could not check ${name}.vercel.app.`,

    // Names of the work being done (inside `api.failed` and `api.unexpectedReply`)
    'what.readRelease': "Reading the source's latest release",
    'what.readSource': 'Reading the source repo',
    'what.manifestApp': "Getting the GitHub app's details",
    'what.readAccount': 'Reading the GitHub account',
    'what.readInstall': "Reading the GitHub app's installation",
    'what.checkRepoName': 'Checking the repo name',
    'what.createRepo': (label) => `Creating the ${label.toLowerCase()}`,
    'what.uploadBlob': (path) => `Uploading the file ${path}`,
    'what.buildTree': 'Building the code tree',
    'what.createCommit': 'Creating the commit',
    'what.updateBranch': (branch) => `Updating the ${branch} branch`,
    'what.readTeams': 'Reading the Vercel teams',
    'what.checkProject': 'Checking the Vercel project',
    'what.readProject': 'Reading the Vercel project',
    'what.openProject': 'Creating the Vercel project',
    'what.deleteProject': 'Deleting the unconnected project',
    'what.writeEnv': 'Writing the settings to Vercel',
    'what.readEnvBack': 'Reading the settings back',
    'what.startDeploy': 'Starting the deployment',
    'what.readDeploy': 'Reading the deployment status',

    // Node version, name and source checks
    'node.tooOld': (version, min) => `The Node version on your computer (${version}) is too old; Node ${min} or newer is required.`,
    'node.upgradeHint': 'Install the current LTS release from https://nodejs.org, then run the command again.',
    'name.empty': 'Enter a name.',
    'name.tooLong': 'The name can be at most 63 characters long.',
    'name.chars': 'Use only lowercase letters (a-z), digits and hyphens; no spaces or accented letters.',
    'name.dashEdge': 'The name cannot start or end with a hyphen.',
    'name.tripleDash': 'The name cannot contain three hyphens in a row.',
    'repoName.invalid': 'A repo name can only contain letters, digits, dots, hyphens and underscores (at most 100 characters).',
    'source.invalid': (value) => `The source repo "${value}" is not valid.`,
    'source.invalidHint': 'The AXON_KUR_SOURCE value must be in the form "owner/repo", or not set at all.',
    'source.notFound': (source) => `Source repo not found: ${source}.`,
    'source.notFoundHint': 'Check the AXON_KUR_SOURCE value, or remove it and try again.',
    'source.unsupported': (label) => `The openPT version to be installed${label ? ` (${label})` : ''} does not support this setup path (GitHub app) yet.`,
    'source.unsupportedHint': 'This setup path will arrive with a newer openPT release; for now, use the Deploy button in the README.',
    'source.downloadFailed': (status) => `Could not download the source code (${status}).`,
    'source.downloadFailedHint': 'Wait a moment, then run the command again.',
    'source.downloadNetwork': 'Could not download the source code.',
    'source.retrying': (wait, attempt) => `  … Could not download the source; retrying in ${wait} s (${attempt}/2).`,
    'archive.unreadable': (detail) => `Could not read the source archive (${detail}).`,
    'archive.unreadableHint': 'Run the command again; if it keeps happening, open an issue on GitHub.',
    'archive.checksum': 'header checksum',
    'archive.numberField': 'number field',
    'archive.paxRecord': 'pax record',
    'archive.size': 'size',
    'archive.missingData': 'missing data',
    'archive.multipleTop': 'more than one top-level folder',
    'archive.unsafePath': 'unsafe path',
    'archive.tooBig': 'archive too large',
    'archive.gzip': 'gzip',
    'archive.empty': 'empty archive',

    // Browser and local pages
    'url.openIfNeeded': (url) => `  If the browser did not open, open this address: ${url}`,
    'url.openFailed': (url) => `  Could not open the browser. Open this address: ${url}`,
    'manifest.description': (productionUrl) => `Your openPT installation (${productionUrl}): trainer sign-in and access to your data on GitHub.`,
    'manifest.badCode': 'GitHub sent an invalid return code.',
    'manifest.incomplete': "The GitHub app's details came back incomplete.",
    'oauth.badCode': 'GitHub sent an invalid authorization code.',
    'oauth.failed': (reason) => `Could not get GitHub user authorization${reason}.`,
    'oauth.failedHint': 'Click the "Try again" button in the browser, or run the command again.',
    'page.setupTitle': 'openPT setup',
    'page.creatingApp': 'Creating the GitHub app…',
    'page.githubWillOpen': 'GitHub will open in a moment. There, click the <b>Create GitHub App</b> button.',
    'page.continueToGithub': 'Continue to GitHub',
    'page.retry': 'Try again',
    'page.badAddress.title': 'Invalid address',
    'page.badAddress.body': 'This page only opens from the setup address.',
    'page.badMethod.title': 'Invalid request',
    'page.badMethod.body': 'This page can only be viewed.',
    'page.appReady.title': 'GitHub app ready',
    'page.appReady.body': 'Continue with the setup.',
    'page.appReady.link': 'Install the app',
    'page.foreignState.title': 'Invalid request',
    'page.foreignState.body': 'This link does not belong to this setup. Follow the steps in the terminal.',
    'page.appFailed.title': 'Could not get the GitHub app',
    'page.appFailed.body': 'Go back to the terminal; it says what to do next.',
    'page.appFirst.title': 'GitHub app first',
    'page.appFirst.body': 'Follow the steps in the terminal in order.',
    'page.foreignInstall.title': 'Invalid request',
    'page.foreignInstall.body': 'This link does not belong to this setup.',
    'page.finished.title': 'Done',
    'page.finished.body': 'You can go back to the terminal.',
    'page.noAuth.title': 'Authorization not granted',
    'page.noAuth.body': 'After installing the app, approve the authorization.',
    'page.authFailed.title': 'Could not get GitHub authorization',
    'page.authFailed.body': 'Try once more.',
    'page.connected.title': 'GitHub connected',
    'page.connected.body': 'You can close this tab and go back to the terminal.',
    'page.notFound.title': 'Not found',
    'page.notFound.body': 'This page does not exist.',
    'page.error.title': 'Something went wrong',
    'page.error.body': 'Go back to the terminal.',
    'flow.appCreated': (name) => `  ✓ GitHub app created: ${name}`,
    'flow.install': '  → Now click the "Install" button in the browser (leave "All repositories" selected), and click "Authorize" if asked.',
    'flow.installUrl': (url) => `    If the install page did not open, open this address: ${url}`,
    'flow.authorizeUrl': (url) => `    If the browser does not return here after installing, open this address: ${url}`,
    'flow.retryLine': (message) => `  ! ${message} Click the "Try again" button in the browser.`,
    'flow.timeout': 'Timed out waiting for the return from the browser.',
    'flow.timeoutHint': 'Run the command again; finish the GitHub steps within 30 minutes.',
    'flow.opening': '  → Opening GitHub in the browser. In order:',
    'flow.step1': '    1) Click the "Create GitHub App" button (if the name is taken, add a letter to the end).',
    'flow.step2': '    2) On the next page, click the "Install" button; leave "All repositories" selected.',
    'flow.step3': '    3) Click "Authorize" if asked, then go back to the terminal.',

    // Vercel sign-in, team and project name
    'vercel.loginOpening': '  → Vercel will open in the browser; confirm the sign-in there. (The Vercel tool is downloaded the first time, which can take a while.)',
    'vercel.loginNote': '    If the Vercel tool prints an address and the browser does not open, open that address yourself.',
    'vercel.loginFailed': '  ! Vercel sign-in did not complete.',
    'vercel.pasteIntro': '  The Vercel sign-in could not be read automatically. Fallback: a Vercel token.',
    'vercel.pasteStep1': (url) => `  1) At ${url}, click "Create" to make a token (scope: your own account, expiry: 1 day is enough).`,
    'vercel.pasteStep2': '  2) Paste the token here. What you type is not shown on screen.',
    'vercel.tokenPrompt': '  Vercel token: ',
    'vercel.tokenRejected': '  ! Vercel did not accept this token. Copy the whole token and paste it again.',
    'vercel.connectFailed': 'Could not connect to your Vercel account.',
    'vercel.connectFailedHint': (url) => `Create a new token at ${url}, then run the command again.`,
    'vercel.useAccount': (username) => `  You are signed in to Vercel as "${username}". Continue with this account?`,
    'vercel.account': (username, teamSlug) => `  ✓ Vercel account: ${username}${teamSlug !== null ? ` (team: ${teamSlug})` : ''}`,
    'vercel.manyTeams': '  Your Vercel account has more than one team. Which one should the app live in?',
    'vercel.teamPrompt': '  Number',
    'vercel.teamNumber': (count) => `  ! Enter a number between 1 and ${count}.`,
    'vercel.sessionExpiring': '  Your Vercel session is about to expire; you will be asked to sign in again.',
    'vercel.otherAccount': (username) => `You signed in to Vercel with a different account (${username}).`,
    'vercel.otherAccountHint': (username) => `Sign in with the "${username}" account, then run the command again.`,
    'project.namePrompt': '  App name (your address will be https://<name>.vercel.app)',
    'project.nameFree': (name) => `  ✓ Address is free: https://${name}.vercel.app`,
    'project.domainTaken': (name) => `  ! ${name}.vercel.app is being used by someone else. Choose a different name.`,
    'project.existsInAccount': (name) => `  ! Your Vercel account already has a project named "${name}". Choose a different name.`,
    'project.otherName': '  A different name for the app',
    'project.nowTaken': (name) => `  ! The name "${name}" is now taken on Vercel.`,
    'project.recreating': (name) => `  → The project "${name}", created without a GitHub connection in the previous attempt, is being deleted and recreated with the connection.`,
    'project.cantSeeRepo': (repo) => `  ! The Vercel GitHub app cannot see the repo ${repo}.`,
    'project.installVercelApp': '    On the page that opens, install Vercel on your own GitHub account (choose "All repositories" or just this repo) and save.',
    'project.pressEnter': '  Press Enter when done.',
    'project.noLoginConnection': '  ! Your Vercel account is not connected to your GitHub account. Add the GitHub connection in the "Authentication" section of your Vercel account settings.',
    'project.unreadable': 'Could not read the Vercel project.',
    'project.notLinked': 'The Vercel project could not be connected to the GitHub repo.',
    'project.notLinkedHint': (url, repo) => `Connect the repo ${repo} at ${url}/settings/git, then click "Redeploy" in Vercel.`,
    'project.linked': (url, repo) => `  ✓ Vercel project: ${url} (connected to the repo ${repo})`,

    // GitHub account and app installation
    'github.accountUnreadable': 'Could not read the GitHub account.',
    'github.ownerMismatch': (owner, login) => `The GitHub app is on the "${owner}" account, but the authorization was given from the "${login}" account.`,
    'github.ownerMismatchHint': 'Sign in to GitHub in the browser with a single account, then run the command again.',
    'github.account': (login) => `  ✓ Your GitHub account: ${login}`,
    'install.notInstalled': 'The GitHub app was not installed on your account.',
    'install.notInstalledHint': (slug) => `Install it on your own account at https://github.com/apps/${slug}/installations/new, then run the command again.`,
    'install.missing': (login) => `  ! The app does not seem to be installed on the "${login}" account (a different account may have been chosen).`,
    'install.pauseInstall': '  Press Enter after installing it on your own account with "Install".',
    'install.idMismatch': '  ! The installation ID returned by GitHub did not match; the installation on your account will be used.',
    'install.ok': '  ✓ The app is installed on your account (all repositories).',
    'install.warnSelected': '  ! WARNING: The app can only access selected repositories. It cannot reach new client repos;',
    'install.warnSettings': (url) => `    afterwards, choose "All repositories" at ${url} and save.`,
    'install.selectedOnly': '  ! The app was installed with selected repositories only. "All repositories" is required for openPT to reach new client repos.',
    'install.pauseSelectAll': '  On the page that opens, choose "All repositories", click "Save", then press Enter.',

    // Repos and code upload
    'repo.codeLabel': 'Code repo',
    'repo.dataLabel': 'Data repo',
    'repo.codeDescription': 'openPT — my own copy (code)',
    'repo.dataDescription': 'openPT data (private)',
    'repo.reserved': '  ! That name cannot be used; enter a different name.',
    'repo.clientPrefix': '  ! Names starting with "client-" are reserved for clients; enter a different name.',
    'repo.branchTimeout': 'Timed out while GitHub was preparing the new repo.',
    'repo.branchTimeoutHint': (fullName) => `If https://github.com/${fullName} opens, check that the GitHub app is installed with "All repositories" access, then run the command again.`,
    'repo.useExisting': (login, current, label) => `  ${login}/${current} already exists (private). Use it as the ${label.toLowerCase()}?`,
    'repo.notAllowed': (login, current, label) => `  ! ${login}/${current} is public or a fork; it cannot be the ${label.toLowerCase()}.`,
    'repo.unavailable': (login, current, label) => `  ${login}/${current} cannot be used. A different name for the ${label.toLowerCase()}`,
    'repo.createFailed': (login, current, reason) => `  ! Could not create ${login}/${current} (${reason}).`,
    'repo.nameInUse': 'name already in use',
    'repo.otherName': (label) => `  A different name for the ${label.toLowerCase()}`,
    'repo.codeReady': (version, url) => `  ✓ Code repo (private, ${version}): ${url}`,
    'repo.dataReady': (url) => `  ✓ Data repo (private): ${url}`,
    'upload.start': (files, mb) => `  → Uploading the code: ${files} files (${mb} MB). This can take a few minutes.`,
    'upload.chunk': (done, total) => `    Files: ${done}/${total}`,
    'upload.commitSource': (name, commit) => `Source: ${name}@${commit}`,

    // Settings and deployment
    'env.written': (count) => `  ✓ ${count} settings written to the Production environment (secrets are kept hidden).`,
    'env.failed': (keys) => `Some settings could not be written to Vercel: ${keys}.`,
    'env.failedHint': 'Open Settings → Environment Variables in the Vercel project; add the missing ones, then click "Redeploy".',
    'env.missing': (keys) => `Settings missing in Vercel: ${keys}.`,
    'env.missingHint': 'Open Settings → Environment Variables in the Vercel project.',
    'env.emptyKey': (key) => `${key} was left empty.`,
    'authSecret.bytes': '32 bytes of random data are required.',
    'deploy.startFailed': 'Could not start the Vercel deployment.',
    'deploy.startFailedHint': 'Start the deployment yourself with "Redeploy" in the Vercel project.',
    'deploy.started': '  → The deployment has started; it usually takes 2-5 minutes to be ready.',
    'deploy.stateLine': (state) => `    Deployment status: ${state}`,
    'deploy.QUEUED': 'queued',
    'deploy.INITIALIZING': 'initializing',
    'deploy.BUILDING': 'building',
    'deploy.READY': 'ready',
    'deploy.ERROR': 'failed',
    'deploy.CANCELED': 'canceled',
    'deploy.BLOCKED': 'blocked',
    'deploy.failed': (state) => `The Vercel deployment could not be completed (${state}).`,
    'deploy.failedHint': (where) => `${where ? `Details: ${where}. ` : ''}The settings were saved; once the problem is fixed, "Redeploy" in the Vercel project is enough.`,
    'deploy.slow': 'The deployment is taking longer than expected.',
    'deploy.slowHint': 'Follow the status on the Deployments screen of the Vercel project; open the address when it is ready.',

    // Terminal input
    'io.choiceYes': 'Y/n',
    'io.choiceNo': 'y/N',
    'io.yesNoHint': '  Type "y" or "n".',
  },
};

/**
 * İleti metni: `lang` 'en' ise İngilizce, aksi halde (verilmediyse de) Türkçe. Değer işlevse `args` ile çağrılır.
 */
export function t(lang, key, ...args) {
  const value = (lang === 'en' ? MESSAGES.en : MESSAGES.tr)[key];
  return typeof value === 'function' ? value(...args) : value;
}

/**
 * Dile bağlı olmadan taşınan ileti: hata nesnesi kurulurken kullanıcının dili her yerde bilinmez; `msg(anahtar,
 * ...argümanlar)` hatayla birlikte gider, gösterirken `render(lang, msg)` ile çözülür. Argümanlar da `msg` olabilir.
 */
export function msg(key, ...args) {
  return { key, args };
}

export function render(lang, value) {
  if (value && typeof value === 'object' && typeof value.key === 'string' && Array.isArray(value.args)) {
    return t(lang, value.key, ...value.args.map((arg) => render(lang, arg)));
  }
  return value;
}

/**
 * Dil seçimi: `KUR_LANG`, sonra `LC_ALL`, `LC_MESSAGES`, `LANG` (boş olanlar atlanır), en son `Intl` yerel ayarı.
 * İlk dolu değer karar verir: `tr` ile başlıyorsa 'tr', başka her şey (C/POSIX dahil) 'en'.
 */
export function detectLang(env = {}, intlLocale = '') {
  const candidates = [env.KUR_LANG, env.LC_ALL, env.LC_MESSAGES, env.LANG, intlLocale];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || candidate.trim() === '') continue;
    return candidate.trim().toLowerCase().startsWith('tr') ? 'tr' : 'en';
  }
  return 'en';
}

// ---------------------------------------------------------------------------------------------
// Hatalar
// ---------------------------------------------------------------------------------------------

/**
 * Kurulumu durduran, kullanıcıya gösterilecek hata. `hint`: ne yapmalı. `message` ve `hint` düz metin ya da
 * `msg(...)` olabilir: `.message` ve `.hint` her zaman Türkçe kalır, `text(lang)` ve `hintText(lang)` verilen dilde verir.
 */
export class KurError extends Error {
  constructor(message, hint = '') {
    super(render('tr', message));
    this.name = 'KurError';
    this.hint = render('tr', hint);
    this.messageRef = message;
    this.hintRef = hint;
  }

  text(lang) {
    return render(lang, this.messageRef);
  }

  hintText(lang) {
    return render(lang, this.hintRef);
  }
}

/** Ağ hatası ya da zaman aşımı: yalnız bunda internet önerilir ve güvenli isteklerde yeniden denenir. */
export class NetworkError extends KurError {
  constructor(message) {
    super(message, NETWORK_HINT);
    this.name = 'NetworkError';
  }
}

/** `reason`: 'sigint' (Ctrl+C) ya da 'eof' (Ctrl+D / giriş kapandı). */
export class KurCancelled extends Error {
  constructor(reason = 'sigint') {
    super(t('tr', 'fail.cancelled'));
    this.name = 'KurCancelled';
    this.reason = reason;
  }
}

/** GitHub/Vercel'in hata yanıtı. Yanıtın gövdesi saklanmaz (sır taşıyabilir); yalnız kod, mesaj, öneri. */
export class ApiError extends Error {
  /** `what`: yapılan işin adı, düz metin ya da `msg(...)`. `.message` Türkçe, `text(lang)` verilen dilde. */
  constructor(service, status, data, what = '') {
    const detail = apiErrorDetail(data);
    const failed = msg('api.failed', what || msg('api.request', service), status, detail.code || '', detail.message || '');
    super(render('tr', failed));
    this.failed = failed;
    this.name = 'ApiError';
    this.service = service;
    this.status = status;
    this.code = detail.code;
    this.action = detail.action;
    this.link = detail.link;
    this.rateLimited = status === 429 || /rate limit/i.test(detail.message || '');
  }

  text(lang) {
    return render(lang, this.failed);
  }
}

/** Vercel `{ error: { code, message, action, link } }`, GitHub `{ message, errors: [{ message }] }`. */
export function apiErrorDetail(data) {
  if (!data || typeof data !== 'object') return {};
  // Uzun ya da denetim karakterli metin terminale olduğu gibi basılmaz.
  const text = (value) => (typeof value === 'string' && value.length <= 300 ? value.replace(/\p{Cc}/gu, ' ') : undefined);
  if (data.error && typeof data.error === 'object') {
    return { code: text(data.error.code), message: text(data.error.message), action: text(data.error.action), link: text(data.error.link) };
  }
  const extra = Array.isArray(data.errors)
    ? data.errors.map((item) => text(item && item.message) || text(item && item.code)).filter(Boolean).join('; ')
    : '';
  const message = [text(data.message), extra].filter(Boolean).join(' — ');
  return { code: text(typeof data.error === 'string' ? data.error : undefined), message: message || undefined };
}

/** Hata ipucu türe göre: ağ hatası değilse internet önerilmez; Vercel/GitHub'ın önerisi varsa yazılır. */
export function failureLines(error, lang = 'tr') {
  if (error instanceof KurCancelled) {
    return [t(lang, error.reason === 'eof' ? 'fail.cancelledEof' : 'fail.cancelled')];
  }
  if (error instanceof KurError) {
    return [t(lang, 'fail.incomplete', error.text(lang)), t(lang, 'fail.whatToDo', error.hintText(lang) || t(lang, 'hint.rerun'))];
  }
  if (error instanceof ApiError) {
    const lines = [t(lang, 'fail.incomplete', error.text(lang))];
    const link = safeLink(error.link);
    if (error.action || link) lines.push(t(lang, 'fail.suggests', error.service, [error.action, link].filter(Boolean).join(' — ')));
    lines.push(t(lang, 'fail.whatToDo', apiHint(error, lang)));
    return lines;
  }
  const detail = `${(error && error.name) || 'Error'}: ${String((error && error.message) || '').slice(0, 200)}`;
  return [t(lang, 'fail.unexpected', detail), t(lang, 'fail.whatToDo', t(lang, 'fail.unexpectedHint'))];
}

function apiHint(error, lang) {
  if (error.rateLimited) return t(lang, 'hint.rateLimited', error.service);
  if (error.status === 401) return t(lang, 'hint.unauthorized', error.service);
  if (error.status === 403) return t(lang, 'hint.forbidden', error.service);
  if (error.status === 404) return t(lang, 'hint.notFound', error.service);
  if (error.status === 409 || error.status === 422 || error.status === 400) {
    return isNameConflict(error) ? t(lang, 'hint.nameTaken') : t(lang, 'hint.rejected');
  }
  if (error.status >= 500) return t(lang, 'hint.serverError', error.service);
  return t(lang, 'hint.rerun');
}

/** Yalnız gerçek ad çakışması: GitHub "name already exists", Vercel proje adı "already exists". */
export function isNameConflict(error) {
  return error instanceof ApiError && [400, 409, 422].includes(error.status) && /already exists|already taken|name is taken/i.test(error.message);
}

function networkError(service) {
  return new NetworkError(msg('net.unreachable', service));
}

// ---------------------------------------------------------------------------------------------
// Saf yardımcılar
// ---------------------------------------------------------------------------------------------

export function nodeMajor(version) {
  return Number.parseInt(String(version).replace(/^v/, '').split('.')[0], 10) || 0;
}

/** Her şeyden önce: Node çok eskiyse gösterilecek mesaj, değilse null. */
export function startupProblem(version, lang) {
  if (nodeMajor(version) >= MIN_NODE_MAJOR) return null;
  return `${t(lang, 'node.tooOld', version, MIN_NODE_MAJOR)} ${t(lang, 'node.upgradeHint')}`;
}

export function checkNodeVersion(version) {
  if (startupProblem(version)) {
    throw new KurError(msg('node.tooOld', version, MIN_NODE_MAJOR), msg('node.upgradeHint'));
  }
}

export function randomString(length, alphabet, randomInt = crypto.randomInt) {
  let out = '';
  for (let i = 0; i < length; i += 1) out += alphabet[randomInt(alphabet.length)];
  return out;
}

/** Varsayılan ad: `openpt-` + 4 küçük harf/rakam. */
export function defaultProjectName(randomInt = crypto.randomInt) {
  return `openpt-${randomString(4, LOWER_DIGITS, randomInt)}`;
}

/** GitHub uygulamasının adı: GitHub'da benzersiz olmalı, en çok 34 karakter. */
export function githubAppName(randomInt = crypto.randomInt) {
  return `openPT ${randomString(6, LOWER, randomInt)}`;
}

/** Vercel proje adı = `<ad>.vercel.app` alt alanı: DNS etiketi kuralları. Sorun yoksa null. */
export function validateProjectName(name, lang) {
  if (typeof name !== 'string' || name.length === 0) return t(lang, 'name.empty');
  if (name.length > 63) return t(lang, 'name.tooLong');
  if (!/^[a-z0-9-]+$/.test(name)) return t(lang, 'name.chars');
  if (name.startsWith('-') || name.endsWith('-')) return t(lang, 'name.dashEdge');
  if (name.includes('---')) return t(lang, 'name.tripleDash');
  return null;
}

/** GitHub repo adı. Sorun yoksa null. */
export function validateRepoName(name, lang) {
  if (typeof name !== 'string' || !/^[A-Za-z0-9._-]{1,100}$/.test(name) || name === '.' || name === '..') {
    return t(lang, 'repoName.invalid');
  }
  return null;
}

/** Veri reposunun adı (bugünkü sihirbazla aynı kural). */
export function dataRepoName(codeRepo) {
  return codeRepo.toLowerCase() === 'openpt-data' ? 'openpt-private-data' : 'openpt-data';
}

/** `sahip/repo` biçimi; değilse KurError. */
export function parseSource(value) {
  const match = /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100})$/.exec(String(value == null ? '' : value).trim());
  if (!match) {
    throw new KurError(msg('source.invalid', value), msg('source.invalidHint'));
  }
  return `${match[1]}/${match[2]}`;
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Türkçede ondalık ayracı virgül ("7,7"), İngilizcede nokta. */
export function formatMegabytes(bytes, lang) {
  const text = (bytes / 1024 / 1024).toFixed(1);
  return lang === 'en' ? text : text.replace('.', ',');
}

/**
 * GitHub App manifest'i. `callback_urls` sırası önemli: kurulumdaki kullanıcı yetkilendirmesi
 * (request_oauth_on_install) İLK adrese döner, yani yerel adres önce. Uygulamanın kendi girişi
 * `redirect_uri`'yi açıkça gönderdiği için ikinci adres yeter. Setup URL bu seçenekle kullanılamaz,
 * o yüzden yok. Webhook kapalı (url zorunlu alan, ama hiç çağrılmaz).
 */
export function buildManifest({ appName, productionUrl, localBase, lang }) {
  return {
    name: appName,
    url: productionUrl,
    description: t(lang, 'manifest.description', productionUrl),
    hook_attributes: { url: `${productionUrl}/api/github/webhook`, active: false },
    redirect_url: `${localBase}/github/app-created`,
    callback_urls: [`${localBase}/github/callback`, `${productionUrl}/api/auth/github/callback`],
    public: false,
    request_oauth_on_install: true,
    default_permissions: {
      administration: 'write',
      contents: 'write',
      actions: 'write',
      workflows: 'write',
      metadata: 'read',
    },
    default_events: [],
  };
}

const PAGE_STYLE =
  'body{font:16px/1.5 system-ui,-apple-system,sans-serif;margin:0;background:#f6f7f9;color:#14171a}' +
  'main{max-width:34rem;margin:12vh auto;padding:0 16px}h1{font-size:1.4rem}' +
  'button,a.b{font:inherit;padding:.6rem 1rem;border-radius:.5rem;border:0;background:#14171a;color:#fff;text-decoration:none;cursor:pointer}' +
  '@media (prefers-color-scheme:dark){body{background:#101214;color:#eef0f2}button,a.b{background:#eef0f2;color:#101214}}';

function page(title, bodyHtml, lang) {
  return (
    `<!doctype html><html lang="${lang === 'en' ? 'en' : 'tr'}"><head><meta charset="utf-8">` +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer">' +
    `<title>${escapeHtml(title)}</title><style>${PAGE_STYLE}</style></head><body><main>${bodyHtml}</main></body></html>`
  );
}

/** Manifest'i GitHub'a form ile kendiliğinden gönderen yerel sayfa. JSON öznitelikte kaçışlı durur. */
export function manifestPage({ manifest, state, lang }) {
  const action = `https://github.com/settings/apps/new?state=${encodeURIComponent(state)}`;
  return page(
    t(lang, 'page.setupTitle'),
    `<h1>${t(lang, 'page.creatingApp')}</h1>` +
      `<p>${t(lang, 'page.githubWillOpen')}</p>` +
      `<form id="manifest-form" method="post" action="${escapeHtml(action)}">` +
      `<input type="hidden" name="manifest" value="${escapeHtml(JSON.stringify(manifest))}">` +
      `<button type="submit">${t(lang, 'page.continueToGithub')}</button></form>` +
      '<script>document.getElementById("manifest-form").submit()</script>',
    lang,
  );
}

export function resultPage(title, message, link, lang) {
  const action = link ? `<p><a class="b" href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></p>` : '';
  return page(title, `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>${action}`, lang);
}

/** GitHub uygulaması JWT'si (RS256): iat 60 sn geri, exp en çok 10 dk ileri, iss = client id ya da app id. */
export function githubAppJwt({ issuer, pem, nowSeconds }) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const input = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iat: nowSeconds - 60, exp: nowSeconds + 9 * 60, iss: String(issuer) })}`;
  const signature = crypto.sign('sha256', Buffer.from(input), pem).toString('base64url');
  return `${input}.${signature}`;
}

/** 32 bayt rastgele veri, hex (64 karakter). */
export function generateAuthSecret(randomBytes = crypto.randomBytes, lang) {
  const bytes = randomBytes(32);
  if (bytes.length !== 32) throw new Error(t(lang, 'authSecret.bytes'));
  return Buffer.from(bytes).toString('hex');
}

/** Vercel Production env'i (B1 anahtarları). Sırlar `sensitive`: Vercel'de bir daha okunamaz. */
export function buildEnvItems({ owner, codeRepo, dataRepo, branch, appId, privateKey, installationId, clientId, clientSecret, authSecret, lang }) {
  const values = {
    GITHUB_OWNER: owner,
    APP_REPO: dataRepo,
    AUTH_SECRET: authSecret,
    AXON_CODE_REPO: `${owner}/${codeRepo}`,
    AXON_CODE_BRANCH: branch,
    GITHUB_APP_ID: appId === undefined || appId === null ? '' : String(appId),
    GITHUB_APP_PRIVATE_KEY: privateKey,
    GITHUB_APP_INSTALLATION_ID: installationId === undefined || installationId === null ? '' : String(installationId),
    GITHUB_CLIENT_ID: clientId,
    GITHUB_CLIENT_SECRET: clientSecret,
  };
  return Object.entries(values).map(([key, value]) => {
    if (typeof value !== 'string' || value.length === 0) throw new Error(t(lang, 'env.emptyKey', key));
    return { key, value, type: SECRET_ENV_KEYS.includes(key) ? 'sensitive' : 'encrypted', target: ['production'] };
  });
}

/**
 * Vercel CLI'nin veri klasörü adayları, CLI ile aynı sırada: `com.vercel.cli` (xdg-app-paths veri klasörü:
 * macOS `~/Library/Application Support`, Linux `$XDG_DATA_HOME` ya da `~/.local/share`), sonra eski `~/.now`.
 */
export function vercelConfigDirs({ platform, home, env = {} }) {
  const dataHomes = [];
  if (env.XDG_DATA_HOME) dataHomes.push(env.XDG_DATA_HOME);
  dataHomes.push(platform === 'darwin' ? path.join(home, 'Library', 'Application Support') : path.join(home, '.local', 'share'));
  const dirs = [...dataHomes.map((dir) => path.join(dir, 'com.vercel.cli')), path.join(home, '.now'), ...dataHomes.map((dir) => path.join(dir, 'now'))];
  return [...new Set(dirs)];
}

/** `auth.json`: `{ token, expiresAt? (saniye), refreshToken? }`. Anahtar yoksa null. */
export function parseVercelAuth(text, nowSeconds) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data.token !== 'string' || data.token.length === 0) return null;
  const expiresAt = typeof data.expiresAt === 'number' ? data.expiresAt : null;
  return { token: data.token, expiresAt, expired: expiresAt !== null && expiresAt <= nowSeconds + 60 };
}

/** CLI'nin seçili ekibi (`config.json` → `currentTeam`). */
export function parseVercelCurrentTeam(text) {
  try {
    const data = JSON.parse(text);
    return data && typeof data.currentTeam === 'string' && data.currentTeam ? data.currentTeam : null;
  } catch {
    return null;
  }
}

/** `<ad>.vercel.app` boş mu: Vercel boş alt alan için 404 DEPLOYMENT_NOT_FOUND döner. */
export function isDeploymentNotFound(status, headers, bodyText) {
  if (status !== 404) return false;
  const header = headers && typeof headers.get === 'function' ? headers.get('x-vercel-error') : null;
  return header === 'DEPLOYMENT_NOT_FOUND' || /DEPLOYMENT_NOT_FOUND/.test(bodyText || '');
}

/** Vercel'in GitHub uygulaması repoyu göremiyor: Vercel CLI'nin `git connect` kontrolündeki kodlar. */
export function isVercelGitAccessError(error) {
  return error instanceof ApiError && error.service === 'Vercel' && (error.action === 'Install GitHub App' || error.code === 'repo_not_found');
}

export function isVercelLoginConnectionError(error) {
  return error instanceof ApiError && error.service === 'Vercel' && error.action === 'Add a Login Connection';
}

/** Yalnız github.com / vercel.com https bağlantıları açılır ya da yazılır. */
export function safeLink(value, hosts = ['github.com', 'vercel.com']) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && hosts.includes(url.hostname)) return url.toString();
  } catch {
    // geçersiz adres
  }
  return null;
}

export function describeCreated(created, lang) {
  const lines = [];
  if (created.githubApp) lines.push(t(lang, 'created.githubApp', created.githubApp.name, created.githubApp.settingsUrl));
  if (created.codeRepo) lines.push(t(lang, 'created.codeRepo', created.codeRepo));
  if (created.dataRepo) lines.push(t(lang, 'created.dataRepo', created.dataRepo));
  if (created.vercelProject) lines.push(t(lang, 'created.vercelProject', created.vercelProject));
  if (created.env) lines.push(t(lang, 'created.env'));
  return lines;
}

export function browserCommand(platform) {
  if (platform === 'darwin') return 'open';
  if (platform === 'linux') return 'xdg-open';
  return null;
}

/**
 * `open`/`xdg-open` ile açar. Çıkış kodu 0 değilse ya da komut yoksa başarısız. Bazı Linux masaüstlerinde
 * xdg-open tarayıcı kapanana dek bekler: süre dolarsa açılmış sayılır (adres her durumda ekrana yazılır).
 */
export function openWith(spawnImpl, platform, url, timeoutMs = 5000) {
  const command = browserCommand(platform);
  if (!command) return Promise.resolve(false);
  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    const done = (value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(value);
    };
    let child;
    try {
      child = spawnImpl(command, [url], { stdio: 'ignore', detached: true });
    } catch {
      done(false);
      return;
    }
    child.once('error', () => done(false));
    child.once('exit', (code) => done(code === 0));
    timer = setTimeout(() => {
      if (typeof child.unref === 'function') child.unref();
      done(true);
    }, timeoutMs);
  });
}

const DEPLOY_STATES = ['QUEUED', 'INITIALIZING', 'BUILDING', 'READY', 'ERROR', 'CANCELED', 'BLOCKED'];

/** Vercel yayın durumunun okunur adı; bilinmeyen durum olduğu gibi yazılır. */
function deployState(state, lang) {
  return DEPLOY_STATES.includes(state) ? t(lang, `deploy.${state}`) : state;
}

// ---------------------------------------------------------------------------------------------
// Kaynak arşivi: gzip + tar (ustar, pax x/g, GNU L/K), bellekte
// ---------------------------------------------------------------------------------------------

function corrupt(detailKey) {
  return new KurError(msg('archive.unreadable', msg(detailKey)), msg('archive.unreadableHint'));
}

function readCString(buffer, start, length) {
  const field = buffer.subarray(start, start + length);
  const end = field.indexOf(0);
  return (end === -1 ? field : field.subarray(0, end)).toString('utf8');
}

function readNumber(buffer, start, length) {
  const field = buffer.subarray(start, start + length);
  if (field[0] & 0x80) {
    // GNU base-256 kodlaması (çok büyük dosyalar).
    let value = field[0] & 0x7f;
    for (let i = 1; i < field.length; i += 1) value = value * 256 + field[i];
    return value;
  }
  const text = readCString(buffer, start, length).trim();
  if (text === '') return 0;
  if (!/^[0-7]+$/.test(text)) throw corrupt('archive.numberField');
  return Number.parseInt(text, 8);
}

function parsePax(data) {
  const records = {};
  let offset = 0;
  while (offset < data.length) {
    const space = data.indexOf(0x20, offset);
    if (space === -1) break;
    const length = Number.parseInt(data.toString('utf8', offset, space), 10);
    if (!Number.isSafeInteger(length) || length <= 0 || offset + length > data.length) throw corrupt('archive.paxRecord');
    const record = data.toString('utf8', space + 1, offset + length - 1);
    const equals = record.indexOf('=');
    if (equals > 0) records[record.slice(0, equals)] = record.slice(equals + 1);
    offset += length;
  }
  return records;
}

/**
 * Tar ayrıştırıcı (saf). Döner: `{ entries: [{ path, type: 'file'|'symlink', mode, data?, linkTarget? }], comment }`.
 * Klasör ve sabit bağ kayıtları atlanır; `comment` GitHub arşivlerinde kaynağın commit kimliğidir.
 */
export function parseTar(buffer) {
  const entries = [];
  let offset = 0;
  let pax = {};
  let globalPax = {};
  let longName = null;
  let longLink = null;
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    let sum = 0;
    for (let i = 0; i < 512; i += 1) sum += i >= 148 && i < 156 ? 0x20 : header[i];
    if (sum !== readNumber(header, 148, 8)) throw corrupt('archive.checksum');
    const typeflag = header[156] === 0 ? '0' : String.fromCharCode(header[156]);
    const size = typeflag !== 'x' && typeflag !== 'g' && pax.size !== undefined ? Number(pax.size) : readNumber(header, 124, 12);
    if (!Number.isSafeInteger(size) || size < 0) throw corrupt('archive.size');
    const dataStart = offset + 512;
    if (dataStart + size > buffer.length) throw corrupt('archive.missingData');
    const data = buffer.subarray(dataStart, dataStart + size);
    offset = dataStart + Math.ceil(size / 512) * 512;

    if (typeflag === 'x') {
      pax = parsePax(data);
      continue;
    }
    if (typeflag === 'g') {
      globalPax = { ...globalPax, ...parsePax(data) };
      continue;
    }
    if (typeflag === 'L') {
      longName = readCString(data, 0, data.length);
      continue;
    }
    if (typeflag === 'K') {
      longLink = readCString(data, 0, data.length);
      continue;
    }
    const posix = header.toString('latin1', 257, 263) === 'ustar\u0000';
    const prefix = posix ? readCString(header, 345, 155) : '';
    const shortName = readCString(header, 0, 100);
    const entryPath = pax.path !== undefined ? pax.path : longName !== null ? longName : prefix ? `${prefix}/${shortName}` : shortName;
    const linkTarget = pax.linkpath !== undefined ? pax.linkpath : longLink !== null ? longLink : readCString(header, 157, 100);
    const mode = readNumber(header, 100, 8);
    pax = {};
    longName = null;
    longLink = null;
    if (typeflag === '0' || typeflag === '7') entries.push({ path: entryPath, type: 'file', mode, data });
    else if (typeflag === '2') entries.push({ path: entryPath, type: 'symlink', mode, linkTarget });
  }
  return { entries, comment: typeof globalPax.comment === 'string' ? globalPax.comment : null };
}

/** GitHub arşivindeki tek üst klasörü (`repo-sürüm/`) atar; güvensiz yol varsa durur. */
export function stripTopFolder(entries) {
  let top = null;
  const out = [];
  for (const entry of entries) {
    const parts = entry.path.split('/');
    if (parts[parts.length - 1] === '') parts.pop();
    if (top === null) top = parts[0];
    if (parts[0] !== top) throw corrupt('archive.multipleTop');
    const rest = parts.slice(1);
    if (rest.length === 0) continue;
    if (rest.some((part) => part === '' || part === '.' || part === '..') || entry.path.startsWith('/')) throw corrupt('archive.unsafePath');
    if (rest[0] === '.git') continue;
    out.push({ ...entry, path: rest.join('/') });
  }
  return out;
}

/** Geçerli UTF-8 ve NUL içermiyorsa metin (BOM korunur), değilse null. */
export function decodeText(buffer) {
  if (buffer.includes(0)) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer);
  } catch {
    return null;
  }
}

export function gitMode(file) {
  if (file.type === 'symlink') return '120000';
  return file.mode & 0o111 ? '100755' : '100644';
}

/** Metin dosyaları ağaçta `content` ile; ikili ya da büyük dosyalar ayrı blob olarak yüklenir. */
export function planSourceTree(files, { inlineMaxBytes = INLINE_TEXT_MAX_BYTES } = {}) {
  const inline = [];
  const blobs = [];
  for (const file of files) {
    const mode = gitMode(file);
    if (file.type === 'symlink') {
      inline.push({ path: file.path, mode, type: 'blob', content: file.linkTarget });
      continue;
    }
    const text = file.data.length <= inlineMaxBytes ? decodeText(file.data) : null;
    if (text !== null) inline.push({ path: file.path, mode, type: 'blob', content: text });
    else blobs.push({ path: file.path, mode, data: file.data });
  }
  return { inline, blobs };
}

/** Ağaç girdilerini istek başına ~`maxBytes` JSON olacak parçalara böler (tek büyük girdi tek başına). */
export function chunkTreeEntries(entries, maxBytes = TREE_CHUNK_BYTES) {
  const chunks = [];
  let current = [];
  let size = 0;
  for (const entry of entries) {
    const entrySize = Buffer.byteLength(JSON.stringify(entry)) + 1;
    if (current.length > 0 && size + entrySize > maxBytes) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(entry);
    size += entrySize;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * GitHub sınır yanıtında beklenecek saniye; sınır değilse ya da çok uzunsa null.
 * Sıra: `retry-after`, sonra `x-ratelimit-remaining: 0` ise `x-ratelimit-reset`, sonra en az 1 dk (üstel).
 */
export function rateLimitWait({ status, headers, data }, nowSeconds, attempt = 0) {
  if (status !== 403 && status !== 429) return null;
  const header = (name) => (headers && typeof headers.get === 'function' ? headers.get(name) : null);
  const retryAfter = header('retry-after');
  const message = apiErrorDetail(data).message || '';
  let wait;
  if (retryAfter !== null && /^\d+$/.test(retryAfter.trim())) wait = Number(retryAfter);
  else if (header('x-ratelimit-remaining') === '0' && /^\d+$/.test(String(header('x-ratelimit-reset')))) wait = Math.max(1, Number(header('x-ratelimit-reset')) - nowSeconds);
  else if (status === 429 || /rate limit/i.test(message)) wait = 60 * 2 ** attempt;
  else return null;
  return wait > MAX_RATE_WAIT_SECONDS ? null : Math.ceil(wait);
}

// ---------------------------------------------------------------------------------------------
// HTTP istemcileri (fetch enjekte edilir; testler taklit verir)
// ---------------------------------------------------------------------------------------------

async function readJson(response) {
  const text = await response.text().catch(() => '');
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** İstek süresi gövde boyutuna göre: 60 sn + her 50 KB için 1 sn (7,7 MB blob ≈ 4 dk). */
export function requestTimeoutMs(bodyBytes) {
  return 60_000 + Math.ceil(Math.max(0, bodyBytes) / 51_200) * 1000;
}

/**
 * `ctx` verilirse (sleep/say/nowSeconds): GitHub'ın istek sınırında bekleyip yeniden dener; ağ hatası ya da
 * zaman aşımında GET'leri ve `retry: true` verilen (aynı sonucu veren) yazmaları 3 kez daha dener.
 */
export function githubApi(fetchImpl, ctx = null) {
  async function once(pathname, { token, method = 'GET', body } = {}) {
    const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': USER_AGENT };
    if (token) headers.Authorization = `Bearer ${token}`;
    const payload = body === undefined ? undefined : JSON.stringify(body);
    if (payload !== undefined) headers['Content-Type'] = 'application/json';
    let response;
    let data;
    try {
      response = await fetchImpl(`${GITHUB_API}${pathname}`, {
        method,
        headers,
        body: payload,
        signal: AbortSignal.timeout(requestTimeoutMs(payload === undefined ? 0 : Buffer.byteLength(payload))),
      });
      data = await readJson(response);
    } catch {
      throw networkError('GitHub');
    }
    return { status: response.status, headers: response.headers, data };
  }
  return async function github(pathname, options = {}) {
    const retryNetwork = Boolean(ctx) && ((options.method || 'GET') === 'GET' || options.retry === true);
    let networkFailures = 0;
    for (let attempt = 0; ; attempt += 1) {
      let result;
      try {
        result = await once(pathname, options);
      } catch (error) {
        if (!(error instanceof NetworkError) || !retryNetwork || networkFailures >= 3) throw error;
        networkFailures += 1;
        const wait = 2 ** networkFailures;
        ctx.io.say(t(ctx.lang, 'api.retryNetwork', wait, networkFailures));
        await ctx.sleep(wait * 1000);
        continue;
      }
      const wait = ctx && attempt < 4 ? rateLimitWait(result, ctx.nowSeconds(), attempt) : null;
      if (wait === null) return result;
      ctx.io.say(t(ctx.lang, 'api.rateWait', wait));
      await ctx.sleep(wait * 1000);
    }
  };
}

/** `session.token` ve `session.teamId` her istekte okunur (oturum yenilenebilir). */
export function vercelApi(fetchImpl, session) {
  return async function vercel(pathname, { method = 'GET', body, query = {} } = {}) {
    const url = new URL(pathname, VERCEL_API);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    if (session.teamId) url.searchParams.set('teamId', session.teamId);
    const headers = { Authorization: `Bearer ${session.token}`, 'User-Agent': USER_AGENT };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let response;
    try {
      response = await fetchImpl(url.toString(), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw networkError('Vercel');
    }
    return { status: response.status, data: await readJson(response) };
  };
}

function expect(result, statuses, service, what) {
  if (!statuses.includes(result.status)) throw new ApiError(service, result.status, result.data, what);
  return result.data;
}

function shaOf(result, what) {
  const data = expect(result, [200, 201], 'GitHub', what);
  if (!data || typeof data.sha !== 'string' || !/^[0-9a-f]{40,64}$/.test(data.sha)) throw new KurError(msg('api.unexpectedReply', what), msg('hint.rerun'));
  return data.sha;
}

export async function vercelAppDomainFree(fetchImpl, name) {
  let response;
  try {
    response = await fetchImpl(`https://${name}.vercel.app/`, {
      method: 'GET',
      redirect: 'manual',
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new NetworkError(msg('net.cannotCheck', name));
  }
  const body = response.status === 404 ? await response.text().catch(() => '') : '';
  return isDeploymentNotFound(response.status, response.headers, body);
}

export async function convertManifestCode(fetchImpl, code) {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(code || '')) throw new KurError(msg('manifest.badCode'), msg('hint.rerun'));
  const result = await githubApi(fetchImpl)(`/app-manifests/${encodeURIComponent(code)}/conversions`, { method: 'POST' });
  const data = expect(result, [201], 'GitHub', msg('what.manifestApp'));
  if (!data || !data.id || !data.slug || !data.client_id || !data.client_secret || !data.pem) {
    throw new KurError(msg('manifest.incomplete'), msg('hint.rerun'));
  }
  return {
    id: data.id,
    slug: data.slug,
    name: typeof data.name === 'string' ? data.name : data.slug,
    clientId: data.client_id,
    clientSecret: data.client_secret,
    pem: data.pem,
    ownerLogin: data.owner && typeof data.owner.login === 'string' ? data.owner.login : null,
  };
}

/** Kurulumdaki yetkilendirme kodunu kullanıcı anahtarına çevirir (client id/secret ile). */
export async function exchangeUserCode(fetchImpl, { clientId, clientSecret, code }) {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(code || '')) throw new KurError(msg('oauth.badCode'));
  let response;
  try {
    response = await fetchImpl('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw networkError('GitHub');
  }
  const data = await readJson(response);
  if (!response.ok || !data || typeof data.access_token !== 'string' || !data.access_token) {
    const reason = data && typeof data.error === 'string' && /^[a-z_]{1,60}$/.test(data.error) ? ` (${data.error})` : '';
    throw new KurError(msg('oauth.failed', reason), msg('oauth.failedHint'));
  }
  return data.access_token;
}

/**
 * Kurulacak sürüm GitHub uygulaması modunu biliyor mu: kök `axon-release.json` → `capabilities` dizisinde
 * `github-app`. Yoksa (ör. v0.2.1 yalnız GITHUB_TOKEN bilir) hiçbir şey oluşturulmadan durulur.
 */
export function checkSourceCapabilities(files, label = '') {
  const manifest = files.find((file) => file.path === 'axon-release.json' && file.type === 'file');
  let capabilities = [];
  try {
    const data = manifest ? JSON.parse(manifest.data.toString('utf8')) : null;
    if (data && Array.isArray(data.capabilities)) capabilities = data.capabilities;
  } catch {
    capabilities = [];
  }
  if (!capabilities.includes(REQUIRED_CAPABILITY)) {
    throw new KurError(msg('source.unsupported', label), msg('source.unsupportedHint'));
  }
}

/**
 * 1. adım: kaynağın son kararlı sürümü (yoksa varsayılan dal) kimliksiz bulunur, arşivi indirilip bellekte açılır
 * ve GitHub uygulaması modunu desteklediği denetlenir (hesaplarda hiçbir şey oluşturulmadan önce).
 * Döner: `{ ref, version, commit, files, totalBytes }`.
 */
export async function downloadSource(ctx, source) {
  const github = githubApi(ctx.fetch, ctx);
  let ref;
  let version = null;
  const release = await github(`/repos/${source}/releases/latest`);
  const tag = release.status === 200 && release.data && typeof release.data.tag_name === 'string' ? release.data.tag_name : '';
  if (tag) {
    ref = tag;
    version = tag;
  } else if (release.status === 404 || release.status === 200) {
    const repo = await github(`/repos/${source}`);
    if (repo.status === 404) throw new KurError(msg('source.notFound', source), msg('source.notFoundHint'));
    const data = expect(repo, [200], 'GitHub', msg('what.readSource'));
    ref = data && typeof data.default_branch === 'string' && data.default_branch ? data.default_branch : 'main';
  } else {
    throw new ApiError('GitHub', release.status, release.data, msg('what.readRelease'));
  }

  const url = `https://codeload.github.com/${source}/tar.gz/${ref.split('/').map(encodeURIComponent).join('/')}`;
  let compressed = null;
  for (let attempt = 1; compressed === null; attempt += 1) {
    try {
      const response = await ctx.fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(300_000) });
      if (response.status !== 200) throw new KurError(msg('source.downloadFailed', response.status), msg('source.downloadFailedHint'));
      const length = Number(response.headers.get('content-length'));
      if (Number.isFinite(length) && length > MAX_ARCHIVE_BYTES) throw corrupt('archive.tooBig');
      compressed = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (error instanceof KurError) throw error;
      if (attempt >= 3) throw new NetworkError(msg('source.downloadNetwork'));
      ctx.io.say(t(ctx.lang, 'source.retrying', 2 ** attempt, attempt));
      await ctx.sleep(2 ** attempt * 1000);
    }
  }
  if (compressed.length > MAX_ARCHIVE_BYTES) throw corrupt('archive.tooBig');
  let tar;
  try {
    tar = zlib.gunzipSync(compressed, { maxOutputLength: 4 * MAX_ARCHIVE_BYTES });
  } catch {
    throw corrupt('archive.gzip');
  }
  const parsed = parseTar(tar);
  const files = stripTopFolder(parsed.entries);
  if (files.length === 0) throw corrupt('archive.empty');
  checkSourceCapabilities(files, version || ref);
  if (!version) {
    const pkg = files.find((file) => file.path === 'package.json' && file.type === 'file');
    try {
      const value = pkg ? JSON.parse(pkg.data.toString('utf8')).version : null;
      if (typeof value === 'string' && /^[\w.+-]{1,40}$/.test(value)) version = `v${value}`;
    } catch {
      // sürüm bilinmiyor
    }
  }
  const totalBytes = files.reduce((sum, file) => sum + (file.data ? file.data.length : 0), 0);
  return { ref, version, commit: parsed.comment, files, totalBytes };
}

// ---------------------------------------------------------------------------------------------
// Yerel sunucu: GitHub App manifest akışı + kurulumdaki kullanıcı yetkilendirmesi
// ---------------------------------------------------------------------------------------------

/** Hatanın verilen dildeki metni; `text(lang)` olmayan hatalarda `.message`. */
function errorText(error, lang) {
  return error && typeof error.text === 'function' ? error.text(lang) : String((error && error.message) || '');
}

function sendHtml(res, status, html) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(html);
}

/**
 * 127.0.0.1'de rastgele portta sunucu açar, tarayıcıda manifest sayfasını açtırır; uygulama oluşunca
 * kurulum sayfasına yönlendirir; kurulumdan sonra GitHub ilk callback adresine (bu sunucu) kodla döner.
 * Döner: `{ app, userToken, installationIdHint }`.
 */
export async function runGithubAppFlow(ctx, { appName, productionUrl, timeoutMs = BROWSER_WAIT_MS }) {
  const L = (key, ...args) => t(ctx.lang, key, ...args);
  // Sonuç sayfası: `<anahtar>.title` ve `<anahtar>.body` iletilerinden.
  const resultFor = (key, link) => resultPage(L(`${key}.title`), L(`${key}.body`), link, ctx.lang);
  const appState = Buffer.from(ctx.randomBytes(16)).toString('hex');
  const installState = Buffer.from(ctx.randomBytes(16)).toString('hex');
  let app = null;
  let converting = null;
  let finished = false;
  let resolveDone;
  let rejectDone;
  const done = new Promise((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });

  const server = http.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const manifest = buildManifest({ appName, productionUrl, localBase: base, lang: ctx.lang });
  const installUrl = (slug) => `https://github.com/apps/${encodeURIComponent(slug)}/installations/new`;
  const authorizeUrl = () => {
    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', app.clientId);
    url.searchParams.set('redirect_uri', `${base}/github/callback`);
    url.searchParams.set('state', installState);
    return url.toString();
  };

  const finish = (error, value) => {
    if (finished) return;
    finished = true;
    if (error) rejectDone(error);
    else resolveDone(value);
  };

  async function handle(req, res) {
    // DNS yeniden bağlama saldırısına karşı yalnız kendi adresimiz.
    if (req.headers.host !== `127.0.0.1:${port}`) return sendHtml(res, 421, resultFor('page.badAddress'));
    if (req.method !== 'GET') return sendHtml(res, 405, resultFor('page.badMethod'));
    const url = new URL(req.url || '/', base);

    if (url.pathname === '/') {
      if (app) return sendHtml(res, 200, resultFor('page.appReady', { href: installUrl(app.slug), label: L('page.appReady.link') }));
      return sendHtml(res, 200, manifestPage({ manifest, state: appState, lang: ctx.lang }));
    }

    if (url.pathname === '/github/app-created') {
      if (url.searchParams.get('state') !== appState) {
        return sendHtml(res, 400, resultFor('page.foreignState'));
      }
      if (!app) {
        if (!converting) converting = convertManifestCode(ctx.fetch, url.searchParams.get('code'));
        try {
          app = await converting;
        } catch (error) {
          sendHtml(res, 502, resultFor('page.appFailed'));
          return finish(error);
        }
        ctx.created.githubApp = { name: app.name, slug: app.slug, settingsUrl: `https://github.com/settings/apps/${app.slug}` };
        ctx.io.say(L('flow.appCreated', app.name));
        ctx.io.say(L('flow.install'));
        ctx.io.say(L('flow.installUrl', installUrl(app.slug)));
        ctx.io.say(L('flow.authorizeUrl', authorizeUrl()));
      }
      res.writeHead(302, { Location: installUrl(app.slug), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
      return res.end();
    }

    if (url.pathname === '/github/callback') {
      if (!app) return sendHtml(res, 400, resultFor('page.appFirst'));
      const state = url.searchParams.get('state');
      // Kurulumdan dönüşte GitHub state göndermez; gönderildiyse bizimki olmalı.
      if (state !== null && state !== installState) return sendHtml(res, 400, resultFor('page.foreignInstall'));
      if (finished) return sendHtml(res, 200, resultFor('page.finished'));
      const retry = { href: authorizeUrl(), label: L('page.retry') };
      const code = url.searchParams.get('code');
      if (!code) return sendHtml(res, 400, resultFor('page.noAuth', retry));
      let userToken;
      try {
        userToken = await exchangeUserCode(ctx.fetch, { clientId: app.clientId, clientSecret: app.clientSecret, code });
      } catch (error) {
        ctx.io.say(L('flow.retryLine', errorText(error, ctx.lang)));
        return sendHtml(res, 400, resultFor('page.authFailed', retry));
      }
      sendHtml(res, 200, resultFor('page.connected'));
      return finish(null, { app, userToken, installationIdHint: url.searchParams.get('installation_id') });
    }

    return sendHtml(res, 404, resultFor('page.notFound'));
  }

  server.on('request', (req, res) => {
    handle(req, res).catch((error) => {
      if (!res.headersSent) sendHtml(res, 500, resultFor('page.error'));
      finish(error);
    });
  });

  const timer = setTimeout(
    () => finish(new KurError(msg('flow.timeout'), msg('flow.timeoutHint'))),
    timeoutMs,
  );
  try {
    ctx.io.say(L('flow.opening'));
    ctx.io.say(L('flow.step1'));
    ctx.io.say(L('flow.step2'));
    ctx.io.say(L('flow.step3'));
    await showUrl(ctx, `${base}/`);
    return await done;
  } finally {
    clearTimeout(timer);
    server.close();
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  }
}

// ---------------------------------------------------------------------------------------------
// Adımlar
// ---------------------------------------------------------------------------------------------

/** Tarayıcıda açmayı dener; açılsa da açılmasa da adres HER ZAMAN ekrana yazılır. */
async function showUrl(ctx, url) {
  let opened = false;
  try {
    opened = await ctx.open(url);
  } catch {
    opened = false;
  }
  ctx.io.say(t(ctx.lang, opened ? 'url.openIfNeeded' : 'url.openFailed', url));
  return opened;
}

function readVercelAuthFile(ctx) {
  for (const dir of vercelConfigDirs({ platform: ctx.platform, home: ctx.home, env: ctx.env })) {
    const text = ctx.readText(path.join(dir, 'auth.json'));
    if (!text) continue;
    const auth = parseVercelAuth(text, ctx.nowSeconds());
    if (!auth) continue;
    return { ...auth, currentTeam: parseVercelCurrentTeam(ctx.readText(path.join(dir, 'config.json')) || '') };
  }
  return null;
}

async function vercelUser(ctx, token) {
  const result = await vercelApi(ctx.fetch, { token })('/v2/user');
  const user = result.data && result.data.user;
  if (result.status !== 200 || !user || typeof user.username !== 'string') return null;
  return { username: user.username, defaultTeamId: user.defaultTeamId || null };
}

async function runVercelLogin(ctx) {
  ctx.io.say(t(ctx.lang, 'vercel.loginOpening'));
  ctx.io.say(t(ctx.lang, 'vercel.loginNote'));
  const code = await ctx.run('npx', ['--yes', `vercel@${VERCEL_CLI_VERSION}`, 'login']);
  if (code !== 0) ctx.io.say(t(ctx.lang, 'vercel.loginFailed'));
  return code === 0;
}

async function loginFromCli(ctx) {
  if (!(await runVercelLogin(ctx))) return null;
  const auth = readVercelAuthFile(ctx);
  if (!auth || auth.expired) return null;
  const user = await vercelUser(ctx, auth.token);
  return user ? { auth, user } : null;
}

async function loginFromPaste(ctx) {
  ctx.io.say(t(ctx.lang, 'vercel.pasteIntro'));
  ctx.io.say(t(ctx.lang, 'vercel.pasteStep1', VERCEL_TOKENS_URL));
  ctx.io.say(t(ctx.lang, 'vercel.pasteStep2'));
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = (await ctx.io.askSecret(t(ctx.lang, 'vercel.tokenPrompt'))).trim();
    if (!token) continue;
    const user = await vercelUser(ctx, token);
    if (user) return { auth: { token, expiresAt: null, currentTeam: null }, user };
    ctx.io.say(t(ctx.lang, 'vercel.tokenRejected'));
  }
  throw new KurError(msg('vercel.connectFailed'), msg('vercel.connectFailedHint', VERCEL_TOKENS_URL));
}

/** 2. adım: Vercel girişi ve ekip seçimi. Döner: `{ session: { token, teamId, source, expiresAt }, user, team }`. */
export async function vercelLogin(ctx) {
  let login = null;
  const existing = readVercelAuthFile(ctx);
  if (existing && !existing.expired) {
    const user = await vercelUser(ctx, existing.token);
    if (user && (await ctx.io.confirm(t(ctx.lang, 'vercel.useAccount', user.username), true))) {
      login = { auth: existing, user, source: 'file' };
    }
  }
  if (!login) {
    const fromCli = await loginFromCli(ctx);
    login = fromCli ? { ...fromCli, source: 'file' } : { ...(await loginFromPaste(ctx)), source: 'paste' };
  }
  const session = { token: login.auth.token, teamId: null, source: login.source, expiresAt: login.auth.expiresAt };
  const team = await chooseVercelTeam(ctx, session, login.user, login.auth.currentTeam);
  session.teamId = team ? team.id : null;
  ctx.io.say(t(ctx.lang, 'vercel.account', login.user.username, team ? team.slug : null));
  return { session, user: login.user, team };
}

async function chooseVercelTeam(ctx, session, user, currentTeam) {
  const result = await vercelApi(ctx.fetch, { token: session.token })('/v2/teams', { query: { limit: 100 } });
  const data = expect(result, [200], 'Vercel', msg('what.readTeams'));
  const teams = data && Array.isArray(data.teams) ? data.teams : [];
  const usable = teams.filter((team) => team && typeof team.id === 'string' && typeof team.slug === 'string');
  if (usable.length <= 1) return usable[0] || null;
  const preferred = usable.findIndex((team) => team.id === (currentTeam || user.defaultTeamId));
  ctx.io.say(t(ctx.lang, 'vercel.manyTeams'));
  usable.forEach((team, index) => ctx.io.say(`    ${index + 1}) ${team.slug}${team.name && team.name !== team.slug ? ` (${team.name})` : ''}`));
  for (;;) {
    const answer = await ctx.io.ask(t(ctx.lang, 'vercel.teamPrompt'), String((preferred >= 0 ? preferred : 0) + 1));
    const index = Number.parseInt(answer, 10) - 1;
    if (usable[index]) return usable[index];
    ctx.io.say(t(ctx.lang, 'vercel.teamNumber', usable.length));
  }
}

/** Uzun adımlardan önce: dosyadan gelen Vercel oturumunun süresi bitmek üzereyse yeniden giriş. */
export async function ensureFreshVercel(ctx, vercel) {
  const { session } = vercel;
  if (session.source !== 'file' || session.expiresAt === null || session.expiresAt - ctx.nowSeconds() > 300) return;
  ctx.io.say(t(ctx.lang, 'vercel.sessionExpiring'));
  const fresh = (await loginFromCli(ctx)) || (await loginFromPaste(ctx));
  if (fresh.user.username !== vercel.user.username) {
    throw new KurError(msg('vercel.otherAccount', fresh.user.username), msg('vercel.otherAccountHint', vercel.user.username));
  }
  session.token = fresh.auth.token;
  session.expiresAt = fresh.auth.expiresAt;
}

/** Boş bir ad sorar: DNS'e uygun, `<ad>.vercel.app` boş, Vercel hesabında aynı adlı proje yok. */
async function askFreeProjectName(ctx, api, question) {
  for (;;) {
    const answer = (await ctx.io.ask(question, defaultProjectName(ctx.randomInt))).trim().toLowerCase();
    const problem = validateProjectName(answer, ctx.lang);
    if (problem) {
      ctx.io.say(`  ! ${problem}`);
      continue;
    }
    if (!(await vercelAppDomainFree(ctx.fetch, answer))) {
      ctx.io.say(t(ctx.lang, 'project.domainTaken', answer));
      continue;
    }
    const existing = await api(`/v9/projects/${encodeURIComponent(answer)}`);
    if (existing.status === 200) {
      ctx.io.say(t(ctx.lang, 'project.existsInAccount', answer));
      continue;
    }
    expect(existing, [404], 'Vercel', msg('what.checkProject'));
    return answer;
  }
}

/** 3. adım: ad seçimi (proje 6. adımda, repo hazır olunca açılır). */
export async function chooseProjectName(ctx, vercel) {
  const name = await askFreeProjectName(ctx, vercelApi(ctx.fetch, vercel.session), t(ctx.lang, 'project.namePrompt'));
  ctx.io.say(t(ctx.lang, 'project.nameFree', name));
  return name;
}

/** 4. adım: GitHub uygulaması, kullanıcı anahtarı ve kurulum. */
export async function setupGithub(ctx, { productionUrl }) {
  const { app, userToken, installationIdHint } = await runGithubAppFlow(ctx, { appName: githubAppName(ctx.randomInt), productionUrl });
  const github = githubApi(ctx.fetch, ctx);
  const user = expect(await github('/user', { token: userToken }), [200], 'GitHub', msg('what.readAccount'));
  const login = user && user.login;
  if (typeof login !== 'string') throw new KurError(msg('github.accountUnreadable'), msg('hint.rerun'));
  if (app.ownerLogin && app.ownerLogin.toLowerCase() !== login.toLowerCase()) {
    throw new KurError(msg('github.ownerMismatch', app.ownerLogin, login), msg('github.ownerMismatchHint'));
  }
  ctx.io.say(t(ctx.lang, 'github.account', login));
  const installation = await ensureInstallation(ctx, app, login, installationIdHint);
  return { app, userToken, login, installation };
}

async function ensureInstallation(ctx, app, login, installationIdHint) {
  const github = githubApi(ctx.fetch, ctx);
  const settingsUrl = (id) => `https://github.com/settings/installations/${id}`;
  for (let attempt = 1; ; attempt += 1) {
    const jwt = githubAppJwt({ issuer: app.clientId, pem: app.pem, nowSeconds: ctx.nowSeconds() });
    const result = await github(`/users/${encodeURIComponent(login)}/installation`, { token: jwt });
    if (result.status === 404) {
      if (attempt >= 3) throw new KurError(msg('install.notInstalled'), msg('install.notInstalledHint', app.slug));
      ctx.io.say(t(ctx.lang, 'install.missing', login));
      await showUrl(ctx, `https://github.com/apps/${app.slug}/installations/new`);
      await ctx.io.pause(t(ctx.lang, 'install.pauseInstall'));
      continue;
    }
    const data = expect(result, [200], 'GitHub', msg('what.readInstall'));
    if (installationIdHint && String(data.id) !== String(installationIdHint)) {
      ctx.io.say(t(ctx.lang, 'install.idMismatch'));
    }
    if (data.repository_selection === 'all') {
      ctx.io.say(t(ctx.lang, 'install.ok'));
      return { id: data.id, repositorySelection: 'all' };
    }
    if (attempt >= 2) {
      ctx.io.say(t(ctx.lang, 'install.warnSelected'));
      ctx.io.say(t(ctx.lang, 'install.warnSettings', settingsUrl(data.id)));
      return { id: data.id, repositorySelection: data.repository_selection };
    }
    ctx.io.say(t(ctx.lang, 'install.selectedOnly'));
    await showUrl(ctx, settingsUrl(data.id));
    await ctx.io.pause(t(ctx.lang, 'install.pauseSelectAll'));
  }
}

async function askRepoName(ctx, question, suggestion, { forbidden = [] } = {}) {
  for (;;) {
    const answer = (await ctx.io.ask(question, suggestion)).trim();
    const problem = validateRepoName(answer, ctx.lang);
    if (problem) {
      ctx.io.say(`  ! ${problem}`);
      continue;
    }
    if (forbidden.some((name) => name.toLowerCase() === answer.toLowerCase())) {
      ctx.io.say(t(ctx.lang, 'repo.reserved'));
      continue;
    }
    if (answer.toLowerCase().startsWith('client-')) {
      ctx.io.say(t(ctx.lang, 'repo.clientPrefix'));
      continue;
    }
    return answer;
  }
}

async function waitForBranch(ctx, github, token, fullName, branch) {
  for (let i = 0; i < 45; i += 1) {
    const result = await github(`/repos/${fullName}/branches/${encodeURIComponent(branch)}`, { token });
    if (result.status === 200) return;
    await ctx.sleep(2000);
  }
  throw new KurError(msg('repo.branchTimeout'), msg('repo.branchTimeoutHint', fullName));
}

/**
 * Özel repo açar (`auto_init`); ad doluysa yenisini sorar. `labelKey`: 'repo.codeLabel' ya da 'repo.dataLabel'.
 * Döner: `{ name, data, created }`.
 */
async function createPrivateRepo(ctx, github, token, { login, name, labelKey, description, forbidden = [], allowExisting = false }) {
  const label = t(ctx.lang, labelKey);
  let current = name;
  for (;;) {
    const existing = await github(`/repos/${login}/${current}`, { token });
    if (existing.status === 200) {
      if (allowExisting && existing.data && existing.data.private === true && existing.data.fork !== true) {
        if (await ctx.io.confirm(t(ctx.lang, 'repo.useExisting', login, current, label), true)) return { name: current, data: existing.data, created: false };
      } else if (allowExisting) {
        ctx.io.say(t(ctx.lang, 'repo.notAllowed', login, current, label));
      }
      current = await askRepoName(ctx, t(ctx.lang, 'repo.unavailable', login, current, label), `${current}-2`, { forbidden });
      continue;
    }
    expect(existing, [404], 'GitHub', msg('what.checkRepoName'));
    const created = await github('/user/repos', { token, method: 'POST', body: { name: current, description, private: true, auto_init: true } });
    if (created.status === 201) return { name: current, data: created.data || {}, created: true };
    if (created.status === 422) {
      ctx.io.say(t(ctx.lang, 'repo.createFailed', login, current, apiErrorDetail(created.data).message || t(ctx.lang, 'repo.nameInUse')));
      current = await askRepoName(ctx, t(ctx.lang, 'repo.otherName', label), `${current}-2`, { forbidden });
      continue;
    }
    throw new ApiError('GitHub', created.status, created.data, msg('what.createRepo', msg(labelKey)));
  }
}

/**
 * Kaynağı tek, ebeveynsiz commit olarak yükler (Git Data API): ikili/büyük dosyalar blob, metinler
 * ağaçta `content`; ağaç ~2 MB'lık parçalarla `base_tree` üzerine kurulur; dal `force` ile taşınır.
 * İçerik oluşturan istekler arasında en az WRITE_GAP_MS beklenir.
 */
export async function uploadSource(ctx, { github, token, fullName, branch, source }) {
  let last = null;
  const write = async (pathname, body, method = 'POST') => {
    if (last !== null) {
      const wait = last + WRITE_GAP_MS - ctx.nowMs();
      if (wait > 0) await ctx.sleep(wait);
    }
    last = ctx.nowMs();
    // Blob/ağaç içerikle adreslenir, ref `force` ile aynı yere taşınır: yeniden denemek güvenli.
    return github(pathname, { token, method, body, retry: true });
  };
  const plan = planSourceTree(source.files);
  ctx.io.say(t(ctx.lang, 'upload.start', source.files.length, formatMegabytes(source.totalBytes, ctx.lang)));
  const blobEntries = [];
  for (const blob of plan.blobs) {
    const result = await write(`/repos/${fullName}/git/blobs`, { content: blob.data.toString('base64'), encoding: 'base64' });
    blobEntries.push({ path: blob.path, mode: blob.mode, type: 'blob', sha: shaOf(result, msg('what.uploadBlob', blob.path)) });
  }
  const chunks = chunkTreeEntries([...plan.inline, ...blobEntries]);
  let tree = null;
  for (let i = 0; i < chunks.length; i += 1) {
    const result = await write(`/repos/${fullName}/git/trees`, tree ? { base_tree: tree, tree: chunks[i] } : { tree: chunks[i] });
    tree = shaOf(result, msg('what.buildTree'));
    ctx.io.say(t(ctx.lang, 'upload.chunk', i + 1, chunks.length));
  }
  const title = `openPT ${source.version || `(${source.ref})`}`;
  const message = source.commit ? `${title}\n\n${t(ctx.lang, 'upload.commitSource', source.name, source.commit)}` : title;
  const commit = shaOf(await write(`/repos/${fullName}/git/commits`, { message, tree, parents: [] }), msg('what.createCommit'));
  expect(await write(`/repos/${fullName}/git/refs/heads/${encodeURIComponent(branch)}`, { sha: commit, force: true }, 'PATCH'), [200], 'GitHub', msg('what.updateBranch', branch));
  return { commit, tree, requests: plan.blobs.length + chunks.length + 2 };
}

/** 5. adım: kod reposu (kaynaktan tek commit, özel) ve veri reposu (özel, README'li). */
export async function createRepos(ctx, { login, token, source }) {
  const github = githubApi(ctx.fetch, ctx);
  const code = await createPrivateRepo(ctx, github, token, {
    login,
    name: DEFAULT_CODE_REPO,
    labelKey: 'repo.codeLabel',
    description: t(ctx.lang, 'repo.codeDescription'),
  });
  const codeFullName = `${login}/${code.name}`;
  ctx.created.codeRepo = `https://github.com/${codeFullName}`;
  const branch = typeof code.data.default_branch === 'string' && code.data.default_branch ? code.data.default_branch : 'main';
  await waitForBranch(ctx, github, token, codeFullName, branch);
  await uploadSource(ctx, { github, token, fullName: codeFullName, branch, source });
  ctx.io.say(t(ctx.lang, 'repo.codeReady', source.version || source.ref, `https://github.com/${codeFullName}`));

  const data = await createPrivateRepo(ctx, github, token, {
    login,
    name: dataRepoName(code.name),
    labelKey: 'repo.dataLabel',
    description: t(ctx.lang, 'repo.dataDescription'),
    forbidden: [code.name],
    allowExisting: true,
  });
  if (data.created) ctx.created.dataRepo = `https://github.com/${login}/${data.name}`;
  ctx.io.say(t(ctx.lang, 'repo.dataReady', `https://github.com/${login}/${data.name}`));
  return { codeName: code.name, codeFullName, codeRepoId: code.data.id || null, branch, dataName: data.name };
}

function linkedTo(project, fullName) {
  const link = project && project.link;
  return Boolean(link) && link.type === 'github' && typeof link.org === 'string' && typeof link.repo === 'string' && `${link.org}/${link.repo}`.toLowerCase() === fullName.toLowerCase();
}

/**
 * 6. adım: repo hazır olunca Vercel projesi `gitRepository` ile açılır (belgeli uç). Vercel'in GitHub uygulaması
 * repoyu görmüyorsa kurulum sayfası açılır, onaydan sonra yeniden denenir. Git erişim hatasında Vercel projeyi
 * bağlantısız açmış olabilir: sonraki deneme o adla çakışırsa ve proje BU çalıştırmada açıldıysa boş proje silinip
 * yeniden açılır (PT'ye yeni ad sorulmaz). Ad başka biri/başka bir projeyle dolduysa yeni ad sorulur.
 */
export async function ensureVercelProject(ctx, vercel, { name, repoFullName }) {
  const api = vercelApi(ctx.fetch, vercel.session);
  const getProject = async (idOrName) => {
    const result = await api(`/v9/projects/${encodeURIComponent(idOrName)}`);
    if (result.status === 404) return null;
    return expect(result, [200], 'Vercel', msg('what.readProject'));
  };
  const projectUrl = (projectName) => `https://vercel.com/${vercel.team ? vercel.team.slug : vercel.user.username}/${projectName}`;
  const posted = new Set();
  let current = name;
  for (let attempt = 1; ; attempt += 1) {
    const postedBefore = posted.has(current);
    posted.add(current);
    const created = await api('/v11/projects', {
      method: 'POST',
      body: { name: current, framework: 'nextjs', gitRepository: { type: 'github', repo: repoFullName } },
    });
    let project = null;
    if (created.status === 200 || created.status === 201) {
      project = await getProject((created.data && created.data.id) || current);
    } else {
      const error = new ApiError('Vercel', created.status, created.data, msg('what.openProject'));
      if (attempt < 12 && isVercelGitAccessError(error)) {
        // Bağlantısız açılmış olabilir: başarısız biterse "oluşturulanlar" listesinde görünsün.
        if (await getProject(current)) ctx.created.vercelProject = `${projectUrl(current)} ${t(ctx.lang, 'created.notConnected')}`;
        // Yeni açılan repoyu Vercel birkaç saniye sonra görebilir: önce kendiliğinden yeniden dene.
        if (attempt <= 2) {
          await ctx.sleep(5000);
          continue;
        }
        ctx.io.say(t(ctx.lang, 'project.cantSeeRepo', repoFullName));
        ctx.io.say(t(ctx.lang, 'project.installVercelApp'));
        await showUrl(ctx, safeLink(error.link, ['github.com']) || VERCEL_GITHUB_INSTALL_URL);
        await ctx.io.pause(t(ctx.lang, 'project.pressEnter'));
        continue;
      }
      if (attempt < 12 && isVercelLoginConnectionError(error)) {
        ctx.io.say(t(ctx.lang, 'project.noLoginConnection'));
        await showUrl(ctx, safeLink(error.link) || VERCEL_LOGIN_CONNECTIONS_URL);
        await ctx.io.pause(t(ctx.lang, 'project.pressEnter'));
        continue;
      }
      const existing = await getProject(current);
      if (existing && linkedTo(existing, repoFullName)) {
        project = existing; // önceki deneme aslında başarılı olmuş
      } else if (existing && !existing.link && postedBefore && attempt < 12) {
        ctx.io.say(t(ctx.lang, 'project.recreating', current));
        expect(await api(`/v9/projects/${encodeURIComponent(existing.id)}`, { method: 'DELETE' }), [200, 204], 'Vercel', msg('what.deleteProject'));
        delete ctx.created.vercelProject;
        continue;
      } else if (existing) {
        ctx.io.say(t(ctx.lang, 'project.nowTaken', current));
        current = await askFreeProjectName(ctx, api, t(ctx.lang, 'project.otherName'));
        continue;
      } else {
        throw error;
      }
    }
    if (!project || !project.id) throw new KurError(msg('project.unreadable'), msg('hint.rerun'));
    ctx.created.vercelProject = projectUrl(project.name || current);
    if (!linkedTo(project, repoFullName)) {
      throw new KurError(msg('project.notLinked'), msg('project.notLinkedHint', ctx.created.vercelProject, repoFullName));
    }
    ctx.io.say(t(ctx.lang, 'project.linked', ctx.created.vercelProject, repoFullName));
    return project;
  }
}

/** 7a: env yazımı (upsert) ve geri okuma. Hata mesajında değer yok, yalnız anahtar adları. */
export async function writeEnv(ctx, vercel, projectId, items) {
  const api = vercelApi(ctx.fetch, vercel.session);
  const result = await api(`/v10/projects/${encodeURIComponent(projectId)}/env`, { method: 'POST', query: { upsert: 'true' }, body: items });
  if (result.status !== 200 && result.status !== 201) throw new ApiError('Vercel', result.status, result.data, msg('what.writeEnv'));
  const failed = result.data && Array.isArray(result.data.failed) ? result.data.failed : [];
  if (failed.length) {
    const keys = failed
      .map((item) => {
        const error = (item && item.error) || {};
        const key = /^[A-Z0-9_]{1,100}$/.test(error.key || '') ? error.key : /^[A-Z0-9_]{1,100}$/.test(error.envVarKey || '') ? error.envVarKey : '?';
        const code = /^[a-z0-9_]{1,60}$/.test(error.code || '') ? ` (${error.code})` : '';
        return `${key}${code}`;
      })
      .join(', ');
    throw new KurError(msg('env.failed', keys), msg('env.failedHint'));
  }
  const saved = expect(await api(`/v10/projects/${encodeURIComponent(projectId)}/env`), [200], 'Vercel', msg('what.readEnvBack'));
  const envs = saved && Array.isArray(saved.envs) ? saved.envs : [];
  const missing = items.filter((item) => !envs.some((env) => env && env.key === item.key && (Array.isArray(env.target) ? env.target.includes('production') : env.target === 'production')));
  if (missing.length) throw new KurError(msg('env.missing', missing.map((item) => item.key).join(', ')), msg('env.missingHint'));
  ctx.created.env = true;
  ctx.io.say(t(ctx.lang, 'env.written', items.length));
}

/** 7b: Production yayını (gitSource) ve hazır olana dek bekleme. */
export async function deployAndWait(ctx, vercel, { project, repoId, branch, timeoutMs = DEPLOY_WAIT_MS }) {
  const api = vercelApi(ctx.fetch, vercel.session);
  const link = project.link || {};
  const numericRepoId = Number(link.repoId !== undefined && link.repoId !== null ? link.repoId : repoId);
  const gitSource = Number.isSafeInteger(numericRepoId) && numericRepoId > 0
    ? { type: 'github', repoId: numericRepoId, ref: branch }
    : { type: 'github', org: link.org, repo: link.repo, ref: branch };
  const created = await api('/v13/deployments', {
    method: 'POST',
    query: { skipAutoDetectionConfirmation: '1' },
    body: { name: project.name, project: project.id, target: 'production', gitSource, projectSettings: { framework: 'nextjs' } },
  });
  let deployment = expect(created, [200, 201], 'Vercel', msg('what.startDeploy'));
  if (!deployment || !deployment.id) throw new KurError(msg('deploy.startFailed'), msg('deploy.startFailedHint'));
  ctx.io.say(t(ctx.lang, 'deploy.started'));
  const started = ctx.nowMs();
  let lastState = null;
  for (;;) {
    const state = deployment.readyState;
    if (state && state !== lastState) {
      ctx.io.say(t(ctx.lang, 'deploy.stateLine', deployState(state, ctx.lang)));
      lastState = state;
    }
    if (state === 'READY') return deployment;
    if (state === 'ERROR' || state === 'CANCELED' || state === 'BLOCKED') {
      const where = safeLink(deployment.inspectorUrl, ['vercel.com']);
      throw new KurError(msg('deploy.failed', msg(`deploy.${state}`)), msg('deploy.failedHint', where));
    }
    if (ctx.nowMs() - started > timeoutMs) {
      throw new KurError(msg('deploy.slow'), msg('deploy.slowHint'));
    }
    await ctx.sleep(5000);
    deployment = expect(await api(`/v13/deployments/${encodeURIComponent(deployment.id)}`), [200], 'Vercel', msg('what.readDeploy'));
  }
}

/** Hazır yayının Production adresi. Beklenen `<ad>.vercel.app` değilse gerçek adres döner. */
export async function productionDomain(ctx, vercel, { project, deployment, expectedHost }) {
  const api = vercelApi(ctx.fetch, vercel.session);
  let current = deployment;
  for (let i = 0; i < 6 && current.aliasAssigned !== true; i += 1) {
    await ctx.sleep(3000);
    current = expect(await api(`/v13/deployments/${encodeURIComponent(deployment.id)}`), [200], 'Vercel', msg('what.readDeploy'));
  }
  if (Array.isArray(current.alias) && current.alias.includes(expectedHost)) return expectedHost;
  const domains = await api(`/v9/projects/${encodeURIComponent(project.id)}/domains`, { query: { production: 'true' } });
  const names = domains.status === 200 && domains.data && Array.isArray(domains.data.domains)
    ? domains.data.domains.map((domain) => domain && domain.name).filter((name) => typeof name === 'string')
    : [];
  if (names.includes(expectedHost)) return expectedHost;
  return names.find((name) => name.endsWith('.vercel.app')) || names[0] || expectedHost;
}

// ---------------------------------------------------------------------------------------------
// Ana akış
// ---------------------------------------------------------------------------------------------

export async function kur(ctx) {
  const { io } = ctx;
  const step = (n, text) => io.say(`\n[${n}/${STEP_COUNT}] ${text}`);

  // Kaynak, hesaplarda hiçbir şey oluşturulmadan (Vercel girişinden bile önce) indirilip denetlenir.
  step(1, t(ctx.lang, 'step.prepare'));
  checkNodeVersion(ctx.nodeVersion);
  const sourceName = parseSource(ctx.env.AXON_KUR_SOURCE || DEFAULT_SOURCE);
  const source = { name: sourceName, ...(await downloadSource(ctx, sourceName)) };
  io.say(t(ctx.lang, 'step.sourceReady', ctx.nodeVersion, sourceName, source.version || source.ref, source.files.length, formatMegabytes(source.totalBytes, ctx.lang)));

  step(2, t(ctx.lang, 'step.vercelLogin'));
  const vercel = await vercelLogin(ctx);

  step(3, t(ctx.lang, 'step.name'));
  const name = await chooseProjectName(ctx, vercel);
  const callbackHost = `${name}.vercel.app`;
  const productionUrl = `https://${callbackHost}`;

  step(4, t(ctx.lang, 'step.githubApp'));
  const github = await setupGithub(ctx, { productionUrl });

  step(5, t(ctx.lang, 'step.repos'));
  const repos = await createRepos(ctx, { login: github.login, token: github.userToken, source });

  step(6, t(ctx.lang, 'step.vercelProject'));
  await ensureFreshVercel(ctx, vercel);
  const project = await ensureVercelProject(ctx, vercel, { name, repoFullName: repos.codeFullName });

  step(7, t(ctx.lang, 'step.deploy'));
  await ensureFreshVercel(ctx, vercel);
  const items = buildEnvItems({
    owner: github.login,
    codeRepo: repos.codeName,
    dataRepo: repos.dataName,
    branch: repos.branch,
    appId: github.app.id,
    privateKey: github.app.pem,
    installationId: github.installation.id,
    clientId: github.app.clientId,
    clientSecret: github.app.clientSecret,
    authSecret: generateAuthSecret(ctx.randomBytes, ctx.lang),
    lang: ctx.lang,
  });
  await writeEnv(ctx, vercel, project.id, items);
  const deployment = await deployAndWait(ctx, vercel, { project, repoId: repos.codeRepoId, branch: repos.branch });
  const host = await productionDomain(ctx, vercel, { project, deployment, expectedHost: `${project.name || name}.vercel.app` });
  const siteUrl = `https://${host}`;
  if (host !== callbackHost) {
    io.say(t(ctx.lang, 'callback.mismatch', siteUrl));
    io.say(t(ctx.lang, 'callback.addTo', ctx.created.githubApp.settingsUrl));
    io.say(t(ctx.lang, 'callback.addAddress', siteUrl));
  }

  step(8, t(ctx.lang, 'step.done'));
  io.say(t(ctx.lang, 'done.address', siteUrl));
  const opened = await showUrl(ctx, `${siteUrl}/login`);
  io.say(t(ctx.lang, opened ? 'done.opened' : 'done.pressButton'));
  io.say(t(ctx.lang, 'done.appSettings', ctx.created.githubApp.settingsUrl));
  io.say(t(ctx.lang, 'done.vercelProject', ctx.created.vercelProject));
  if (github.installation.repositorySelection !== 'all') {
    io.say(t(ctx.lang, 'done.allRepos', github.installation.id));
  }
  return { siteUrl };
}

export function reportFailure(ctx, error) {
  const { io } = ctx;
  io.say('');
  for (const line of failureLines(error, ctx.lang)) io.say(line);
  const lines = describeCreated(ctx.created, ctx.lang);
  if (lines.length === 0) {
    io.say(t(ctx.lang, 'report.nothing'));
    return;
  }
  io.say(t(ctx.lang, 'report.created'));
  for (const line of lines) io.say(`  - ${line}`);
  io.say(t(ctx.lang, 'report.rerun'));
}

/** Çıkış kodu: 0 başarı, 130 Ctrl+C, 1 diğer her şey (Ctrl+D / giriş kapanması dahil). */
export async function main(ctx, { handleSigint = false } = {}) {
  const onSigint = () => {
    reportFailure(ctx, new KurCancelled('sigint'));
    process.exit(130);
  };
  if (handleSigint) process.once('SIGINT', onSigint);
  ctx.io.say(t(ctx.lang, 'main.intro'));
  try {
    await kur(ctx);
    return 0;
  } catch (error) {
    reportFailure(ctx, error);
    return error instanceof KurCancelled && error.reason === 'sigint' ? 130 : 1;
  } finally {
    if (handleSigint) process.off('SIGINT', onSigint);
    if (typeof ctx.io.close === 'function') ctx.io.close();
  }
}

// ---------------------------------------------------------------------------------------------
// Gerçek terminal, tarayıcı ve komut çalıştırıcı
// ---------------------------------------------------------------------------------------------

/**
 * Terminal girişi: TEK readline arayüzü, okunan satırlar kuyruğa girer (yapıştırılan çok satırlı girdi
 * kaybolmaz, sıradaki sorulara gider). readline burada dinamik içe aktarılır (eski Node'da sürüm mesajından
 * önce çökmesin). Arayüz `terminal: false`: Ctrl+C gerçek SIGINT olarak gelir. Sorular arasında giriş
 * duraklatılır (Vercel aracı ve gizli giriş karışmasın). Giriş kapanırsa (Ctrl+D, boru bitti) her soru
 * `KurCancelled('eof')` ile biter.
 */
export function terminalIo({ input = process.stdin, output = process.stdout, lang } = {}) {
  const say = (line = '') => output.write(`${line}\n`);
  const queue = [];
  let waiter = null;
  let rl = null;
  let opening = null;
  let closingOurselves = false;
  let ended = Boolean(input.readableEnded);
  input.once('end', () => {
    ended = true;
  });

  const settle = (error, line) => {
    const current = waiter;
    waiter = null;
    if (!current) return;
    if (error) current.reject(error);
    else current.resolve(line);
  };

  function open() {
    if (rl) return Promise.resolve(rl);
    if (!opening) {
      opening = import('node:readline').then(({ createInterface }) => {
        const iface = createInterface({ input, terminal: false, crlfDelay: Infinity });
        iface.on('line', (line) => {
          if (waiter) settle(null, line);
          else queue.push(line);
        });
        iface.on('close', () => {
          rl = null;
          opening = null;
          if (closingOurselves) {
            closingOurselves = false;
            return;
          }
          ended = true;
          settle(new KurCancelled('eof'));
        });
        rl = iface;
        return iface;
      });
    }
    return opening;
  }

  function closeInterface() {
    if (!rl) return;
    closingOurselves = true;
    rl.close();
  }

  async function prompt(text) {
    output.write(text);
    if (queue.length) return queue.shift();
    if (ended) throw new KurCancelled('eof');
    const iface = await open();
    if (queue.length) return queue.shift();
    if (ended) throw new KurCancelled('eof');
    try {
      return await new Promise((resolve, reject) => {
        waiter = { resolve, reject };
        iface.resume();
      });
    } finally {
      if (rl) rl.pause();
    }
  }
  async function ask(question, fallback = '') {
    const answer = await prompt(fallback ? `${question} [${fallback}]: ` : `${question}: `);
    return answer.trim() || fallback;
  }
  async function confirm(question, defaultYes = true) {
    for (;;) {
      const answer = (await ask(`${question} (${t(lang, defaultYes ? 'io.choiceYes' : 'io.choiceNo')})`)).toLowerCase();
      if (!answer) return defaultYes;
      if (['e', 'evet', 'y', 'yes'].includes(answer)) return true;
      if (['h', 'hayır', 'hayir', 'n', 'no'].includes(answer)) return false;
      say(t(lang, 'io.yesNoHint'));
    }
  }
  async function pause(message) {
    await prompt(`${message} `);
  }
  async function askSecret(question) {
    if (!input.isTTY || typeof input.setRawMode !== 'function') return prompt(question);
    if (queue.length) {
      output.write(`${question}\n`);
      return queue.shift();
    }
    if (ended) throw new KurCancelled('eof');
    // Gizli girişi readline görmesin (satır olarak kuyruğa düşmesin): arayüz kapanır, sonra yeniden açılır.
    closeInterface();
    output.write(question);
    return new Promise((resolve, reject) => {
      let value = '';
      const cleanup = () => {
        input.off('data', onData);
        input.off('end', onEnd);
        input.setRawMode(false);
        input.pause();
      };
      const finish = (error, result) => {
        cleanup();
        output.write('\n');
        if (error) reject(error);
        else resolve(result);
      };
      const onEnd = () => finish(new KurCancelled('eof'));
      const onData = (chunk) => {
        for (const char of String(chunk).replace(/\x1b\[20[01]~/g, '')) {
          if (char === '\r' || char === '\n') return finish(null, value);
          if (char === '\u0003') return finish(new KurCancelled('sigint'));
          if (char === '\u0004') return finish(new KurCancelled('eof'));
          if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
          else if (char >= ' ' && char !== '\u001b') value += char;
        }
        return undefined;
      };
      input.setRawMode(true);
      input.setEncoding('utf8');
      input.resume();
      input.on('data', onData);
      input.once('end', onEnd);
    });
  }
  return { say, ask, confirm, pause, askSecret, close: closeInterface };
}

function runCommand(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.once('error', () => resolve(-1));
    child.once('exit', (code) => resolve(code === null ? 1 : code));
  });
}

/** Sistemin yerel ayarı (`Intl`); okunamazsa boş. */
function systemLocale() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return '';
  }
}

export function realContext() {
  const lang = detectLang(process.env, systemLocale());
  return {
    lang,
    fetch: globalThis.fetch,
    io: terminalIo({ lang }),
    open: (url) => openWith(spawn, process.platform, url),
    run: runCommand,
    readText: (file) => {
      try {
        return fs.readFileSync(file, 'utf8');
      } catch {
        return null;
      }
    },
    platform: process.platform,
    env: process.env,
    home: os.homedir(),
    nodeVersion: process.versions.node,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    randomInt: crypto.randomInt,
    randomBytes: crypto.randomBytes,
    nowSeconds: () => Math.floor(Date.now() / 1000),
    nowMs: () => Date.now(),
    created: {},
  };
}

if (process.env.AXON_KUR_TEST !== '1') {
  // Sürüm denetimi her şeyden önce: eski Node'da başka hiçbir şey çalışmadan anlaşılır mesaj.
  const problem = startupProblem(process.versions.node, detectLang(process.env, systemLocale()));
  if (problem) {
    process.stdout.write(`${problem}\n`);
    process.exitCode = 1;
  } else {
    main(realContext(), { handleSigint: true }).then((code) => {
      process.exitCode = code;
    });
  }
}
