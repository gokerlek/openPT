# Kardiyo hedefleri Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kardiyo satırlarına mesafe, yürüyüş/koşuya ayrıca eğim ve kilodan hesaplanan kalori.

**Architecture:** Yeni `trackingType` yok: `duration` + `pattern: 'cardio'` hareketler mesafe, `locomotion: true` olanlar ayrıca eğim
taşır. Alanlar şablon hedefine (`SetTarget`) ve seans setine (`SessionSet`) isteğe bağlı eklenir. Kalori saf bir işlevle gösterilirken
hesaplanır; kilo `health.json`'dan yalnız `measurements` onayıyla okunur, seans dosyasına hiç girmez.

**Tech Stack:** Next.js 16, React 19, TypeScript, valibot, Base UI NumberField, formisch, node:test.

**Spec:** `docs/plans/2026-11-02-kardiyo-hedefleri-design.md`

## Global Constraints

- Yeni bağımlılık yok. Prettier çalıştırılmaz. Next.js API'si için `node_modules/next/dist/docs`.
- Danışan metinleri "sen" ile; PT tarafı metinleri üçüncü şahıs ("PT/antrenör"), uygulama beyaz etiketli.
- Telefon önce: 375 px genişlikte yatay kaydırma yok.
- Antrenman ekranı çevrimdışı çalışır: hesap telefonda yapılır.
- Sağlık verisi seans dosyasına girmez: kilo ve kalori seansa, yerel kayda ya da taslağa yazılmaz.
- Yeni alanların hepsi isteğe bağlı: eski şablon, seans ve `LocalWorkout` aynen okunur.
- Sınırlar: şablonda `distanceM` tam sayı 1–100 000, `inclinePct` 0–30 ve 0,5 adım; seansta `distanceM` tam sayı 0–100 000,
  `inclinePct` 0–30.
- Kalori: `S` = m/dk, `G` = eğim/100; `S ≤ 100` → `VO2 = 0,1·S + 1,8·S·G + 3,5`, değilse `VO2 = 0,2·S + 0,9·S·G + 3,5`;
  `kcal = round(VO2 × kg / 1000 × 5 × dk)`. Örnek: 3000 m / 30 dk, %5, 75 kg → 253.
- Kilo yoksa not: "Kalori, antrenörünün girdiği vücut ağırlığından hesaplanır."
- QA yalnız test danışanı `c_zmrbywaz`'da, yalnız yerleşik Browser panelinde.

## Planın kararları (tasarımın builder'a bıraktıkları)

- **Yürüyüş/koşu setinin işareti:** `logSet` yürüyüş/koşu satırında `inclinePct`'i hep yazar (girilmediyse 0). Kalori yalnız
  `inclinePct`'i olan sette hesaplanır. Böylece geçmiş seansta egzersiz kaydına bakmadan kalori bulunur.
- **Mesafe metni:** 1000 m altı "800 m"; üstü km, en çok iki ondalık: "3 km", "2,5 km", "3,25 km". Giriş hep metre.
- **Süre birimi:** yürüyüş/koşu satırında hedef ve giriş dakika ("30 dk", ondalık serbest, saniyeye `round(dk × 60)`); kayıtlı
  değer "30:00" saatiyle yazılır. Öteki kardiyo ve süreli hareketler bugünkü gibi saniye.
- **Editörde mesafe ve eğim** yalnız düz setlerin hedef alanında (`TargetField`), bütün setlere birden yazılır. Düz olmayan setlerin
  panelinde yok.
- **Yapılmış setin düzeltmesi** tablodaki kutularda (bugünkü kural). `set-edit-panel.tsx`'e mesafe ve eğim eklenmez; `editSet`
  dokunmadığı alanı korur.
- **Kalori yeri:** yapılmış yürüyüş/koşu satırında "Önceki" hücresinin ikinci satırı "≈ 253 kcal"; özet sayfasında ayrı bir kutu.

## Review Focus

1. Eski veri: alanları olmayan şablon, seans ve yerel antrenman kaydı değişmeden okunur, kaydedilince alan eklenmez (Task 2 testi).
2. Onay geri çekilince kalori her yerde kaybolur ve `health.json` yalnız kilo için okunmaz (Task 5 ve Task 7 testleri).
3. Danışan mesafeyi 0 ya da boş bırakır: set kaydedilir, kalori çıkmaz, "NaN" ya da "0 m" yazılmaz (Task 1 ve Task 5 testleri).
4. PT hareketi kardiyodan başka bir harekete çevirir ya da danışan muadille değiştirir: mesafe ve eğim sessizce düşer, yanlış satıra
   yazılmaz (Task 2 ve Task 5 testleri).
5. Sayaçla yapılan set: "Bitir"e basmadan yazılan mesafe ve eğim sete girer (Task 6'da panelde doğrulanır).

---

### Task 1: Kardiyo yardımcıları ve kalori

**Files:**
- Create: `src/lib/cardio.ts`
- Test: `src/lib/cardio.test.ts`

**Interfaces:**
- Produces:
  - `type CardioKind = 'machine' | 'walk'`
  - `const CARDIO_LIMITS = { distanceMax: 100_000, inclineMax: 30, inclineStep: 0.5, distanceStep: 100 } as const`
  - `type CardioValues = { seconds?: number | undefined; distanceM?: number | undefined; inclinePct?: number | undefined }`
  - `cardioKind(exercise: { trackingType: TrackingType; pattern?: string | undefined; locomotion?: boolean | undefined }): CardioKind | null`
  - `walkKcal(set: CardioValues, bodyMassKg: number | undefined): number | null`
  - `distanceText(meters: number): string`
  - `cardioText(set: CardioValues, kcal?: number | null): string` — "30:00 · 3 km · %5 · ≈ 253 kcal"; olmayan parça yazılmaz
  - `bodyMassOn(measurements: readonly MeasurementEntry[], date?: string): number | undefined`
  - `totalKcal(sets: readonly CardioValues[], bodyMassKg: number | undefined): number` — `walkKcal` toplamı, null'lar 0

- [ ] **Step 1: Failing tests** (`describe('cardio')`):
  - `cardioKind`: `{duration, cardio}` → `'machine'`; `+locomotion: true` → `'walk'`; `{duration, 'core'}` ve `{weight_reps, cardio}` → `null`.
  - `walkKcal({ seconds: 1800, distanceM: 3000, inclinePct: 5 }, 75) === 253`.
  - Koşu: `walkKcal({ seconds: 1500, distanceM: 5000, inclinePct: 1 }, 70) === 396`.
  - `inclinePct: 0` ile `walkKcal({1800, 3000, 0}, 75) === 152` (VO2 = 13,5).
  - `null`: eğim yok (`inclinePct` undefined), mesafe 0 ya da yok, süre 0, kilo undefined ya da 0.
  - `distanceText`: 800 → "800 m", 1000 → "1 km", 2500 → "2,5 km", 3250 → "3,25 km", 3333 → "3,33 km".
  - `cardioText({ seconds: 1800, distanceM: 3000, inclinePct: 5 }, 253) === '30:00 · 3 km · %5 · ≈ 253 kcal'`; `{ seconds: 600 }` →
    "10:00"; `{ seconds: 1800, distanceM: 0, inclinePct: 2.5 }` → "30:00 · %2,5".
  - `bodyMassOn`: yalnız `body_mass` sayılır; tarihsiz en yeni; tarihli o gün ya da öncesindeki son; öncesi yoksa en eski; hiç yoksa undefined.
  - `totalKcal` iki yürüyüş seti + eğimsiz bir set → iki yürüyüşün toplamı.
- [ ] **Step 2:** `node --test --experimental-strip-types src/lib/cardio.test.ts` → FAIL (modül yok).
- [ ] **Step 3:** `src/lib/cardio.ts`'i yaz. Süre saati için `workout-session.ts`'teki `clockText` yerine burada küçük bir yardımcı
  (döngüsel içe aktarma olmasın); sayılar `toLocaleString('tr-TR', { maximumFractionDigits: 2 })`, gruplama yok.
- [ ] **Step 4:** Aynı komut → PASS.
- [ ] **Step 5:** Commit: `feat(cardio): calorie and cardio text helpers`.

### Task 2: Şemalar ve verinin korunması

**Files:**
- Modify: `src/lib/schemas/exercise.ts` (`exerciseSchema`'ya `locomotion: v.optional(v.boolean())`)
- Modify: `src/data/exercise-library.ts` (`kosu-bandi` kaydına `"locomotion": true`)
- Modify: `src/lib/template-plan.ts` (`PlanExercise`'e `pattern?: MovementPattern`, `locomotion?: boolean`; `normalizeTemplate`)
- Modify: `src/lib/workout-plan.ts` (`WorkoutExercise`'e `locomotion?: boolean`)
- Modify: `src/lib/progression.ts` (`SetTarget`'e `distanceM?: number; inclinePct?: number`)
- Modify: `src/lib/schemas/template.ts` (`setSpecSchema`)
- Modify: `src/lib/schemas/session.ts` (`sessionSetSchema`)
- Modify: `src/lib/session-merge.ts` (`normalizeSet` ve `target`'ın `compact`'ı)
- Modify: `src/lib/client-targets.ts` (`sameSet`), `src/lib/program-diff.ts` (`amrapOnly`)
- Test: `src/lib/template-plan.test.ts`, `src/lib/session-merge.test.ts`, şema testleri (varsa `src/lib/schemas/*.test.ts`, yoksa `template-plan.test.ts`)

**Interfaces:**
- Consumes: `cardioKind` (Task 1).
- Produces: `SetTarget.distanceM?`, `SetTarget.inclinePct?`, `SessionSet.distanceM?`, `SessionSet.inclinePct?`, `Exercise.locomotion?`,
  `PlanExercise.pattern?`, `PlanExercise.locomotion?`.

- [ ] **Step 1: Failing tests:**
  - `setSpecSchema`: `{min:1800,max:1800,distanceM:3000,inclinePct:5}` geçer ve alanlar korunur; `distanceM: 0`, `distanceM: 1.5`,
    `inclinePct: 0.3`, `inclinePct: 31` reddedilir; alansız eski set aynen geçer.
  - `sessionSetSchema`: `{…, seconds: 1800, distanceM: 0, inclinePct: 0}` geçer.
  - `normalizeTemplate`: koşu bandı (`locomotion`) satırında `distanceM` ve `inclinePct` kalır; bisiklet (cardio, locomotion yok)
    satırında `distanceM` kalır, `inclinePct` düşer; plank (duration, core) satırında ikisi de düşer.
  - `session-merge`: `distanceM`/`inclinePct`'li set ve `target` normalleştirmeden aynen geçer; alansız set alan kazanmaz.
  - `sameSet`: yalnız `distanceM` farklı iki set eşit değil.
- [ ] **Step 2:** `npm test` → yeni testler FAIL.
- [ ] **Step 3:** Şemalar: `distanceM: v.optional(int(1, 100_000, ' m'))`, `inclinePct: v.optional(v.pipe(v.number('Sayı gir.'),
  v.minValue(0, …), v.maxValue(30, 'Eğim en fazla %30 olur.'), v.multipleOf(0.5, 'Eğim 0,5 adımla olur.')))`; seansta `int(0, 100_000)`
  ve `0–30`. `normalizeTemplate`: `const kind = exercise ? cardioKind(exercise) : null`; mesafe `kind` varken, eğim `kind === 'walk'`
  iken yazılır (egzersiz yoksa olduğu gibi kalır, yüzdedeki kural gibi). `amrapOnly` yeni alanları da karşılaştırır.
- [ ] **Step 4:** `npm test` → PASS; `npx tsc --noEmit` temiz.
- [ ] **Step 5:** Commit: `feat(cardio): distance and incline in set targets and session sets`.

### Task 3: Metinler

**Files:**
- Modify: `src/lib/set-plan.ts` (`formatSets`, `setsText`)
- Modify: `src/lib/edit-messages.ts` (`rowWorkText`), `src/lib/client-set-text.ts` (`clientSetText`)
- Modify: `src/lib/workout-session.ts` (`setValueText`, `previousText`, `targetCell`, `targetText`, `nextText`)
- Modify: çağıranlar: `src/components/program/day-plan.tsx`, `src/app/me/client-day-plan.tsx`,
  `src/app/dashboard/templates/template-sequence.tsx`, `src/components/block-editor/block-items.tsx` (`RowMeta`)
- Test: `src/lib/set-plan.test.ts`, `src/lib/edit-messages.test.ts`, `src/lib/client-set-text.test.ts`, `src/lib/workout-session.test.ts`

**Interfaces:**
- Consumes: `CardioKind`, `distanceText`, `cardioText`, `walkKcal` (Task 1); `PreviousSet.distanceM?/inclinePct?` (Task 5 ekler; bu
  task `previousText`'i alanlar varsa kullanacak biçimde yazar).
- Produces:
  - `formatSets(sets, trackingType, audience = 'pt', cardio: CardioKind | null = null)`
  - `setsText(sets, trackingType, cardio: CardioKind | null = null)`
  - `rowWorkText(sets, trackingType, restSeconds?, cardio: CardioKind | null = null)`
  - `clientSetText(sets, trackingType, restSeconds?, cardio: CardioKind | null = null)`
  - `setValueText(set: Pick<SessionSet, 'kg' | 'reps' | 'seconds' | 'distanceM' | 'inclinePct'>, bodyMassKg?: number)`
  - `previousText(previous, trackingType, cardio: CardioKind | null = null)`
  - `targetCell(target, trackingType, cardio = null)`, `targetText(target, trackingType, cardio = null)`; `nextText` satırın `cardio`'sunu okur.

- [ ] **Step 1: Failing tests:**
  - `formatSets([{min:1800,max:1800,distanceM:3000,inclinePct:5}], 'duration', 'pt', 'walk') === '1 × 30 dk · 3 km · %5'`.
  - `formatSets([{min:300,max:600}], 'duration', 'pt', 'walk') === '1 × 5–10 dk'`.
  - `formatSets([{min:600,max:600,distanceM:4000}], 'duration', 'pt', 'machine') === '1 × 600 sn · 4 km'`.
  - `setsText` aynı girdilerle: "1×30 dk · 3 km · %5", "1×600 sn · 4 km".
  - `cardio` verilmeyen eski çağrılar bugünkü çıktıyı verir (mevcut testler değişmez).
  - `setValueText({ seconds: 1800, distanceM: 3000, inclinePct: 5 }, 75) === '30:00 · 3 km · %5 · ≈ 253 kcal'`; kilosuz
    "30:00 · 3 km · %5"; `{ seconds: 45 }` → "45 sn" (değişmez).
  - `previousText({ setIndex: 0, value: 1800, distanceM: 3000, inclinePct: 5 }, 'duration', 'walk') === '30:00 · 3 km · %5'`;
    `'machine'` ile `{value: 600, distanceM: 4000}` → "600 sn · 4 km".
  - `targetCell({min:1800,max:1800}, 'duration', 'walk') === '30 dk'`.
- [ ] **Step 2:** İlgili test dosyaları → FAIL.
- [ ] **Step 3:** Ortak bir `cardioSuffix(sets)` (`set-plan.ts` içinde): setlerin mesafesi hepsinde aynıysa tek değer, farklıysa
  " / " ile (eksik olan "—"); eğim aynı kuralla "%5". `walk`'ta aralık dakikaya çevrilir, birim "dk". Çağıranlar egzersizi biliyorsa
  `cardioKind(exercise)` geçer.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit: `feat(cardio): distance, incline and minutes in set texts`.

### Task 4: PT editörü ve egzersiz formu

**Files:**
- Modify: `src/components/block-editor/set-table.tsx` (`TargetField`)
- Modify: `src/app/dashboard/exercises/load-fields.tsx` (ya da `exercise-form.tsx`, desen alanının yanı)
- Modify: editörün egzersiz haritasını kuran yer (`PickerExercise` `locomotion`'ı taşımıyorsa)

**Interfaces:**
- Consumes: `cardioKind`, `CARDIO_LIMITS` (Task 1); `SetTarget` alanları (Task 2).

- [ ] **Step 1:** `TargetField`'da `const kind = exercise ? cardioKind(exercise) : null`:
  - `kind` varken hedef kutularının yanına "Mesafe (m)" (`<Input type="number">`, adım 100, boş → alan silinir,
    `writeAll({ distanceM })`; boşta `distanceM` anahtarı setlerden kaldırılır).
  - `kind === 'walk'`: "Eğim (%)" (adım 0,5, aynı kural) ve süre kutuları dakika: gösterim `value / 60`, yazımda `round(dk × 60)`;
    birim "dk", çipler `[10, 20, 30, 45]` dk.
  - 375 px'te kutular alt satıra sarılır, yatay kaydırma yok.
- [ ] **Step 2:** Egzersiz formu: süreli ve deseni `cardio` iken "Yürüyüş/koşu: eğim ve kalori" anahtarı
  (`internalRotationUnderLoad` anahtarının kalıbı, `setInput(form, { path: ['locomotion'], input })`). Başka desende ya da türde anahtar
  görünmez ve kayıtta `locomotion` yazılmaz (`toExercisePayload` kapalıyken alanı atar).
- [ ] **Step 3:** `npx tsc --noEmit` ve `npm run lint` temiz.
- [ ] **Step 4:** Panelde (PT girişi, `c_zmrbywaz`'ın programı): Koşu Bandı satırına 30 dk, 3000 m, %5 yaz, kaydet; yeniden açınca
  değerler durur; program özetinde "1 × 30 dk · 3 km · %5". Bisiklet satırında yalnız Mesafe görünür. 375 px'te ekran görüntüsü.
- [ ] **Step 5:** Commit: `feat(cardio): distance and incline in the template editor`.

### Task 5: Antrenman motoru ve kilo

**Files:**
- Modify: `src/lib/workout-plan.ts` (`WorkoutRow.cardio?: CardioKind`, `workoutRowFor`, `previousSets`, `WorkoutDay.bodyMassKg?: number`)
- Modify: `src/lib/workout-cursor.ts` (`PreviousSet` alanları)
- Modify: `src/lib/workout-session.ts` (`SetDraft`, `NextSet`, `setAt`, `logSet`, `editSet`)
- Modify: `src/lib/workout-routes.ts` (`measurements` onayıyla `health.json`, `bodyMassKg`)
- Test: `src/lib/workout-session.test.ts`, `src/lib/workout-routes.test.ts`, `src/lib/workout-outbox.test.ts`

**Interfaces:**
- Consumes: Task 1–3.
- Produces:
  - `type SetValues = { kg?: number | undefined; value?: number | undefined; distanceM?: number | undefined; inclinePct?: number | undefined }`
  - `SetDraft = { rowId; setIndex } & SetValues` (kg ve value bugünkü gibi)
  - `NextSet.distanceM?: number`, `NextSet.inclinePct?: number`
  - `logSet(day, doc, input: { …bugünkü…; distanceM?: number; inclinePct?: number })`
  - `editSet(doc, setId, values: { kg?; value; distanceM?; inclinePct? }, stamp)`
  - `WorkoutDay.bodyMassKg?: number`

- [ ] **Step 1: Failing tests:**
  - `nextSet` yürüyüş satırında: hedefte 3000 m/%5 → `distanceM 3000, inclinePct 5`; hedefte yok, geçen seferin aynı setinde 2800/%4
    → onlar; ikisi de yok → `undefined`; taslak (`draft`) ve satırda yazılan (`typed`) bunları ezer.
  - `logSet` yürüyüşte `distanceM` ve `inclinePct` yazar; eğim verilmezse `inclinePct: 0`; makinede (bisiklet) eğim yazılmaz;
    kuvvet satırında ikisi de yazılmaz.
  - `editSet` `distanceM`'i değiştirir; verilmeyen alan korunur.
  - `workoutRoute`: `measurements` onayı ve `body_mass` 74 varsa `day.bodyMassKg === 74`; onay yoksa alan yok ve `health.json`
    yalnız kilo için okunmaz (bugünkü `readiness`/`conditions` okuması aynen).
  - `parseLocalWorkout`: `drafts` içinde `distanceM`/`inclinePct` taşıyan taslak aynen döner.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Uygula. `setAt`'te sıra: taslak → yazılan → hedef → geçen sefer. `cardio`'su olmayan satırda iki alan hiç
  hesaplanmaz. Kilo için `bodyMassOn(record.measurements)`.
- [ ] **Step 4:** `npm test` → PASS; `npx tsc --noEmit` temiz.
- [ ] **Step 5:** Commit: `feat(cardio): distance and incline in the workout engine`.

### Task 6: Antrenman ekranı

**Files:**
- Modify: `src/app/me/antrenman/exercise-card.tsx` (başlık ve `colgroup`, kilo notu)
- Modify: `src/app/me/antrenman/set-row.tsx` (`RowEntry.onChange` ve `FixSet` → `SetValues`; mesafe ve eğim hücreleri; kalori satırı)
- Modify: `src/app/me/antrenman/entry-panel.tsx` (mesafe ve eğim stepper'ları; yürüyüşte süre dakika)
- Modify: `src/app/me/antrenman/workout-screen.tsx` (`onDraft`, `onPick`, `onDone`, `onFixSet`, `entryOf`; `bodyMassKg`)

**Interfaces:**
- Consumes: `SetValues`, `NextSet` alanları, `logSet`/`editSet` (Task 5); `walkKcal`, `distanceText` (Task 1); `previousText(…, cardio)` (Task 3).

- [ ] **Step 1:** Tablo: kardiyo satırında sütunlar Set · Önceki · Süre · Mesafe · (Eğim) · durum; kg sütunu yok. Bekleyen satırda
  kutular (`CellNumber`; eğim `decimal`, mesafe tam sayı), yapılmışta yerinde düzeltme (`settled`). Yürüyüşte süre hücresi dakika.
  Yapılmış yürüyüş satırında "Önceki"nin altında "≈ 253 kcal" (`walkKcal(set, day.bodyMassKg)`, null ise yok).
- [ ] **Step 2:** Yürüyüş kartında `bodyMassKg` yoksa kartın altında not: "Kalori, antrenörünün girdiği vücut ağırlığından hesaplanır."
- [ ] **Step 3:** Panel: süre stepper'ı ve sayaç kalır (yürüyüşte dakika, adım 1); altına "Mesafe" (adım 100, m) ve yürüyüşte "Eğim"
  (adım 0,5, %). Sayaç çalışırken de mesafe ve eğim stepper'ları görünür; "Bitir" o anki değerlerle kaydeder.
- [ ] **Step 4:** `npx tsc --noEmit`, `npm run lint` temiz.
- [ ] **Step 5:** Panelde, `c_zmrbywaz` ile, 375 px: Koşu Bandı satırı hedefle dolu; ✓ → set 30:00 · 3 km · %5 olarak kaydedilir;
  hücrede mesafeyi 3200 yapınca güncellenir; sayaçla bir set (mesafe yazıp "Bitir"); kuvvet satırları değişmemiş. Ekran görüntüsü.
- [ ] **Step 6:** Commit: `feat(cardio): distance and incline entry in the workout screen`.

### Task 7: Özet sayfası ve PT'nin seans görünümü

**Files:**
- Modify: `src/lib/workout-summary.ts` (`SessionSummary.kcal: number`, `sessionSummary` girdisine `bodyMassKg?: number`)
- Modify: `src/lib/history-store.ts` (`loadSummary`'e kilo kaynağı: `measurements` onayı varken ölçümler, seansın gününe göre `bodyMassOn`)
- Modify: `src/app/me/antrenman/ozet/[id]/page.tsx`, `summary-carousel.tsx` (`kcal > 0` ise "kcal" kutusu)
- Modify: `src/app/dashboard/clients/[id]/sessions/[sessionId]/page.tsx`, `src/lib/pt-sessions.ts`, `src/lib/session-history.ts`
  (`bodyMassKg` → `setValueText(set, bodyMassKg)`)
- Test: `src/lib/workout-summary.test.ts`, `src/lib/session-history.test.ts` (varsa)

- [ ] **Step 1: Failing tests:** `sessionSummary` iki yürüyüş setiyle ve `bodyMassKg: 75` → `kcal` iki setin toplamı; kilosuz 0;
  `sessionDetail(doc, tz, { bodyMassKg: 75 })` yürüyüş setinin metni "30:00 · 3 km · %5 · ≈ 253 kcal".
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Uygula. Sağlık okuması yalnız `canRecordHealth(client, 'measurements')` iken (`readHealthIfAllowed`); PT sayfasında
  bugünkü `check_in` okumasıyla birleştir, iki kez okuma yok. Özet kutusu: değer, birim "kcal", etiket "yürüyüş/koşu (tahmini)";
  dört kutunun ızgarası 375 px'te bozulmaz.
- [ ] **Step 4:** `npm test` → PASS; panelde özet sayfası ve PT'nin seans sayfası.
- [ ] **Step 5:** Commit: `feat(cardio): calories in the summary and the PT session view`.

### Task 8: Son doğrulama

- [ ] `npm test`, `npm run lint`, `npx tsc --noEmit`; dev sunucusu yeniden başlatıldıktan sonra `npm run build` (aynı anda değil).
- [ ] Taze bir gözden geçirici bütün dalı tasarım belgesine karşı okur; bulguları düzelt.
- [ ] QA verisi: `c_zmrbywaz`'ta eklenen kardiyo satırı ve seanslar test verisi olarak kalabilir; tarayıcıda yalnız kendi
  localStorage anahtarlarımı adıyla sil.
