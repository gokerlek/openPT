# openPT

Antrenörlerin danışanlarını, antrenman programlarını ve gelişimlerini tek yerden takip etmesi için mobil odaklı bir web uygulaması.

Antrenör programı hazırlar ve danışanını davet eder. Danışan telefonundan antrenmanını açar, setlerini kaydeder ve ilerlemesini görür. Ayrı bir veritabanı servisi kurulmaz: uygulama verileri antrenörün GitHub hesabındaki **özel repolarda** JSON olarak saklanır.

> **Bir kurulum = bir antrenör.** Bu sürüm, herkesin aynı sitede GitHub ile kaydolup ayrı antrenör hesabı açtığı bir SaaS değildir. Yönetici girişi yalnız `GITHUB_OWNER` kullanıcısına açıktır. Başka bir antrenör kendi GitHub hesabı, Vercel projesi ve veri repolarıyla ayrı kurulum yapar. Danışanların GitHub hesabı gerekmez.

## In English

openPT is a mobile-first app for personal trainers to manage clients, workout programs and progress. Each trainer runs their own copy. The app deploys to the trainer's own Vercel project and keeps its data as JSON in private repositories on the trainer's GitHub account. There is no shared service and no database. Clients don't need a GitHub account; they use the app on their phone and can add it to the home screen.

- **Install:**
  - Run the one-line command in [Tek komut](#tek-komut) in a terminal (macOS or Linux, Node.js 20 or newer). It talks in your computer's language, Turkish or English. To force one, put `KUR_LANG=en ` (or `KUR_LANG=tr `) in front of it.
  - Or use the **Deploy with Vercel** button below and follow the `/install` wizard.
- **Language:**
  - The app is in Turkish and English. On first visit it follows the browser language: Turkish browsers get Turkish, everything else gets English.
  - Everyone can switch afterwards. Clients use **Settings → Language**; trainers use **Settings → App** or the user menu.
  - Content the trainer writes stays exactly as written: program, day and template names, notes, client names, the brand name.
  - Logged text stays in the language it was written in: the program change log, suggestions, AI rationale.
- **Time zone:** taken from the browser during first setup, and you can change it in **Settings → Appearance**. Copies set up before this feature use `Europe/Istanbul` until you change it there.
- **Health and screening wording:** the English text for limitations, movement tests, conditions and safety messages is a translation that has **not yet been reviewed by a clinician**. Have it checked before relying on it with clients. These features don't provide diagnosis or treatment.
- **Docs:** the rest of this README and the documents in `docs/` are in Turkish for now.

## Kurulum

İki yol var; ikisi de aynı sonucu verir: kendi Vercel projen, kendi GitHub hesabında özel repolar ve o hesapta sana ait küçük bir **GitHub uygulaması** (GitHub ile giriş ve veri erişimi bunun üzerinden). Anahtar kopyalaman, OAuth App açman gerekmez. **Ortak kurulum servisi, Vercel entegrasyonu, geliştiricinin anahtarı veya DB gerekmez.**

### Tek komut

macOS ya da Linux'ta çalışır. Önce bir kez [Node.js](https://nodejs.org/) kur (sitedeki "LTS" sürümünü indir ve aç; sürüm 20 ya
da üstü olmalı). Sonra **Terminal** uygulamasını aç (Mac'te: Spotlight'ta "Terminal" yaz), aşağıdaki satırı yapıştır ve Enter'a bas.
Windows kullanıyorsan aşağıdaki **Tarayıcıdan** yolunu kullan.

```sh
node --input-type=module -e "$(curl -fsSL https://raw.githubusercontent.com/gokerlek/openPT/main/kur/kur.mjs)"
```

Komut her adımda ne yaptığını bilgisayarın diline göre Türkçe ya da İngilizce söyler (Türkçe dışındaki her dil İngilizce; zorlamak için başına `KUR_LANG=tr ` ya da `KUR_LANG=en ` ekle): Vercel'e giriş (tarayıcıda onay), uygulama adı, GitHub'da **Create GitHub App** ve **Install** (tarayıcıda iki düğme), kod ve veri repolarının açılması, Vercel ayarları ve ilk yayın. Sonunda uygulamanın adresini yazar ve açar; **GitHub ile giriş yap**.

### Tarayıcıdan (Deploy düğmesi)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fgokerlek%2FopenPT)

Env olmadan ilk yayın `/install` sihirbazını açar; sihirbaz bu kopyanın içinde çalışır. **GitHub'a bağla** adımı GitHub'da sana ait uygulamayı oluşturur: GitHub'da **Create GitHub App**, ardından **All repositories** seçiliyken **Install** düğmesine basarsın, GitHub seni sihirbaza döndürür ve kurulum doğrulanır. Gemini anahtarı isteğe bağlıdır. Son adımda kendi geçici Vercel tokenınla ayarları otomatik Production ortamına yazıp yeni yayın başlat; bu token saklanmaz. İstersen .env çıktısını elle aktarabilirsin. [Adım adım bağımsız kurulum](docs/INSTALLER.md).

Eski kurulumlar (kişisel anahtar `GITHUB_TOKEN` ve OAuth App) olduğu gibi çalışmaya devam eder; geçmek zorunda değilsin.

### Kurulumdan sonra

Gemini anahtarını kurulumda atladıysan sonradan **Ayarlar → Yapay zekâ ve Gemini anahtarı** ekranından ekleyebilirsin. Panelde girilen anahtar kendi özel veri reposunda şifrelenerek saklanır; Vercel tokenı veya yeniden deployment gerekmez.

Geliştiricinin reposuna yalnız isteğe bağlı sürüm kontrolü/güncellemede bağlanılır; mevcut uygulama kullanımı bu bağlantıya bağlı değildir. PT panelindeki Ayarlar → Sürüm kararlı sürümleri kontrol eder. Güncelleme kod değişikliklerinin üzerine yazılacağını açıkça onaylatır, önce yedek alır ve yalnız ayrı kod reposunu günceller. [Otomatik ve manuel güncelleme](docs/UPDATES.md).

## Neler yapar?

- **Danışan yönetimi:** danışan oluşturma, davet/erişim yönetimi, profil ve takip ekranları.
- **Program hazırlama:** egzersiz kütüphanesi, şablonlar, fazlar, set/tekrar/yük ve dinlenme ayarları; danışanın kendi programları.
- **Antrenman takibi:** günlük plan, set kaydı, dinlenme sayacı, seans özeti, geçmiş ve aylık antrenman takvimi.
- **Gelişim:** ölçümler, antrenman istatistikleri, set sırasında kişisel rekor ve önceki antrenmana göre hacim/set/tekrar artışı bildirimleri. Önceki set bilgisi gün/programdan bağımsız, aynı egzersiz ve cihazın son kaydından gelir.
- **Sağlık ve hareket takibi:** onaya bağlı ağrı bildirimleri, kısıtlar, hareket taramaları ve program düzenlerken ilgili uyarılar. Bu takip özellikleri tanı veya tedavi hizmeti sunmaz.
- **Görünüm:** isim/logo, altı hazır tema, açık/koyu mod, özel renkler ve canlı önizleme.
- **Dil:** Türkçe ve İngilizce. İlk açılışta tarayıcının dili kullanılır, sonra herkes kendi ayarından seçer. PT'nin yazdığı içerik (program ve gün adları, notlar, danışan adları) yazıldığı dilde kalır. Saat dilimi ilk kurulumda tarayıcıdan alınır, **Ayarlar → Görünüm**'den değişir.
- **Telefon kullanımı:** ana ekrana ekleme ve bağımsız uygulama görünümü. Tam çevrimdışı çalışma desteklenmez; veri işlemleri internet gerektirir.

## Nasıl çalışır?

```text
Telefon / tarayıcı
        │ HTTPS
        ▼
Next.js uygulaması (Vercel)
        │ Sunucu tarafında GitHub API
        ├── openpt-data         → özel: ayarlar, kütüphane, danışan kimlik listesi
        ├── client-<kimlik-1>   → özel: danışan profili ve takip kayıtları
        └── client-<kimlik-2>   → özel: diğer danışanın verileri

openpt                         → uygulamanın kaynak kodu (bu repo)
```

GitHub erişimi yalnız sunucuda kullanılır; tarayıcı GitHub veri repolarına doğrudan bağlanmaz. İki mod var ve seçim env'den kendiliğinden yapılır:

- **GitHub uygulaması** (yeni kurulumlar; `GITHUB_APP_ID` + `GITHUB_APP_PRIVATE_KEY`): okuma ve yazma uygulamanın kurulum anahtarıyla yapılır (bir saatlik, kendiliğinden yenilenir). Danışan reposu açma/silme PT'nin GitHub girişinden gelen kullanıcı anahtarıyla yapılır; bu anahtar şifreli, httpOnly bir çerezde durur ve çıkışta silinir. E-posta koduyla girmiş PT repo açamaz/silemez: "Bu işlem için GitHub ile yeniden giriş yap." Uygulama **All repositories** erişimiyle kurulmalı; seçili repolarla kurulduysa Ayarlar → Sürüm açık uyarı ve GitHub ayar bağlantısı gösterir.
- **Kişisel anahtar** (eski kurulumlar; `GITHUB_TOKEN`): davranış aynı; GitHub OAuth girişte yalnız kimliği doğrular, giriş anahtarı saklanmaz.

Kurulum sihirbazındaki sırlar açık sekmede hazırlanır; otomatik aktarımda yalnız kendi uygulamanın sunucusundan kendi Vercel projenine gönderilir. Manuel .env çıktısı sunucuya gönderilmez. Danışanlar uygulamanın davet akışıyla erişir.

**`APP_REPO` kod reposundan farklı ve private olmalıdır.** Örneğin kod `openpt`, veri `openpt-data`. Veri reposunu önceden oluşturman gerekmez; ilk kurulum kaydında uygulama oluşturur. Var olan repo kullanılıyorsa private olmalı ve fork olmamalıdır. Danışan repoları da uygulama tarafından oluşturulur.

## Elle kurulum ve yerel geliştirme

Yukarıdaki iki yol bu bölümü gerektirmez. Burası env'i elle hazırlamak, yerelde çalıştırmak ya da kişisel anahtarla (PAT) kurulmuş eski bir kopyayı bakımda tutmak içindir. GitHub uygulamasıyla elle kurmak istersen uygulamayı sihirbazla (yerelde `/install`) ya da GitHub → Settings → Developer settings → GitHub Apps ekranından oluştur ve 3. adımdaki `GITHUB_APP_*` değerlerini kullan; o zaman 1. ve 2. adımlar gerekmez.

## Gerekenler

- Kendi kişisel GitHub hesabın.
- Vercel hesabı ve GitHub bağlantısı (yayına almak için).
- Yerel geliştirme için **Node.js 22+** ve npm. Tekrarlanabilir kurulum için `npm ci` kullan.
- GitHub erişimi (GitHub uygulaması ya da kişisel anahtar), GitHub ile giriş bilgileri ve oturum sırrı.
- İsteğe bağlı yedek e-posta girişi için Resend hesabı.

## 1. GitHub veri erişim token'ını oluştur (kişisel anahtar yolu)

[GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)](https://github.com/settings/tokens) bölümünden bu uygulamaya özel, süreli bir **classic personal access token** oluştur.

Gerekli kapsamlar:

| Kapsam | Neden gerekli? |
| --- | --- |
| `repo` | Özel veri repolarını oluşturmak, okumak ve güncellemek. |
| `delete_repo` | Uygulamadaki danışan silme akışında danışanın veri reposunu silmek. |
| `workflow` | Vercel kurulumunda eksik güncelleme YAML dosyasını kendi kod reposuna eklemek. Mevcut workflow değiştirilmez. |

Token'ı `GITHUB_TOKEN` olarak kullan. Token'ın sahibi ile `GITHUB_OWNER` aynı kişisel hesap olmalıdır; uygulama repoları bu hesap altında oluşturur. Classic token bu kapsamlarla hesabındaki diğer repolara da erişebilir; yalnız bu uygulama için üret ve paylaşma. Hesap ayrımı istiyorsan uygulamayı ayrı bir GitHub hesabıyla kur.

GitHub girişinde oluşan OAuth token'ı bu token'ın yerine geçmez. Token süresi dolunca yeni token'ı ortam değişkenine yazıp yeniden deploy et.

Kaynak: [GitHub repository API ve token kapsamları](https://docs.github.com/en/rest/repos/repos).

## 2. GitHub ile giriş için OAuth App oluştur (kişisel anahtar yolu)

[GitHub → Settings → Developer settings → OAuth Apps → New OAuth App](https://github.com/settings/applications/new) sayfasını aç.

Yerelde denemek için:

| Alan | Değer |
| --- | --- |
| Application name | `openPT Local` |
| Homepage URL | `http://localhost:3000` |
| Authorization callback URL | `http://localhost:3000/api/auth/github/callback` |

Oluşan **Client ID** değerini `GITHUB_CLIENT_ID` olarak kaydet. **Generate a new client secret** ile üretilen değeri `GITHUB_CLIENT_SECRET` olarak kaydet.

Canlı site için ayrı bir OAuth App kullan. Homepage URL canlı siten; callback ise `https://SENIN-ALAN-ADIN/api/auth/github/callback` olmalı. Alan adı değişirse OAuth ayarını da güncelle. Rastgele Vercel Preview adresleri için canlı OAuth ayarının çalışacağını varsayma.

## 3. Ortam değişkenlerini hazırla

Örnek dosya: [`.env.example`](.env.example).

| Değişken | Nereden alınır / ne yazılır? | Gerekli mi? |
| --- | --- | --- |
| `GITHUB_OWNER` | GitHub kullanıcı adın; ör. `gokerlek`. URL veya e-posta yazma. | Evet |
| `APP_REPO` | Ayrı özel veri reposunun adı; ör. `openpt-data`. | Evet |
| `GITHUB_APP_ID` | GitHub uygulamasının **App ID** değeri. | Uygulama modunda |
| `GITHUB_APP_PRIVATE_KEY` | Uygulamanın `.pem` özel anahtarı. Satır sonları `\n` kaçışlı tek satır da olur. | Uygulama modunda |
| `GITHUB_APP_INSTALLATION_ID` | Uygulamanın hesabındaki kurulum kimliği. Boşsa `GITHUB_OWNER` hesabındaki kurulum bulunur. | İsteğe bağlı |
| `GITHUB_TOKEN` | 1. adımda oluşturduğun kişisel token. `GITHUB_APP_*` tanımlıysa kullanılmaz. | Kişisel anahtar modunda |
| `GITHUB_CLIENT_ID` | GitHub uygulamasının ya da 2. adımdaki OAuth App'in Client ID değeri. | GitHub girişi için |
| `GITHUB_CLIENT_SECRET` | Aynı uygulamanın client secret değeri. | GitHub girişi için |
| `AXON_CODE_REPO` | Kendi kod repon, `kullanıcı/repo` biçiminde (güncellemeler için). | Güncellemeler için |
| `AUTH_SECRET` | Aşağıdaki komutla ürettiğin rastgele sır. En az 32 bayt. | Evet |
| `PT_EMAIL` | Yedek e-posta girişini kullanacak antrenör adresi. | E-posta girişi için |
| `RESEND_API_KEY` | Resend hesabından alınan API anahtarı. | İsteğe bağlı |
| `RESEND_FROM` | Resend'de doğrulanmış alan adından gönderici; ör. `openPT <giris@alanadin.com>`. | Özel e-posta göndericisi için |

```bash
openssl rand -base64 32
```

Çıktıyı `AUTH_SECRET` yap. Bu sırrı değiştirirsen mevcut oturumlar geçersiz olur. Değişkenlere `NEXT_PUBLIC_` öneki ekleme; bunlar sunucu ayarlarıdır. `.env.local` Git'e gönderilmez.

### İsteğe bağlı e-posta girişi

[Resend](https://resend.com) hesabında API anahtarı oluştur, `PT_EMAIL` ve `RESEND_API_KEY` değerlerini doldur. Kendi göndericin için alan adını doğrulayıp `RESEND_FROM` ekle. Kodun varsayılan göndericisi `onboarding@resend.dev` test göndericisidir; üretim göndericisi olarak kendi doğrulanmış alan adını kullan. Resend kullanılmayacaksa bu alanları boş bırak; e-posta giriş yolu kapanır.

## 4. Yerelde çalıştır

```bash
git clone https://github.com/gokerlek/openPT.git
cd openPT
npm ci
cp .env.example .env.local
```

`.env.local` dosyasını yukarıdaki bilgilerle doldur, ardından:

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) adresini aç. GitHub ile giriş yap ve ilk kurulum ekranında ad, tema ve görünümü kaydet. Ekranlarda görünen varsayılan ad **openPT**; burada kendi markanla değiştirebilirsin. Bazı iç adlar projenin önceki adlarıyla durur (`pulsecoach.config.json`, `AXON_*` değişkenleri, `axon-update.yml`, `axon-release.json`); kurulum için bunları değiştirmek gerekmez.

OAuth olmadan yalnız yerelde arayüz geliştirmek için `http://localhost:3000/api/dev/login` geliştirme girişi vardır. Bu uç üretimde 404 döner. Geliştirme girişi veri katmanını taklit etmez: yazma işlemleri tanımladığın GitHub repolarına gider. Yerel testleri ayrı veri reposu/hesabıyla yap.

## 5. Vercel'e yayınla

1. [Vercel New Project](https://vercel.com/new) sayfasından GitHub'daki `openPT` reposunu **Import** et. Başka antrenör kuruyorsa önce kendi hesabına fork almalı.
2. Framework **Next.js**, Root Directory repo kökü (`./`), Node.js **22.x** seç.
3. Install Command `npm ci`; Build Command için burada doğrulanan `npm run build` kullan. Output Directory alanını Next.js varsayılanında bırak. Standart build komutu doğrulanan Webpack derlemesini kullanır.
4. Environment Variables bölümüne 3. adımdaki değerleri **Production** ortamı için ekle. `.env.local` dosyasını yükleme veya repoya koyma.
5. Canlı OAuth App'in Client ID/Secret değerlerini kullan. Henüz alan adın belli değilse ilk deploy sonrası verilen kalıcı proje alan adını OAuth App'in Homepage ve callback alanlarına yaz. İlk deploy'da da geçerli giriş bilgileri tanımlı olmalı.
6. **Deploy** et. Ortam değişkenlerini sonradan değiştirdiysen **Redeploy** yap.
7. Canlı adresi aç, `GITHUB_OWNER` hesabıyla GitHub girişi yap ve kurulum ekranını kaydet. Uygulama özel veri reposunu hazırlar.
8. İlk danışanını oluştur; danışan detayındaki davet bağlantısını/QR kodunu kullanarak telefonundan erişimi dene.

Kaynaklar: [Vercel GitHub bağlantısı](https://vercel.com/docs/git/vercel-for-github), [ortam değişkenleri](https://vercel.com/docs/environment-variables).

**Güncellemeler:** Vercel'e bağlanan üretim dalına push geldiğinde yeni deploy tetiklenir. Uygulama kodunu güncellemek için danışanları veya veri repolarını silmen gerekmez. Aynı `GITHUB_OWNER` ve `APP_REPO` değerleri mevcut verilere bağlanır. Yeni `APP_REPO` adı yeni bir uygulama veri alanı açar; eski verileri otomatik taşımaz.

## Telefona ekleme

- **Android / Chrome:** canlı HTTPS adresini aç → tarayıcı menüsü → *Uygulamayı yükle* veya *Ana ekrana ekle*. Tarayıcının sunduğu yükleme seçeneğini tamamla; simgeden açınca adres çubuğu olmadan bağımsız görünüm kullanılır.
- **iPhone / Safari:** siteyi aç → Paylaş → *Ana Ekrana Ekle*.

Normal bir tarayıcı sekmesinden açıldığında adres çubuğu görünmesi beklenir. Ana ekrana eklemek uygulamayı çevrimdışı hale getirmez.

## Geliştirme ve doğrulama

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm start
```

`npm start`, başarılı üretim derlemesinden sonra çalışır. Next.js / React sürümleri için `package-lock.json` esas alınır.

| Konum | İçerik |
| --- | --- |
| `src/app/dashboard` | Antrenör paneli |
| `src/app/me` | Danışan ekranları ve antrenman akışı |
| `src/app/api` | Kimlik, veri ve işlem uçları |
| `src/lib/github` | GitHub veri erişimi |
| `src/lib/schemas` | Paylaşılan doğrulama şemaları |
| `src/components` | Ortak arayüz bileşenleri |
| `docs/SPEC.md` | Ayrıntılı ürün ve veri modeli |
| `docs/design` | Özellik tasarımları ve doğrulama notları |

## Sık karşılaşılan sorunlar

| Belirti | Kontrol |
| --- | --- |
| GitHub girişinden sonra erişim yok | Giriş yaptığın kullanıcı `GITHUB_OWNER` ile aynı mı? |
| OAuth callback hatası | Protokol, alan adı ve `/api/auth/github/callback` yolu doğru mu? Yerel/canlı Client ID'ler karışmış mı? |
| Veri reposu açık/fork uyarısı | `APP_REPO` kod reposundan farklı, private ve fork olmayan bir repo olmalı. |
| GitHub 401 / 403 / 404 | Token süresi, sahibi, izinleri ve repo adlarını kontrol et; private repoda erişim eksikliği 404 de verebilir. GitHub uygulamasında kurulumun **All repositories** ve izinlerin onaylı olduğunu kontrol et. |
| "Bu işlem için GitHub ile yeniden giriş yap" | GitHub uygulaması kurulumunda danışan reposu açma/silme PT'nin GitHub girişini ister. Çıkış yapıp GitHub ile yeniden gir. |
| Ortam değişkenini değiştirdim, etkilenmedi | Vercel'de doğru ortamı seçip yeniden deploy et. |
| Telefonda localhost açılmıyor | Telefonun localhost'u bilgisayarın değildir; canlı HTTPS adresini kullan. |
| Veri talepleri sınıra takılıyor | GitHub API kota/erişim durumunu kontrol et; sistem GitHub kullanılabilirliğine bağlıdır. |

Danışan silme işlemi danışanın veri reposunu da siler; temizlik veya deploy hazırlığı için bu işlemi kullanma. Veri repolarını public yapma ve danışan verilerini bu kaynak kod reposuna kopyalama.

### Kamera ile açı ölçümü

PT ölçümlerinden veya danışanın Sağlık ekranından açılır. MediaPipe vücut noktalarını ve betimleyici 2D açıları cihazda hesaplar; görüntü gönderilmez veya saklanmaz. Tam vücut ve yeterli görünürlük yoksa değer gösterilmez. Telefon düzlüğünü kullanıcı kontrol eder; bu bir klinik değerlendirme veya 3D eklem ölçümü değildir.

Ek servis/anahtar gerekmez. `npm ci`, `npm run dev` ve `npm run build` modelin sabitlenmiş JS/WASM çalışma dosyalarını otomatik hazırlar. Model repoda bulunur; [asset/yöntem açıklaması](public/pose/README.md). Kamera HTTPS veya localhost gerektirir; desteklenmeyen cihazlarda manuel ölçümle devam edilebilir. Dokuz görev vardır: önden/yandan duruş, squat, diz bükme-açma, kalça menteşesi, omuzu öne/yana kaldırma, dirsek bükme-açma ve otur-kalk. Duruşta 6 saniyelik çoklu örneklerin ortancası; harekette üç tamamlanmış tekrarın açıklık özeti alınır. Analizleri seçerek sıralı oturum başlat: hazırlık ekranındaki 2D hareket örneği ve kısa yönergelerden sonra kamera alanına geç. Başlangıç/hareket karelerini ayrı inceleyebilir veya animasyonu oynatabilirsin. Ölçüm düğmesini başlangıç konumunda başlat. Üç saniyelik geri sayım ve sabit başlangıç örnekleri sonrasında ölçüm başlar. Dinamik ölçüm en fazla 30 saniye sürer; gözlenen hareket/dönüş fazı ve tamamlanan tekrarlar gösterilir. İsteğe bağlı sesli rehber vardır. Hareketi zorlamadan tamamlayamıyorsan manuel yolu kullan.

**Ölçümü kaydet** yalnız sayısal özeti, tarafı, zamanı, yöntem sürümünü ve çekim bilgilerini danışanın özel reposundaki `health.json` dosyasına ekler. PT ve danışan kendi kayıtlarını kamera sayfasında görebilir; PT ölçüm merkezinde de geçmiş bulunur. Hareket taraması modülü ve güncel sağlık onayı gerekir. Aynı kayıt yeniden gönderilirse ikinci kez eklenmez. Aynı görev/taraf/yöntem ve kayıtlı çekim koşullarında önceki değerle fark gösterilir; bu fark otomatik gelişim veya gerileme hükmü değildir. Sandalye ölçümünde karşılaştırma için aynı bilinen yükseklik ve kol desteği gerekir. Görüntü ve landmark dizisi saklanmaz. Santimetre ölçümleri manuel kalır; AI programına otomatik bağlama henüz açık değildir.

Kamera seçimi ve cihazda işleme onayı tarayıcıda hatırlanır; izin tarayıcı tarafından yönetilir ve uygulama bunu zorla kalıcı yapamaz. Kamera oturum bitince, listeye dönünce veya sayfa arka plana geçince kapanır. Görüntü ve ses kaydedilmez. Sonuçlar açıklamalarıyla gösterilir; kaydetmeden devam edilen sonuçlar yalnız açık sayfada kalır, yenilemede kaybolur. Kaydedilen ölçümler tekrar alınabilir; silme geri alınabilir çöp kutusuna taşır. Silinen kayıt karşılaştırılmaz.

Tekrar algılama ve örnek kalitesi eşikleri teknik kontrollerdir, klinik kabul dereceleri değildir. Kamera eğimini sensörle doğrulamayız; yerleşimi kullanıcı kontrol eder. Donanım ve ölçüm doğruluğu için son cihaz testi ayrıca yapılmalıdır.

### AI önerileri ve Gemini bağlantısı

PT, danışan bilgilerinden **AI koç desteğini** açar; ayrı bir AI onay adımı yoktur. Sağlık kayıtları yalnız mevcut sağlık onayının kapsadığı alanlardan kullanılır. AI koç, AI desteği açık danışanda ilgili ekrandaki düğmeyle açılır: PT'de Genel bakış'taki danışan grubunda ve danışanın Genel sekmesinde **AI'ya sor** (o danışanı hemen değerlendirir), Program sekmesinde **AI ile taslak öner**; danışanda İlerleme özetinde **AI değerlendirmesi**, Program'da **AI ile program öner** ve antrenman özetinin son kartında **AI koça sor**. PT genel koçu sağ üstteki hesap menüsünden de açabilir; danışanda sabit koç düğmesi yoktur, söylenecek bir şey olduğunda ekranın altında kısa bir koç mesajı çıkar. Serbest sohbet yerine kayıt değerlendirmesi, hedef/kas seçimi ve düzenlenebilir antrenman taslağı sunar. Değerlendirme aynı hareket ve ekipmanın karşılaştırılabilir bitmiş seanslarındaki değişimi ve sonraki kontrol adımını gösterir; eksik veriden neden veya gelişim sonucu çıkarmaz. Tarihler ortak shadcn takviminden, antrenman günleri shadcn ToggleGroup üzerinden seçilir. PT danışan sayfasında o danışanı, genel görünümde yalnız AI desteği açık danışanların izinli kayıtlarını değerlendirir.

Hedef doğal dille yazılabilir: “Bütün bedenimi çalıştırmak, daha fit olmak istiyorum.” Gemini yalnız bu metni hedef, kas, gün, süre ve ekipman alanlarına dönüştürür. Belirtilmeyen koşullar tahmin edilmez; kullanıcı tamamlar. Kaslar mevcut vücut haritasından da seçilir. Kayıt değerlendirmesi ve elle seçilmiş koşullarla taslak üretimi Gemini bağlantısı gerektirmez. Program sayıları ve hareket seçimi uygulamanın kurallarından gelir; sağlayıcı egzersiz veya cihaz yaratamaz. Antrenman ve ayrıca izin verilen sağlık/ölçüm kayıtları uygulamada işlenir; bunlar, önceki mesajlar, PT notları ve kamera görüntüleri Gemini’ye gönderilmez. [Gemini yapılandırılmış çıktı protokolü](https://ai.google.dev/gemini-api/docs/interactions-breaking-changes-may-2026) kullanılır.

Danışan taslağı mevcut program düzenleyicisinde inceleyip hareket, set ve günleri değiştirerek **kendi programı** olarak kaydeder. PT onayı beklemez; oluşturma ve PT’ye paylaşım aynı Git commit’inde yapılır. Mevcut PT programı değişmez. Kendi programını Bugün’ün programı olarak seçebilir. PT paylaşılmış programı görür, düzenleyebilir; bildirimlerde yeni program ve taslağın gözden geçirilecek noktaları yer alır. PT taslağı uygulamanın aynı antrenman oluşturucusunda açar; gün, hareket, set, süperset ve devreleri düzenleyebilir. **Onayla ve danışana ata** işlemi düzenlenmiş programı mevcut PT programının yerine atar. İzin, kayıt veya katalog değişince eski taslak yeniden hazırlanır. Silinmiş/paylaşımı kapanmış programın AI dikkat bildirimi gösterilmez.

PT anahtarını **Ayarlar → Yapay zekâ** sekmesinden ekler. Danışan isterse **AI koç → Kendi Gemini bağlantım** üzerinden [Google AI Studio](https://aistudio.google.com/api-keys) anahtarı ekler. Kendi anahtarı yalnız kendi hedef metnini yorumlamakta kullanılır; PT kendi bağlantısını kullanır. Ücret anahtarın Google hesabına aittir. Anahtar özel danışan reposunda `AUTH_SECRET` ile şifrelenir, tekrar gösterilmez. Sunucu sahibinden gizli bir kasa değildir; `AUTH_SECRET` değişirse yeniden bağlantı gerekir. Anahtar kaldırılabilir; sağlık verisi kullanımı mevcut sağlık onayından yönetilir. [Sağlayıcının veri kullanım koşulları](https://ai.google.dev/gemini-api/terms) geçerlidir.

Öneriler özel veri reposundaki `ai-assistant.json` dosyasında; genel PT değerlendirmeleri özel uygulama veri reposundaki `ai/pt-assistant.json` dosyasında saklanır. Eski sohbet dosyaları otomatik silinmez; yeni ekran/API bunları kullanmaz. Günlük 30 işlem sınırı ve aynı istek için tekrar kayıt koruması vardır. Bu bir maliyet üst sınırı değildir. Taslaklar üç gün içinde ve güncel kayıtlarla uygulanabilir. Kapsamlı dönemleme, klinik teşhis veya kameradan normal/anormal postür sınıflaması yapılmaz.

Danışan **Ayarlar → AI koç tercihleri** bölümünden yorum, kutlama ve önerileri ayrı ayrı kapatabilir. Bitmiş antrenmana dayalı bu mesajlar sağlayıcı çağrısı yapmaz, yargılayıcı veya telafi egzersizi dili içermez. Doğrulama sahte sağlayıcı ve izole test verileriyle yapılır; gerçek Gemini hesabıyla uçtan uca bağlantı ayrıca denenmelidir.
