# Faz 3 · Güne atanmış programlar — uygulama planı

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (ya da executing-plans) to implement this plan task-by-task.

**Goal:** Programın günleri ("Gün A", "Gün B"…) artık A → B → C dönmez: PT her programı (antrenmanı) haftanın
günlerine atar (Salı → "Alt vücut", Perşembe → "Üst vücut", Pazar → "Tüm vücut"). Bugün, bugüne atanmış programı
gösterir ("Salı · Alt vücut", Antrenmana başla); bu yalnız kolaylıktır, danışan her gün istediği programı yapar
("Başka program seç"). Atanmamış günde danışan programların listesinden seçer; öneri yok. Varsayılan adlar
"Program A", "Program B"… olur; "gün" sözcüğü yalnız hafta günleri için kalır. Danışan günleri değiştiremez; kendi
programında atamayı danışan yapar (yazar o).

**Architecture:** Atama günün (programın) alanıdır: `weekdays?: number[]` (ISO, 1 = Pazartesi … 7 = Pazar), evre
içinde geçerli; bir hafta günü evrede en çok bir programa atanır. Atama mantığı içe aktarmasız yeni bir saf modülde
(`src/lib/day-assignments.ts`): hem `program-plan.ts` hem `training-days.ts` okur, döngü olmaz; hafta günü sabitleri
ve metinleri de oraya taşınır (`training-days.ts` yeniden dışa aktarır). `schedule.weekdays` kalır ama türetilmiş
veridir: şu anki evrenin atamalarının birleşimi, her PT yazımında (kayıt, evre geçişi) ve her kendi program yazımında
yeniden yazılır; onu okuyan her yer (kaçan gün penceresi, "Bu hafta x/y", Genel bakış'ın dikkat listesi, deneme
geçmişi) değişmeden çalışır. Danışanın gün katmanı (`clientSchedule`) okunur ama yok sayılır. Eski dosyalar okunurken
(`upgradeProgram`) atamaya çevrilir. Dönüş (rotasyon) ilerlemez ve gösterilmez; `nextDayId`'nin yerine tek kural
gelir: `upcomingAssigned(program, today)` (bugüne atanmış, yoksa haftada sıradaki atanmış program). Seansın
`plannedDayId`'si antrenmanın gününe atanmış programdır; sunucu bitişte seansın tarihinden yeniden hesaplar,
atanmamış günde yoktur, yanlış "başka gün" bildirimi çıkmaz.

**Tech Stack:** Next.js 16 App Router (AGENTS.md: sürüm eğitim verisinden farklı; Next API'si kullanmadan önce
`node_modules/next/dist/docs/` okunur — yeni uç için `01-app/01-getting-started/15-route-handlers.md`), React 19,
TypeScript, valibot, Formisch, GitHub'da JSON (danışan başına repo, `program.json`, `own-programs/<id>.json`),
TanStack Query v5, Base UI + shadcn, Tailwind v4, ikonlar `@/components/line-icons` (orada yoksa dosyadaki mevcut
Phosphor kalıbı), Node'un test aracı.

**Kurallar**
- Testler `src/lib/**/*.test.ts`, göreli `.ts` importları; tek dosya:
  `node --test --experimental-strip-types --no-warnings src/lib/<dosya>.test.ts`. Her görevin sonunda `npm test`,
  `npm run typecheck`, `npm run lint` temiz. Bileşen testi yok (projede DOM test aracı yok); ekranlar yöneticinin
  tarayıcı turuyla doğrulanır.
- Saf mantık TDD: önce test (FAIL), sonra uygulama (PASS). Her görev **etkilenen test dosyalarının tamamını** sayar;
  onların beklentisi yalnız o görevin değiştirdiği davranış için güncellenir. Sayılmayan bir dosya kırmızıya dönerse
  görev bitmemiştir: değişiklik ya geri alınır ya o dosya bu görevde düzeltilir ve incelemede söylenir. Hiçbir görev
  sonraki görevin işi olan testi kırık bırakmaz.
- Uygulayıcı dev sunucusu başlatmaz, `npm run build` çalıştırmaz. Tarayıcı doğrulamasını yönetici (controller) yapar,
  yalnız Claude'un yerleşik tarayıcı panelinde; yalnız test danışanı `c_zmrbywaz` ("Test Gelişim"). Gerçek danışan
  `c_uc942qx6`'nın verisine hiçbir görev, test ya da tur yazmaz (16. görevde yalnız okuma); eski biçimin okunması saf
  testlerle doğrulanır.
- Saklanan adlar hiçbir koşulda yeniden yazılmaz ("Gün A" seans anlık görüntülerinde, bildirimlerde, geçmişte durur);
  yalnız **yeni** varsayılanlar "Program A" olur. Test fikstürlerindeki "Gün A" adları da kalır.
- Metinlerde yalnız "gün"ün antrenman anlamında kullanıldığı ve dönüşü anlatan parçalar değişir; cümlenin geri kalanı
  olduğu gibi kalır. Yeni PT metinleri üçüncü kişi ya da kişisiz ("PT", "antrenör", "danışan"; ürün beyaz etiket,
  PT genel), danışan metinleri "sen". Telefon önce (375 px), dokunma hedefi en az 44 px.
- "Atamalı" her yerde **şu anki evrede** en az bir programın günü var demektir.
- Her commit `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` ile biter; push yok; commit'ler açık yollarla
  (`git commit -m … -- <dosyalar>`), başka ajanın dosyası süpürülmez.
- Kapsam dışı (sonraki faz ve sonrası): kardiyo hedefleri (mesafe, süre, eğim, kalori) bir sonraki faz; danışanın
  programları başka günlere taşıması ya da günlerini değiştirmesi (Karar 3); saklanan adların yeniden yazılması; eski
  tasarımdaki 3 adımlı PT oluşturma sihirbazı ve "Gelişmiş" bölümü; "bugün antrenman günün" web push hatırlatması;
  atanmamış günde bütün programların planlarının önceden çekilmesi (Karar 6).

**Sıra:** Görevler numara sırasıyla, **tek çalışma ağacında, bir seferde tek uygulayıcı** (subagent-driven; her
görevin ardından inceleme). Paralel yol yok. Büyük dosyalar birden çok görevde değişir: `program-plan.ts` (2, 3, 15),
`training-days.ts` (1, 3, 4, 5, 15), `workout-plan.ts` (6a, 13, 15), `workout-routes.ts` (4, 6a, 15),
`program-form.tsx` (9, 10); `workout-screen.tsx`'e (~2440 satır) yalnız 13 dokunur.

**Boyutlar:** S ≈ yarım saatlik iş, tek dosya ve testi · M ≈ 1–2 saat, birkaç dosya · L ≈ yarım gün, çok dosya.

---

## Kararlar

Kullanıcının kararları (kesin; yeniden açılmaz): (1) PT her programı hafta günlerine atar, danışan atamaz; kendi
programında yazar danışandır. (2) Bugün'de atanmış program kolaylıktır; her gün her program yapılabilir ("Başka
program seç"). (3) Atanmamış günde danışan programların listesinden seçer, öneri yok. (4) Pazartesi Alt vücut
yapıldıysa Salı yine Alt vücut önerilir; kaydırma yok. (5) Varsayılan adlar "Program A…", saklanan adlar değişmez.
(6) Geliştirmeye özel tohum ucu test danışanına üç programlı PT programını kurar.

Plan kararları (yöneticinin; incelemeden sonra kesinleşti):

1. **Veri.** Günün (programın) isteğe bağlı alanı `weekdays?: number[]` (ISO), yalnız kendi evresinde geçerli; bir
   hafta günü evrede en çok bir programa (şema denetler: "Aynı gün iki programa atanmış."). Bir program birden çok
   güne atanabilir (Tüm vücut hem Pazartesi hem Cuma). Boş dizi dosyaya yazılmaz (alan yok = atanmamış).
   `schedule.weekdays` = şu anki evrenin atamalarının birleşimi; PT kaydı, evre geçişi ve kendi programın her
   yazımı yeniden yazar (`settleSchedule`); `schedule.at` birleşim değişince ya da danışan katmanı düşünce "şimdi"
   olur (kaçan gün penceresi). Hiç atama yoksa `schedule` yazılmaz ve haftalık hedef evrenin `daysPerWeek`'i. Atamalı
   evrede `daysPerWeek` kaydedilmez (sıklık atanmış gün sayısı; "Haftada kaç gün" seçicisi yalnız atamasız evrede).
   **Eski programın ilk PT kaydı** (başka değişiklik olmasa da) atamalı evredeki eski `daysPerWeek`'i düşürür ve
   geçmişe sıklık satırını yazar ("Sıklık kaldırıldı (önce …)"): ekranlar artık eski sıklığı göstermez.
2. **Eski programlar okunurken atanır** (`upgradeProgram`, saf, testli). Hiçbir günde `weekdays` alanı yoksa ve
   `schedule.weekdays` doluysa her evrede programlar sırayla seçili günlere: A → ilk gün, B → ikinci… Hafta günü
   programdan fazlaysa **başa sarar** (3 program, Pzt-Çar-Cum-Cmt → A: Pzt + Cmt). Gerekçe: birleşim kayıttaki
   `schedule.weekdays`'in aynısı kalır; haftalık hedef, kaçan gün ve Genel bakış eski dosyada birebir aynı sonucu
   verir, PT'nin seçtiği sıklık korunur; atanmasız bırakmak seçili günleri "atanmamış güne" çevirirdi. Program
   günden fazlaysa sondakiler atanmasız kalır ("Başka program seç"ten yapılır; PT düzenleyicide "Gün atanmamış:
   Program D" görür). Hafta günü seçilmemişse atama yok, danışan her gün seçer. Türetme `clientSchedule`'a bakmaz.
   Eski sekme ve eski taslak (gün başına alan yok, program düzeyinde `weekdays` var) aynı kuralla atanır
   (`upgradeProgramBody`, `bodyWithAssignments`, taslağın `prepare`'i); kendi programın eski sekmesi günleri açılıştaki
   gibi gönderdiyse (`baseWeekdays` = `weekdays`) kayıttaki atamalar gün kimliğiyle korunur.
   **Yazım:** okuma hiçbir şey yazmaz. Dosyayı ayrıştırılmış hâliyle yazan danışan yazımları (kendi programın
   paylaşılması ya da bitişte güncellenmesi, sürüm 1 PT dosyasında bitiş) türetilmiş atamayı da yazabilir; anlam
   değişmez (aynı atama). Sürüm 2 PT dosyası danışan yazımlarında (bitiş, hedef güncelleme) bugünkü gibi ham hâliyle
   korunur: gerçek danışanın dosyası bu yolla yeni biçime geçmez; yalnız PT kaydı ya da evre geçişi geçirir.
3. **Danışanın gün katmanı kalkar.** Danışan günleri hiçbir programda değiştirmez (kullanıcı kararı 1).
   `clientSchedule` şemada okunur kalır ama yok sayılır: `effectiveSchedule` yalnız PT'nin `schedule`'ını ve
   atamaları okur. "Günlerini değiştir" (Bugün'ün şeridinde, Ayarlar'da) bütün PT programlarında, atamalı ya da
   atamasız, kalkar; kendi programda günler programın formundadır (Ayarlar "Düzenle"ye götürür). `/api/me/schedule`
   PT programında ve kendi programda 409 döner: "Günlerini antrenörün belirliyor." / "Günleri programını düzenlerken
   seç." (eski telefon). PT tarafında "Danışan değiştirdi" rozeti ve "Programdaki günlere dön" kalkar; kayıtta katman
   varsa PT'nin program sayfası tek satırla söyler ("Danışanın eski gün seçimi (Pzt, Çar) artık kullanılmıyor;
   programın ilk kaydında silinir."). PT'nin ilk kaydı ya da evre geçişi katmanı siler, geçmişe "Danışanın günleri
   kaldırıldı (…)" yazar ve `schedule.at`'i şimdiye alır. `resetClientSchedule`, `resetSchedule`, PT'nin
   `/api/clients/[id]/program/schedule` ucu ve `ResetDaysButton` temizlik görevinde silinir. Sonuç: danışan eskiden
   PT'nin günlerini kendi katmanıyla değiştirdiyse Bugün artık PT'nin günlerini izler.
4. **Kaçan gün penceresi.** `scheduleSince` danışan katmanının anını `effectiveSchedule`'dan değil doğrudan ham
   alandan (`program.clientSchedule?.at`) okur: yayından sonra kayıttaki eski katman pencereyi geri çekip geçmiş
   günleri "kaçtı" yapamaz. Katman düşünce `schedule.at` = şimdi (Karar 3), pencere yine geri gitmez.
5. **Dönüş (rotasyon) kalkar.** Bitiş dönüşü ilerletmez, seansa `rotation` yazılmaz, bitişteki "Sıradaki antrenman:
   … · Değiştir" seçimi kalkar. `rotation` (program) ve `ROTATION_CHOICES` (seans) şemada okunur kalır; eski telefonun
   gönderdiği `rotation` yok sayılır. `nextDayId`'nin yerine her yerde tek kural: **`upcomingAssigned(program,
   today)`** = şu anki evrede bugüne atanmış program, yoksa bugünden sonraki ilk atanmış gün (en çok 6 gün ileri);
   atama yoksa null. PT ekranlarındaki "sıradaki", kısıt çakışmasının `next`'i (Dikkat maddesi), danışanın Programlar
   sekmesi bunu kullanır. Sunucunun varsayılan günü (`?day=` yok, yarım antrenman yok): `upcomingAssigned ?? evrenin
   ilk günü` (`defaultDayId`); yanıtın `program.nextDayId` alanı bu günle dolar (eski telefonun önbellek eşleşmesi
   bozulmasın). Bugün her zaman `?day=<id>` ile bağlar.
6. **`plannedDayId`** = antrenmanın gününe (yeni seansın tarihi) şu anki evrede atanmış program; atanmamış günde yok.
   Bitişte sunucu `doc.date`'ten yeniden hesaplar (`planFinish`): telefonda eskimiş plan yanlış bildirim üretmez.
   Bildirim (`other_day`) yalnız o gün atanmış program varken başkası yapılınca: "Alt vücut yerine Üst vücut yapıldı"
   (kalıp aynı); rozet "başka program". Kendi programda bildirim yok (bugünkü gibi).
7. **Bugün kartı.** Bugüne atanmış program varsa kart onu gösterir ("Salı · Alt vücut", önizleme, kısıt notları,
   Antrenmana başla → `/me/antrenman?day=<id>`, "Başka program seç"). Yoksa "Bugün atanmış program yok" ve programların
   listesi (özet, "son: 21 Eki" bilgi olarak, [Başla]). Hafta şeridi: yapıldı (oturumun adı), kaçtı (atanmış gün geçti,
   antrenman yok), planlı (bugün ve ilerideki atanmış gün, atamanın adı), dinlenme; "sırada" durumu ve şeridin
   altındaki "Sırada: …" satırı kalkar. "Sonraki günler · Günler sırayla döner" kartı "Haftanın programı" olur.
   **Çevrimdışı:** atanmış gün çevrimdışı da açılır (Bugün'ün varsayılan yanıtı bugünün programını telefona alır);
   atanmamış günde önbellekte olmayan programın [Başla]'sı ağ ister, çevrimdışı mevcut "Bağlantı yok…" mesajı çıkar.
   Bu gerileme kabul edildi: bütün programların planlarını önceden çekmek GitHub'daki depolamaya yük olurdu.
8. **Adlar ve terimler.** Yeni varsayılan "Program A…" (`nextDayName`; harf "Gün X" ya da "Program X" ile alınmışsa
   atlanır: "Gün A", "Gün B" olan programa eklenen "Program C" olur). Şeridin kısa adı iki öneki de tanır. Tekil öğe ve
   eylem "program" ("Program A", "+ Program", "Başka program seç"); **sayım "antrenman"** ("2 antrenman · haftada 2");
   haftalık görünümün tek adı **"Haftanın programı"** (danışan ve PT). **Risk:** "program" aynı zamanda bütün plan
   (Program sekmesi, "Antrenörünün programı", program çipi, "Programını güncelleyelim mi?"); "Başka program seç"
   Bugün'ün program çipiyle (PT'nin programı ↔ kendi program) karıştırılabilir. Kullanıcı bu adı seçti; programı
   silen menü öğesi "Kaldır" olur, sayfa başlıkları bütün planı söylemeye devam eder.
9. **PT düzenleyici.** Seçili programın kartında 7 gün çipi ("Günleri"): başka programa atanmış gün kapalıdır, nedeni
   çipin erişilebilir adında ve altındaki satırda ("Başka programda: Per · Üst vücut"). Program düzeyindeki gün
   seçici kalkar; yerinde salt okunur özet ("Sal · Alt vücut, Per · Üst vücut, Paz · Tüm vücut"). Evreli programda
   atama evre başına; "Evreyi kopyala" atamaları korur, "Kopyala" (aynı evrede) ve "Evreye taşı" atamasız bırakır,
   "Evreleri kaldır" yalnız şu anki evrenin atamalarını tutar (onay penceresi söyler); evre geçişi yeni evrenin
   atamalarını `schedule`'a yazar. Kas yükü (haftalık) atamalardan: her programın yükü × atandığı gün sayısı.
10. **Kendi programlar.** Aynı çipler `own-program-form`'da (danışan ve PT'nin `own-pt` kipi); program düzeyindeki
    seçici kalkar; "Gün atamazsan haftada kaç gün" yalnız hiç atama yokken. `schedule` her yazımda birleşimden;
    index'in `weekdays`'i dosyadan türediği için kendiliğinden uyumlu (`ownIndexItemOf`). PT'nin programından kopyalanan
    programlar (`copyPtDays`) atamasız gelir; danışan formda atar.
11. **AI taslakları.** Koç ve asistan motorları programları "Program A…" adlandırır ve gün başına bir program taslağını
    o güne atar (`weekdays: [gün]`); program düzeyindeki `weekdays` uyum için kalır. `coachProgramMatches` iki tarafı
    aynı biçime getirip karşılaştırır (atamalar günlerde, atamalı evrede `daysPerWeek` yok sayılır).
12. **Deneme geçmişi** (`demo-history.ts`): tarihler atanmış günlere düşer, her tarihin programı o günün ataması;
    atamasız programda bugünkü takvim (sıklık dağılımı) ve sırayla programlar (dönüş programa yazılmadan).
13. **Tohum ucu.** `POST /api/dev/seed-program { clientId }`: `seed-history` gibi kapılı (üretimde 404, PT oturumu ve
    adı "Test " ile başlayan danışan, `originGuard`). Danışanın `program.json`'unu taze kayıtla (revision 1) değiştirir:
    `clientSchedule`, `clientTargets` ve `rotation` gider. Kimlikler sabit tohumla belirlenimli (yeniden tohumlama gün
    kimliklerini değiştirmez). Gerçek danışana ad kapısı yüzünden yazamaz; yönetici yalnız `c_zmrbywaz` ile çağırır.
14. **Eski tasarım.** `docs/plans/2026-10-26-kullanilabilirlik-yeniden-duzen-design.md` "Faz 3"ünün (110–135) şu
    maddeleri değişir: "Danışan bir antrenmanı başka güne taşıyabilir; PT 'Danışan değiştirdi' olarak görür" kullanıcı
    kararı 1 ile **geçersiz**; "Antrenmansız günde 'Bugün dinlenme · Sonraki: Çarşamba, Alt vücut' ve 'Başka antrenman
    yap'" kullanıcı kararı 3 ile **geçersiz** (liste, öneri yok); "ayrı 'Haftada kaç gün' alanı kalkar" yumuşadı
    (atamasız evrede kalır); "hiç gün seçilmemişse sıklığa göre varsayılan dağılım" yapılmadı (danışan seçer); 3 adımlı
    oluşturma bu fazda yok. 16. görev bu satırları günceller.

### Metin tablosu

| Yer | Eski | Yeni | Görev |
|---|---|---|---|
| Bugün, atanmış gün | başlık "Çarşamba · Gün B" | "Salı · Alt vücut" | 12 |
| Bugün, atanmamış gün | — | başlık "Bugün atanmış program yok", açıklama "Yapmak istediğin programı seç."; programda hiç atama yoksa başlık "Bugün hangi programı yapacaksın?" | 12 |
| Bugün liste satırı | — | ad · "6 hareket · ≈ 50 dk" · "son: 21 Eki" ya da "henüz yapılmadı" · [Başla] (erişilebilir ad "Başla: Alt vücut") | 12 |
| Bugün kısa satırı | "Bugün dinlenme günün" | kalkar ("Bugünkü antrenmanını yaptın" kalır) | 12 |
| Bugün ikincil düğme | "Başka gün seç" | "Başka program seç" | 11 |
| Seçim sheet'i | "Hangi günü yapacaksın?" · "Antrenörüne bildirilir. Sıra seçtiğin günden devam eder." · satır "sıradaki" · "Bu günle başla" | "Hangi programı yapacaksın?" · PT'de bugün atanmışsa "Bugün Alt vücut planlı; başka birini seçersen antrenörüne bildirilir.", değilse "Bugün için bir program seç." · satır "bugün" ya da "Perşembe" · "son: 23 Eki" / "henüz yapılmadı" · "Bu programla başla" | 11 |
| Haftalık kart | "Sonraki günler" · "Günler sırayla döner." | "Haftanın programı"; satır "Salı · Alt vücut", "6 hareket · ≈ 50 dk", bugünün satırında "bugün"; sonda "Gün atanmamış: Program D" | 12 |
| Şerit, ekran okuyucu | "Çarşamba, bugün, sırada: Gün B" | "Salı, bugün, antrenman günü: Alt vücut" · "Pazartesi, yapıldı: Üst vücut" · "Salı, kaçtı: Alt vücut" · "Çarşamba, dinlenme" | 11 |
| Şeridin altı | "Sırada: yarın · Gün B" · "Günlerini değiştir" / "Antrenman günlerini seç" | ikisi de kalkar | 11 |
| Ayarlar "Antrenman günleri" | "Sal, Per, Cmt (antrenörünün seçimi)" · [Değiştir] | PT: "Sal · Alt vücut, Per · Üst vücut, Paz · Tüm vücut" ya da "Henüz gün atanmadı." + "Günleri antrenörün belirliyor." (düğme yok); kendi: programın adı + atamalar + [Düzenle] | 11 |
| Gün ucu (409) | — | PT: "Günlerini antrenörün belirliyor."; kendi: "Günleri programını düzenlerken seç." | 4 |
| Antrenman ekranı bildirimi | "Gün B seçildi" · "Antrenörüne bildirilecek" | "Üst vücut seçildi" · "Bugün Alt vücut planlıydı; antrenörüne bildirilecek." | 13 |
| Bitiş sheet'i | "Sıradaki antrenman: Gün B · Değiştir" | kalkar | 13 |
| PT bildirimi | "Başka gün seçildi: Gün B" (adsız hâl) | "Başka program seçildi: Üst vücut" ("X yerine Y yapıldı" kalıbı aynı) | 7 |
| Bildirim türü · rozetler · PT işareti | "Başka gün" · "başka gün" · "başka gün seçildi" | "Başka program" · "başka program" · "başka program seçildi" | 7 |
| Bildirimler kartı boş metni | "Danışan başka gün seçtiğinde, …" | "Danışan bugünün programı yerine başka birini yaptığında, …" | 7 |
| Program satırı (`programLine`) | "2 gün · haftada 2 · Sal, Per" · "gün seçilmedi" | "2 antrenman · haftada 2 · Sal, Per" · "gün atanmadı" | 5 |
| PT ad alanı | "Gün adı" · "Ör. Gün A" | "Program adı" · "Ör. Alt vücut" | 9 |
| PT çip menüsü | "+ Gün" · "Boş gün" · "Seçili günün kopyası" | "+ Program" · "Boş program" · "Seçili programın kopyası" | 9 |
| PT program menüsü | "Gün işlemleri: X" · "Günü sil" | "Program işlemleri: X" · "Kaldır" | 9 |
| PT program kartı alt başlığı | "Programın 2. günü · danışanın sıradaki günü" | "Salı, Perşembe" ya da "Gün atanmadı" | 9 |
| PT gün çipleri | — | etiket "Günleri"; açıklama "Danışan bu günlerde Bugün ekranında bu programı görür." ya da "Başka programda: Per · Üst vücut, Paz · Tüm vücut" | 9 |
| `add-day-dialog.tsx:44,46` | "Şablondan gün ekle" · "… yeni gün olarak eklenir" | "Şablondan program ekle" · "… yeni program olarak eklenir" | 9 |
| `save-template-dialog.tsx:79,105,111` | "Bu günün hareketleri" · "Bu günde n not var." · "Bu günde düzeltilmesi gereken…" | "Bu programın hareketleri" · "Bu programda n not var." · "Bu programda düzeltilmesi gereken…" | 9 |
| PT evresiz kart (`days-card.tsx`) | "Günler" · "Günler sırayla döner (A → B → C); sıradaki gün işaretli. …" | "Haftanın programı" · "Her program haftanın günlerine atanır; danışan o gün Bugün ekranında onu görür, istediği gün başka birini de yapabilir. Uyum, güç gibi dönemler için program evrelere bölünebilir." | 10 |
| PT evreler kartı (`phases-card.tsx`) | "Her evrenin günleri sırayla döner; …" | "Her evrenin programları kendi günlerine atanır; süre dolunca sonraki evreye geçiş önerilir. Program başka evreye menüsünden taşınır." | 10 |
| `phases-card.tsx:211` | "… danışanın sıradaki antrenmanı bu evrenin ilk günü olur." | "… danışan bu evrenin programlarını atandıkları günlerde görür." | 10 |
| `program-form.tsx:334` | "Evreler kaldırıldı; günler tek listede sırayla döner." | "Evreler kaldırıldı; programlar tek listede, öteki evrelerin gün atamaları kalktı." | 10 |
| `unphase-dialog.tsx:48,53` | "{n} evredeki {d} gün tek listede birleşir ve sırayla döner: …" · "Birleşince {d} gün olur; … en fazla 7 gün …" | "{n} evredeki {d} antrenman tek listede birleşir: … Yalnız '{şu anki}' evresinin gün atamaları kalır; öteki evrelerden gelen programlar atanmamış olur." (sıklık cümlesi yalnız şu anki evre atamasızsa) · "Birleşince {d} antrenman olur; tek listede en fazla 7 olabilir. …" | 10 |
| PT özet (program düzeyi gün alanı) | "Antrenman günleri" seçici · "Danışan değiştirdi" rozeti · "Programdaki günlere dön" | "Haftanın programı" (evreli kartta etiket; evresiz kartın kendisi) · "Henüz gün atanmadı." · "Gün atanmamış: Program D"; rozet ve geri dönüş yok | 10 |
| PT program sayfası `page.tsx:168` | "3 gün · haftada 3 gün" | "3 antrenman · haftada 3" (`phaseFrequency`) | 10 |
| `page.tsx:405-409` | "Günler" · "(Şu anki evrenin) günleri sırayla döner (A → B → C); sıradaki gün işaretli." | "Haftanın programı" · "Danışan atanan programı o gün Bugün ekranında görür." (evreli: "Şu anki evrenin programları. …") | 10 |
| `page.tsx:474-475` ve evre tablosu | "Döngü" · "Günler sırayla döner; danışan sıradaki günü görür." · satır "Sıradaki gün" | "Durum" (açıklama yok) · satır "Bugün / sıradaki": "Bugün · Alt vücut" ya da "Perşembe · Üst vücut" | 10 |
| `page.tsx:529` (evre listesi) | `perWeek(phase.daysPerWeek)` | `phaseFrequency(phase)` | 10 |
| `page.tsx` "Antrenman günleri" satırı | günler + rozet + geri dönüş | `assignmentsText`; kayıtta katman varsa "Danışanın eski gün seçimi (Pzt, Çar) artık kullanılmıyor; programın ilk kaydında silinir." | 10 |
| `own/[pid]/page.tsx:117` | "Günler" · "Günler sırayla döner (A → B → C); sıradaki gün işaretli." | "Haftanın programı" · "Danışan atanan programı o gün Bugün ekranında görür." | 10 |
| Kas yükü kartı | "haftada N gün, M günlük döngü → her gün haftada F kez" | atamalıda "Planlanan haftalık yük atanmış günlere göre (Sal, Per, Paz)." | 10 |
| PT şema hataları | "Gün adı gir." · "Güne en az bir hareket ekle." · "Bu evrede aynı adda iki gün var." · "Evrede en az bir gün olmalı." · "Bir evrede en fazla 7 gün olur." | "Program adı gir." · "Programa en az bir hareket ekle." · "Bu evrede aynı adda iki program var." · "Evrede en az bir program olmalı." · "Bir evrede en fazla 7 antrenman olur." · yeni "Aynı gün iki programa atanmış." | 2 |
| Program geçmişi | — | kapsam programın adı: "Günleri: Per → Per, Cum" · "Günleri: yok → Sal"; "Danışanın günleri kaldırıldı (Pzt, Çar)" | 3 |
| Danışanın Programlar sekmesi | "sıradaki" · "Sıradaki: Gün B" | "Salı · bugün · son: 21 Eki" / "Perşembe" · "Bugün: Alt vücut" ya da "Sıradaki: Perşembe · Üst vücut" | 12 |
| `program-days.tsx:48` | "Bu günde hareket yok." | "Bu programda hareket yok." | 12 |
| `copy-day-sheet.tsx:40,61,72` | "antrenörün günü sonra değiştirse de…" · "7 gün dolu" · "3 gün" | "antrenörün bu programı sonra değiştirse de…" · "7 antrenman dolu" · "3 antrenman" | 12 |
| Program kartı evre satırı (`program-card.tsx:221`) | `frequencyLabel(phase.daysPerWeek)` | `frequencyLabel(phaseFrequency(phase))` | 12 |
| Kendi program formu | "Gün adı" · "+ Gün" · "Gün ekle" · "Boş gün" · "Bu programdaki bir günü kopyala" · "Günü sil" · "En fazla 7 gün." · program düzeyinde "Antrenman günleri" | "Program adı" · "+ Program" · "Program ekle" · "Boş program" · "Bu programdakilerden kopyala" · "Kaldır" · "En fazla 7 antrenman." · seçili programda "Günleri" ve "Bu günlerde Bugün ekranında bu programı görürsün." | 14 |
| `new-program-flow.tsx:155,186` | "Günler senin hedeflerinle kopyalanır; …" · "Gün seçmezsen boş bir günle başlar." | "Programlar senin hedeflerinle ve atanmamış olarak kopyalanır; günlerini sen seçersin. …" · "Hiçbirini seçmezsen boş bir programla başlar." | 14 |
| Ön izleme (`appearance-preview.tsx`) | "Üst vücut · Gün A" · "Gün A seni bekliyor." | "Salı · Üst vücut" · "Alt vücut seni bekliyor." | 5 |

---

## A · Saf mantık

### Task 1: Atama yardımcıları (`day-assignments.ts`)

**Boyut:** S · **Files:** Create `src/lib/day-assignments.ts`, Test `src/lib/day-assignments.test.ts`; Modify
`src/lib/training-days.ts` (taşınanları yeniden dışa aktarır) · Etkilenen testler: yeni dosya; `training-days.test.ts`
değişmeden geçer.

Modül hiçbir şey içe aktarmaz (program-plan ve training-days ikisi de okuyacak; döngü olmasın). `WEEKDAYS`,
`Weekday`, `WEEKDAY_SHORT`, `WEEKDAY_NAMES`, `weekdaysText`, `weekdaysChangeText` buraya taşınır (`program-plan.ts`'in
3. görevde geçmiş cümlesi kurabilmesi için); `training-days.ts` hepsini `export { … } from './day-assignments.ts'`
ile yeniden dışa aktarır, `normalizeWeekdays` `cleanWeekdays`'e dayanır. Çağıranların importları değişmez.

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
  keepAssignments,
  phaseWeekdays,
  takenWeekdays,
  upgradeAssignments,
  weekAssignments,
  weekdayConflicts,
  weekdayNames,
  weekdaysChangeText,
  weekdaysText,
} from './day-assignments.ts';

const plan = [
  { id: 'd_aaaaaa', name: 'Alt vücut', weekdays: [2] },
  { id: 'd_bbbbbb', name: 'Üst vücut', weekdays: [4] },
  { id: 'd_cccccc', name: 'Tüm vücut', weekdays: [7] },
];
const IDS = ['d_aaaaaa', 'd_bbbbbb', 'd_cccccc', 'd_dddddd'];
const bare = (n: number) => IDS.slice(0, n).map((id, index) => ({ id, name: `Gün ${'ABCD'.charAt(index)}` }));

describe('hafta günü atamaları', () => {
  test('birleşim, o günün programı, haftanın sırası, metinler', () => {
    assert.deepEqual(phaseWeekdays(plan), [2, 4, 7]);
    assert.equal(hasAssignments(plan), true);
    assert.equal(hasAssignments(bare(2)), false);
    assert.equal(dayOnWeekday(plan, 4)?.name, 'Üst vücut');
    assert.equal(dayOnWeekday(plan, 1), null);
    assert.deepEqual(weekAssignments(plan).map(({ weekday, day }) => [weekday, day.name]), [[2, 'Alt vücut'], [4, 'Üst vücut'], [7, 'Tüm vücut']]);
    assert.deepEqual(weekdayNames(plan), { 2: 'Alt vücut', 4: 'Üst vücut', 7: 'Tüm vücut' });
    assert.deepEqual(cleanWeekdays([7, 2, 2, 0, 8, 1.5, '3']), [2, 7]);
    assert.equal(weekdaysText([4, 2]), 'Sal, Per');
    assert.equal(weekdaysChangeText([2, 4], [2, 4, 5]), 'Antrenman günleri: Sal, Per → Sal, Per, Cum');
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

  test('eski sekmenin günleri açılıştakiyle aynı: kayıttaki atamalar gün kimliğiyle korunur', () => {
    const sent = [{ id: 'd_aaaaaa', name: 'Alt vücut' }, { id: 'd_eeeeee', name: 'Yeni' }];
    assert.deepEqual(keepAssignments(sent, plan).map((day) => day.weekdays), [[2], undefined]);
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
 * "bütün günler kaldırıldı" demektir, dosyaya yazılmaz. Hafta günü sabitleri ve metinleri de burada.
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
 * Gün programdan fazlaysa başa sarar: birleşim seçili günlerin aynısı kalır. Program günden fazlaysa sondakiler
 * atanmasız (alan yok). Gün yoksa aynı dizi.
 */
export function deriveAssignments<D extends AssignableDay>(days: readonly D[], weekdays: readonly number[]): D[];
/** Alanı olmayan günlere kayıttaki aynı kimlikli günün ataması (kendi programın eski sekmesi). */
export function keepAssignments<D extends AssignableDay>(days: readonly D[], stored: readonly AssignableDay[]): D[];
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

**Step 4:** PASS; `training-days.test.ts` değişmeden PASS.

typecheck, lint, test · Commit: `feat(program): weekday assignment helpers`

---

### Task 2: Şema, okuma ve düzenleyici işlemleri

**Boyut:** M · **Files:** Modify `src/lib/schemas/program.ts`, `src/lib/schemas/own-program.ts`,
`src/lib/program-plan.ts` · Test `src/lib/schemas/program.test.ts`, `src/lib/program-plan.test.ts` · Etkilenen
testler (kayıtlı `schedule`'lı fikstürün okunmuş günleri artık `weekdays` taşır; yazılan dosyayı ya da okunan günleri
birebir karşılaştıranlar güncellenir): `src/lib/schemas/program.test.ts`, `src/lib/program-plan.test.ts`,
`src/lib/own-program-files.test.ts`, `src/lib/own-program-index.test.ts`, `src/lib/workout-routes.test.ts`,
`src/lib/demo-history.test.ts` (yalnız gün karşılaştırması varsa). `proposals.test.ts` fikstüründe `schedule` yok,
etkilenmez.

**Step 1: Test** (fikstür: `programFile` — `src/lib/testing/session-fixtures.ts`; "Gün A", "Gün B", sabitleri
`PHASE`, `DAY_A`, `DAY_B` dosyadan doğrulanır). Şema testleri `schemas/program.test.ts`'e, işlemler
`program-plan.test.ts`'e.

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

  test('eski sekmenin gövdesi: program düzeyindeki günler atanır; kendi programda açılıştaki günler türetilmez', () => {
    const body = v.parse(programSaveSchema, { ...bodyOf(programFile()), weekdays: [2, 4], baseRevision: 7 });
    assert.deepEqual(body.phases[0]?.days.map((day) => day.weekdays), [[2], [4]]);
    const untouched = upgradeProgramBody({ ...bodyOf(programFile()), weekdays: [4, 2], baseWeekdays: [2, 4] }) as ProgramBody;
    assert.equal(hasAssignmentField(untouched.phases), false);
  });

  test('bodyWithAssignments: eski gövde atanır, yeni gövdeye dokunulmaz', () => { /* … */ });

  test('normalizeProgram: atama sıralı kalır, boşu yazılmaz; atamalı evrede sıklık düşer', () => {
    // A: [4, 2], B: [] ve evrede daysPerWeek: 3 → A: [2, 4], B alansız, evrede daysPerWeek yok
  });

  test('kopya, taşıma, birleştirme', () => {
    // copyDay → yeni günde weekdays yok; copyPhase → günler aynı weekdays;
    // moveDayToPhase → taşınan gün alansız; mergePhases → yalnız şu anki evrenin günleri atamalı kalır
  });

  test('haftalık kas yükü atamalardan: yük × atanan gün sayısı', () => {
    // A (iki güne atanmış) ve B (bir güne): weekly = 2 × A + 1 × B; factor null; assigned [birleşim]
    // atamasız evre bugünkü gibi (daysPerWeek ÷ gün sayısı), assigned []
  });
});
```

(`bodyOf`: `{ phased, currentPhaseId: current.phaseId, phases }` kuran küçük yardımcı; dosyada benzeri varsa o
kullanılır. Yorumlu testler dosyanın mevcut yardımcılarıyla somut yazılır; beklenen değerler yorumdaki gibidir.)

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
  metin tablosundaki şema hataları. `weekdaysSchema`'nın belge yorumu: "Programlar günlere atanır (Faz 3);
  `schedule.weekdays` şu anki evrenin atamalarının birleşimi". `programSchema`'daki `schedule`, `clientSchedule`
  ("okunur, yok sayılır"), `rotation` ("yalnız eski dosyalar") yorumları Kararlar 1, 3, 5'e göre.
- `schemas/own-program.ts`: `ownProgramDaySchema`'ya aynı `weekdays` (aynı sırada), evrenin `days` borusuna aynı
  denetim, metinler. Dosya başı yorumunda "Günler 1–7" → "Programlar 1–7, hafta günlerine atanır".
- `program-plan.ts`:
  - `ProgramDay` tipine `weekdays?: number[]`; dosya başı yorumu "Günler sırayla döner" → atama (Karar 1, 5).
    `ProgramBody.weekdays` yorumu: "Eski gövde: gün başına atama yoksa buradan türetilir."
  - `upgradeProgram`: `const phases = upgradeAssignments(upgradePhases(raw.phases), isRecord(raw.schedule) ?
    raw.schedule.weekdays : undefined)`.
  - `upgradeProgramBody`: `raw.baseWeekdays` dizi ve `raw.weekdays` ile aynı küme ise türetme yok (kendi programın eski
    sekmesi; atamaları 3. görev kayıttan korur); değilse `upgradeAssignments(upgradePhases(raw.phases), raw.weekdays)`.
  - Yeni `bodyWithAssignments(body: ProgramBody): ProgramBody` (tiplisi; aynı kural): şema dışından gelen gövdeler için
    (AI yayını; `saveProgram` ve `coachProgramMatches` 3. görevde).
  - `normalizeProgram`: gün `...(cleanWeekdays(day.weekdays).length > 0 ? { weekdays: cleanWeekdays(day.weekdays) } : {})`
    (name'den sonra); evre `daysPerWeek` yalnız `!hasAssignments(phase.days)` iken.
  - `copyPhase`: günler `weekdays`'i taşır. `copyDay`: zaten taşımıyor (test sabitler). `moveDayToPhase`: taşınan
    günden `weekdays` atılır. `mergePhases`: şu anki evrenin dışından gelen günlerden `weekdays` atılır (yorum).
  - `phaseMuscleLoad`: dönüş tipine `assigned: number[]`; evrede atama varsa `weekly` = gün yükü × atandığı gün sayısı
    toplamı (`templateMuscleLoad({ blocks: day.blocks })` gün gün, `scaleLoad` ile), `factor: null`; yoksa bugünkü
    hesap, `assigned: []`. Çağıranlar (`PhaseLoad`'a geçenler) yalnız yeni alanı görmezden gelir (10. görev kullanır).

**Step 4:** PASS; etkilenen dosyalar yalnız bu farkla güncellenmiş, `npm test` yeşil.

typecheck, lint, test · Commit: `feat(program): per-workout weekdays in the schema; derive old programs on read`

---

### Task 3: Yazımlar: PT kaydı, evre geçişi, kendi program, AI eşleşmesi

**Boyut:** M · **Files:** Modify `src/lib/program-plan.ts`, `src/lib/program-diff.ts`, `src/lib/training-days.ts`
(`ptScheduleEdit` kalkar), `src/lib/programs.ts` (`saveProgram`), `src/lib/own-programs.ts`,
`src/lib/own-program-files.ts` (`createOwnProgram` çağrısı), `src/lib/ai/coach-engine.ts` (`coachProgramMatches`) ·
Test ve etkilenen testler: `src/lib/program-diff.test.ts`, `src/lib/program-plan.test.ts`,
`src/lib/own-programs.test.ts`, `src/lib/own-program-files.test.ts`, `src/lib/training-days.test.ts`
(`ptScheduleEdit` testleri `settleSchedule` testlerine taşınır), `src/lib/ai/coach.test.ts` (163–170).
`proposals.test.ts` değişmeden geçmeli (fikstürde `schedule` ve katman yok).

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

test('değişmeyen eski program: sıklıksız kayıt yok; sıklıklıda ilk kayıt yalnız sıklığı düşürür', () => {
  const plain = v.parse(programSchema, programFile({}, { schedule: { weekdays: [2, 4] } }));
  assert.equal(applyProgramEdit(plain, { phased: false, currentPhaseId: PHASE, phases: plain.phases }, ctx, NOW), null);
  // Aynı dosya, evrede daysPerWeek: 2 → gövde normalizeProgram'ın yapacağı gibi sıklıksız (atamalı evre):
  // sonuç null değil, tek değişiklik sıklık satırı (frequencyChange metni), schedule aynen (at değişmez).
});

test('kayıttaki danışan katmanı ilk PT kaydında düşer: satır geçmişe, schedule.at şimdi', () => {
  // clientSchedule: { weekdays: [1, 3], at } olan dosya, başka değişiklik yok →
  //   program.clientSchedule yok, schedule.at = NOW, changes ['Danışanın günleri kaldırıldı (Pzt, Çar)']
});

test('bütün atamalar kalkınca schedule düşer', () => {
  // A ve B'den bütün günler kaldırılınca → program.schedule yok, 'Antrenman günleri kaldırıldı (önce Sal, Per)'
});

// program-plan.test.ts
test('settleSchedule: birleşim, katman, an', () => { /* üç hâl: birleşim değişti / katman düştü / değişiklik yok (aynı schedule, cümle yok) */ });
test('createProgramRecord: schedule şu anki evrenin birleşimi', () => { /* A: [2], B: [4] → schedule { weekdays: [2, 4] } */ });
test('evre geçişi: yeni evrenin birleşimi ve cümleleri; katman düşer', () => {
  // evre 1: A [1, 3]; evre 2: X [2], Y [4]; kayıtta clientSchedule → startPhase(evre 2) →
  //   schedule { weekdays: [2, 4], at: şimdi }, clientSchedule yok, log[0].changes:
  //   ["Şu anki evre: 'Evre 1' → 'Evre 2'", 'Antrenman günleri: Pzt, Çar → Sal, Per', 'Danışanın günleri kaldırıldı (…)']
  // atamasız evreye geçiş → schedule yok
});

// own-programs.test.ts
test('kendi program: oluşturma ve kayıt birleşimi yazar; atamada sıklık düşer', () => {
  // createOwnProgram({ phases: [A: [1], B: [5]], daysPerWeek: 3 }) → schedule.weekdays [1, 5], daysPerWeek yok
  // applyOwnEdit: B'nin günü [5] → [6] → schedule.weekdays [1, 6], log'da 'Günleri: Cum → Cmt'
});
test('kendi programın eski sekmesi: atamalar kayıttan korunur', () => { /* alansız gövde → keepAssignments */ });
test('PT günlerinin kopyası atamasız gelir', () => { /* copyPtDays: atamalı PT günleri → kopyalarda weekdays yok */ });

// ai/coach.test.ts (163–170): yayımlanan taslağın gerçek biçimi
test('published-program recovery compares the real stored shape with the form draft', () => {
  // stored = createProgramRecord(bodyWithAssignments(draft.body)); coachProgramMatches(stored, draft.body) === true
  // bir günün ataması değiştirilmiş stored → false (eski `schedule: { weekdays: [2] }` olumsuz durumu bunun yerine)
});
```

**Step 2:** FAIL.

**Step 3: Uygula**

- `program-plan.ts`:

```ts
/**
 * PT yazımında antrenman günleri (Faz 3; kayıt ve evre geçişi): `schedule.weekdays` = şu anki evrenin atamalarının
 * birleşimi (boşsa alan yok). Kayıttaki danışan katmanı (ham `clientSchedule`) her PT yazımında düşer. Birleşim
 * değişince ya da katman düşünce `schedule.at` şimdi olur (kaçan gün penceresi). Cümleler geçmişe.
 */
export function settleSchedule(
  stored: Pick<ProgramState, 'schedule' | 'clientSchedule'>,
  days: readonly ProgramDay[],
  at: string,
): { schedule: ProgramSchedule | undefined; changes: string[] };
```

  Cümleler: birleşim değiştiyse `weekdaysChangeText(before, after)`; katman varsa `Danışanın günleri kaldırıldı
  (${weekdaysText(stored.clientSchedule.weekdays)})`.
  - `createProgramRecord`: `schedule` = şu anki evrenin `phaseWeekdays`'i (boşsa alan yok); `body.weekdays` okunmaz.
  - `startPhase`: `settleSchedule(program, target.days, at)`; dönen `schedule` yazılır, `clientSchedule` düşer, geçmiş
    kaydı `[currentPhaseChange(…), ...settle.changes]`. Belge yorumundaki "rotasyon onun ilk gününden" cümlesi düşer.
- `program-diff.ts`:
  - `diffProgram`'ın 2. adımında, ad satırından sonra: önceki ve yeni `weekdays` farklıysa
    `push(\`Günleri: ${weekdaysText(prev) || 'yok'} → ${weekdaysText(next) || 'yok'}\`, dayScope(phase, day))`.
    Yeni eklenen günde yazılmaz ("… eklendi" yeter).
  - `applyProgramEdit`: `input.weekdays` okunmaz; `const schedule = settleSchedule(stored, current?.days ?? [], at)`
    (`current` gövdenin şu anki evresi); `clientSchedule` hiç yazılmaz. Belge yorumu güncellenir.
- `training-days.ts`: `ptScheduleEdit` kalkar (tek çağıranı `applyProgramEdit` idi); testleri `settleSchedule`'a.
- `programs.ts` `saveProgram`: ilk satırda `body = bodyWithAssignments(body)` (AI yayını şemadan geçmez).
- `own-programs.ts`:
  - `createOwnProgram`: `weekdays` girdisi kalkar; `schedule` = `phaseWeekdays(phases[0].days)`;
    `settleFrequency(phases, union)`. Çağıran `own-program-files.ts` güncellenir.
  - `applyOwnEdit`: gövdede alan yoksa (eski sekme, günler açılıştakiyle aynı) `keepAssignments(body days, stored
    days)`; `sent`/`baseWeekdays` mantığı kalkar; `settleFrequency(…, union)`; `applyProgramEdit` birleşimi kendi
    hesaplar. Belge yorumu Karar 10.
  - `sameOwnBody`: ayrı gün karşılaştırması kalkar (atamalar günlerin içinde).
  - `copyPtDays`: değişmez (gün nesnesini alan alan kurar, `weekdays` geçmez); test sabitler. Yorumuna "atamasız".
- `ai/coach-engine.ts` `coachProgramMatches(current, body)`: gövde `bodyWithAssignments`'tan geçer; iki taraf
  `programFormSchema` ile ayrıştırılır, program düzeyindeki `weekdays` karşılaştırılmaz, atamalı evrelerde
  `daysPerWeek` iki tarafta da yok sayılır (`normalizeProgram` yayında düşürür); kalan JSON aynı mı.

**Step 4:** PASS.

typecheck, lint, test · Commit: `feat(program): writes keep the schedule as the union of assignments`

---

### Task 4: Günler yalnız PT'nin: hafta ve bugün mantığı, gün ucu

**Boyut:** M · **Files:** Modify `src/lib/training-days.ts`, `src/lib/workout-routes.ts` (`scheduleRoute`),
`src/app/api/me/schedule/route.ts` (yorum) · Test ve etkilenen testler: `src/lib/training-days.test.ts`,
`src/lib/workout-routes.test.ts` (114: yanıttaki `schedule`; 517–564: gün ucu → 409; 639–643: kendi program → 409),
`src/lib/workout-plan.test.ts` (290: `weekOf` hedefi katmanı yok sayar), `src/lib/attention.test.ts` (121: kendi
katmanlı program PT'nin günleriyle), `src/lib/demo-history.test.ts` (113: `demoWeekdays` katmanı yok sayar)

Eski işlevler (`weekPlan`, `weekRotation`, `todayCardTitle`, `todayState`, `nextTrainingDate`, `relativeDayText`)
silinmez: tüketenleri sonraki görevlerde yeni işlevlere geçer, 15. görev siler. `EffectiveSchedule` tipinin biçimi
de kalır (`client` hep null, `source` hiç 'client' değil; 15. görev daraltır).

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

  test('geçerli günler yalnız PT\'nin: atamalıda birleşim, danışanın katmanı her zaman yok sayılır', () => {
    const layer = { weekdays: [1, 3], at: '2026-10-20T08:00:00.000Z' };
    assert.deepEqual(effectiveSchedule({ ...program, schedule: { weekdays: [2, 4, 7] }, clientSchedule: layer }), {
      weekdays: [2, 4, 7], pt: [2, 4, 7], client: null, source: 'pt',
    });
    const bare = { phases: [{ id: 'p_aaaaaa', days: [{ id: 'd_aaaaaa', name: 'Program A' }] }], current: program.current, clientSchedule: layer };
    assert.deepEqual(effectiveSchedule(bare), { weekdays: [], pt: [], client: null, source: null });
  });

  test('kaçan gün penceresi: kayıttaki katmanın anı ham alandan (pencere geri gitmez)', () => {
    const stored = {
      ...program,
      createdAt: '2026-09-01T10:00:00.000Z',
      schedule: { weekdays: [2, 4, 7], at: '2026-09-05T10:00:00.000Z' },
      clientSchedule: { weekdays: [1, 3], at: '2026-10-20T08:00:00.000Z' },
    };
    assert.equal(scheduleSince(stored, client), '2026-10-20T08:00:00.000Z');
  });

  test('haftalık hedef ve evrenin sıklığı: atanmış gün sayısı, yoksa daysPerWeek', () => {
    assert.equal(programWeekTarget({ ...program, schedule: { weekdays: [2, 4, 7] } }), 3);
    const bare = { id: 'p_aaaaaa', daysPerWeek: 2, days: [{ id: 'd_aaaaaa', name: 'Program A' }] };
    assert.equal(phaseFrequency(bare), 2);
    assert.equal(phaseFrequency(phase), 3);
    assert.equal(programWeekTarget({ phases: [bare], current: program.current }), 2);
  });

  test('metinler', () => {
    assert.equal(assignmentsText(phase.days), 'Sal · Alt vücut, Per · Üst vücut, Paz · Tüm vücut');
    assert.equal(assignmentsText([{ id: 'd_aaaaaa', name: 'Program A' }]), '');
    assert.equal(weekdayNamesText([4, 2]), 'Salı, Perşembe');
  });
});
```

(`client`: dosyadaki `scheduleSince` testlerinin danışan fikstürü; 84. satırdaki var olan katman testi değişmeden
geçer.) `workout-routes.test.ts`'te gün ucunun testleri yeniden yazılır:

```ts
test('gün ucu: PT programında ve kendi programda 409, dosya yazılmaz', () => {
  // atamalı ve atamasız PT → { status: 409, body: { error: 'Günlerini antrenörün belirliyor.' } }
  // kendi program (programId ya da kalıcı seçim) → { status: 409, body: { error: 'Günleri programını düzenlerken seç.' } }
  // sahte depoda program.json ve own-programs dosyaları değişmemiş
});
```

**Step 2:** FAIL.

**Step 3: Uygula**

```ts
type Assigned = { phases?: readonly { id: string; days: readonly AssignableDay[] }[] | undefined; current?: { phaseId: string } | undefined };
type Scheduled = { schedule?: ProgramSchedule | undefined; clientSchedule?: ClientSchedule | undefined } & Assigned;

/**
 * Geçerli günler (Faz 3): yalnız PT'nin. Atamalı programda şu anki evrenin birleşimi, atamasızda `schedule.weekdays`
 * (eski dosyada türetme yüzünden pratikte boş). Danışanın katmanı (`clientSchedule`) okunur ama yok sayılır:
 * `client` hep null, `source` 'pt' ya da null.
 */
export function effectiveSchedule(program: Scheduled): EffectiveSchedule;

/** Kaçan gün penceresi: katmanın anı ham `program.clientSchedule?.at`'ten (Karar 4), öteki anlar bugünkü gibi. */
export function scheduleSince(/* imza aynı */): string | undefined;

/** Bugüne atanmış program (Bugün kartı, `plannedDayId`); yoksa null. */
export function todayAssigned<D extends AssignableDay>(days: readonly D[], today: string): D | null;

/**
 * Bugünün ya da sıradaki atanmış program (Faz 3, `nextDayId`'nin yerine): şu anki evrede bugüne atanmış program,
 * yoksa bugünden sonraki ilk atanmış gün (en çok 6 gün ileri). Atama yoksa null.
 */
export function upcomingAssigned(program: { phases: readonly { id: string; days: readonly AssignableDay[] }[]; current: { phaseId: string } }, today: string): { dayId: string; date: string } | null;

/** Evrenin haftalık sıklığı: atanmış gün sayısı, atama yoksa `daysPerWeek` (ekranlardaki "haftada 3"). */
export function phaseFrequency(phase: { daysPerWeek?: number | undefined; days: readonly AssignableDay[] }): number | undefined;
/** "Bu hafta x/y"nin y'si programdan: şu anki evrenin `phaseFrequency`'si (Bugün, İlerleme, hedeflerin dondurulması). */
export function programWeekTarget(program: { phases: readonly { id: string; daysPerWeek?: number | undefined; days: readonly AssignableDay[] }[]; current: { phaseId: string } }): number | undefined;

/** "Sal · Alt vücut, Per · Üst vücut"; atama yoksa boş. */
export function assignmentsText(days: readonly AssignableDay[]): string;
/** "Salı, Perşembe" (PT'nin program kartı, sheet satırı). */
export function weekdayNamesText(list: readonly number[]): string;

export type WeekDayState = 'done' | 'missed' | 'planned' | 'rest';
export type WeekDay = StripDay & { state: WeekDayState; label: string | null };

/**
 * Bugün'ün hafta şeridi (Faz 3): yapıldı (oturumun adı; aynı gün birden çoksa sonuncusu) · kaçtı (seçili gün geçti,
 * antrenman yok; pencereden önce değil; ad atamadan) · planlı (bugün ve ilerideki seçili gün; ad atamadan) ·
 * dinlenme. `weekdays`: geçerli günler (`effectiveSchedule`); `names`: şu anki evrenin atamaları (`weekdayNames`).
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

- `assignedWeek` `weekStrip`'i kullanır: `done` → `sessions`'tan son ad (yoksa null), `missed` → `names[weekday] ??
  null`, seçili ve `date >= today` → `planned` (`names[weekday] ?? null`), öteki `rest`.
- `applyClientSchedule` silinir (tek çağıranı gün ucuydu); `resetClientSchedule` ham `program.clientSchedule`'ı okur
  (PT'nin geri dönüş ucu 15. göreve kadar çalışır; testleri değişmeden geçer).
- `scheduleRoute`: `postGuard` ve `run` aynen; kendi program hedefi (adresteki `programId` ya da kalıcı seçim) → 409
  "Günleri programını düzenlerken seç."; PT programı → 409 "Günlerini antrenörün belirliyor."; dosya okunmaz ya da
  yazılmaz. Gövdeyi ayrıştıran şemalar 15. görevde silinir. `scheduleOwnProgram` çağrısı kalkar (fonksiyon
  `own-program-files.ts`'te, 15. görevde silinir). Uç listesindeki yorum ve `app/api/me/schedule/route.ts` yorumu
  Karar 3.
- Dosya başı yorumu Faz 3'e göre (atama, dönüş yok, katman yok sayılır).

**Step 4:** PASS.

typecheck, lint, test · Commit: `feat(today): days come only from the PT; week and today from assignments`

---

### Task 5: Varsayılan adlar "Program A", AI taslakları

**Boyut:** M · **Files:** Modify `src/lib/program-plan.ts`, `src/lib/own-programs.ts`, `src/lib/training-days.ts`
(`dayShortName`), `src/lib/own-program-text.ts` (`programLine`), `src/lib/ai/coach-engine.ts`,
`src/lib/ai/assistant-engine.ts`, `src/app/setup/appearance-preview.tsx` · Test ve etkilenen testler:
`src/lib/program-plan.test.ts`, `src/lib/own-programs.test.ts`, `src/lib/training-days.test.ts`,
`src/lib/own-program-text.test.ts`, `src/lib/program-diff.test.ts` (yeni günün adı), `src/lib/editor-undo.test.ts`
(kopyanın adı), `src/lib/ai/coach.test.ts`, `src/lib/ai/assistant.test.ts`

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

test('program satırı: sayım "antrenman"', () => {
  assert.equal(programLine({ days: 2, weekdays: [4, 2] }, '2026-09-22'), '2 antrenman · haftada 2 · Sal, Per · son: 22 Eyl');
  assert.equal(programLine({ days: 1, weekdays: [] }), '1 antrenman · gün atanmadı');
});

// coach.test.ts / assistant.test.ts (dosyaların bağlam yardımcılarıyla)
test('taslak programları "Program A…" adlandırır ve her birini kendi gününe atar', () => {
  // conditions.weekdays [1, 3, 5] → günler [['Program A', [1]], ['Program B', [3]], ['Program C', [5]]]; body.weekdays [1, 3, 5]
});
```

**Step 2:** FAIL.

**Step 3: Uygula**
- `nextDayName`: harf `Program X`; `Gün X` ya da `Program X` adı varsa harf alınmış; harfler bitince
  `Program ${n}`. Yorum: "Sıradaki program adı (Faz 3; saklanan 'Gün A' adları değişmez)".
- `blankProgramBody`, `blankPhase` → `nextDayName([])`; `ownStartBody`'nin boş günü de.
- `dayShortName`: `/^(?:gün|program)\s+(.+)$/iu`.
- `programLine`: "N antrenman", "gün atanmadı".
- `coach-engine.ts:65`: ad `nextDayName(önceki günler)`, `weekdays: [conditions.weekdays[index]]`; `daysPerWeek`
  yazılmaz. `assistant-engine.ts:48`: ad `nextDayName(…)` ("Pazartesi · Gün 1" kalkar), `weekdays: [days[index]]`;
  `assistantAttention` `body.weekdays ?? phaseWeekdays(body.phases[0]?.days ?? [])`. Gerekçe metinleri "gün" sayısını
  hafta günü anlamında kullanıyorsa kalır.
- `appearance-preview.tsx`: tablo. `copyPtDays`'in yorumundaki "Gün A 2" örneği "Program A 2".

**Step 4:** PASS.

typecheck, lint, test · Commit: `feat(program): default workout names "Program A"; AI drafts assign weekdays`

---

## B · Sunucu

### Task 6a: Planın günü, `plannedDayId`, yanıt, deneme geçmişi

**Boyut:** L · **Files:** Modify `src/lib/workout-plan.ts`, `src/lib/workout-routes.ts`, `src/lib/history-store.ts`,
`src/lib/demo-history.ts`, `src/lib/testing/workout-fixtures.ts`, `src/lib/testing/demo-fixtures.ts` · Test ve
etkilenen testler: `src/lib/workout-plan.test.ts`, `src/lib/workout-routes.test.ts`, `src/lib/workout-session.test.ts`
(77), `src/lib/workout-flow.test.ts` (405–422), `src/lib/demo-history.test.ts` (243–254 ve dönüşe bağlı öteki
beklentiler)

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
});

test('varsayılan gün: bugünkü, yoksa haftada sıradaki atanmış, atama yoksa ilk', () => {
  assert.equal(defaultDayId(assigned, '2026-10-28'), DAY_B);
  assert.equal(defaultDayId(unassigned, '2026-10-28'), DAY_A);
});

test('damga: aynı birleşimde atama yer değiştirince değişir', () => { /* A↔B günleri takas → programStamp farklı */ });

test('afterFinish sırayı değiştirmez', () => { /* doc.rotation 'advance' olsa da program.nextDayId aynı */ });

// workout-routes.test.ts — `deps.now()` salıya kurulur (fikstürün saat dilimiyle)
test('Bugün yanıtı: gün atamadan, günler atamalarıyla, nextDayId varsayılan gün', () => { /* … */ });

// demo-history.test.ts (243–254'ün yerine)
test('atamalı programda her tarih kendi programı; başka program bildirimi yok', () => {
  // demoProgram() (schedule [1, 3, 5] → A [1], B [3], C [5]): her seansın dayId'si tarihinin atamasına eşit,
  // hiçbir seansta other_day yok, plannedDayId = dayId
});
test('atamasız programda bugünkü takvim ve sırayla programlar', () => { /* demoProgram({ weekdays: null, daysPerWeek: 2 }) */ });
```

**Step 2:** FAIL.

**Step 3: Uygula**
- `workout-plan.ts`:
  - `defaultDayId(program: PlanProgram, today: string): string | null` = `upcomingAssigned(program, today)?.dayId ??
    currentPhaseOf(program)?.phase.days[0]?.id ?? null`.
  - `resolveDay(program, dayId, today)`, `dayExerciseIds(program, dayId, today)`, `dayRowIds(program, dayId, today)`:
    varsayılan `defaultDayId`. `buildWorkoutDay` girdisine `today: string`; `plannedDayId` =
    `todayAssigned(current.days, input.today)?.id ?? null`, `plannedDayName` yalnız planlanan seçilenden farklıyken.
    **`rotationDays` üretilmeye devam eder** (13. görev `finishRotation` ile birlikte kaldırır). `WorkoutDay` alan
    yorumları: "Antrenmanın gününe atanmış program; `dayId`'den farklıysa başka program seçildi (Faz 3)".
  - `programStamp`: `Pick`'e `phases`; dizgiye şu anki evrenin `day.id:weekdays` listesi.
  - `afterFinish`: dönüş dalı (`finished`, `advancedTo`) kalkar; `program` yanıtı aynen döner; belge yorumundaki
    "Sıradaki gün" paragrafı düşer.
  - `weekOf`, `scheduleOf`: kod değişmez; `WeekCount.target` yorumu "atanmış gün sayısı".
- `workout-routes.ts`: `workoutRoute`'ta `requested = dayParam ?? current?.program?.dayId ?? null`;
  `resolveDay(…, today)`, `dayExerciseIds`/`dayRowIds`/`buildWorkoutDay`'e `today`. Yanıtın `program.nextDayId` =
  `defaultDayId(program, today)`; `days` her güne `...(day.weekdays?.length ? { weekdays: day.weekdays } : {})`
  (`WorkoutResponse` tipine `weekdays?: number[]`, `nextDayId` yorumu Karar 5). Muadil ucu (~528) `today` alır. Uç
  listesindeki Bugün cümlesi güncellenir.
- `history-store.ts:100,103`: `today` = `doc.date`.
- `demo-history.ts`: `startingRotation`, `advance`, `finish.rotation` kullanımı ve `nextDayId` kalkar; tarihin programı
  `todayAssigned(phase.days, date) ?? days[n % days.length]` (n: atamasız programda sıra); `lighterSession` aynı
  listeden; `buildWorkoutDay`'e `today: date`. Dosya başı yorumu Karar 12.
- Fikstürler: `workoutDay` (`testing/workout-fixtures.ts`) `today` alır (varsayılan `'2026-09-26'`, cumartesi);
  varsayılan ham program Gün A'yı o güne atar (`programFile({}, { schedule: { weekdays: [6] } })`), `dayWithBlocks`
  de aynı atamalı ham programdan kurar, açık ham programı olan testler (`workout-flow.test.ts`'teki `withC` yapıcısı)
  aynı atamayı alır. Böylece `workout-session.test.ts:77`
  (`plannedDayId: DAY_A`) ve `workout-flow.test.ts:405–422` (`finishRotation`'ın "sırada kalsın"ı ve "Gün A yerine
  Gün B" adı) değişmeden geçer; geçmezse beklenti bu kurala göre düzeltilir ve incelemede söylenir.
  `testing/demo-fixtures.ts`: `DEMO_TODAY` `generate` yardımcısına `today` olarak gider; varsayılan `weekdays [1, 3, 5]`
  aynen (artık atama).

**Step 4:** PASS.

typecheck, lint, test · Commit: `feat(workout): today's assigned workout is the planned day`

---

### Task 6b: Kısıt çakışmasının "sıradaki"si

**Boyut:** S · **Files:** Modify `src/lib/constraint-filter.ts`, `src/lib/notices-store.ts`,
`src/app/dashboard/clients/[id]/program/page.tsx`, `src/app/dashboard/clients/[id]/program/own/[pid]/page.tsx`,
`src/app/me/(sekmeler)/programlar/[pid]/page.tsx` (son üçünde yalnız çağrı) · Test ve etkilenen testler:
`src/lib/constraint-filter.test.ts`

- Test: "çakışmanın `next` işareti bugünkü ya da sıradaki atanmış programda" (atamalı fikstür, iki tarih).
- `programConflicts(program, exercises, input, today)`: `next` = `day.id === upcomingAssigned(program, today)?.dayId`;
  tipten `rotation` çıkar. Çağıranlar: `notices-store.ts:163` (fonksiyondaki `todayIn(…)`), PT program sayfası, PT'nin
  kendi program görünümü, danışanın kendi program sayfası (sayfadaki saat dilimiyle `todayIn`).

typecheck, lint, test · Commit: `feat(care): next-workout conflicts follow the assignment`

---

### Task 6c: Haftalık hedef tek kuraldan

**Boyut:** S · **Files:** Modify `src/lib/progress-data.ts`, `src/lib/programs.ts` (`writeProgramFile`) · Etkilenen
testler: yok (iki dosya da sunucuya özel; kural 4. görevde testli) — `npm test` yine çalıştırılır.

- `progress-data.ts` `weeklyTarget` ve `plannedDays` → `programWeekTarget(current)`.
- `writeProgramFile`'daki dondurma → `programWeekTarget(prior.program) ?? 1`.
- İkisinin yorumu: "Bugün'deki 'Bu hafta x/y' ile aynı: atanmış gün sayısı, yoksa sıklık."

typecheck, lint, test · Commit: `refactor(progress): one weekly-target rule from assignments`

---

### Task 7: Bitiş dönüşsüz, `plannedDayId` sunucuda, "başka program" metinleri

**Boyut:** M · **Files:** Modify `src/lib/session-finish.ts`, `src/lib/session-files-core.ts`,
`src/lib/session-routes.ts`, `src/lib/notices.ts`, `src/lib/pt-sessions.ts`, `src/app/dashboard/notices-card.tsx`,
`src/app/dashboard/clients/[id]/sessions/session-list.tsx`, `src/app/me/(sekmeler)/gecmis/history-list.tsx`,
`src/app/me/(sekmeler)/gecmis/[id]/history-detail.tsx` · Test ve etkilenen testler: `src/lib/session-finish.test.ts`,
`src/lib/session-files-core.test.ts` (134, 160, 462: dönüş artık yazılmaz; `other_day` bekleyenler fikstür atamasıyla),
`src/lib/session-routes.test.ts` (95: yanıtta `rotation` yok), `src/lib/notices.test.ts`, `src/lib/pt-sessions.test.ts`

**Step 1: Test**

```ts
// session-finish.test.ts
test('bitiş dönüşü ilerletmez: program.json yazılmaz, seansa rotation yok', () => {
  const plan = planFinish({ ...input, rotation: 'advance' });
  assert.equal(plan.files.some((file) => file.path === PROGRAM_PATH), false);
  assert.equal(plan.doc.rotation, undefined);
});
test('plannedDayId sunucuda seansın tarihinden; bildirim yalnız o gün atanmış program varken', () => {
  // program: Gün A [6] (2026-09-26 cumartesi). Belge dayId B, tarih 2026-09-26, plannedDayId yok → A yazılır, other_day
  // belge dayId B, tarih 2026-09-27 (pazar, atama yok), telefondan plannedDayId A → düşer, bildirim yok
  // kendi programda dokunulmaz
});

// notices.test.ts: planlanan adı yoksa "Başka program seçildi: Üst vücut"
// pt-sessions.test.ts: işaret 'başka program seçildi'
```

**Step 2:** FAIL.

**Step 3: Uygula**
- `session-finish.ts`:
  - `choice`, `doc.rotation` yazımı ve `completeDay` blokları (PT ve kendi program) kalkar; program dosyası yalnız
    güncelleme (`feedback.program`) varsa, kendi programda yalnız `ownFeedback.program` varsa yazılır.
  - `FinishInput.rotation` okunmaz (eski telefon gönderebilir; yorum), `FinishPlan.rotation` kalkar.
  - PT programı okunduysa ve seans kendi programın değilse belge `withPlannedDay(doc, program)`'dan geçer (aynı
    dosyada saf yardımcı): `plannedDayId` = `todayAssigned(currentPhase.days, doc.date)?.id`; yoksa alan ve
    `plannedDayName` düşer; varsa ve seçilenden farklıysa `plannedDayName` programdaki ad. Bildirim kuralı bundan sonra.
  - `planFinish` ve `finishCommitMessage` yorumları "rotasyon ilerlediyse" cümlesinden arınır; `defaultRotation`'ın
    yeniden dışa aktarımı kalkar.
- `session-files-core.ts:289,306`, `session-routes.ts:182`: `rotation` iletilmez, yanıtta yok. Telefonun bitiş
  yanıtında `rotation` okumadığı `grep -rn "rotation" src/app` ile doğrulanır (13. görev göndermeyi keser).
- Metinler (tablo): `notices.ts:34` etiket, `:88` adsız hâl; `pt-sessions.ts:82`; rozetler (üç dosya);
  `notices-card.tsx:53`. Yorumlardaki "başka gün" anlatımları "başka program".

**Step 4:** PASS.

typecheck, lint, test · Commit: `feat(workout): finishing no longer advances a rotation; planned workout from the session date`

---

### Task 8: Deneme programı ucu (`/api/dev/seed-program`)

**Boyut:** M · **Files:** Create `src/lib/demo-program.ts`, `src/app/api/dev/seed-program/route.ts` · Test
`src/lib/demo-program.test.ts`, Modify `src/lib/demo-seed.test.ts` (kapının ad kuralı yeni uç için de sınanır) ·
Etkilenen testler: yalnız bu ikisi.

Yazmadan önce `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` okunur;
`src/app/api/dev/seed-history/route.ts` kalıp olarak izlenir.

**Step 1: Test**

```ts
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';
import { EXERCISE_LIBRARY } from '../data/exercise-library.ts';
import { seededRandom } from './demo-history.ts';
import { DEMO_PROGRAM, demoProgramRecord } from './demo-program.ts';
import { programIdSource } from './program-plan.ts';
import { programSchema } from './schemas/program.ts';

const library = new Map(EXERCISE_LIBRARY.map((exercise) => [exercise.id, exercise]));
const NOW = new Date('2026-11-01T09:00:00.000Z');
const ids = () => programIdSource([], seededRandom('seed-program').bytes);

describe('deneme programı', () => {
  test('üç program, kendi günlerine atanmış, hareketler sırayla; şemaya uyar', () => {
    const result = demoProgramRecord(library, ids(), NOW);
    assert.ok('program' in result);
    const days = result.program.phases[0]?.days ?? [];
    assert.deepEqual(days.map((day) => [day.name, day.weekdays]), [['Alt vücut', [2]], ['Üst vücut', [4]], ['Tüm vücut', [7]]]);
    assert.deepEqual(days[0]?.blocks.flatMap((block) => block.rows.map((row) => row.exerciseId)), [...DEMO_PROGRAM[0].exerciseIds]);
    assert.deepEqual(result.program.schedule?.weekdays, [2, 4, 7]);
    assert.equal(result.program.clientSchedule, undefined);
    assert.equal(result.program.revision, 1);
    assert.equal(v.safeParse(programSchema, result.program).success, true);
  });

  test('aynı tohum aynı kimlikler (yeniden tohumlama gün kimliklerini değiştirmez)', () => {
    const first = demoProgramRecord(library, ids(), NOW);
    const second = demoProgramRecord(library, ids(), NOW);
    assert.ok('program' in first && 'program' in second);
    assert.deepEqual(first.program.phases, second.program.phases);
  });

  test('kütüphanede olmayan hareket varsa program kurulmaz', () => {
    const partial = new Map([...library].filter(([id]) => id !== 'plank'));
    assert.deepEqual(demoProgramRecord(partial, ids(), NOW), { missing: ['plank'] });
  });
});
```

`demo-seed.test.ts`: `demoSeedGate`'in adı "Test " ile başlamayan danışana 403, oturumsuz 403, üretimde 404 verdiği
zaten sınanıyorsa yalnız bir yorum satırı eklenir ("seed-program da bu kapıyı kullanır"); sınanmıyorsa test eklenir.

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

- `route.ts` yalnız `POST` (JSON `{ clientId }`):
  1. `production()` → 404 (gövdesiz).
  2. `demoSeedGate({ production: false, pt })` → değilse kapının durumu; `originGuard(request.headers,
     origin(request))`.
  3. `clientId` `seedRequestSchema`'nın kalıbıyla doğrulanır; `readClient` → `demoSeedGate({ …, client })`: adı
     "Test " ile başlamayan danışana 403, yoksa 404.
  4. `listExercises()` → `demoProgramRecord(library, programIdSource([], seededRandom('seed-program').bytes), now)` →
     eksik varsa 409 ("Kütüphanede yok: …").
  5. `readProgramFile` (sha; dosya bozuk olsa da sha'sıyla) → `writeProgramFile(client.id, program, { sha, message:
     'Deneme programı (geliştirme)' })`. Yanıt `{ status: 'written', days: [{ name, weekdays }] }`; `console.error` ile
     tek satır günlük (`[deneme] c_…: program`).
  Dosya başı yorumu: yalnız geliştirme; kapı; taze kayıt `clientSchedule`, `clientTargets`, `rotation`'ı siler; gerçek
  danışana ad kapısı yüzünden yazamaz.

**Step 4:** PASS.

typecheck, lint, test · Commit: `feat(dev): seed a weekday-assigned test program`

---

## C · PT düzenleyicisi

### Task 9: Programın kartında gün çipleri

**Boyut:** M · **Files:** Modify `src/components/weekday-toggle.tsx`,
`src/app/dashboard/clients/[id]/program/day-editor.tsx`, `.../program/day-chips.tsx`, `.../program/add-day-dialog.tsx`,
`.../program/save-template-dialog.tsx`, `.../program/days-card.tsx` ve `.../program/phases-card.tsx` (yalnız
`DayChips`'in kalkan prop'u), `.../program/program-form.tsx` (yalnız `isNext`/`next`/`rotation` ve ilk seçim),
`.../program/edit/page.tsx` (78–86: `stored`'dan `rotation` çıkar) · Etkilenen testler: yok (UI) — `npm test` yine.

- `WeekdayToggle`: isteğe bağlı `taken?: ReadonlyMap<number, string>`; alınmış gün `disabled`, erişilebilir adı
  "Perşembe, Üst vücut programında", `title` aynı. Base UI `ToggleGroupItem`'ın `disabled`'ı `ui/toggle-group.tsx`'te
  doğrulanır. Belge yorumu: PT düzenleyicide ve kendi program formunda (danışanın gün sheet'i 11. görevde kalkar).
- `DayEditor`:
  - `CardDescription` `weekdayNamesText(day.weekdays ?? [])` ya da "Gün atanmadı"; `isNext` prop'u kalkar.
  - "Program adı", yer tutucu "Ör. Alt vücut".
  - Altında yeni alan: etiket "Günleri", `WeekdayToggle` (`value` günün `weekdays`'i, `taken` =
    `takenWeekdays(phase.days, day.id)`), değişince güncel evre `actions.current()`'tan okunur ve `setInput(form, {
    path: ['phases', phaseIndex, 'days', dayIndex, 'weekdays'], input: assignWeekdays(days, day.id, next).find((item)
    => item.id === day.id)?.weekdays })`. Açıklama: alınmış gün varsa "Başka programda: Per · Üst vücut, …", yoksa
    "Danışan bu günlerde Bugün ekranında bu programı görür."
  - Menü: erişilebilir ad "Program işlemleri: X"; "Günü sil" → "Kaldır"; duyurular programın adıyla.
- `DayChips`: `nextDayId` prop'u ve nokta kalkar; çipte ad ve (varsa) `weekdaysText` küçük, soluk; erişilebilir ad
  "Alt vücut, Salı" ya da "…, gün atanmadı". `AddDayMenu`: "Program"; erişilebilir ad evreliyse "'Evre 1' evresine
  program ekle", değilse "Program ekle"; öğeler "Boş program", "Şablondan…", "Seçili programın kopyası".
- `add-day-dialog.tsx:44,46`, `save-template-dialog.tsx:79,105,111`: tablo.
- `days-card.tsx`, `phases-card.tsx`: `DayChips`'e `nextDayId` geçilmez (yalnız bu).
- `program-form.tsx`: `next`, `rotation`, `kept` hesapları (yalnız dönüş içindi) ve `StoredState.rotation` kalkar;
  `DayEditor`'a `isNext` geçilmez; ilk seçili program `upcomingAssigned({ phases: initial.phases, current: { phaseId:
  initial.currentPhaseId } }, todayIn(timeZone, new Date(now)))?.dayId ?? ''` (`now` prop'u: sunucu ve istemci aynı
  günü hesaplar, hydration uyuşmazlığı olmaz; sonra bugünkü geri dönüş: şu anki evrenin ilki).
- `edit/page.tsx`: `stored={{ current: program.current }}`.

typecheck, lint, test · Commit: `feat(program-editor): weekday chips per workout`

**Controller doğrulaması (375 px ve masaüstü):** test danışanının düzenleyicisinde Alt vücut seçiliyken "Per" ve
"Paz" kapalı, adları duyuruluyor, alttaki satır "Başka programda: Per · Üst vücut, Paz · Tüm vücut"; Sal kapatılıp
Cum açılınca çipte "Cum"; **kaydedilmez**.

---

### Task 10: Haftanın programı özeti, sıklık ve PT sayfaları

**Boyut:** L · **Files:** Modify `src/app/dashboard/clients/[id]/program/program-form.tsx`, `.../program/days-card.tsx`,
`.../program/phases-card.tsx`, `.../program/unphase-dialog.tsx`, `.../program/weekday-field.tsx`,
`.../program/page.tsx`, `.../program/own/[pid]/page.tsx`, `.../program/edit/page.tsx` (78–86: `initial.weekdays` ve
`clientDays` kalkar), `.../program/new/page.tsx` (gerekirse), `src/app/dashboard/clients/[id]/coach/drafts/[draftId]/page.tsx`
(`initial`), `src/app/dashboard/clients/[id]/page.tsx`, `src/components/program/phase-load.tsx` · Etkilenen testler:
yok (UI) — `npm test` yine.

- `program-form.tsx`:
  - Başlangıç girdisinde program düzeyindeki `weekdays` yok; kayıt gövdesi onu göndermez (sunucu atamalardan hesaplar).
    `clientDays` prop'u kalkar.
  - `prepareDraft`: eski taslak (gün başına alan yok, `weekdays` var) → `phases: upgradeAssignments(input.phases,
    input.weekdays)`, `weekdays` düşer (devam edilen taslağa da, bugünkü cihaz adımıyla aynı yerde).
  - `program-form.tsx:334` geri al metni (tablo).
  - `weekdaysField` → `AssignmentSummary` (aşağıda), şu anki evrenin günleriyle.
- AI taslağı sayfası (`coach/drafts/[draftId]/page.tsx`): `initial={{ ...draft.body, phases:
  upgradeAssignments(draft.body.phases, draft.body.weekdays) }}` (5. görevden önceki taslaklar atamasız).
- `weekday-field.tsx`: `WeekdayField` ve `ResetDaysButton`'ın kullanımı yerine `AssignmentSummary({ days, label? })`:
  metin `assignmentsText(days)` ya da "Henüz gün atanmadı."; atanmamış programlar varsa "Gün atanmamış: Program D".
  Rozet ve geri dönüş yok (Karar 3). `ResetDaysButton` dosyada kalır, 15. görev siler.
- `days-card.tsx`: başlık "Haftanın programı", açıklama (tablo); özet açıklamanın altında etiketsiz; `FrequencySelect`
  yalnız `!hasAssignments(phase.days)` (açıklama "Gün atanmamışsa danışanın haftalık hedefi bu sayıdır.").
- `phases-card.tsx`: açıklama ve `:211` (tablo); evre satırındaki sıklık seçicisi yalnız o evre atamasızken; özet şu anki
  evre için, etiket "Haftanın programı"; belge yorumları.
- `unphase-dialog.tsx:48,53`: tablo; şu anki evre atamalıysa sıklık cümlesi yok.
- PT program sayfası (`program/page.tsx`):
  - `nextId` → `upcomingAssigned(program, todayIn(timeZone, now))`; "sıradaki gün" kartı (~380–400) "Bugün · Alt
    vücut" ya da "Sıradaki: Perşembe · Üst vücut".
  - `:168` açıklama ve `:529` evre listesi: "N antrenman", `phaseFrequency`.
  - `:405–409` ve `:474–475` (tablo): "Haftanın programı", "Durum", "Bugün / sıradaki" satırı; program kartlarında
    `weekdaysText`.
  - "Antrenman günleri" satırı (`daysRow`, ~224–240): `assignmentsText(current.phase.days)` ya da "Henüz gün atanmadı.";
    ham `program.clientSchedule` varsa soluk satır (tablo). `PhaseLoad`'a `assigned`.
- PT'nin kendi program görünümü (`own/[pid]/page.tsx`): `nextId` → `upcomingAssigned`; `:117` tablo.
- Genel bakış (`clients/[id]/page.tsx:281`): `next` → `upcomingAssigned(program, today)?.dayId`; program kartlarında
  günler; açıklama "N antrenman" ve `frequencyLabel(programWeekTarget(program))`.
- `phase-load.tsx`: `assigned?: readonly number[]`; doluysa haftalık yük gösterilir, metin tablodaki gibi; değilse
  bugünkü koşul ve metin.

typecheck, lint, test · Commit: `feat(program-editor): weekly program summary and PT pages from assignments`

**Controller doğrulaması:** PT program sayfası "Haftanın programı", "Durum" ve "Bugün / sıradaki"; kartlarda günler;
düzenleyicide özet, "Haftada kaç gün" yok; kas yükü kartı atanmış günleri söylüyor; "Evreleri kaldır" penceresi
atamaların düşeceğini söylüyor (pencere açılır, onaylanmaz). Kayıt yok.

---

## D · Danışan

### Task 11: Hafta şeridi, "Başka program seç", Ayarlar

**Boyut:** M · **Files:** Modify `src/app/me/training-week.tsx`, `src/app/me/today-workout.tsx`,
`src/app/me/(sekmeler)/ayarlar/page.tsx`, `src/app/me/program-card.tsx` (yalnız içe aktarılan ad ve kalkan
`showNext`); Rename `src/app/me/schedule-sheet.tsx` → `src/app/me/training-days-card.tsx` (`ScheduleSheet` silinir,
`TrainingDaysCard` kalır) · Etkilenen testler: yok (UI) — `npm test` yine.

- `WeekStrip({ clientId })`: `showNext` ve `activeDay` prop'ları, "Sırada: …" satırı, `planOf`'un dönüş dalı,
  "Günlerini değiştir" düğmesi, `ScheduleSheet` ve `saved` kalkar. Günler `assignedWeek({ today, weekdays:
  schedule.weekdays, names: weekdayNames(data.program?.days ?? []), doneDays: data.week.days, sessions:
  data.week.sessions ?? [], since: schedule.since })`.
  - Görsel: yapıldı dolu ✓; planlı ince halka, bugünün planlısı kalın halka (`ring-4`) ve kalın kısaltma; kaçtı
    soluk halka ve "kaçtı"; dinlenme nokta; altında kısa ad (`dayShortName`).
  - sr-only (tablo). İskelet gerçek şeritle aynı yükseklikte: 81 px (`h-[5.0625rem]`; yorumdaki hesap güncellenir).
- `OtherDayButton` → `OtherProgramButton({ clientId })` (metinler tablodan):
  - `todayId = dayOnWeekday(days, isoWeekdayOf(data.today))?.id ?? null`; açılışta seçili `picked ?? todayId ?? days[0]`.
  - Satır açıklaması: `[day.id === todayId ? 'bugün' : weekdayNamesText(day.weekdays ?? []) || null, day.lastDate ?
    \`son: ${formatDayShort(day.lastDate)}\` : 'henüz yapılmadı'].filter(Boolean).join(' · ')`.
  - Açıklama: PT programı ve `todayId` varsa "Bugün <ad> planlı; başka birini seçersen antrenörüne bildirilir.", yoksa
    "Bugün için bir program seç.".
  - Düğme her zaman `/me/antrenman?day=<id>` (+ `program`). Evrede tek program varsa görünmez (bugünkü gibi).
- `today-workout.tsx`: `ResumeCard`'daki `activeDay` hesabı ve `WeekStrip`'e geçişi kalkar.
- `training-days-card.tsx` `TrainingDaysCard({ days, own })`: PT programında `assignmentsText(days)` ya da "Henüz gün
  atanmadı." ve altında "Günleri antrenörün belirliyor."; kendi programda programın adı, aynı metin ve eylem "Düzenle"
  bağlantısı (`/me/programlar/<id>/duzenle`, `h-11`). Sheet ve `schedule` prop'u yok.
- `ayarlar/page.tsx`: `days: currentPhaseOf(program)?.phase.days ?? []`; içe aktarma yeni dosyadan.
- `program-card.tsx`: yalnız `OtherProgramButton` adı ve `WeekStrip`'in prop'u (kartın kendisi 12. görevde).
- Dosya başı yorumları Faz 3'e göre.

typecheck, lint, test · Commit: `feat(today): week strip from assignments; "Başka program seç"; no client day changes`

**Controller doğrulaması (375 px):** şeritte Sal/Per/Paz altında "Alt", "Üst", "Tüm"; geçen atanmış gün "kaçtı";
"Sırada" satırı ve "Günlerini değiştir" yok; Ayarlar'da atamalar ve "Günleri antrenörün belirliyor.", düğme yok;
sheet'te "bugün" ve günler.

---

### Task 12: Bugün kartı ve Programlar sekmesi

**Boyut:** L · **Files:** Modify `src/app/me/program-card.tsx`, `src/app/me/(sekmeler)/programlar/page.tsx`,
`src/app/me/(sekmeler)/programlar/antrenor/page.tsx`, `src/app/me/(sekmeler)/programlar/[pid]/page.tsx`,
`src/app/me/(sekmeler)/programlar/program-days.tsx`, `src/app/me/(sekmeler)/programlar/copy-day-sheet.tsx` ·
Etkilenen testler: yok (UI) — `npm test` yine.

- `program-card.tsx` (`ProgramCard`; çip, banner, boş program ve okunamayan hâller aynen):
  - `today = todayIn(timeZone)`, `todayDay = todayAssigned(phase.days, today)`, `anyAssigned = hasAssignments(phase.days)`,
    `doneToday` bugünkü gibi; başlangıç bağlantısı `startHref(id)` = `/me/antrenman?day=<id>` (+ tek seferlik
    seçimde `&program=…`).
  - **Atanmış gün** (`todayDay` var): bugünkü kart, gün `todayDay`; başlık `${WEEKDAY_NAMES[isoWeekdayOf(today)]} ·
    ${todayDay.name}`; üst satır yalnız `doneToday`'de "Bugünkü antrenmanını yaptın"; "Antrenmana başla"
    `startHref(todayDay.id)`; altında `OtherProgramButton`; kısıt notları, ilk 3 hareket, "Tümünü gör", şerit aynen.
    Evre satırındaki sıklık `phaseFrequency(phase)` (`:221`).
  - **Atanmamış gün**: başlık `anyAssigned ? 'Bugün atanmış program yok' : 'Bugün hangi programı yapacaksın?'`,
    açıklama "Yapmak istediğin programı seç." (`doneToday`'de üstte "Bugünkü antrenmanını yaptın"); evre satırı evreli
    programda kalır. Liste (`ul`, `Item variant="outline"`): ad, "N hareket · ≈ N dk · son: 21 Eki" ya da "… · henüz
    yapılmadı" (`lastDoneDates(sessions)`), sağda [Başla] (`h-11`, `nativeButton={false}`, `Link`, erişilebilir ad
    "Başla: <ad>"). Hareketi kütüphanede olmayan program "Bu programın hareketleri şu an açılamıyor." der, düğmesiz.
    Kısıt notu ve önizleme bu hâlde yok (antrenman ekranı gösterir). Altında şerit.
  - **Çevrimdışı (kabul edilen gerileme, Karar 7):** atanmış gün çevrimdışı da açılır (Bugün'ün varsayılan yanıtı
    bugünün programını telefona alır). Atanmamış günde önbellekte olmayan programın [Başla]'sı ağ ister; çevrimdışı
    antrenman ekranının mevcut "Bağlantı yok…" / "Antrenman açılamadı." mesajı çıkar. Bütün planlar önceden çekilmez.
    Kartın yorumuna yazılır.
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
    day.id === todayId ? 'bugün' : null, last ? 'son: …' : null]`; `Day` tipine `weekdays?`; `:48` tablo. Yorum.
  - `antrenor/page.tsx`, `[pid]/page.tsx`: `todayId = todayAssigned(phase.days, today)?.id ?? null` (sayfadaki saat
    dilimiyle `today`).
  - `programlar/page.tsx`: "Sıradaki: X" → `upcomingAssigned`: bugünse "Bugün: Alt vücut", değilse "Sıradaki:
    Perşembe · Üst vücut"; atama yoksa satır yok. `programLine`'a giden `daysPerWeek` aynen (5. görevin metni).
  - `copy-day-sheet.tsx:40,61,72`: tablo.

typecheck, lint, test · Commit: `feat(today): today's assigned workout card and the weekly program`

**Controller doğrulaması (375 px):** turun günü atanmış günse (Sal, Per, Paz) kart "<Gün> · <Program>", "Antrenmana
başla" ilk ekranda, "Başka program seç" ve "Haftanın programı"; değilse "Bugün atanmış program yok", üç satır ve
[Başla]; Programlar sekmesinde günler ve "bugün".

---

### Task 13: Antrenman ekranı: bitişteki seçim kalkar, bildirim metni

**Boyut:** S · **Files:** Modify `src/app/me/antrenman/workout-screen.tsx`, `src/app/me/antrenman/workout-sheets.tsx`,
`src/lib/workout-flow.ts`, `src/lib/workout-plan.ts` (`rotationDays`'in üretimi ve tipi) · Test ve etkilenen testler:
`src/lib/workout-flow.test.ts` (405–422: `finishRotation` testleri silinir; 416–417'deki yeni antrenmanın
`plannedDayId`/`plannedDayName` beklentisi ayrı bir teste taşınıp kalır), `src/lib/workout-plan.test.ts`
(`rotationDays` geçen beklentiler)

- `workout-flow.ts`: `finishRotation` ve `FinishRotation` kalkar.
- `workout-plan.ts`: `buildWorkoutDay` `rotationDays` üretmez; `WorkoutDay.rotationDays` kalkar.
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

typecheck, lint, test · Commit: `refactor(workout): drop the finish rotation picker`

**Controller doğrulaması (375 px; `/api/me/sessions*` yazımları engelli):** "Başka program seç" → başka program →
bildirim "… seçildi · Bugün … planlıydı; antrenörüne bildirilecek." (yalnız atanmış günde); bitiş sheet'inde
"Sıradaki antrenman" yok.

---

### Task 14: Kendi program formu

**Boyut:** M · **Files:** Modify `src/components/program/own-program-form.tsx`,
`src/app/me/(sekmeler)/programlar/yeni/new-program-flow.tsx`, `src/app/me/(sekmeler)/programlar/[pid]/duzenle/page.tsx`,
`src/app/me/(sekmeler)/programlar/ai/[draftId]/page.tsx` (24), `src/app/dashboard/clients/[id]/program/own/[pid]/edit/page.tsx`
· Etkilenen testler: yok (UI) — `npm test` yine.

- Program düzeyindeki `WeekdayToggle` ve alanı kalkar; `initial.weekdays` ve gönderilen `weekdays`/`baseWeekdays`
  düşer (şema alanları kalır; sunucu atamalardan hesaplar). Çağıran sayfalar `initial`'den `weekdays`'i çıkarır; AI
  taslağı sayfası `phases: upgradeAssignments(draft.body.phases, draft.body.weekdays)` verir.
- Sıklık satırı yalnız `!hasAssignments(days)`: "Gün atamazsan haftada kaç gün:".
- Seçili programın altında "Program adı" (yer tutucu "Ör. Alt vücut"), ardından "Günleri": `WeekdayToggle` (`taken`
  ile; açıklama "Başka programda: …" ya da danışan kipinde "Bu günlerde Bugün ekranında bu programı görürsün.", `own-pt`
  kipinde "Danışan bu günlerde Bugün ekranında bu programı görür."), `assignWeekdays` ile yazılır.
- Çipler ad + soluk `weekdaysText`; "+ Program"; çekmece "Program ekle", "{programLabel} n/7 antrenman. Eklenen
  program listenin sonuna gelir.", "Boş program", "Bu programdakilerden kopyala"; "Günü sil" → "Kaldır" (erişilebilir
  ad "Kaldır: <ad>"); "En fazla 7 antrenman."
- `new-program-flow.tsx:155,186`: tablo (PT'nin programından kopyalar atamasız gelir, Karar 10).
- Belge yorumları (dosya başı ve 106–107).

typecheck, lint, test · Commit: `feat(own-program): weekday chips per workout`

**Controller doğrulaması (375 px):** test danışanının kendi programı varsa düzenleyicide çipler ve kapalı gün;
**kaydedilmez**. Yoksa yeni program formu açılır, çipler denenir, kaydedilmez.

---

## E · Kapanış

### Task 15: Ölü kodun temizliği

**Boyut:** M · **Files:** Modify `src/lib/program-plan.ts`, `src/lib/program-diff.ts`, `src/lib/training-days.ts`,
`src/lib/workout-cursor.ts`, `src/lib/own-programs.ts`, `src/lib/own-program-files.ts`, `src/lib/workout-routes.ts`,
`src/lib/programs.ts`, `src/lib/schemas/program.ts`, `src/lib/schemas/own-program.ts`,
`src/app/dashboard/clients/[id]/program/weekday-field.tsx`; Delete `src/app/api/clients/[id]/program/schedule/route.ts`
· Test ve etkilenen testler: silinen işlevlerin testleri (`program-plan.test.ts`, `program-diff.test.ts`,
`training-days.test.ts`, `own-programs.test.ts`, `own-program-files.test.ts`, `workout-routes.test.ts`,
`attention.test.ts` (`resetClientSchedule` kullanıyorsa), `proposals.test.ts` (rotasyon uzlaştırması),
`constraint-filter.test.ts` (`nextDayId` içe aktarıyorsa))

Davranış değişmez; her ad için önce `grep -rn '<ad>' src`, çağıranı kalmayan testleriyle silinir:
- Dönüş: `nextDayId`, `completeDay`, `reconcileRotation` (`applyProgramEdit` `stored.rotation`'ı olduğu gibi taşır;
  yorum), `defaultRotation`.
- Bugün ve şerit: `weekPlan`, `weekRotation`, `WeekRotation`, `ActiveDay`, `WeekPlanState`, `WeekPlanDay`,
  `todayCardTitle`, `todayState`, `TodayState`, `nextTrainingDate`, `relativeDayText`.
- Danışanın gün katmanı: `resetClientSchedule`, `resetSchedule`, `ResetDaysButton`, PT'nin
  `/api/clients/[id]/program/schedule` ucu, `programScheduleActionSchema`, `clientScheduleBodySchema`,
  `scheduleBodySchema`, `applyOwnSchedule`, `scheduleOwnProgram` (`own-program-files.ts`), `frequencyMismatch`
  (kullanılmıyorsa). `EffectiveSchedule`'dan `client` ve `'client'` kaynağı (tüketen kalmadıysa).
- Kalır: `rotation` şema alanları, `ROTATION_CHOICES`, `clientSchedule` şeması ve `clientWeekdaysSchema` (eski dosya
  okunur; Kararlar 3, 5).
- `program-plan.ts`, `training-days.ts` ve `workout-plan.ts` dosya başı yorumlarında "A → B → C" anlatımı kalmaz.

typecheck, lint, test · Commit: `refactor(program): remove rotation and client day-layer code`

---

### Task 16: Belgeler ve son doğrulama

**Boyut:** M · **Files:** Modify `docs/SPEC.md`, `docs/design/antrenman-ekrani.md`, `docs/design/kendi-program.md`,
`docs/plans/2026-10-26-kullanilabilirlik-yeniden-duzen-design.md`, `README.md` (danışan özellikleri değiştiyse),
bu plan (son inceleme notu)

- `docs/SPEC.md`: §7.4 (481) programlar "Program A…", hafta günlerine atanır, dönüş yok; 483 "Antrenman günleri"
  paragrafı Kararlar 1–6'ya göre yeniden (danışan günleri değiştirmez); 487 geçmiş örneği "Gün A: …" yerine "Alt vücut:
  …" ve "Günleri: Per → Per, Cum"; 386 (§6 danışan) Bugün ve "Başka program seç"; 154–230 JSON örneklerinde günlere
  `weekdays`, `rotation` ve `clientSchedule`'ın "yalnız eski dosyalar, okunur" notu; §12 yol haritası satırı (643
  civarı) Faz 3; §13'e `POST /api/dev/seed-program`.
- `docs/design/antrenman-ekrani.md`: PT kararları 10 ve 12 (34–36) "(Faz 3'te değişti, 2026-11-01: …)" notuyla;
  §2.1 Bugün başlığı ve şerit (146, 149); §2.3 "Başka program seç" (çizim, metin, bildirim kuralı; `completeDay`
  cümlesi düşer); §2.7'deki "Sıradaki antrenman" maddesi kalkar; §2.11 baştan (veri, PT, danışan değiştirmez, dönüş
  yok, hafta sayımı, kaçan gün penceresi, eski programların atanması).
- `docs/design/kendi-program.md`: kendi programda "Günlerini değiştir" (§3.2 ve geçtiği yerler) → günler formda,
  program başına; `baseWeekdays` notu; PT'den kopyalar atamasız.
- Eski tasarım belgesi 110–135: Karar 14'teki beş madde satır içinde güncellenir ("(Faz 3 planı, 2026-11-01:
  geçersiz — kullanıcı kararı 1)" gibi); "Veri taşıma"ya "okurken, yazmadan; başa sarar" notu.
- Yalnız değişen cümleler; saklanan adları anlatan yerler ("Gün A" seans örnekleri) kalır.
- **Kalıntı denetimi:** `grep -rn "sırayla döner\|sıradaki gün\|A → B → C\|Başka gün seç\|başka gün\|Günlerini değiştir" src docs/SPEC.md docs/design`
  → kalan her eşleşme ya eski veriyi anlatan yorumdur ya kaldırılır; sonuç incelemeye yazılır.
- `npm test`, typecheck, lint; `npm run build` (yönetici, arka planda).
- Bütün Faz 3 aralığının son incelemesi (kod incelemesi ajanı, yazandan ayrı).
- **Yöneticinin turu** — yalnız Claude'un yerleşik tarayıcı paneli (panel gizliyse önce gösterilir), 375 px:
  1. Sayfaya, `/api/dev/seed-program` dışındaki her `/api/` yazımını (GET olmayan) reddeden bir `fetch` sarmalayıcısı
     kurulur; antrenman denemesinde `/api/me/sessions*` zaten engelli. Tohum: PT oturumuyla (`/api/dev/login`)
     `POST /api/dev/seed-program { "clientId": "c_zmrbywaz" }` bir kez; yanıtta üç program ve günleri.
  2. Test danışanı olarak Bugün: turun gününe göre atanmış ya da atanmamış hâl (12. görevin doğrulaması); şerit;
     "Haftanın programı"; "Başka program seç" → başka program → antrenman ekranı ve bildirim (atanmış günde) → hiçbir
     set kaydedilmeden Bugün'e dönüş.
  3. Ayarlar'da atamalar, düğme yok; Programlar sekmesinde günler.
  4. PT olarak: program sayfası, düzenleyicide çipler ve kapalı gün, özet; **Kaydet'e basılmaz**.
  5. Öteki hâl (atanmış/atanmamış) turun gününe düşmediyse raporda "gerçek takvimde denenecek" diye yazılır.
  6. **Gerçek danışan, yalnız okuma:** PT olarak `c_uc942qx6`'nın Genel bakış'ı ve program sayfası açılır (düzenleyici
     açılmaz; yazma sarmalayıcısı kurulu). Kaydedilir: kayıtta danışan katmanı var mı (program sayfasındaki "Danışanın
     eski gün seçimi … artık kullanılmıyor" satırı ve geçmişteki "Danışan güncelledi · Antrenman günleri" kayıtları),
     eski `daysPerWeek` (sıklık satırı) var mı, kendi programları var mı (Kendi programları kartı), türetilen atamalar
     ("Haftanın programı"). Rapor bunlardan danışanın yayından sonra ne göreceğini yazar (Bugün hangi günlerde hangi
     programı gösterir, katman varsa günlerinin PT'ninkine döndüğü, kendi programı varsa atamasız olduğu). Hiçbir şey
     yazılmaz.
  7. Ekran görüntüleri kullanıcıya. Turdan sonra localStorage'da yalnız şu anahtarlar, değerleri günlüğe yazıldıktan
     sonra tam adıyla silinir: `pulsecoach.session.c_zmrbywaz`, `pulsecoach.workout.c_zmrbywaz`,
     `pulsecoach.draft.program.c_zmrbywaz` (`programDraftKey`), ve turda açılan kendi program formlarının taslakları
     `pulsecoach.draft.own.c_zmrbywaz.new` ya da `pulsecoach.draft.own.c_zmrbywaz.<op_…>` (`ownProgramDraftKey`; yalnız
     varsa, tam adıyla; önekle silme yok).
- Gerçek danışanın (`c_uc942qx6`) dosyası yazılmaz; eski biçimin okunması 1., 2. ve 3. görevlerin testleriyle
  doğrulanmıştır.

typecheck, lint, test · Commit: `docs: Faz 3 weekday-assigned programs`
