# Kardiyo hedefleri: mesafe, süre, eğim ve kalori (tasarım)

Tarih: 2026-11-02. Durum: onaylandı (2026-11-02). Uygulama planı: `docs/plans/2026-11-02-kardiyo-hedefleri.md`.

## Neden

Koşu bandı, bisiklet, eliptik gibi kardiyo hareketleri bugün yalnız süreyle izleniyor (`trackingType: 'duration'`). PT bir
yürüyüşü "30 dk · 3000 m · eğim %5" diye veremiyor; danışan yürüyüşü bitirince bandın ekranında gördüğü mesafeyi ve eğimi
giremiyor; yakılan kalori hiçbir yerde yok.

Kullanıcının tarifi (onaylandı):

- PT, koşu bandı satırına "30 dk · 3000 m · eğim %5" gibi bir hedef yazar.
- Danışan yürüyüşü bitirince bandın ekranındaki süreyi, mesafeyi ve eğimi telefona girer.
- Kaloriyi uygulama kendisi hesaplar (danışanın kilosundan).

## Hedefler

1. PT, kardiyo satırının hedefine süre (dakika), mesafe (metre) ve (yürüyüş/koşuda) eğim (%) koyabilir. Mesafe ve eğim isteğe
   bağlıdır; yalnız süre de verilebilir (bugünkü davranış).
2. Danışan antrenmanda kardiyo setine süre, mesafe ve eğim girer. Bugünkü süre sayacı ("Başlat ▶") kalır; mesafe ve eğim elle
   yazılır. Faz 2'nin satır içi girişi ve sırasız ✓ kuralları aynen geçerli (yazılan ✓'lanmadıkça yapılmış sayılmaz).
3. Yürüyüş/koşu setinde kalori hesaplanır ve görünür: setin satırında, antrenman özetinde (toplam) ve PT'nin seans görünümünde.
4. "Önceki" sütunu geçen seferin kardiyo değerlerini gösterir ("30:00 · 3000 m · %5").

## Hedef dışı

- GPS, nabız, bant/saat entegrasyonu, hız ya da tempo grafikleri.
- Mesafe ve eğim için otomatik ilerleme (ilerleme motoru bu alanlara bakmaz; PT hedefi elle değiştirir).
- Yürüyüş/koşu dışındaki aletlerde (bisiklet, eliptik, kürek, merdiven, air bike) kalori. Bu aletlerde mesafe girilebilir ama
  kalori gösterilmez.

## Olmaması gerekenler

- Uydurma kalori: kilo ya da mesafe yoksa kalori gösterilmez (tahmini bir sayı yazılmaz).
- Kuvvet hareketlerinin set girişinin yavaşlaması ya da görünümünün değişmesi.
- Eski seans belgelerinin, şablonların ya da yerel antrenman kayıtlarının okunamaz olması (yeni alanların hepsi isteğe bağlı).

## Kısıtlar

- Next.js 16 (bu repodaki sürüm; `node_modules/next/dist/docs`), React 19, valibot şemaları, Base UI; yeni bağımlılık yok.
- Prettier çalıştırılmaz (projede ayarı yok).
- Danışan metinleri "sen" ile; PT tarafı metinleri üçüncü şahıs ("PT/antrenör"), uygulama beyaz etiketli.
- Telefon önce: 375 px genişlikte yatay kaydırma yok.
- Antrenman ekranı çevrimdışı çalışır: hesap telefonda yapılır, sunucu yeni alanları şemada kabul eder.
- Sağlık verisi seans dosyasına girmez (`docs/SPEC.md` "Sağlık verisi seans dosyasına girmez"; beden ölçüleri sağlık verisidir,
  `health.json`'da yalnız onay sürdükçe durur ve okunur). Kilo ve ondan türeyen kalori seans dosyasına yazılmaz.

## Kararlar (benim kararım, kullanıcı tarifini onayladı)

### Hangi hareketler

- **Kardiyo hareketi**: süreyle izlenen (`trackingType: 'duration'`) ve deseni kardiyo olan (`pattern: 'cardio'`) hareket.
  Bunlarda hedefe ve sete **mesafe** eklenir.
- **Yürüyüş/koşu**: kardiyo hareketlerinin içinde, egzersiz kaydında yeni isteğe bağlı alanla işaretli olanlar:
  `locomotion: true` (adı builder değiştirebilir). Bunlarda ayrıca **eğim** ve **kalori** var. Kütüphanede Koşu Bandı
  (`kosu-bandi`) işaretli gelir; PT kendi hareketinde egzersiz formundaki bir anahtarla ("Yürüyüş/koşu: eğim ve kalori")
  işaretleyebilir. Anahtar yalnız kardiyo hareketinde görünür.
- Yeni bir `trackingType` eklenmez: `duration` her yerde zaten çalışıyor; kardiyo yalnız ek alan taşır.

### Veri

- **Şablon set hedefi** (`setSpecSchema`, `SetTarget`): isteğe bağlı `distanceM` (tam sayı, 1–100 000) ve `inclinePct`
  (0–30, 0,5 adım). Süre bugünkü `min`/`max` (saniye) aralığında kalır; mevcut aralıklar (ör. 5–10 dk, air bike sprint 20–45
  sn) olduğu gibi korunur, tek değere indirilmez.
- **Seans seti** (`sessionSetSchema`): isteğe bağlı `distanceM` (tam sayı, 0–100 000) ve `inclinePct` (0–30). `seconds`
  bugünkü gibi zorunlu süre. Kalori sete yazılmaz.
- **Kilo**: `health.json`'daki "Vücut ağırlığı" (`body_mass`) ölçümü, yalnız ölçüm onayı sürdükçe. Antrenmanda: günün kurulduğu
  anda en son ölçüm, `WorkoutDay`'e `bodyMassKg` olarak (`buildWorkoutDay`, `workout-routes.ts`). Geçmiş seansta: seansın
  tarihinde ya da öncesindeki son ölçüm (yoksa en eski ölçüm). Onay yoksa ya da ölçüm yoksa kilo yok, kalori gösterilmez.
- **Kalori kaydedilmez, gösterilirken hesaplanır**: set değerleri (süre, mesafe, eğim) seansta, kilo `health.json`'da; ekran
  ikisini birleştirir. Onay geri alınınca eski seanslarda da kalori görünmez.
- Yerel antrenman kaydı (`LocalWorkout`) ve taslaklar (`SetDraft`) mesafe ve eğimi de taşır (alanlar isteğe bağlı; eski kayıt
  okunur).

### Kalori hesabı (ACSM metabolik denklemleri)

- Hız `S` = mesafe (m) / süre (dk); eğim `G` = eğim % / 100.
- `S ≤ 100 m/dk` (≤ 6 km/sa): yürüme, `VO2 = 0,1·S + 1,8·S·G + 3,5` (ml/kg/dk).
- `S > 100 m/dk`: koşu, `VO2 = 0,2·S + 0,9·S·G + 3,5`.
- `kcal = VO2 × kilo / 1000 × 5 × süre (dk)`, tam sayıya yuvarlanır.
- Mesafe, süre ya da kilo yoksa (ya da 0 ise) kalori yok. Eğim yoksa 0 sayılır.
- Örnek: 3000 m / 30 dk, %5, 75 kg → S = 100, VO2 = 22,5 → ≈ 253 kcal.
- Saf işlev olarak `src/lib` altında, birim testleriyle.

### Ekranlar

- **PT editörü** (`src/components/block-editor/set-table.tsx`, hedef alanı): kardiyo satırında bugünkü süre aralığının yanına
  "Mesafe (m)", yürüyüş/koşuda ayrıca "Eğim (%)" kutuları gelir. Yürüyüş/koşu satırında süre aralığı dakikayla gösterilir ve
  girilir (saniyeye çevrilip `min`/`max`'a yazılır); diğer kardiyo satırları (ör. air bike sprint) bugünkü gibi saniye. Kardiyo
  satırında setler genelde tektir; çoklu set desteklenir (her set aynı alanları taşır).
- **Program/gün özetleri** (`formatSets`, PT ve danışan metinleri): "30 dk · 3000 m · %5".
- **Antrenman, set tablosu** (`set-row.tsx`, `exercise-card.tsx`): kardiyo satırının sütunları Set · Önceki · Süre · Mesafe ·
  (Eğim) · durum. Bekleyen satırda kutular, yapılmış satırda yerinde düzeltme (bugünkü kurallar).
- **Önceden dolu değerler** (kuvvet setlerindeki gibi): süre bugünkü kuralla; mesafe ve eğim hedeften, hedefte yoksa geçen
  seferin aynı setinden, o da yoksa boş. Danışan dokunmadan ✓'larsa set bu değerlerle yapılmış sayılır ("✓'larsa yapmış olsun"). Yapılmış yürüyüş/koşu setinde
  kalori satırın altında ya da "Önceki"nin yerinde görünür ("≈ 253 kcal"); yerleşim builder'ın.
- **Antrenman, giriş paneli** (`entry-panel.tsx`): süre stepper'ı ve sayacı kalır; altına mesafe (adım 100 m) ve yürüyüş/koşuda
  eğim (adım 0,5) stepper'ları eklenir. Panel küçültülebilir kalır.
- **Antrenman özeti** (`ozet/[id]`): o antrenmanın toplam kardiyo kalorisi > 0 ise ayrı bir değer olarak görünür.
- **PT'nin seans görünümü** ve set metinleri (`setValueText`, `previousText`): "30:00 · 3000 m · %5 · ≈ 253 kcal".
- Kilo yoksa yürüyüş/koşu kartında danışana kısa not: "Kalori, antrenörünün girdiği vücut ağırlığından hesaplanır." Danışan
  bugün ölçüm giremiyor (yalnız PT); bu iş danışana ölçüm girişi eklemez. Notun yeri builder'ın.

## Builder'a bırakılanlar

- Dosya bölümü, alan adları (`locomotion`, `distanceM`, `inclinePct`, `bodyMassKg` öneridir), testlerin yeri.
- 375 px'te kardiyo satırının ve panelin yerleşimi, adım büyüklükleri, kalori metninin yeri.
- Mesafeyi km olarak gösterme eşiği (ör. 1000 m üstü "3,0 km"); giriş metre kalır.
