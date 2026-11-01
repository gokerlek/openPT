# Faz 3 · Güne atanmış programlar — uygulama planı

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (ya da executing-plans) to implement this plan task-by-task.

**Goal:** Programın günleri ("Gün A", "Gün B"…) artık A → B → C dönmez: PT her programı (antrenmanı) haftanın
günlerine atar (Salı → "Alt vücut", Perşembe → "Üst vücut", Pazar → "Tüm vücut"). Bugün, bugüne atanmış programı
gösterir ("Salı · Alt vücut", Antrenmana başla); bu yalnız kolaylıktır, danışan her gün istediği programı yapar
("Başka program seç"). Atanmamış günde danışan programların listesinden seçer; öneri yok. Varsayılan adlar
"Program A", "Program B"… olur; "gün" sözcüğü yalnız hafta günleri için kalır. Danışanın kendi programında atamayı
danışan yapar.

**Architecture:** Atama günün (programın) alanıdır: `weekdays?: number[]` (ISO, 1 = Pazartesi … 7 = Pazar), evre
içinde geçerli; bir hafta günü evrede en çok bir programa atanır. Atama mantığı içe aktarmasız yeni bir saf modülde
(`src/lib/day-assignments.ts`): hem `program-plan.ts` hem `training-days.ts` okur, döngü olmaz. `schedule.weekdays`
kalır ama türetilmiş veridir: şu anki evrenin atamalarının birleşimi, her PT yazımında (kayıt, evre geçişi) ve her
kendi program yazımında yeniden yazılır; böylece onu okuyan her yer (kaçan gün penceresi, "Bu hafta x/y", Genel
bakış'ın dikkat listesi, deneme geçmişi) değişmeden çalışır. Eski dosyalar okunurken (`upgradeProgram`) atamaya
çevrilir; hiçbir okuma yazmaz. Dönüş (rotasyon) ilerlemez ve gösterilmez; `nextDayId`'nin yerine tek kural gelir:
`upcomingAssigned(program, today)` (bugüne atanmış, yoksa haftada sıradaki atanmış program). Seansın
`plannedDayId`'si antrenmanın gününe atanmış programdır; atanmamış günde yoktur, yanlış "başka gün" bildirimi
çıkmaz.

**Tech Stack:** Next.js 16 App Router (AGENTS.md: sürüm eğitim verisinden farklı; Next API'si kullanmadan önce
`node_modules/next/dist/docs/` okunur — yeni uç için `01-app/01-getting-started/15-route-handlers.md`), React 19,
TypeScript, valibot, Formisch, GitHub'da JSON (danışan başına repo, `program.json`, `own-programs/<id>.json`),
TanStack Query v5, Base UI + shadcn, Tailwind v4, ikonlar `@/components/line-icons` (orada yoksa dosyadaki mevcut
Phosphor kalıbı), Node'un test aracı.

**Kurallar**
- Testler `src/lib/*.test.ts`, göreli `.ts` importları; tek dosya:
  `node --test --experimental-strip-types --no-warnings src/lib/<dosya>.test.ts`. Her görevin sonunda `npm test`,
  `npm run typecheck`, `npm run lint` temiz. Bileşen testi yok (projede DOM test aracı yok); ekranlar yöneticinin
  tarayıcı turuyla doğrulanır.
- Saf mantık TDD: önce test (FAIL), sonra uygulama (PASS). Var olan testlerin beklentisi yalnız bu fazın değiştirdiği
  davranış için güncellenir (görev hangilerinin değiştiğini söyler); başka kırmızı test görevin hatasıdır.
- Uygulayıcı dev sunucusu başlatmaz, `npm run build` çalıştırmaz. Tarayıcı doğrulamasını yönetici (controller) yapar,
  yalnız Claude'un yerleşik tarayıcı panelinde; yalnız test danışanı `c_zmrbywaz` ("Test Gelişim"). Gerçek danışan
  `c_uc942qx6`'nın verisine hiçbir görev, test ya da tur yazmaz; eski biçimin okunması saf testlerle doğrulanır.
- Saklanan adlar hiçbir koşulda yeniden yazılmaz ("Gün A" seans anlık görüntülerinde, bildirimlerde, geçmişte durur);
  yalnız **yeni** varsayılanlar "Program A" olur. Test fikstürlerindeki "Gün A" adları da kalır.
- PT metinleri üçüncü kişi ("PT", "antrenör"; ürün beyaz etiket, PT genel), danışan metinleri "sen". Telefon önce
  (375 px), dokunma hedefi en az 44 px.
- Her commit `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` ile biter; push yok; commit'ler açık yollarla
  (`git commit -m … -- <dosyalar>`), başka ajanın dosyası süpürülmez.
- Kapsam dışı (sonraki faz ve sonrası): kardiyo hedefleri (mesafe, süre, eğim, kalori) bir sonraki faz; danışanın
  programları başka günlere taşıması (Karar 3); saklanan adların yeniden yazılması; eski tasarımdaki 3 adımlı PT
  oluşturma sihirbazı ve "Gelişmiş" bölümü; "bugün antrenman günün" web push hatırlatması.

**Paralellik ve sıra:** A (1 → 2 → 3 → 4 → 5) sırayla: `program-plan.ts`, `training-days.ts` ve test dosyaları
ortak. B: 6 → 7 sırayla (`workout-routes.ts` ve `workout-routes.test.ts` ortak), A'dan sonra; 8 yalnız yeni
dosyalara dokunur, 3'ten sonra ayrı worktree'de paralel olabilir. C: 9 → 10 sırayla (`program-form.tsx` ikisinde
de), 6'dan sonra (10, 6'nın dokunduğu PT sayfalarını değiştirir). D: 11 → 12 sırayla (`training-week.tsx`'in
dışa aktarımları), 6'dan sonra; 13 yalnız `src/app/me/antrenman/`, `workout-flow.ts` ve `workout-plan.ts`'teki bir tip alanına
dokunur, 6'dan sonra paralel olabilir (~2440 satırlık `workout-screen.tsx`'e bu fazda yalnız 13 dokunur); 14, 3 ve 9'dan sonra
(`WeekdayToggle`'ın `taken`'ı). E: 15, 6–14'ten sonra (ölü kodu siler); 16 en son. Aynı çalışma ağacında iki
uygulayıcı aynı dosyaya dokunmaz.

**Boyutlar:** S ≈ yarım saatlik iş, tek dosya ve testi · M ≈ 1–2 saat, birkaç dosya · L ≈ yarım gün, çok dosya.

---

## Kararlar

Kullanıcının kararları (kesin; yeniden açılmaz): (1) PT her programı hafta günlerine atar, danışan atamaz; kendi
programında yazar danışandır. (2) Bugün'de atanmış program kolaylıktır; her gün her program yapılabilir ("Başka
program seç"). (3) Atanmamış günde danışan programların listesinden seçer, öneri yok. (4) Pazartesi Alt vücut
yapıldıysa Salı yine Alt vücut önerilir; kaydırma yok. (5) Varsayılan adlar "Program A…", saklanan adlar değişmez.
(6) Geliştirmeye özel tohum ucu test danışanına üç programlı PT programını kurar.

Yöneticinin bu plan için verdiği kararlar:

1. **Veri.** Günün (programın) isteğe bağlı alanı `weekdays?: number[]` (ISO), yalnız kendi evresinde geçerli; bir
   hafta günü evrede en çok bir programa (şema denetler: "Aynı gün iki programa atanmış."). Bir program birden çok
   güne atanabilir (Tüm vücut hem Pazartesi hem Cuma). Boş dizi dosyaya yazılmaz (alan yok = atanmamış).
   `schedule.weekdays` = şu anki evrenin atamalarının birleşimi; PT kaydı, evre geçişi ve kendi programın her
   yazımı yeniden yazar, `schedule.at` yalnız birleşim değişince "şimdi" olur (kaçan gün penceresi). Hiç atama
   yoksa `schedule` yazılmaz ve haftalık hedef bugünkü gibi evrenin `daysPerWeek`'i. Atamalı evrede `daysPerWeek`
   kaydedilmez (sıklık atanmış gün sayısıdır; "Haftada kaç gün" seçicisi yalnız atamasız evrede görünür).
2. **Eski programlar okunurken atanır** (`upgradeProgram`, saf, testli). Hiçbir günde `weekdays` alanı yoksa ve
   `schedule.weekdays` doluysa her evrede programlar sırayla seçili günlere: A → ilk gün, B → ikinci… Hafta günü
   programdan fazlaysa **başa sarar** (3 program, Pzt-Çar-Cum-Cmt → A: Pzt + Cmt). Gerekçe: birleşim kayıttaki
   `schedule.weekdays`'in aynısı kalır; haftalık hedef, kaçan gün ve Genel bakış eski dosyada birebir aynı sonucu
   verir, PT'nin seçtiği sıklık korunur; atanmasız bırakmak seçili günleri "atanmamış güne" çevirirdi. Program
   günden fazlaysa sondakiler atanmasız kalır ("Başka program seç"ten yapılır; PT düzenleyicide "Gün atanmamış"
   görür). Hafta günü seçilmemişse atama yok, danışan her gün seçer. Türetme `clientSchedule`'a bakmaz (atayan PT).
   Hiçbir okuma yazmaz: dosya ancak PT kaydedince ya da evre geçişinde yeni biçime geçer; danışanın yazımları (bitiş,
   hedef güncelleme) PT dosyasını bugünkü gibi ham hâliyle korur. Eski sekme ve eski taslak (gün başına alan yok,
   program düzeyinde `weekdays` var) aynı kuralla atanır (`upgradeProgramBody`, `bodyWithAssignments`, taslağın
   `prepare`'i).
3. **`clientSchedule`.** Atamalı PT programında yok sayılır (`effectiveSchedule` atamalardan; danışan atamaz). PT'nin
   atamalı her yazımı kayıttaki katmanı siler ("Danışanın günleri kaldırıldı (…)" geçmişe). "Günlerini değiştir"
   (Bugün'deki şeritte ve Ayarlar'da) yalnız **atamasız PT programında** kalır: PT gün seçmemişse danışan hangi
   günler çalışacağını söyleyebilsin (şeritte ad yok, liste her gün). Kendi programda hiç yok: günler programın
   formunda (yazar danışan; Ayarlar "Düzenle"ye götürür). `/api/me/schedule` atamalı PT programında ve kendi
   programda 409 döner (eski telefon). PT'nin rozeti: atamalı programda "Danışan değiştirdi" rozeti ve "Programdaki
   günlere dön" yok; atamasız programda bugünkü gibi. Sonuç: danışan eskiden PT'nin günlerini kendi katmanıyla
   değiştirdiyse Bugün artık PT'nin günlerini izler (atayan PT).
4. **Dönüş (rotasyon) kalkar.** Bitiş dönüşü ilerletmez, seansa `rotation` yazılmaz, bitişteki "Sıradaki antrenman:
   … · Değiştir" seçimi kalkar. `rotation` (program) ve `ROTATION_CHOICES` (seans) şemada okunur kalır; eski telefonun
   gönderdiği `rotation` yok sayılır. `nextDayId`'nin yerine her yerde tek kural: **`upcomingAssigned(program,
   today)`** = bugüne atanmış program, yoksa bugünden sonraki ilk atanmış gün (en çok 6 gün ileri); atama yoksa null.
   PT ekranlarındaki "sıradaki", kısıt çakışmasının `next`'i (Dikkat maddesi), danışanın Programlar sekmesi bunu
   kullanır. Sunucunun varsayılan günü (`?day=` yok, yarım antrenman yok): `upcomingAssigned ?? evrenin ilk günü`
   (`defaultDayId`); yanıtın `program.nextDayId` alanı bu günle dolar (eski telefonun önbellek eşleşmesi bozulmasın).
   Bugün her zaman `?day=<id>` ile bağlar.
5. **`plannedDayId`** = antrenmanın gününe (`today`, yeni seansın tarihi) atanmış program; atanmamış günde yok. Bildirim
   (`other_day`) yalnız o gün atanmış program varken başkası yapılınca: "Alt vücut yerine Üst vücut yapıldı" (kalıp
   aynı, ad atamadan); rozet "başka program". Kendi programda bildirim yok (bugünkü gibi).
6. **Bugün kartı.** Bugüne atanmış program varsa kart onu gösterir ("Salı · Alt vücut", hareket önizlemesi, kısıt
   notları, Antrenmana başla → `/me/antrenman?day=<id>`, "Başka program seç"). Yoksa kart "Bugün atanmış program yok"
   ve programların listesi (her satırda özet, "son: 21 Eki" bilgi olarak, [Başla]). Hafta şeridinin durumları:
   yapıldı (oturumun adı), kaçtı (atanmış gün geçti, o gün antrenman yok), planlı (bugün ve ilerideki atanmış gün,
   atamanın adı), dinlenme. "Sırada" durumu ve şeridin altındaki "Sırada: …" satırı kalkar: kartın başlığı bugünü
   söyler, "Haftanın programı" haftayı. "Sonraki günler · Günler sırayla döner" kartı "Haftanın programı" olur
   (hafta günü → program; atanmamış programlar tek satırda).
7. **Adlar.** Yeni varsayılan "Program A…" (`nextDayName`; harf "Gün X" ya da "Program X" ile alınmışsa atlanır:
   "Gün A", "Gün B" olan programa eklenen "Program C" olur). Şeridin kısa adı iki öneki de tanır ("Program A" → "A",
   "Gün A" → "A"). Saklanan adlar değişmez. **Risk:** "program" aynı zamanda bütün plan (Program sekmesi, "Antrenörünün
   programı", program çipi, "Programını güncelleyelim mi?"); "Başka program seç" Bugün'ün program çipiyle (PT'nin
   programı ↔ kendi program) karıştırılabilir. Kullanıcı bu adı seçti; karışıklığı azaltmak için PT düzenleyicinin
   kartı "Haftalık plan", programı silen menü öğesi "Kaldır" olur, sayfa başlıkları bütün planı söylemeye devam eder.
8. **PT düzenleyici.** Seçili programın kartında 7 gün çipi ("Günleri"): başka programa atanmış gün kapalıdır, nedeni
   çipin erişilebilir adında ve altındaki satırda ("Başka programda: Per · Üst vücut"). Program düzeyindeki gün
   seçici kalkar; yerinde salt okunur özet ("Haftanın planı: Sal · Alt vücut, Per · Üst vücut, Paz · Tüm vücut").
   Evreli programda atama evre başına; "Evreyi kopyala" atamaları korur, "Kopyala" (aynı evrede) ve "Evreye taşı"
   atamasız bırakır, "Evreleri kaldır" yalnız şu anki evrenin atamalarını tutar; evre geçişi yeni evrenin
   atamalarını `schedule`'a yazar. Programın kas yükü (haftalık) atamalardan: her programın yükü × atandığı gün sayısı.
9. **Kendi programlar.** Aynı çipler `own-program-form`'da (danışan ve PT'nin `own-pt` kipi); program düzeyindeki
   seçici kalkar; "Gün atamazsan haftada kaç gün" yalnız hiç atama yokken. `schedule` her yazımda birleşimden;
   index'in `weekdays`'i dosyadan türediği için kendiliğinden uyumlu (`ownIndexItemOf`). `baseWeekdays` şemada
   kalır, yok sayılır (Bugün artık kendi programın günlerini değiştirmez).
10. **AI taslakları.** Koç ve asistan motorları programları "Program A…" adlandırır ve gün başına bir program
    taslağını o güne atar (`weekdays: [gün]`); program düzeyindeki `weekdays` uyum için kalır.
11. **Deneme geçmişi** (`demo-history.ts`): tarihler atanmış günlere düşer, her tarihin programı o günün ataması;
    atamasız programda bugünkü takvim (seçili gün ya da sıklık dağılımı) ve sırayla programlar (dönüş programa
    yazılmadan).
12. **Tohum ucu.** `POST /api/dev/seed-program { clientId }`: `seed-history` gibi kapılı (üretimde 404, PT oturumu ve
    adı "Test " ile başlayan danışan, `originGuard`). Danışanın `program.json`'unu taze kayıtla (revision 1) **değiştirir**:
    `clientSchedule`, `clientTargets` ve `rotation` gider. Gerçek danışana ad kapısı yüzünden yazamaz; yönetici yalnız
    `c_zmrbywaz` ile çağırır.
13. **Eski tasarım.** `docs/plans/2026-10-26-kullanilabilirlik-yeniden-duzen-design.md` "Faz 3"ünün (110–135)
    "Danışan bir antrenmanı başka güne taşıyabilir; PT 'Danışan değiştirdi' olarak görür" maddesi Karar 1 ile
    **geçersiz**; "ayrı 'Haftada kaç gün' alanı kalkar" maddesi yumuşadı (atamasız evrede kalır); "hiç gün
    seçilmemişse sıklığa göre varsayılan dağılım" yapılmadı (danışan seçer); 3 adımlı oluşturma bu fazda yok. 16.
    görev bu satırları günceller.

### Metin tablosu

| Yer | Eski | Yeni |
|---|---|---|
| Bugün, atanmış gün | başlık "Çarşamba · Gün B" (dönüşten) | "Salı · Alt vücut" (bugünün adı · atanan program) |
| Bugün, atanmamış gün | — | başlık "Bugün atanmış program yok", açıklama "Yapmak istediğin programı seç."; programda hiç atama yoksa başlık "Bugün hangi programı yapacaksın?" |
| Bugün liste satırı | — | ad · "6 hareket · ≈ 50 dk" · "son: 21 Eki" ya da "henüz yapılmadı" · [Başla] (erişilebilir ad "Başla: Alt vücut") |
| Bugün ikincil düğme | "Başka gün seç" | "Başka program seç" |
| Seçim sheet'i başlığı | "Hangi günü yapacaksın?" | "Hangi programı yapacaksın?" |
| Sheet açıklaması | "Antrenörüne bildirilir. Sıra seçtiğin günden devam eder." / kendi: "Sıra seçtiğin günden devam eder." | PT ve bugün atanmışsa "Bugün Alt vücut planlı; başka birini seçersen antrenörüne bildirilir."; öteki hâllerde "Bugün için bir program seç." |
| Sheet satırı | "sıradaki" · "son: 22 Eyl" · "henüz yapılmadı" | "bugün" ya da atandığı günler ("Perşembe") · "son: 23 Eki" / "henüz yapılmadı" |
| Sheet düğmesi | "Bu günle başla" | "Bu programla başla" |
| Sonraki günler kartı | "Sonraki günler" · "Günler sırayla döner." | "Haftanın programı"; satır "Salı · Alt vücut", "6 hareket · ≈ 50 dk", bugünün satırında "bugün" rozeti; sonda "Gün atanmamış: Program D" |
| Şerit, ekran okuyucu | "Çarşamba, bugün, sırada: Gün B" | "Salı, bugün, antrenman günü: Alt vücut" · "Pazartesi, yapıldı: Üst vücut" · "Salı, kaçtı: Alt vücut" · "Çarşamba, dinlenme" |
| Şeridin altı | "Sırada: yarın · Gün B" | kalkar |
| Günlerini değiştir | Bugün ve Ayarlar | yalnız atamasız PT programında |
| Ayarlar "Antrenman günleri" | "Sal, Per, Cmt (antrenörünün seçimi)" · [Değiştir] | PT atamalı: "Sal · Alt vücut, Per · Üst vücut, Paz · Tüm vücut" + "Günleri antrenörün belirliyor." (düğme yok); kendi: programın adı + atamalar (yoksa "Henüz gün atanmadı.") + [Düzenle] bağlantısı; atamasız PT: bugünkü gibi |
| Antrenman ekranı bildirimi | "Gün B seçildi" · "Antrenörüne bildirilecek" | "Üst vücut seçildi" · "Bugün Alt vücut planlıydı; antrenörüne bildirilecek." |
| Bitiş sheet'i | "Sıradaki antrenman: Gün B · Değiştir" | kalkar |
| PT bildirimi | "Gün A yerine Gün B yapıldı" / "Başka gün seçildi: Gün B" | "Alt vücut yerine Üst vücut yapıldı" (kalıp aynı) / "Başka program seçildi: Üst vücut" |
| Bildirim türü | "Başka gün" | "Başka program" |
| Rozetler (Geçmiş, PT'nin antrenman listesi) | "başka gün" | "başka program" |
| PT antrenman işareti | "başka gün seçildi" | "başka program seçildi" |
| Bildirimler kartı boş metni | "Danışan başka gün seçtiğinde, …" | "Danışan bugünün programı yerine başka birini yaptığında, …" |
| Schedule ucu (409) | — | PT atamalı: "Günlerini antrenörün belirliyor."; kendi: "Günleri programını düzenlerken seç." |
| PT düzenleyici ad alanı | "Gün adı" · "Ör. Gün A" | "Program adı" · "Ör. Alt vücut" |
| PT çip menüsü | "+ Gün" · "Boş gün" · "Şablondan…" · "Seçili günün kopyası" | "+ Program" · "Boş program" · "Şablondan…" · "Seçili programın kopyası" |
| PT program menüsü | "Gün işlemleri: X" · "Günü sil" | "Program işlemleri: X" · "Kaldır" |
| PT program kartı alt başlığı | "Programın 2. günü · danışanın sıradaki günü" | atandığı günler "Salı, Perşembe" ya da "Gün atanmadı" |
| PT gün çipleri | — | etiket "Günleri"; açıklama "Danışan bu günlerde Bugün'de bu programı görür." ya da "Başka programda: Per · Üst vücut, Paz · Tüm vücut" |
| PT evresiz kart | "Günler" · "Günler sırayla döner (A → B → C); sıradaki gün işaretli. …" | "Haftalık plan" · "Her programı haftanın günlerine ata; danışan o gün Bugün'de onu görür, istediği gün başka birini de yapabilir. Uyum, güç gibi dönemler istersen programı evrelere böl." |
| PT evreler kartı | "Her evrenin günleri sırayla döner; …" | "Her evrenin programları kendi günlerine atanır; süre dolunca sonraki evreye geçmeyi önerir. Programı başka evreye menüsünden taşırsın." |
| PT program düzeyi gün alanı | "Antrenman günleri" (seçici) | "Haftanın planı: …" (salt okuma) ya da "Henüz gün atanmadı."; atanmamışlar varsa "Gün atanmamış: Program D" |
| PT şema hataları | "Gün adı gir." · "Güne en az bir hareket ekle." · "Bu evrede aynı adda iki gün var." · "Evrede en az bir gün olmalı." · "Bir evrede en fazla 7 gün olur." | "Program adı gir." · "Programa en az bir hareket ekle." · "Bu evrede aynı adda iki program var." · "Evrede en az bir program olmalı." · "Bir evrede en fazla 7 program olur." · yeni "Aynı gün iki programa atanmış." |
| Program geçmişi | — | kapsam programın adı: "Günleri: Per → Per, Cum" · "Günleri: yok → Sal" |
| PT program sayfası, Genel bakış kartı | "sıradaki gün" | "Bugün · Alt vücut" ya da "Sıradaki: Perşembe · Üst vücut"; program kartlarında "Sal" |
| Kas yükü kartı | "haftada N gün, M günlük döngü → her gün haftada F kez" | atamalıda "Planlanan haftalık yük atanmış günlere göre (Sal, Per, Paz)." |
| Danışanın Programlar sekmesi | "sıradaki" · "Sıradaki: Gün B" | "Salı · bugün" / "Perşembe" · "Bugün: Alt vücut" ya da "Sıradaki: Perşembe · Üst vücut" |
| Program satırı (`programLine`) | "2 gün · haftada 2 · Sal, Per" · "gün seçilmedi" | "2 program · haftada 2 · Sal, Per" · "gün atanmadı" |
| Kendi program formu | "Gün adı" · "+ Gün" · "Gün ekle" · "Boş gün" · "Bu programdaki bir günü kopyala" · "Günü sil" · program düzeyinde "Antrenman günleri" | "Program adı" · "+ Program" · "Program ekle" · "Boş program" · "Bu programdakilerden kopyala" · "Kaldır" · seçili programda "Günleri" |

---

## A · Saf mantık

### Task 1: Atama yardımcıları (`day-assignments.ts`)

**Boyut:** S · **Files:** Create `src/lib/day-assignments.ts`, Test `src/lib/day-assignments.test.ts`

Modül hiçbir şey içe aktarmaz (program-plan ve training-days ikisi de okuyacak; döngü olmasın). Yapısal tipler.

**Step 1: Test**

```ts
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assignWeekdays,
  cleanWeekdays,
  dayOnWeekday,
  deriveAssignments,
  hasAssignmentField,
  hasAssignments,
  phaseWeekdays,
  takenWeekdays,
  upgradeAssignments,
  weekAssignments,
  weekdayConflicts,
  weekdayNames,
} from './day-assignments.ts';

const plan = [
  { id: 'd_aaaaaa', name: 'Alt vücut', weekdays: [2] },
  { id: 'd_bbbbbb', name: 'Üst vücut', weekdays: [4] },
  { id: 'd_cccccc', name: 'Tüm vücut', weekdays: [7] },
];
const IDS = ['d_aaaaaa', 'd_bbbbbb', 'd_cccccc', 'd_dddddd'];
const bare = (n: number) => IDS.slice(0, n).map((id, index) => ({ id, name: `Gün ${'ABCD'.charAt(index)}` }));

describe('hafta günü atamaları', () => {
  test('birleşim, o günün programı, haftanın sırası', () => {
    assert.deepEqual(phaseWeekdays(plan), [2, 4, 7]);
    assert.equal(hasAssignments(plan), true);
    assert.equal(hasAssignments(bare(2)), false);
    assert.equal(dayOnWeekday(plan, 4)?.name, 'Üst vücut');
    assert.equal(dayOnWeekday(plan, 1), null);
    assert.deepEqual(weekAssignments(plan).map(({ weekday, day }) => [weekday, day.name]), [[2, 'Alt vücut'], [4, 'Üst vücut'], [7, 'Tüm vücut']]);
    assert.deepEqual(weekdayNames(plan), { 2: 'Alt vücut', 4: 'Üst vücut', 7: 'Tüm vücut' });
    assert.deepEqual(cleanWeekdays([7, 2, 2, 0, 8, 1.5, '3']), [2, 7]);
  });

  test('çakışan gün ve başka programın günleri', () => {
    assert.deepEqual(weekdayConflicts([...plan, { id: 'd_dddddd', name: 'Kardiyo', weekdays: [4, 5] }]), [4]);
    assert.deepEqual([...takenWeekdays(plan, 'd_aaaaaa')], [[4, 'Üst vücut'], [7, 'Tüm vücut']]);
  });

  test('atama: başka programın günü alınmaz; değişmezse aynı dizi; boş atama alanı tutar', () => {
    assert.deepEqual(assignWeekdays(plan, 'd_aaaaaa', [5, 2, 4])[0]?.weekdays, [2, 5]);
    assert.equal(assignWeekdays(plan, 'd_aaaaaa', [2]), plan);
    assert.deepEqual(assignWeekdays(plan, 'd_aaaaaa', [])[0]?.weekdays, []);
  });

  test('eski program: sırayla; fazla gün başa sarar; fazla program atanmasız', () => {
    assert.deepEqual(deriveAssignments(bare(3), [2, 4, 7]).map((day) => day.weekdays), [[2], [4], [7]]);
    assert.deepEqual(deriveAssignments(bare(3), [6, 1, 3, 5]).map((day) => day.weekdays), [[1, 6], [3], [5]]);
    const more = deriveAssignments(bare(4), [2, 4]);
    assert.deepEqual(more.map((day) => day.weekdays), [[2], [4], undefined, undefined]);
    assert.equal('weekdays' in (more[2] ?? {}), false);
    const days = bare(2);
    assert.equal(deriveAssignments(days, []), days);
  });

  test('okurken: alan hiç yoksa her evre türetilir; varsa, gün yoksa ya da veri bozuksa dokunulmaz', () => {
    const raw = [{ id: 'p_aaaaaa', days: bare(2) }, { id: 'p_bbbbbb', days: bare(3) }];
    const upgraded = upgradeAssignments(raw, [1, 3, 5]) as { days: { weekdays?: number[] }[] }[];
    assert.deepEqual(upgraded.map((phase) => phase.days.map((day) => day.weekdays)), [[[1, 5], [3]], [[1], [3], [5]]]);
    assert.equal(hasAssignmentField(upgraded), true);
    assert.equal(hasAssignmentField(raw), false);
    assert.equal(upgradeAssignments(upgraded, [2]), upgraded);
    assert.equal(upgradeAssignments(raw, undefined), raw);
    assert.equal(upgradeAssignments(raw, 'Pzt'), raw);
    assert.equal(upgradeAssignments(raw, []), raw);
    const odd = [{ id: 'p_aaaaaa', days: 'bozuk' }, null];
    assert.deepEqual(upgradeAssignments(odd, [1]), odd);
  });
});
```

**Step 2:** Çalıştır → FAIL (modül yok).

**Step 3: Uygula**

```ts
/**
 * Programların hafta günlerine atanması (Faz 3) — saf, içe aktarmasız (`program-plan.ts` ve `training-days.ts`
 * ikisi de okur). Evrenin her programı (günü) bir ya da birkaç ISO hafta gününe atanır (1 = Pazartesi … 7 = Pazar);
 * bir hafta günü evrede en çok bir programa. `weekdays` alanı yoksa program atanmamış; boş dizi düzenleyicide
 * "PT bütün günleri kaldırdı" demektir, dosyaya yazılmaz.
 */
export type AssignableDay = { id: string; name: string; weekdays?: readonly number[] | undefined };

export function cleanWeekdays(list: readonly unknown[] | undefined): number[];
export function phaseWeekdays(days: readonly AssignableDay[]): number[];
export function hasAssignments(days: readonly AssignableDay[]): boolean;
/** O hafta gününe atanmış program; yoksa null (bozuk kayıtta iki program varsa ilki). */
export function dayOnWeekday<D extends AssignableDay>(days: readonly D[], weekday: number): D | null;
/** Pazartesiden pazara hafta günü → program (iki güne atanan iki kez). */
export function weekAssignments<D extends AssignableDay>(days: readonly D[]): { weekday: number; day: D }[];
/** Hafta günü → programın adı (şerit). */
export function weekdayNames(days: readonly AssignableDay[]): Partial<Record<number, string>>;
/** Evrede iki programa atanmış hafta günleri, sıralı (temiz evrede boş; şemanın denetimi). */
export function weekdayConflicts(days: readonly AssignableDay[]): number[];
/** Bu programın dışında atanmış günler → sahibinin adı, pazartesiden sıralı: düzenleyicide kapalı çipler. */
export function takenWeekdays(days: readonly AssignableDay[], dayId: string): Map<number, string>;
/** Programın günlerini yazar (temizlenmiş; başka programın günleri atılır). Değişmediyse aynı dizi. */
export function assignWeekdays<D extends AssignableDay>(days: readonly D[], dayId: string, weekdays: readonly number[]): D[];
/**
 * Eski programın ataması (gün başına alan yokken): programlar sırayla seçili günlere (A → ilk gün, B → ikinci…).
 * Gün programdan fazlaysa başa sarar: birleşim seçili günlerin aynısı kalır, haftalık hedef ve kaçan gün eskisi
 * gibi. Program günden fazlaysa sondakiler atanmasız (alan yok). Gün yoksa aynı dizi.
 */
export function deriveAssignments<D extends AssignableDay>(days: readonly D[], weekdays: readonly number[]): D[];
/** Ham evrelerde herhangi bir günde `weekdays` anahtarı var mı (varsa yeni biçim; türetme yok). */
export function hasAssignmentField(phases: unknown): boolean;
/**
 * Okurken ve eski gövdede: hiçbir günde alan yoksa ve `weekdays` geçerli, boş olmayan bir günler listesiyse her
 * evrenin günleri `deriveAssignments`'tan geçer. Ham veride hoşgörülü (dizi olmayan evre ya da gün olduğu gibi
 * kalır, şema düşürür). Türetme yoksa girdi aynen döner (aynı başvuru).
 */
export function upgradeAssignments(phases: unknown, weekdays: unknown): unknown;
```

`deriveAssignments`'ın çekirdeği:

```ts
const selected = cleanWeekdays(weekdays);
if (selected.length === 0 || days.length === 0) return days as D[];
const byIndex = new Map<number, number[]>();
selected.forEach((weekday, index) => {
  const at = index % days.length;
  byIndex.set(at, [...(byIndex.get(at) ?? []), weekday]);
});
return days.map((day, index) => {
  const assigned = byIndex.get(index);
  return assigned ? { ...day, weekdays: assigned } : day;
});
```

**Step 4:** PASS.

typecheck, lint, test · Commit: `feat(program): weekday assignment helpers`

---

### Task 2: Şema, okuma ve düzenleyici işlemleri

**Boyut:** M · **Files:** Modify `src/lib/schemas/program.ts`, `src/lib/schemas/own-program.ts`,
`src/lib/program-plan.ts` · Test `src/lib/program-plan.test.ts` (şema testleri hangi dosyadaysa orada; yoksa
`program-plan.test.ts`)

**Step 1: Test** (fikstür: `programFile` — `src/lib/testing/session-fixtures.ts`; "Gün A", "Gün B", sabitleri
`PHASE`, `DAY_A`, `DAY_B` dosyadan doğrulanır)

```ts
describe('Faz 3: atamalar', () => {
  test('eski dosya okunurken atanır (başa sararak); ikinci okuma aynı; schedule aynen', () => {
    const parsed = v.parse(programSchema, programFile({}, { schedule: { weekdays: [1, 3, 5] } }));
    assert.deepEqual(parsed.phases[0]?.days.map((day) => day.weekdays), [[1, 5], [3]]);
    assert.deepEqual(v.parse(programSchema, parsed), parsed);
    assert.deepEqual(parsed.schedule?.weekdays, [1, 3, 5]);
  });

  test('gün seçilmemiş eski dosya atanmaz', () => {
    const parsed = v.parse(programSchema, programFile());
    assert.equal(parsed.phases[0]?.days.some((day) => 'weekdays' in day), false);
  });

  test('aynı gün iki programda: dosya okunmaz', () => {
    const raw = programFile();
    const phases = raw.phases.map((phase) => ({ ...phase, days: phase.days.map((day, index) => ({ ...day, weekdays: index === 0 ? [2] : [2, 4] })) }));
    const result = v.safeParse(programSchema, { ...raw, phases });
    assert.equal(result.success, false);
    assert.equal(result.issues?.[0]?.message, 'Aynı gün iki programa atanmış.');
  });

  test('eski sekmenin gövdesi: program düzeyindeki günler atanır', () => {
    const body = v.parse(programSaveSchema, { ...bodyOf(programFile()), weekdays: [2, 4], baseRevision: 7 });
    assert.deepEqual(body.phases[0]?.days.map((day) => day.weekdays), [[2], [4]]);
  });

  test('normalizeProgram: atama sıralı kalır, boşu yazılmaz; atamalı evrede sıklık düşer', () => {
    // A: [4, 2], B: [] ve evrede daysPerWeek: 3 → A: [2, 4], B alansız, evrede daysPerWeek yok
  });

  test('kopya, taşıma, birleştirme', () => {
    // copyDay → yeni günde weekdays yok; copyPhase → günler aynı weekdays;
    // moveDayToPhase → taşınan gün alansız; mergePhases → yalnız şu anki evrenin günleri atamalı kalır
  });

  test('haftalık kas yükü atamalardan: yük × atanan gün sayısı', () => {
    // A (iki güne atanmış) ve B (bir güne): weekly = 2 × A + 1 × B; factor null; assigned [..birleşim]
    // atamasız evre bugünkü gibi (daysPerWeek ÷ gün sayısı)
  });
});
```

(`bodyOf`: testte `{ phased, currentPhaseId: current.phaseId, phases }` kuran küçük yardımcı; dosyada benzeri
varsa o kullanılır. Yorumlu testler uygulayıcı tarafından dosyanın mevcut yardımcılarıyla somut yazılır; beklenen
değerler yorumdaki gibidir.)

**Step 2:** FAIL.

**Step 3: Uygula**

- `schemas/program.ts`: `weekdaysSchema` `programDaySchema`'nın üstüne taşınır. Gün şeması (alan sırası id, name,
  weekdays, blocks, source: `normalizeProgram` ve JSON karşılaştırmaları aynı sırayı kullanır):

```ts
export const programDaySchema = v.object({
  id: dayIdSchema,
  name: v.pipe(v.string('Program adı gir.'), v.trim(), v.minLength(1, 'Program adı gir.'), v.maxLength(L.dayName, `En fazla ${L.dayName} karakter.`)),
  /** Programın atandığı hafta günleri (Faz 3; ISO, 1 = Pazartesi); yoksa atanmamış. Evrede bir gün en çok bir programa. */
  weekdays: v.optional(weekdaysSchema),
  blocks: dayBlocksSchema,
  source: v.optional(daySourceSchema),
});
```

  Evrenin `days` borusuna `v.check((days) => weekdayConflicts(days).length === 0, 'Aynı gün iki programa atanmış.')`;
  metin tablosundaki şema hataları ("Program adı gir." …). `weekdaysSchema`'nın belge yorumu: "Program günlere
  atanır (Faz 3); `schedule.weekdays` şu anki evrenin atamalarının birleşimi". `programSchema`'daki `schedule`,
  `clientSchedule`, `rotation` yorumları Kararlar 1, 3, 4'e göre güncellenir.
- `schemas/own-program.ts`: `ownProgramDaySchema`'ya aynı `weekdays` (aynı sırada), evrenin `days` borusuna aynı
  denetim, metinler. Dosya başı yorumunda "Günler 1–7" → "Programlar 1–7, hafta günlerine atanır".
- `program-plan.ts`:
  - `ProgramDay` tipine `weekdays?: number[]`; dosya başı yorumu "Günler sırayla döner" → atama (Karar 1, 4).
  - `upgradeProgram`: `const phases = upgradeAssignments(upgradePhases(raw.phases), isRecord(raw.schedule) ?
    raw.schedule.weekdays : undefined)`; `upgradeProgramBody`: `upgradeAssignments(upgradePhases(raw.phases),
    raw.weekdays)`.
  - Yeni `bodyWithAssignments(body: ProgramBody): ProgramBody` (gövdenin tiplisi; aynı kural, `upgradeAssignments`
    ile): şema dışından gelen gövdeler için (AI yayını, `saveProgram`'ın ilk satırı 3. görevde).
  - `normalizeProgram`: gün `...(cleanWeekdays(day.weekdays).length > 0 ? { weekdays: cleanWeekdays(day.weekdays) } : {})`
    (name'den sonra); evre `daysPerWeek` yalnız `!hasAssignments(phase.days)` iken.
  - `copyPhase`: günler `weekdays`'i taşır (yeni evre, çakışma yok). `copyDay`: zaten taşımıyor (test sabitler).
    `moveDayToPhase`: taşınan günden `weekdays` atılır. `mergePhases`: şu anki evrenin dışından gelen günlerden
    `weekdays` atılır (yorum: "yalnız şu anki evrenin atamaları kalır").
  - `phaseMuscleLoad`: dönüş tipine `assigned: number[]`; evrede atama varsa `weekly` = günlerin yükü × atandığı gün
    sayısı toplamı (`templateMuscleLoad({ blocks: day.blocks })` gün gün, `scaleLoad` ile), `factor: null`; yoksa
    bugünkü hesap, `assigned: []`.
- Var olan testler: `schedule`'lı fikstürlerin okunmuş günleri artık `weekdays` taşır; yalnız bu fark için
  beklentiler güncellenir (`workout-routes.test.ts`, `program-diff.test.ts` vb. `npm test` gösterir).

**Step 4:** PASS.

typecheck, lint, test · Commit: `feat(program): per-workout weekdays in the schema; derive old programs on read`

---

### Task 3: Yazımlar: PT kaydı, evre geçişi, kendi program

**Boyut:** M · **Files:** Modify `src/lib/program-plan.ts`, `src/lib/program-diff.ts`, `src/lib/training-days.ts`
(`ptScheduleEdit`), `src/lib/programs.ts` (`saveProgram`), `src/lib/own-programs.ts`, `src/lib/own-program-files.ts`
(çağıran) · Test `src/lib/program-diff.test.ts`, `src/lib/program-plan.test.ts`, `src/lib/own-programs.test.ts`

**Step 1: Test**

```ts
// program-diff.test.ts — eski dosya Sal, Per → A: [2], B: [4]
test('atama değişince birleşim yazılır, satırlar geçmişe', () => {
  const stored = v.parse(programSchema, programFile({}, { schedule: { weekdays: [2, 4] } }));
  const phases = stored.phases.map((phase) => ({ ...phase, days: assignWeekdays(phase.days, DAY_B, [4, 5]) }));
  const result = applyProgramEdit(stored, { phased: false, currentPhaseId: PHASE, phases }, ctx, NOW);
  assert.deepEqual(result?.program.schedule, { weekdays: [2, 4, 5], at: NOW.toISOString() });
  assert.deepEqual(
    result?.changes.map((change) => [change.scope ?? null, change.text]),
    [['Gün B', 'Günleri: Per → Per, Cum'], [null, 'Antrenman günleri: Sal, Per → Sal, Per, Cum']],
  );
});

test('değişmeyen eski program: kayıt yok (okurken türetilen atama fark sayılmaz)', () => {
  const stored = v.parse(programSchema, programFile({}, { schedule: { weekdays: [2, 4] } }));
  assert.equal(applyProgramEdit(stored, { phased: false, currentPhaseId: PHASE, phases: stored.phases }, ctx, NOW), null);
});

test('atamalı kayıtta danışanın katmanı düşer; bütün atamalar kalkınca schedule düşer', () => {
  // clientSchedule: { weekdays: [1, 3], at } olan dosya, başka bir değişiklikle kayıt →
  //   program.clientSchedule yok, changes'te 'Danışanın günleri kaldırıldı (Pzt, Çar)'
  // A ve B'den bütün günler kaldırılınca → program.schedule yok, 'Antrenman günleri kaldırıldı (önce Sal, Per)'
});

// program-plan.test.ts
test('bodyWithAssignments: eski gövde atanır, yeni gövdeye dokunulmaz', () => { /* … */ });
test('createProgramRecord: schedule şu anki evrenin birleşimi', () => { /* A: [2], B: [4] → schedule { weekdays: [2, 4] } */ });
test('evre geçişi: yeni evrenin birleşimi; atama yoksa schedule düşer; katman silinir', () => {
  // evre 1: A [1, 3]; evre 2: X [2], Y [4] → startPhase(evre 2) → schedule { weekdays: [2, 4], at: şimdi }, clientSchedule yok
  // atamasız evreye geçiş → schedule yok
});

// own-programs.test.ts
test('kendi program: oluşturma ve kayıt birleşimi yazar; atamada sıklık düşer', () => {
  // createOwnProgram({ phases: [A: [1], B: [5]], daysPerWeek: 3 }) → schedule.weekdays [1, 5], daysPerWeek yok
  // applyOwnEdit: B'nin günü [5] → [6] → schedule.weekdays [1, 6], log'da 'Günleri: Cum → Cmt'
});
```

**Step 2:** FAIL.

**Step 3: Uygula**

- `training-days.ts` `ptScheduleEdit(stored, weekdays: readonly number[], at, options: { assigned: boolean })`:
  `weekdays` artık hep verilir (birleşim). Birleşim değiştiyse bugünkü gibi (`schedule` yazılır ya da düşer, katman
  silinir, cümleler). Değişmediyse `schedule` aynen; `options.assigned` ve kayıtta katman varsa katman yine silinir
  ve "Danışanın günleri kaldırıldı (…)" yazılır. Belge yorumu güncellenir.
- `program-diff.ts`:
  - `diffProgram`'ın 2. adımında, adı değişen günün satırından sonra: önceki ve yeni `weekdays` farklıysa
    `push(\`Günleri: ${weekdaysText(prev) || 'yok'} → ${weekdaysText(next) || 'yok'}\`, dayScope(phase, day))`.
    Yeni eklenen günde ayrıca yazılmaz ("… eklendi" yeter).
  - `applyProgramEdit`: `input.weekdays` artık okunmaz.

```ts
const current = phases.find((phase) => phase.id === body.currentPhaseId) ?? phases[0];
const assigned = phases.some((phase) => hasAssignments(phase.days));
const schedule = ptScheduleEdit(stored, phaseWeekdays(current?.days ?? []), at, { assigned });
```

  Belge yorumu: "Antrenman günleri gövdeden değil atamalardan (Faz 3): `schedule` şu anki evrenin birleşimi;
  atamalı programda danışanın katmanı silinir."
- `program-plan.ts`:
  - `createProgramRecord`: `schedule` = şu anki evrenin `phaseWeekdays`'i (boşsa alan yok); `body.weekdays` okunmaz.
  - `startPhase`: hedef evrenin birleşimi; öncekinden farklıysa `schedule: { weekdays, at }`, aynıysa kayıttaki,
    boşsa alan yok; programda atama varsa `clientSchedule` düşer. Geçmiş kaydı bugünkü tek cümle (gün cümlesi yok:
    `program-plan.ts` `training-days.ts`'i içe aktaramaz). Belge yorumu "rotasyon onun ilk gününden" cümlesi düşer.
- `programs.ts` `saveProgram`: ilk satırda `body = bodyWithAssignments(body)` (AI yayını şemadan geçmez).
- `own-programs.ts`:
  - `createOwnProgram`: `weekdays` girdisi kalkar; `schedule` = `phaseWeekdays(phases[0].days)`;
    `settleFrequency(phases, union)`. Çağıran `own-program-files.ts:253` güncellenir.
  - `applyOwnEdit`: `sent`/`baseWeekdays` mantığı kalkar; birleşim `phaseWeekdays(body.phases[0].days)`;
    `settleFrequency(…, union)`; `applyProgramEdit` birleşimi kendi hesaplar (gövdeye `weekdays` geçilmez).
    Belge yorumundaki "günler açılıştakiyle aynıysa kayıttakine dokunulmaz" cümlesi Karar 9'a göre değişir.
  - `sameOwnBody`: ayrı gün karşılaştırması kalkar (atamalar günlerin içinde, `strip` zaten karşılaştırır).
  - `ownSummaryOf`: değişmez (dosyanın `schedule`'ı birleşim).
- Var olan `weekdays` testleri (program-diff, own-programs) gün başına atamaya çevrilir; yalnız bu fark.

**Step 4:** PASS.

typecheck, lint, test · Commit: `feat(program): writes keep the schedule as the union of assignments`

---

### Task 4: Hafta ve bugün mantığı (`training-days.ts`)

**Boyut:** M · **Files:** Modify `src/lib/training-days.ts` · Test `src/lib/training-days.test.ts`

Eski işlevler (`weekPlan`, `weekRotation`, `todayCardTitle`, `todayState`, `nextTrainingDate`) bu görevde
**silinmez**: tüketenleri sonraki görevlerde yeni işlevlere geçer, 15. görev siler (her görevde derleme yeşil kalır).

**Step 1: Test** (26 Ekim 2026 pazartesi)

```ts
describe('Faz 3: atamalı hafta', () => {
  const phase = {
    id: 'p_aaaaaa',
    days: [
      { id: 'd_aaaaaa', name: 'Alt vücut', weekdays: [2] },
      { id: 'd_bbbbbb', name: 'Üst vücut', weekdays: [4] },
      { id: 'd_cccccc', name: 'Tüm vücut', weekdays: [7] },
    ],
  };
  const program = { phases: [phase], current: { phaseId: 'p_aaaaaa', startedAt: '2026-10-01T00:00:00.000Z' } };
  const names = weekdayNames(phase.days);
  const rows = (days: ReturnType<typeof assignedWeek>) => days.map((day) => [day.state, day.label]);

  test('bugünün ve sıradaki atanmış program', () => {
    assert.equal(todayAssigned(phase.days, '2026-10-27')?.name, 'Alt vücut');
    assert.equal(todayAssigned(phase.days, '2026-10-28'), null);
    assert.deepEqual(upcomingAssigned(program, '2026-10-27'), { dayId: 'd_aaaaaa', date: '2026-10-27' });
    assert.deepEqual(upcomingAssigned(program, '2026-10-28'), { dayId: 'd_bbbbbb', date: '2026-10-29' });
    assert.deepEqual(upcomingAssigned(program, '2026-11-02'), { dayId: 'd_aaaaaa', date: '2026-11-03' });
    const bare = { phases: [{ id: 'p_aaaaaa', days: [{ id: 'd_aaaaaa', name: 'Program A' }] }], current: program.current };
    assert.equal(upcomingAssigned(bare, '2026-10-27'), null);
  });

  test('pazartesi Alt vücut yapıldı: salı yine Alt vücut (kaydırma yok)', () => {
    const days = assignedWeek({ today: '2026-10-27', weekdays: [2, 4, 7], names, sessions: [{ date: '2026-10-26', dayName: 'Alt vücut' }], since: null });
    assert.deepEqual(rows(days), [
      ['done', 'Alt vücut'],
      ['planned', 'Alt vücut'],
      ['rest', null],
      ['planned', 'Üst vücut'],
      ['rest', null],
      ['rest', null],
      ['planned', 'Tüm vücut'],
    ]);
  });

  test('atanmış gün geçti, antrenman yok: kaçtı (adıyla); pencereden önce kaçmış sayılmaz', () => {
    const missed = assignedWeek({ today: '2026-10-29', weekdays: [2, 4, 7], names, sessions: [], since: null });
    assert.deepEqual(rows(missed).slice(1, 4), [['missed', 'Alt vücut'], ['rest', null], ['planned', 'Üst vücut']]);
    const fresh = assignedWeek({ today: '2026-10-29', weekdays: [2, 4, 7], names, sessions: [], since: '2026-10-28' });
    assert.equal(fresh[1]?.state, 'rest');
    assert.equal(fresh[1]?.selected, true);
  });

  test('aynı gün iki antrenman: sonuncusunun adı; atanmamış günde yapılan da "yapıldı"', () => {
    const days = assignedWeek({
      today: '2026-10-29',
      weekdays: [2, 4, 7],
      names,
      sessions: [{ date: '2026-10-28', dayName: 'Üst vücut' }, { date: '2026-10-28', dayName: 'Tüm vücut' }],
      since: null,
    });
    assert.deepEqual(days[2] && [days[2].state, days[2].label], ['done', 'Tüm vücut']);
  });

  test('atamasız program (danışanın günleri): seçili günler adsız', () => {
    const days = assignedWeek({ today: '2026-10-26', weekdays: [1, 3], names: {}, sessions: [], since: null });
    assert.deepEqual(rows(days).slice(0, 3), [['planned', null], ['rest', null], ['planned', null]]);
  });

  test('geçerli günler: atamalı programda birleşim, danışanın katmanı yok sayılır', () => {
    const scheduled = { ...program, schedule: { weekdays: [2, 4, 7] }, clientSchedule: { weekdays: [1, 3], at: '2026-10-20T08:00:00.000Z' } };
    assert.deepEqual(effectiveSchedule(scheduled), { weekdays: [2, 4, 7], pt: [2, 4, 7], client: null, source: 'pt', assigned: true });
    const bare = { phases: [{ id: 'p_aaaaaa', days: [{ id: 'd_aaaaaa', name: 'Program A' }] }], current: program.current, clientSchedule: { weekdays: [1, 3], at: '2026-10-20T08:00:00.000Z' } };
    assert.deepEqual(effectiveSchedule(bare).weekdays, [1, 3]);
    assert.equal(effectiveSchedule(bare).assigned, false);
  });

  test('haftalık hedef: atanmış gün sayısı, yoksa evrenin sıklığı', () => {
    assert.equal(programWeekTarget({ ...program, schedule: { weekdays: [2, 4, 7] } }), 3);
    const bare = { phases: [{ id: 'p_aaaaaa', daysPerWeek: 2, days: [{ id: 'd_aaaaaa', name: 'Program A' }] }], current: program.current };
    assert.equal(programWeekTarget(bare), 2);
  });

  test('metinler', () => {
    assert.equal(assignmentsText(phase.days), 'Sal · Alt vücut, Per · Üst vücut, Paz · Tüm vücut');
    assert.equal(assignmentsText([{ id: 'd_aaaaaa', name: 'Program A' }]), '');
    assert.equal(weekdayNamesText([4, 2]), 'Salı, Perşembe');
  });
});
```

**Step 2:** FAIL.

**Step 3: Uygula**

```ts
type Assigned = { phases?: readonly { id: string; days: readonly AssignableDay[] }[] | undefined; current?: { phaseId: string } | undefined };
type Scheduled = { schedule?: ProgramSchedule | undefined; clientSchedule?: ClientSchedule | undefined } & Assigned;

export type EffectiveSchedule = {
  weekdays: Weekday[];
  pt: Weekday[];
  client: { weekdays: Weekday[]; at: string } | null;
  source: 'client' | 'pt' | null;
  /** Şu anki evrede atama var (Faz 3): günleri PT'nin ataması belirler, danışan değiştiremez. Eski yanıtta yok. */
  assigned: boolean;
};

/**
 * Geçerli günler. Atamalı programda şu anki evrenin birleşimi (`clientSchedule` yok sayılır); atamasızda bugünkü
 * kural (danışanınki ?? PT'ninki).
 */
export function effectiveSchedule(program: Scheduled): EffectiveSchedule;

/** Bugüne atanmış program (Bugün kartı, `plannedDayId`); yoksa null. */
export function todayAssigned<D extends AssignableDay>(days: readonly D[], today: string): D | null;

/**
 * Bugünün ya da sıradaki atanmış program (Faz 3, `nextDayId`'nin yerine): şu anki evrede bugüne atanmış program,
 * yoksa bugünden sonraki ilk atanmış gün (en çok 6 gün ileri). Atama yoksa null.
 */
export function upcomingAssigned(program: Assigned & { phases: readonly { id: string; days: readonly AssignableDay[] }[]; current: { phaseId: string } }, today: string): { dayId: string; date: string } | null;

/** "Bu hafta x/y"nin y'si programdan (Bugün, İlerleme, haftalık hedeflerin dondurulması aynı kural). */
export function programWeekTarget(program: Scheduled & { phases: readonly { id: string; daysPerWeek?: number; days: readonly AssignableDay[] }[]; current: { phaseId: string } }): number | undefined;

/** "Sal · Alt vücut, Per · Üst vücut"; atama yoksa boş. */
export function assignmentsText(days: readonly AssignableDay[]): string;
/** "Salı, Perşembe" (PT'nin program kartı, sheet satırı). */
export function weekdayNamesText(list: readonly number[]): string;

export type WeekDayState = 'done' | 'missed' | 'planned' | 'rest';
export type WeekDay = StripDay & { state: WeekDayState; label: string | null };

/**
 * Bugün'ün hafta şeridi (Faz 3): yapıldı (oturumun adı; aynı gün birden çoksa sonuncusu) · kaçtı (seçili gün geçti,
 * antrenman yok; pencereden önce değil; ad atamadan) · planlı (bugün ve ilerideki seçili gün; ad atamadan) ·
 * dinlenme. `weekdays`: geçerli günler (`effectiveSchedule`); `names`: şu anki evrenin atamaları (`weekdayNames`),
 * atamasız programda boş.
 */
export function assignedWeek(input: {
  today: string;
  weekdays: readonly number[];
  names: Readonly<Partial<Record<number, string>>>;
  doneDays?: Iterable<string>;
  sessions: readonly { date: string; dayName: string }[];
  since?: string | null | undefined;
}): WeekDay[];
```

`assignedWeek` `weekStrip`'i kullanır (bugünkü `weekPlan` gibi): `done` → `sessions`'tan son ad (yoksa null),
`missed` → `names[weekday] ?? null`, seçili ve `date >= today` → `planned` (`names[weekday] ?? null`), öteki `rest`.
Dosya başı yorumu Faz 3'e göre (atama, dönüş yok, `clientSchedule` yalnız atamasız programda).

**Step 4:** PASS.

typecheck, lint, test · Commit: `feat(today): week and today from weekday assignments`

---

### Task 5: Varsayılan adlar "Program A"

**Boyut:** S · **Files:** Modify `src/lib/program-plan.ts`, `src/lib/own-programs.ts`, `src/lib/training-days.ts`
(`dayShortName`), `src/lib/own-program-text.ts` (`programLine`), `src/app/setup/appearance-preview.tsx` · Test
`src/lib/program-plan.test.ts`, `src/lib/own-programs.test.ts`, `src/lib/training-days.test.ts`,
`src/lib/own-program-text.test.ts`

**Step 1: Test**

```ts
test('yeni varsayılan "Program A…"; harf eski "Gün X" adıyla da alınmış sayılır', () => {
  assert.equal(nextDayName([]), 'Program A');
  assert.equal(nextDayName([{ name: 'Program A' }]), 'Program B');
  assert.equal(nextDayName([{ name: 'program a' }, { name: 'Alt vücut' }]), 'Program B');
  assert.equal(nextDayName([{ name: 'Gün A' }, { name: 'Gün B' }]), 'Program C');
  assert.equal(blankProgramBody(ids).phases[0]?.days[0]?.name, 'Program A');
});

test('kısa ad: "Program" ve "Gün" öneki, ötekinde ilk sözcük', () => {
  assert.equal(dayShortName('Program A'), 'A');
  assert.equal(dayShortName('Program A 2'), 'A 2');
  assert.equal(dayShortName('Gün B'), 'B');
  assert.equal(dayShortName('Alt vücut'), 'Alt');
  assert.equal(dayShortName('Programım'), 'Programım');
});

test('program satırı', () => {
  assert.equal(programLine({ days: 2, weekdays: [4, 2] }, '2026-09-22'), '2 program · haftada 2 · Sal, Per · son: 22 Eyl');
  assert.equal(programLine({ days: 1, weekdays: [] }), '1 program · gün atanmadı');
});
```

**Step 2:** FAIL.

**Step 3: Uygula**
- `nextDayName`: harf `Program X`; `Gün X` ya da `Program X` adı varsa harf alınmış; harfler bitince
  `Program ${n}`. Yorum: "Sıradaki program adı (Faz 3; saklanan 'Gün A' adları değişmez)".
- `blankProgramBody`, `blankPhase` → `nextDayName([])`; `ownStartBody`'nin boş günü de.
- `dayShortName`: `/^(?:gün|program)\s+(.+)$/iu`.
- `programLine`: "N program", "gün atanmadı"; var olan beklentiler güncellenir.
- `appearance-preview.tsx`: "Üst vücut · Gün A" → "Salı · Üst vücut"; "Gün A seni bekliyor." → "Alt vücut seni
  bekliyor.".
- `copyPtDays`'in yorumundaki "Gün A 2" örneği "Program A 2" olur. Yeni günü varsayan testlerdeki "Gün B"
  beklentileri "Program B" olur; fikstürlerdeki saklı adlar değişmez.

**Step 4:** PASS.

typecheck, lint, test · Commit: `feat(program): default workout names "Program A"`

---

## B · Sunucu

### Task 6: Planın günü, `plannedDayId`, yanıt ve haftalık hedef

**Boyut:** L · **Files:** Modify `src/lib/workout-plan.ts`, `src/lib/workout-routes.ts`, `src/lib/history-store.ts`,
`src/lib/demo-history.ts` (yalnız `buildWorkoutDay` çağrısı), `src/lib/progress-data.ts`, `src/lib/programs.ts`
(`writeProgramFile`'ın dondurması), `src/lib/constraint-filter.ts`, `src/lib/notices-store.ts`,
`src/app/dashboard/clients/[id]/program/page.tsx`, `src/app/dashboard/clients/[id]/program/own/[pid]/page.tsx`,
`src/app/me/(sekmeler)/programlar/[pid]/page.tsx` (son üçünde yalnız `programConflicts`'in `today`'i) · Test
`src/lib/workout-plan.test.ts`, `src/lib/workout-routes.test.ts`, `src/lib/constraint-filter.test.ts`

**Step 1: Test**

```ts
// workout-plan.test.ts — atamalı fikstür: A [2], B [4]; 27 Ekim salı, 28 Ekim çarşamba
test('planın günü ve plannedDayId atamadan', () => {
  const tuesday = buildWorkoutDay({ ...base, dayId: null, today: '2026-10-27' });
  assert.deepEqual([tuesday?.dayId, tuesday?.plannedDayId], [DAY_A, DAY_A]);
  const other = buildWorkoutDay({ ...base, dayId: DAY_B, today: '2026-10-27' });
  assert.deepEqual([other?.plannedDayId, other?.plannedDayName], [DAY_A, 'Gün A']);
  const wednesday = buildWorkoutDay({ ...base, dayId: DAY_B, today: '2026-10-28' });
  assert.equal(wednesday?.plannedDayId, null);
  assert.equal('plannedDayName' in (wednesday ?? {}), false);
  assert.equal('rotationDays' in (wednesday ?? {}), false);
});

test('varsayılan gün: bugünkü, yoksa haftada sıradaki atanmış, atama yoksa ilk', () => {
  assert.equal(defaultDayId(assigned, '2026-10-28'), DAY_B);
  assert.equal(defaultDayId(unassigned, '2026-10-28'), DAY_A);
});

test('damga: aynı birleşimde atama yer değiştirince değişir', () => { /* A↔B günleri takas → programStamp farklı */ });

test('afterFinish sırayı değiştirmez', () => { /* doc.rotation 'advance' olsa da program.nextDayId aynı */ });

// workout-routes.test.ts — `deps.now()` salıya kurulur (fikstürün saat dilimiyle)
test('Bugün yanıtı: gün atamadan, günler atamalarıyla, nextDayId varsayılan gün', () => { /* … */ });

// constraint-filter.test.ts
test('çakışmanın next işareti bugünkü ya da sıradaki atanmış programda', () => { /* programConflicts(…, today) */ });
```

**Step 2:** FAIL.

**Step 3: Uygula**
- `workout-plan.ts`:
  - `defaultDayId(program: PlanProgram, today: string): string | null` = `upcomingAssigned(program, today)?.dayId ??
    currentPhaseOf(program)?.phase.days[0]?.id ?? null`.
  - `resolveDay(program, dayId, today)`, `dayExerciseIds(program, dayId, today)`, `dayRowIds(program, dayId, today)`:
    varsayılan `defaultDayId`. `buildWorkoutDay` girdisine `today: string`; `plannedDayId` =
    `todayAssigned(current.days, input.today)?.id ?? null`, `plannedDayName` yalnız planlanan seçilenden farklıyken;
    `rotationDays` üretilmez (tip alanı 13. görevde kalkar). `WorkoutDay` alan yorumları: "Antrenmanın gününe
    atanmış program; `dayId`'den farklıysa başka program seçildi (Faz 3)".
  - `programStamp`: `Pick`'e `phases`; dizgiye şu anki evrenin `day.id:weekdays` listesi.
  - `afterFinish`: dönüş dalı (`finished`, `advancedTo`) ve `program` tipi kalkar; belge yorumundaki "Sıradaki gün"
    paragrafı düşer. `doc` tipinden `rotation` çıkar.
  - `weekOf`, `scheduleOf`: kod değişmez (`effectiveSchedule` atamalı); `WeekCount.target` yorumu "atanmış gün
    sayısı".
- `workout-routes.ts`:
  - `workoutRoute`: `requested = dayParam ?? current?.program?.dayId ?? null`; `resolveDay(program, requested, today)`;
    `dayExerciseIds`/`dayRowIds`/`buildWorkoutDay`'e `today`. Yanıtın `program.nextDayId` = `defaultDayId(program,
    today)`; `days` her güne `...(day.weekdays?.length ? { weekdays: day.weekdays } : {})`. `WorkoutResponse`
    tipinde `days`'e `weekdays?: number[]`, `nextDayId` yorumu Karar 4.
  - Muadil ucu (`resolveDay(program, dayParam)`, ~528) `today` alır.
  - Dosya başındaki uç listesinde Bugün'ün günü cümlesi güncellenir.
- `history-store.ts:100,103` ve `demo-history.ts:451`: `today` = seansın tarihi (`doc.date` / `date`).
- `constraint-filter.ts` `programConflicts(program, exercises, input, today)`: `next` = `upcomingAssigned(program,
  today)?.dayId`; tipten `rotation` çıkar. Çağıranlar: `notices-store.ts:163` (fonksiyondaki `todayIn(…)`), PT
  program sayfası, PT'nin kendi program görünümü, danışanın kendi program sayfası (sayfadaki saat dilimiyle
  `todayIn`).
- Haftalık hedef tek kuraldan: `progress-data.ts` `weeklyTarget` ve `plannedDays` → `programWeekTarget(current)`;
  `programs.ts` `writeProgramFile`'daki dondurma → `programWeekTarget(prior.program) ?? 1`.
- Var olan testlerde dönüşe bağlı beklentiler (sıradaki gün, `afterFinish`'in ilerlemesi, `rotationDays`) bu
  kurallara göre güncellenir.

**Step 4:** PASS.

typecheck, lint, test · Commit: `feat(workout): today's assigned workout is the planned day`

---

### Task 7: Bitiş dönüşsüz, "başka program" metinleri, gün ucu

**Boyut:** M · **Files:** Modify `src/lib/session-finish.ts`, `src/lib/session-files-core.ts`,
`src/lib/session-routes.ts`, `src/lib/notices.ts`, `src/lib/pt-sessions.ts`, `src/lib/workout-routes.ts`
(`scheduleRoute`), `src/app/api/me/schedule/route.ts` (yorum), `src/app/dashboard/notices-card.tsx`,
`src/app/dashboard/clients/[id]/sessions/session-list.tsx`, `src/app/me/(sekmeler)/gecmis/history-list.tsx`,
`src/app/me/(sekmeler)/gecmis/[id]/history-detail.tsx` · Test `src/lib/session-finish.test.ts`,
`src/lib/notices.test.ts`, `src/lib/pt-sessions.test.ts`, `src/lib/workout-routes.test.ts` (6'dan sonra, sırayla)

**Step 1: Test**

```ts
// session-finish.test.ts
test('bitiş dönüşü ilerletmez: program.json yazılmaz, seansa rotation yok', () => {
  const plan = planFinish({ ...input, rotation: 'advance' });
  assert.equal(plan.files.some((file) => file.path === PROGRAM_PATH), false);
  assert.equal(plan.doc.rotation, undefined);
});
test('başka program: bildirim yalnız o gün atanmış program varken', () => {
  // plannedDayId: DAY_A, dayId: DAY_B → other_day; plannedDayId yok → bildirim yok
});

// notices.test.ts
test('planlanan adı yoksa "Başka program seçildi: Üst vücut"', () => { /* … */ });
// pt-sessions.test.ts: işaret 'başka program seçildi'

// workout-routes.test.ts
test('gün ucu: atamalı PT programında ve kendi programda 409', () => {
  // atamalı PT → { status: 409, body: { error: 'Günlerini antrenörün belirliyor.' } }, dosya yazılmaz
  // kendi program (programId) → { status: 409, body: { error: 'Günleri programını düzenlerken seç.' } }
  // atamasız PT → bugünkü gibi 200 ve clientSchedule
});
```

**Step 2:** FAIL.

**Step 3: Uygula**
- `session-finish.ts`: `choice`, `doc.rotation` yazımı, `completeDay` blokları (PT ve kendi program) kalkar; program
  dosyası yalnız güncelleme (`feedback.program`) varsa yazılır; kendi programda yalnız `ownFeedback.program`.
  `FinishInput.rotation` okunmaz (eski telefon gönderebilir; yorum), `FinishPlan.rotation` kalkar; `planFinish`'in
  ve `finishCommitMessage`'ın yorumları "rotasyon ilerlediyse" cümlesinden arınır. `defaultRotation` yeniden
  dışa aktarımı kalkar.
- `session-files-core.ts:289,306`, `session-routes.ts:182`: `rotation` artık iletilmez ve yanıtta yok. Telefonun
  bitiş yanıtında `rotation` okumadığı `grep -rn "rotation" src/app` ile doğrulanır (13. görev göndermeyi keser).
- Metinler (tablo): `notices.ts:34` etiket "Başka program", `:88` "Başka program seçildi: …"; `pt-sessions.ts:82`
  "başka program seçildi"; rozetler "başka program" (üç dosya); `notices-card.tsx:53` boş metin. Yorumlardaki
  "başka gün" anlatımları "başka program" olur.
- `scheduleRoute`: kendi program hedefi (`target`) → 409 "Günleri programını düzenlerken seç."; PT programı okunduktan
  sonra `effectiveSchedule(program.output).assigned` → 409 "Günlerini antrenörün belirliyor.". Atamasız PT yolu
  aynen. `scheduleOwnProgram` çağrısı kalkar (fonksiyon 15. görevde silinir). Yorumlar Karar 3.

**Step 4:** PASS.

typecheck, lint, test · Commit: `feat(workout): finishing no longer advances a rotation; other-workout copy`

---

### Task 8: Deneme programı ucu (`/api/dev/seed-program`)

**Boyut:** M · **Files:** Create `src/lib/demo-program.ts`, `src/app/api/dev/seed-program/route.ts` · Test
`src/lib/demo-program.test.ts`

Yazmadan önce `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` okunur;
`src/app/api/dev/seed-history/route.ts` kalıp olarak izlenir.

**Step 1: Test**

```ts
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';
import { EXERCISE_LIBRARY } from '../data/exercise-library.ts'; // dışa aktarımın gerçek adı dosyadan doğrulanır
import { DEMO_PROGRAM, demoProgramRecord } from './demo-program.ts';
import { programIdSource } from './program-plan.ts';
import { programSchema } from './schemas/program.ts';

const library = new Map(EXERCISE_LIBRARY.map((exercise) => [exercise.id, exercise]));
const NOW = new Date('2026-11-01T09:00:00.000Z');

describe('deneme programı', () => {
  test('üç program, kendi günlerine atanmış, hareketler sırayla; şemaya uyar', () => {
    const result = demoProgramRecord(library, programIdSource([]), NOW);
    assert.ok('program' in result);
    const days = result.program.phases[0]?.days ?? [];
    assert.deepEqual(days.map((day) => [day.name, day.weekdays]), [['Alt vücut', [2]], ['Üst vücut', [4]], ['Tüm vücut', [7]]]);
    assert.deepEqual(days[0]?.blocks.flatMap((block) => block.rows.map((row) => row.exerciseId)), [
      'halter-back-squat', 'romanian-deadlift', 'bulgarian-split-squat', 'leg-press', 'yuzustu-leg-curl', 'ayakta-calf-raise',
    ]);
    assert.deepEqual(result.program.schedule?.weekdays, [2, 4, 7]);
    assert.equal(result.program.clientSchedule, undefined);
    assert.equal(result.program.revision, 1);
    assert.equal(v.safeParse(programSchema, result.program).success, true);
  });

  test('kütüphanede olmayan hareket varsa program kurulmaz', () => {
    const partial = new Map([...library].filter(([id]) => id !== 'plank'));
    assert.deepEqual(demoProgramRecord(partial, programIdSource([]), NOW), { missing: ['plank'] });
  });
});
```

(`demoSeedGate`'in adı "Test " ile başlamayan danışana 403 verdiği `demo-seed.test.ts`'te zaten sınanıyorsa
yinelenmez; sınanmıyorsa oraya eklenir.)

**Step 2:** FAIL.

**Step 3: Uygula**
- `demo-program.ts` (saf):

```ts
/** Deneme programı (YALNIZ geliştirme): üç program, her biri tek güne atanmış (kullanıcının kararı 6). */
export const DEMO_PROGRAM = [
  { name: 'Alt vücut', weekday: 2, exerciseIds: ['halter-back-squat', 'romanian-deadlift', 'bulgarian-split-squat', 'leg-press', 'yuzustu-leg-curl', 'ayakta-calf-raise'] },
  { name: 'Üst vücut', weekday: 4, exerciseIds: ['halter-bench-press', 'halter-bent-over-row', 'ayakta-halter-omuz-press', 'lat-pulldown', 'dambil-yana-acis', 'triceps-halat-pushdown'] },
  { name: 'Tüm vücut', weekday: 7, exerciseIds: ['deadlift', 'goblet-squat', 'egimli-dambil-press', 'tek-kol-dambil-row', 'dambil-lunge', 'plank'] },
] as const;

/**
 * Taze program kaydı (`createProgramRecord`, revision 1): evresiz, her hareket tek blok (`kind: 'single'`, dinlenme
 * `DEFAULT_REST_SECONDS[category]`, setler `defaultSets(exercise)`). Kütüphanede olmayan hareket varsa kayıt yok,
 * eksikler döner (sessizce eksik program yazılmaz).
 */
export function demoProgramRecord(
  exercises: ReadonlyMap<string, Pick<PlanExercise, 'category' | 'trackingType' | 'progression'>>,
  ids: ProgramIdSource,
  now: Date,
): { program: ProgramState } | { missing: string[] };
```

- `route.ts` yalnız `POST` (JSON `{ clientId }`; form yok):
  1. `production()` → 404 (gövdesiz).
  2. `demoSeedGate({ production: false, pt })` → değilse kapının durumu; `originGuard(request.headers,
     origin(request))`.
  3. `parseSeedRequest`'in `clientId` kalıbıyla doğrulama (ayrı küçük valibot şeması da olur); `readClient` →
     `demoSeedGate({ …, client })`: adı "Test " ile başlamayan danışana 403, yoksa 404.
  4. `listExercises()` → `demoProgramRecord` → eksik varsa 409 ("Kütüphanede yok: …").
  5. `readProgramFile` (sha; dosya bozuk olsa da sha'sıyla) → `writeProgramFile(client.id, program, { sha, message:
     'Deneme programı (geliştirme)' })`. Yanıt `{ status: 'written', days: [{ name, weekdays }] }`; `console.error`
     ile tek satır günlük (`[deneme] c_…: program`).
  Dosya başı yorumu: yalnız geliştirme; kapı; taze kayıt `clientSchedule`, `clientTargets`, `rotation`'ı siler; gerçek
  danışana ad kapısı yüzünden yazamaz.

**Step 4:** PASS.

typecheck, lint, test · Commit: `feat(dev): seed a weekday-assigned test program`

---

## C · PT düzenleyicisi

### Task 9: Programın kartında gün çipleri

**Boyut:** M · **Files:** Modify `src/components/weekday-toggle.tsx`,
`src/app/dashboard/clients/[id]/program/day-editor.tsx`, `.../program/day-chips.tsx`, `.../program/days-card.tsx`
ve `.../program/phases-card.tsx` (yalnız `DayChips`'in kalkan prop'u), `.../program/program-form.tsx` (yalnız
`isNext`/`next` ve ilk seçim)

- `WeekdayToggle`: isteğe bağlı `taken?: ReadonlyMap<number, string>`; alınmış gün `disabled`, erişilebilir adı
  "Perşembe, Üst vücut programında", `title` aynı. Base UI `ToggleGroupItem`'ın `disabled`'ı `ui/toggle-group.tsx`'te
  doğrulanır. Belge yorumu: PT düzenleyicide, kendi program formunda ve atamasız programın gün sheet'inde.
- `DayEditor`:
  - Başlık: `CardTitle` bugünkü gibi; `CardDescription` `weekdayNamesText(day.weekdays ?? [])` ya da "Gün atanmadı".
    `isNext` prop'u kalkar.
  - "Program adı" alanı, yer tutucu "Ör. Alt vücut".
  - Altında yeni alan: etiket "Günleri", `WeekdayToggle` (`value` günün `weekdays`'i, `taken` =
    `takenWeekdays(phase.days, day.id)`), değişince `setInput(form, { path: ['phases', phaseIndex, 'days', dayIndex,
    'weekdays'], input: assignWeekdays(current phase days, day.id, next).find(…)?.weekdays })` (güncel evre
    `actions.current()`'tan). Açıklama: `taken.size ? \`Başka programda: ${…}\` : 'Danışan bu günlerde Bugün\'de bu
    programı görür.'`.
  - Menü: erişilebilir ad "Program işlemleri: X"; "Günü sil" → "Kaldır"; duyurular programın adıyla.
- `DayChips`: `nextDayId` prop'u ve nokta kalkar; çipte ad ve (varsa) `weekdaysText` küçük, soluk ("Alt vücut ·
  Sal"); erişilebilir ad "Alt vücut, Salı" ya da "…, gün atanmadı". `AddDayMenu`: "Program", erişilebilir ad
  evreliyse "'Evre 1' evresine program ekle" değilse "Program ekle"; öğeler "Boş program", "Şablondan…",
  "Seçili programın kopyası".
- `days-card.tsx`, `phases-card.tsx`: `DayChips`'e `nextDayId` geçilmez (yalnız bu).
- `program-form.tsx`: `next`, `rotation`, `kept` hesapları (yalnız dönüş içindi) kalkar; `DayEditor`'a `isNext`
  geçilmez; ilk seçili program `upcomingAssigned({ phases: initial.phases, current: { phaseId:
  initial.currentPhaseId } }, todayIn(timeZone))?.dayId ?? ''` (sonra bugünkü geri dönüş: şu anki evrenin ilki).

typecheck, lint, test · Commit: `feat(program-editor): weekday chips per workout`

**Controller doğrulaması (375 px ve masaüstü):** test danışanının düzenleyicisinde Alt vücut seçiliyken "Per" ve
"Paz" kapalı, adları duyuruluyor, alttaki satır "Başka programda: Per · Üst vücut, Paz · Tüm vücut"; Sal kapatılıp
Cum açılınca çipte "Cum"; **kaydedilmez** (Kaydet'e basılmaz).

---

### Task 10: Haftalık plan özeti, sıklık ve PT sayfaları

**Boyut:** L · **Files:** Modify `src/app/dashboard/clients/[id]/program/program-form.tsx`, `.../program/days-card.tsx`,
`.../program/phases-card.tsx`, `.../program/weekday-field.tsx`, `.../program/frequency-select.tsx` (gerekirse yalnız
yorum), `.../program/page.tsx`, `.../program/own/[pid]/page.tsx`, `src/app/dashboard/clients/[id]/page.tsx`,
`src/components/program/phase-load.tsx` (9'dan sonra, sırayla)

- `program-form.tsx`:
  - Başlangıç girdisinde program düzeyindeki `weekdays` yok; kayıt gövdesi onu göndermez (sunucu atamalardan
    hesaplar, 3. görev).
  - `prepareDraft`: eski taslak (gün başına alan yok, `weekdays` var) → `phases: upgradeAssignments(input.phases,
    input.weekdays)`, `weekdays` düşer; aynı adım "devam" edilen taslağa da uygulanır (bugünkü cihaz adımıyla aynı
    yer).
  - `weekdaysField` → `AssignmentSummary` (aşağıda), şu anki evrenin günleriyle.
- `weekday-field.tsx`: `WeekdayField` yerine `AssignmentSummary({ days, clientId, client, timeZone })`: etiket
  "Haftanın planı", metin `assignmentsText(days)` ya da "Henüz gün atanmadı."; atanmamış programlar varsa "Gün
  atanmamış: Program D"; atama **yoksa** ve `client` varsa bugünkü rozet + `ResetDaysButton` (Karar 3). Formdaki
  `weekdays` alanını okumaz. `ResetDaysButton` aynen kalır.
- `days-card.tsx`: başlık "Haftalık plan", açıklama (tablo); `FrequencySelect` yalnız `!hasAssignments(phase.days)`
  (açıklama "Gün atamadıysan danışanın haftalık hedefi bu sayıdır."); özet seçicinin yerinde.
- `phases-card.tsx`: açıklama (tablo); evre satırındaki sıklık seçicisi yalnız o evre atamasızken; özet şu anki evre
  için; belge yorumları.
- PT program sayfası (`program/page.tsx`): `nextId` → `upcomingAssigned(program, todayIn(timeZone, now))`; "sıradaki
  gün" kartı "Bugün · Alt vücut" ya da "Sıradaki: Perşembe · Üst vücut"; program kartlarında atandığı günler
  (`weekdaysText`); "Antrenman günleri" satırı atamalıda `assignmentsText`, rozet ve geri dönüş yalnız atamasızda.
  `PhaseLoad`'a `assigned`.
- PT'nin kendi program görünümü (`own/[pid]/page.tsx`): `nextId` → `upcomingAssigned`.
- Genel bakış (`clients/[id]/page.tsx:281`): `next` → `upcomingAssigned(program, today)?.dayId`; program
  kartlarında günler; açıklamadaki sıklık `frequencyLabel(programWeekTarget(program))`.
- `phase-load.tsx`: `assigned?: readonly number[]` prop'u; doluysa haftalık yük gösterilir ve metin "Planlanan haftalık
  yük atanmış günlere göre (Sal, Per, Paz). Kas başına set; programdan hesaplanır, antrenman kayıtlarından değil.";
  değilse bugünkü koşul ve metin.

typecheck, lint, test · Commit: `feat(program-editor): weekly plan summary and PT pages from assignments`

**Controller doğrulaması:** PT program sayfası "Sıradaki: …" ya da "Bugün · …", kartlarda günler; düzenleyicide
"Haftalık plan" özeti, "Haftada kaç gün" görünmüyor; kas yükü kartı atanmış günleri söylüyor. Kayıt yok.

---

## D · Danışan

### Task 11: Hafta şeridi, "Başka program seç", Ayarlar

**Boyut:** M · **Files:** Modify `src/app/me/training-week.tsx`, `src/app/me/today-workout.tsx`,
`src/app/me/schedule-sheet.tsx`, `src/app/me/(sekmeler)/ayarlar/page.tsx`, `src/app/me/program-card.tsx` (yalnız
içe aktarılan ad ve kalkan `showNext` prop'u)

- `WeekStrip({ clientId })`: `showNext` ve `activeDay` prop'ları, "Sırada: …" satırı, `planOf`'un dönüş dalı kalkar.
  Günler `assignedWeek({ today, weekdays: schedule.weekdays, names: weekdayNames(data.program?.days ?? []), doneDays:
  data.week.days, sessions: data.week.sessions ?? [], since: schedule.since })` (program yoksa `names: {}`).
  - Görsel: yapıldı dolu ✓; planlı ince halka, bugünün planlısı kalın halka (`ring-4`) ve kalın kısaltma; kaçtı
    soluk halka ve "kaçtı"; dinlenme nokta; altında kısa ad (`dayShortName`).
  - sr-only (tablo): "Salı, bugün, antrenman günü: Alt vücut".
  - "Günlerini değiştir" yalnız `!schedule.assigned && data.program?.source !== 'own'` (eski yanıtta `assigned` yok →
    yanlış sayılır; uç 409 ve metniyle döner). `ScheduleSheet`'in `own` dalı kalkar.
  - İskelet yüksekliği gerçek şeritle aynı: düğmesiz 81 px (`h-[5.0625rem]`); yanıt gelmeden düğme bilinmez, olağan
    durum (atamalı) esas alınır. Yorumdaki hesap güncellenir.
- `OtherDayButton` → `OtherProgramButton({ clientId })` (metinler tablodan):
  - Bugünün programı `todayId = dayOnWeekday(days, isoWeekdayOf(data.today))?.id`; açılışta seçili `picked ?? todayId
    ?? days[0]`.
  - Satır açıklaması: `[day.id === todayId ? 'bugün' : weekdayNamesText(day.weekdays ?? []) || null, day.lastDate ?
    \`son: ${formatDayShort(day.lastDate)}\` : 'henüz yapılmadı'].filter(Boolean).join(' · ')`.
  - Açıklama: PT programı ve `todayId` varsa "Bugün <ad> planlı; başka birini seçersen antrenörüne bildirilir.", yoksa
    "Bugün için bir program seç.".
  - Düğme her zaman `/me/antrenman?day=<id>` (+ `program`). Evrede tek program varsa görünmez (bugünkü gibi).
- `today-workout.tsx`: `ResumeCard`'daki `activeDay` hesabı ve `WeekStrip`'e geçişi kalkar.
- `schedule-sheet.tsx`: `ScheduleSheet`'ten `own` kalkar (açıklama: "Antrenörüne bildirilir."; "Sıra değişmez…"
  cümlesi düşer). `TrainingDaysCard({ schedule, days, own })`:
  - kendi program: programın adı, `assignmentsText(days)` ya da "Henüz gün atanmadı.", eylem "Düzenle" bağlantısı
    (`/me/programlar/<id>/duzenle`, `h-11`);
  - PT atamalı: `assignmentsText(days)` ve "Günleri antrenörün belirliyor.", eylem yok;
  - PT atamasız: bugünkü kart ve sheet.
- `ayarlar/page.tsx`: `days: currentPhaseOf(program)?.phase.days ?? []`.
- `program-card.tsx`: yalnız `OtherProgramButton` adı ve `WeekStrip`'in prop'u (kartın kendisi 12. görevde).
- Dosya başı yorumları Faz 3'e göre.

typecheck, lint, test · Commit: `feat(today): week strip from assignments; "Başka program seç"`

**Controller doğrulaması (375 px):** şeritte Sal/Per/Paz altında "Alt", "Üst", "Tüm"; geçen atanmış gün "kaçtı";
"Sırada" satırı yok; "Günlerini değiştir" yok; Ayarlar'da atamalar ve "Günleri antrenörün belirliyor.", düğme yok;
sheet'te "bugün" ve günler.

---

### Task 12: Bugün kartı ve Programlar sekmesi

**Boyut:** L · **Files:** Modify `src/app/me/program-card.tsx`, `src/app/me/(sekmeler)/programlar/page.tsx`,
`src/app/me/(sekmeler)/programlar/antrenor/page.tsx`, `src/app/me/(sekmeler)/programlar/[pid]/page.tsx`,
`src/app/me/(sekmeler)/programlar/program-days.tsx` (11'den sonra, sırayla)

- `program-card.tsx` (`ProgramCard`; çip, banner, boş program ve okunamayan hâller aynen):
  - `today = todayIn(timeZone)`, `todayDay = todayAssigned(phase.days, today)`, `anyAssigned = hasAssignments(phase.days)`,
    `doneToday` bugünkü gibi; `programQuery` bugünkü gibi; başlangıç bağlantısı `startHref(id) =
    \`/me/antrenman?day=${encodeURIComponent(id)}${oneOff ? \`&program=${…}\` : ''}\``.
  - **Atanmış gün** (`todayDay` var): bugünkü kart, gün `todayDay`; başlık `${WEEKDAY_NAMES[isoWeekdayOf(today)]} ·
    ${todayDay.name}`; üst satır yalnız `doneToday`'de "Bugünkü antrenmanını yaptın" ("Bugün dinlenme günün" kalkar);
    "Antrenmana başla" `startHref(todayDay.id)`; altında `OtherProgramButton`; kısıt notları, ilk 3 hareket, "Tümünü
    gör", şerit aynen.
  - **Atanmamış gün**: başlık `anyAssigned ? 'Bugün atanmış program yok' : 'Bugün hangi programı yapacaksın?'`,
    açıklama "Yapmak istediğin programı seç." (`doneToday`'de üstte "Bugünkü antrenmanını yaptın"); evre satırı
    evreli programda kalır. Liste (`ul`, `Item variant="outline"`): ad, "N hareket · ≈ N dk · son: 21 Eki" ya da
    "… · henüz yapılmadı" (`lastDoneDates(sessions)`), sağda [Başla] (`h-11`, `nativeButton={false}`, `Link`,
    erişilebilir ad "Başla: <ad>"). Hareketi kütüphanede olmayan program "Bu programın hareketleri şu an açılamıyor."
    der, düğmesiz. Kısıt notu ve önizleme bu hâlde yok (antrenman ekranı gösterir). Altında şerit.
  - **Haftanın programı** (`anyAssigned` iken, ana kartın ve `children`'ın altında; "Sonraki günler"in yerine):
    `weekAssignments(phase.days)` satır satır: başlık "Salı · Alt vücut", açıklama "6 hareket · ≈ 50 dk", bugünün
    satırında "bugün" rozeti; atanmamış programlar varsa sonda tek satır "Gün atanmamış: Program D, Program E";
    evreliyse açıklama evrenin adı.
  - Faz 0 kuralı: atanmış hâlde 375×812'de "Antrenmana başla"nın alt kenarı 700 px'ten yukarıda; atanmamış hâlde ilk
    satırın [Başla]'sı ilk ekranda.
  - `dayIndex`/`following` hesapları ve `nextDayId`, `todayCardTitle`, `todayState` içe aktarımları kalkar. Dosya başı
    yorumu Faz 3'e göre.
- Programlar sekmesi:
  - `program-days.tsx`: `nextId` → `todayId: string | null`; durum `[weekdayNamesText(day.weekdays ?? []) || null,
    day.id === todayId ? 'bugün' : null, last ? 'son: …' : null]` ("Salı · bugün · son: 21 Eki"); `Day` tipine
    `weekdays?`. Yorum.
  - `antrenor/page.tsx`, `[pid]/page.tsx`: `todayId = todayAssigned(phase.days, today)?.id ?? null` (sayfadaki saat
    dilimiyle `today`).
  - `programlar/page.tsx`: "Sıradaki: X" → `upcomingAssigned`: bugünse "Bugün: Alt vücut", değilse "Sıradaki:
    Perşembe · Üst vücut"; atama yoksa satır yok.

typecheck, lint, test · Commit: `feat(today): today's assigned workout card and the weekly plan`

**Controller doğrulaması (375 px):** turun günü atanmış günse (Sal, Per, Paz) kart "<Gün> · <Program>", "Antrenmana
başla" ilk ekranda, "Başka program seç" ve "Haftanın programı"; değilse "Bugün atanmış program yok", üç satır ve
[Başla]; Programlar sekmesinde günler ve "bugün".

---

### Task 13: Antrenman ekranı: bitişteki seçim kalkar, bildirim metni

**Boyut:** S · **Files:** Modify `src/app/me/antrenman/workout-screen.tsx`, `src/app/me/antrenman/workout-sheets.tsx`,
`src/lib/workout-flow.ts`, `src/lib/workout-plan.ts` (yalnız `WorkoutDay.rotationDays` tipi) · Test
`src/lib/workout-flow.test.ts`

- `workout-flow.ts`: `finishRotation` ve `FinishRotation` kalkar; testleri silinir.
- `workout-sheets.tsx`: `RotationPicker`, `rotation` prop'u, `rotationShown`/`rotationValue`; `onFinish(reason)` tek
  parametre. Yorumlardaki "Sıradaki antrenman" maddesi düşer.
- `workout-screen.tsx` (yalnız bu görev dokunur): `finishRotation` çağrısı, `PendingUpdate.rotation`,
  `submitFinish`'in `rotation` parametresi ve gövdedeki `rotation` kalkar. Başlangıç bildirimi (~713):

```ts
// Başka program seçildi (Faz 3): o gün atanmış program varken antrenöre bitişte bildirilir (`other_day`); kendi programda yok.
if (!announced && data.day.source !== 'own' && data.day.plannedDayId && data.day.plannedDayId !== data.day.dayId) {
  announced = true;
  toast(`${data.day.dayName} seçildi`, {
    description: data.day.plannedDayName ? `Bugün ${data.day.plannedDayName} planlıydı; antrenörüne bildirilecek.` : 'Antrenörüne bildirilecek.',
  });
}
```

  Önbellek eşleşmesinin (`matches`, ~765) yorumu: "gün istenmediyse sunucunun varsayılan günü (`nextDayId`, Faz 3:
  bugünün ya da sıradaki atanmış program)"; kod aynen. Öteki "Başka gün" yorumları "başka program".
- `workout-plan.ts`: `WorkoutDay.rotationDays` alanı kalkar.

typecheck, lint, test · Commit: `refactor(workout): drop the finish rotation picker`

**Controller doğrulaması (375 px; `/api/me/sessions*` yazımları engelli):** "Başka program seç" → Üst vücut →
bildirim "Üst vücut seçildi · Bugün … planlıydı; antrenörüne bildirilecek." (yalnız atanmış günde); bitiş sheet'inde
"Sıradaki antrenman" yok.

---

### Task 14: Kendi program formu

**Boyut:** M · **Files:** Modify `src/components/program/own-program-form.tsx` ve onu çağıran sayfalar
(`grep -rln OwnProgramForm src/app`: danışanın "yeni" ve "düzenle" sayfaları, PT'nin kendi program düzenleme sayfası)
(3 ve 9'dan sonra)

- Program düzeyindeki `WeekdayToggle` ve onun alanı kalkar; `initial.weekdays` ve gönderilen `weekdays`/`baseWeekdays`
  düşer (şema alanları kalır, sunucu yok sayar; 3. görev). Çağıran sayfalar `initial`'den `weekdays`'i çıkarır.
- Sıklık satırı yalnız `!hasAssignments(days)`: "Gün atamazsan haftada kaç gün:"; atamada sıklık zaten kaydedilmez.
- Seçili programın altında "Program adı" (yer tutucu "Ör. Alt vücut"), ardından "Günleri": `WeekdayToggle` (`taken`
  ile; açıklama "Başka programda: …" ya da "Bugün'de bu günlerde bu programı görürsün." / `own-pt` kipinde "Danışan
  bu günlerde Bugün'de bu programı görür."), `assignWeekdays` ile yazılır.
- Çipler ad + soluk `weekdaysText`; "+ Program"; çekmece "Program ekle", "{programLabel} n/7 program. Eklenen program
  listenin sonuna gelir.", "Boş program", "Bu programdakilerden kopyala"; "Günü sil" → "Kaldır" (erişilebilir ad
  "Kaldır: <ad>"); "En fazla 7 program."
- Belge yorumları (dosya başı ve 106–107).

typecheck, lint, test · Commit: `feat(own-program): weekday chips per workout`

**Controller doğrulaması (375 px):** test danışanının kendi programı varsa düzenleyicide çipler ve kapalı gün;
**kaydedilmez**. Yoksa yeni program formu açılır, çipler denenir, kaydedilmez.

---

## E · Kapanış

### Task 15: AI taslakları, deneme geçmişi, dönüş kodunun temizliği

**Boyut:** M · **Files:** Modify `src/lib/ai/coach-engine.ts`, `src/lib/ai/assistant-engine.ts`,
`src/lib/demo-history.ts`, `src/lib/program-plan.ts`, `src/lib/training-days.ts`, `src/lib/workout-cursor.ts`,
`src/lib/own-programs.ts`, `src/lib/own-programs-store.ts` (ya da `scheduleOwnProgram`'ın dosyası) · Test
`src/lib/ai/coach.test.ts`, `src/lib/ai/assistant.test.ts`, `src/lib/demo-history.test.ts`, silinen işlevlerin testleri

**Step 1: Test**

```ts
// coach.test.ts / assistant.test.ts (dosyaların mevcut bağlam yardımcılarıyla)
test('taslak programları "Program A…" adlandırır ve her birini kendi gününe atar', () => {
  // conditions.weekdays [1, 3, 5] → günler [['Program A', [1]], ['Program B', [3]], ['Program C', [5]]]; body.weekdays [1, 3, 5]
});
test('koç taslağı yayımlandıktan sonra eşleşir (coachProgramMatches)', () => { /* createProgramRecord(bodyWithAssignments(body)) ile */ });

// demo-history.test.ts
test('atamalı programda her tarih kendi programı: salı Alt vücut, perşembe Üst vücut', () => { /* … */ });
test('atamasız programda bugünkü takvim ve sırayla programlar', () => { /* … */ });
```

**Step 2:** FAIL. **Step 3: Uygula**
- `coach-engine.ts:65`: `name: nextDayName(previousDays)`, `weekdays: [conditions.weekdays[index]]`; `daysPerWeek`
  yazılmaz (atamalı evrede düşer). `coachProgramMatches`: saklanan programın günleri atamalı, gövdeninkiler de;
  karşılaştırma yeşilse dokunulmaz, değilse gövde `bodyWithAssignments`'tan geçirilir.
- `assistant-engine.ts:48`: ad `Program A…` (`nextDayName`), `weekdays: [days[index]]`; `assistantAttention`'daki
  `body.weekdays ?? phaseWeekdays(...)`.
- `demo-history.ts`: `startingRotation`, `advance` ve `finish.rotation` kullanımı kalkar; tarihin programı
  `todayAssigned(phase.days, date) ?? days[n % days.length]`; `lighterSession` aynı listeden; `nextDayId` kalkar.
  Dosya başı yorumu.
- Ölü kodun silinmesi (her biri için önce `grep -rn '<ad>' src`; çağıranı kalmayan silinir, testleriyle):
  `nextDayId`, `completeDay`, `reconcileRotation` (`applyProgramEdit` `stored.rotation`'ı olduğu gibi taşır; yorum),
  `weekPlan`, `weekRotation`, `WeekRotation`, `ActiveDay`, `WeekPlanState`, `WeekPlanDay`, `todayCardTitle`,
  `todayState`, `TodayState`, `nextTrainingDate`, `defaultRotation`, `applyOwnSchedule`, `scheduleOwnProgram`.
  `rotation` şema alanları ve `ROTATION_CHOICES` kalır (Karar 4).
- `program-plan.ts` ve `training-days.ts` dosya başı yorumlarında "A → B → C" anlatımı kalmaz.

**Step 4:** PASS.

typecheck, lint, test · Commit: `feat(ai): name and assign drafted workouts; demo history follows assignments; drop rotation code`

---

### Task 16: Belgeler ve son doğrulama

**Boyut:** M · **Files:** Modify `docs/SPEC.md`, `docs/design/antrenman-ekrani.md`, `docs/design/kendi-program.md`,
`docs/plans/2026-10-26-kullanilabilirlik-yeniden-duzen-design.md`, `README.md` (danışan özellikleri değiştiyse),
bu plan (son inceleme notu)

- `docs/SPEC.md`: §7.4 (481) programlar "Program A…", hafta günlerine atanır, dönüş yok; 483 "Antrenman günleri"
  paragrafı Kararlar 1–5'e göre yeniden; 487 geçmiş örneği "Gün A: …" yerine "Alt vücut: …" ve "Günleri: Per → Per,
  Cum"; 386 (§6 danışan) Bugün ve "Başka program seç"; 154–230 JSON örneklerinde günlere `weekdays`, `rotation`'ın
  "yalnız eski dosyalar" notu; §12 yol haritası satırı (643 civarı) Faz 3; §13'e `POST /api/dev/seed-program`.
- `docs/design/antrenman-ekrani.md`: PT kararları 10 ve 12 (34–36) "(Faz 3'te değişti, 2026-11-01: …)" notuyla;
  §2.1 Bugün başlığı ve şerit (146, 149); §2.3 "Başka program seç" (çizim, metin, bildirim kuralı; `completeDay`
  cümlesi düşer); §2.7'deki "Sıradaki antrenman" maddesi kalkar; §2.11 baştan (veri, PT, danışan, dönüş yok, hafta
  sayımı, eski programların atanması).
- `docs/design/kendi-program.md`: kendi programda "Günlerini değiştir" (§3.2 ve geçtiği yerler) → günler formda,
  program başına; `baseWeekdays` notu.
- Eski tasarım belgesi 110–135: Karar 13'teki dört madde satır içinde güncellenir ("(Faz 3 planı, 2026-11-01:
  geçersiz — PT atar, danışan atamaz)" gibi), "Veri taşıma"ya "okurken, yazmadan; başa sarar" notu.
- Yalnız değişen cümleler; saklanan adları anlatan yerler ("Gün A" seans örnekleri) kalır.
- `npm test`, typecheck, lint; `npm run build` (yönetici, arka planda).
- Bütün Faz 3 aralığının son incelemesi (kod incelemesi ajanı, yazandan ayrı).
- **Yöneticinin turu** — yalnız Claude'un yerleşik tarayıcı paneli (panel gizliyse önce gösterilir), 375 px, yalnız
  `c_zmrbywaz`:
  1. Sayfaya, `/api/dev/seed-program` dışındaki her `/api/` yazımını (GET olmayan) reddeden bir `fetch` sarmalayıcısı
     kurulur; antrenman denemesinde `/api/me/sessions*` zaten engelli. Tohum: PT oturumuyla (`/api/dev/login`)
     `POST /api/dev/seed-program { "clientId": "c_zmrbywaz" }` bir kez; yanıtta üç program ve günleri.
  2. Danışan olarak Bugün: turun gününe göre atanmış ya da atanmamış hâl (12. görevin doğrulaması); şerit; "Haftanın
     programı"; "Başka program seç" → başka program → antrenman ekranı ve bildirim (atanmış günde) → hiçbir set
     kaydedilmeden Bugün'e dönüş.
  3. Ayarlar'da atamalar, düğme yok; Programlar sekmesinde günler.
  4. PT olarak: program sayfası, düzenleyicide çipler ve kapalı gün, "Haftalık plan" özeti; **Kaydet'e basılmaz**.
  5. Öteki hâl (atanmış/atanmamış) turun gününe düşmediyse raporda "gerçek takvimde denenecek" diye yazılır.
  6. Ekran görüntüleri kullanıcıya. Turdan sonra localStorage'da yalnız `pulsecoach.session.c_zmrbywaz` ve
     `pulsecoach.workout.c_zmrbywaz`, değerleri günlüğe yazıldıktan sonra tam adıyla silinir.
- Gerçek danışanın (`c_uc942qx6`) eski biçimli dosyası okunmaz, yazılmaz; eski biçimin okunması 1., 2. ve 3.
  görevlerin testleriyle doğrulanmıştır.

typecheck, lint, test · Commit: `docs: Faz 3 weekday-assigned programs`
