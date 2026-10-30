# Faz 2 · Bugün ve antrenman ekranı — uygulama planı

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (ya da executing-plans) to implement this plan task-by-task.

**Goal:** Tasarımın "Faz 2" bölümü (`docs/plans/2026-10-26-kullanilabilirlik-yeniden-duzen-design.md`): danışanın
Bugün ekranı bir bakışta "bugün ne var, başla" desin; antrenman ekranı tek kartlık akış yerine **liste + odak**
olsun: ana ekran günün listesi, satıra dokununca o hareketin odak ekranı, sıra kendiliğinden değişmez, liste her an
tek dokunuş.

**Architecture:** İmleç (`src/lib/workout-cursor.ts`) bugün "şu anki hareketi" hep sıradaki yapılmamış setten
hesaplıyor; ekranın her işleyicisi buna bağlı. Faz 2 imlece isteğe bağlı bir **odak** (birim anahtarı) ekler:
odak verilince sıradaki set yalnız o birimde aranır, sıra değişmez; verilmeyince bugünkü davranış birebir sürer
(Bugün, özet, bitiş, demo bu yolu kullanır). Odak adreste durur (`?hareket=b_…`); adres Next'in yerel
`window.history.pushState` desteğiyle sunucuya gitmeden değişir (spor salonunda çevrimdışı çalışmalı), geri tuşu
odaktan listeye döner. Liste görünümü ve sıra değiştirme saf fonksiyonlardır (`src/lib/workout-flow.ts`), testle
gelir. Bugün'de yeni veri okuması yok: kısıt notu sunucunun zaten okuduğu sağlık dosyasından, hafta şeridinin gün
adları `/api/me/workout` yanıtındaki bu haftanın oturumlarından gelir.

**Tech Stack:** Next.js 16 App Router (AGENTS.md: sürüm eğitim verisinden farklı; Next API'si kullanmadan önce
`node_modules/next/dist/docs/` okunur — yerel geçmiş API'si: `01-app/02-guides/single-page-applications.md`
"Native History API"), React 19, TypeScript, Tailwind v4 (`touch:` değişkeni), shadcn (Base UI), Phosphor ikonları,
TanStack Query, Node'un test aracı.

**Kurallar**
- Testler `src/lib/*.test.ts`, göreli `.ts` importları; tek dosya:
  `node --test --experimental-strip-types --no-warnings src/lib/<dosya>.test.ts`. Her görevin sonunda
  `npm test`, `npm run typecheck`, `npm run lint` temiz. Bileşen testi yok (projede DOM test aracı yok); ekranlar
  yöneticinin tarayıcı turuyla doğrulanır.
- Uygulayıcı dev sunucusu başlatmaz, `npm run build` çalıştırmaz. Tarayıcı doğrulamasını yönetici (controller)
  yapar: yalnız test danışanı `c_zmrbywaz`; antrenman denemesinde `/api/me/sessions*` yazma istekleri sayfada
  engellenir (hiçbir oturum kaydedilmez); localStorage'da yalnız `pulsecoach.session.c_zmrbywaz` ve
  `pulsecoach.workout.c_zmrbywaz` adıyla, değerleri günlüğe yazıldıktan sonra silinir.
- Danışan metinleri "sen"; telefon önce (375 px), dokunma hedefi en az 44 px, set düğmeleri 56 px (tasarım
  `antrenman-ekrani.md` §2).
- `src/app/me/antrenman/workout-screen.tsx` ~1670 satır ve her işleyici `localRef.current` + `commit` yolunu
  kullanır; B bölümündeki görevler bu dosyayı **sırayla** değiştirir, paralel çalışmaz. Görev kendi parçasını
  ayrı dosyaya çıkarabilir (liste, üst çubuk), ama davranışı bozmadan.
- Her commit `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` ile biter; push yok; commit'ler açık
  yollarla (`git commit -m … -- <dosyalar>`), başka ajanın dosyası süpürülmez.
- Kapsam dışı (sonraki fazlar): haftalık plan modeli ve gün ↔ antrenman eşlemesi (Faz 3; Bugün ve hafta şeridi
  bu fazda dönüş sırasından **tahmin** eder), kutlama ve rozet öne çıkarma (Faz 5), sağlık merkezi (Faz 4).

**Paralellik:** 1 → 2 → 3 → 4 sırayla (ortak test dosyası `workout-flow.test.ts`, ortak `workout-session.ts` /
`workout-flow.ts`); 5 bağımsız. B (6a → 6b → 7 → 8 → 9 → 10) 1–5'ten sonra, sırayla. C: 11 → 12 ve 11 → 13
sırayla (`training-days.ts` ortak); 14, 3'ten sonra. Aynı çalışma ağacında iki uygulayıcı aynı dosyaya dokunmaz;
paralel görevler ya ayrı dosyalardadır ya ayrı worktree'de.

**Karar (yöneticinin):** Tasarım "ana ekran liste" der; liste her an tek dokunuş ("‹ Liste", geri tuşu) ve
"Sırayı değiştir", "Hareket ekle" orada. Antrenman ekranı ise **şu anki hareketin odağıyla açılır** (yeni
antrenmanda ilk hareket, yarımda yarım bırakılan ya da sıradaki): Bugün'deki "Devam et" kartı listeyi zaten
gösterdiği için (14. görev) aynı listeyi ikinci kez göstermek bir dokunuş fazlası. Hepsi bittiyse ekran listeyle
açılır (altta "Antrenmanı bitir").

---

## A · Antrenman çekirdeği (saf mantık)

### Task 1: İmlece odak

**Files:** Modify `src/lib/workout-cursor.ts`, `src/lib/workout-session.ts`, `src/lib/workout-groups.ts` ·
Test `src/lib/workout-flow.test.ts`

Odak verilmeyen her çağrı bugünkü sonucu birebir vermeli (mevcut testler değişmeden geçer).

**Step 1: Test** (`workout-flow.test.ts` sonuna; mevcut `threeDay`, `start`, `logNext`, `stamp`, `sequence`
yardımcıları kullanılır)

```ts
describe('liste + odak: imleç', () => {
  test('odaktaki birimin sıradaki seti; sıra değişmez', () => {
    const day = threeDay();
    const doc = logNext(day, start(day), 1); // Bench 1/3
    const focused = nextSet(day, doc, null, 'b_dddddd');
    assert.equal(focused?.rowId, 'r_dddddd');
    assert.equal(focused?.position, 0);
    // Odaksız imleç Bench'te kalır; sıra yazılmaz.
    assert.equal(nextSet(day, doc)?.rowId, 'r_aaaaaa');
    assert.deepEqual(cursorOf(day, doc, 'b_dddddd').units.map((unit) => unit.key), ['b_aaaaaa', 'b_bbbbbb', 'b_dddddd']);
  });

  test('odaktaki birim bitince sıradaki set yok; dinlenme bütün antrenmana göre', () => {
    const day = threeDay();
    let doc = start(day);
    for (let minute = 1; minute <= 2; minute += 1) {
      const next = nextSet(day, doc, null, 'b_dddddd');
      assert.ok(next);
      // Başka birimlerde set kaldığı için son setin ardında da bloğun dinlenmesi var.
      assert.equal(next.restAfterSeconds, 60);
      doc = logSet(day, doc, { rowId: next.rowId, setIndex: next.setIndex, kg: next.kg, value: next.value, stamp: stamp(minute), random: sequence() }).doc;
    }
    assert.equal(nextSet(day, doc, null, 'b_dddddd'), null);
    assert.equal(cursorOf(day, doc, 'b_dddddd').next, null);
    assert.equal(cursorOf(day, doc, 'b_dddddd').allDone, false);
  });

  test('antrenmanın son seti odakta da dinlenmesiz', () => {
    const day = threeDay();
    let doc = start(day);
    for (let minute = 1; minute <= 5; minute += 1) doc = logNext(day, doc, minute); // Bench ve Plank biter
    const first = nextSet(day, doc, null, 'b_dddddd');
    assert.equal(first?.restAfterSeconds, 60);
    doc = logNext(day, doc, 6);
    assert.equal(nextSet(day, doc, null, 'b_dddddd')?.restAfterSeconds, 0);
  });

  test('grupta odak üyeler arasında turu izler; harf odaktan', () => {
    // Kimlikler fikstürün Gün B'siyle (b_cccccc, r_cccccc) çakışmaz: program şeması kimliklerin benzersizliğini ister.
    const day = dayWithBlocks([
      { id: 'b_aaaaaa', kind: 'single', restSeconds: 90, rows: [{ id: 'r_aaaaaa', exerciseId: 'bench-press', sets: [{ min: 8, max: 10 }] }] },
      {
        id: 'b_eeeeee',
        kind: 'superset',
        restSeconds: 90,
        rows: [
          { id: 'r_ffffff', exerciseId: 'goblet-squat', sets: [{ min: 10, max: 12 }, { min: 10, max: 12 }] },
          { id: 'r_eeeeee', exerciseId: 'push-up', sets: [{ min: 8, max: 12 }, { min: 8, max: 12 }] },
        ],
      },
    ]);
    const doc = start(day);
    assert.equal(nextSet(day, doc, null, 'b_eeeeee')?.rowId, 'r_ffffff');
    assert.equal(nextMemberLetter(day, doc, 'b_eeeeee'), 'B');
    assert.equal(nextMemberLetter(day, doc), null); // odaksız imleç tek harekette
  });

  test('geçilen birime odak: set yok (önce "Geri al")', () => {
    const day = threeDay();
    const dropped = dropAt(day, start(day), 'b_bbbbbb', stamp(1));
    assert.equal(nextSet(day, dropped, null, 'b_bbbbbb'), null);
  });
});
```

(İmportlara `nextMemberLetter` — `./workout-groups.ts` — eklenir; `dayWithBlocks`, `logSet`, `dropAt` zaten var.
Fikstürlerde `push-up` ve `goblet-squat` var: `src/lib/testing/workout-fixtures.ts`.)

Odak parametresinin tipi her yerde `string | null | undefined` (ekran odağı `string | null` tutar); `null` ve
`undefined` "odak yok" demektir.

**Step 2:** Çalıştır → FAIL (`nextSet`'in dördüncü parametresi yok sayılır; ilk test `r_aaaaaa` döner).

**Step 3: Uygula**

`workout-cursor.ts`, `workoutCursor` (bugün 214–250) — imza ve döngü:

```ts
/**
 * Sıradaki set, ilerleme ve bitiş durumu. `focus` (Faz 2, liste + odak): sıradaki set yalnız o birimde aranır,
 * sıra değişmez; birimde set kalmadıysa `next` null. Dinlenme yine bütün antrenmana göre: başka hiçbir yerde
 * yapılmamış set kalmadıysa setin ardında dinlenme yok.
 */
export function workoutCursor(
  plan: TemplateBody,
  session: Pick<SessionDoc, 'entries' | 'order'>,
  overrides: PlanOverrides = {},
  focus?: string | null,
): WorkoutCursor {
  const units = workoutUnits(plan, session, overrides);
  const open = units.filter((unit) => !unitSkipped(unit));

  let next: CursorPosition | null = null;
  let pendingAfter = false;
  for (const [unitIndex, unit] of units.entries()) {
    if (unitSkipped(unit)) continue;
    const candidate = focus == null || unit.key === focus;
    for (const slot of unit.slots) {
      const member = unit.members[slot.member];
      if (!member || slotDone(unit, slot)) continue;
      if (next || !candidate) {
        pendingAfter = true;
        break;
      }
      next = { /* bugünkü alanlar aynen */ };
    }
    if (next && pendingAfter) break;
  }
  if (next && !pendingAfter) next = { ...next, restAfterSeconds: 0 };

  // ... doneSets, plannedSets aynen
  const focused = focus == null ? undefined : units.find((unit) => unit.key === focus);
  const current = next
    ? open.indexOf(units[next.unit] as CursorUnit) + 1
    : focused && !unitSkipped(focused)
      ? open.indexOf(focused) + 1
      : open.length;
  // ... allDone ve dönüş aynen
}
```

`workout-session.ts`:
- `cursorOf(day, doc, focus?: string | null)` → `workoutCursor(dayBody(day), doc, cursorOverrides(day), focus)`.
- `nextSet(day, doc, draft?, focus?: string | null)` → `cursorOf(day, doc, focus)`; gövdenin geri kalanı aynı.
- `easyShortcut(day, doc, setId, focus?: string | null)` → içindeki iki `nextSet` çağrısı `focus`'u geçer.
- Belge yorumlarına odağın anlamı tek cümleyle eklenir.

`workout-groups.ts`: `nextMemberLetter(day, doc, focus?: string | null)` → `cursorOf(day, doc, focus)`.

**Step 4:** Test dosyası PASS; `workout-cursor.test.ts`, `workout-session.test.ts`, `workout-groups.test.ts`
değişmeden PASS.

**Step 5:** `npm test`, `npm run typecheck`, `npm run lint` · Commit: `feat(workout): focus the cursor on one unit`

---

### Task 2: Set kaydının ardı odakla (`afterLog`)

**Files:** Modify `src/lib/workout-session.ts` · Test `src/lib/workout-flow.test.ts`

Odakta birim bitince ekran sıradaki birime geçer ("Sıradaki: Omuz Press"); sıradaki = odaksız imlecin
birimi (sırada ilk bitmemiş birim; danışan sırayı atladıysa yukarıdaki bitmemiş birim).

**Step 1: Test** (aynı `describe` içine)

```ts
  test('odakta birim bitince sıradaki birim: sırada ilk bitmemiş', () => {
    const day = threeDay();
    let doc = start(day);
    // Önce Goblet'i (3. birim) bitir; Bench ve Plank bekliyor.
    let after: ReturnType<typeof afterLog> | null = null;
    for (let minute = 1; minute <= 2; minute += 1) {
      const next = nextSet(day, doc, null, 'b_dddddd');
      assert.ok(next);
      const logged = logSet(day, doc, { rowId: next.rowId, setIndex: next.setIndex, kg: next.kg, value: next.value, stamp: stamp(minute), random: sequence() }).doc;
      after = afterLog(day, doc, logged, 'b_dddddd');
      doc = logged;
    }
    assert.deepEqual(after, { kind: 'next', restSeconds: 60, nextKey: 'b_aaaaaa' });
  });

  test('odakta son set "done"', () => {
    const day = threeDay();
    let doc = start(day);
    for (let minute = 1; minute <= 6; minute += 1) doc = logNext(day, doc, minute);
    const next = nextSet(day, doc, null, 'b_dddddd');
    assert.ok(next);
    const logged = logSet(day, doc, { rowId: next.rowId, setIndex: next.setIndex, kg: next.kg, value: next.value, stamp: stamp(7), random: sequence() }).doc;
    assert.deepEqual(afterLog(day, doc, logged, 'b_dddddd'), { kind: 'done' });
  });

  test('odaksız afterLog da sıradaki birimi söyler', () => {
    const day = threeDay();
    let doc = start(day);
    doc = logNext(day, logNext(day, doc, 1), 2);
    const logged = logNext(day, doc, 3); // Bench'in son seti
    assert.deepEqual(afterLog(day, doc, logged), { kind: 'next', restSeconds: 90, nextKey: 'b_bbbbbb' });
  });
```

**Step 2:** FAIL (`nextKey` yok; odak yok sayılır).

**Step 3: Uygula**

```ts
export type AfterLog =
  | { kind: 'same'; restSeconds: number }
  | { kind: 'member'; transitionSeconds: number }
  /** Hareket bitti: sıradaki birim (`nextKey`, sırada ilk bitmemiş) gelir, dinlenme onun üstünde açılır. */
  | { kind: 'next'; restSeconds: number; nextKey: string | null }
  | { kind: 'done' };

/**
 * `before`: set kaydedilmeden önceki belge; dinlenme o setin ardındaki (`restAfterSeconds`). `focus` verilince
 * set o birimde sayılır (liste + odak); birim bitince sıradaki birim odaksız imleçten.
 */
export function afterLog(
  day: WorkoutDay,
  before: Pick<SessionDoc, 'entries' | 'order'>,
  after: Pick<SessionDoc, 'entries' | 'order'>,
  focus?: string | null,
): AfterLog {
  const was = cursorOf(day, before, focus);
  const now = cursorOf(day, after, focus);
  const overall = cursorOf(day, after);
  if (!overall.next) return { kind: 'done' };
  const restSeconds = was.next?.restAfterSeconds ?? 0;
  const oldUnit = was.next ? was.units[was.next.unit]?.key : undefined;
  const newUnit = now.next ? now.units[now.next.unit]?.key : undefined;
  if (!now.next || oldUnit !== newUnit) return { kind: 'next', restSeconds, nextKey: overall.units[overall.next.unit]?.key ?? null };
  if (was.next && now.next.round === was.next.round && now.next.member !== was.next.member) return { kind: 'member', transitionSeconds: restSeconds };
  return { kind: 'same', restSeconds };
}
```

`afterLog`'un öteki çağıranları (`grep -rn "afterLog(" src`) yeni `nextKey` alanına uyar; davranışları değişmez.

(İmporta `afterLog` — `./workout-session.ts` — eklenir.)

**Step 4:** PASS; `workout-session.test.ts`'teki iki `afterLog` beklentisi (bugün ~212 ve ~578. satırlar)
`{ kind: 'next', restSeconds: 90, nextKey: 'b_bbbbbb' }` olur (yalnız beklenti nesnesi; senaryolar aynı).
`workout-groups.test.ts` etkilenmez.

**Step 5:** `npm test`, typecheck, lint · Commit: `feat(workout): afterLog follows the focused unit`

---

### Task 3: Liste görünümü (`listView`)

**Files:** Modify `src/lib/workout-flow.ts` · Test `src/lib/workout-flow.test.ts`

Antrenman listesinin ve Bugün'ün "Devam et" kartının tek kaynağı. `flowView` (akış sheet'i) 10. göreve kadar
yerinde kalır.

**Step 1: Test**

```ts
describe('liste + odak: liste', () => {
  test('durumlar: bitti, şu an (odak ya da imleç), sırada, atlandı; sıra yapılış sırası, atlanan sona iner', () => {
    const day = threeDay();
    let doc = start(day);
    for (let minute = 1; minute <= 3; minute += 1) doc = logNext(day, doc, minute); // Bench bitti
    doc = dropAt(day, doc, 'b_bbbbbb', stamp(4));
    const view = listView(day, doc);
    assert.deepEqual(
      view.items.map((item) => [item.key, item.state, `${item.done}/${item.planned}`]),
      [
        ['b_aaaaaa', 'done', '3/3'],
        ['b_dddddd', 'current', '0/2'],
        ['b_bbbbbb', 'skipped', '0/2'],
      ],
    );
    assert.equal(view.current, 'b_dddddd');
    assert.equal(listView(day, doc, 'b_aaaaaa').current, 'b_aaaaaa');
  });

  test('son ağırlık: bugün kaydedilen son çalışma seti; yoksa null', () => {
    const day = threeDay();
    const first = nextSet(day, start(day));
    assert.ok(first);
    const doc = logSet(day, start(day), { rowId: first.rowId, setIndex: first.setIndex, kg: 42.5, value: 10, stamp: stamp(1), random: sequence() }).doc;
    const [bench, plank] = listView(day, doc).items;
    assert.deepEqual([bench?.lastKg, bench?.lastFrom], [42.5, 'today']);
    assert.deepEqual([plank?.lastKg, plank?.lastFrom], [null, null]);
  });

  test('"şu an" odak yoksa yarım bırakılan birim (son kaydedilen set); o bitince imleç', () => {
    const day = threeDay();
    let doc = logNext(day, start(day), 1); // Bench 1/3
    const goblet = nextSet(day, doc, null, 'b_dddddd');
    assert.ok(goblet);
    doc = logSet(day, doc, { rowId: goblet.rowId, setIndex: goblet.setIndex, kg: goblet.kg, value: goblet.value, stamp: stamp(2), random: sequence() }).doc;
    // Goblet yarım: listeye dönünce "Devam et" Goblet'i gösterir, Bench'i değil.
    assert.equal(listView(day, doc).current, 'b_dddddd');
    const last = nextSet(day, doc, null, 'b_dddddd');
    assert.ok(last);
    doc = logSet(day, doc, { rowId: last.rowId, setIndex: last.setIndex, kg: last.kg, value: last.value, stamp: stamp(3), random: sequence() }).doc;
    assert.equal(listView(day, doc).current, 'b_aaaaaa');
  });
});
```

(İmporta `listView` eklenir.)

**Step 2:** FAIL.

**Step 3: Uygula** (`flowView`'ın altına; `isSkipped`, `isFinished`, `BLOCK_KIND_LABELS` dosyada ya da importta
var)

```ts
/* --- liste (Faz 2: liste + odak) --- */

export type ListState = 'done' | 'current' | 'pending' | 'skipped';

export type ListItem = Omit<FlowItem, 'state'> & {
  state: ListState;
  /** Satırdaki ağırlık: bugün kaydedilen son çalışma setinin kilosu, yoksa geçen antrenmanın son setininki. */
  lastKg: number | null;
  lastFrom: 'today' | 'last' | null;
};

export type ListView = {
  /** Yapılış sırasında (atlanan birim `dropAt` ile sıranın sonuna iner). */
  items: ListItem[];
  /**
   * Şu an: odak (günde olan, atlanmamış birim); yoksa yarım bırakılan birim (son kaydedilen çalışma setininki);
   * yoksa planı bitmemiş ilk birim. Odaksız yalnız hepsi bittiyse (`allDone`) null: bekleyen "+ Set ekle" seti
   * birimi "şu an" tutmaz.
   */
  current: string | null;
  doneSets: number;
  plannedSets: number;
  allDone: boolean;
};

/**
 * Antrenmanın listesi (tasarım Faz 2): durum (✓ bitti, ▶ şu an, ○ sırada, ⤼ atlandı), ad, yapılan/planlanan set
 * ve son ağırlık (grupta ağırlığı olan ilk üyenin). Danışan sırayı atlayıp başka bir hareketi yarım bıraktıysa
 * "şu an" odur: listeye dönünce "Devam et" onu gösterir. Biten birim odakta da "bitti" görünür; günde olmayan ya
 * da atlanan birime odak yok sayılır.
 */
export function listView(day: WorkoutDay, doc: Pick<SessionDoc, 'entries' | 'order'>, focus?: string | null): ListView {
  const cursor = cursorOf(day, doc);
  const flow = flowView(day, doc);
  const units = new Map(cursor.units.map((unit) => [unit.key, unit]));
  let latest: { entryId: string; at: string } | null = null;
  for (const entry of doc.entries) {
    for (const set of entry.sets) {
      // Eşit saat yalnız iki cihazda olur: sırada sonraki birimin seti kazanır (kayıtlar yapılış sırasında).
      if (set.type === 'working' && (!latest || set.at >= latest.at)) latest = { entryId: entry.id, at: set.at };
    }
  }
  const inProgress = latest ? cursor.units.find((unit) => unit.members.some((member) => member.entryId === latest?.entryId)) : undefined;
  const active = inProgress && !isSkipped(inProgress) && !isFinished(inProgress) ? inProgress.key : null;
  const focused = focus == null ? undefined : units.get(focus);
  const validFocus = focused && !isSkipped(focused) ? focused.key : null;
  const firstOpen = cursor.units.find((unit) => !isSkipped(unit) && !isFinished(unit));
  const current = validFocus ?? active ?? firstOpen?.key ?? null;
  const rank = new Map(cursor.units.map((unit, index) => [unit.key, index]));
  const items = [...flow.active, ...flow.skipped]
    .sort((a, b) => (rank.get(a.key) ?? 0) - (rank.get(b.key) ?? 0))
    .map((item): ListItem => {
      const state: ListState =
        item.state === 'skipped' ? 'skipped' : item.state === 'done' ? 'done' : item.key === current ? 'current' : 'pending';
      return { ...item, state, ...lastWeightOf(day, doc, units.get(item.key)) };
    });
  return { items, current, doneSets: flow.doneSets, plannedSets: flow.plannedSets, allDone: cursor.allDone };
}

/** Satırın ağırlığı: ağırlığı olan ilk üyenin bugünkü son çalışma seti, yoksa geçen antrenmanın son seti. */
function lastWeightOf(day: WorkoutDay, doc: Pick<SessionDoc, 'entries'>, unit: CursorUnit | undefined): Pick<ListItem, 'lastKg' | 'lastFrom'> {
  for (const member of unit?.members ?? []) {
    const entry = doc.entries.find((item) => item.id === member.entryId);
    const today = entry?.sets.filter((set) => set.type === 'working' && set.kg !== undefined).at(-1)?.kg;
    if (today !== undefined) return { lastKg: today, lastFrom: 'today' };
    const last = (member.rowId ? day.rows[member.rowId]?.lastTime : undefined)?.filter((set) => set.kg !== undefined).at(-1)?.kg;
    if (last !== undefined) return { lastKg: last, lastFrom: 'last' };
  }
  return { lastKg: null, lastFrom: null };
}
```

(`PreviousSet` `src/lib/workout-cursor.ts`'te (~357), `lastTime` `WorkoutRow`'da (`workout-plan.ts`); uygulayıcı
geçen antrenmandan gelen ağırlık için `workoutDay({ history })` fikstürüyle bir test daha ekler. `FlowItem` tipi
kalır: `ListItem` ondan türer ve `done-panel.tsx` onu kullanır.)

**Step 4:** PASS. **Step 5:** `npm test`, typecheck, lint · Commit: `feat(workout): list view for the day`

---

### Task 4: Sıra ve atlama (`moveUnit`, `moveUnitTo`, `dropWithUndo`)

**Files:** Modify `src/lib/workout-flow.ts` · Test `src/lib/workout-flow.test.ts`

Liste "Sırayı değiştir" kipinde birim yukarı/aşağı taşınır ya da sürüklenir; biten ve atlanan birimler yerinde
kalır (imleç ve özet sırası bozulmasın). Odaktaki ⋯ "Bu hareketi atla" birimi Geçilenler'e alır ve toast'taki
"Geri al" için önceki hâli döner (bugünkü `skipAt`'in `SkipUndo`'su gibi; `dropAt` yalnız belge döner).
`reorderAt` ve `skipAt` 10. görevde kalkar.

**Step 1: Test**

```ts
describe('liste + odak: sıra ve atlama', () => {
  test('bitmemiş birimler arasında yukarı/aşağı; biten ve atlanan yerinde', () => {
    const day = threeDay();
    let doc = start(day);
    for (let minute = 1; minute <= 3; minute += 1) doc = logNext(day, doc, minute); // Bench bitti
    const up = moveUnit(day, doc, 'b_dddddd', -1, stamp(4), sequence());
    assert.deepEqual(listView(day, up).items.map((item) => item.key), ['b_aaaaaa', 'b_dddddd', 'b_bbbbbb']);
    // En üstteki bitmemiş birim yukarı çıkamaz: üstünde yalnız biten var.
    assert.equal(moveUnit(day, up, 'b_dddddd', -1, stamp(5)), up);
    // Biten birim taşınmaz.
    assert.equal(moveUnit(day, up, 'b_aaaaaa', 1, stamp(5)), up);
    valid(up);
  });

  test('sürükleme: bırakılan bitmemiş birimin yerine; biten hedef olmaz', () => {
    const day = threeDay();
    const moved = moveUnitTo(day, start(day), 'b_dddddd', 'b_aaaaaa', stamp(1), sequence());
    assert.deepEqual(listView(day, moved).items.map((item) => item.key), ['b_dddddd', 'b_aaaaaa', 'b_bbbbbb']);
    let done = start(day);
    for (let minute = 1; minute <= 3; minute += 1) done = logNext(day, done, minute);
    assert.equal(moveUnitTo(day, done, 'b_dddddd', 'b_aaaaaa', stamp(4)), done);
    valid(moved);
  });

  test('"Bu hareketi atla": Geçilenler\'e; "Geri al" sırayı ve durumu geri getirir', () => {
    const day = threeDay();
    const doc = logNext(day, start(day), 1);
    const result = dropWithUndo(day, doc, 'b_bbbbbb', stamp(2), sequence());
    assert.ok(result);
    assert.deepEqual(
      listView(day, result.doc).items.map((item) => [item.key, item.state]),
      [['b_aaaaaa', 'current'], ['b_dddddd', 'pending'], ['b_bbbbbb', 'skipped']],
    );
    const back = undoSkip(day, result.doc, result.undo, stamp(3));
    assert.deepEqual(listView(day, back).items.map((item) => item.key), ['b_aaaaaa', 'b_bbbbbb', 'b_dddddd']);
    const plank = back.entries.find((entry) => entry.rowId === 'r_bbbbbb');
    assert.equal(plank?.status, 'pending');
    assert.equal(plank?.skip, undefined);
    valid(back);
    // Zaten atlanmış birim yeniden atlanmaz.
    assert.equal(dropWithUndo(day, result.doc, 'b_bbbbbb', stamp(4)), null);
  });
});
```

(İmporta `moveUnit`, `moveUnitTo`, `dropWithUndo` eklenir; `undoSkip` zaten var.)

**Step 2:** FAIL. **Step 3: Uygula**

```ts
/** Bitmemiş ve atlanmamış birimlerin yeni sırası; biten ve atlanan yerinde kalır. */
function reorderMovable(day: WorkoutDay, doc: SessionDoc, key: string, place: (movable: CursorUnit[], from: number) => CursorUnit[] | null, stamp: Stamp, random?: Random): SessionDoc {
  const { ready, units } = prepared(day, doc, key, stamp, random);
  const movable = units.filter((unit) => !isSkipped(unit) && !isFinished(unit));
  const from = movable.findIndex((unit) => unit.key === key);
  const placed = from < 0 ? null : place(movable, from);
  if (!placed) return doc;
  let index = 0;
  const ordered = units.map((unit) => (movable.includes(unit) ? (placed[index++] as CursorUnit) : unit));
  return normalizeSession({ ...ready, order: { value: ordered.flatMap(entryIdsOf), updatedAt: stamp.at, by: stamp.by } });
}

/** "Sırayı değiştir" (liste, Faz 2): birim bir yukarı ya da aşağı. Taşınamıyorsa belge aynen döner. */
export function moveUnit(day: WorkoutDay, doc: SessionDoc, key: string, direction: -1 | 1, stamp: Stamp, random?: Random): SessionDoc {
  return reorderMovable(day, doc, key, (movable, from) => {
    const to = from + direction;
    if (to < 0 || to >= movable.length) return null;
    const next = [...movable];
    [next[from], next[to]] = [next[to] as CursorUnit, next[from] as CursorUnit];
    return next;
  }, stamp, random);
}

/** Sürükleme ("Sırayı değiştir" kipinde): birim bırakıldığı bitmemiş birimin yerine. Hedef biten ya da atlanan ise belge aynen döner. */
export function moveUnitTo(day: WorkoutDay, doc: SessionDoc, key: string, targetKey: string, stamp: Stamp, random?: Random): SessionDoc {
  return reorderMovable(day, doc, key, (movable, from) => {
    const to = movable.findIndex((unit) => unit.key === targetKey);
    if (to < 0 || to === from) return null;
    const next = [...movable];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved as CursorUnit);
    return next;
  }, stamp, random);
}

/** "Bu hareketi atla" (odakta ⋯): birim Geçilenler'e; toast'taki "Geri al" (`undoSkip`) için önceki sıra ve durum. */
export function dropWithUndo(day: WorkoutDay, doc: SessionDoc, key: string, stamp: Stamp, random?: Random): { doc: SessionDoc; undo: SkipUndo } | null {
  const { ready, units, unit, entryId } = prepared(day, doc, key, stamp, random);
  if (!unit || !entryId || isSkipped(unit)) return null;
  const ids = new Set(entryIdsOf(unit));
  const undo: SkipUndo = {
    key,
    order: units.flatMap(entryIdsOf),
    entries: ready.entries
      .filter((entry) => ids.has(entry.id))
      .map((entry) => ({ id: entry.id, status: entry.status, ...(entry.skip ? { skip: entry.skip } : {}) })),
  };
  return { doc: normalizeSession(dropUnit(dayBody(day), ready, entryId, stamp, overrides(day))), undo };
}
```

**Step 4:** PASS. **Step 5:** `npm test`, typecheck, lint · Commit: `feat(workout): move, drag and drop-with-undo for units`

---

### Task 5: Antrenman adresi (`workout-nav.ts`)

**Files:** Create `src/lib/workout-nav.ts` · Test `src/lib/workout-nav.test.ts`

**Step 1: Test**

```ts
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { focusOf, workoutHref } from './workout-nav.ts';

describe('antrenman adresi', () => {
  test('odak ve liste işareti eklenir/çıkar; program kalır, bitir düşer', () => {
    assert.equal(workoutHref('/me/antrenman', '?program=pt&bitir=1', { list: true }), '/me/antrenman?program=pt&liste=1');
    assert.equal(workoutHref('/me/antrenman', '?program=pt&liste=1', { focus: 'b_aaaaaa' }), '/me/antrenman?program=pt&liste=1&hareket=b_aaaaaa');
    assert.equal(workoutHref('/me/antrenman', '?liste=1&hareket=b_aaaaaa', { focus: null }), '/me/antrenman?liste=1');
    assert.equal(workoutHref('/me/antrenman', '?liste=1', { list: false }), '/me/antrenman');
  });

  test('odak yalnız birim anahtarı biçiminde: blok ya da eklenen hareketin kaydı', () => {
    assert.equal(focusOf(new URLSearchParams('hareket=b_k2m9x4')), 'b_k2m9x4');
    assert.equal(focusOf(new URLSearchParams('hareket=e_k2m9x4')), 'e_k2m9x4');
    assert.equal(focusOf(new URLSearchParams('hareket=../x')), null);
    assert.equal(focusOf(new URLSearchParams('')), null);
  });
});
```

(Birim anahtarı blok kimliğidir, eklenen harekette kaydın kimliği (`workout-cursor.ts` ~188, ~200). Desenler
yerlerinden alınır: `BLOCK_ID_PATTERN` `src/lib/template-plan.ts` (~21), `ENTRY_ID_PATTERN`
`src/lib/schemas/session.ts` (~28).)

**Step 2:** FAIL. **Step 3: Uygula**

```ts
/**
 * Antrenman ekranının adresi (Faz 2, liste + odak). Odak `?hareket=<birim>`; liste işareti `?liste=1` geri tuşu
 * korkuluğudur (listeden geri "Ara verilsin mi?"). Adres `window.history.pushState/replaceState` ile değişir:
 * Next yerel geçmiş çağrılarını yönlendiriciye bağlar, sunucuya gidilmez (çevrimdışı salon). `bitir` bir kez
 * okunur, sonraki adreslerde düşer.
 */
import { ENTRY_ID_PATTERN } from './schemas/session.ts';
import { BLOCK_ID_PATTERN } from './template-plan.ts';

export const FOCUS_PARAM = 'hareket';
export const LIST_PARAM = 'liste';

const isUnitKey = (value: string) => BLOCK_ID_PATTERN.test(value) || ENTRY_ID_PATTERN.test(value);

export function workoutHref(pathname: string, search: string, change: { focus?: string | null; list?: boolean }): string {
  const params = new URLSearchParams(search);
  params.delete('bitir');
  if (change.list === true) params.set(LIST_PARAM, '1');
  if (change.list === false) params.delete(LIST_PARAM);
  if (typeof change.focus === 'string') params.set(FOCUS_PARAM, change.focus);
  if (change.focus === null) params.delete(FOCUS_PARAM);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function focusOf(params: Pick<URLSearchParams, 'get'>): string | null {
  const value = params.get(FOCUS_PARAM);
  return value && isUnitKey(value) ? value : null;
}
```

(İmportlar dosyanın başına; JSDoc ve sabitler onların altında. `template-plan.ts` istemci paketine girebiliyor
mu (sunucu-only importu var mı) uygulayıcı denetler; giremiyorsa desen `template-plan.ts`'ten küçük bir
`src/lib/ids.ts`'e taşınır ve iki yer oradan import eder.)

**Step 4:** PASS. **Step 5:** `npm test`, typecheck, lint · Commit: `feat(workout): address for list and focus`

---

## B · Antrenman ekranı (`src/app/me/antrenman/`; sırayla)

### Task 6a: Odak adreste; ekran odaktan okur

**Files:** Modify `src/app/me/antrenman/workout-screen.tsx`

Kart ve giriş paneli bugünkü gibi kalır; değişen, "şu anki hareket"in kaynağı. Bu görevden sonra ekran davranışı
ilk bakışta aynıdır (odak yoksa imleç), ama odak verilince her şey o birim için çalışır.

1. **Odak:** `const params = useSearchParams(); const focus = focusOf(params);` ve `focusRef` (eşzamanlı kopya).
   Tek yardımcı `openFocus(key: string | null)`: listedeyken (adreste odak yok) `pushState`, odaktayken
   `replaceState` (geri tuşu odaktan hep listeye döner, odaktan odağa değil); `focusRef.current` aynı anda yazılır.
   Adres `workoutHref(location.pathname, location.search, { focus: key })`. Her işleyici ve `later()` geri çağrısı
   odağı `focusRef.current`'tan okur (memoize `useCallback`'ler ve zamanlayıcılar `useSearchParams`'ın geçiş içindeki
   değerini bayat görebilir). Odak geçersizse (birim yok — başka cihazda silindi, adres elle değişti) odak
   `replaceState` ile düşer.
2. **Çağrı yerleri — hepsi odağı geçer:** `nextSet(plan, doc, draft, focus)`, `afterLog(…, focus)`,
   `nextMemberLetter(…, focus)`, `easyShortcut(…, focus)`, `cursorOf(…, focus)`. Yerler (`grep -n` ile denetlenir:
   `nextSet(`, `cursorOf(`, `afterLog(`, `nextMemberLetter(`, `easyShortcut(`, `flowView(`, `doNowAt(`):
   `view` useMemo (~581–605), `onDone` (~610–689; içindeki "sıradaki" aramaları da: ~646 üye dalında odak,
   ~663 sonraki dalında `nextSet(plan, doc, null, after.nextKey)`), `onStartTimer`, `onResetKg`, `onDraft`,
   `onEasy` (~770, ~774), `timerRunning`, `ExerciseCard`'ın `currentSetIndex`'i, `EntryPanel`'in
   `onSkip`/`onDropExtra` hedefi, `RestPanel`'in "Sıradaki" metni, `commitFlow`/`onAddSet`/`onDropExtra`'daki
   "set kaydı mı oynadı" karşılaştırması. Taslak (`local.draft`) ve set sayacı (`local.timer`) tek satırlıktır:
   başka harekete geçince eski taslak yok sayılır (bugünkü `nextSet` kuralı), sayaç sürüyorsa önce durdurulur.
3. **Biten birim odakta:** `view`'da `unitKey = saving?.next.unitKey ?? next?.unitKey ?? focus`; `next` yoksa
   gösterilen satır odaktaki birimin ilk üyesi (grupta son yapılan üye). Odak varken `DonePanel` çizilmez (o,
   odak yokken ve hepsi bittiğinde). Böylece biten hareket açılınca setleri ve tablosu görünür.
4. **Kendiliğinden geçiş:** `afterLog` `next` dönünce (birim bitti) bugünkü zamanlamayla (`NEXT_SLIDE_MS`,
   `NEXT_REST_MS`) `openFocus(after.nextKey)` (odaktayken `replaceState`). Zamanlayıcı yalnız `focusRef.current`
   hâlâ biten birimse çalışır (260 ms içinde "‹ Liste"ye basıldıysa hiçbir şey yapmaz). `nextKey` null ise listeye
   döner. `done` bugünkü gibi bitiş sheet'ini açar.
5. **Sıra kendiliğinden değişmez:** `onJump`/`doNowAt` çağrıları kalkar; yerine `openFocus(key)` (atlanan birimde
   önce `restoreAt`). "Hareket ekle"nin toast'ındaki "Şimdi yap" ve bitiş sheet'indeki "Geçileni yap" de aynı:
   geri al (gerekiyorsa) + `openFocus`; sıra yazılmaz.
6. Geçici olarak ☰ akış sheet'i kalır; satıra dokunmak artık `openFocus` (6b'de liste yerini alır).

typecheck, lint, test · Commit: `feat(workout): the screen reads the focused unit`

**Controller doğrulaması (375 px, yazmalar engelli):** akış sheet'inden üçüncü harekete dokununca o açılıyor, ilk
hareket akışta hâlâ ilk; set odaktaki harekete yazılıyor; hareket bitince sırada ilk bitmemiş açılıyor; bitmiş
harekete dokununca set tablosu görünüyor.

**Uygulamada (d7f4e2e) — plandan sapmalar:**
- **Bitiş kuralı:** odakta birim bitti ve planın bütün setleri yapıldıysa, kalan yalnız başka birimde bekleyen
  "+ Set ekle" seti olsa da bitiş sheet'i açılır (fazladan sete atlanmaz; istenirse hareket listeden açılır). 6b bunu
  `nextUnitAfter` ile tek kurala bağladı.
- **`moveUnitTo` öne çekildi:** akış sheet'inin sürüklemesi `reorderAt` yerine `moveUnitTo` (7. görevin işi); biten
  ve atlanan birim yerinde kalır. 6b akış sheet'ini kaldırdığından sıra değiştirme 7. göreve kadar yok.
- **Odaktaki hareketi geçmek odağı taşır:** "Hareketi geç ›" odaktaki birimdeyse odak sıradaki birime geçer (8.
  görevin "Bu hareketi atla" kuralı öne çekildi), kalmadıysa odak düşer; toast'taki "Geri al" odağı geri getirir.
- **`flowFor`:** akış sheet'inde "şimdi" odaktaki birimdi (sheet odakla tutarlı kalsın diye); 6b'de sheet'le
  birlikte kalktı.
- 6a incelemesinin bulguları (geri/ileri tuşunda sayaç ve geçiş, kendiliğinden geçişte fazladan set, zamanlayıcının
  odağı adresten okuması, `openFocus`'un geçerlilik kuralı) 6b'de kapandı (aşağıda).

---

### Task 6b: Liste ana ekran ve açılış

**Files:** Create `src/app/me/antrenman/workout-list.tsx` · Modify `src/app/me/antrenman/workout-screen.tsx`

1. **`WorkoutList`** (istemci): `listView`'ı çizer.
   - Satır (bütünü düğme, `min-h-14`, "şu an"da `aria-current="step"`): durum ikonu (✓ `CheckCircle` dolu,
     ▶ `PlayCircle`, ○ `Circle`, ⤼ `ArrowBendDownRight`; ikonlar `aria-hidden`, durum metni sr-only), numara, ad
     (grupta `kindLabel` rozeti ve üyeler alt alta, numaralar "3a/3b"), sağda "2/4 set" ve son ağırlık
     ("40 kg"; geçen antrenmandansa "Geçen: 40 kg"; süreli hareket ağırlıksız).
   - Atlanan satırda ayrıca "Geri al" (ikincil düğme): `restoreAt` (bugünkü `onRestore`).
   - Listenin altında "Hareket ekle" (hayalet, tam genişlik): bugünkü `AddExerciseSheet`.
   - Alt sabit çubuk: birincil düğme `Başla: <ad>` (hiç set yoksa), `Devam et: <ad>` (`listView().current`) ya da
     hepsi bittiyse `Antrenmanı bitir` (bitiş sheet'i). Dinlenme sürüyorsa çubuğun üstünde bugünkü `RestStrip`.
2. **Kip:** odak yoksa `WorkoutList`, varsa bugünkü kart + giriş paneli. Listede satıra dokunmak `openFocus(key)`
   (6a); atlanan satırda önce `restoreAt`. Biten satır da açılır (setleri düzeltmek için).
3. **"‹ Liste"** (odakta üst çubuğun solu): `history.back()` — 4. maddedeki açılış kuralıyla odağın altında hep
   liste girdisi vardır. Sayfa odak adresiyle yeniden yüklendiyse (altında liste girdisi yok: açılış kuralı
   çalışmadı) `replaceState` ile odağı düşür; bunu ayırt etmek için açılış kuralının çalıştığı bir ref tutulur.
4. **Açılış kuralı** (ayrı bir effect, `load.phase === 'ready'` olduktan sonra, `doc.id` başına bir kez, yalnız
   adreste `liste` ve `hareket` yokken): liste işareti **`pushState`** ile eklenir (altında işaretsiz girdi kalır:
   9. görevin korkuluğu); ardından hepsi bitmediyse `listView().current`'e odak, o da `pushState` ile. Hepsi
   bittiyse yalnız liste. `?bitir=1`'de de işaret eklenir (`workoutHref` `bitir`'i düşürür) ve bitiş sheet'i bugünkü
   gibi açılır. **İlk mount effect'inde itilmez:** sert yüklemede çocuk effect'leri Next'in `pushState` yamasından
   önce çalışabilir; yamasız `pushState` Next'in durumunu yazmaz ve geri dönüşte Next o girdiyi tanımaz. Uygulayıcı
   bunu `node_modules/next/dist/client/components/app-router.js`'te (yerel geçmiş yaması ve `popstate`) doğrular;
   gerekirse itme bir sonraki tick'e (`setTimeout(…, 0)`) ertelenir.
5. ☰ düğmesi ve `FlowSheet` kullanımı kalkar (dosya 10. görevde silinir). Üst çubuk 7. göreve kadar bugünkü gibi
   kalabilir; yalnız ☰ kalkar ve odakta sola "‹ Liste" gelir.
6. Erişilebilirlik: kip değişince odak bugünkü kuralla taşınır (`focusLater`): odakta hareketin başlığı
   (`exercise-title`), listede "şu an" satırı; tek canlı bölge (`aria-live`) "Liste" / "<hareket>" der.

typecheck, lint, test · Commit: `feat(workout): list as home, opening in focus`

**Controller doğrulaması (375 px, yazmalar engelli):** yeni antrenman ilk hareketin odağıyla açılıyor; "‹ Liste"
listeye dönüyor, sıra aynı; listede üçüncü harekete dokununca o açılıyor; geri tuşu odaktan listeye. **Çevrimdışı**
(DevTools'ta ağ kapalı): satıra dokunma, "‹ Liste" ve geri tuşu ağ isteği yapmadan ve sayfayı yeniden yüklemeden
çalışıyor.

**Uygulamada (6b) — değişenler ve 6a incelemesinin bulguları:**
- **Liste:** `workout-list.tsx` (`WorkoutList`, alt çubuk `WorkoutListBar`). Listenin başlık satırı "Hareketler" (7.
  görevde sağına "Sırayı değiştir"). Kip adresten: odak yoksa ya da geçersizse liste (`validFocus`, `listView`'ın
  kuralı; `focusIn` kalktı). `<main>` kipe göre anahtarlanır: listede aşağı kaydırılıp açılan kart başından görünür.
- **`goToList()`:** odağın altında bu sayfanın ittiği liste girdisi varsa `history.back()`, yoksa `replaceState`. Ayırt
  eden ref (`focusPushed`) yalnız açılış kuralında değil, listeden her odak itmesinde true olur: sayfa odak adresiyle
  yenilenip "‹ Liste" odağı `replaceState` ile düşürdükten sonra satıra dokunulursa da altında liste vardır (değişmez:
  itme yalnız listeden, odaktan odağa `replaceState`). Her `openFocus(null)` (geçersiz odak, odaktaki son hareketi
  geçmek) bu yoldan; `openFocus` artık yalnız birim alır. Zaten listeye dönülüyorsa ikinci `back()` yok.
- **Açılış kuralı:** ayrı effect, `doc.id` başına bir kez (`opened` state; 7. görevde yeni antrenmanın kimliği yeni
  olduğundan ayrıca sıfırlamak gerekmez, `focusPushed`'ın değişmezi de bozulmaz). Karar verilene kadar ekran iskeletle
  bekler: 'ready' çizimi effect'ten önce boyanır, yoksa liste bir kare görünüp odağa atlardı. `setTimeout` gerekmedi:
  effect 'ready'nin yeniden çiziminde çalışır, Next'in yaması (AppRouter'ın `useEffect`'i) o zaman kurulu.
  `?bitir=1`: işaret itilir, odak itilmez (sheet kapanınca liste). Telefonda kalmış süreli set sayacı açılan
  hareketin değilse düşer.
- **Sıradaki birim (`nextUnitAfter`, `workout-flow.ts`, testli):** odaksız listenin "şu an"ı, biten ya da geçilen
  birim hariç; o da hariçse sırada planı bitmemiş ilk öteki birim. Fazladan seti saymaz. Kendiliğinden geçişte
  (`after.nextKey` yerine) ve odakta geçmede; 8. görevin "Sıradaki" satırı için hazır. Kalmadıysa bitiş sheet'i.
- **Geri/ileri tuşu** odağı değiştirince (eşitleme effect'i) gösterilen birim değiştiyse süreli set sayacı ve
  istasyon geçişi düşer; canlı bölge "Liste" ya da hareketin adını söyler, klavye odağı taşınır. "‹ Liste" de sayacı
  düşürür (sayaç odak ekranınındır). Eşitleme effect'i geçersiz odak effect'inin üstünde kalmalı (yorumda).
- **Kendiliğinden geçişin zamanlayıcısı** odağı adresten (`location.search`) ve kopyadan birlikte denetler; başka
  yere geçildiyse "Sıradaki" söylenmez, klavye odağı taşınmaz. `startTransition` yorumu düzeldi.
- **7. göreve kalan:** ☰ ile birlikte sıra değiştirme de kalktı (sürükleme `FlowSheet`'teydi): "Sırayı değiştir"
  kipi gelene kadar sıra değiştirilemez. `FlowSheet` kodu duruyor, kullanılmıyor (10. görev). Odakta "Ara ver" yok
  (yerinde "‹ Liste"; listede "‹ Ara ver"), ⋯ menüsüyle gelir.
- **8. göreve kalan:** tam dinlenme paneli açıkken "‹ Liste" adresi listeye çevirir ama panel listeyi örter
  (küçültme 8. görevde); kendiliğinden geçişten önce listeye dönülürse dinlenme yine tam açılır. Biten birimin giriş
  paneli bugünkü "Hareketler bitti".

---

### Task 7: Üst çubuk, ⋯ menüsü ve "Sırayı değiştir"

**Files:** Create `src/app/me/antrenman/workout-header.tsx` · Modify `workout-screen.tsx`, `workout-list.tsx`

1. **`WorkoutHeader`** (bugünkü 1380–1426 buraya taşınır): sol — odakta "‹ Liste", listede boş (dengeli
   başlık); orta — `[program ·] gün adı · mm:ss`; sağ — **Bitir** ve ⋯ (`DropdownMenu`, `aria-label="Antrenman
   menüsü"`): **Antrenmanı değiştir** (bugünkü `WorkoutSwitchSheet`), **Ara ver** (bugünkü "‹ Ara ver"in işi:
   `router.push('/me')`). İkinci satır: set ilerleme çubuğu + "a/b set" + su sayısı; çevrimdışı/hata satırı
   aynen. "Değiştir" hayalet düğmesi ve ☰ kalkar.
2. **Antrenmanı değiştir ekranı takılı bırakıyor (bugünkü hata):** `router.replace` yalnız arama parametresi
   değişince `WorkoutScreen` yeniden bağlanmaz (`node_modules/next/dist/client/components/layout-router.js` ~549:
   önbellek anahtarı `createRouterCacheKey(segment, true)` arama parametresini atar). Bu yüzden `onSwitch`'in iki
   başarı dalında da (set yokken DELETE'ten sonra; setliyken `submitFinish`'in başarısında) tek yardımcı
   `restartWith({ program, day })` çağrılır: `setFinishing(false)`, `setUpdate(null)`, `outbox.resume()` (durdurulan
   kuyruk yeni antrenmanın setlerini hiç göndermezdi), ekran yeni plan gelene kadar iskelete döner
   (`setLoad('loading')`); açılış kuralının bayrağı (`opened`) ve `focusPushed` de sıfırlanır, böylece yeni antrenman
   Bugün'den açılmış gibi liste işaretiyle ve ilk hareketin odağıyla açılır. (6b'nin notu doğru: bayrak `doc.id`
   başına, yeni antrenmanın kimliği yeni, sıfırlamasa da yeniden karar verilirdi; `focusPushed`'ın değişmezi de
   bozulmazdı. Sıfırlamak "taze açılış"ı kimliğe bırakmaz, zararsız.) Seçilen gün ve program sayfanın props'larıyla
   aynıysa (sunucu başka günün yarım antrenmanını açmıştı) props değişmez, açılış effect'i yeniden çalışmaz: adres
   `replaceState` ile değişir, `attempt` artırılır.
3. **Sırayı değiştir:** listenin başlığında "Sırayı değiştir" (hayalet). Kipte her bitmemiş, atlanmamış satırda
   ▲/▼ düğmeleri (44 px, `aria-label="<ad> yukarı"`), `moveUnit`; uçta düğme devre dışı. Sürükleme kısayol olarak
   kalır: bugünkü `DragFlowRow` mantığı (dnd-kit, tutamaç `DotsSixVertical`, Alt+↑/↓) bu kipe taşınır;
   bırakmada `moveUnitTo(…, active.id, over.id)`, Alt+↑/↓'da `moveUnit`; biten/atlanan satır sürüklenmez ve hedef
   olmaz. Ekranda kalan `reorderAt` çağrısı (bugün `workout-screen.tsx` ~1613, akış sheet'inin sürüklemesi)
   `moveUnitTo`'ya geçer; `reorderAt` biten ve atlanan birimi de taşıyabiliyor. (6a bu geçişi yaptı, 6b akış
   sheet'iyle birlikte kaldırdı: ekranda sıra değiştiren çağrı yok, kip `moveUnitTo`/`moveUnit`'i yeniden bağlar.) "Bitti" ile kip kapanır. Kipte satıra dokunmak odak açmaz.

typecheck, lint, test · Commit: `feat(workout): header menu and reorder mode`

**Controller doğrulaması:** ⋯ menüsünde iki öğe; "Ara ver" Bugün'e dönüyor (Bugün'de "Devam et"); "Sırayı
değiştir"de ▲/▼ yalnız bitmemiş satırlarda; biten satır yerinde; "Antrenmanı değiştir" ile başka güne geçince
ekran takılmıyor, yeni gün odakla açılıyor.

**Uygulamada (7):**
- **Üst çubuk** `workout-header.tsx` (`WorkoutHeader`, `WorkoutStatus`): ikinci satırda "Hareket x/y · a/b set" kaldı
  (tasarım §2.4), ama sayı imleçten değil listeden: `listView().current`'in atlanmamış satırlar içindeki sırası (odakta
  odaktaki hareket, listede ▶ satırı ve "Devam et" ile aynı; hepsi bittiyse son). ⋯ tetiği 44 px.
- **Sırayı değiştir** `workout-list.tsx`'te (kip durumu listenin kendi state'i: listeden çıkınca kapanır). Düğme en az
  iki taşınabilen hareket varken görünür. Kipte "Geri al" ve "Hareket ekle" gizli, sağdaki "2/4 set" sütunu yok (▲/▼'ye
  yer). ▲/▼ uçta `focusableWhenDisabled` (odak düşmez); aşağı inen satırın düğümü yer değiştirince odak düşer, düğmeye
  geri verilir. Sürükleme: dnd-kit'in duyuruları Türkçe; bırakmanın sonucunu ekranın canlı bölgesi söyler
  ("Plank 3. sırada"). Taşıma `commitFlow` ile (gönderilmez). `FlowSheet`/`DragFlowRow` 10. göreve kadar duruyor.
- **6b incelemesinin bulguları:** satır düğmelerinin kimliği `list-row-<anahtar>` (`listRowId`; `LIST_CURRENT_ID`
  kalktı). Odaktan listeye dönülünce (‹ Liste, geri tuşu, geçersiz odak, son hareketi geçmek) klavye odağı sabit
  220 ms zamanlayıcıyla değil, liste çizilince bir effect'le taşınır: az önce bırakılan hareketin satırına kaydırılır
  ve odaklanır (`leftUnit`, `leaveShown` yazar), yoksa "şu an" satırı, o da yoksa başlık; açılışta taşınmaz. Açılış
  effect'inde süreli set sayacının kuralı erken dönüşten önce: `?liste=1` ya da başka hareketin odağıyla yenilenince de
  sayaç düşer (adresteki odak `validFocus`). Listenin `<ol>`'ünde `role="list"`.

---

### Task 8: Odak ekranının ayrıntıları

**Files:** Modify `workout-screen.tsx`, `exercise-card.tsx`, `entry-panel.tsx`, `rest-panel.tsx`,
`workout-header.tsx`

1. **Odakta ⋯** (üst çubuktaki menüye odakta iki öğe eklenir): **Muadil seç** — odaktaki birimin şu anki
   üyesinin satırı `canSwap` ise bugünkü `SwapSheet`; değilse öğe devre dışı, notu set kaydedildiyse "Set
   kaydedildi, muadil seçilemez", eklenen harekette "Bu hareketin muadili yok"; **Bu hareketi atla** —
   `dropWithUndo` (4. görev; biten birimde null döner, öğe o zaman devre dışı) + toast'ta "Geri al" (`undoSkip`,
   bugünkü toast düzeni); ardından `openFocus` sıradaki birime (`nextUnitAfter(plan, doc, odak)`: fazladan setleri saymaz),
   yoksa listeye. Başlığın yanındaki "Değiştir" düğmesi kalkar; kısıt
   notundaki "Değiştir" kalır. Giriş panelindeki "Hareketi geç ›" kalkar (aynı iş tek yerde, ⋯'de; fazladan
   setteki "Kaldır" kalır); `skipAt`'in çağıranı kalmaz (10. görevde kalkar).
2. **Biten hareketi yeniden açmak:** 6a odakta biten birimin set tablosunu gösterir. Odaktaki birimde set
   kalmadıysa (`nextSet(…, focus)` null) giriş paneli "Bu hareket bitti" der: birincil **Sıradaki: <ad>**
   (`openFocus` `nextUnitAfter(plan, doc, odak)`'a) ya da hepsi bittiyse **Antrenmanı bitir**; ikincil **Set ekle** (bugünkü
   fazladan set). Set tablosunda kayıtlı satıra dokunmak bugünkü `EditSetSheet`'i açar. Silinen set birimi yeniden
   bitmemiş yapar: odak o birimde kalır ve sıradaki set onun.
3. **Dinlenme ekranı kilitlemez:** dinlenme sürerken "‹ Liste"ye basmak dinlenmeyi küçültür (`mode: 'mini'`) ve
   listeye döner; listede alt çubuğun üstünde `RestStrip`. Listeden bir harekete dokunmak dinlenmeyi bitirmez;
   odakta "Set bitti" bugünkü gibi dinlenmeyi bitirir. Üst çubuk dinlenmede de dokunulur kalır (bugünkü gibi).
4. **Kartlarda son değerler:** set tablosunun "Önceki" sütunu aynen; liste satırındaki son ağırlık 6b. görevden.
5. **"Sıradaki" her an görünür** (kullanıcı isteği, 30 Ekim): odak ekranında giriş panelinin altında tek satır
   "Sıradaki: <ad>" — kendiliğinden geçişin açacağı birim: `nextUnitAfter(plan, doc, odak)` (yarım bırakılan,
   yoksa sırada ilk bitmemiş; odaktaki birim hariç; fazladan setleri saymaz). Odaktakinin önünde kalmış bitmemiş
   bir birim de olabilir: satır, ekranın gerçekten nereye geçeceğini söyler (karar, 6b incelemesi). Dokununca
   `openFocus` o birime. Yoksa satır "Son hareket" der. Dinlenme panelinin "Sıradaki" metni (odakta ve listede)
   aynı kaynaktan; bugün listede imlecin sıradaki setinden geliyor ve bekleyen fazladan seti gösterebiliyor.

typecheck, lint, test · Commit: `feat(workout): focus menu, reopen finished exercises, non-blocking rest`

**Controller doğrulaması:** bitmiş harekete listeden dokununca setleri görünüyor, set düzeltilebiliyor; dinlenme
sırasında "‹ Liste" listeyi açıyor ve şeritte geri sayım sürüyor; "Bu hareketi atla" listede ⤼.

**Uygulamada (8, cafc314) ve incelemesinin bulguları** (`fix(workout): safer next line, switch waits, focus after rest`):
- **"Sıradaki" satırı** ana düğmenin altında tam genişlikte şerit değil: üstünde çizgi (`mt-1 border-t pt-1`), düğme yazısı
  kadar geniş ve ortada. Süreli set sayarken ve set kaydedilirken satır çizilmez (yeri boş kalır, panel kaymaz): "Bitir ■"i
  ıskalayan dokunuş süren seti bırakmasın (`leaveShown` sayacı düşürür).
- **"Antrenmanı değiştir"** sheet'i istek bitene kadar açık ve meşgul (`busy`: seçimler ve düğmeler devre dışı, "Antrenman
  değiştiriliyor…", birincil düğmede dönen gösterge; Esc, sürükleme ve Vazgeç reddedilir). Sheet modal: alttaki ekranda o
  arada set yazılamaz (başarıda kaybolurdu). `<main>`'i `inert` yapmak yerine bu seçildi: bekleme dokunulan yerde görünür,
  hatada sheet açık kalır; FinishSheet'in düzeni. Başarıda `restartWith` kapatır.
- **Listeye dönüş niyeti** (`returningToList`) yalnız gösterilen bir hareket bırakılınca yazılır (`leaveShown` bunu
  döndürür; `onDropUnit` kendisi yazar, belge önce yazıldığından). İleri tuşuyla atlanmış hareketin adresine gelinince
  (geçersiz odak, liste zaten görünür) yazılmaz; yazılsaydı liste effect'i çalışmaz, niyet kalır ve sonra klavye odağını
  çalardı.
- **Dinlenmeden çıkınca klavye odağı** tek yardımcıda (`focusAfterRest`; "Atla", "Sonraki sete geç", küçültme): listede
  listenin başlığı, odakta "Set bitti" (sayarken "Bitir"), yoksa (biten hareket) hareketin başlığı.
- **"Bu hareketi atla"nın "Geri al"ı** açılmış bitiş sorusunu kapatır; sheet'in zamanlayıcısı açmadan önce telefondaki son
  hâle yeniden bakar (geri alındıysa açmaz).
- **Gönderim kuyruğunun kuşağı:** `reset()` kuşağı artırır ve `inFlight`'ı bırakır; eski antrenmanın yoldaki PUT'u
  dönünce (410/409 dahil) yanıtı yok sayılır, yeni antrenmana uygulanmaz.
- **`undoSwitchPrep`** `workout-flow.ts`'te (`withFinishReason`'ın yanında), `normalizeSession` ile; `skip` değerle
  karşılaştırılır. Testli: değişmeyen belge, istek sürerken yazılan set, önceki "sona alındı" işareti, `ensureEntries`'in
  açtığı kayıtlar (kalır, nedensiz).
- Kısıt notundaki "Değiştir" ikonu `Swap` ("Muadil seç" ile aynı); set kaydedilirken ⋯'deki "Muadil seç" ve "Bu hareketi
  atla" devre dışı ("Set kaydediliyor…"). `onDropUnit`'in öncelik yorumu düzeldi: Next'in adres `setState`'i mikro görevde,
  geçişin dışında; tıklamada büyük olasılıkla Sync, zamanlayıcıda Default, ikisi de geçişten öncelikli.

---

### Task 9: Geri tuşu

**Files:** Modify `workout-screen.tsx` (gerekirse küçük bir `use-workout-history.ts` kancası)

- Odaktan geri: tarayıcı geçmişi zaten listeye döner (6b'nin açılış kuralı ve `openFocus`); ek kod yok.
- Listeden geri → **"Ara verilsin mi?"**: 6b'nin açılış kuralı liste işaretli girdiyi (`?liste=1`) işaretsiz
  girdinin üstüne iter. Korkuluğun kurulu olduğu `armed` **state**'te tutulur (işareti iten effect true yapar;
  ilk yükleme de işaretsiz olduğundan bu bayrak şart). `armed && !searchParams.has('liste')` iken ekran
  `AlertDialog` açar: "Ara verilsin mi? Antrenmanın telefonunda kalır; Bugün'den devam edersin." — **Devam et**
  (işaret `pushState` ile geri konur) · **Ara ver** (`router.replace('/me')`).
- Sayfa liste ya da odak adresiyle yeniden yüklendiyse (açılış kuralı çalışmaz, altında işaretsiz girdi yok) geri
  tuşu doğrudan çıkar; bu kabul edilir.
- Lint: `react-hooks/set-state-in-effect` ve `react-hooks/refs` açık. `armed` effect içinde, dosyadaki gerekçeli
  devre dışı bırakma yorumu düzeniyle (`workout-screen.tsx` ~444) yazılır; çizimde ref okunmaz.
- `pushState`'e `null` verilir (Next'in yaması kendi alanlarını ekler); `history.state`'e kendi nesnesini yazmaya
  gerek yok.

typecheck, lint, test · Commit: `feat(workout): back from the list asks before leaving`

**Controller doğrulaması:** odak → geri → liste; liste → geri → "Ara verilsin mi?"; "Devam et" listede kalıyor,
ikinci geri yine soruyor; "Ara ver" Bugün'e. Çevrimdışıyken de aynı. Android Chrome'da (ya da mobil öykünmede)
sayfa yenilendikten sonra odak → geri denenir: Chrome kullanıcı etkileşimi olmadan itilen girdileri geri tuşunda
atlayabilir; atlıyorsa bu not edilir (yenileme sonrası kabul edilen sınır).

**Uygulamada (9):**
- **Korkuluk** `armed` state'te, boolean (planın dediği gibi). İlk uygulamada değeri antrenmanın kimliğiydi; inceleme:
  arka plandaki tazeleme (`revalidate`) boş antrenmanı yeni kimlikli belgeyle yeniden kurabilir, açılış kuralı o zaman
  işaretli adreste çalışır (kurmaz) ve listeden geri sormadan çıkardı. Tek sıfırlama `restartWith`'te. Açılış kuralının
  effect'i liste işaretini ittiğinde yazar (`setOpened` ile aynı çizime düşer: dialog bir kare bile açık görünmez);
  tıklamadan gelen `pushMark` geçişte (`startTransition`) yazar: Next adresi mikro görevde tıklamanın önceliğiyle yazar,
  eşzamanlı `setArmed` ondan önce çizilir, dialog işaretsiz adresle bir kare açılırdı. Dialog (`PauseDialog`,
  `workout-sheets.tsx`) `armed && pausing !== 'back' && !liste && !hareket && !finishing` iken açık: işaretsiz bir odak
  adresinde, bitiş/değiştirme sürerken ve ⋯'deki "Ara ver" işaretsiz girdiye dönerken sormaz. **Devam et** işareti
  `pushState` ile geri koyar (`pushMark`; `focusPushed`'a dokunmaz), ileri geçmiş (eski odak) düşer. Dialog'u kapatmak (Esc)
  "Devam et"tir: açıklığı adresten geldiği için başka türlü kapanamazdı. Telefonda "Devam et" birincil, altta ve odakta.
- **Ara ver** (dialog ve ⋯ menüsü) ikisi de Bugün'ü işaretsiz girdinin yerine koyar (`router.replace('/me')`, `leave()`
  gibi; 7. görevin `router.push`'u değişti): ara vermek antrenmandan çıkmak, Bugün'de geri tuşu antrenmanın altındakine
  gider. `push` antrenman girdilerinin üstüne Bugün'ü eklerdi; işaretsiz girdiden çıkılınca Bugün'de geri tuşu o girdiye
  döner, açılış kuralı yeniden iter, danışan antrenmana geri çekilirdi. Dialog'dan işaretsiz girdinin kendisindeyiz: yalnız
  `replace`. ⋯'den (liste ya da odak) ilk uygulama da yalnız `replace` yapıyordu; inceleme: listeden `B, [/me], F` kalır,
  Bugün'de geri B'ye iner ve aynı tuzak. Şimdi korkuluk kuruluyken önce işaretsiz girdiye geri gidilir
  (`history.go(-n)`; `pauseSteps`, `workout-nav.ts`, testli: odakta 2, listede 1; korkuluk yoksa, odağı bu sayfa itmediyse ya
  da zaten işaretsiz girdideyse 0), `replace` gelen `popstate`'te çağrılır (tek seferlik dinleyici Next'inkinden sonra
  eklenir: o `popstate`'te Next'in kendi geri yüklemesi `replace`'i ezmez; ekran kapanırsa dinleyici kalkar). İki yolda da
  gösterilen hareket önce bırakılır (`leaveShown`, yalnız telefonda; sunucuya bir şey gitmez): süren set sayacı düşer, tam
  dinlenme küçülür, geri tuşunun listeye/işaretsiz girdiye dönüşündeki gibi (ilk düzeltmede bunu yalnız geri giden yol,
  işaretsiz girdi çizilince yapıyordu). Ara verilirken (`pausing`) ikinci dokunuş bir şey yapmaz, dialog açık kalır,
  düğmeleri devre dışı ("Ara ver"de dönen gösterge) ve kapanmayı reddeder. `replace` ileri geçmişi silmez (tarayıcının
  ileri tuşu antrenmanın girdilerine dönebilir; kabul).
- **Bekleyen `/me` geçişi düşerse** (ikinci inceleme): `/me` önbellekte değilse sunucu turu sürer (salonda saniyeler); o
  arada işaretsiz girdi çizili ve `/me` çizilmeden gelen her geri yükleme ya da geçiş onu düşürür (yamalı `pushState`'in
  `ACTION_RESTORE`'u, geri/ileri tuşu). Düşerse `pausing` kalır: ⋯ "Ara ver" sessizce bir şey yapmaz, listeden geri
  sormaz, dialog kilitli kalır (yenilemeye kadar). Üç önlem: ara verilirken ekranın kökü `inert` (+ `aria-busy`; dialog
  portalda); ekranın dışında çalışanlar adrese dokunmaz (`pausingRef`: toast'ların "Geri al"ı ve "Şimdi yap"ı, kendiliğinden
  geçişin zamanlayıcısı, arka plandaki tazelemenin yeniden kurması); `replace`'ten sonra ekran hâlâ bağlıyken gelen
  `popstate` ara vermeyi bitirir (tek seferlik dinleyici, aynı ref; Bugün'e dönülürse ekran kapanır, dinleyici kalkar).
  `popstate` işleyicisinde eklenen dinleyici o olayda çağrılmaz (DOM'un "inner invoke"ı dinleyicileri dağıtımın başında
  kopyalar): ⋯ yolunda `replace`'i veren olay sıfırlamayı tetiklemez. Toast'lar ekran kapandıktan sonra da Bugün'de
  görünür: düğmeleri artık bir şey yapmaz (`mountedRef`); yoksa `workoutHref` Bugün'ün adresine (`/me?liste=1&hareket=…`)
  odak iterdi.
- **İşaretsiz girdide satıra dokunmak:** `openFocus` listeden iterken adreste işaret yoksa önce işareti iter (korkuluk da
  kurulur), sonra odağı: odağın altında hep işaretli liste. Seçildi, çünkü dialog modal olsa da altındaki toast'ların
  düğmeleri ("Geri al", "Şimdi yap") odak açabilir; ayrıca sayfa `?hareket=` ile yüklenip "‹ Liste" odağı `replaceState` ile
  düşürünce liste işaretsiz girdide açık kalır. Dialog'u kapatmanın "Devam et" olması ayrıca (yukarıda).
- **Antrenmanı değiştir:** `restartWith` korkuluğu sıfırlar (tek sıfırlama); yeni antrenmanın açılış kuralı yeniden kurar. Sheet
  meşgulken ✕ gizli (`showCloseButton={!busy}`; Esc, sürükleme ve Vazgeç zaten reddediliyordu). **Kabul edilen
  sınır:** eski antrenmanın işaretsiz ve `?liste=1` girdileri geçmişte altta kalır; geri tuşuyla oraya inilirse ekran
  telefondaki (yeni) antrenmanı gösterir: eski liste girdisi liste; eski işaretsiz girdi yalnız aynı bağlanmada (ekran
  kapanmadan) "Ara verilsin mi?" der. "Ara ver"den sonra Bugün'de geri eski `L`'ye inilirse ekran korkuluksuz yeniden
  bağlanır (adres işaretli: açılış kuralı itmez); bir geri daha eski `B`'de listeyi sormadan gösterir.
- **Chrome'un geçmiş müdahalesi** (açılış effect'inin yorumunda): kullanıcı etkileşimi olmadan itilen girdiler tarayıcının geri
  tuşunda atlanabilir. Yalnız yenilemede değil, her sert yüklemede (işaretsiz adresin yenilenmesi, yer imi, yeni sekme, ana
  ekran kısayolu, bildirim) açılış kuralı sayfa dokunuş almadan iter; geri tuşu liste ve işaretsiz girdiyi atlayıp çıkabilir.
  Bugün'den dokunuşla gelmek (yumuşak geçiş) de yetmeyebilir: dokunuşun etkileşimini Next'in `/me/antrenman` için yaptığı
  `pushState` harcayabilir, açılış kuralının itmeleri o zaman yine atlanabilir. Doğrulanmadı: gerçek geri tuşu/hareketiyle
  denenmeli (Puppeteer `goBack`, CDP ve `history.back()` müdahaleyi atlar).
- **Yenileme:** sayfa liste ya da odak adresiyle yenilenince korkuluk kurulmaz. Altındaki girdi eski belgenin: geri tuşu onu
  tam yükler; işaretsiz girdiyse açılış kuralı orada yeniden çalışır (odakla açılır, korkuluk kurulur), yani "doğrudan
  çıkmak" yerine antrenman yeniden açılabilir. Sonraki geri tuşları yine sorar.
- **Geçmiş** (B: işaretsiz girdi, L: `?liste=1`, F: `?liste=1&hareket=…`; köşeli parantez: bulunulan girdi):
  - Taze açılış (Bugün'den): `B, L, [F]`; korkuluk kurulu. Hepsi bitmişse ya da `?bitir=1`: `B, [L]`.
  - Odaktan geri: `B, [L], F` (liste).
  - Listeden geri: `[B], L, F` → "Ara verilsin mi?". **Devam et:** `B, [L′]` (ileri geçmiş düşer; ikinci geri yine sorar).
    **Ara ver:** `[/me], L, F` (B'nin yerine Bugün).
  - ⋯ "Ara ver" listeden, korkuluk kurulu: `B, [L], F` → bir geri `[B], L, F` (dialog açılmaz) → `[/me], L, F`. Bugün'de geri
    B'nin altındakine (genellikle Bugün).
  - ⋯ "Ara ver" odaktan, korkuluk kurulu: `B, L, [F]` → iki geri `[B], L, F` → `[/me], L, F` (aynı son).
  - ⋯ "Ara ver" korkuluksuz (sayfa `L` ya da `F` adresiyle yüklendi; `X`: altındaki, bu belgenin olmayan girdi): geri
    gidilmez, bulunulan girdi değişir. Listeden `X, [/me]` (yüklendikten sonra odak açılıp listeye dönüldüyse `X, [/me], F`);
    odaktan `X, [/me]` (`F` yüklenen girdiyse) ya da `X, L, [/me]` (`F` listeden itildiyse). Bugün'de geri `L`'ye ya da
    `X`'e iner ve antrenman yeniden açılabilir (`X` işaretsizse açılış kuralıyla); kabul edilen sınır (yenileme maddesi).
  - İşaretsiz girdide satıra dokunmak (dialog'u atlayan toast ya da korkuluksuz liste): `B, L′, [F′]`; "‹ Liste" `L′`'ye.
  - Antrenmanı değiştir (odaktan): `B, L, [B₂]` (F'nin yerine yeni gün) → açılış: `B, L, B₂, L₂, [F₂]`; geri: `L₂`, sonra
    `B₂`'de soru. ⋯ "Ara ver": `B, L, [/me], …`; Bugün'de geri eski `L`'ye iner, ekran korkuluksuz bağlanır; bir geri daha
    eski `B`'de liste sorulmadan görünür (yukarıdaki kabul edilen sınır).
- **İnceleme bulguları (küçük):** "Bu hareketi atla"nın toast'ındaki "Geri al" bitiş (ya da iptal, değiştirme) gönderilirken
  hiçbir şey yapmaz (`finishingRef`; yoksa meşgul bitiş sorusunu kapatır, belgeyi yolda değiştirirdi).

---

### Task 10: Temizlik ve belgeler

**Files:** Delete `src/app/me/antrenman/flow-sheets.tsx`'in `FlowSheet`/`DragFlowRow` parçası (dosyada kalan
`SwapSheet`, `AddExerciseSheet` ayrı dosyaya: `swap-sheet.tsx`, `add-exercise-sheet.tsx`) · Modify
`src/lib/workout-flow.ts`, `src/lib/workout-cursor.ts`, testler, `docs/design/antrenman-ekrani.md`, `docs/SPEC.md`

- Kullanılmayanlar kalkar: `doNowAt` ve `doNow` (çağıran kalmadıysa; `grep`), `reorderAt`, `skipAt` ve
  `skipMessage`'ın "sona alındı" dalı (çağıran kalmadıysa), `FlowState`'in `'moved'` durumu ve `flowView`
  (çağıran kalmadıysa `listView` içine alınır), testleri. `FlowItem` tipi kalır (`ListItem` ondan türer,
  `done-panel.tsx` kullanır). `demo-history.ts`, `session-finish.ts`, `today-workout.tsx`, `program-feedback.ts`
  (`skip.moved` okur) çağrıları korunur (`grep -rn` ile denetlenir); `skip.moved`'un "bilerek geçildi" anlamı
  `dropWithUndo` ile de aynı kalmalı (uygulayıcı `dropUnit`'in yazdığını doğrular).
- `antrenman-ekrani.md`: §2.4 "⋮ menüsü yok" → odakta ⋯ (Muadil seç, Bu hareketi atla); §2.6 akış sheet'i →
  liste ana ekran, "Şimdi yap" yerine odak (sıra değişmez), "Sırayı değiştir" kipi; §1 akış çizimi; §4.4
  devam kuralı (ekran şu anki hareketin odağıyla açılır: yarım bırakılan ya da sıradaki; liste altında). Yalnız
  değişen cümleler.
- `SPEC.md` §6 danışan kapsamı: antrenman ekranı "liste + odak"; "üst çubukta Bugün'e dönüş" → ⋯ "Ara ver".

typecheck, lint, test · Commit: `refactor(workout): drop the flow sheet and do-now`

**Uygulamada (10; 75968c0, 1bb2144 ve incelemenin düzeltmeleri):**
- **Sheet'ler:** `flow-sheets.tsx` silindi; `SwapSheet` `swap-sheet.tsx`'e, `AddExerciseSheet` `add-exercise-sheet.tsx`'e taşındı.
  `SwapSheet`'in boş durumu "Alet doluysa hareketi geçebilirsin; sona alınır." diyordu (kalkan "sona al"); şimdi "Alet
  doluysa ⋯ menüsünden hareketi atlayabilirsin."
- **Planın dışında da kalkanlar:** `skipUnit` (yalnız `skipAt` çağırıyordu) ve `CursorMember.moved` (yalnız `skipUnit` ve
  `flowView` okuyordu); `FlowState` tümüyle (`flowView` `listView`'a alınınca üreten kalmadı). `FlowItem` kaldı, durumsuz:
  `ListItem` = `FlowItem` + durum ve son ağırlık. `AfterLog.nextKey` kalktı (ekran sıradakini `nextUnitAfter` ile
  seçer). `today-workout.tsx` artık yalnız `WorkoutProgramProvider`'ı yeniden verir; `WORKOUT_KEY` ve
  `WORKOUT_OVERVIEW_KEY` doğrudan `workout-overview.tsx`'ten. `skip.moved`'u `dropUnit` yazmaya devam eder ("bilerek
  geçildi"; `program-feedback.ts` okur).
- **`DonePanel` kalktı** (inceleme): olağan akışta çizilmiyordu (son setten sonra ekran biten hareketin odağında kalır,
  odaksız liste çizilir). Tek yolu, planda satırı olmayan birimin odağıydı (plan dışı kayıt: başka cihazda plan verisi
  gelmeden eklenen hareket, PT'nin programdan kaldırdığı satırın kaydı) ve orada yanlışlıkla "Bütün hareketler bitti"
  diyordu. Kural `workout-flow.ts`'te, testli: birim yalnız üyelerinden birinin günün planında satırı varsa açılır
  (`hasPlanRow`). Plan bloklarının birimlerinde (biten, gruplu, üyesi bitmiş, muadilli de) her üyenin satırı vardır;
  yalnız `workoutUnits`'in plan dışı birimlerinde yok. `validFocus` onu geçersiz sayar (ekran listeyi çizer, geçersiz
  odak effect'i adresi düşürür); `listView`'ın "şu an"ı, `nextUnitAfter` ve `firstSkippedKey` onu seçmez ("Devam et",
  açılış kuralı ve kendiliğinden geçiş açılamayan birimi açmaya çalışmasın); listede satırı setleriyle durur, dokunmak
  bir şey yapmaz (`onOpenUnit` odak itmez). Kalan yalnız plan dışı kayıtsa alt çubukta "Antrenmanı bitir".

---

## C · Bugün

### Task 11: Haftanın planı (`weekPlan`)

**Files:** Modify `src/lib/workout-plan.ts`, `src/lib/training-days.ts` · Test `src/lib/training-days.test.ts`,
`src/lib/workout-plan.test.ts`

Hafta şeridi her günün antrenmanını ve durumunu söyler (yapıldı · kaçtı · sırada). Program modeli henüz dönüş
sırası: yapılan günün adı oturumdan, gelecek günlerinki dönüşten **tahmin**.

**Step 1: Test** (`training-days.test.ts`; 26 Ekim 2026 pazartesi)

```ts
describe('hafta planı', () => {
  const rotation = { names: ['Gün A', 'Gün B', 'Gün C'], next: 1 };

  test('yapılanın adı, sıradaki ve dönüşe göre sonraki; seçili olmayan gün dinlenme', () => {
    const days = weekPlan({ today: '2026-10-28', weekdays: [1, 3, 5], sessions: [{ date: '2026-10-26', dayName: 'Gün A' }], since: null, rotation });
    assert.deepEqual(
      days.map((day) => [day.date, day.state, day.label]),
      [
        ['2026-10-26', 'done', 'Gün A'],
        ['2026-10-27', 'rest', null],
        ['2026-10-28', 'next', 'Gün B'],
        ['2026-10-29', 'rest', null],
        ['2026-10-30', 'planned', 'Gün C'],
        ['2026-10-31', 'rest', null],
        ['2026-11-01', 'rest', null],
      ],
    );
  });

  test('kaçan gün adsız; seçili olmayan günde yapılan da "yapıldı"; pencere öncesi kaçmış sayılmaz', () => {
    const days = weekPlan({
      today: '2026-10-30',
      weekdays: [1, 3, 5],
      sessions: [{ date: '2026-10-26', dayName: 'Gün A' }, { date: '2026-10-27', dayName: 'Gün B' }],
      since: null,
      rotation: { names: ['Gün A', 'Gün B', 'Gün C'], next: 2 },
    });
    assert.deepEqual(days.slice(0, 5).map((day) => [day.state, day.label]), [
      ['done', 'Gün A'],
      ['done', 'Gün B'],
      ['missed', null],
      ['rest', null],
      ['next', 'Gün C'],
    ]);
    const fresh = weekPlan({ today: '2026-10-30', weekdays: [1, 3, 5], sessions: [], since: '2026-10-28', rotation });
    assert.deepEqual(fresh.slice(0, 3).map((day) => day.state), ['rest', 'rest', 'rest']);
  });

  test('bugünkü antrenman yapıldıysa sıradaki sonraki seçili gün', () => {
    const days = weekPlan({ today: '2026-10-26', weekdays: [1, 3], sessions: [{ date: '2026-10-26', dayName: 'Gün A' }], since: null, rotation });
    assert.deepEqual(days.slice(0, 3).map((day) => [day.state, day.label]), [['done', 'Gün A'], ['rest', null], ['next', 'Gün B']]);
  });

  test('kısa ad: "Gün A" → "A", ötekinde ilk sözcük', () => {
    assert.equal(dayShortName('Gün A'), 'A');
    assert.equal(dayShortName('Üst vücut'), 'Üst');
    assert.equal(dayShortName('Bacak'), 'Bacak');
  });
});
```

`workout-plan.test.ts`: `weekOf` bu haftanın bitmiş oturumlarını `sessions: { date, dayName }[]` olarak döner
(aynı gün iki oturumda ikisi de; sıra `(date, startedAt)`, böylece "aynı gün sonuncusu" belirlenimli);
`afterFinish` bitiş anında `{ date: doc.date, dayName: doc.program?.dayName ?? 'Antrenman' }` ekler (gün bu
haftadaysa, `counted`'dan bağımsız). Var olan beklentiler güncellenir: ~276'daki `week` beklentisine
`sessions: [{ date: '2026-09-22', dayName: 'Gün A' }, { date: '2026-09-26', dayName: 'Gün A' }]` (uygulayıcı
fikstürün gerçek adlarını doğrular); ~323'teki beklentiye `sessions: [{ date: '2026-09-25', dayName: 'Antrenman' }]`;
~325'te yalnız `done` ve `days` karşılaştırılır. ~314'teki `afterFinish` fikstürü yeni alanla derlenir (alan
isteğe bağlı olduğu için değişiklik gerekmeyebilir).

**Step 2:** FAIL.

**Step 3: Uygula**

- `WeekCount`'a isteğe bağlı `sessions?: { date: string; dayName: string }[]` (`weekOf` index satırlarından:
  `finishedAt` olan, bu hafta; `dayName` satırın alanı, yoksa `'Antrenman'`; sıra `(date, startedAt)`).
  `afterFinish`'in `doc` tipi `Pick<SessionDoc, 'id' | 'date' | 'waterTaps'> & Partial<Pick<SessionDoc, 'program'>>`
  olur; gün bu haftadaysa (`mondayOf(doc.date) === data.week.start && doc.date <= data.today`) `[...(data.week.sessions
  ?? []), { date, dayName }]`. Okuyan her yer `week.sessions ?? []` der (bellekteki eski yanıt).
- `training-days.ts`:

```ts
export type WeekPlanState = 'done' | 'missed' | 'next' | 'planned' | 'rest';
export type WeekPlanDay = StripDay & { state: WeekPlanState; label: string | null };

/**
 * Bugün'ün hafta şeridi (Faz 2): her gün yapıldı (oturumun adı; aynı gün birden çoksa sonuncusu) · kaçtı ·
 * sırada (bugün dahil ilk yapılmamış seçili gün) · planlı · dinlenme. Program modeli dönüş sırası olduğundan
 * sıradaki ve sonraki seçili günlerin adı dönüşten tahmindir (`rotation.next`'ten başlayıp sarar); Faz 3'te
 * gün ↔ antrenman eşlemesi gelince bu tahmin kalkar.
 */
export function weekPlan(input: {
  today: string;
  weekdays: readonly number[];
  /** Yapılan günler (`week.days`); adlar `sessions`'tan. Ad yoksa gün yine "yapıldı". */
  doneDays?: Iterable<string>;
  sessions: readonly { date: string; dayName: string }[];
  since?: string | null | undefined;
  rotation: { names: readonly string[]; next: number };
}): WeekPlanDay[] {
  const done = new Map(input.sessions.map((session) => [session.date, session.dayName]));
  const doneDays = new Set([...(input.doneDays ?? []), ...done.keys()]);
  const strip = weekStrip({ today: input.today, weekdays: input.weekdays, doneDays, since: input.since });
  const { names } = input.rotation;
  let step = 0;
  return strip.map((day): WeekPlanDay => {
    if (day.done) return { ...day, state: 'done', label: done.get(day.date) ?? null };
    if (day.missed) return { ...day, state: 'missed', label: null };
    if (!day.selected || day.date < input.today) return { ...day, state: 'rest', label: null };
    const label = names.length > 0 ? (names[(input.rotation.next + step) % names.length] ?? null) : null;
    const state: WeekPlanState = step === 0 ? 'next' : 'planned';
    step += 1;
    return { ...day, state, label };
  });
}

/** Şeritteki kısa ad: "Gün A" → "A"; öteki adlarda ilk sözcük. */
export function dayShortName(name: string): string {
  const trimmed = name.trim();
  const letter = trimmed.match(/^gün\s+(\S+)$/iu)?.[1];
  return letter ?? trimmed.split(/\s+/u)[0] ?? trimmed;
}
```

**Step 4:** PASS. **Step 5:** `npm test`, typecheck, lint · Commit: `feat(today): week plan with day names`

---

### Task 12: Hafta şeridinde antrenman ve durum

**Files:** Modify `src/app/me/training-week.tsx` (`WeekStrip`)

- `weekPlan({ today, weekdays: schedule.weekdays, doneDays: data.week.days, sessions: data.week.sessions ?? [], since: schedule.since,
  rotation: { names: data.program.days.map((d) => d.name), next: data.program.nextDayId'nin sırası (yoksa 0) } })`.
  `data.program` yoksa bugünkü `weekStrip` davranışı.
- Her sütun: gün kısaltması, halka (bugünkü görsel kurallar: yapıldı dolu ✓, sırada kalın halka + `font-semibold`,
  planlı ince halka, kaçtı soluk), altında kısa ad (`dayShortName`, `text-[0.6875rem]`, `truncate`, sütun
  genişliğinde); kaçan günde "kaçtı". sr-only: "Çarşamba, bugün, sırada: Gün B" / "Pazartesi, yapıldı: Gün A" /
  "Salı, dinlenme".
- Şeridin altında bir satır: sıradaki varsa "Sırada: <bugün|yarın|Cuma> · <ad>" (`relativeDayText`; bugünse "bugün").
- "Günlerini değiştir" aynen. Yükseklik değişirse iskelet (`h-[6.25rem]`) yeni yüksekliğe uyar.

typecheck, lint, test · Commit: `feat(today): week strip shows each day's workout`

**Controller doğrulaması (375 px):** şeritte yapılan günde ad, sıradakinde kalın halka ve ad, kaçanda "kaçtı";
yedi sütun taşmıyor.

---

### Task 13: Bugün kartı: başlık, kısıt notu, ilk 3 hareket

**Files:** Modify `src/lib/client-care.ts`, `src/lib/constraint-filter.ts`, `src/lib/template-plan.ts`,
`src/lib/training-days.ts`, `src/app/me/(sekmeler)/page.tsx`, `src/app/me/program-card.tsx`,
`src/app/me/client-day-plan.tsx` · Test `src/lib/constraint-filter.test.ts`, `src/lib/template-plan.test.ts`,
`src/lib/training-days.test.ts`

**Step 1: Testler**

```ts
// training-days.test.ts — 26 Ekim 2026 pazartesi
test('Bugün kartının başlığı: antrenmanın günü ve adı', () => {
  assert.equal(todayCardTitle({ today: '2026-10-26', weekdays: [1, 3], doneToday: false, dayName: 'Gün A' }), 'Pazartesi · Gün A');
  assert.equal(todayCardTitle({ today: '2026-10-26', weekdays: [1, 3], doneToday: true, dayName: 'Gün B' }), 'Çarşamba · Gün B');
  assert.equal(todayCardTitle({ today: '2026-10-27', weekdays: [1, 3], doneToday: false, dayName: 'Gün B' }), 'Çarşamba · Gün B');
  assert.equal(todayCardTitle({ today: '2026-10-26', weekdays: [], doneToday: false, dayName: 'Gün A' }), 'Gün A');
});

// constraint-filter.test.ts (dosyadaki `care` adı başka bir şey: `CareInput`; burada ayrı bir `RowCare`)
test('Bugün önizlemesinin kısıt satırı', () => {
  const rowCare: RowCare = { kind: 'note', label: 'Sol diz', region: 'knee', side: 'left' };
  assert.equal(careLine(rowCare, 'Back Squat'), 'Sol diz için dikkat: Back Squat');
  assert.equal(careLine({ ...rowCare, kind: 'avoid' }, 'Back Squat'), 'Sol diz için değiştir: Back Squat');
});

// template-plan.test.ts — dosyadaki `row(exerciseId)` ve `block(kind, rows, fields)` yardımcılarıyla
test('önizleme: ilk 3 hareketi dolduran bloklar, kalanı ayrı', () => {
  const blocks = [
    block('single', [row('bench')], { id: 'b1' }),
    block('superset', [row('a'), row('b')], { id: 'b2' }),
    block('single', [row('c')], { id: 'b3' }),
    block('single', [row('d')], { id: 'b4' }),
  ];
  const { head, rest, restRows } = previewBlocks(blocks, 3);
  assert.deepEqual(head.map((block) => block.id), ['b1', 'b2']);
  assert.deepEqual(rest.map((block) => block.id), ['b3', 'b4']);
  assert.equal(restRows, 2);
});
```

**Step 2:** FAIL. **Step 3: Uygula**

- `training-days.ts`:

```ts
/** Bugün kartının başlığı (Faz 2): sıradaki antrenmanın günü ve adı ("Pazartesi · Gün A"); gün seçilmemişse ad. */
export function todayCardTitle(input: { today: string; weekdays: readonly number[]; doneToday: boolean; dayName: string }): string {
  const date = nextTrainingDate(input.today, input.weekdays, { includeToday: !input.doneToday });
  return date ? `${WEEKDAY_NAMES[isoWeekdayOf(date)]} · ${input.dayName}` : input.dayName;
}
```

- `constraint-filter.ts`:

```ts
/** Bugün önizlemesinde hareketin kısıt satırı: "Sol diz için dikkat: Back Squat"; önerilmeyende "değiştir". */
export function careLine(care: RowCare, title: string): string {
  return `${care.label} için ${care.kind === 'avoid' ? 'değiştir' : 'dikkat'}: ${title}`;
}
```

- `template-plan.ts`:

```ts
/** Bugün önizlemesi: en az `limit` hareketi dolduran ilk bloklar (grup bölünmez) ve kalanlar. */
export function previewBlocks<T extends { rows: readonly unknown[] }>(blocks: readonly T[], limit: number): { head: T[]; rest: T[]; restRows: number } {
  const head: T[] = [];
  let rows = 0;
  for (const block of blocks) {
    if (rows >= limit) break;
    head.push(block);
    rows += block.rows.length;
  }
  const rest = blocks.slice(head.length);
  return { head, rest, restRows: rest.reduce((sum, block) => sum + block.rows.length, 0) };
}
```

- `client-care.ts`: `loadCareStamp`'in yerine `loadTodayCare(client, today): Promise<{ stamp: string; input:
  CareInput | null }>` — sağlık dosyası **bir kez** okunur (bugünkü `loadCareStamp` ile aynı onay kuralı);
  `stamp` bugünküyle birebir aynı hesap (`careStampOf`), `input` `careInputOf(record, { today, painConsent })`.
  `loadCareStamp`'in öteki çağıranı yoksa kalkar.
- `page.tsx`: `todayIn(config.timeZone)` ile `loadTodayCare`; `ProgramCard`'a `careStamp` yerine `care`.
- `program-card.tsx` (ana kart):
  - Başlık `todayCardTitle({ today, weekdays: effectiveSchedule(program).weekdays (iki programda da),
    doneToday: bugün bitmiş oturum var mı (`overview.sessions`), dayName: day.name })`. Dinlenme gününde başlık
    sıradaki antrenman gününü söyler ("Çarşamba · Gün B") ve "Antrenmana başla" yine bugün başlatır; Faz 3'e
    (gün ↔ antrenman eşlemesi) kadar bu kabul edilir.
  - `DayStatus` başlığın üstünden kalkar (başlıkla aynı şeyi söylüyordu); yalnız dinlenme ya da yapıldı
    durumunda kısa tek satır: "Bugün dinlenme günün" / "Bugünkü antrenmanını yaptın".
  - Başlık altı tek satır: "N hareket · ≈ N dk" (set sayısı kalkar; evreli programda evre satırı kalır).
  - **Antrenmana başla** ve **Başka gün seç** yerinde (kaydırmadan görünür; Faz 0 kuralı: 375×812'de
    düğmenin alt kenarı 700 px'ten yukarıda).
  - Kısıt satırları (varsa): günün bütün satırları için `rowCareOf(evaluateCare(exercise, care.input),
    care.input)` → `careLine`; `Bandaids` ikonu, en çok 2 satır + "+n hareket daha".
  - Önizleme: önce kütüphanede olmayan satırlar ayıklanır (`ClientDayPlan` onları zaten çizmiyor; yoksa "ilk 3"
    üçten az görünür), sonra `previewBlocks(blocks, 3)` → `ClientDayPlan` yalnız `head` ile; kısıtlı satırın yanında
    `Bandaids` (sr-only "kısıt notu var"). `rest` varsa yerel `<details>`: özet "Tümünü gör (n hareket daha)"
    (`min-h-11`, odak halkası, dönen ok), içinde `rest`. Numaralar bütün günden (`ClientDayPlan`'a `labels`
    dışarıdan ya da `allBlocks` verilir; "4. hareket" önizlemede de 4).
  - Ardından hafta şeridi (12. görev).
  - "Sonraki günler" kartı aynen.

typecheck, lint, test · Commit: `feat(today): title, care notes and a three-exercise preview`

**Controller doğrulaması (375 px):** başlık "Pazartesi · Gün A" biçiminde; "Antrenmana başla" ilk ekranda;
kısıtlı test danışanında "… için dikkat: …" satırı; ilk 3 hareket ve "Tümünü gör"; açınca kalan hareketler
doğru numarayla.

---

### Task 14: "Devam et" kartında hareket listesi

**Files:** Modify `src/app/me/today-workout.tsx` (`ResumeCard`)

- Plan varsa (`progress.plan`) `listView(plan, doc)`: her birim tek satır — durum ikonu (6b. görevle aynı
  ikonlar), ad (grupta "A + B"), "2/4 set"; "şu an" satırı `font-semibold`. 8'den fazla birimde ilk 8 + "+n".
  Plan yoksa bugünkü sayı satırı.
- Başlık "Yarım kalan antrenman · <gün adı>"; birincil "Devam et: <şu anki hareket>" (`listView().current`'in adı;
  bağlantı bugünkü gibi `/me/antrenman` — ekran 6b'nin açılış kuralıyla o hareketin odağında açılır, liste
  altında), ikincil "Antrenmanı bitir".
- Kartın altında hafta şeridi de görünür (bugün `ResumeCard` şeridi gizliyor): `WeekStrip` istemci bileşeni,
  `ResumeCard`'ın altına eklenir.

typecheck, lint, test · Commit: `feat(today): resume card lists the exercises`

---

## D · Kapanış

### Task 15: Belgeler ve son doğrulama

**Files:** Modify `docs/SPEC.md` (§6 danışan kapsamı, Bugün), `docs/design/antrenman-ekrani.md` §0 Bugün satırı
ve §2.1, `README.md` (danışan özellikleri değiştiyse)

- Bugün: başlık, kısıt notu, ilk 3 + "Tümünü gör", hafta şeridinde gün adları (dönüşten tahmin; Faz 3'te
  eşleme), "Devam et" kartında liste. Yalnız değişen cümleler.
- `npm test`, typecheck, lint, `npm run build` (yönetici, arka planda).
- Bütün Faz 2 aralığının son incelemesi; yöneticinin 375 px tarayıcı turu (Bugün → başla → odak → liste → sıra
  değiştir → atla → geri al → biten hareketi düzelt → dinlenmede liste → geri tuşu → ara ver → Bugün'de "Devam
  et" listesi → devam → yarım bırakılan hareketin odağı; çevrimdışı tekrar); ekran görüntüleri kullanıcıya. Turdan sonra localStorage'da yalnız
  `pulsecoach.session.c_zmrbywaz` ve `pulsecoach.workout.c_zmrbywaz`, değerleri günlüğe yazıldıktan sonra silinir.
