# Bağımsız kurulum

Her PT uygulamayı kendi GitHub hesabına ve kendi Vercel projesine kurar. Geliştiriciye ait kurulum servisi, ortak OAuth uygulaması, Vercel entegrasyonu veya veritabanı gerekmez. GitHub erişimi PT'nin kendi hesabında oluşan, yalnız ona ait (public olmayan) bir **GitHub uygulamasıyla** sağlanır: hem PT'nin GitHub ile girişi hem veri repolarına erişim bunun üzerinden. Kişisel anahtar (PAT) kopyalamak ve OAuth App açmak gerekmez. Geliştiricinin reposuna yalnız PT istediğinde kararlı sürüm kontrolü ve güncelleme için bağlanılır.

İki yol aynı sonucu verir:

- **Tek komut** (README'deki `kur` komutu, macOS/Linux, Node.js 20+): Vercel girişi, GitHub uygulaması, kod ve veri repoları, env ve ilk yayın tek akışta. Ayrıntısı betiğin kendi çıktısında.
- **Tarayıcı sihirbazı** (`/install`, aşağıda): Deploy düğmesiyle açılan kopyanın içinde çalışır.

## PT'nin adımları (tarayıcı sihirbazı)

1. README'deki Deploy with Vercel düğmesiyle kendi kod reposunu ve Vercel projesini oluştur. İlk yayın env olmadan açılabilir. Uygulamanın **kalıcı Production adresini** aç; Preview adresini kurulum adresi olarak kullanma (GitHub uygulamasının adresleri bu adrese bağlanır).
2. `/install` ekranı kod reposunu Vercel’in GitHub bağlantısından alır ve yayın dalını `main` yapar. Veri alanının adı otomatik belirlenir (`axon-fit-data`; kod reposuyla çakışırsa `axon-fit-private-data`). Kullanıcı bunları doldurmaz. Uygulama ilk görünüm kaydında özel veri reposunu otomatik oluşturur.
3. **GitHub'a bağla.** Sihirbaz GitHub App manifest'ini GitHub'a form ile gönderir ([manifest akışı](https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest)). Manifest:
   - ad `Axon Fit <6 harf>` (GitHub'da benzersiz olmalı, en çok 34 karakter), `public: false`;
   - `url` Production adresi, `redirect_url` `<adres>/api/install/github-app`, `callback_urls` `[<adres>/api/auth/github/callback]`, `setup_url` `<adres>/install`;
   - webhook kapalı (`hook_attributes.active: false`), olay aboneliği yok;
   - izinler: Administration, Contents, Actions, Workflows **yazma**; Metadata **okuma**.

   GitHub'da **Create GitHub App** düğmesine bas. Sihirbazın sunucusu tek kullanımlık `state`'i (httpOnly çerez) doğrular ve kodu `POST /app-manifests/{code}/conversions` ile uygulamanın bilgilerine çevirir (App ID, Client ID/Secret, özel anahtar). Bilgiler yalnız bu sekmenin `sessionStorage`'ına konur; sunucuda, çerezde, adreste ya da günlükte tutulmaz. Dönüş sayfası önbelleğe alınmaz (`Cache-Control: no-store`), referrer göndermez ve yalnız kendi betiğini çalıştırır.
4. Sihirbaz seni GitHub'ın kurulum sayfasına götürür. **All repositories** seçili olsun ve **Install** düğmesine bas. Danışan repoları sonradan açıldığı için bu şart; uygulama yine de yalnız kendi kod, veri ve `client-` repolarına dokunur (koruma kuralı, SPEC §9.2). GitHub `setup_url`'e `installation_id` ile döner; sihirbaz kurulumu doğrular: hesap Vercel'in bağlı GitHub hesabı mı, repo seçimi "All repositories" mı, izinler onaylı mı, kurulum askıda mı. Kod reposunda `.github/workflows/axon-update.yml` eksikse paketlenmiş dosya kurulum anahtarıyla eklenir; var olan dosyaya dokunulmaz. Seçili repolarla kurulduysa sihirbaz açık uyarı ve GitHub'daki kurulum ayarının bağlantısını verir; ayarı değiştirince GitHub seni yeniden sihirbaza döndürür.
5. Gemini anahtarı isteğe bağlıdır; atlanabilir. Sonradan PT panelinde Ayarlar → Yapay zekâ ve Gemini anahtarı alanından eklenebilir veya değiştirilebilir.
6. Sihirbaz kurulum için 32 bayt rastgele veriden benzersiz AUTH_SECRET üretir. Son adımda otomatik aktarımı seç: **kendi Vercel hesabında kısa süreli bir token oluştur**, kapsam olarak bu projenin bulunduğu hesabı/team’i seç. Vercel'in Deploy düğmesi uygulamaya env yazma yetkisi vermez; bu token yalnız o yetkiyi sağlar. Geliştiricinin hesabı/tokenı veya ortak servis kullanılmaz.
7. Otomatik kur ve yayınla: bilgiler sadece kendi uygulamanın sunucusuna gönderilir. Sunucu Vercel'in kendi yayınına verdiği VERCEL_PROJECT_ID değerini kullanır; istemci başka bir proje seçemez. Vercel proje erişimi, GitHub repo/owner ve GitHub uygulamasının kurulumu (hesap, "All repositories", izinler) yeniden doğrulanır; eksik güncelleme dosyası eklenemezse env yazımı ve yayın başlatılmaz. Değerler yalnız bu projenin Production env'ine yazılır; secret, özel anahtar ve API anahtarları Sensitive olarak saklanır. Mevcut kurulum sırlarının üzerine yazılmaz. Yeni Git Production deployment başlatılır. Başarıda sekmedeki GitHub bilgileri silinir.
8. Yayın hazır olduğunda giriş ekranına geçilir. Vercel tokenı sunucu env'ine, DB'ye, çereze veya kalıcı tarayıcı depolamasına yazılmaz; başarıda formdan temizlenir. PT kurulumu bitirince Vercel hesabından tokenı iptal edebilir. Sistemin normal kullanımında Vercel tokenına ihtiyaç yoktur.
9. Yayın hazırsa **GitHub ile giriş yap** (ilk girişte GitHub uygulamanı yetkilendirmeni ister). Yalnız `GITHUB_OWNER` hesabı paneli açabilir. Görünümü seç veya atla; başarı ekranından danışanlarına geç.

Yazılan env: `GITHUB_OWNER`, `APP_REPO`, `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, `GITHUB_APP_PRIVATE_KEY` (tek satır, satır sonları `\n` kaçışlı; uygulama ikisini de okur), `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `AUTH_SECRET`, `AXON_CODE_REPO`, `AXON_CODE_BRANCH` ve isteğe bağlı `GEMINI_API_KEY`. `GITHUB_TOKEN` yazılmaz.

Vercel'in hesap sahibi izni olmadan uygulama env değişkenlerini yazamaz. Otomatik yol PT'nin kendi geçici Vercel tokenını kullanır; ortak OAuth entegrasyonuna bağlanmaz. Geliştiricinin bir kere bile servis açması gerekmez.

Manuel alternatif: Vercel tokenı vermek istemeyen kişi ayarları kopyalar veya .env dosyasını indirir; kendi Vercel Settings → Environment Variables ekranına Production olarak aktarır, Sensitive alanlarını işaretler ve yeni yayın başlatır. Vercel kod repo bağlantısı varsa manuel yolda da güncelleme YAML dosyası GitHub kurulumu doğrulanırken hazırlanır. Yerel çalışmada kod repo bağlantısı yoksa bu işlem yapılmaz. Manuel yolda son env çıktısı sunucuya gönderilmez; GitHub uygulamasının anahtarı yalnız kurulumu doğrulamak için kendi uygulamanın sunucusuna gönderilir ve saklanmaz. Sekmeyi kapatmak GitHub bilgilerini kaybettirir: "GitHub'a bağla" adımını yeniden yapman gerekir (GitHub'da oluşan fazla uygulamayı Settings → Developer settings → GitHub Apps ekranından silebilirsin). İndirilen dosya ve panodaki değerler sır içerir; paylaşma veya kod reposuna ekleme. Otomatik yol yalnız Production Vercel yayınında açılır; yerel/Preview ortamında manuel yol kullanılır.

## Çalışırken GitHub erişimi

- **Okuma ve yazma** (veri reposu, danışan repoları, kod reposu güncellemeleri) GitHub uygulamasının kurulum anahtarıyla yapılır; anahtar bir saat geçerlidir ve uygulama onu kendiliğinden yeniler. `GITHUB_APP_INSTALLATION_ID` boşsa `GITHUB_OWNER` hesabındaki kurulum bulunur.
- **Repo açma ve silme** (veri reposunun ilk açılışı, danışan ekleme/silme) PT'nin GitHub girişinden gelen kullanıcı anahtarıyla yapılır: GitHub kişisel hesapta kurulum anahtarıyla repo açtırmaz. Giriş anahtarı ve yenileme anahtarı AES-256-GCM ile şifrelenip httpOnly çerezde tutulur (anahtar `AUTH_SECRET`'tan HKDF ile türetilir); süresi dolmak üzereyse yenilenir. Çerez yoksa, yenilenemiyorsa ya da PT e-posta koduyla girdiyse: "Bu işlem için GitHub ile yeniden giriş yap." Çıkışta çerez silinir.
- **Danışan listesi** kurulumun erişebildiği repolardan okunur. Kurulum "All repositories" değilse yeni repo açılmadan durulur ve Ayarlar → Sürüm açık uyarı ile GitHub'daki kurulum ayarının bağlantısını gösterir.
- Eski kurulumlar (`GITHUB_TOKEN`, OAuth App) aynen çalışır; `GITHUB_APP_ID` + `GITHUB_APP_PRIVATE_KEY` tanımlanınca uygulama modu seçilir. Yarım uygulama ayarı (yalnız biri) kişisel anahtara düşmez, açık hata verir.

Resmi yönergeler: [GitHub App manifest akışı](https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest), [GitHub uygulaması kullanıcı anahtarı](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app), [kullanıcı anahtarının yenilenmesi](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens), [Vercel erişim tokenı](https://vercel.com/docs/rest-api/reference/welcome#creating-an-access-token), [Vercel sistem proje kimliği](https://vercel.com/docs/environment-variables/system-environment-variables#vercel_project_id), [Vercel ortam değişkenleri](https://vercel.com/docs/environment-variables/managing-environment-variables), [Vercel Sensitive değerleri](https://vercel.com/docs/environment-variables/sensitive-environment-variables).

## Sorun giderme

- Env kaydı başarılı ama deployment başlatma başarısızsa "Kurulumu tamamlamayı tekrar dene" yalnız kayıtlı ayarları okuyup yeni deployment başlatır; sırları tekrar yazmaz.
- Kısmi env kaydı başarısızsa yeni deployment başlatılmaz. Aynı açık sekmede aynı bilgilerle tekrar dene: mevcut değerler korunur, yalnız eksik anahtarlar tamamlanır. Hesap, repo, GitHub uygulaması ve kurulum kimliği eşleşmeden devam edilmez. Tüm anahtarlar Vercel’den geri okunup görülmeden yayın başlatılmaz.
- Sistem ortam değişkenleri kapalıysa Vercel Project Settings'te otomatik sistem değişkenlerini etkinleştirip yeni Production yayını başlat. Proje kimliği formdan elle girilmez.
- Kurulum ekranı yeni yayından sonra hâlâ geliyorsa Production env anahtar adlarını kontrol et. Boş değerler, 32 bayttan kısa AUTH_SECRET, eksik giriş yöntemi ya da yarım GitHub uygulaması ayarı kurulumu tamamlanmış saymaz.
- GitHub dönüşü "eşleşmedi ya da süresi doldu" diyorsa kurulumu aynı tarayıcıda ve bir saat içinde tamamla; "GitHub’a bağla" ile yeniden başla.
- "Yalnız seçili repolara erişiyor" uyarısında GitHub → Settings → Applications → uygulaman → Configure ekranında **All repositories** seç ve kaydet. Seçili repolarla kurulmuş uygulama yeni danışan repolarını göremez.
- Domaini değiştirdiysen GitHub uygulamasının ayarlarında Homepage URL ve Callback URL'yi yeni Production adresine göre bir kez güncelle (`/api/auth/github/callback`). GitHub kayıtlı adresleri kendiliğinden değiştirmez.
- GitHub `redirect_uri` uyarısı veriyorsa uygulamanın callback adresiyle tarayıcıdaki Production domain aynı olmalı. Adresin sonu `/api/auth/github/callback` olmalı.
- GitHub'a yanlış hesapla giriş yapılırsa PT oturumu açılmaz ve kullanıcı anahtarı saklanmaz.
- "Bu işlem için GitHub ile yeniden giriş yap": danışan ekleme/silme PT'nin GitHub girişini ister. Çıkış yapıp GitHub ile gir; e-posta koduyla açılmış oturum repo açamaz.
- Veri repo'su açık/fork ise görünüm kaydı reddedilir. Kişisel veriyi açık kod reposuna taşıma; ayrı private repo kullan.
- Özel anahtar sızdıysa GitHub uygulamasının ayarlarından yeni anahtar üret, eskisini sil ve `GITHUB_APP_PRIVATE_KEY`'i Vercel'de değiştirip yeni yayın başlat. Eski kurulumlarda token süresi dolmuş veya iptal edilmişse PT kendi GitHub hesabından yenisini oluşturup Vercel Production Secret'ını değiştirir ve yeni yayın başlatır.
- Başka bir PT kopyanın ayarlarını değiştirirse yalnız kendi kurulumunu etkiler. Uygulama ayarları ve danışan verileri geliştiricinin reposunda tutulmaz.

## Güncellemeler

PT panelindeki Ayarlar → Uygulama sürümü isteğe bağlıdır; normal kullanım sırasında upstream sürüm kontrolü yapılmaz. Geliştiricinin reposu veya hesabı erişilemez olsa da kendi kurulumun mevcut sürümüyle çalışmaya devam eder. [Güncelleme ve manuel birleştirme](UPDATES.md).

## Yerel simülasyon

`AXON_SETUP_DEMO=1` yalnız yerel, env’siz test sunucusunda sihirbazı göstermek içindir. Ekranda açık bir simülasyon uyarısı vardır. "GitHub'a bağla" GitHub'a gitmez: GitHub'da hangi düğmelere basılacağını anlatır ve örnek bilgileri doldurur. Gerçek anahtar girilmez. GitHub bağlama, doğrulama ve Vercel aktarım uçları bu modda işlem yapmaz; yayın düğmesi yalnız ne olacağını anlatır. Bu değişkeni canlı kurulumda kullanma.

## Kurulumdan sonra Gemini anahtarı

Ayarlar → Yapay zekâ ve Gemini anahtarı yalnız PT’ye açıktır. Kaydedilen anahtar PT’nin kendi private veri reposundaki `secrets/gemini.json` dosyasında AES-256-GCM ile şifrelenir; JSON, API yanıtı, log ve istemci başlangıç verisine açık anahtar konmaz. Şifreleme AUTH_SECRET ile PT/repo bağlamından türetilir. Bu yöntem yeni env veya Vercel tokenı/redeploy gerektirmez.

Panel kaydı varsa Vercel GEMINI_API_KEY değerinden önce kullanılır. Panel kaydı kaldırıldığında varsa env anahtarı yeniden kullanılır; Google’daki anahtar iptal edilmez. AUTH_SECRET değişirse paneldeki eski anahtarı yeniden kaydet. Private olmayan veya fork veri reposuna kayıt reddedilir. AI çağrıları anahtarı sunucudaki `geminiApiKey()` çözümleyicisinden almalıdır. Bu alan yalnız anahtarı saklar; Google’a doğrulama çağrısı yapmaz veya ücretli model isteği başlatmaz.
