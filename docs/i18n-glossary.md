# i18n glossary (TR → EN)

Every English string must use these terms. Plan: `docs/plans/2026-11-05-coklu-dil-plan.md`. If a term you need is missing, add it here in the same commit.

**Style:** US-English UI copy (spelling "program", "color", "favorite"), short and plain, sentence case for titles and buttons ("Add exercise", not "Add Exercise"). Address the user as "you" where Turkish uses "sen". Dates and numbers come from `getFormat(locale)` (Intl `en-GB`: "1 September 2026", 24-hour clock, decimal point). Plurals go through `plural()`; never append "s". Lists go through `listText()`.

**Never translate:** PT-written content (program, day, template and exercise names the PT typed, notes, client names, the brand/app name), ids, slugs, codes, routes, cookie and storage keys, commit-message formats parsed by code, `SEED_MESSAGE`, `api/dev` routes. Language names are endonyms: "Türkçe", "English".

## People and places

| Turkish | English | Notes |
|---|---|---|
| PT, antrenör | trainer | UI may say "Trainer". Never "coach" for the person (see AI koç). |
| danışan | client | |
| panel (PT tarafı) | dashboard | The home-screen name keeps the suffix "Panel" ("openPT Panel"). |
| Genel bakış | Overview | |
| Kütüphane | Library | |
| Ayarlar | Settings | |
| Görünüm (ayar sekmesi) | Appearance | |
| Yapay zekâ | AI | |
| AI koç | AI coach | |
| Uygulama (ayar sekmesi) | App | |
| sürüm | version | Settings tab "Sürüm" → "Version". |
| kurulum | setup | `/install` wizard: "setup". |
| giriş (yapmak) | sign in | Noun: "sign-in". |
| çıkış yap | sign out | |
| şifre | password | |
| davet | invite | |
| kare kod | QR code | |
| oturum | session (auth) | "Your session has expired." |
| dil | language | |

## Client tabs

| Turkish | English |
|---|---|
| Bugün | Today |
| Geçmiş | History |
| Programlar | Programs |
| İlerleme | Progress |
| Sağlık | Health |
| Ayarlar | Settings |

## Training

| Turkish | English | Notes |
|---|---|---|
| antrenman | workout | "Antrenman başlat" → "Start workout". |
| program | program | US spelling. "Program A/B" stays (default names are data). |
| evre | phase | |
| gün (program günü) | day | |
| şablon | template | |
| egzersiz | exercise | |
| hareket | exercise; movement | "movement" for patterns ("Hareket kalıbı" → "Movement pattern"). |
| hareket kalıbı | movement pattern | |
| set | set | "1 set / 3 sets". |
| tekrar | rep / reps | "8 reps"; field label "Reps". |
| ağırlık | weight | |
| dinlenme | rest | "Rest 90 s". |
| süre | duration; time | "duration" for timed sets. |
| ilerleme kuralı | progression rule | |
| yedekte tekrar (RIR) | reps in reserve (RIR) | |
| muadil | alternative | |
| ısınma | warm-up | |
| soğuma | cool-down | |
| bileşik | compound | |
| izolasyon | isolation | |
| kondisyon | conditioning | |
| süperset, grup | superset, group | |
| hacim | volume | |
| rekor | personal record (PR) | |
| hedef | target; goal | "target" for numbers, "goal" for the client's aims. |
| ipucu (hareketin) | cue | |
| kayıt türü | tracking type | |

## Equipment

| Turkish | English | Notes |
|---|---|---|
| cihaz | equipment; machine | Section "Cihazlar" → "Equipment"; a single item → "equipment" or "machine" when it has a weight stack. In code and ids: device. |
| ekipman (tür) | equipment type | The `EQUIPMENT` code list (barbell, dumbbell…). |
| aparat | attachment | |
| halter | barbell | |
| dambıl | dumbbell | |
| makine | machine | |
| kablo | cable | |
| direnç bandı | resistance band | |
| vücut ağırlığı | bodyweight | |
| kardiyo aleti | cardio machine | |
| plaka | plate | |
| ağırlık bloğu | weight stack | |
| tutuş | grip | |

## Body and health

| Turkish | English | Notes |
|---|---|---|
| kas | muscle | |
| kas grubu, bölge | muscle group | |
| hedef / yardımcı / dengeleyici kas | primary / secondary / stabilizer muscle | |
| derin kas | deep muscle | |
| ölçüm | measurement | |
| kısıt | limitation | Clinical copy needs human review (plan §8.9). |
| tarama | screening | |
| ağrı | pain | |
| nabız | heart rate | Unit "atım/dk" → "bpm". |
| su | water | |
| sağlık takibi | health tracking | |
| onay | consent | |

## Catalog vocabulary (namespace `catalog`, settled in F2)

| Turkish | English | Notes |
|---|---|---|
| kas grubu adları: Göğüs, Omuz, Sırt, Kol, Karın, Kalça ve bacak, Boyun | Chest, Shoulders, Back, Arms, Core, Glutes and legs, Neck | Muscle regions (`muscleGroups`). |
| Kanat (üst/orta/alt) | Lats (upper/middle/lower) | |
| Ön omuz / Yan omuz / Arka omuz | Front / Side / Rear delts | |
| Bel dikleştiricileri | Spinal erectors | |
| Ön bacak / Arka bacak / İç bacak | Quadriceps / Hamstrings / Adductors | |
| Kalça (kas) / Yan kalça | Glutes / Glute medius | "Kalça" as a joint or region: hip. |
| Baldır | Calves | |
| Karın (aile) / Üst karın / Yan karın | Abs / Upper abs / Obliques | |
| hedef / yardımcı / dengeleyici | primary / secondary / stabilizer | Muscle roles. |
| hareket kalıbı adları | horizontal push, hip hinge, single-leg, anti-rotation… | See `catalog/en.ts` `patterns`. |
| tek hareket / süperset / devre / kompleks | single exercise / superset / circuit / complex | Block kinds. |
| tur | round | "3 rounds". |
| istasyon arası | between stations | |
| ara yok, dinlenme yok | no rest | |
| tükenişe kadar | to failure | |
| N tekrar yedekte | N reps in reserve | |
| çift ilerleme / doğrusal | double progression / linear | |
| tıkanma | stall | |
| hafifletme | deload | Lighter workout after stalls. |
| zorluk (Kolay/İyi/Zor/Başaramadım) | effort (Easy/Good/Hard/Failed) | |
| yapabildiğin kadar | as many as you can | Client wording of AMRAP. |
| piramit / back-off / yük % | pyramid / back-off / load % | |
| ağırlık bloklu makine | weight-stack machine | |
| plaka yüklemeli makine | plate-loaded machine | |
| blok (ağırlık) | stack | "Stack 5–100 kg in 5 kg steps". |
| kızak | sled | |
| makara | pulley | |
| ara ağırlık | add-on weight | |
| en küçük artış | smallest increment | |
| mesafe / eğim | distance / incline | |
| evre (varsayılan ad "Evre 1") | phase ("Phase 1") | Default names are data: written in the writer's language; collision checks match every language. |
| program (varsayılan ad "Program A") | "Program A" | Same in both languages. |
| … kopyası | … copy | |
| Haftada N gün | N days a week | |
| N. hafta / M | Week N of M | |
| süresiz | open-ended | |
| bulgu / tanı | finding / diagnosis | Clinical. |
| kırmızı bayrak | red flag | |
| niteleyici: akut, reaktif, şiddetli, sakin dönem, kontrollü, kontrolsüz, ameliyat sonrası | acute, reactive, severe, quiet phase, controlled, uncontrolled, post-op | |
| hazır oluşluk | readiness | Health module part. |
| ağrı takibi | pain tracking | |
| hareket taraması | movement screening | |
| Aktif / Duraklatıldı / Arşivde | Active / Paused / Archived | Client status. |
| Yeni başlıyor / 6 ay ve üstü / 1 yıl ve üstü | Just starting / 6 months or more / 1 year or more | Training experience. |

## Units on screen

| Turkish | English |
|---|---|
| kg | kg |
| cm | cm |
| sn | s |
| dk | min |
| sa | h |
| atım/dk | bpm |
| kcal | kcal |
| "%30" | "30%" (via `getFormat`) |

## Common UI words (namespace `common`)

| Turkish | English |
|---|---|
| Kaydet | Save |
| Kaydediliyor… | Saving… |
| Vazgeç | Cancel |
| Sil | Delete |
| Düzenle | Edit |
| Ekle | Add |
| Kapat | Close |
| Devam | Continue |
| Geri al | Undo |
| Tekrar dene | Try again |
| Varsayılana dön | Reset to default |
| Sonuç yok | No results |
| Belirtilmedi | Not specified |
| Beklenmeyen bir hata oldu. | Something went wrong. |
| az önce / N dakika önce | just now / N minutes ago |
| bugün 14:05 / dün 14:05 | today at 14:05 / yesterday at 14:05 |
