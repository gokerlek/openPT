# Mobil uygulama, kolay kurulum ve nabızla dinlenme — tasarım

2026-11-05. Kullanıcı (uygulamanın sahibi) "hepsini yap" dedi. "Benim kararım" diye işaretlenenler Claude'un kararıdır.

## Neden

- Kurulum yazılımcı olmayan PT için çok zor. Bugün PT üç ayrı sitede anahtar oluşturup kopyalıyor (GitHub kişisel
  anahtarı, GitHub OAuth uygulaması, Vercel anahtarı) ve formlara adres yazıyor.
- Danışan web uygulamasını bulamıyor; tarayıcı çubuğu ekranı kaplıyor. "Uygulama olsun" isteğinin asıl nedeni bu.
- PT de uygulama olarak girebilmeli; görünüm ayarları (ad, logo, renk, simge) uygulamada da çalışmalı.
- Antrenmanda nabız: belli bir yüksekliğin üstünde uyarı; dinlenme nabız belli bir yere inene kadar uzasın.
- Sınırlar: satış yok, gider yok, ortak sunucu yok. Her PT kendi kopyasını kendi hesabında çalıştırır (açık kaynak, kendi kurulumu).

## Kararlar (özet)

1. **Uygulama = yüklenebilir web uygulaması (PWA), iki taraf için.** Android'de "Yükle" gerçek bir uygulama kurar
   (Chrome bunu telefona APK olarak kurar; uygulama çekmecesinde PT'nin simgesi ve adıyla durur). iPhone'da
   "Ana Ekrana Ekle" aynı işi görür. Tarayıcı çubuğu yok, simge ana ekranda. Ücretsiz, mağaza hesabı gerekmez, her PT'nin
   kendi markası çalışır (mağaza uygulamasında simge herkes için aynı olurdu). Benim kararım: önce bu; mağaza uygulaması
   sonra (aşağıda "Sonraki adımlar").
2. **Kurulum: GitHub uygulaması (GitHub App) ile, anahtar kopyalamadan.** PT'nin kendi hesabında, tek tıkla oluşan bir
   GitHub uygulaması hem PT girişini hem veri erişimini sağlar. Kişisel anahtar (PAT) ve OAuth uygulaması adımları kalkar.
   İki yol aynı çekirdeği kullanır: **tek komut** (`kur`) ve **tarayıcı sihirbazı** (`/install`). Eski kurulumlar (PAT) çalışmaya devam eder.
3. **Nabız: Bluetooth göğüs bandı / nabız yayınlayan saat, Web Bluetooth ile.** Android Chrome'da ve yüklü uygulamada
   çalışır; iPhone Safari Web Bluetooth desteklemez, orada açıkça "iPhone'da şimdilik yok" yazar. Tıbbi cihaz değildir.

## Paket A — Uygulama gibi kullanım (PWA)

- **Yükleme yardımcısı** (tek ortak bileşen; danışan ve PT aynı bileşeni kullanır):
  - Zaten yüklüyse (`display-mode: standalone` ya da iOS `navigator.standalone`) hiç görünmez.
  - Android/Chrome/Edge/masaüstü Chrome: `beforeinstallprompt` yakalanır → "Uygulamayı yükle" düğmesi → sistem penceresi.
  - iPhone/iPad Safari: adım adım, simgeli anlatım: "Paylaş (kare ve yukarı ok) → Ana Ekrana Ekle → Ekle".
  - iPhone'da Safari dışı tarayıcı ya da uygulama içi tarayıcı (WhatsApp, Instagram vb.): "Bu sayfayı Safari'de aç" + bağlantıyı kopyala.
    Android'de uygulama içi tarayıcı: "Chrome'da aç" + bağlantıyı kopyala.
  - Diğer: "Tarayıcı menüsünden Ana ekrana ekle".
  - "Şimdi değil" → 14 gün gizlenir (yalnız o cihazda, `localStorage`, okuma/yazma try/catch içinde).
  - Yer: danışanın Bugün ekranının üstü; şifre belirleme / ilk girişten hemen sonra bir kez tam ekran adım; PT genel bakışında
    küçük kart ve Ayarlar'da "Uygulama" bölümü (her zaman görünür, yüklüyse "Yüklü" yazar).
- **PT uygulaması ayrı simge**: panel için ikinci manifest (`id: '/dashboard'`, `start_url: '/dashboard'`, ad: uygulama adı + " Panel",
  kısa ad: uygulama adı), panel düzeninin `metadata.manifest`'i bunu gösterir. Danışan manifest'i olduğu gibi kalır
  (`id: '/'`, `start_url: '/me'`; kimliği değişirse eski yüklemeler bozulur). Simgeler marka simgesinden (bugünkü `/api/brand/app-icon`).
  `apple-touch-icon` 180 px marka simgesi olmalı (bugün logo yoksa favicon). Maskable simgede güvenli boşluk kontrol edilir.
- **Service worker** (`public/sw.js`, kapsam `/`): yalnız sayfa gezinmelerinde ağ önce; ağ yoksa statik `/offline` sayfası.
  API ve veri önbelleğe alınmaz (gizlilik ve bayatlık). Kayıt kök düzende küçük bir istemci bileşeniyle.
- **Danışanı bağlama**: davet ekranındaki kare kod zaten var. Şifre belirlemeden sonra danışan yükleme adımını görür. Davet ekranı
  metni PT'ye sırayı söyler: "Telefon kamerasıyla kodu okut → şifreni belirle → uygulamayı ana ekrana ekle".

## Paket B — Kolay kurulum (GitHub uygulaması)

### B1. Çalışma zamanı: "GitHub uygulaması" modu

- Yeni env: `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` (PEM; `\n` kaçışlı da kabul), `GITHUB_APP_INSTALLATION_ID` (isteğe bağlı;
  yoksa sahibin kurulumu bulunur), `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` (GitHub uygulamasının kendi giriş bilgileri),
  `GITHUB_OWNER`, `APP_REPO`, `AUTH_SECRET`, `AXON_CODE_REPO`.
- Mod seçimi `env.ts`'te tek yerde: `GITHUB_APP_ID` + `GITHUB_APP_PRIVATE_KEY` varsa uygulama modu, yoksa `GITHUB_TOKEN` (PAT, bugünkü
  kurulumlar) zorunlu. İkisi de yoksa bugünkü gibi açık hata.
- Okuma/yazma (veri reposu, danışan repoları, kod reposu güncellemeleri): kurulum anahtarı (installation token; Octokit
  `createAppAuth`, kendiliğinden yenilenir). Koruma kuralı (`assertRepoAllowed`) aynen kalır.
- **Repo açma/silme** (`createAppRepo`, `createClientRepo`, `deleteClientRepo`): GitHub kişisel hesapta kurulum anahtarıyla repo
  açtırmaz. Bu işler PT'nin GitHub girişinden gelen kullanıcı anahtarıyla yapılır: girişte anahtar ve yenileme anahtarı
  AES-256-GCM ile şifrelenip httpOnly çerezde tutulur (anahtar `AUTH_SECRET`'tan HKDF ile türetilir); süresi dolmuşsa
  yenilenir. Yoksa / yenilenemezse açık Türkçe hata: "Bu işlem için GitHub ile yeniden giriş yap." (E-posta koduyla girmiş PT
  repo açamaz; aynı mesaj.) Bu işlemlerin hepsi zaten yalnız PT'nin yaptığı işler.
- Danışan repolarının listesi: kurulumun erişebildiği repolar (`GET /installation/repositories`).
- Kurulum "Tüm repolar" (All repositories) erişimiyle yapılmalı; yeni açılan danışan repoları böylece kendiliğinden erişilir.
  Seçili repolarla kurulduysa sihirbaz ve Ayarlar açık uyarı ve GitHub ayar bağlantısı verir.
- GitHub uygulamasının izinleri: Administration yazma, Contents yazma, Actions yazma, Workflows yazma, Metadata okuma.
  Webhook kapalı.
- PAT'e özgü kontroller (`x-oauth-scopes`) uygulama modunda atlanır; yerine kurulumun izinleri ve repo seçimi kontrol edilir.

### B2. Tarayıcı sihirbazı (`/install`)

- "GitHub anahtarı" ve "GitHub OAuth uygulaması" adımları kalkar, yerine tek adım: **"GitHub'a bağla"**.
  1. Sihirbaz manifest'i `https://github.com/settings/apps/new?state=…` adresine form ile gönderir (GitHub App manifest akışı).
     Manifest: ad `"<uygulama adı> <6 harf>"` (en çok 34 karakter, GitHub'da benzersiz olmalı), `url` = Production adresi,
     `redirect_url` = `<adres>/api/install/github-app`, `callback_urls` = [`<adres>/api/auth/github/callback`],
     `setup_url` = `<adres>/install`, `public: false`, webhook kapalı, izinler yukarıdaki gibi.
  2. PT GitHub'da "Create GitHub App"e basar. Dönüşte sunucu `state`'i doğrular, kodu
     `POST /app-manifests/{code}/conversions` ile bilgilere çevirir (kimlik doğrulama gerekmez), bilgileri yalnız bu sekmenin
     `sessionStorage`'ına koyan küçük bir sayfa döner ve PT'yi `https://github.com/apps/<slug>/installations/new`'e yollar.
  3. PT "Install"a basar ("All repositories" seçili). GitHub `setup_url`'e `installation_id` ile döner. Sihirbaz kurulumu doğrular
     (sahip = Vercel'in bağlı GitHub hesabı, repo seçimi "all") ve eksikse güncelleme dosyasını oluşturur.
- Vercel anahtarı adımı kalır (Vercel, uygulamanın kendi env'ini anahtarsız yazdırmıyor). Elle aktarım yolu (env dosyası
  indir/kopyala) yeni anahtarlarla çalışır. Başarıda `sessionStorage` temizlenir.
- Gemini isteğe bağlı adımı kalır.

### B3. Tek komut (`kur`)

- Tek dosya, bağımlılıksız Node betiği: `kur/kur.mjs` (Node 20+, macOS/Linux). Komut (README'de):
  `node --input-type=module -e "$(curl -fsSL https://raw.githubusercontent.com/gokerlek/axon-fit/main/kur/kur.mjs)"`.
  Saf kısımlar dışa aktarılır ve `kur/kur.test.mjs` ile sınanır; `AXON_KUR_TEST=1` iken ana akış çalışmaz.
  `npm test` bu testleri de çalıştırır.
- Akış (her adım ne yaptığını Türkçe tek satırla söyler; hata olursa ne yapılacağını söyler ve kaldığı yeri anlatır):
  1. Node sürümü kontrolü.
  2. Vercel girişi: `npx --yes vercel@<sabit sürüm> login` (tarayıcıda onay), ardından Vercel CLI'nin kayıtlı anahtarı okunur.
     Bulunamazsa Vercel anahtarını yapıştırma seçeneği (yedek yol).
  3. Uygulama adı sorulur (varsayılan `axon-fit-<4 harf>`); `<ad>.vercel.app` boş mu bakılır.
  4. Son kararlı sürümün arşivi indirilir (`releases/latest`, yoksa varsayılan dal; `codeload` tar.gz). Arşivdeki
     `axon-release.json` `capabilities` içinde `github-app` yoksa hiçbir şey oluşturulmadan durulur (eski sürüm bu modu bilmez).
  5. Yerelde (`127.0.0.1`, rastgele port) küçük sunucu; tarayıcı açılır, GitHub App manifest'i gönderilir. `redirect_url`
     yerel; `callback_urls` = [yerel dönüş, Production giriş dönüşü] (kurulumdan sonraki yetkilendirme kodu ilk adrese gelir;
     `request_oauth_on_install: true` iken `setup_url` kullanılmaz). PT "Create" → "Install" basar; betik bilgileri ve
     PT'nin kullanıcı anahtarını alır.
  6. Kod reposu PT hesabında özel açılır ve arşivin içeriği Git Data API ile tek, ebeveynsiz commit olarak yüklenir
     (şablon gerekmez; GitHub uygulamasının kullanıcı anahtarı başka hesaptaki şablona erişemeyebilir). Veri reposu
     (`axon-fit-data`) özel olarak açılır. Vercel projesi `gitRepository` ile bu repoya bağlı açılır; Vercel'in GitHub
     uygulaması repoya erişemiyorsa betik kurulum bağlantısını açar ve bekler.
  7. Env yazılır (B1 listesi + rastgele `AUTH_SECRET`, sırlar "sensitive"), Production yayını başlatılır, hazır olana kadar beklenir.
  8. Adres yazdırılır ve tarayıcıda açılır: "GitHub ile giriş yap".
- Ön koşul yok (Node 20+ dışında); kaynak reponun şablon olması gerekmez. Komut, bu dalı içeren sürüm yayımlanınca çalışır.

### B4. Belgeler

README'de kurulum: "Tek komut" ve "Tarayıcıdan (Deploy düğmesi)". `docs/INSTALLER.md` yeni akışa göre. `.env.example` yeni anahtarlar.

## Paket C — Nabızla dinlenme

- Saf çekirdek (`src/lib/heart-rate.ts` + test):
  - BLE Heart Rate Measurement (0x2A37) çözümleme (8/16 bit bayrağı).
  - Sınırların çözümü, sırayla: PT'nin danışana girdiği sınırlar → yaş varsa yaştan (HRmax = 208 − 0,7 × yaş; toparlanma
    = %65, uyarı = %90) → genel değerler (toparlanma 120, uyarı 170). Hangisinin kullanıldığı ekranda yazar.
  - Dinlenme kararı: temel süre bitti ve nabız toparlanma sınırının üstündeyse dinlenme uzar; nabız 3 sn boyunca sınırın
    altında kalınca biter; en çok +120 sn uzar, sonra "Nabız hâlâ yüksek" notuyla biter. Nabız yoksa / bağlantı koptuysa bugünkü sayaç.
  - Uyarı: nabız 5 sn boyunca uyarı sınırının üstündeyse bir kez uyar; sınırın 5 altına inene kadar yeniden uyarmaz.
- Bağlantı: Web Bluetooth (`heart_rate` servisi). Durumlar: desteklenmiyor · bağlı değil · bağlanıyor · bağlı · koptu
  (kendiliğinden yeniden dener). Yerel geliştirmede sınama için yapay nabız kaynağı (yalnız `NODE_ENV !== 'production'`).
- Arayüz: antrenman ekranında nabız rozeti (kalp + bpm, bölge rengi); dokununca bağlantı paneli. Dinlenme panelinde uzarken
  "Nabzın 121'in altına inince devam" ve canlı bpm. Uyarıda belirgin şerit + titreşim + ses: "Nabzın çok yüksek (175). Tempoyu
  düşür ve dinlen." "Tıbbi cihaz değildir" notu bağlantı panelinde.
- PT ayarı: danışan düzenleme ekranında "Nabız sınırları" (toparlanma, uyarı; boşsa otomatik). Danışan kaydına isteğe bağlı
  alan; eski kayıtlar etkilenmez.
- Bu pakette nabız kayda yazılmaz (seans ortalaması/en yüksek sonra).

## Sonraki adımlar (bu dalda değil)

- Mağaza uygulaması: Android (Play Store ya da APK) için Chrome tabanlı ince kabuk (Trusted Web Activity), her PT sunucusu
  `/.well-known/assetlinks.json` verir. Derlemek için Java + Android SDK ya da GitHub Actions gerekir.
- iPhone yerel uygulaması: Apple Sağlık, Apple Watch'tan canlı nabız, iPhone'da Bluetooth bandı. Apple geliştirici hesabı
  (yılda 99 $) ve Xcode gerekir.
- Bildirimler (Web Push; VAPID anahtarları kurulumda üretilir, ortak servis gerekmez).
- Nabzın seans kaydına yazılması ve PT'nin görmesi.

## Kurallar

- Türkçe arayüz metni; PT tarafında PT'den üçüncü kişi olarak söz edilir.
- Yeni bağımlılık eklemeden önce düşün; `uqr` (kare kod) zaten var.
- Gerçek danışan verisiyle sınama yok; yerel sınama yalnız test danışanıyla.
- Hiçbir sır günlüğe, URL'ye, istemci paketine ya da kalıcı tarayıcı depolamasına yazılmaz (`sessionStorage` yalnız
  kurulum sırasında, başarıda silinir).
