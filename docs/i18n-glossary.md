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
