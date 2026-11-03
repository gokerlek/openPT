# Faz 1 · Menüler ve AI koç — uygulama planı

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (ya da executing-plans) to implement this plan task-by-task.

**Goal:** Tasarımın "Faz 1" bölümü (`docs/plans/2026-10-26-kullanilabilirlik-yeniden-duzen-design.md`): PT ve danışan
gezinmesini sadeleştirmek, AI koçu sabit bir yerden değil ihtiyaç anında, bağlamıyla açmak.

**Architecture:** Gezinme listeleri saf modüllerde (`src/lib/client-tabs.ts`, yeni `src/lib/attention.ts` gruplama)
testle değişir; sayfalar sunucu bileşeni kalır, küçük etkileşimler (arama, koç düğmesi) istemci bileşenidir. AI koç
paneli tek yerde (`CoachLauncher`) kalır; `openCoach(detail)` olayı paneli danışan, sekme ve "hemen değerlendir"
bilgisiyle açar. Rotalar mümkün olduğunca yerinde kalır (bağlantı kırılmasın): yalnız sekme/menü yapısı değişir.

**Tech Stack:** Next.js 16 App Router (AGENTS.md: sürüm eğitim verisinden farklı; Next API'si eklemeden önce
`node_modules/next/dist/docs/` bakılır), React 19, TypeScript, Tailwind v4, shadcn (Base UI), Phosphor ikonları,
Node'un test aracı.

**Kurallar**
- Testler `src/lib/*.test.ts`, göreli `.ts` importları; tek dosya:
  `node --test --experimental-strip-types --no-warnings src/lib/<dosya>.test.ts`. Her görevin sonunda
  `npm test`, `npm run typecheck`, `npm run lint` temiz.
- Uygulayıcı dev sunucusu başlatmaz; tarayıcı doğrulamasını yönetici (controller) yapar: yalnız test danışanı
  `c_zmrbywaz`, hiçbir şey kaydedilmez, localStorage'da yalnız kendi oluşturduğu anahtar adıyla silinir.
- PT tarafı metinlerde antrenör üçüncü şahıs ("PT", "antrenör"); danışan metinleri "sen".
- Her commit `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` ile biter; push yok.
- Kapsam dışı (sonraki fazlar): program modeli (Faz 3), İlerleme'nin "önce özet" grafik düzeni ve sağlık merkezi
  (Faz 4), grafiğe özel "Bunu açıkla" (panelde konu/soru isteği yok; şimdilik genel değerlendirme açılır).

---

## A · PT tarafı

### Task 1: Dikkat maddelerini danışana göre gruplayan saf fonksiyon

**Files:** Modify `src/lib/attention.ts` · Test `src/lib/attention.test.ts`

**Step 1: Test** (`describe('dikkat: Genel bakış listesi', …)` içine; `attentionGroups` importa eklenir)

```ts
  test('danışana göre gruplar: en acil maddesi olan önce, sonra ad; grup ve madde sınırı', () => {
    const result = attentionGroups(
      [
        { id: 'c_bbbbbbbb', name: 'Zeynep', facts: facts({ access: 'none' }) },
        { id: 'c_cccccccc', name: 'Can', facts: facts({ access: 'none', proposals: { count: 1, at: '2026-09-25T10:00:00.000Z', text: 'Squat 3 → 4 set' } }) },
        { id: 'c_aaaaaaaa', name: 'Ahmet', facts: facts({ proposals: { count: 2, at: '2026-09-25T10:00:00.000Z' }, access: 'joined' }) },
        { id: 'c_dddddddd', name: 'Okunamadı', facts: null },
      ],
      ctx,
      { groups: 2, perGroup: 1 },
    );
    assert.deepEqual(
      result.groups.map((group) => [group.clientName, group.items.map((item) => item.text), group.more]),
      [
        ['Ahmet', ['2 öneri onay bekliyor'], 0],
        ['Can', ['Öneri onay bekliyor: Squat 3 → 4 set'], 1],
      ],
    );
    assert.equal(result.total, 3);
    assert.equal(result.hidden, 1);
  });
```

**Step 2:** Çalıştır → FAIL (`attentionGroups` yok).

**Step 3: Uygula** (`attentionFeed`'in altına)

```ts
/** Genel bakış'ta en çok bu kadar danışan ve danışan başına bu kadar madde gösterilir. */
export const ATTENTION_GROUP_LIMIT = { groups: 8, perGroup: 3 } as const;

export type AttentionGroup = {
  clientId: string;
  clientName: string;
  /** En acil maddeler, `perGroup` kadar. */
  items: AttentionItem[];
  /** Grupta görünmeyen madde sayısı. */
  more: number;
  /** Sağlık güvenliği maddesi var (kırmızı). */
  urgent: boolean;
};

/**
 * "Dikkat gerektirenler" danışana göre: her danışanın maddeleri aciliyet sırasıyla, gruplar en acil maddelerine,
 * sonra ada göre. `total` maddesi olan danışan sayısı, `hidden` sınır yüzünden görünmeyen danışan sayısı.
 */
export function attentionGroups(
  clients: readonly { id: string; name: string; facts: AttentionFacts | null | undefined }[],
  ctx: { now: Date; timeZone: string; titleOf: (exerciseId: string) => string },
  limit: { groups: number; perGroup: number } = ATTENTION_GROUP_LIMIT,
): { groups: AttentionGroup[]; total: number; hidden: number } {
  const all = clients.flatMap((client) => {
    const items = client.facts ? attentionItems(client.facts, ctx) : [];
    return items.length > 0 ? [{ clientId: client.id, clientName: client.name, items }] : [];
  });
  all.sort(
    (a, b) =>
      (b.items[0]?.urgency ?? 0) - (a.items[0]?.urgency ?? 0) ||
      a.clientName.localeCompare(b.clientName, 'tr') ||
      a.clientId.localeCompare(b.clientId),
  );
  const groups = all.slice(0, limit.groups).map((group) => ({
    clientId: group.clientId,
    clientName: group.clientName,
    items: group.items.slice(0, limit.perGroup),
    more: Math.max(0, group.items.length - limit.perGroup),
    urgent: group.items.some((item) => item.tone === 'danger'),
  }));
  return { groups, total: all.length, hidden: Math.max(0, all.length - groups.length) };
}
```

(`attentionItems` zaten aciliyete göre sıralı döner; değilse uygulayıcı sıralamayı burada yapar ve testte belirtir.)

**Step 4:** Test dosyası PASS; `npm test`, typecheck, lint.

**Step 5:** `git commit -m "feat(attention): group attention items by client"`

---

### Task 2: Genel bakış — önce dikkat, gruplu liste, küçük sayılar

**Files:** Modify `src/app/dashboard/page.tsx`, `src/app/dashboard/attention-card.tsx` · Create
`src/app/dashboard/attention-row.tsx`

1. `attention-row.tsx`: `attention-card.tsx`'teki tek satırın çizimini (ikon, rozet `ATTENTION_LABELS`, `tone==='danger'`
   için `WarningCircle` + sr-only "Acil:", metin, `TARGET_PATHS` bağlantısı) `AttentionRow({ clientId, item })` olarak
   çıkar; `TARGET_PATHS` da buraya taşınıp export edilir. Görünüm aynı kalır. (Task 5 bu bileşeni Genel sekmesinde
   kullanır.)
2. `attention-card.tsx`: `attentionFeed` yerine `attentionGroups`. Her grup bir `<li>`:
   - Başlık satırı: danışanın adı (`/dashboard/clients/{id}` bağlantısı, `font-medium`), `urgent` ise kırmızı
     `WarningCircle`, sağda (Task 12'de dolacak) boş bir `actions` yeri.
   - Altında grubun maddeleri `AttentionRow` ile (danışan adı satırda tekrar yazılmaz: `AttentionRow`'a
     `showClient={false}` ya da eşdeğeri).
   - `more > 0` ise "+{more} madde daha" bağlantısı danışanın sayfasına.
   - Kartın altında `hidden > 0` ise "+{hidden} danışan daha" (bugünkü "+N madde daha" yerine).
   - Kart açıklaması gruplu düzeni anlatacak şekilde kısaltılır (bugünkü uzun açıklama: "En acili üstte; kırmızı
     ünlemliler sağlık güvenliği…"): "En acil danışan üstte; kırmızı ünlem sağlık güvenliği."
3. `page.tsx`: DOM sırası değişir: önce `grid gap-6 lg:grid-cols-2 lg:items-start` (AttentionCard, NoticesCard), sonra
   sayı kartları. Sayı kartları sıkı: kap `grid grid-cols-2 gap-3 lg:grid-cols-3`; `CountCard` `size="sm"`, sayı
   `text-2xl`; `LiveNowCard`'ın kabı telefonda `col-span-2 lg:col-span-1`.
4. `npm test`, typecheck, lint · Commit: `feat(overview): put attention first and group it by client`

**Controller doğrulaması:** 375×812 ve 1280 genişlikte `/dashboard`: Dikkat kartı en üstte; "Test Gelişim" tek
grupta, maddeleri altında; sayılar tek satırda küçük.

---

### Task 3: Danışanlar listesi — arama ve kartta son durum

**Files:** Create `src/lib/name-search.ts`, `src/lib/name-search.test.ts`,
`src/app/dashboard/clients/client-list.tsx` · Modify `src/app/dashboard/clients/page.tsx`

**Step 1: Test** (`src/lib/name-search.test.ts`)

```ts
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesName } from './name-search.ts';

describe('ada göre arama', () => {
  test('Türkçe harfler katlanır, kelimelerin hepsi geçmeli, boş arama hepsini tutar', () => {
    assert.equal(matchesName('Gizem Gonca', 'gizem'), true);
    assert.equal(matchesName('Şule Öztürk', 'sule oz'), true);
    assert.equal(matchesName('Şule Öztürk', 'ahmet'), false);
    assert.equal(matchesName('İlker Işık', 'ilker isik'), true);
    assert.equal(matchesName('Ahmet', '   '), true);
  });
});
```

**Step 2:** FAIL. **Step 3:**

```ts
import { fold } from './exercise-search.ts';

/** Danışan adında arama (Danışanlar listesi): Türkçe harfler katlanır, boşlukla ayrılan kelimelerin hepsi geçmeli. */
export function matchesName(name: string, query: string): boolean {
  const tokens = fold(query).split(/\s+/).filter(Boolean);
  const folded = fold(name);
  return tokens.every((token) => folded.includes(token));
}
```

**Step 4 (UI):**
- `page.tsx` kartlar için ek veri yükler: `clientOverviews()` (önbellekli; `app/dashboard/client-overviews.ts`) →
  `Map(id → overview)`; kart başına `attentionItems(o.attention, ctx).length` (ctx: `now`, `config.timeZone`,
  `titleOf` = egzersiz başlığı ya da id) ve son antrenman günü `o.attention.sessionDays.at(-1)` (uygulayıcı dizinin
  sıralı olduğunu doğrular; değilse en büyüğü alır). Arşivdeki danışanda bu bilgiler yok.
- Kart altbilgisine (bugünkü `AccessBadge` ve sağlık rozetinin yanına): dikkat sayısı rozeti ("3 dikkat"; acil madde
  varsa kırmızı ünlemli) ve son antrenman ("Son antrenman 23 Eki" / "Son 35 günde antrenman yok"). Tarih biçimi
  `formatDayShort`.
- `client-list.tsx` (istemci): sayfanın hazırladığı serileştirilebilir satırları (durum grupları ve kart verisi) alır,
  üstte `InputGroup` arama ("Danışan ara", `type="search"`), `matchesName` ile süzer; boş sonuçta `Empty`
  ("“{arama}” ile eşleşen danışan yok"). Durum grupları (Aktif, Duraklatıldı, Arşiv…) süzgeçten sonra boş kalırsa
  başlığıyla birlikte gizlenir. Kart görünümü bugünküyle aynı (bileşen istemciye taşınır).
- Program özeti eklenmez (danışan başına önbelleksiz okuma; sonraki faz).

**Step 5:** test, typecheck, lint · Commit: `feat(clients): search clients and show attention and last workout`

---

### Task 4: Danışan sayfası beş sekme; Davet ve AI koç sekmesi kalkar

**Files:** Modify `src/app/dashboard/clients/[id]/client-tabs.tsx`,
`src/app/dashboard/clients/[id]/coach/drafts/[draftId]/page.tsx` · Delete
`src/app/dashboard/clients/[id]/coach/page.tsx`

1. `client-tabs.tsx`: sekmeler **Genel · Program · Antrenmanlar · İlerleme · Sağlık** (bu sırayla). `davet` ve `koc`
   kalkar. Genel, `/invite` adresinde de etkin (`p === base || p === \`${base}/edit\` || under(\`${base}/invite\`)(p)`).
   Bileşenin yorumundaki sekme listesi ve "altı sekme sığmaz" paragrafı güncellenir (beş sekme telefonda da kayar).
2. `coach/drafts/[draftId]/page.tsx`: geri bağlantı "AI koç" yerine Program sekmesine: href
   `/dashboard/clients/{id}/program`, etiket "Program".
3. `coach/page.tsx` silinir; `grep -rn "/coach'" src` ve ``grep -rn "/coach`" src`` ile kalan sayfa bağlantısı olmadığı
   doğrulanır (API rotası `/api/clients/[id]/coach` ve taslak sayfası kalır; `coach-panel.tsx`'in "Oluşturucuda
   düzenle" bağlantısı taslak sayfasına gider, dokunulmaz).
4. `/invite` sayfası yerinde kalır (Genel'deki Giriş kartının düğmesi ve dikkat listesi oraya gider).
5. typecheck, lint, test · Commit: `feat(client): five client tabs without invite and coach`

---

### Task 5: Genel sekmesinin başında danışanın dikkat özeti

**Files:** Modify `src/app/dashboard/clients/[id]/page.tsx`

- `readClientDigest(id)` (`src/lib/notices-store.ts`, önbellekli; okunamazsa `null`) → `attentionItems(digest.attention,
  { now, timeZone: config.timeZone, titleOf: (id) => exerciseById.get(id)?.title ?? id })` (`exerciseById` sayfada
  var, ~L276).
- Madde varsa `SectionHeader`'ın hemen altına (canlı antrenmandan önce) bir kart: başlık "Dikkat", liste
  `AttentionRow` ile (danışan adı yazılmaz), en çok 5 madde, fazlası "+n madde daha" (bağlantısız metin).
  Madde yoksa kart çizilmez. Okuma hatası sessizce yok sayılır (sayfanın geri kalanı gibi).
- typecheck, lint · Commit: `feat(client): show the client's attention items on Genel`

**Controller doğrulaması:** `/dashboard/clients/c_zmrbywaz` başında "Sol diz orta → şiddetli" kırmızı madde ve
diğerleri; sekmeler beş; `/invite`'ta Genel etkin.

---

### Task 6: Ayarlar tek bölüm; avatar menüsü sadeleşir

**Files:** Create `src/app/dashboard/settings/layout.tsx`, `src/app/dashboard/settings/settings-tabs.tsx` · Modify
`src/app/dashboard/user-menu.tsx`

1. `settings-tabs.tsx` (istemci): `TrainingTabs` (`src/app/dashboard/training-tabs.tsx`) desenini kopyalar:
   `TabsNav aria-label="Ayarlar"` ile **Görünüm** `/dashboard/settings` · **Yapay zekâ** `/dashboard/settings/ai` ·
   **Sürüm** `/dashboard/settings/updates`; etkin sekme tam eşleşmeyle; sağda `USER_MENU_SPOT`.
2. `settings/layout.tsx`: `<div className="flex flex-col gap-5"><SettingsTabs />{children}</div>` (sayfalar kendi
   `PageHeader`'larını korur; yetki sayfalarda).
3. `user-menu.tsx` ikinci grup: **AI koç** (`openCoach()`), **Ayarlar** (`GearSix`, `/dashboard/settings`); ayırıcı;
   **Çıkış yap**. "Görünüm ayarları", "Yapay zekâ ayarları", "Sürüm ve güncellemeler" öğeleri kalkar, kullanılmayan
   ikon importları silinir.
4. typecheck, lint · Commit: `feat(settings): one settings section with tabs`

---

### Task 7: Egzersizler — arama üstte, kısıtlar katlanır

**Files:** Modify `src/app/dashboard/exercises/exercise-list.tsx`

1. Arama (`InputGroup`, ~L342-353) ızgaranın üstüne, `{notice}`'un hemen altına, tam genişlikte taşınır; "N sonuç"
   satırı aramanın altında kalır.
2. "Kısıtlar" kartı (~L234-340) `<details>` ile katlanır (shadcn'de collapsible yok; Profil'deki "Teknik
   ayrıntılar" deseni): `<details open={filterOn || Boolean(clientCare)}>`, `<summary>` kart başlığı satırıdır
   ("Kısıtlar" + seçili kısıt sayısı rozeti, ≥44 px dokunma, odak halkası), içerik bugünkü gövde. Danışan
   bağlamıyla (`?client=`) gelindiğinde ya da kısıt seçiliyken açık başlar.
3. typecheck, lint · Commit: `feat(library): search first and fold the constraints filter`

**Controller doğrulaması:** 375 px `/dashboard/exercises`: arama sekmelerin ve başlığın hemen altında; Kısıtlar kapalı;
"Kısıt ekle" açınca çalışıyor (kaydetme yok, süzgeç yalnız adreste).

---

### Task 8: PT dock'u masaüstünde de etiketli

**Files:** Modify `src/components/dock/dock.tsx`, `src/app/dashboard/nav.tsx`

- `Dock`'a `labels?: boolean` (varsayılan `false`). `true` iken her genişlikte telefondaki düzen kullanılır: etiket
  ikonun altında görünür (etiket `span`'ı `hidden … touch:block` yerine `block`), öğe genişliği telefondaki gibi
  (`touch:w-16` karşılığı), büyüme kapalı (`magnification` = `baseItemSize`), ipucu (`role="tooltip"`) çizilmez.
  `labels` yokken davranış birebir aynı kalır (danışan dock'u telefonda zaten etiketli).
- `DashboardDock` `labels` geçer.
- Uygulayıcı dosyanın başındaki uyarlama notlarına bir madde ekler. typecheck, lint ·
  Commit: `feat(dock): show labels on the PT dock at every width`

**Controller doğrulaması:** 1280 px'te dock'ta "Genel bakış · Danışanlar · Kütüphane" yazıyor; 375 px görünümü
değişmemiş; içerik dock'un altında kalmıyor.

---

## B · Danışan tarafı

### Task 9: Sekmeler Bugün · Program · İlerleme · Sağlık

**Files:** Modify `src/lib/client-tabs.ts`, `src/lib/client-tabs.test.ts`, `src/app/me/client-dock.tsx`,
`src/app/me/(sekmeler)/layout.tsx`, `src/app/me/client-menu.tsx`, `src/app/me/client-header.tsx`,
`src/lib/guards.ts`, `src/app/me/(sekmeler)/saglik/page.tsx`,
`src/app/me/(sekmeler)/programlar/ai/[draftId]/page.tsx` · Delete `src/app/me/(sekmeler)/koc/page.tsx`

**Step 1: Testleri güncelle** (`client-tabs.test.ts`)

```ts
  test("sıra dock'taki sırayla aynı: Bugün · Program · İlerleme · Sağlık", () => {
    assert.deepEqual(CLIENT_TABS.map(({ label }) => label), ['Bugün', 'Program', 'İlerleme', 'Sağlık']);
    assert.equal(clientTabIndex('/me'), 0);
    assert.equal(clientTabIndex('/me/programlar'), 1);
    assert.equal(clientTabIndex('/me/ilerleme'), 2);
    assert.equal(clientTabIndex('/me/saglik'), 3);
  });

  test('Geçmiş İlerleme sekmesinin içinde; öteki sekmeler alt sayfalarında da etkin', () => {
    assert.equal(clientTabIndex('/me/gecmis'), 2);
    assert.equal(clientTabIndex('/me/gecmis/s_k2m9x4qa'), 2);
    assert.equal(clientTabIndex('/me/ilerleme/rekorlar'), 2);
    assert.equal(clientTabIndex('/me/programlar/op_k2m9x4qa/duzenle'), 1);
    assert.equal(clientTabIndex('/me/ayarlar'), -1);
    assert.equal(clientTabIndex('/me/antrenman'), -1);
  });
```

Mevcut "sondaki eğik çizgi" testindeki `clientTabIndex('/me/gecmis/')` beklentisi `2` olur; `/me/gecmisler` -1 kalır.

**Step 2:** FAIL. **Step 3:** `client-tabs.ts`

```ts
export const CLIENT_TABS = [
  { href: '/me', label: 'Bugün' },
  { href: '/me/programlar', label: 'Program' },
  // Geçmiş, İlerleme'nin alt sekmesi (Özet · Geçmiş · Rekorlar); adresi yerinde kalır.
  { href: '/me/ilerleme', label: 'İlerleme', also: ['/me/gecmis'] },
  { href: '/me/saglik', label: 'Sağlık' },
] as const satisfies readonly { href: string; label: string; also?: readonly string[] }[];
```

`clientTabIndex` her sekme için `[href, ...(also ?? [])]` öneklerinden birine uyanı arar (`/me` yine yalnız tam
eşleşme). Dosya yorumu yeni sekmeleri anlatır.

**Step 4: Dock ve kabuk**
- `guards.ts`: `currentClient` React `cache` ile sarılır (`import { cache } from 'react'`;
  `export const currentClient = cache(async (): Promise<Client> => { … })`): aynı istekte layout ve sayfa
  `client.json`'u bir kez okur. Yorum buna göre.
- `client-dock.tsx`: ikonlar `/me` House, `/me/programlar` Notebook, `/me/ilerleme` ChartLineUp, `/me/saglik`
  FirstAidKit; `ClientDock({ health }: { health: boolean })` — `health` yanlışsa Sağlık öğesi listeden çıkar. Etkin
  öğe `clientTabIndex` ile (Sağlık gizliyken indeks yine CLIENT_TABS'taki yerine göre eşleşir). Yorum güncellenir.
- `(sekmeler)/layout.tsx`: dock `<Suspense fallback={<ClientDock health={false} />}><HealthAwareDock /></Suspense>`;
  `HealthAwareDock` aynı dosyada async sunucu bileşeni: `const client = await currentClient(); return <ClientDock
  health={canRecordHealth(client, 'conditions') || canRecordHealth(client, 'screening')} />`. Kabuk yine kaydı
  beklemeden akar; yorum buna göre ("dock'un Sağlık öğesi kayıttan, Suspense içinde").
- `client-menu.tsx`: yalnız **Ayarlar** ve **Çıkış yap**; `health` prop'u ve "AI koç", "Sağlık" öğeleri kalkar.
  `client-header.tsx` `health` hesabını bırakır (`canRecordHealth` importu kullanılmıyorsa silinir).
- `saglik/page.tsx`: artık sekme sayfası; `ClientHeader`'daki `back` (Bugün) kalkar. Yorum güncellenir.
- `koc/page.tsx` silinir. `programlar/ai/[draftId]/page.tsx`: erişim yokken yönlendirme `/me/koc` → `/me/programlar`;
  başlıktaki geri bağlantı `{ href: '/me/programlar', label: 'Programlar' }`. `grep -rn "/me/koc" src` boş kalmalı.
- `(sekmeler)/template.tsx` değişmez (yön `CLIENT_TABS` sırasından); Geçmiş ↔ İlerleme geçişi aynı indeks: yalnız
  saydamlık.

**Step 5:** test, typecheck, lint · Commit: `feat(me): tabs Bugün, Program, İlerleme and Sağlık`

**Controller doğrulaması:** danışan girişi, 375 px: dock dört öğe (test danışanının kısıt onayı var); `/me/gecmis`'te
İlerleme etkin; avatar menüsünde yalnız Ayarlar ve Çıkış; `/me/saglik` geri bağlantısız.

---

### Task 10: İlerleme alt sekmeleri Özet · Geçmiş · Rekorlar

**Files:** Create `src/app/me/progress-tabs.tsx`, `src/app/me/(sekmeler)/ilerleme/rekorlar/page.tsx` · Modify
`src/app/me/(sekmeler)/ilerleme/page.tsx`, `src/app/me/(sekmeler)/gecmis/page.tsx`,
`src/app/me/(sekmeler)/gecmis/[id]/page.tsx`

1. `progress-tabs.tsx` (istemci): `TabsNav aria-label="İlerleme bölümleri" className="w-full" listClassName="h-8
   touch:h-11"` ile **Özet** `/me/ilerleme` · **Geçmiş** `/me/gecmis` · **Rekorlar** `/me/ilerleme/rekorlar`;
   Özet yalnız tam eşleşmede, Geçmiş alt sayfalarında da etkin.
2. Üç sayfanın başlığı "İlerleme" olur (`ClientHeader title="İlerleme"`), hemen altında `<ProgressTabs />`.
   Geçmiş sayfasının "Son 30 gün …" özeti sekmelerin altında kalır. `gecmis/[id]` detay sayfası değişmez (geri bağlantı
   "Geçmiş" kalır; dock'ta İlerleme etkin).
3. `ilerleme/page.tsx` (Özet): `ProgressStats` en üste (`ProgressNotice`'tan sonra, `StrengthProgress`'ten önce);
   `RecordsCard` ve `AchievementsCard` buradan kalkar. Boş ve hata dalları sekmeleri de gösterir.
4. `ilerleme/rekorlar/page.tsx`: Özet'le aynı yükleme (`currentClient`, `readAppConfig`, `loadProgress`); hata →
   aynı `Alert`; `view.workouts === 0` → `ProgressEmpty`; değilse `RecordsCard` (items `view.recentRecords`, total
   `view.records`, `today`) ve `AchievementsCard` (`view.achievements`, `view.streak`). `metadata.title` "Rekorlar".
5. typecheck, lint · Commit: `feat(progress): Özet, Geçmiş and Rekorlar tabs`

**Controller doğrulaması:** 375 px `/me/ilerleme`: sekmeler başlığın altında, ilk kart "35 antrenman · seri · 76
rekor"; Rekorlar sekmesi kartları gösteriyor; Geçmiş takvimi ve listesi değişmemiş.

---

## C · AI koç bağlamla açılır

### Task 11: `openCoach(detail)` ve panelin başlangıç durumu

**Files:** Modify `src/components/coach/coach-launcher.tsx`, `src/components/coach/coach-panel.tsx` · Create
`src/components/coach/coach-button.tsx`

1. `coach-launcher.tsx`:

```ts
/** Paneli açarken bağlam: PT'de hangi danışan, hangi sekme, açılınca hemen değerlendirilsin mi. */
export type CoachOpen = { clientId?: string; tab?: 'review' | 'program'; autoReview?: boolean };

export function openCoach(detail: CoachOpen = {}) {
  window.dispatchEvent(new CustomEvent<CoachOpen>(OPEN_EVENT, { detail }));
}
```

   - Durum: `const [request, setRequest] = useState<{ n: number; detail: CoachOpen }>({ n: 0, detail: {} });`
     dinleyici `setRequest((r) => ({ n: r.n + 1, detail: (event as CustomEvent<CoachOpen>).detail ?? {} }))` ve
     `setOpen(true)`.
   - PT'de seçili danışan: `const forced = role === 'pt' ? request.detail.clientId ?? null : null;`
     `const selected = forced ?? (generalPath === pathname && role === 'pt' ? null : routeClient);`
     "Tüm danışanları değerlendir / Bu danışanın önerilerine dön" düğmesi yalnız `routeClient` varken (bugünkü gibi).
   - `CoachPanel` key'ine `request.n` eklenir; `initialTab={request.detail.tab}` ve
     `autoReview={request.detail.autoReview}` geçer. Kullanıcı menüsünün argümansız `openCoach()`'u değişmeden çalışır.
2. `coach-panel.tsx`: props `initialTab?: 'review' | 'program'` ve `autoReview?: boolean`. Sekme başlangıcı
   `initialTab === 'program' && !general ? 'program' : 'review'`. `autoReview` doğruysa panelin verisi geldiğinde ve
   `access === 'ready'` iken `review` isteği bir kez gönderilir (`useRef` bayrağı; bugünkü "Değerlendir" düğmesinin
   çağırdığı fonksiyonla aynı). Erişim kapalıysa bugünkü "AI desteği kapalı" uyarısı kalır.
3. `coach-button.tsx` (istemci):

```tsx
'use client';
import { Sparkle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { openCoach, type CoachOpen } from './coach-launcher';

/** Bağlamlı AI koç girişi: paneli bu danışan/sekme bilgisiyle açar (sayfa, AI erişimi hazırsa çizer). */
export function CoachButton({ label, detail, variant = 'outline', className }: { label: string; detail: CoachOpen; variant?: 'outline' | 'ghost' | 'secondary'; className?: string }) {
  return (
    <Button type="button" variant={variant} className={className} onClick={() => openCoach(detail)}>
      <Sparkle data-icon="inline-start" weight="fill" />
      {label}
    </Button>
  );
}
```

   (`Button`'ın `size`/dokunma sınıfları çevredeki düğmelerle aynı; uygulayıcı `touch:h-11` gibi mevcut deseni uygular.)
4. typecheck, lint, test · Commit: `feat(coach): open the coach with client, tab and auto review`

---

### Task 12: Bağlamlı girişler (PT ve danışan)

**Files:** Modify `src/lib/notices-store.ts`, `src/app/dashboard/attention-card.tsx`,
`src/app/dashboard/clients/[id]/page.tsx`, `src/app/dashboard/clients/[id]/program/page.tsx`,
`src/app/me/(sekmeler)/ilerleme/page.tsx`, `src/app/me/(sekmeler)/programlar/page.tsx`,
`src/app/me/antrenman/ozet/[id]/page.tsx`, `src/app/me/antrenman/ozet/[id]/summary-carousel.tsx`

Kapı her yerde `coachAccess(client) === 'ready'` (`src/lib/ai/coach-contract.ts`); hazır değilse düğme çizilmez.

- **PT · Genel bakış:** `buildDigest` dönüşüne `coach: coachAccess(client) === 'ready'` eklenir (`ClientOverview`
  tipi genişler; hesap `notices-store.ts`'te zaten yapılıyor). Grup başlığının `actions` yerine
  `<CoachButton variant="ghost" label="AI'ya sor" detail={{ clientId, autoReview: true }} />` (yalnız `coach`).
  `attentionGroups` girişine `coach` taşınır ya da kart `Map(id → coach)` ile bakar.
- **PT · Genel sekmesi:** `SectionHeader` actions'ta Düzenle'nin yanında `AI'ya sor` (`{ clientId: id, autoReview:
  true }`).
- **PT · Program sekmesi:** normal başlıkta (~L285) ve program yokken boş durumda "Program oluştur"un yanında
  `AI ile taslak öner` (`{ clientId: id, tab: 'program' }`).
- **Danışan · İlerleme (Özet):** `ProgressStats`'ın altında tam genişlikte `AI değerlendirmesi` (`{ autoReview: true
  }`, `className="w-full"`).
- **Danışan · Programlar:** "Yeni program"ın yanında `AI ile program öner` (`{ tab: 'program' }`).
- **Danışan · Antrenman özeti:** `page.tsx` `coach` boolean'ını `SummaryCarousel`'a geçer; son slaytta görünmez
  bırakılan ikincil düğme yerine `coach` doğruysa `Koça sor` (`{ autoReview: true }`, `variant="ghost"`).

typecheck, lint, test · Commit: `feat(coach): contextual entry points for PT and clients`

**Controller doğrulaması (kaydetmeden):** PT `/dashboard`: grup başlığında "AI'ya sor" → panel "Bu danışanın
kayıtları" ile açılıp değerlendirme başlıyor; Program sekmesinde "AI ile taslak öner" → panel "Program hazırla"
sekmesinde (taslak oluşturulmaz). Danışan `/me/ilerleme` ve `/me/programlar` aynı şekilde. AI desteği kapalı bir test
danışanında düğmeler yok.

---

### Task 13: Belgeler ve son doğrulama

**Files:** Modify `docs/SPEC.md` (§6 gezinme paragrafları), `README.md` (AI bölümü)

- SPEC §6: PT dock'u (masaüstünde etiketli), danışan sayfası beş sekme, Ayarlar sekmeleri ve avatar menüsü (AI koç,
  Ayarlar, Çıkış); danışan dock'u Bugün · Program · İlerleme · Sağlık, İlerleme alt sekmeleri, avatar menüsü (Ayarlar,
  Çıkış); AI koçun bağlamlı girişleri. Yalnız değişen cümleler; bölümler yeniden yazılmaz.
- README AI bölümü: "AI koç PT'de ve danışanda sağ üstteki hesap menüsünden açılır" cümlesi bağlamlı girişleri
  anlatacak şekilde güncellenir.
- `npm test`, typecheck, lint, `npm run build` (arka planda) · Commit: `docs: describe the new navigation and coach entry points`
- Son kod incelemesi (bütün Faz 1 aralığı) ve controller'ın 375 px + masaüstü tarayıcı turu; ekran görüntüleri
  kullanıcıya.
