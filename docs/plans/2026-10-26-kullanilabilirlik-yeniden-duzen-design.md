# Kullanılabilirlik yeniden düzeni — tasarım

26 Ekim 2026 · `feature/new-dev` · Durum: onaylandı (bölüm bölüm, kullanıcıyla)

## Neden

Uygulamanın amacı iyi ama kullanımı zor; ürün sahibi bile kullanamadı. 25 Ekim'deki tarayıcı incelemesi ve kod
taraması aynı kök nedenleri buldu:

- **Bir kelime, birden çok anlam.** "Gün" dört şey demek (Gün A, Pazartesi, haftada kaç gün, "3 gün"); iki ayrı
  "Değiştir" düğmesi var; hareket testinin üç adı var (Hareket taraması / PT değerlendirmesi / PT hareket testi).
- **Gizli hareketler ve gizli girişler.** Antrenmandaki tek liste yazısız bir ☰ simgesinde; editörde sıralama,
  gruplama ve silme yalnız sürükleme/kaydırmayla anlaşılıyor; Sağlık ve ölçüm avatar menüsünün dibinde.
- **Her şey aynı anda.** Ölçüm formu 22 kutu; danışanın İlerleme sayfası telefonda 10 ekran; program editöründe
  evre, sıklık, haftanın günleri ve günler yan yana.
- **Program modeli sezgiye ters.** Bugünkü antrenman A → B → C sırasıyla seçiliyor, haftanın günleriyle bağı yok
  (`src/lib/training-days.ts:10`, `src/lib/program-plan.ts:736`); 3 gün + 4 hafta günü seçilince Pazartesi'nin
  antrenmanı her hafta değişiyor.
- **Sabit yüzen öğeler.** AI koç düğmesi her sayfada sağ altta; telefonda program editörünün Kaydet düğmelerini
  örtüyor (`src/components/coach/coach-launcher.tsx`).

Kas haritası bu çalışmanın dışında: mevcut harita (`src/components/muscle-map`) olduğu gibi kalır.

## İlkeler

1. Bir ekran, bir iş. En sık iş üstte; nadir ve klinik olan ikinci katmanda.
2. Her şeyin tek adı ve tek yeri var.
3. Gizli hareket yok: sürükleme ve kaydırma kısayoldur, her işlemin görünür bir düğmesi de vardır.
4. Sabit yüzen öğe yok; AI koç ihtiyaç anında, o bağlamla açılır.
5. Oyun mantığı akış düzeyinde: rehberli kurulum, ilerleme listesi, set ve rekor kutlaması. Plana uymak ödüllenir,
   dinlenme ve hafifletilmiş antrenman ceza sayılmaz (`docs/FITNESS-PRODUCT-AUDIT.md`).

## Fazlar

Her faz kendi uygulama planıyla ayrı yapılır; sıradaki faz öncekinin iskeletine oturur.

| Faz | Kapsam |
|---|---|
| 0 | Hızlı düzeltmeler (aşağıda) |
| 1 | Menüler ve AI koçun bağlamsal girişleri |
| 2 | Antrenman ekranı: liste + odak |
| 3 | Program modeli (haftalık plan), veri taşıma, rehberli oluşturma, gün sekmeli düzenleme |
| 4 | Sağlık merkezi, ölçüm turu, danışanın kilo/bel girişi, İlerleme'nin "önce özet" düzeni |
| 5 | Oyun öğeleri: kutlamalar, seri ve rozetlerin öne çıkması |

## Faz 0 · Hızlı düzeltmeler

1. **Yüzen AI koç kalkar** (`src/app/dashboard/layout.tsx:44`, `src/app/me/layout.tsx`). Faz 1'e kadar AI koç
   avatar menüsünden açılır.
2. **Telefonda Kaydet** (`src/components/block-editor/editor-save.tsx`): çubuk dock'un hemen üstünde sabit; hiçbir
   öğe örtmez. Bugün 375 px'te iki "Programı kaydet" düğmesinin ortası AI koç ve dock altında kalıyor.
3. **Kütüphane araması** (`src/app/dashboard/exercises/exercise-list.tsx:128`): `src/lib/exercise-search.ts`'teki
   `searchExercises` kullanılır; "dambil", "sinav", "gogus" bulunur, kas adıyla da aranır.
4. **Bayat bildirimler** (`src/lib/notices-store.ts:219`, `src/lib/notices.ts:193`): önbellek ilk açılışta bir ay
   önceki bildirimleri "8 yeni" diye gösteriyordu. 14 günlük pencere ve okunmamış sayısı sayfa açılırken hesaplanır;
   bekleyen öneriler "bekliyor" etiketiyle ayrılır.
5. **Yarım antrenman süresi** (`src/lib/session-index.ts:79`, `durationOf`): bitmemiş/yarım antrenmanda süre son
   setin zamanına göre; "11 sa 12 dk" ve şişen "Son 30 gün" toplamı kalkar.
6. **Antrenmana başla** (`src/app/me/program-card.tsx`): Bugün ekranında kaydırmadan görünür.
7. **Tarihlerde ay**: antrenman kartlarında "23 Cum" yerine "23 Eki Cum".
8. **"Son antrenman" tutarlılığı** (`src/app/dashboard/clients/[id]/program/page.tsx:471`): her yerde aynı kural,
   yarım antrenmanlar dahil.

## Faz 1 · Menüler ve AI koç

**PT**
- Dock: Genel bakış · Danışanlar · Kütüphane; masaüstünde de etiketli (`src/app/dashboard/nav.tsx`).
- Genel bakış: telefonda "Dikkat gerektirenler" en üstte, sayı kartları tek satırda küçük; uyarılar danışana göre
  gruplanır.
- Danışanlar listesi: kartta son antrenman, uyarı sayısı, program; üstte arama.
- Danışan sayfası 5 sekme: **Genel · Program · Antrenmanlar · İlerleme · Sağlık**
  (`src/app/dashboard/clients/[id]/client-tabs.tsx`). Davet, Genel'deki Giriş kartına girer; AI koç sekmesi kalkar.
  Genel'in en üstünde o danışanın dikkat özeti.
- Kütüphane/Egzersizler: arama en üstte; kısıt süzgeci kapalı bir bölümde.
- Ayarlar tek sayfa (Görünüm · Yapay zekâ · Sürüm), avatar menüsünden; altta Çıkış.

**Danışan**
- Dock: **Bugün · Program · İlerleme · Sağlık** (`src/lib/client-tabs.ts`). Sağlık yalnız modül açıkken.
  Geçmiş, İlerleme'nin içine girer.
- İlerleme: Özet · Geçmiş · Rekorlar. Özet seri, haftalık hedef, son rekorlar ve başarılarla açılır; ayrıntılı
  grafikler kapalı bölümlerde.
- Avatar menüsü: Ayarlar · Çıkış.

**AI koç** (aynı `CoachPanel`, bağlamla açılır)
- PT: Genel'de "AI'ya sor", Program'da "AI ile taslak öner", Genel bakış'taki dikkat satırında "AI'ya sor".
- Danışan: İlerleme'de grafiğin yanında "Bunu açıkla", antrenman özetinde "Koça sor", Program'da "AI ile program öner".

## Faz 2 · Bugün ve antrenman ekranı

**Bugün**
- En üstte "Pazartesi · Üst vücut" kartı (hareket sayısı, süre) ve kaydırmadan görünen **Antrenmana başla**.
- Altında ilk 3 hareket + "Tümünü gör"; kısıt uyarısı önizlemede de görünür ("Sol diz için dikkat: Back Squat").
- Hafta şeridi: her günün antrenmanı ve durumu (yapıldı · kaçtı · sırada).
- Yarım antrenman için "Devam et" kartı, hareket listesiyle.

**Antrenman: liste + odak** (`src/app/me/antrenman/workout-screen.tsx`, `src/lib/workout-flow.ts`)
- Üst çubuk: antrenman adı, geçen süre, set ilerleme çubuğu, **Bitir**; ⋯ menüsünde "Antrenmanı değiştir",
  "Ara ver".
- Ana ekran günün hareket listesi: durum (✓ bitti, ▶ şu an, ○ sırada, ⤼ atlandı), ad, yapılan/toplam set, son kilo;
  süpersetler grup halinde.
- Satıra dokununca o hareketin odak ekranı açılır, **sıra değişmez** (bugünkü `doNowAt` davranışı kalkar). Odak:
  büyük kg/tekrar düğmeleri, **Set bitti**, set tablosu, önceki değerler; ⋯ menüsünde "Muadil seç", "Bu hareketi atla";
  sol üstte **‹ Liste**.
- Hareket bitince sıradakine otomatik geçer ("Sıradaki: Omuz Press"); liste her an tek dokunuş.
- Dinlenme sayacı ekranı kilitlemez; dinlenirken listeye dönülebilir.
- Biten hareket yeniden açılıp setleri düzeltilebilir.
- Sıra değiştirme listedeki ayrı "Sırayı değiştir" modunda (kol + yukarı/aşağı); "Hareket ekle" listenin altında.
- Tarayıcı geri tuşu: odaktan listeye, listeden "Ara verilsin mi?".

## Faz 3 · Program modeli ve kurulumu

> Uygulama planı: `docs/plans/2026-11-01-faz-3-gune-atanmis-program.md` (Karar 14). Aşağıdaki maddelerin yanındaki
> notlar o planla neyin yapıldığını, neyin değiştiğini ya da geçersiz kaldığını söyler.

**Haftalık plan**
- Program adlandırılmış antrenmanlardan oluşur; her antrenman bir ya da birkaç hafta gününe atanır (Tüm vücut hem
  Pazartesi hem Cuma olabilir). Haftalık sayı atanmış gün sayısıdır; ayrı "Haftada kaç gün" alanı kalkar. *(Faz 3
  planı, 2026-11-01: yapıldı; atama evre başına, varsayılan adlar "Program A…". "Haftada kaç gün" yumuşadı: atamasız
  evrede kalır.)*
- Bugün, o günün antrenmanını gösterir. Antrenmansız günde "Bugün dinlenme · Sonraki: Çarşamba, Alt vücut" ve
  "Başka antrenman yap" (kaçanı telafi dahil). Kaçan gün kaçmış sayılır. *(Faz 3 planı, 2026-11-01: ilk ve son cümle
  yapıldı; "Bugün dinlenme · Sonraki: …" geçersiz — kullanıcı kararı 3: atanmamış günde "Bugün atanmış program yok" ve
  programların listesi, öneri yok. Her gün "Değiştir"le başka program yapılabilir — kullanıcı kararı 2.)*
- Danışan bir antrenmanı başka güne taşıyabilir; PT "Danışan değiştirdi" olarak görür (bugünkü `clientSchedule`
  katmanının yerini alır). *(Faz 3 planı, 2026-11-01: geçersiz — kullanıcı kararı 1: danışan günleri değiştirmez, kendi
  programında atamayı o yapar; `clientSchedule` okunur ama yok sayılır, PT'nin ilk kaydı siler.)*
- Rotasyon alanları (`rotation.lastDayId`) yalnız geçmiş için okunur. *(Faz 3 planı: yapıldı; dönüş ilerlemez ve
  gösterilmez.)*

**Veri taşıma** (saf fonksiyon + test; eski biçim okunmaya devam eder; önce kopyada denenir) *(Faz 3 planı,
2026-11-01: okurken, yazmadan — `upgradeProgram`; dosya yalnız PT kaydı ya da evre geçişiyle yeni biçime geçer.)*
- Antrenmanlar seçili hafta günlerine sırayla atanır (A → ilk gün, B → ikinci …). *(yapıldı)*
- Hafta günü antrenmandan fazlaysa sıra başa döner; antrenman fazlaysa atanmayan için PT'ye uyarı. *(yapıldı; başa
  sarar, uyarı düzenleyicide "Gün atanmamış: Program D")*
- Hiç gün seçilmemişse sıklığa göre varsayılan dağılım (3 → Pzt, Çar, Cum). *(yapılmadı: atama yok, danışan her gün
  programı kendisi seçer)*
- Evreli programlarda her evre aynı kuralla. *(yapıldı)*

**Oluşturma (PT): 3 adım** *(Faz 3 planı, 2026-11-01: bu fazda yok; atama seçili programın kartındaki gün
çipleriyle)*
1. Günler: hafta günlerini seç, her birine antrenman ata; ad önerileri (Üst vücut, Alt vücut, İtme, Çekme, Bacak,
   Tüm vücut).
2. Doldur: her antrenman bir sekme; "Şablondan doldur" ya da "Hareket ekle".
3. Gözden geçir: haftalık özet, kas yükü haritası, "Danışana ata".

**Düzenleme: tek sayfa**
- Üstte hafta şeridi (Pzt Üst · Çar Alt · Cum Tüm), altta antrenman sekmeleri. *(Faz 3 planı: şerit yerine salt okunur
  "Haftanın programı" özeti ("Sal · Alt vücut, Per · Üst vücut"); program çiplerinde günleri.)*
- Kaydet sayfanın altında, dock'un üstünde sabit çubukta (bugün bir günün "Hareketler" kartının içinde).
- Evreler, süre ve ilerleme kuralları kapalı "Gelişmiş" bölümünde; evre davranışı aynı kalır. *(Faz 3 planı: bu
  fazda yok.)*

**Hareket kartları** (`src/components/block-editor`)
- Görünür düğmeler: Yukarı, Aşağı, Grupla, Sil. Sürükleme ve kaydırma kısayol olarak kalır.
- Editörün üstündeki uzun kullanım açıklaması kalkar.
- Danışanın kendi program editörü (`src/components/program/own-program-form.tsx`) aynı parçaları kullanır;
  bugün kopyalanmış gün çipleri, gün adı ve gün ekleme ortaklaşır.

## Faz 4 · Sağlık ve ölçüm

**PT'nin Sağlık sekmesi — onaylı yapı: Kısıtlar · Ölçümler · Hareket** (onay parçası başına bir sekme; SPEC §6,
`docs/design/kisit-tarama.md` §1). Faz 4 bu üç sekmeyi tek sayfada yeniden birleştirmez; her sekmenin içini düzenler.
- Üstte durum: modül ve onaylı parçalar, tek satır (şeridin üstü).
- **Kısıtlar:** karar bekleyen danışan bildirimleri üstte, aktif kısıtlar altta.
- **Ölçümler** (elle girilenler): hızlı kart (kilo, bel; son değer + eğilim), "Ölçüm turu başlat", seçilen ölçünün
  grafiği, ölçüm günleri. Performans ve hareketlilik testleri ile anket skorları da burada (aynı ölçüm kaydı).
- **Hareket** ("Hareket taraması" onayı): kamera ölçümü ve **Hareket testi** (tek ad; PT'nin 8 hareketlik testi).
- Not · Takip: hazır oluşluk ve ağrı grafikleri bugün İlerleme'de; Faz 4 bunlar için Sağlık'a sekme eklemez.

**Ölçüm turu** (`src/app/dashboard/clients/[id]/measurements/measurement-form.tsx`, `src/lib/measurements.ts`)
- Ekran başına tek ölçü; ölçüm yeri tek cümle; önceki değer ve tarihi; sol/sağ yan yana; virgül ve nokta kabul;
  "Atla".
- Sonunda özet: yalnız ölçüm hatasından büyük değişiklikler vurgulanır.
- Yardım metinleri sade dil ("güvenilirlik 0,82 → 0,96" gibi ifadeler kalkar).

**Danışanın Sağlık sekmesi**
- Kısıtlarım ve "Ağrı / rahatsızlık bildir".
- Kilo ve bel hızlı kartı: danışan kendisi girer, kayıtta "danışan girdi" yazar. Tam tur ve klinik testler PT'de.
- Kamera ölçümü, hareket testi sonuçları, onay durumu.

**Ağrı bildiriminde belirti türü** (araştırma: radiküler belirtiler, cauda equina işaretleri)
- Belirti: ağrı, yayılan ağrı, uyuşma, karıncalanma, güç kaybı; ne kadar aşağı yayıldığı.
- Acil işaretler (iki bacakta belirti, kasıkta his kaybı, idrar/dışkı değişikliği) programı durdurup hekime yönlendirir;
  diğerleri uyarı ve hareket değişikliği.

## Doğrulama (her faz)

- Saf mantık için birim testleri (`npm test`), `npm run typecheck`, `npm run lint`, `npm run build`.
- 375 px ve masaüstünde tarayıcıda kontrol; yalnız test danışanlarıyla. Gerçek danışan verisine kayıt yapılmaz.
- Faz 3'ün veri taşıması ayrıca: taşıma fonksiyonu testli, eski biçim okunur, kopyada deneme.
