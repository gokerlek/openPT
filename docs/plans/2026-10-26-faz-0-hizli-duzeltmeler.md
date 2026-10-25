# Faz 0 · Hızlı düzeltmeler — uygulama planı

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Kullanılabilirlik incelemesinde bulunan, küçük ve risksiz 8 sorunu düzeltmek (tasarım:
`docs/plans/2026-10-26-kullanilabilirlik-yeniden-duzen-design.md`, "Faz 0").

**Architecture:** Saf mantık değişiklikleri `src/lib`'de testle (TDD) yapılır; bileşen değişiklikleri küçük ve yerinde
kalır, tarayıcıda 375 px ve masaüstünde doğrulanır. Veri biçimi değişmez; eski index satırları gösterimde korunur.

**Tech Stack:** Next.js 16 (App Router), React, TypeScript, Node'un yerleşik test aracı
(`node --test --experimental-strip-types`), shadcn/Base UI bileşenleri.

**Kurallar**
- Testler `src/lib/*.test.ts`; içe aktarmalar göreli ve `.ts` uzantılı (`'./notices.ts'`), `@/` takma adı testte çalışmaz.
- Tek test dosyası: `node --test --experimental-strip-types --no-warnings src/lib/<dosya>.test.ts`
- Tarayıcı kontrolü yalnız test danışanıyla: `c_zmrbywaz` (Test Gelişim). **Hiçbir şey kaydedilmez**; gerçek danışan
  (`c_uc942qx6`) verisine dokunulmaz. Geliştirme girişi: `/api/dev/login` (PT), `/api/dev/login?role=client&client=c_zmrbywaz`.
- Dev sunucusu `.claude/launch.json` → `pulsecoach` (preview_start), Bash ile değil.
- Yorum dili ve yoğunluğu çevredeki kodla aynı (Türkçe, kısa).

---

### Task 1: Genel bakış bildirimlerinde pencere sayfa açılırken uygulanır

Önbellekteki danışan özeti (`notices-store.ts`, `unstable_cache`) süresi dolunca bile önce eski hâlini veriyor; ilk
açılışta bir ay önceki bildirimler "8 yeni" diye görünüyordu. Pencere ve okunmamış sayısı `noticeFeed`'de, sayfanın
`now`'ıyla hesaplanır; bekleyen öneri pencere dışında da kalır ve etiketi "Bekleyen öneri" olur.

**Files:**
- Modify: `src/lib/notices.ts` (`PT_NOTICE_LABELS`, `noticeFeed`)
- Modify: `src/app/dashboard/notices-card.tsx:25`
- Test: `src/lib/notices.test.ts`

**Step 1: Testleri yaz**

`src/lib/notices.test.ts` → `describe('PT bildirimleri: okundu ve Genel bakış listesi', …)` içinde mevcut çağrıyı
değiştir ve yeni testi ekle:

```ts
    const feed = noticeFeed(digests, { now: NOW, limit: 3 });
```

```ts
  test('pencere sayfa açılırken uygulanır: önbellekte kalan eski bildirim düşer, bekleyen öneri kalır', () => {
    const digests: ClientDigest[] = [
      {
        id: 'c_aaaaaaaa',
        name: 'Ayşe',
        notices: [
          { key: 'yeni', kind: 'unfinished', at: ago(1), text: 'yeni', target: 'client' },
          { key: 'eski', kind: 'unfinished', at: ago(20), text: 'eski', target: 'client' },
          { key: 'oneri', kind: 'proposal', at: ago(30), text: 'Öneri: Leg Press 3 → 4 set', target: 'program' },
        ],
      },
    ];
    const feed = noticeFeed(digests, { now: NOW });
    assert.deepEqual(
      feed.items.map((item) => item.key),
      ['yeni', 'oneri'],
    );
    assert.equal(feed.unread, 2, 'pencere dışındaki eski bildirim okunmamış sayılmaz');
  });
```

**Step 2: Testin düştüğünü gör**

Run: `node --test --experimental-strip-types --no-warnings src/lib/notices.test.ts`
Expected: FAIL (`eski` listede; ikinci argüman sayı bekleniyor)

**Step 3: Uygula**

`src/lib/notices.ts`:

```ts
  proposal: 'Bekleyen öneri',
```

```ts
/**
 * Genel bakış'ın "Bildirimler" listesi: bütün danışanların bildirimleri tek listede, en yeniden eskiye,
 * en çok `limit`. Pencere burada, sayfa açılırken uygulanır: danışan özeti önbellekte eski kalabilir
 * (`notices-store.ts`); bekleyen öneri pencere dışında da kalır (PT'nin kararını bekliyor). `unread`:
 * okunmamışların toplamı (listede görünmeyenler dahil); `unreadClients`: "Tümünü okundu say"ın yazacağı danışanlar.
 */
export function noticeFeed(
  digests: readonly ClientDigest[],
  options: { now: Date; limit?: number },
): { items: FeedItem[]; unread: number; unreadClients: string[] } {
  const since = options.now.getTime() - NOTICE_WINDOW_DAYS * DAY_MS;
  const all = digests.flatMap((digest) =>
    digest.notices
      .filter((notice) => notice.kind === 'proposal' || time(notice.at) >= since)
      .map((notice) => ({ ...notice, clientId: digest.id, clientName: digest.name, unread: isUnread(notice, digest.seenAt) })),
  );
  all.sort((a, b) => time(b.at) - time(a.at) || (a.clientId < b.clientId ? -1 : a.clientId > b.clientId ? 1 : 0) || (a.key < b.key ? -1 : 1));
  const unreadClients = [...new Set(all.filter((item) => item.unread).map((item) => item.clientId))].sort();
  return { items: all.slice(0, options.limit ?? NOTICE_FEED_LIMIT), unread: all.filter((item) => item.unread).length, unreadClients };
}
```

`src/app/dashboard/notices-card.tsx:25`:

```ts
  const feed = noticeFeed(overviews, { now: new Date() });
```

**Step 4: Testlerin geçtiğini gör**

Run: `node --test --experimental-strip-types --no-warnings src/lib/notices.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/notices.ts src/lib/notices.test.ts src/app/dashboard/notices-card.tsx
git commit -m "fix(overview): apply the notice window at render time"
```

---

### Task 2: Yarım antrenmanın süresi son setten hesaplanır

Açık kalan yarım antrenman saatler sonra kapanınca süre "11 sa 12 dk" oluyordu. Yarım antrenmanda bitiş, son setten
en çok 10 dk sonradır. Bitmiş (yarım olmayan) antrenman değişmez.

**Files:**
- Modify: `src/lib/session-index.ts:78-84` (`durationOf`)
- Test: `src/lib/session-index.test.ts` (satır 112 civarındaki `durationOf` testinin yanına)
- Test: `src/lib/session-history.test.ts` (beklenen süreler değişir)

**Step 1: Testleri yaz**

`src/lib/session-index.test.ts`, `durationOf` testlerinin yanına:

```ts
  test('yarım antrenman: süre son setten en çok 10 dk sonra biter (uygulama açık kalsa da)', () => {
    const doc = finished('s_aaaaaaaa', 0, {
      finishedAt: at(672),
      entries: [sessionEntry('e_aaaaaa', { sets: [workingSet('st_aaaaaaaa', 3), workingSet('st_bbbbbbbb', 5)] })],
      notices: [{ kind: 'unfinished', at: at(672), done: 2, planned: 9 }],
    });
    assert.equal(durationOf(doc), 15);
  });

  test('bitmiş antrenman bitiş anına göre; yarımda hiç set yoksa da bitiş anı', () => {
    const doc = finished('s_aaaaaaaa', 0, { entries: [sessionEntry('e_aaaaaa', { sets: [workingSet('st_aaaaaaaa', 3)] })] });
    assert.equal(durationOf(doc), 52);
    const empty = finished('s_bbbbbbbb', 0, { notices: [{ kind: 'unfinished', at: at(52), done: 0, planned: 9 }] });
    assert.equal(durationOf(empty), 52);
  });
```

`src/lib/session-history.test.ts`'te yarım `second` antrenmanı (son seti `at(3001)`) artık 11 dk sürer; beklentileri
güncelle:

```ts
      title: 'Gün B · 11 dk',
```

```ts
    assert.equal(historyList(index, new Date(at(4100)), TZ).recent, 'Son 30 gün · 2 antrenman · 1 sa 3 dk · 2 rekor');
```

**Step 2: Düştüğünü gör**

Run: `node --test --experimental-strip-types --no-warnings src/lib/session-index.test.ts src/lib/session-history.test.ts`
Expected: FAIL (672 dk ve 52 dk dönüyor)

**Step 3: Uygula** (`src/lib/session-index.ts`; dosyadaki `time()` yardımcısı kullanılır)

```ts
/** Yarım antrenmanda son setten sonra sayılan pay (dk): kapatılmadan açık kalan antrenman saatler sürmüş görünmesin. */
const UNFINISHED_TAIL_MIN = 10;

/**
 * Süre: danışanın onayladığı (`effort.durationMin`), yoksa başlangıçtan bitişe. Yarım bırakılan antrenmanda bitiş son
 * setten en çok `UNFINISHED_TAIL_MIN` sonradır.
 */
export function durationOf(
  doc: Pick<SessionDoc, 'startedAt' | 'finishedAt' | 'effort'> & Partial<Pick<SessionDoc, 'entries' | 'notices'>>,
): number | undefined {
  if (doc.effort?.durationMin !== undefined) return doc.effort.durationMin;
  if (!doc.finishedAt) return undefined;
  let end = time(doc.finishedAt);
  if (doc.notices?.some((notice) => notice.kind === 'unfinished')) {
    const lastSet = Math.max(0, ...(doc.entries ?? []).flatMap((entry) => entry.sets.map((set) => time(set.at))));
    if (lastSet > 0) end = Math.min(end, lastSet + UNFINISHED_TAIL_MIN * 60_000);
  }
  const minutes = Math.round((end - time(doc.startedAt)) / 60_000);
  return Math.min(24 * 60, Math.max(0, minutes));
}
```

**Step 4: Geçtiğini gör**

Run: `node --test --experimental-strip-types --no-warnings src/lib/session-index.test.ts src/lib/session-history.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/session-index.ts src/lib/session-index.test.ts src/lib/session-history.test.ts
git commit -m "fix(sessions): end unfinished workouts at the last set"
```

---

### Task 3: Eski kayıtlarda şişmiş yarım süre gösterilmez

Task 2 yalnız yeni index satırlarını düzeltir; danışanların `sessions-index.json`'ındaki eski satırlarda "672 dk" yazılı
kalır. Gösterimde, 180 dk'dan uzun yarım süre yazılmaz ve "Son 30 gün" toplamına girmez.

**Files:**
- Modify: `src/lib/session-history.ts` (`rowOf`, `historyList`)
- Test: `src/lib/session-history.test.ts`

**Step 1: Testi yaz** (`describe('geçmiş listesi', …)` içine)

```ts
  test('eski kayıtta şişmiş yarım süre gösterilmez ve özete girmez', () => {
    const stale = { ...indexRowOf(second, '1'.repeat(40)), durationMin: 672 };
    const staleIndex = upsertIndexRow(upsertIndexRow(emptySessionIndex(), indexRowOf(first, '0'.repeat(40))), stale);
    const list = historyList(staleIndex, new Date(at(4100)), TZ);
    assert.equal(list.months[0]?.rows[0]?.title, 'Gün B');
    assert.match(list.recent ?? '', /^Son 30 gün · 2 antrenman · 52 dk/);
  });
```

**Step 2: Düştüğünü gör**

Run: `node --test --experimental-strip-types --no-warnings src/lib/session-history.test.ts`
Expected: FAIL (`Gün B · 11 sa 12 dk`)

**Step 3: Uygula** (`src/lib/session-history.ts`)

```ts
/** Eski index satırlarında yarım antrenmanın süresi şişik kalmış olabilir ("11 sa 12 dk"); bundan uzunu gösterilmez. */
const UNFINISHED_MAX_MIN = 180;

function shownMinutes(row: Pick<SessionIndexRow, 'durationMin' | 'unfinished'>): number | undefined {
  if (row.durationMin === undefined) return undefined;
  return row.unfinished && row.durationMin > UNFINISHED_MAX_MIN ? undefined : row.durationMin;
}
```

`rowOf` içinde:

```ts
  const minutes = shownMinutes(row);
  const title = [day, ...(minutes !== undefined ? [minutesText(minutes)] : [])].join(' · ');
```

`historyList` içinde:

```ts
  const minutes = recent.reduce((sum, row) => sum + (shownMinutes(row) ?? 0), 0);
```

**Step 4: Geçtiğini gör** — aynı komut, Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/session-history.ts src/lib/session-history.test.ts
git commit -m "fix(history): hide inflated durations of old unfinished workouts"
```

---

### Task 4: Antrenman satırlarında ay

PT'nin danışan sayfasındaki "Antrenmanlar" kartında aylar gruplanmıyor; "23 Cum · 27 Paz" yan yana ve arada bir ay var.
Satıra kısa ay eklenir ("Eki"); PT'nin satır bileşeni ay ve haftanın gününü birlikte gösterir.

**Files:**
- Modify: `src/lib/session-history.ts` (`HistoryRow`, `rowOf`)
- Modify: `src/app/dashboard/clients/[id]/sessions/session-list.tsx:46-57` (`SessionRow`)
- Test: `src/lib/session-history.test.ts`

**Step 1: Testleri güncelle**

İlk listedeki `deepEqual` beklentisine `month` ekle (28 Eylül):

```ts
      dayOfMonth: '28',
      month: 'Eyl',
      weekday: 'Pzt',
```

`"Daha fazla göster"` testindeki satır kalıbına da ekle (tip uyumu):

```ts
      rows: ids.map((id) => ({ id, dayOfMonth: '1', month: 'Eyl', weekday: 'Pzt', title: 'Gün A', meta: '', otherDay: false, unfinished: false, prs: 0 })),
```

**Step 2: Düştüğünü gör**

Run: `node --test --experimental-strip-types --no-warnings src/lib/session-history.test.ts`
Expected: FAIL (`month` yok)

**Step 3: Uygula**

`src/lib/session-history.ts`:

```ts
  /** Takvim günü: "26", "Eyl" ve "Cmt". */
  dayOfMonth: string;
  month: string;
  weekday: string;
```

```ts
const monthShortFormat = new Intl.DateTimeFormat('tr-TR', { month: 'short', timeZone: 'UTC' });
```

`rowOf` dönüşüne: `month: monthShortFormat.format(date),`

`SessionRow` (`session-list.tsx`):

```tsx
      <ItemMedia className="w-12 flex-col gap-0 leading-tight" aria-hidden>
        <span className="font-heading text-lg font-semibold tabular-nums">{row.dayOfMonth}</span>
        <span className="text-xs text-muted-foreground">
          {row.month} {row.weekday}
        </span>
      </ItemMedia>
```

ve ekran okuyucu metni:

```tsx
          <span className="sr-only">
            {row.dayOfMonth} {row.month} {row.weekday} ·{' '}
          </span>
```

**Step 4: Geçtiğini gör** — aynı komut, Expected: PASS; ayrıca `npm run typecheck` (danışanın `history-list.tsx`'i
`month`'u kullanmaz, tip yine uyar).

**Step 5: Commit**

```bash
git add src/lib/session-history.ts src/lib/session-history.test.ts "src/app/dashboard/clients/[id]/sessions/session-list.tsx"
git commit -m "feat(sessions): show the month on workout rows"
```

---

### Task 5: "Son antrenman" her yerde aynı kural

PT'nin Program sekmesi "Son antrenman"ı `rotation.lastCompletedAt`'ten okuyordu; yarım antrenman orada sayılmıyor,
danışanın ekranı ise "son: 23 Eki" diyordu. Ortak kural: bitmiş son antrenman, yarım dahil.

**Files:**
- Modify: `src/lib/session-history.ts` (yeni `lastWorkout`)
- Modify: `src/app/dashboard/clients/[id]/program/page.tsx` (Döngü kartındaki "Son antrenman" satırı, ~471)
- Test: `src/lib/session-history.test.ts`

**Step 1: Testi yaz** (`describe('geçmiş listesi', …)` içine; `lastWorkout`'u import listesine ekle)

```ts
  test('son antrenman: bitmişlerin en yenisi, yarım dahil; kayıt yoksa yok', () => {
    assert.equal(lastWorkout(index)?.id, 's_bbbbbbbb');
    assert.equal(lastWorkout(emptySessionIndex()), null);
    assert.equal(lastWorkout(null), null);
  });
```

**Step 2: Düştüğünü gör** — Expected: FAIL (`lastWorkout` yok)

**Step 3: Uygula**

`src/lib/session-history.ts`:

```ts
/** "Son antrenman" (Program sekmesi ve danışan ekranı aynı kural): bitmişlerin en yenisi, yarım dahil. */
export function lastWorkout(index: SessionIndex | null): SessionIndexRow | null {
  const rows = (index?.items ?? []).filter((row) => row.finishedAt);
  return rows.sort((a, b) => time(b.startedAt ?? b.date) - time(a.startedAt ?? a.date))[0] ?? null;
}
```

`program/page.tsx`: `import { lastWorkout } from '@/lib/session-history';`, `formatDay`'i `@/lib/format` importuna ekle;
sayfa fonksiyonunda (`sessions` okunduktan sonra) `const last = lastWorkout(sessions?.index ?? null);` ve satır:

```tsx
                  <TableRow>
                    <TableCell className="text-muted-foreground">Son antrenman</TableCell>
                    <TableCell>{last ? `${formatDay(last.date)}${last.unfinished ? ' · yarım' : ''}` : 'Henüz yok'}</TableCell>
                  </TableRow>
```

**Step 4: Geçtiğini gör** — test PASS; `npm run typecheck` temiz.

**Step 5: Commit**

```bash
git add src/lib/session-history.ts src/lib/session-history.test.ts "src/app/dashboard/clients/[id]/program/page.tsx"
git commit -m "fix(program): count unfinished workouts as the last workout"
```

---

### Task 6: Kütüphane araması Türkçe karakter duyarsız

`exercise-list.tsx` yalnız başlıkta `toLocaleLowerCase('tr')` ile arıyor: "dambil", "sinav", "gogus" sıfır sonuç,
"DAMBIL" bulur. Program düzenleyicinin seçicisi zaten `searchExercises` + `fold` kullanıyor; kas adları yardımcısı
ortak modüle taşınır ve kütüphane de onu kullanır.

**Files:**
- Create: `src/lib/muscle-names.ts`
- Test: `src/lib/muscle-names.test.ts`
- Modify: `src/components/block-editor/exercise-picker.tsx:29,37-45,98`
- Modify: `src/app/dashboard/exercises/exercise-list.tsx:127-138`

**Step 1: Testi yaz** (`src/lib/muscle-names.test.ts`)

```ts
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { searchExercises } from './exercise-search.ts';
import { muscleSearchNames } from './muscle-names.ts';

describe('kas adları (arama)', () => {
  test('kendi adı, ailesi ve bölgesi; tekrar yok', () => {
    assert.deepEqual(muscleSearchNames('lats_upper'), ['Üst kanat', 'Kanat', 'Sırt']);
    assert.deepEqual(muscleSearchNames('chest_upper'), ['Üst göğüs', 'Göğüs']);
  });

  test('Türkçe harfsiz yazım bulunur; kas adıyla da aranır', () => {
    const list = [
      { title: 'Dambıl Lunge', primaryMuscles: ['quadriceps'], secondaryMuscles: ['glutes'] },
      { title: 'Şınav', primaryMuscles: ['chest_lower'], secondaryMuscles: ['triceps_long'] },
    ];
    const titles = (query: string) => searchExercises(list, query, muscleSearchNames).map((item) => item.title);
    assert.deepEqual(titles('dambil'), ['Dambıl Lunge']);
    assert.deepEqual(titles('sinav'), ['Şınav']);
    assert.deepEqual(titles('gogus'), ['Şınav']);
  });
});
```

**Step 2: Düştüğünü gör**

Run: `node --test --experimental-strip-types --no-warnings src/lib/muscle-names.test.ts`
Expected: FAIL (modül yok)

**Step 3: Uygula**

`src/lib/muscle-names.ts`:

```ts
import { MUSCLE_FAMILIES, MUSCLE_GROUPS, MUSCLE_LABELS, type Muscle } from './schemas/exercise.ts';

/**
 * Egzersiz aramasında bir kasın adları: kendi adı, ailesi ("Kanat"), bölgesi ("Sırt"). Kütüphane listesi ve
 * düzenleyicinin seçicisi ortak kullanır (`exercise-search.ts` katlar ve sıralar).
 */
const FAMILY_OF = new Map<string, string>(MUSCLE_FAMILIES.flatMap((family) => family.muscles.map((muscle) => [muscle, family.label] as const)));
const GROUP_OF = new Map<string, string>(MUSCLE_GROUPS.flatMap((group) => group.muscles.map((muscle) => [muscle, group.label] as const)));

export function muscleSearchNames(muscle: string): string[] {
  const names = [MUSCLE_LABELS[muscle as Muscle] ?? muscle, FAMILY_OF.get(muscle) ?? '', GROUP_OF.get(muscle) ?? ''];
  return [...new Set(names.filter(Boolean))];
}
```

`exercise-picker.tsx`: `GROUP_OF` ve `muscleNames` tanımlarını sil; `familyOf`'u `@/lib/muscles` importundan çıkar
(başka kullanımı yok); `import { muscleSearchNames } from '@/lib/muscle-names';` ekle;
`searchExercises(pool, deferredQuery, muscleSearchNames)`.

`exercise-list.tsx` (`visible`):

```ts
  const visible = useMemo(() => {
    // Ada ve kas adına göre, Türkçe harfler katlanarak (düzenleyicinin seçicisiyle aynı arama).
    const matched = searchExercises(exercises, search, muscleSearchNames).filter(
      (item) => selected.length === 0 || selected.some((muscle) => works(item, muscle)),
    );
    if (selected.length === 0) return matched;
    // Seçili kası hedef alanlar önce, yalnız yardımcı olarak çalıştıranlar sonra.
    const isTarget = (item: ExerciseWithSource) => selected.some((muscle) => item.primaryMuscles.includes(muscle));
    return [...matched.filter(isTarget), ...matched.filter((item) => !isTarget(item))];
  }, [exercises, search, selected]);
```

ve importlar: `import { searchExercises } from '@/lib/exercise-search';`, `import { muscleSearchNames } from '@/lib/muscle-names';`.

**Step 4: Geçtiğini gör**

Run: `node --test --experimental-strip-types --no-warnings src/lib/muscle-names.test.ts src/lib/exercise-search.test.ts` → PASS;
`npm run typecheck` ve `npm run lint` temiz.

**Step 5: Commit**

```bash
git add src/lib/muscle-names.ts src/lib/muscle-names.test.ts src/components/block-editor/exercise-picker.tsx src/app/dashboard/exercises/exercise-list.tsx
git commit -m "fix(library): fold Turkish letters and search muscle names"
```

---

### Task 7: Sabit AI koç düğmesi kalkar, avatar menüsünden açılır

Sağ alttaki "AI koç" her sayfada içeriğin üstüne biniyor; telefonda program düzenleyicinin yüzen "Programı kaydet"inin
ortası ona denk geliyordu (375 px, `elementFromPoint` → "AI koç"). Panel `CoachLauncher`'da kalır (PT'de genel değerlendirme,
danışanda "Koçtan mesaj"ın "Önerileri aç"ı), yalnız tetikleyici düğme kalkar; PT avatar menüsünden açar. Danışanın menüsünde
"AI koç" (`/me/koc`) zaten var.

**Files:**
- Modify: `src/components/coach/coach-launcher.tsx`
- Modify: `src/app/dashboard/user-menu.tsx`

**Step 1: `coach-launcher.tsx`**

- `SheetTrigger` importunu ve `<SheetTrigger …>AI koç</SheetTrigger>` satırını sil; `Sheet` `open`/`onOpenChange` ile denetimli kalır.
- `useEffect`'i `react` importuna ekle ve dosyaya:

```ts
const OPEN_EVENT = 'pulsecoach:coach-open';

/** AI koç panelini açar (PT avatar menüsündeki "AI koç"); panel `CoachLauncher`'da, sabit düğme yok. */
export function openCoach() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}
```

- `CoachLauncher` içinde, state'lerden sonra:

```ts
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, show);
    return () => window.removeEventListener(OPEN_EVENT, show);
  }, []);
```

- `CoachNudge`'ın kabı düğmenin yerine iner: `bottom-[calc(var(--dock-clearance,6rem)+4.75rem)]` →
  `bottom-[calc(var(--dock-clearance,6rem)+1rem)]`.

**Step 2: `user-menu.tsx`**

`ChatCircleDots`'u phosphor importuna, `import { openCoach } from '@/components/coach/coach-launcher';` ekle; ikinci
grubun başına:

```tsx
          <DropdownMenuItem className="touch:min-h-11" onClick={() => openCoach()}>
            <ChatCircleDots />
            AI koç
          </DropdownMenuItem>
```

**Step 3: Tip ve lint**

Run: `npm run typecheck && npm run lint` → temiz.

**Step 4: Tarayıcıda doğrula** (dev sunucusu, PT girişi)

- `/dashboard` (masaüstü ve 375×812): sağ altta yüzen düğme yok.
- Avatar → "AI koç": panel açılır, "Tüm danışanlar" açıklamasıyla.
- 375×812, `/dashboard/clients/c_zmrbywaz/program/edit`: "Salı"yı seç (kaydetmeden) → yüzen "Programı kaydet"in ortasında
  `document.elementFromPoint` Kaydet düğmesini verir; düğmenin alt kenarı dock'un üstünde. Sonra "Salı"yı geri kaldır
  (Kaydet kaybolur); **Kaydet'e basma**.
- Danışan girişi (`?role=client&client=c_zmrbywaz`), `/me`: yüzen düğme yok; menüdeki "AI koç" `/me/koc`'u açar.

**Step 5: Commit**

```bash
git add src/components/coach/coach-launcher.tsx src/app/dashboard/user-menu.tsx
git commit -m "fix(coach): drop the floating AI coach button"
```

---

### Task 8: "Antrenmana başla" ilk ekranda

7 hareketlik günde düğme y≈927'deydi (ekran 812). Düğme ve "Başka gün seç", kartın içinde hafta şeridinin ve hareket
listesinin üstüne alınır.

**Files:**
- Modify: `src/app/me/program-card.tsx:205-222`

**Step 1: Uygula**

`CardContent`'in başına taşı, `CardFooter` bloğunu sil ve `CardFooter`'ı importtan çıkar (dosyada başka kullanımı yok):

```tsx
        <CardContent className="flex flex-col gap-4">
          {summary.rows > 0 ? (
            <div className="flex flex-col gap-2">
              <Button size="lg" className="h-12 w-full" nativeButton={false} render={<Link href={`/me/antrenman${programQuery}`} />}>
                <Play data-icon="inline-start" weight="fill" />
                Antrenmana başla
              </Button>
              <OtherDayButton clientId={clientId} />
            </div>
          ) : null}
          <WeekStrip clientId={clientId} />
          {summary.rows > 0 ? (
            <ClientDayPlan blocks={blocks} exercises={byId} />
          ) : (
            <p className="text-sm text-muted-foreground">Bu günün hareketleri şu an açılamıyor. Antrenörüne haber ver.</p>
          )}
        </CardContent>
```

**Step 2: Tip ve lint** — `npm run typecheck && npm run lint` temiz.

**Step 3: Tarayıcıda doğrula** — danışan girişi, 375×812, `/me`: "Antrenmana başla"nın alt kenarı < 700 px (dock'un
üstünde, kaydırmadan). **Dokunma** (antrenman başlatır, veri yazar).

**Step 4: Commit**

```bash
git add src/app/me/program-card.tsx
git commit -m "fix(today): show the start button without scrolling"
```

---

### Task 9: Son doğrulama

**Step 1:** `npm test` → hepsi PASS.
**Step 2:** `npm run typecheck && npm run lint` → temiz.
**Step 3:** `npm run build` (arka planda; birkaç dakika) → başarılı.
**Step 4:** Tarayıcı, PT girişi:
- `/dashboard`: Bildirimler'de 14 günden eski (bekleyen öneri hariç) kayıt yok; öneri "Bekleyen öneri" etiketli.
- `/dashboard/exercises`: aramaya `dambil`, `sinav`, `gogus` yaz → sonuç var.
- `/dashboard/clients/c_zmrbywaz`: Antrenmanlar kartında "Eki Cum" gibi ay görünür; "11 sa" yok.
- `/dashboard/clients/c_zmrbywaz/program`: "Son antrenman" tarih gösterir ("23 Ekim 2026 · yarım").
**Step 5:** Danışan girişi: `/me/gecmis` → "11 sa 12 dk" ve şişik "Son 30 gün" toplamı yok.
**Step 6:** Ekran görüntülerini kullanıcıya göster; push yok (kod yerelde kalır).
