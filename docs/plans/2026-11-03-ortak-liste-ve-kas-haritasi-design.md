# Ortak liste ve tek kas haritası (tasarım)

Tarih: 2026-11-03. Durum: taslak (kullanıcının onayını bekliyor). Koç tarafı toparlamasının 1. paketi.

## Neden

Kullanıcı (ürün sahibi) 2–3 Kasım'da koç tarafını gezdi ve şunu söyledi: "her şey çok karışık". Aynı fikir her ekranda başka
türlü görünüyor ve başka türlü çalışıyor. Önceden "tek gösterim, aynı bileşen her yerde" denmişti, ama zamanla dağıldı:

- **Listeler:** 21 yerde öğe taşınıyor ya da siliniyor.
  - Ortak kaydırma ve sürükleme parçalarını (`src/components/swipe/swipe-row.tsx`, `src/components/exercise-card.tsx`,
    `src/components/block-editor/drag/`) yalnız egzersiz düzenleyicisi tam kullanıyor; geçmiş detayı yarım kullanıyor.
  - Geri kalanların her biri kendi usulünde: ikon düğmeler, ⋯ menüleri, × çipleri, aç/kapa kutular, onay pencereleri.
  - Sürükleme iki ayrı kurulumla yapılıyor (`editor-dnd.tsx` ve `me/antrenman/workout-list.tsx`).
  - "Geri al" üç ayrı biçimde ve iki ayrı sürede yazılmış (8 sn ve 5 sn).
  - Antrenman ekranındaki set satırı kaydırmayı kopyalayıp yeniden yazmış (`me/antrenman/set-row.tsx`).
- **Kas haritası:** Tek bileşen (`src/components/muscle-map/muscle-map.tsx`) üç ayrı boyamayla çiziliyor.
  - `role` desenle çiziyor: hedef dolu, yardımcı çizgili, dengeleyici noktalı.
  - `load` bir opaklık rampasıyla çiziyor. Kullanıcının sözü: "opaklık farkı çok anlaşılmıyor".
  - `status` dördüncü bir renk düzeni kullanıyor.
  - Açıklama kutuları her yerde farklı. Şablon sayfasında kas adları tek harfe kesiliyor ("Ö… 6").
  - Derin kaslar haritadan kopuk: egzersiz formunun dibinde, "Medikal etiketler" içinde ayrı bir düğme listesi.

Kullanıcının kararı (2026-11-03): her yerde desenli gösterim kullanılacak; listeler tekilleştirilecek; gereksiz kod silinecek.
Sözü: "ortak, tutarlı bir şey olsun, kullanıcı takip edebilsin".

## Hedefler

1. Uygulamadaki her listede taşıma, silme ve geri alma aynı görünür ve aynı çalışır; PT tarafında da danışan tarafında da.
2. Her kas haritası tek bileşenden ve tek desen diliyle çizilir: **dolu = çok, çizgili = orta, noktalı = az, boş = yok**.
   Opaklık ya da ton rampası hiçbir yerde kullanılmaz.
3. Derin kaslar aynı kas bileşeninin parçası olur: seçilirken de gösterilirken de.
4. Kopya ve ölü kod silinir. Aynı iş için bir tane paylaşılan parça kalır.

## Hedef dışı

- Gezinme, ekran adları, program sayfasının düzeni (2. paket).
- Egzersiz formunun kısalması, form içinden cihaz ve aparat ekleme, JSON içe aktarma (3. paket); hazır şablonlar (4. paket).
- Yeni kas çizimi ya da derin kas katmanı çizimi. Mevcut `body-muscles` haritası olduğu gibi kalır (2026-10-26 kararı).
- Hacim sayımının değişmesi (hedef 1, yardımcı 0,5, dengeleyici 0,25 set aynen kalır).
- Kamera ölçümü geçmişinin "Silinenler" kutusu: kendi çöp kutusu var, değişmez.
- Su sayacı: liste değil, bir sayaç.

## Olmaması gerekenler

- Geri alınamayan, kazara silme: her silme ya 8 saniyelik "Geri al" ile ya da onay penceresiyle korunur.
- Klavye ya da ekran okuyucu erişiminin kaybolması. Bugünkü Alt+ok tuşları ve gizli "Yukarı/Aşağı taşı" düğmeleri kalır.
- Program düzenleyicisinin bugünkü davranışlarının bozulması: gruplama (kartın ortasına bırakma), seçim kipi, grup üyesini
  "Çıkar", taslak ve Kaydet.
- Antrenman sırasında bir hareketin kazara yer değiştirmesi.
- Eski kayıtların, şablonların ve programların okunamaması (bu paket veri biçimini değiştirmez).

## Kısıtlar

- Next.js 16 (repodaki sürüm; `node_modules/next/dist/docs`), React 19, motion, `@dnd-kit/core` (zaten var). Yeni bağımlılık yok.
- Prettier çalıştırılmaz.
- Danışan metinleri "sen" ile; PT tarafı metinleri PT'yi üçüncü şahıs olarak anar ("PT/antrenör"), uygulama beyaz etiketli.
- Telefon önce: 375 px genişlikte yatay kaydırma olmaz.
- Önceki kullanılabilirlik ilkesi (`docs/plans/2026-10-26-kullanilabilirlik-yeniden-duzen-design.md` ilke 3): gizli hareket
  yoktur. Sürükleme ve kaydırma kısayoldur; her işlemin görünür bir karşılığı da vardır.
- Testler `node:test` ile (`npm test`). Tarayıcı denetimi yalnız test danışanı `c_zmrbywaz` üzerinde yapılır; gerçek
  danışana (`c_uc942qx6`) yazılmaz.

## Kararlar

Kullanıcı aşağıdaki kuralları 2026-11-03'te onayladı ("Evet, yaz"). "Benim kararım" diye işaretli olanlar o onaydan sonra
kodu okuyarak verdiğim ayrıntılardır.

### A. Tek liste düzeni

**Taşıma**

- Taşınabilen her satırın ya da kartın üstünde aynı tutamaç vardır: bugünkü düzenleyicideki çizgi, `CardGrabber`. Başka
  biçimi olmaz.
  - Sürükleme yalnız tutamaçtan başlar; kartın gövdesine dokunmak sürükleme başlatmaz.
  - Tutamacın dokunma alanı kartın 12 px üstüne taşar. Bu yüzden taşınabilen satırlar, tek satırlık olsalar da (ipuçları,
    antrenman listesi), aralarında bu alana yer bırakan kart aralığıyla dizilir (benim kararım).
- Klavyede düzenleyicideki gibi çalışır: odaktaki kartta Alt+↑/↓ bir adım taşır. Ekran okuyucu için gizli "Yukarı taşı /
  Aşağı taşı" düğmeleri kalır.
- ⋯ menülerindeki taşıma seçenekleri kalkar: evre menüsündeki "Yukarı/Aşağı taşı" ve program menüsündeki "Sola/Sağa taşı".
  Aynı menüdeki "Evreye taşı", "Kopyala" ve "Şablon olarak kaydet…" taşıma değildir, menüde kalır.
- Uygulamada tek bir sürükle-bırak kurulumu kalır: düzenleyicinin dnd-kit kurulumu paylaşılan bir parçaya çevrilir. Antrenman
  listesinin ayrı kurulumu ve ▲/▼ düğmeleri silinir.

**Silme**

- Sola kaydırma kırmızı "Sil" düğmesini açar; sonuna kadar kaydırmak doğrudan siler. Bunu yapan tek parça `SwipeRow`'dur.
- Görünür karşılığı da vardır:
  - Açılan bir kartta, kartın içindeki "Sil" düğmesi.
  - Açılmayan tek satırlık bir satırda, satırın sonundaki çöp kutusu ikonu.
- Silmenin adı her yerde "Sil"dir. "Kaldır" yalnız bir seçimi geri almak için kalır (örneğin "Gruptan çıkar").
- Silmeden sonra 8 saniyelik "Geri al" bildirimi çıkar (`showUndoToast`). Antrenman ekranının 5 saniyelik kendi bildirimi
  kalkar. Bu kural, Kaydet'e kadar yerel kalan değişiklikler ve antrenman içi değişiklikler içindir. Sunucuya hemen giden
  silmeler kayıt silmesi sayılır (aşağıda).
- **Kayıt** silmeleri tek bir ortak onay penceresinden geçer: danışan, program, geçmiş antrenman, kütüphanedeki egzersiz,
  cihaz, aparat ve şablon, ölçüm, tarama, kısıt. Geri alma yoktur. `*-actions.tsx` dosyalarındaki kopya pencereler ve danışan
  tarafındaki `DeleteDialog` tek bir bileşen olur; yalnız metinleri değişir. Danışan silerken adını yazma kuralı kalır.

**Liste liste ne olur**

| Liste | Taşıma | Silme |
|---|---|---|
| Program ve şablon düzenleyicisindeki hareketler (`block-editor`) | Değişmez (örnek olan bu) | Değişmez. Yalnız kopya kod temizlenir |
| Egzersiz formundaki ipuçları | Tutamaçla taşınır (yeni) | Satır sonunda çöp kutusu ve kaydırma, Geri al |
| Evreler (`phases-card.tsx`) | Tutamaçla taşınır | Kartta "Sil" ve kaydırma, Geri al |
| Programlar, yani gün çipleri (PT `day-chips.tsx`, danışan `own-program-form.tsx`) | Elle taşınmaz. Yalnız **gösterimde** ilk atanmış hafta gününe göre sıralanır; atanmamışlar saklanan sırayla sona gelir. Programları listeleyen her ekran (PT düzenleyicisi, danışanın Bugün ve "Değiştir" listesi, `training-week.tsx`) aynı sıralama yardımcısını kullanır. Saklanan sıra ve veri değişmez; hiç atama olmayan evrede varsayılan program bugünkü gibi saklanan ilk programdır (benim kararım) | ⋯ menüsünde ve danışan formunda "Sil", Geri al |
| Antrenman listesi (`me/antrenman/workout-list.tsx`) | Ayrı "Sırayı değiştir" kipi kalkar. Bitmemiş ve atlanmamış her harekette tutamaç hep görünür (bugünkü `reorderMovable` kuralı aynen kalır); biten ve atlanan hareketler sabit kalır (benim kararım) | Plandaki hareket silinmez, "Atla" ile atlanır (bugünkü gibi). Antrenmanda **eklenen** hareket kaydırma ya da kart içindeki "Sil" ile silinir, Geri al (yeni; bugün eklenen hareket kaldırılamıyor) |
| Antrenmandaki set satırları (`set-row.tsx`) | Yok | `SwipeRow` ile sola kaydırma ve paneldeki "Seti sil", Geri al. Fazladan seti bırakmanın da Geri al'ı olur. Kendi yazılmış kaydırma kodu silinir |
| Geçmiş antrenman detayı (`history-detail.tsx`) | Yok | Kaydedilmiş kayıt olduğu için set ve hareket silme de bugünkü gibi hemen sunucuya gider ve ortak onay penceresinden geçer; Geri al yok. Kaydırma ve çöp kutusu yalnız "Düzenle" kipinde çalışır; kip dışında kaydırma kapanır (benim kararım) |
| Kişinin kendi programları listesi (`me/(sekmeler)/programlar`) | Yok | Kayıt penceresi (bugünkü gibi) |
| Kısıt izinleri, bekleyen bildirim geri çekme, öneri reddetme | Yok | Görünüşleri ortak satıra geçer; davranışları (pencere ve not) aynı kalır |

**Liste olmayan ama aynı işi yapan küçük parçalar** (her biri tek bileşene iner):

- **× ile kaldırılan çipler:** egzersiz formundaki kas çipleri, kas ve kısıt süzgeci çipleri, medikal kısıt çipleri.
  `medical-fields.tsx` ile `constraint-picker.tsx`'teki kısıt seçici + çip ikilisi tek bileşen olur.
- **Aç/kapa kutu ızgaraları:** egzersiz formundaki `AlternativesField` (muadiller) ile cihaz formundaki `AttachmentPicker`
  (aparatlar) tek bileşen olur.
- **"Değişmediyse geri alma" denetimi:** `block-editor.tsx`, `program-form.tsx` ve `own-program-form.tsx`'te üç kez yazılmış;
  tek yardımcıya iner.

**Silinecek kopya ve ölü kod** (grep ile doğrulandı):

- `src/lib/template-edit.ts`: `duplicateRow`, `duplicateBlock`, `canDuplicate`, `canDuplicateBlocks`, `duplicateBlocks`. Kopyalama
  özelliği "PT kararı 14" ile kaldırılmıştı; bu işlevleri yalnız kendi testleri çağırıyor.
- `vibrate()` üç yerde tanımlı (`swipe-row.tsx`, `editor-dnd.tsx`, `me/antrenman/workout-feedback.ts`); tek olur. `swallowClick` iki kez yazılmış; tek olur.
- `program-plan.ts`'teki `movePhase` ve `moveDay` ile `reorder.ts`'teki `moveKey` aynı işi yapıyor. Taşıma tek yardımcıya
  iner; menüden taşıma kalkınca kullanılmayan kalırsa silinir.
- Aynı adı taşıyan farklı bileşenler ayrı adlar alır (adları builder seçer): üç `ExerciseCard` (`components/exercise-card.tsx`,
  `me/antrenman/exercise-card.tsx`, geçmiş detayındaki yerel kart) ve üç `SetRow` (`antrenman/set-row.tsx`, `set-table.tsx`,
  geçmiş detayı).

### B. Tek kas haritası

**Desen dili (her yerde aynı)**

- Dört kademe vardır: **dolu**, **çizgili**, **noktalı** ve **boş**. Desenler bugünkü `MusclePatterns`'tir; renk hedef rengidir
  (`--muscle-target`).
- Bugünkü `load` rampası (`loadIntensity` ve `color-mix` yüzdesi) silinir. `--muscle-secondary` ve `--muscle-stabilizer` gibi
  ara ton kullanımları da silinir; kullanılmaz kalan token'lar kaldırılır.

**Kademe neye göre seçilir** (harita nerede kullanılıyorsa ona göre):

| Kullanım | Dolu | Çizgili | Noktalı |
|---|---|---|---|
| Hareket (egzersiz detayı, egzersiz formu) | hedef | yardımcı | dengeleyici |
| Tek antrenmanın yükü (şablon kartı, şablon detayı, şablon formu, program düzenleyicide bir programın "Kas yükü", danışanın antrenman özeti) | 3 set ve üstü | 1,5–2,75 set | 0'dan büyük, 1,5'in altı |
| Haftalık yük (program sayfasında "Haftalık (plan)", "Bu hafta (yapılan)" ve "Bir tur"; danışanın İlerleme'sindeki haftalık kaslar) | 10 set ve üstü | 5–9,75 set | 0'dan büyük, 5'in altı |
| Gelişim (İlerleme → Gelişim) | belirgin gelişme | gelişme | sabit |

- **Eşiklerin dayanağı** (benim kararım):
  - Tek antrenman eşikleri, 3 setlik tek bir hareketin rol kademesini birebir verir: hedef 3, yardımcı 1,5, dengeleyici 0,75.
  - Haftalık 10 set, SPEC §7.4'teki "yeterli" alt sınırıdır (`WEEKLY_SET_BANDS.enough`).
  - Listedeki "az / yeterli / fazla" sözcükleri olduğu gibi kalır; 20'nin üstü ("fazla") listede ikon ve sözcükle yazılır.
- **Gelişim haritasında gerileme** uyarı rengiyle (`--destructive`) çizgili ve kalın kenarlı çizilir. Bu, desen dilinin dışındaki
  tek renk istisnasıdır, çünkü bilgi taşır. "Veri az" boş kalır.
- **Seçim** (egzersiz listesindeki kas süzgeci, AI koç panelindeki kas seçimi): seçili kas dolu, seçili olmayan boş.

**Tek açıklama düzeni**

- Her haritanın yanında ya da altında aynı açıklama kutusu durur:
  - O kullanımdaki üç kademenin desen örnekleri ve anlamları. Örneğin "Hedef / Yardımcı / Dengeleyici" ya da
    "10+ set / 5–9 set / 1–4 set".
  - Altında kas adı ve değer listesi, tek biçimde. "+n kas daha" bugünkü gibi kalır.
- Kas adları hiçbir genişlikte tek harfe kesilmez. Bugünkü sebep, dar kartta `lg:grid-cols-3`; ad gerekirse alt satıra
  kayar.
- İstisna: Şablonlar listesindeki küçük şablon kartları yalnız haritayı gösterir, açıklama kutusu şablon detayındadır (benim
  kararım).

**Derin kaslar aynı bileşende**

- Derin kaslar `src/lib/deep-muscles.ts`'teki listedir; egzersizde `activationTargets` alanında durur.
- Kas bileşeninin haritanın altında bir "Derin kaslar" bölümü olur. Bölge başlıklarıyla bir çip listesidir (Omuz ve kürek,
  Boyun, Gövde, Kalça, Ayak bileği). Çizim yoktur.
- **Seçerken** (egzersiz formu): bölüm, "Medikal etiketler"den alınıp "Çalışan kaslar" bölümüne, haritanın hemen altına taşınır.
  Dokununca seçilir, tekrar dokununca kalkar. Derin kasın kademesi yoktur; hacme sayılmaz, bunu bir satırlık açıklama söyler.
- **Gösterirken** (egzersiz detayı): aynı bölüm, yalnız seçili derin kaslarla, haritanın altında görünür. `medical-card.tsx`'teki
  ayrı derin kas gösterimi kalkar.

**Tek giriş noktası**

- Haritayı çizen tek bir bileşen kalır. `TemplateMuscleMap` ve `ExerciseMuscleMap` sarmalayıcıları ya bu bileşenin kullanım
  biçimlerine dönüşür ya da silinir; seçimi builder yapar.
- Şu kullanımların hepsi aynı bileşeni ve aynı açıklama kutusunu kullanır: `exercises/[id]/page.tsx`, `exercise-form.tsx`,
  `exercise-list.tsx`, `templates/page.tsx`, `templates/[id]/page.tsx`, `template-form.tsx`, `program/day-editor.tsx`,
  `components/program/phase-load.tsx`, `components/progress/strength-progress.tsx`, `components/progress/weekly-progress.tsx`,
  `me/antrenman/ozet/[id]/summary-carousel.tsx`, `components/coach/coach-panel.tsx`.

## Builder'a bırakılanlar

- Yeni paylaşılan bileşenlerin ve yardımcıların adları, dosya yerleri ve API'leri.
- Kademe hesabının nerede durduğu: saf işlev olarak `src/lib` altında, eşikler sabit olarak, birim testleriyle.
- Kayıt dışı silmelerde Geri al'ın nasıl kurulacağı: silmeyi 8 saniye ertelemek ya da geri yazmak.
- Ortak onay penceresinin metin kalıbı (bugünkü metinler korunarak).
- Bu paketin kaç commit'e ve hangi sırayla bölüneceği. Önerim: önce kas haritası, sonra liste parçaları, sonra liste liste geçiş.
- Kullanılmaz kalan her şeyin silinmesi. Grep'le doğrulanmadan silinmez.

## Doğrulama

- Kademe eşikleri, kademe seçimi ve taşıma ya da silme yardımcıları birim testleriyle sınanır.
- Tarayıcıda (yerleşik panel, 1280 px ve 375 px), yalnız test danışanı `c_zmrbywaz` ile denetlenir:
  - Her listede taşıma, kaydırarak silme, görünür "Sil" ve Geri al çalışır.
  - Kas haritaları tabloda yazan kademelerle çizilir.
  - Derin kaslar egzersiz formunda seçilir ve detayda görünür.
  - Kas adları kesilmez.
- Düzenleyicinin bugünkü testleri (`template-edit`, `drop-target`, `block-editor` ile ilgili olanlar) geçmeye devam eder.
