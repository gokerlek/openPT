# Ortak liste ve tek kas haritası Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Her kas haritası tek desen diliyle ve tek açıklama kutusuyla çizilir, derin kaslar aynı bileşende durur; her liste aynı
tutamaç, aynı kaydırarak silme, aynı "Sil" ve aynı 8 sn "Geri al" ile çalışır; kopya kod silinir.

**Architecture:** Kademe hesabı `src/lib/muscle-tiers.ts`'te saf işlevlerdir; `MuscleMap` yoğunluk yerine kademe (`marks`) alır ve
açıklama kutusunu (`MuscleLegend`) ile derin kas bölümünü kendisi çizer, sarmalayıcılar silinir. Listeler için dnd-kit ayarları
tek modülde toplanır; düz listeler tek bir `SortableList` kullanır, düzenleyici kendi bırakma mantığını korur ama aynı ayarları
alır. Silme `SwipeRow` + görünür "Sil" + `showUndoToast` (yerel) ya da `ConfirmDeleteDialog` (kayıt) ile yapılır.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind v4 (container query), motion, @dnd-kit/core, formisch, sonner, node:test.

**Spec:** `docs/plans/2026-11-03-ortak-liste-ve-kas-haritasi-design.md`

## Global Constraints

- Yeni bağımlılık yok. Prettier çalıştırılmaz. Next.js API'si için `node_modules/next/dist/docs`.
- Veri biçimi değişmez: şablon, program, seans ve `LocalWorkout` dosyaları aynen okunur ve yazılır.
- Danışan metinleri "sen" ile; PT tarafı metinleri PT'yi üçüncü şahıs olarak anar ("PT/antrenör"), uygulama beyaz etiketli.
- Telefon önce: 375 px genişlikte yatay kaydırma yok. Kas adları hiçbir genişlikte kesilmez.
- Gizli hareket yok: sürükleme ve kaydırma kısayoldur; her işlemin görünür bir karşılığı vardır.
- Silmenin adı her yerde "Sil". "Kaldır" yalnız bir seçimi geri almak için ("Gruptan çıkar", izin kaldırma).
- Yerel silme: 8 sn `showUndoToast`. Kayıt silme: ortak onay penceresi, Geri al yok. Danışan silerken ad yazma kuralı kalır.
- Kademe eşikleri: tek antrenman dolu ≥3, çizgili 1,5–2,75, noktalı >0 ve <1,5; haftalık dolu ≥10, çizgili 5–9,75, noktalı >0 ve <5.
- Desen: dolu = `--muscle-target`; çizgili ve noktalı = `--muscle-empty` üstünde `--muscle-target`; gerileme = `--muscle-empty`
  üstünde `--destructive` çizgi ve `--destructive` kalın kenar. Opaklık ya da ton rampası yok.
- `src/lib` altındaki test edilen modüller birbirini göreli `.ts` yoluyla içe aktarır (`@/` yalnız `import type`'ta).
- Alt ajanlar dev sunucusu başlatmaz, `npm run build` çalıştırmaz. Her görev sonunda `npm test`, `npx tsc --noEmit`, `npm run lint`.
- QA yalnız test danışanı `c_zmrbywaz`'da, yalnız yerleşik Browser panelinde. Gerçek danışana (`c_uc942qx6`) yazılmaz.
- Commit'ler açık yollarla; mesaj sonu `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push yok.

## Planın kararları (tasarımın builder'a bıraktıkları)

- **Adlar:** kademe `MuscleTier = 'filled' | 'striped' | 'dotted'`; haritadaki işaret `MuscleMark = MuscleTier | 'declined'`.
  Yeni dosyalar: `src/lib/muscle-tiers.ts`, `src/lib/haptics.ts`, `src/components/muscle-map/muscle-legend.tsx`,
  `src/components/muscle-map/deep-muscle-section.tsx`, `src/components/removable-chip.tsx`, `src/components/toggle-tiles.tsx`,
  `src/components/confirm-delete-dialog.tsx`, `src/components/list/dnd-base.ts`, `src/components/list/sortable-list.tsx`,
  `src/components/list/move-buttons.tsx`, `src/components/condition-picker.tsx`.
- **Sarmalayıcılar silinir:** `TemplateMuscleMap` ve `ExerciseMuscleMap` kalkar; kullanan her yer `MuscleMap`'e `marks` ve
  `legend` verir. Küçük şablon kartı `legend` vermez.
- **Açıklama kutusunun yeri:** `MuscleMap`, `legend` ya da `deep` verilince kendini `@container` kutusuna sarar; kutu dar
  alanda haritanın altında, kap 36 rem'i (`@xl`) geçince yanında durur. Derin kas bölümü hep en altta.
- **Açıklama satırları kas kas yazılır** (`MUSCLE_LABELS`), aile birleştirmesi (`summarizeMuscles`) açıklamada kullanılmaz;
  satırdan tek kas kaldırılabilsin (egzersiz formu).
- **Geri al'ın kurulumu:** silme hemen yapılır, Geri al önceki hâli geri yazar. "Sonrasında değişti" denetimi bugünkü
  `undoAt`'tir (`src/lib/editor-undo.ts`); üç form da onu `showGuardedUndo` üzerinden kullanır.
- **Tek sürükleme kurulumu:** sensör, otomatik kaydırma, sessiz duyurular ve `html[data-reordering]` `dnd-base.ts`'te. Düzenleyici
  (`EditorDnd`) bunları içe aktarır, bırakma mantığına dokunulmaz. Düz listeler (`SortableList`) bunları ve `CardGrabber`'ı kullanır;
  isabet `closestCenter`. Klavye: odaktaki öğede Alt+↑/↓ ve gizli "Yukarı taşı / Aşağı taşı" düğmeleri; `KeyboardSensor` yok.
- **Set satırları:** `<tr>` dönüşüm alamadığı için set tablosu `div` tabanlı ARIA tablosuna (`role="table" / "row" / "cell"`)
  döner; satırlar tek bir sütun şablonunu paylaşır ve her satır `SwipeRow` içindedir.
- **Antrenmanda eklenen hareket** yalnız henüz seti yazılmamışsa silinir; seti varsa "Atla" ile atlanır.
- **Gösterim sırası:** `displayDays` ilk atanmış hafta gününe göre sıralar; atanmamışlar saklanan sırayla sona. PT
  düzenleyicisinin ilk seçili programı gösterim sırasındaki ilktir (atama yoksa saklanan ilk).
- **Satır görünüşü (izin, geri çek, reddet):** üçünün sağdaki düğmesi aynı biçimi alır: `Button variant="ghost" size="sm"`,
  ikon + metin, en az 44 px yükseklik.

## Review Focus

1. Eşik değerleri ve yalnız kardiyo: 3, 1,5, 10 ve 5 set tam sınırda doğru kademeyi alır; yalnız kardiyo olan yükte harita boş,
   açıklamada yalnız "Kardiyo · n set" satırı (Task 1 testleri).
2. Geri al'dan önce başka değişiklik: Geri al hiçbir şeyi ezmez, "Sonrasında başka değişiklik yapıldı; geri alınamadı." yazar
   (Task 7 testi; antrenmanda eklenen hareketi silip set yazdıktan sonra Geri al, Task 16 adım 3).
3. Seti yazılmış eklenen hareket silinemez, plandaki hareket hiç silinemez (Task 11 testi).
4. Hafta günü atanmamış, kısmen atanmış ve tamamen atanmış evrelerde gösterim sırası; atama yoksa saklanan sıra (Task 6 testi).
5. Uzun açıklama listesi 375 px'te (16 kas, "Triceps uzun baş", özet karuseli): yatay kaydırma yok, ad kesilmez, slayt taşmaz
   (Task 3 adım 5 ve Task 16 denetimi).

---

### Task 1: Kas kademeleri (saf yardımcılar)

**Files:**
- Create: `src/lib/muscle-tiers.ts`
- Test: `src/lib/muscle-tiers.test.ts`
- Modify (gerekirse): `src/lib/muscles.ts` (testte içe aktarılabilsin diye `@/` çalışma zamanı içe aktarmaları göreli `.ts` olur)

**Interfaces:**
- Produces:
  - `type MuscleTier = 'filled' | 'striped' | 'dotted'`; `type MuscleMark = MuscleTier | 'declined'`;
    `type MuscleMarks = Partial<Record<BodyMuscle, MuscleMark>>`; `type LoadScale = 'session' | 'weekly'`
  - `TIER_ORDER: readonly MuscleTier[]` = `['filled', 'striped', 'dotted']`
  - `LOAD_TIER_MIN: Record<LoadScale, { filled: number; striped: number }>` = `{ session: { filled: 3, striped: 1.5 }, weekly: { filled: 10, striped: 5 } }`
  - `LOAD_TIER_TITLES: Record<LoadScale, Record<MuscleTier, string>>` = session `'3 set ve üstü' / '1,5–2,75 set' / '1,5 setten az'`,
    weekly `'10 set ve üstü' / '5–9,75 set' / '5 setten az'`
  - `LOAD_DESCRIPTION` (bugün üç dosyada kopya olan metin, `templates/[id]/page.tsx:24`'teki hâliyle)
  - `loadTier(sets: number, scale: LoadScale): MuscleTier | null`
  - `ROLE_TIER: Record<MuscleRole, MuscleTier>` = primary filled, secondary striped, stabilizer dotted
  - `roleMarks(exercise: Pick<Exercise, 'primaryMuscles' | 'secondaryMuscles' | 'stabilizerMuscles'>): MuscleMarks`
  - `loadMarks(load: Partial<Record<Muscle, number>>, scale: LoadScale): MuscleMarks`
  - `type MuscleStatusTone = 'strong' | 'improved' | 'stable' | 'declined'` (tür `muscle-map.tsx`'ten buraya taşınır);
    `STATUS_MARK: Record<MuscleStatusTone, MuscleMark>` = strong filled, improved striped, stable dotted, declined declined
  - `type LegendRow = { key: string; label: string; sets?: number; note?: string; warn?: boolean }`
  - `type LegendGroup = { mark: MuscleMark | 'empty'; title: string; rows: LegendRow[] }`
  - `type MuscleLegendData = { groups: LegendGroup[]; cardioSets?: number }`
  - `loadLegend(rows: readonly { key: string; label: string; sets: number; note?: string; warn?: boolean }[], scale: LoadScale, cardioSets?: number): MuscleLegendData`
  - `muscleLoadLegend(load: Partial<Record<Muscle, number>>, scale: LoadScale): MuscleLegendData` (satırlar `MUSCLE_LABELS`'tan,
    kardiyo `cardioSets`'e)
  - `roleLegend(exercise): MuscleLegendData` (başlıklar `ROLE_LABELS`: "Hedef / Yardımcı / Dengeleyici"; satırlarda `sets` yok)
  - `statusLegend(statuses: Partial<Record<BodyMuscle, MuscleStatusTone>>): MuscleLegendData` (başlıklar bugünkü `LEGEND`
    metinleri, `strength-progress.tsx:51`; son grup `{ mark: 'empty', title: 'Veri az ya da çalışılmadı', rows: [] }` hep var)

- [ ] **Step 1: Write the failing tests** (`MUSCLE_LABELS` ile; kas kimlikleri `schemas/exercise.ts`'teki `MUSCLES`)

```ts
describe('loadTier', () => {
  test('tek antrenman: 3 ve üstü dolu, 1,5–2,75 çizgili, 1,5 altı noktalı', () => {
    assert.equal(loadTier(6, 'session'), 'filled');
    assert.equal(loadTier(3, 'session'), 'filled');
    assert.equal(loadTier(2.75, 'session'), 'striped');
    assert.equal(loadTier(1.5, 'session'), 'striped');
    assert.equal(loadTier(1.25, 'session'), 'dotted');
    assert.equal(loadTier(0.25, 'session'), 'dotted');
    assert.equal(loadTier(0, 'session'), null);
  });
  test('haftalık: 10 ve üstü dolu, 5–9,75 çizgili, 5 altı noktalı', () => {
    assert.equal(loadTier(25, 'weekly'), 'filled');
    assert.equal(loadTier(10, 'weekly'), 'filled');
    assert.equal(loadTier(9.75, 'weekly'), 'striped');
    assert.equal(loadTier(5, 'weekly'), 'striped');
    assert.equal(loadTier(4.75, 'weekly'), 'dotted');
    assert.equal(loadTier(0, 'weekly'), null);
    assert.equal(loadTier(-1, 'weekly'), null);
  });
});

test('roleMarks: üst rol kazanır, kardiyo yok', () => {
  assert.deepEqual(
    roleMarks({ primaryMuscles: ['quadriceps', 'cardio'], secondaryMuscles: ['glutes', 'quadriceps'], stabilizerMuscles: ['abs_upper', 'glutes'] }),
    { quadriceps: 'filled', glutes: 'striped', abs_upper: 'dotted' },
  );
});

test('loadMarks: kademe, kardiyo ve sıfır dışarıda', () => {
  assert.deepEqual(loadMarks({ quadriceps: 6, glutes: 1.5, soleus: 0.5, biceps: 0, cardio: 3 }, 'session'),
    { quadriceps: 'filled', glutes: 'striped', soleus: 'dotted' });
});

describe('açıklama', () => {
  test('kademeye göre gruplu, setler büyükten küçüğe, boş grup ve sıfır satır yok', () => {
    const legend = muscleLoadLegend({ glutes: 4.5, quadriceps: 6, soleus: 0.5, biceps: 0, cardio: 3 }, 'session');
    assert.deepEqual(legend.groups.map((group) => [group.mark, group.title]), [['filled', '3 set ve üstü'], ['dotted', '1,5 setten az']]);
    assert.deepEqual(legend.groups[0].rows.map((row) => [row.key, row.sets]), [['quadriceps', 6], ['glutes', 4.5]]);
    assert.equal(legend.groups[0].rows[0].label, MUSCLE_LABELS.quadriceps);
    assert.equal(legend.cardioSets, 3);
  });
  test('yalnız kardiyo: grup yok, kardiyo satırı var', () => {
    assert.deepEqual(muscleLoadLegend({ cardio: 3 }, 'session'), { groups: [], cardioSets: 3 });
  });
  test('kardiyo 0 ise kardiyo satırı yok', () => {
    assert.equal(muscleLoadLegend({ quadriceps: 3 }, 'weekly').cardioSets, undefined);
  });
  test('not ve uyarı satıra geçer', () => {
    const legend = loadLegend([{ key: 'quadriceps', label: 'Ön bacak', sets: 22, note: 'fazla', warn: true }], 'weekly');
    assert.deepEqual(legend.groups[0].rows[0], { key: 'quadriceps', label: 'Ön bacak', sets: 22, note: 'fazla', warn: true });
  });
  test('rol açıklaması: Hedef / Yardımcı / Dengeleyici, kas kas, boş rol yok', () => {
    const legend = roleLegend({ primaryMuscles: ['quadriceps'], secondaryMuscles: [], stabilizerMuscles: ['abs_upper', 'abs_lower'] });
    assert.deepEqual(legend.groups.map((group) => [group.mark, group.title, group.rows.map((row) => row.key)]),
      [['filled', 'Hedef', ['quadriceps']], ['dotted', 'Dengeleyici', ['abs_upper', 'abs_lower']]]);
  });
  test('gelişim açıklaması: dört karar ve hep "Veri az" grubu', () => {
    const legend = statusLegend({ quadriceps: 'declined', glutes: 'strong' });
    assert.deepEqual(legend.groups.map((group) => group.mark), ['filled', 'striped', 'dotted', 'declined', 'empty']);
    assert.deepEqual(legend.groups[3].rows.map((row) => row.key), ['quadriceps']);
    assert.deepEqual(legend.groups[4], { mark: 'empty', title: 'Veri az ya da çalışılmadı', rows: [] });
  });
});
```

- [ ] **Step 2:** `node --test --experimental-strip-types --no-warnings src/lib/muscle-tiers.test.ts` → FAIL (modül yok).
- [ ] **Step 3:** `src/lib/muscle-tiers.ts`'i yaz. Gelişimde satırı olmayan karar grupları da durur (açıklama dört deseni hep
  gösterir); yükte ve rolde boş grup yazılmaz. `muscles.ts` testte yüklenemezse `@/` içe aktarmalarını göreli `.ts` yap.
- [ ] **Step 4:** Aynı komut → PASS; `npm test` → PASS.
- [ ] **Step 5:** Commit: `feat(muscle-map): desen kademeleri ve açıklama verisi`.

### Task 2: Desen dili, açıklama kutusu ve çıkarılabilir çip

**Files:**
- Modify: `src/components/muscle-map/muscle-map.tsx`
- Create: `src/components/muscle-map/muscle-legend.tsx`, `src/components/removable-chip.tsx`

**Interfaces:**
- Consumes: Task 1'in türleri ve `TIER_ORDER`.
- Produces:
  - `MuscleMap` yeni propları: `marks?: MuscleMarks`, `legend?: MuscleLegendData`, `onRemoveRow?: (key: string) => void`.
    Bu görevde eski `intensity` / `tone` / `statuses` propları geçici olarak kalır (Task 4'te silinir); `marks` verilince onlar
    yok sayılır.
  - `MuscleSwatch({ mark, className }: { mark: MuscleMark | 'empty'; className?: string })` (bugünkü `MuscleSwatch` ve
    `MuscleStatusSwatch`'un yerine; `MuscleStatusSwatch` Task 4'te silinir).
  - `MuscleLegend({ data, onRemoveRow }: { data: MuscleLegendData; onRemoveRow?: (key: string) => void })`
  - `RemovableChip({ label, removeLabel, onRemove, disabled }: { label: string; removeLabel: string; onRemove: () => void; disabled?: boolean })`:
    bugünkü çip biçimi (`Button type="button" variant="secondary" size="xs"`, sonda `<X data-icon="inline-end" />`, `aria-label={removeLabel}`).

- [ ] **Step 1:** `MusclePatterns`'ı güncelle: desen kimlikleri `${id}-striped`, `${id}-dotted`, `${id}-declined`. Çizgili ve
  noktalı zemin `--muscle-empty`, çizgi ve nokta `--muscle-target` (bugünkü genişlik ve yarıçap oranları). Gerileme zemini
  `--muscle-empty`, çizgisi `--destructive`; kas grubunun kenarı `stroke-[var(--destructive)] [stroke-width:0.22]`.
- [ ] **Step 2:** Dolgu: `marks[muscle]` → filled `var(--muscle-target)`, öteki üçü `url(#…)`. İşareti olmayan seçili kas dolu.
  Her kas grubuna `data-mark={mark ?? 'empty'}` yaz (QA bu öznitelikle bakar). Vurgu, devre dışı ve boş dolgular aynı kalır.
- [ ] **Step 3:** `MuscleLegend`: `aria-label="Harita açıklaması"`; her grup bir başlık satırı (`MuscleSwatch` + başlık) ve altında
  satırlar: ad ve varsa "6 set" (`formatNumber(sets)` + " set"), varsa `· not`, `warn` ise `WarningCircle` ikon (bugünkü
  `weekly-progress.tsx:63` biçimi). Ad `truncate` almaz, `[overflow-wrap:anywhere]` ile kayar. `onRemoveRow` verilirse satır
  `RemovableChip` olur (`removeLabel` = "`{ad} kasını kaldır`"). `cardioSets` varsa grupların altında "Kardiyo · 3 set".
- [ ] **Step 4:** `MuscleMap` `legend` verilince `<div className="@container">` içinde `flex flex-col gap-4 @xl:flex-row @xl:items-start`
  düzenine geçer: figür `shrink-0`, açıklama `min-w-0 flex-1`.
- [ ] **Step 5:** `npx tsc --noEmit`, `npm run lint`, `npm test` temiz. Commit: `feat(muscle-map): tek desen dili ve açıklama kutusu`.

### Task 3: Yük haritaları desene geçer

**Files:**
- Modify: `src/app/dashboard/templates/page.tsx`, `src/app/dashboard/templates/[id]/page.tsx`, `src/app/dashboard/templates/template-form.tsx`,
  `src/app/dashboard/clients/[id]/program/day-editor.tsx`, `src/components/program/phase-load.tsx`,
  `src/components/progress/weekly-progress.tsx`, `src/app/me/antrenman/ozet/[id]/summary-carousel.tsx`, `src/lib/template-plan.ts`,
  `src/lib/template-plan.test.ts`
- Delete: `src/components/muscle-map/template-muscle-map.tsx`

**Interfaces:**
- Consumes: `loadMarks`, `muscleLoadLegend`, `loadLegend`, `LOAD_DESCRIPTION`, `MuscleMap` (`marks`, `legend`).

- [ ] **Step 1:** Tek antrenman ölçeği (`'session'`): şablon listesi (yalnız `marks`, `legend` yok), şablon detayı, şablon formu,
  `day-editor` "Kas yükü", özet karuseli. Özet karuselinde bugünkü aile satırları `loadLegend(rows, 'session')`'e verilir,
  `legendLimit` kalkar. Üç kopya `LOAD_DESCRIPTION` silinir, `muscle-tiers`'tan gelir.
- [ ] **Step 2:** Haftalık ölçek (`'weekly'`): `phase-load.tsx`'teki dört harita ("Bu hafta (yapılan)", "Bir tur", "Haftalık
  (plan)") ve `weekly-progress.tsx`. `weekly-progress` satırları `loadLegend`'e `note: BAND_LABELS[band]`, `warn: band === 'high'`
  ile gider; `BAND_INTENSITY`, `LIST_LIMIT` ve el yazımı `dl` silinir. `phase-load`'daki `WRAP_NAMES` ve `LoadVersus`'taki
  "+n kas daha" sınırı kalkar (bütün satırlar).
- [ ] **Step 3:** `loadIntensity` ve testi (`template-plan.test.ts:417`) silinir; `template-muscle-map.tsx` silinir. Grep:
  `grep -rn "TemplateMuscleMap\|loadIntensity\|LOAD_DESCRIPTION =" src` yalnız `muscle-tiers.ts`'i gösterir.
- [ ] **Step 4:** `npm test`, `npx tsc --noEmit`, `npm run lint` temiz.
- [ ] **Step 5:** 375 px için sınıf denetimi: açıklama ve `LoadVersus` satırlarında `truncate` yok; özet slaytının kapsayıcısı
  dikeyde kayabilir (`overflow-y-auto`), yatayda taşmaz. Commit: `feat(muscle-map): yük haritaları desenle ve tek açıklamayla`.

### Task 4: Rol, gelişim ve seçim haritaları; eski tonların silinmesi

**Files:**
- Modify: `src/app/dashboard/exercises/[id]/page.tsx`, `src/app/dashboard/exercises/exercise-form.tsx`,
  `src/app/dashboard/exercises/exercise-list.tsx`, `src/components/coach/coach-panel.tsx`,
  `src/components/progress/strength-progress.tsx`, `src/components/muscle-map/muscle-map.tsx`, `src/lib/muscles.ts`,
  `src/app/globals.css`, `src/lib/color.test.ts`
- Delete: `src/components/muscle-map/exercise-muscle-map.tsx`

**Interfaces:**
- Consumes: `roleMarks`, `roleLegend`, `statusLegend`, `STATUS_MARK`, `RemovableChip`, `MuscleMap` (`marks`, `legend`, `onRemoveRow`).
- Produces: `MuscleMap`'te `intensity`, `tone`, `statuses` propları yok; `tierOf` ve `MuscleStatusSwatch` yok.

- [ ] **Step 1:** Egzersiz detayı: `MuscleMap layout="split" marks={roleMarks(e)} legend={roleLegend(e)}`. Kart açıklamasındaki
  "Hedef dolu, yardımcı çizgili, dengeleyici noktalı." cümlesi silinir (açıklama kutusu söylüyor); kardiyo notu kalır.
- [ ] **Step 2:** Egzersiz formu: satır içi yoğunluk hesabı (`exercise-form.tsx:635`) `roleMarks` olur; rol başına çip satırları
  (`:718-742`) silinir, yerine `legend={roleLegend(...)}` ve `onRemoveRow={(key) => setRole(key, null)}`. Kardiyo `Toggle` kalır.
- [ ] **Step 3:** Seçim haritaları (`exercise-list` süzgeci, `coach-panel`): yalnız `selected`; `exercise-list`'in seçili kas
  çipleri `RemovableChip` olur ("`{ad} süzgecini kaldır`").
- [ ] **Step 4:** Gelişim: `marks` = `statuses`'ın `STATUS_MARK`'la çevrilmişi, `legend={statusLegend(statuses)}`; elle yazılmış
  `LEGEND` listesi ve `--muscle-empty` span'ı silinir.
- [ ] **Step 5:** `muscle-map.tsx`'ten `intensity`, `tone`, `statuses`, `tierOf`, `MuscleStatusSwatch`, `ROLE_INTENSITY`
  içe aktarması silinir. `muscles.ts`'te `ROLE_INTENSITY`, `SECONDARY_INTENSITY`, `exerciseIntensity`, `MuscleIntensity`
  grep'le kullanılmıyorsa silinir. `globals.css`'ten `--muscle-secondary` ve `--muscle-stabilizer` silinir.
- [ ] **Step 6:** `color.test.ts` "kas haritası renkleri": ilk test yalnız iki `--muscle-empty` satırını arar ve
  `assert.doesNotMatch(css, /--muscle-(secondary|stabilizer)/)`; tema testi yalnız "hedef boş kastan ≥3:1" kalır.
- [ ] **Step 7:** `npm test`, `npx tsc --noEmit`, `npm run lint` temiz;
  `grep -rn "tone=\"load\"\|tone=\"status\"\|ExerciseMuscleMap\|muscle-secondary\|muscle-stabilizer" src` boş.
  Commit: `feat(muscle-map): rol, gelişim ve seçim haritaları tek desende`.

### Task 5: Derin kaslar kas bileşeninde

**Files:**
- Create: `src/components/muscle-map/deep-muscle-section.tsx`
- Modify: `src/components/muscle-map/muscle-map.tsx`, `src/app/dashboard/exercises/exercise-form.tsx`,
  `src/app/dashboard/exercises/medical-fields.tsx`, `src/app/dashboard/exercises/[id]/medical-card.tsx`,
  `src/app/dashboard/exercises/[id]/page.tsx`, `src/lib/deep-muscles.ts`, `src/lib/deep-muscles.test.ts`

**Interfaces:**
- Produces:
  - `DEEP_MUSCLE_MAX = 8` (`deep-muscles.ts`; şemadaki `v.maxLength(8, …)` bu sabiti kullanır)
  - `deepMusclesByRegion(muscles: readonly DeepMuscle[]): { region: string; label: string; muscles: DeepMuscle[] }[]`
    (bölge sırası `DEEP_MUSCLE_REGION_LABELS` sırası, boş bölge yok)
  - `DeepMuscleSection({ selected, onToggle }: { selected: readonly DeepMuscle[]; onToggle?: (muscle: DeepMuscle) => void })`
  - `MuscleMap` yeni propu: `deep?: { selected: readonly DeepMuscle[]; onToggle?: (muscle: DeepMuscle) => void }`

- [ ] **Step 1: Write the failing test** (`deep-muscles.test.ts`)

```ts
test('derin kaslar bölge bölge, boş bölge yok', () => {
  const all = deepMusclesByRegion(DEEP_MUSCLES);
  assert.deepEqual(all.map((group) => group.label), Object.values(DEEP_MUSCLE_REGION_LABELS));
  const one = deepMusclesByRegion([DEEP_MUSCLES[0]]);
  assert.equal(one.length, 1);
  assert.deepEqual(one[0].muscles, [DEEP_MUSCLES[0]]);
});
test('en çok 8 derin kas', () => assert.equal(DEEP_MUSCLE_MAX, 8));
```

- [ ] **Step 2:** Test → FAIL. **Step 3:** Yardımcıyı yaz; test → PASS.
- [ ] **Step 4:** `DeepMuscleSection`: başlık "Derin kaslar" ve tek satır açıklama "Derin kaslar kademe almaz, hacme sayılmaz."
  Seçerken (`onToggle` var) bütün kaslar bölge başlıklarıyla çip olarak durur (bugünkü `medical-fields.tsx:226-243` biçimi:
  `aria-pressed`, kapalıyken `Plus`, ipucu `DEEP_MUSCLE_NOTES`); 8 seçiliyken seçili olmayan çipler `disabled` ve altta
  "En çok 8 derin kas seçilir." Gösterirken yalnız seçililer; hiç yoksa bölüm çizilmez.
- [ ] **Step 5:** `MuscleMap` `deep` verilince bölümü açıklamanın altında, kabın tam genişliğinde çizer. Egzersiz formu
  `activationTargets`'ı formisch alanından okuyup yazar (bugünkü `medical-fields.tsx:210-256` mantığı) ve bölümü "Çalışan
  kaslar" kartındaki haritaya verir; `medical-fields.tsx`'teki bölüm silinir. Detay sayfası `deep={{ selected }}` verir;
  `medical-card.tsx`'ten derin kas rozetleri ve `empty` denetimindeki `activation` silinir.
- [ ] **Step 6:** `npm test`, `npx tsc --noEmit`, `npm run lint` temiz. Commit: `feat(muscle-map): derin kaslar haritanın altında`.

### Task 6: Liste yardımcıları (saf)

**Files:**
- Create: `src/lib/haptics.ts`, `src/lib/haptics.test.ts`
- Modify: `src/lib/reorder.ts`, `src/lib/reorder.test.ts`, `src/lib/program-plan.ts`, `src/lib/program-plan.test.ts`

**Interfaces:**
- Produces:
  - `vibrate(pattern?: number | number[]): void` (varsayılan 8; `navigator` yoksa ya da hata atarsa sessiz)
  - `moveTo<K>(keys: readonly K[], key: K, overKey: K): readonly K[]` (`key` çıkar, `overKey`'in eski sırasına girer; aynıysa ya da
    biri yoksa aynı dizi)
  - `moveItem<T>(items: readonly T[], keyOf: (item: T) => string, key: string, target: ReorderTarget | { over: string }): T[]`
  - `moveTargetOf(event: { altKey: boolean; key: string }): ReorderTarget | null` (Alt + ArrowUp/ArrowDown/Home/End)
  - `displayDays<T extends { weekdays?: readonly number[] }>(days: readonly T[]): T[]`

- [ ] **Step 1: Write the failing tests**

```ts
test('vibrate navigator yokken atmaz', () => assert.doesNotThrow(() => vibrate()));

test('moveTo: üzerine bırakılan öğenin sırasına', () => {
  assert.deepEqual(moveTo(['a', 'b', 'c', 'd'], 'a', 'c'), ['b', 'c', 'a', 'd']);
  assert.deepEqual(moveTo(['a', 'b', 'c', 'd'], 'd', 'b'), ['a', 'd', 'b', 'c']);
  assert.deepEqual(moveTo(['a', 'b'], 'a', 'a'), ['a', 'b']);
  assert.deepEqual(moveTo(['a', 'b'], 'a', 'x'), ['a', 'b']);
});

test('moveItem: adım ve bırakma, uçta aynı', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const ids = (list: { id: string }[]) => list.map((item) => item.id);
  assert.deepEqual(ids(moveItem(items, (item) => item.id, 'b', 'up')), ['b', 'a', 'c']);
  assert.deepEqual(ids(moveItem(items, (item) => item.id, 'a', 'up')), ['a', 'b', 'c']);
  assert.deepEqual(ids(moveItem(items, (item) => item.id, 'a', { over: 'c' })), ['b', 'c', 'a']);
});

test('moveTargetOf: yalnız Alt ile', () => {
  assert.equal(moveTargetOf({ altKey: true, key: 'ArrowUp' }), 'up');
  assert.equal(moveTargetOf({ altKey: true, key: 'ArrowDown' }), 'down');
  assert.equal(moveTargetOf({ altKey: true, key: 'Home' }), 'top');
  assert.equal(moveTargetOf({ altKey: false, key: 'ArrowUp' }), null);
  assert.equal(moveTargetOf({ altKey: true, key: 'a' }), null);
});

test('displayDays: ilk atanmış güne göre, atanmamışlar saklanan sırayla sonda', () => {
  const days = [{ id: 'A' }, { id: 'B', weekdays: [3] }, { id: 'C', weekdays: [5, 1] }, { id: 'D', weekdays: [] }, { id: 'E' }];
  assert.deepEqual(displayDays(days).map((day) => day.id), ['C', 'B', 'A', 'D', 'E']);
  assert.deepEqual(displayDays([{ id: 'A' }, { id: 'B' }]).map((day) => day.id), ['A', 'B']);
});
```

- [ ] **Step 2:** Testler → FAIL. **Step 3:** Yaz (`moveItem` adımda `moveKey`'i, bırakmada `moveTo`'yu kullanır). **Step 4:** PASS.
- [ ] **Step 5:** Commit: `feat(list): taşıma, titreşim ve gösterim sırası yardımcıları`.

### Task 7: Paylaşılan liste bileşenleri ve tek Geri al

**Files:**
- Create: `src/components/list/dnd-base.ts`, `src/components/list/sortable-list.tsx`, `src/components/list/move-buttons.tsx`
- Modify: `src/components/undo-toast.ts`, `src/components/swipe/swipe-row.tsx`, `src/components/block-editor/drag/editor-dnd.tsx`,
  `src/components/block-editor/block-items.tsx`, `src/components/block-editor/block-editor.tsx`,
  `src/app/dashboard/clients/[id]/program/program-form.tsx`, `src/components/program/own-program-form.tsx`,
  `src/lib/editor-undo.test.ts`, `src/components/block-editor/editor-signals.test.ts`

**Interfaces:**
- Consumes: `vibrate`, `moveTargetOf` (Task 6); `undoAt` (`src/lib/editor-undo.ts`, değişmez); `CardGrabber`
  (`src/components/exercise-card.tsx`); `DRAG` (`src/lib/motion.ts`).
- Produces:
  - `dnd-base.ts`: `useListSensors()` (tek `PointerSensor`, `distance: DRAG.activationDistance`), `SILENT_ANNOUNCEMENTS`,
    `LIST_AUTO_SCROLL` (bugünkü 80 px kenar ayarı), `setReordering(on: boolean)` (`html[data-reordering]`).
  - `UNDO_CONFLICT = 'Sonrasında başka değişiklik yapıldı; geri alınamadı.'`
  - `showUndoToast(message: string, onUndo: () => void, options?: { description?: string }): void` (8 sn, tek seferde bir)
  - `showGuardedUndo<P, T>(message: string, guard: { locate: () => P | null; read: (at: P) => T; write: (at: P, value: T) => void; before: T }, options?: { description?: string; onUndone?: () => void }): void`
    (çağrı anında `after` okunur; Geri al'da `undoAt` false dönerse `toast.error(UNDO_CONFLICT)`)
  - `MoveButtons({ name, canUp, canDown, onStep, children }: { name: string; canUp: boolean; canDown: boolean; onStep: (target: 'up' | 'down') => void; children?: React.ReactNode })`:
    `sr-only focus-within:not-sr-only` şerit, "Yukarı taşı" / "Aşağı taşı" (bugünkü `MoveStrip` biçimi, `block-items.tsx:118`).
  - `SortableList<T>(props: { items: readonly T[]; keyOf: (item: T) => string; nameOf: (item: T) => string; canMove?: (item: T) => boolean; onStep: (key: string, target: 'up' | 'down') => void; onDrop: (key: string, overKey: string) => void; renderItem: (item: T, slot: { grabber: React.ReactNode; dragging: boolean }) => React.ReactNode; label: string; className?: string })`
  - `swipe-row.tsx` `swallowClick` dışa açılır.

- [ ] **Step 1: Write the failing test** (`editor-undo.test.ts`'e; `showGuardedUndo`'nun kullandığı denetimin üç formdaki biçimi)

```ts
test('undoAt: sabit yerde de çalışır; sonrasında değiştiyse yazmaz', () => {
  let value = { phases: [1] };
  const guard = { locate: () => 'root' as const, read: () => value, write: (_: 'root', next: typeof value) => { value = next; } };
  const before = { phases: [1, 2] };
  const after = value;
  assert.equal(undoAt(guard.locate, guard.read, guard.write, before, after), true);
  assert.deepEqual(value, before);
  value = { phases: [9] };
  assert.equal(undoAt(guard.locate, guard.read, guard.write, before, after), false);
  assert.deepEqual(value, { phases: [9] });
});
```

- [ ] **Step 2:** Test → PASS beklenir (`undoAt` zaten genel; bu test üç formun yeni kullanımını sabitler). Geçmezse `undoAt`'i
  imzası aynı kalacak biçimde düzelt.
- [ ] **Step 3:** `undo-toast.ts`'e `UNDO_CONFLICT`, `options.description` ve `showGuardedUndo`'yu ekle. `block-editor.tsx`
  (`updateWithUndo`), `program-form.tsx` (`offerUndo`) ve `own-program-form.tsx` (`removeSelectedDay`) kendi denetimlerini
  bırakıp `showGuardedUndo` kullanır; program formunda `locate: () => 'root'`, `read` = `{ phased, phases }`, `write` = bugünkü
  `restore`. `editor-signals.test.ts` beklentisi `showGuardedUndo(message` olur.
- [ ] **Step 4:** `dnd-base.ts`'i yaz; `EditorDnd` kendi sensör, otomatik kaydırma, `SILENT` ve `data-reordering` kodunu bırakıp
  bunları kullanır; `editor-dnd.tsx` ve `swipe-row.tsx`'teki özel `vibrate` silinir, `@/lib/haptics` kullanılır.
- [ ] **Step 5:** `MoveButtons`'ı yaz; `block-items.tsx`'teki `MoveStrip` yukarı/aşağı düğmeleri için onu kullanır, gruplama
  düğmesini `children` olarak verir. `useFaceKeys` yön tuşları için `moveTargetOf` kullanır (Alt+→/← ve Delete aynı kalır).
- [ ] **Step 6:** `SortableList`'i yaz: `<ol aria-label={label} className="flex flex-col gap-3 pt-2">` (düzenleyici listesinin
  aralığı, `block-editor.tsx:898`); `SwipeGroup` içinde. Her taşınabilir öğe `useDraggable` + `useDroppable`; sürükleme yalnız
  `slot.grabber`'dan (`CardGrabber`'a `setActivatorNodeRef` ve dinleyiciler; `drag-node.tsx:34` `Grabber` örneği). Taşınamayan
  öğe tutamaçsız ve hedef değil. `DragOverlay`'de `renderItem`'ın kopyası. Öğe kapsayıcısında `onKeyDown`: `moveTargetOf` up/down
  ise `onStep`; öğenin sonunda `MoveButtons`. Sürükleme bitince `vibrate()` yok, yalnız eşik geçişinde (düzenleyicideki gibi).
- [ ] **Step 7:** `npm test`, `npx tsc --noEmit`, `npm run lint` temiz. Düzenleyicinin testleri (`template-edit`, `drop-target`,
  `drop-commit`, `editor-undo`, `editor-signals`) geçer. Commit: `refactor(list): tek sürükleme kurulumu, sıralı liste ve tek Geri al`.

### Task 8: Ortak onay penceresi

**Files:**
- Create: `src/components/confirm-delete-dialog.tsx`
- Modify: `src/app/dashboard/clients/[id]/edit/client-actions.tsx`, `src/app/dashboard/clients/[id]/program/program-actions.tsx`,
  `src/app/dashboard/templates/[id]/template-actions.tsx`, `src/app/dashboard/exercises/[id]/exercise-actions.tsx`,
  `src/app/dashboard/devices/[id]/device-actions.tsx`, `src/app/dashboard/attachments/attachment-actions.tsx`,
  `src/app/dashboard/clients/[id]/measurements/[date]/edit/measurement-actions.tsx`,
  `src/app/dashboard/clients/[id]/screening/screening-actions.tsx`, `src/app/dashboard/clients/[id]/constraints/constraint-actions.tsx`,
  `src/app/me/(sekmeler)/gecmis/[id]/history-detail.tsx`, `src/app/me/(sekmeler)/programlar/program-actions.tsx`,
  `src/app/me/(sekmeler)/saglik/health-constraints.tsx`
- Delete: `src/app/me/delete-dialog.tsx`

**Interfaces:**
- Produces: `ConfirmDeleteDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; title: string; body: string; detail?: string | null; confirmLabel?: string; confirmDisabled?: boolean; busy?: boolean; onConfirm: () => void; children?: React.ReactNode })`.
  Bugünkü `DeleteDialog` davranışı: "Vazgeç" önce odaklanır, onay düğmesi `destructive` ve meşgulken döner simge, "Ayrıntı"
  açılır kutusu, meşgulken kapanmaz. `confirmLabel` varsayılanı "Sil". `children` başlık ve gövdeden sonra, düğmelerden önce.

- [ ] **Step 1:** Bileşeni yaz (`delete-dialog.tsx`'in içeriğinden; `subject` propu metne gömülür).
- [ ] **Step 2:** Dokuz PT penceresi denetimli hâle gelir (yerel `useState` + tetikleyici düğme `onClick`); başlık, gövde ve
  düğme metinleri aynen kalır. Danışan silme: ad alanı `children`, `confirmDisabled` bugünkü eşleşme kuralı, sunucu hatası alanın
  altında. Egzersiz, cihaz ve aparattaki "varsayılana dönsün mü?" biçimi `confirmLabel="Varsayılana dön"` ile aynı pencere.
- [ ] **Step 3:** `history-detail.tsx`, `DeleteOwnProgram` (iki adımlı "Yarım antrenmanı sil" akışı korunur) ve `WithdrawButton`
  (`confirmLabel="Geri çek"`) aynı bileşene geçer; `delete-dialog.tsx` silinir.
- [ ] **Step 4:** `npx tsc --noEmit`, `npm run lint`, `npm test` temiz; `grep -rn "AlertDialogAction" src/app` silme penceresi
  göstermez (yalnız silme olmayan "Erişimi kapat" kalır). Commit: `refactor(list): kayıt silmeleri tek onay penceresinden`.

### Task 9: İpuçları ve evreler

**Files:**
- Modify: `src/app/dashboard/exercises/exercise-form.tsx`, `src/app/dashboard/clients/[id]/program/phases-card.tsx`,
  `src/lib/program-plan.ts`, `src/lib/program-plan.test.ts`

**Interfaces:**
- Consumes: `SortableList`, `SwipeRow`, `showUndoToast`, `moveItem`.

- [ ] **Step 1:** İpuçları (`exercise-form.tsx:318-366`): `SortableList` (anahtar formisch öğe kimliği); `onStep`/`onDrop` →
  formisch `move(form, { path: ['cues'], from, to })`. Her satır `SwipeRow` (sonda tek "Sil", `removes: true`) içinde, satır sonunda
  çöp kutusu ikonu (`aria-label` "`{n}. ipucunu sil`"). Silme: değeri ve sırasını al, `remove`, `showUndoToast("İpucu silindi", …)` →
  `insert(form, { path: ['cues'], at, initialInput: value })`. 6 sınırı aynı.
- [ ] **Step 2:** Evreler: `<ol aria-label="Evreler">` yerine `SortableList`; `onStep`/`onDrop` → `actions.update(all => moveItem(all, p => p.id, key, target))`
  ve "`{ad} evresi {n}. sırada`" duyurusu. Her evre kartı `SwipeRow` içinde (sonda "Sil", şu anki ya da tek evrede `disabled`);
  menüdeki "Evreyi sil" kalır. Menüden "Yukarı taşı / Aşağı taşı" silinir.
- [ ] **Step 3:** `movePhase` ve testi (`program-plan.test.ts:439`) silinir.
- [ ] **Step 4:** `npm test`, `npx tsc --noEmit`, `npm run lint` temiz. Commit: `feat(list): ipuçları ve evreler tutamaçla taşınır, kaydırarak silinir`.

### Task 10: Program günleri

**Files:**
- Modify: `src/app/dashboard/clients/[id]/program/day-editor.tsx`, `day-chips.tsx`, `program-form.tsx`, `program/page.tsx`,
  `program/own/[pid]/page.tsx`, `unphase-dialog.tsx`, `src/app/dashboard/clients/[id]/page.tsx`, `src/components/coach/coach-panel.tsx`,
  `src/components/program/own-program-form.tsx`, `src/app/me/program-card.tsx`, `src/app/me/training-week.tsx`, `src/lib/workout-routes.ts`,
  `src/app/me/antrenman/workout-switch-sheet.tsx`, `src/app/me/(sekmeler)/programlar/program-days.tsx`,
  `src/app/me/(sekmeler)/programlar/yeni/new-program-flow.tsx`, `src/lib/program-plan.ts`, `src/lib/program-plan.test.ts`,
  `src/lib/editor-undo.test.ts`

**Interfaces:**
- Consumes: `displayDays` (Task 6), `showGuardedUndo` (Task 7).
- Produces: `PhaseActions.moveDay(dayId, phaseId)` → `PhaseActions.moveToPhase(dayId, phaseId)` (adı değişir, işi aynı).

- [ ] **Step 1:** Gün menüsünden "Sola taşı / Sağa taşı" silinir; "Kaldır" → "Sil" (Geri al metni "`{ad} silindi`"). Danışan
  formundaki "Kaldır" düğmesi → "Sil". "Evreye taşı", "Kopyala", "Şablon olarak kaydet…" kalır.
- [ ] **Step 2:** Bir evrenin programlarını listeleyen her yer `displayDays(phase.days)` ile gösterir: dosya listesindeki
  bütün yerler (`day-chips.tsx:104`, `program/page.tsx:267` ve `:549`, `clients/[id]/page.tsx:305`, `own/[pid]/page.tsx:125`,
  `unphase-dialog.tsx:39`, `coach-panel.tsx:121`, `own-program-form.tsx:421`, `program-card.tsx:285` ve `:313`,
  `workout-routes.ts:464`, `workout-switch-sheet.tsx:52`, `program-days.tsx:31`, `new-program-flow.tsx:178,185`). Saklanan
  dizi değişmez. `workout-plan.ts:517`'deki yedek (`phase.days[0]`) aynen kalır.
- [ ] **Step 3:** PT düzenleyicisinin ilk seçili programı (`program-form.tsx:227`) ve danışan formunun `firstDayId`'si
  (`own-program-form.tsx:138`) `displayDays(...)[0]`.
- [ ] **Step 4:** `moveDay` (`program-plan.ts:652`) ve testi silinir; `editor-undo.test.ts:124,146,200`'deki `moveDay` örnekleri
  aynı amaçla `removeDay` ya da `copyDay` + `addDay` kullanır. `PhaseActions.moveDay` → `moveToPhase`.
- [ ] **Step 5:** `npm test`, `npx tsc --noEmit`, `npm run lint` temiz. Commit: `feat(list): programlar hafta gününe göre gösterilir, menüden taşıma kalkar`.

### Task 11: Antrenman listesi

**Files:**
- Modify: `src/lib/workout-flow.ts`, `src/lib/workout-flow.test.ts`, `src/app/me/antrenman/workout-list.tsx`,
  `src/app/me/antrenman/workout-screen.tsx`, `src/app/me/antrenman/workout-header.tsx`, `src/lib/motion.ts`

**Interfaces:**
- Consumes: `SortableList`, `SwipeRow`, `showUndoToast` (`options.description`), `showGuardedUndo`.
- Produces: `FlowItem.added: boolean`; `canRemoveAdded(day: WorkoutDay, doc: Pick<SessionDoc, 'entries'>, key: string): boolean`;
  `removeAdded(day: WorkoutDay, doc: SessionDoc, key: string, stamp: Stamp): SessionDoc | null`.

- [ ] **Step 1: Write the failing tests** (`workout-flow.test.ts`; dosyadaki mevcut gün ve doc kurucularıyla)

```ts
test('eklenen ve seti yazılmamış hareket silinir; plandaki ya da seti yazılmış silinmez', () => {
  // Kurulum dosyadaki mevcut kuruculardan: `added` = addExercise(day, doc, { entryId: 'x1', extra, stamp }), addedKey = 'x1';
  // `logged` = aynı ekleme ve 'x1'e bir set yazılmış (loggedKey = 'x1'); plannedKey = listView(day, doc).items[0].key
  assert.equal(canRemoveAdded(day, added, addedKey), true);
  const next = removeAdded(day, added, addedKey, stamp);
  assert.ok(next);
  assert.equal(next.entries.some((entry) => entry.id === addedKey), false);
  assert.equal(listView(day, next).items.some((item) => item.key === addedKey), false);
  assert.equal(removeAdded(day, logged, loggedKey, stamp), null);
  assert.equal(removeAdded(day, added, plannedKey, stamp), null);
});
test('liste öğesi eklenen hareketi bilir', () => {
  assert.equal(listView(day, added).items.find((item) => item.key === addedKey)?.added, true);
  assert.equal(listView(day, added).items.find((item) => item.key === plannedKey)?.added, false);
});
```

- [ ] **Step 2:** Test → FAIL. **Step 3:** `FlowItem`'a `added` ekle (unit anahtarı `added: true` kaydın kimliğiyse); `removeAdded`
  kaydı ve `order`'daki anahtarını siler. **Step 4:** PASS.
- [ ] **Step 5:** `workout-list.tsx`: "Sırayı değiştir" kipi, kendi `DndContext`'i, `ReorderRow`, ▲/▼ ve `refocus` silinir. Liste
  `SortableList` olur: `canMove` = `movable(item)` (`state === 'current' || 'pending'`), `onStep` → `onMoveUnit`, `onDrop` →
  `onMoveUnitTo`. `ListRow` düğmesi aynı kalır; taşınabilen satırın üstünde `CardGrabber`. Eklenen ve silinebilen satır
  `SwipeRow` içinde (sonda "Sil"); atlanan satırdaki "Geri al" kalır.
- [ ] **Step 6:** Odaktaki hareketin ⋯ menüsünde (`workout-header.tsx:121`) eklenen ve silinebilen harekette "Hareketi sil".
  Silme: `removeAdded` ve `LocalWorkout.extras`'tan satırı, `commitFlow`; `showGuardedUndo("{ad} silindi", …)` önceki doc ve
  `extras`'ı geri yazar (sonrasında set yazıldıysa `UNDO_CONFLICT`).
- [ ] **Step 7:** Set silme / işaret kaldırma (`workout-screen.tsx:1599`) ve atlama (`:1998`) toast'ları `showUndoToast`'a geçer
  (açıklama `options.description`); `WORKOUT.skipToastMs` yalnız "eklendi · Şimdi yap" toast'ında kalırsa adı `addedToastMs`
  olur. Kullanılmaz kalan `TOAST_BUTTONS` kopyası silinir.
- [ ] **Step 8:** `npm test`, `npx tsc --noEmit`, `npm run lint` temiz. Commit: `feat(workout): liste tek tutamaçla taşınır, eklenen hareket silinir`.

### Task 12: Antrenmandaki set satırları

**Files:**
- Modify: `src/app/me/antrenman/set-row.tsx`, `src/app/me/antrenman/exercise-card.tsx`, `src/app/me/antrenman/workout-screen.tsx`,
  `src/app/me/antrenman/entry-panel.tsx`, `src/app/me/antrenman/workout-feedback.ts`, `src/app/me/antrenman/ozet/[id]/summary-carousel.tsx`

**Interfaces:**
- Consumes: `SwipeGroup`, `SwipeRow`, `swallowClick` (`swipe-row.tsx`), `showGuardedUndo`, `vibrate` (`@/lib/haptics`).

- [ ] **Step 1:** Set tablosu `div` tabanlı ARIA tablosuna döner (`role="table"`, başlık `role="row"` + `role="columnheader"`,
  satırlar `role="row"` + `role="cell"`); başlık ve satırlar tek bir sütun şablonu sabitini paylaşır (bugünkü sütun genişlikleri).
  Tablo `SwipeGroup` içinde.
- [ ] **Step 2:** Yazılmış ve kilitsiz set satırı `SwipeRow` içinde: sonda "Sil" (`removes: true`) → bugünkü `onDeleteSet`.
  Öteki satırlarda `SwipeRow` `disabled`. `set-row.tsx`'teki `motion.td` kaydırması, `REVEAL`, `data-set-swipe-action` düğmesi
  ve `swallowClick` kopyası silinir; `exercise-card.tsx` `swallowClick`'i `swipe-row.tsx`'ten alır ya da artık gerekmiyorsa bırakır.
- [ ] **Step 3:** Fazladan seti bırakma (`onDropExtra`, `workout-screen.tsx:2147`) `showGuardedUndo("Fazladan set silindi", …)`
  ile geri alınır (önceki `extraRounds` geri yazılır). Düğme metni ve `aria-label`'lar "Sil" olur: ✕ düğmeleri "Fazladan seti sil",
  `entry-panel.tsx:331`'deki "Kaldır" → "Sil".
- [ ] **Step 4:** `workout-feedback.ts`'teki `vibrate` silinir; çağıranlar `@/lib/haptics`'ten alır.
- [ ] **Step 5:** `npm test`, `npx tsc --noEmit`, `npm run lint` temiz. Commit: `feat(workout): set satırları ortak kaydırmayla silinir`.

### Task 13: Geçmiş detayı ve satır düğmeleri

**Files:**
- Modify: `src/app/me/(sekmeler)/gecmis/[id]/history-detail.tsx`, `src/app/dashboard/clients/[id]/constraints/constraint-actions.tsx`,
  `src/app/me/(sekmeler)/saglik/health-constraints.tsx`, `src/app/dashboard/clients/[id]/program/proposals-card.tsx`

- [ ] **Step 1:** Geçmiş detayında her `SwipeRow` `disabled={!editing}`; çöp kutuları zaten yalnız "Düzenle"de. Silme onay
  penceresinden geçer (Task 8), Geri al yok.
- [ ] **Step 2:** `OverrideRemove` ("Kaldır"), `WithdrawButton` ("Geri çek") ve öneri "Reddet" düğmesi aynı biçimi alır:
  `Button variant="ghost" size="sm" className="min-h-11"`, ikon + metin. Davranışları değişmez.
- [ ] **Step 3:** `npx tsc --noEmit`, `npm run lint` temiz. Commit: `feat(list): geçmişte kaydırma yalnız Düzenle'de, satır düğmeleri tek biçim`.

### Task 14: Kısıt seçici ve aç/kapa ızgarası

**Files:**
- Create: `src/components/condition-picker.tsx`
- Modify: `src/app/dashboard/exercises/medical-fields.tsx`, `src/app/dashboard/exercises/constraint-picker.tsx` (silinir ya da
  yeni bileşeni sarar), `src/app/dashboard/exercises/exercise-list.tsx`, `src/app/dashboard/exercises/exercise-form.tsx`,
  `src/app/dashboard/devices/device-form.tsx`

**Interfaces:**
- Consumes: `RemovableChip`, `parseCondition`, `formatCondition` (`src/lib/conditions.ts`).
- Produces:
  - `ConditionPicker({ id, value, onChange, placeholder, max }: { id: string; value: readonly string[]; onChange: (next: string[]) => void; placeholder?: string; max?: number })`
    (ham kısıt metni; tekrar eklenmez; varsayılan `max` 12; çipler `RemovableChip`, sarmalayıcı `aria-label="Seçili kısıtlar"`)
  - `ToggleTiles({ items, selected, onToggle, max }: { items: readonly { id: string; title: string; detail?: string; image?: string | null }[]; selected: readonly string[]; onToggle: (id: string) => void; max?: number })`
    (bugünkü ortak ızgara biçimi; açıkken `Check`, kapalıyken `Plus`; `max` doluyken seçili olmayanlar `disabled`)

- [ ] **Step 1:** `ConditionPicker`'ı yaz. `ConditionField` (medical-fields) formisch alanını okuyup yazarak onu kullanır;
  `exercise-list` `ClientCondition[]`'ı `formatCondition` / `parseCondition` ile çevirerek kullanır. Eski `ConstraintPicker` silinir.
- [ ] **Step 2:** `ToggleTiles`'ı yaz; `AlternativesField` ve `AttachmentPicker` onu kullanır (12 sınırı `max` ile; muadilde
  `PushPin` → `Check`).
- [ ] **Step 3:** `npx tsc --noEmit`, `npm run lint`, `npm test` temiz. Commit: `refactor(forms): tek kısıt seçici ve tek aç/kapa ızgarası`.

### Task 15: Ölü kod ve ad çakışmaları

**Files:**
- Modify: `src/lib/template-edit.ts`, `src/lib/template-edit.test.ts`, `src/app/me/antrenman/exercise-card.tsx`,
  `src/app/me/antrenman/workout-screen.tsx`, `src/app/me/antrenman/set-row.tsx`, `src/app/me/(sekmeler)/gecmis/[id]/history-detail.tsx`,
  `src/app/dashboard/clients/[id]/sessions/[sessionId]/page.tsx`, `src/components/block-editor/set-table.tsx`, `src/components/exercise-card.tsx`

- [ ] **Step 1:** `duplicateRow`, `duplicateBlock`, `canDuplicate`, `canDuplicateBlocks`, `duplicateBlocks` ve `describe('kopyalama')`
  ile `:851` ve `:883` testleri silinir; ⧉ düğmesinden söz eden yorumlar (`template-edit.ts:45`, `:229`) düzeltilir.
- [ ] **Step 2:** Adlar: antrenman `ExerciseCard` → `WorkoutExerciseCard`; geçmiş detayının yerel kartı → `HistoryExercise`, seti →
  `HistorySet`; PT seans sayfasının yerel kartı → `SessionExercise`; antrenman `SetRow` → `WorkoutSetRow`; düzenleyicinin yerel
  `SetRow`'u → `EditorSetRow`. `components/exercise-card.tsx`'teki kullanılmayan `SELECTED` silinir.
- [ ] **Step 3:** Son grep: `grep -rn "function vibrate\|function swallowClick" src` her biri tek; `movePhase\|moveDay(` yok;
  `duplicate` yok. `npm test`, `npx tsc --noEmit`, `npm run lint` temiz. Commit: `chore: kopya kod ve ad çakışmaları`.

### Task 16: Tarayıcı denetimi

Yerleşik Browser panelinde, dev sunucusu yeniden başlatıldıktan sonra, yalnız `c_zmrbywaz` ile; 1280 px ve 375 px.

- [ ] **Step 1:** Kas haritaları: şablon listesi, şablon detayı ("Kas yükü"), şablon formu, program günü "Kas yükü", program sayfasının
  üç haritası, danışan İlerleme (haftalık ve Gelişim), antrenman özeti, egzersiz detayı ve formu, egzersiz süzgeci, AI koç paneli.
  Her birinde `data-mark` değerleri tablodaki kademelerle uyuşur (`javascript_tool` ile birkaç kası oku), açıklama aynı desen
  başlıklarına bölünür, değerlerde "set" yazar, ad kesilmez, 375 px'te `document.documentElement.scrollWidth <= innerWidth`.
- [ ] **Step 2:** Derin kaslar: formda seç, 8'de dur, kaydetmeden çık; detayda yalnız seçililer haritanın altında.
- [ ] **Step 3:** Listeler: ipucu, evre, antrenman listesi (eklenen hareketi sil, Geri al; silip başka sete yazınca Geri al
  `UNDO_CONFLICT` verir), set satırı (kaydır, "Sil", Geri al;
  fazladan set Geri al), geçmiş detayı (Düzenle dışında kaydırma yok). Her birinde tutamaçla taşıma, Alt+↑/↓, görünür "Sil",
  kaydırma ve 8 sn Geri al. Programlar hafta gününe göre sıralı.
- [ ] **Step 4:** Kayıt silme pencereleri açılır ve "Vazgeç" ile kapanır (hiçbir kayıt silinmez); danışan silmede ad kuralı.
- [ ] **Step 5:** Denetimde yapılan değişiklikler geri alınır, gerçek danışana dokunulmaz. `npm test`, `npm run lint`,
  `npx tsc --noEmit`; dev sunucusu durdurulduktan sonra `npm run build` (aynı anda değil).
