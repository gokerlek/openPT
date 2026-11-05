# Çoklu dil (Türkçe + İngilizce) — uygulama planı

> 2026-11-05. Kararlar: diller tr + en; ilk ziyaret tarayıcı diline göre (Türkçe → tr, diğerleri → en), herkes kendi değiştirir, seçim çerezde; adresler değişmez; PT'nin yazdığı içerik çevrilmez; Türkçe metinler bayt bayt aynı kalır. Plan bir planlama ajanının kod taramasından çıktı; sayılar üst sınırdır.

## Plan: English alongside Turkish (tr default, en added)

**Recommendation:**
- **No i18n library.** Use typed TS dictionaries, one namespace per area, each with its own `tr.ts`, `en.ts` and `index.ts`. TypeScript enforces that `en` has exactly the keys of `tr`.
- **Locale is passed explicitly.** Lib functions get an optional trailing `locale` parameter that defaults to `'tr'`, so the 157 test files that assert Turkish keep passing unchanged.
- **Locale is read per request** from the `locale` cookie, falling back to `Accept-Language`. The cookie is written client-side and followed by `router.refresh()`. No proxy logic and no URL changes.

Interfaces are frozen in a foundation task (F) that lands first. Five implementer tasks then run in parallel on disjoint files, and a small integration task closes the gaps.

---

### 1. Inventory

Counts come from a TypeScript AST pass over non-test files. A string counts if it is a literal with a Turkish letter, a capitalised multi-word ASCII literal, or JSX text. These are upper bounds: about 10–15% are logs, `api/dev`, or fixtures.

| Area | Files | Strings | Notes |
|---|---|---|---|
| PT dashboard `src/app/dashboard/**` | 132 | ~1,590 | program 305, exercises 237, clients (root + `[id]` root) 183, constraints 158, measurements 129, screening 122, devices 97, templates 83, settings 58, home 56, attachments 55, sessions 38, invite 37, edit 24 |
| PT-only components (`block-editor`, `program`, `measurements`, `coach`) | 34 | ~490 | 182 / 89 / 140 / 78 |
| Client `/me/**` | 73 | ~880 | antrenman 461, root 178, programlar 124, saglik 50, gecmis 37 |
| Client components (`workout`, `progress`) | 12 | ~150 | |
| Auth (`giris`, `join`, `login`) | 14 | ~72 | |
| Setup `/setup` | 7 | ~98 | |
| Install wizard (`/install` + `lib/installation` + `api/install`) | 17 | ~196 | |
| API route handlers `src/app/api/**` | 78 | ~283 | clients 108, dev 41 (dev-only), me 26, setup 19 |
| Domain lib `src/lib/**` (text generators, route cores, valibot messages, errors) | ~200 | ~2,500 | screening 169, progress-text 143, constraints 142, schemas 380, ai 192, pose 117 |
| PWA (manifests, offline, `components/install`) | 7 | ~45 | |
| Shared UI (components root, `ui`, `muscle-map`, `list`, `swipe`, `dock`) | 80 | ~100 | |
| Built-in catalog `src/data/*` | 3 | ~480 | 125 exercises (title, description, ~3 cues), 38 devices, 9 attachments |
| `kur/kur.mjs` | 1 | ~255 | test file has 63 Turkish assertion lines |
| **Total** | | **~7,100 upper bound (~6,000 real)** | |

Other numbers that drive the work:
- 92 exported `*_LABELS` / `*_NAMES` / `*_TEXT` constants.
- 52 static `export const metadata` (dashboard 34, me 16, login 1, setup 1).
- 260 `v.safeParse` calls.
- Tests: 177 files, 157 of which contain about 4,476 Turkish literal lines.

### 2. Built-in catalog data

**Where it is defined:**
- `src/data/exercise-library.ts`: Turkish `title`, `description`, `cues[]`. Everything else is a code (category, equipment, muscles, pattern).
- `src/data/device-library.ts` (`name`, `notes`) and `src/data/attachment-library.ts` (`name`).
- Enum codes plus Turkish labels live in:
  - `src/lib/schemas/exercise.ts` (MUSCLES, EQUIPMENT, CATEGORIES, `MUSCLE_GROUPS`, `MUSCLE_FAMILIES`, `*_LABELS`)
  - `deep-muscles.ts`, `muscles.ts`, `grips.ts`, `alternatives.ts` (`PATTERN_LABELS`)
  - `device-loads.ts` (`DEVICE_KIND_LABELS`)
  - `day-assignments.ts` (`WEEKDAY_NAMES` 1–7)
  - `measurements.ts` (definitions; the unit code `'puan'` stays a code)
  - `conditions.ts`, `constraints.ts` (11 maps), `screening.ts` (5), `check-in.ts` (4), `progression.ts` (4), `exercise-filter.ts` (12)
  - `template-plan.ts`, `pose/protocols.ts`, `schemas/client.ts`, `schemas/measurement.ts`, `theme-palette.ts`

**How the PT's repo stores references:**
- **By id or code (no migration needed):**
  - Program and template rows store `exerciseId` and `deviceId` (`schemas/template.ts:103-108`).
  - Muscles, equipment, patterns, grips and conditions are stored as codes; weekdays as numbers 1–7.
- **Full copies (PT content, never translated):** `data/exercises.json`, `devices.json`, `attachments.json`. A PT override of a library item reuses the same id.
- **Snapshots of the Turkish name:**
  - Session entries store `title` ("the name as it was that day", `schemas/session.ts:148-150`), plus `dayName` and `programName`.
  - Feedback and proposals store `title` and `swap.title` (`schemas/session.ts:432,441`; `proposals.ts:84,92`).
  - The session index stores `title` (`:356`).
  - The progress digest keeps the snapshot (`progress.ts:79`), but the view already prefers the current catalog title (`progress.ts:425`).
- **Stored generated sentences:** see risk 3.

**Proposal (no data migration):**
- **Library lists:** `listExercises`, `listDevices` and `listAttachments` are server-only. They call `await getLocale()` and pass `source: 'library'` items through `localizeExercise`, `localizeDevice` and `localizeAttachment`. These read id-keyed English tables in `src/data/*.en.ts`. Sorting uses `compareText(locale)`. Custom and overridden items are not touched.
- **Snapshots in history:** `localizedLibraryTitle(id, snapshot, locale)` works like this:
  - If the snapshot equals that id's library title in *any* locale, show the library title in the viewer's locale.
  - Otherwise show the snapshot (PT override, renamed exercise, deleted exercise).
  - Turkish output is unchanged. It needs no catalog read, and it works in both directions (an English client's history viewed by a Turkish PT).
  - Use a small id → `{tr, en}` title map so client bundles don't pull in the 91 KB library.

### 3. Formatting

| Item | Where | Plan |
|---|---|---|
| `'tr-TR'` literals: 35 total | 18 `Intl.DateTimeFormat`, 2 `Intl.NumberFormat` (`format.ts:2`, `ui/stepper.tsx:65`), 17 `toLocaleString`, 1 `toLocaleTimeString`, 1 `toLocaleDateString` | Replace with `intlLocale(locale)` or `getFormat(locale)` |
| `src/lib/format.ts`: 9 functions, ~467 call sites in 93 files | `formatNumber` (264), `formatKg` (49), `formatDay` (45), `formatDayShort` (29), and others | Keep existing exports as-is (Turkish). Add `getFormat(locale)`. `%30` (tr) becomes `30%` (en). "az önce / dakika önce / bugün / dün" becomes "just now / N minutes ago (plural) / today / yesterday" |
| Fixed-locale widgets | date-fns `tr` (`components/date-picker.tsx:4`) plus Turkish day-picker labels; Base UI NumberField `locale="tr-TR"` (`ui/stepper.tsx:319`, `me/antrenman/set-row.tsx:100`); `speech.lang='tr-TR'` (`measurements/camera-capture-panel.tsx:29`); `chart.tsx:257` uses `toLocaleString()` with no locale | Switch on locale (date-fns `enGB`) |
| `<html lang="tr">` (`app/layout.tsx:56`), manifest `lang:'tr'` (`client-manifest.ts:37`, `panel-manifest.ts:34`), offline page `<html lang="tr">` | | Use the request locale |
| `toLocaleLowerCase('tr')` ×72 in 35 files | Mostly search folding (`exercise-search.ts:fold` maps ı→i, so it is safe for English) and name comparison | Keep. Only lowercasing of *labels inside sentences* (`constraint-filter.ts:142 lower`, `check-in.ts:146`) moves to `lower(locale, …)` |
| `toLocaleUpperCase('tr')` ×5 | `consent-card.tsx:49`, `client-menu.tsx:25`, `constraint-filter.ts:378`, `session-history.ts:94`, `session-check.ts:441` | Use `upper` / `upperFirst(locale, …)`. Turkish casing on English text turns `i` into `İ` |
| `localeCompare(x,'tr')` ×15 | Content sorting | Keep for PT content; use the viewer's locale for localized catalog lists (`exercises.ts:42`) |
| Turkish grammar helpers `turkish.ts` (`dative`, `accusative`) | 3 call sites: `me/antrenman/program-update-sheet.tsx:142`, `me/(sekmeler)/programlar/[pid]/duzenle/page.tsx:61`, `heart-rate.ts:172`. Ad-hoc suffixes elsewhere: `edit-messages.ts:151-152` (`${n}'a`), `device-loads.ts:161`, `progress-text.ts:136,280-281` | Move every call into `tr.ts` dictionary functions, so English never calls them. A test enforces that only `src/i18n/messages/**/tr.ts` imports `turkish.ts` |

English uses Intl `en-GB` (day-month order, 24-hour clock, metric, Monday-start weeks to match `weekStartsOn:1`). This is a one-line constant in `intlLocale`.

### 4. Mechanism (checked against `node_modules/next/dist/docs/` for Next 16.3)

**Why hand-rolled instead of a library:**
- Pure lib modules are tested with `node --test --experimental-strip-types` using relative imports and no Next runtime, and dictionaries must be importable there.
- Turkish needs functions, not ICU strings (vowel harmony in `dative`).
- Parity must be enforced by `tsc`.
- No new dependencies are needed:
  - `Intl.PluralRules` and `Intl.ListFormat` cover plurals and lists.
  - date-fns already ships `enGB`.
  - Valibot 1.5 already passes `issue.lang` into message functions (`getGlobalConfig` merges `config.lang`; `_addIssue` calls a message function with the issue).
  - A 20-line `Accept-Language` parser replaces `negotiator` and `@formatjs`.

**Who gets the locale, and how:**

| Consumer | How |
|---|---|
| Server Components, `generateMetadata` | `await getLocale()`. It is a React `cache()` over `cookies()` and `headers()`, both async in this version. Reading them in the root layout makes all routes dynamic; they mostly already are (config and session reads), and `cacheComponents` is not enabled, so no `<Suspense>` is required |
| Client Components | `useLocale()` from `LocaleProvider`, which `Providers` mounts with the locale passed down by the root layout |
| Route handlers | `localeFromRequest(request)` (pure, testable) or `await getLocale()`; `cookies()` works in handlers per `route.md` |
| Route cores (`lib/*-routes.ts`) | `deps.locale` |
| Validation | Schema messages are `msg((l) => …)`. Client: `v.setGlobalConfig({lang})` in `LocaleProvider` (formisch calls `v.safeParseAsync` with no config). Server: `v.safeParse(schema, body, langConfig(locale))` |
| Thrown errors | `LocalizedError` keeps `.message` in Turkish (logs and tests unchanged). Route boundaries call `messageOf(error, locale)` |
| Client non-React code (`fetchJson` default messages in `query/errors.ts`) | `currentClientLocale()` |
| Manifests | Browsers fetch the manifest without cookies (no `crossorigin`), so use `localeFromRequest` (effectively `Accept-Language`). Add `Vary: Accept-Language, Cookie`. `id` and `start_url` stay the same |
| Offline page | `/offline` renders using `localeFromRequest`. The service worker's fetch sends cookies. `useSetLocale` posts `refresh-offline`, and `pwa-root` already refreshes on every open. `sw.js` is unchanged |
| Proxy | Only localizes its own 503 message (`proxy.ts:13`). Detection does not go through the proxy |

**Detection:** cookie `locale` if valid, otherwise `negotiateLocale(Accept-Language)`. The highest-weighted of tr and en wins; if neither is listed, en. Edge case: `de,tr;q=0.8` resolves to tr. This is one line if you want it strict.

**Switching:** `useSetLocale(next)` does the following:
1. Writes the cookie client-side via `document.cookie` (Path=/, Max-Age=1 year, SameSite=Lax, Secure on https). Client-side matters: the proxy returns 503 for every `/api` path except `/api/install` before the environment is ready, so a route handler would fail on `/install`.
2. Sets `document.documentElement.lang`.
3. Sets the valibot global language.
4. Calls `queryClient.invalidateQueries()`.
5. Posts `refresh-offline` to the service worker.
6. Calls `startTransition(router.refresh)`.

**Foundation exports (exact signatures):**
```ts
// src/i18n/locale.ts  (pure; no Next or "@/" imports)
export const LOCALES: readonly ['tr','en']; export type Locale = 'tr'|'en';
export const DEFAULT_LOCALE: Locale /* 'tr': code default, tests */; export const FALLBACK_LOCALE: Locale /* 'en' */;
export const LOCALE_COOKIE = 'locale'; export const LOCALE_COOKIE_MAX_AGE = 31_536_000;
export const LOCALE_NAMES: Record<Locale,string>; // endonyms, never translated
export function isLocale(v: unknown): v is Locale;
export function negotiateLocale(acceptLanguage: string|null|undefined): Locale;
export function resolveLocale(i: { cookie?: string|null; acceptLanguage?: string|null }): Locale;
export function localeFromRequest(request: Request): Locale;
export function intlLocale(locale: Locale): string; // 'tr-TR' | 'en-GB'
// src/i18n/define.ts
export type Shape<T>;                 // widens literals; keeps function params, returns string
export interface Messages<T> { (locale: Locale): T; readonly dictionary: { tr: T; en: Shape<T> } }
export function defineMessages<T>(d: { tr: T; en: Shape<T> }): Messages<T>;
export function plural(locale: Locale, n: number, forms: { one: string; other: string }): string;
export function listText(locale: Locale, items: readonly string[], type?: 'conjunction'|'disjunction'): string;
// src/i18n/text.ts
export function lower/upper/upperFirst/lowerFirst(locale: Locale, s: string): string;
export function compareText(locale: Locale): (a: string, b: string) => number;
// src/i18n/errors.ts  (no TS parameter properties: strip-types cannot erase them)
export type LocalizedText = (l: Locale) => string;
export interface Localizable { localized(l: Locale): string }
export class LocalizedError extends Error implements Localizable { constructor(text: LocalizedText, o?: ErrorOptions) }
export function messageOf(error: unknown, locale: Locale): string | null;
// src/i18n/valibot.ts
export function msg<I extends v.BaseIssue<unknown>>(t: (l: Locale, issue: I) => string): (issue: I) => string;
export function langConfig(locale: Locale): { lang: Locale };
// src/i18n/server.ts ('server-only')
export const getLocale: () => Promise<Locale>; export function getMessages<T>(m: Messages<T>): Promise<T>;
// src/i18n/client.tsx ('use client')
export function LocaleProvider(p: { locale: Locale; children: React.ReactNode }): JSX.Element;
export function useLocale(): Locale; export function useMessages<T>(m: Messages<T>): T;
export function useSetLocale(): (next: Locale) => void; export function currentClientLocale(): Locale;
// src/i18n/locale-switch.tsx
export function LocaleSwitch(p: { variant?: 'inline'|'card'; className?: string }): JSX.Element;
// src/lib/format.ts (existing exports unchanged)
export type Format = { number; kg; withUnit; signedWithUnit; date; dateTime; day; dayShort; recent; time };
export function getFormat(locale: Locale): Format;
// src/data/library-text.ts
export function localizeExercise<T extends Exercise>(x: T, l: Locale): T;
export function localizeDevice<T extends Device>(x: T, l: Locale): T;
export function localizeAttachment<T extends Attachment>(x: T, l: Locale): T;
export function localizedLibraryTitle(exerciseId: string, snapshot: string, l: Locale): string;
// src/i18n/audit.ts (test helper, uses the typescript devDependency)
export function findHardcodedText(files: readonly string[], o?: { allow?: readonly RegExp[] }): { file: string; line: number; text: string }[];
```

**Namespace layout:** `src/i18n/messages/<ns>/tr.ts` holds the plain object, `en.ts` is typed `const en: Shape<typeof tr>` (a missing or extra key is a `tsc` error), and `index.ts` exports `<ns>Messages = defineMessages({tr, en})`. Enum-keyed maps in `tr` use `satisfies Record<Muscle,string>`. Adding a language later means adding one `<lang>.ts` per namespace (about 20 files; `tsc` lists each one missing), adding the code to `LOCALES`, and adding entries to the `intlLocale` and date-fns maps.

### 5. `kur/kur.mjs`: yes, make it bilingual

An English-speaking PT cannot install without it. It goes in T5 and is independent of F (it is a single file and imports nothing).
- Messages go inline as `MESSAGES = {tr:{…}, en:{…}}`.
- Export `detectLang(env, intlLocale)`. Order: `KUR_LANG`, then `LC_ALL`/`LC_MESSAGES`/`LANG`, then `Intl.DateTimeFormat().resolvedOptions().locale`. Anything starting with `tr` gives tr, everything else en.
- Add `ctx.lang`; `baseContext` in the tests defaults to `'tr'`, so the 63 assertion lines stay green.
- Localize the local HTML pages (`kur.mjs:288` `lang="tr"`) and the GitHub App or repo descriptions. Nothing reads these back.
- Keep Node 20 syntax.
- **Cost:** about 255 strings and 0.5–1 agent-day.

### 6. Tests

**Why existing tests keep passing:**
- With no cookie or headers, everything defaults to `DEFAULT_LOCALE='tr'`.
- The Turkish alias constants (`MUSCLE_LABELS`, `LOGGED_OUT_NOTICE`, etc.) stay exported.
- Turkish values are moved byte-identical.
- Route-core `deps.locale` is undefined, so cores use tr.
- Valibot with no `lang` resolves to tr.
- The kur test context defaults to tr.

**New tests:**
- **Foundation tests:**
  - `src/i18n/locale.test.ts`: negotiation tables; cookie beats header; an invalid cookie is ignored.
  - `define.test.ts`: plurals.
  - `parity.test.ts`: auto-discovers `messages/*/index.ts` with no central registry, so tasks don't conflict. Checks identical key trees, value kinds, function `.length` and array lengths, and that English strings contain no `[çğıİşÇĞŞ]` (allowlist for endonyms).
  - `catalog.test.ts`: every MUSCLES, EQUIPMENT, CATEGORIES, CONDITION_IDS and weekday code is labelled in both languages.
  - `turkish-imports.test.ts`: only `tr.ts` files import `turkish.ts`.
  - `format.test.ts`: en cases, e.g. `kg(2.5)` gives `2.5 kg`, `day('2026-09-01')` gives `1 September 2026`, `withUnit(30,'%')` gives `30%`.
- **Per-task tests:**
  - Each task adds `src/i18n/audit/<task>.test.ts`: no Turkish literals and no JSX text or `aria-label`/`title`/`placeholder` literals in the files it owns.
  - Plus a few English output tests:
    - T1: `commitMessage` and edit messages.
    - T2: `loginScreen` notices and invite steps.
    - T3: `client-set-text`, `workout-summary` plurals, `progress-text`.
    - T4: every clinical code has an English label; constraint reasons.
    - T5: library parity (125 ids, equal cue counts), `localizedLibraryTitle` in both directions, kur `detectLang` and message parity.
- **Not possible with node:test:** rendering React (TSX cannot be stripped). Pages are checked in the integration browser pass.

### 7. Work split

**F: Foundation (must land first; about 460 strings; ~1.5 agent-days; the critical path)**

*Create:*
- `src/i18n/{locale,define,text,errors,valibot,server,client,locale-switch,audit}.ts(x)`
- Namespaces `common` (~60 strings), `catalog` (~370), `shell` (~30)
- Foundation tests
- `src/data/library-text.ts` and empty `src/data/{exercise,device,attachment}-library.en.ts`

*Modify:*
- Root: `src/app/{layout,error,not-found}.tsx`, `src/components/{providers,not-found-view}.tsx`, `src/proxy.ts`
- PWA: `src/app/{manifest.webmanifest,panel.webmanifest,offline}/route.ts`, `src/lib/{client-manifest,panel-manifest,offline-page,format,navigation}.ts`, `src/lib/query/{errors,client}.ts`
- Vocabulary moves into `catalog`, keeping the Turkish aliases and adding accessors: `schemas/exercise.ts` (labels only), `muscles`, `muscle-names` (search uses both languages), `muscle-tiers`, `deep-muscles`, `grips`, `alternatives` (`PATTERN_LABELS`), `device-loads`, `training-days`, `day-assignments`, `progression` (labels), `template-plan` (block kinds, `formatRest`), `set-plan`, `cardio`, `program-plan` (`DEFAULT_PHASE_NAME`, `nextDayName`, `LOG_KIND_LABELS`), `conditions`, `schemas/client.ts` (labels)

*Interface freeze (signatures only, no translation):*

For every text-producing export that another task imports:
- Add an optional trailing `locale: Locale = DEFAULT_LOCALE` to functions.
- Add an `xxxLabels(locale)` or `xxxText(locale)` accessor next to each Turkish constant.
- Add `locale?: Locale` to context and deps types.

Modules, by owning task:
- T4-owned: `screening`, `constraints`, `constraint-filter`, `exercise-caution` (`blockedText`), `check-in`, `health`, `measurement-log`, `measurement-trends`, `measurements`, `exposure`, `client-care`, `health-respond`, `pose/protocols`
- T3-owned: `session-check`, `progress-text`, `progress-load`, `session-history`, `own-programs` (`ptProgramName`, `defaultOwnName`), `own-program-{text,files,index,routes}`, `session-routes` (`SessionRouteDeps.locale`), `program-feedback`, `recommend`, `heart-rate`, `workout-{summary,flow,session}`, `session-{files-core,finish,merge}`, `muscle-progress`, `trend`, `water`, `weekly-goals`, `client-tabs`
- T1-owned: `program-diff` (`DiffContext.locale`), `proposals`, `proposals-store`, `programs`, `templates`, `template-edit`, `client-targets`, `exercise-filter`, `catalog-store`
- T2-owned: `clients`, `client-auth-routes` (deps), `client-record`, `notices`, `live-text`, `session-core`, `env`, `updates/core`
- T5-owned: `ai/assistant-contract` (`goalLabels`), `ai/assistant-notices`

The list was derived with an import-graph script. Rerun it before freezing.

*Switch placement:*
- PT: `dashboard/settings/app/page.tsx` (card) and `dashboard/user-menu.tsx`
- Client: `me/(sekmeler)/ayarlar/page.tsx` and `me/client-menu.tsx`
- Entry pages (inline variant): `giris/page.tsx`, `join/page.tsx`, `login/page.tsx`, `install/page.tsx`

**Parallel implementer tasks** (each branches from F; files are disjoint; each also adds its own namespaces and audit test):

| Task | Owned files | Strings |
|---|---|---|
| **T1 PT library and program editor** | `src/app/dashboard/{exercises,devices,attachments,templates}/**`; `src/app/dashboard/clients/[id]/program/**`; `src/components/{block-editor,program}/**`; `src/app/api/{exercises,devices,attachments,templates}/**`; `src/app/api/clients/[id]/{program,programs,proposals}/**`; `src/lib/{catalog-actions,catalog-refs,catalog-store,exercise-filter,program-diff,edit-messages,editor-undo,template-edit,templates,programs,proposals,proposals-store,reorder,drop-target,slug,client-targets,set-suggestions,program-insights}.ts`; `src/lib/schemas/{template,program,device,attachment,own-program}.ts`; validation messages in `schemas/exercise.ts`. Namespaces: `pt-library`, `pt-program` | ~1,510 |
| **T2 PT shell, client records, onboarding, UI kit** | `src/app/dashboard/*` (root files: layout, nav, user-menu, home cards), `dashboard/[...rest]`, `dashboard/settings/**` except `ai/`; `dashboard/clients/*` (root), `clients/new/**`, `clients/[id]/{layout,page,loading,client-tabs,client-title,live-session}`, `clients/[id]/{edit,invite,sessions,ilerleme}/**`; `src/app/{giris,join,login,setup,install}/**`; `src/components/*` (root, except the two F files), `src/components/{ui,list,swipe,dock,muscle-map,install}/**`; `src/app/api/{auth,install,setup,updates,giris,join,notices,live,brand,dev}/**`, `api/clients/route.ts`, `api/clients/[id]/{route.ts,invite,revoke,live}`; `src/lib/{clients,clients-core,client-record,client-status,attention,notices,notices-store,live-store,live-text,pt-sessions,pt-login,session,session-core,guards,client-auth,client-auth-routes,client-access,password-rules,mail,env,config,config-update,github-oauth,theme-palette,client-card-extras,demo-*}.ts`; `src/lib/{github,installation,updates}/**`; `schemas/{auth,setup,config}.ts` and the messages in `schemas/client.ts`. Namespaces: `pt-shell`, `pt-clients`, `auth`, `setup`, `install`, `ui`. Shared-component prop APIs are frozen | ~1,230 |
| **T3 Client app** | `src/app/me/**` except `(sekmeler)/programlar/ai/**`; `src/components/{workout,progress}/**`; `src/app/api/me/**` except `me/coach/**`; `src/lib/{session-*,workout-*,own-program-*,own-programs*,history-store,progress*,personal-records,weekly-goals,trend,muscle-progress,water,pain-report*,heart-rate,client-set-text,client-tabs,check-in-routes,me-constraint-routes,recommend,program-feedback,live-session}.ts`; `schemas/session.ts`. Namespaces: `client-home`, `client-workout`, `client-programs`, `client-progress` | ~1,550 |
| **T4 Health, screening, measurements** | `src/app/dashboard/clients/[id]/{constraints,screening,measurements}/**`; `clients/[id]/{health-page,health-parts,health-tabs,measurements-card}.*`; `src/components/measurements/**`; `src/app/api/clients/[id]/{constraints,screenings,measurements,camera-measurements}/**`; `src/lib/{screening,screening-care,constraints,constraint-filter,exercise-caution,check-in,health,health-view,health-respond,measurement-log,measurements,measurement-trends,exposure,camera-preview,client-care}.ts`; `src/lib/pose/**`; `schemas/{health,constraint,measurement,camera-measurement}.ts`. Namespaces: `health`, `screening`, `measurements`. The English clinical terms need a human domain review | ~1,300 |
| **T5 Long-form content: library, AI coach, kur** | `src/data/**` (fill `*.en.ts` and the `library-text` implementation); `src/lib/{exercises,devices,attachments}.ts` (read-time localization via `getLocale`); `src/lib/ai/**`; `src/components/coach/**`; `dashboard/clients/[id]/coach/**`; `dashboard/settings/ai/**`; `me/(sekmeler)/programlar/ai/**`; `api/{coach,settings}/**`; `api/clients/[id]/coach/**`; `api/me/coach/**`; `kur/kur.mjs` and `kur/kur.test.mjs`. Namespace: `coach` | ~1,055 (about 60% long-form) |

**What every implementer task uses from F:** `getLocale` / `useLocale` / `useMessages`, `defineMessages`, `plural`, `msg`, `langConfig`, `getFormat`, `upperFirst`, `compareText`, `messageOf`, `LocalizedError`, `catalogMessages`, `findHardcodedText`, and the frozen signatures of the other tasks.

**Rules for the parallel tasks:**
1. Edit only the files you own.
2. Only additive optional parameters; never change frozen signatures or component props.
3. If a cross-task call needs something F didn't freeze, leave the Turkish default, add `// i18n-followup(<owner>)`, and list it in the PR.
4. Convert static `metadata` to `generateMetadata`.
5. Handlers use the `localeFromRequest`, `langConfig` and `messageOf` trio.

**I: Integration (after all merges, ~0.5 day):**
1. On a scratch branch, remove `= DEFAULT_LOCALE` from lib signatures. `tsc` then lists every non-test call site that doesn't pass `locale`. Fix those, then revert the scratch change.
2. Resolve every `i18n-followup` marker.
3. Repoint the audit tests at all of `src/app/**` and `src/components/**`.
4. Add a test that UI files never import the Turkish alias constants.
5. Browser QA on the dev server in both languages: PT flows, client workout, `/install`, offline page, `<html lang>`.
6. Turkish regression pass to confirm Turkish copy is unchanged.

### 8. Risks

1. **Sentences built by concatenation.** There are about 145 `join(', ' / ' · ')` sites, label-plus-fragment templates (`constraint-filter.ts:155-225`), and lowercased labels inside sentences. English word order differs, so whole sentences must become dictionary functions with parameters, not translated fragments.
2. **Plurals.** Turkish keeps the noun singular after a number; English needs `plural()` ("1 set / 3 sets", "N minutes ago"). Never append "s".
3. **Stored text is frozen in the writer's language.** These are stored as sentences, not codes:
   - Program log `changes[].text` and commit messages (`program-diff.ts:30-35`, `schemas/program.ts:163`)
   - Proposal `text`/`why` and `approvalNote` (`proposals.ts:95-96,374`)
   - Constraint log `text` (`schemas/health.ts:237`)
   - AI draft `rationale[]`/`attention[]` (`ai/assistant-contract.ts:19`)
   - Session `title`, `dayName`, `programName`

   Policy: write in the actor's language and render from structure where it exists (proposals have `kind`, kg and target fields). `own-program-files.ts:130` regex-rewrites `commitMessage` output (`/^Program: /`) and must become structural.
4. **Never translate these:**
   - Ids and slugs (`egimli-dambil-press`, `dambil-seti`), file paths, routes (`/giris`, `?cikis=1&sifre=0`), cookie and localStorage keys, and enum codes (`'puan'`, statuses)
   - The `dev` routes and `SEED_MESSAGE`
   - Default names written into data (`'Evre 1'`, `nextDayName` "Program A", `'Programım'`): these are created in the actor's language. Collision checks must match every language's variants; `own-programs.ts:118` reserves `PT_PROGRAM_NAME` and must check both.
5. **Tests that match server strings.** Route-core tests assert `body.error` text. This is safe because `deps.locale` defaults to tr. Turkish must stay byte-identical; the 4,476 assertion lines are the guard.
6. **What shows before a cookie exists:**
   - Server render uses `Accept-Language`, so there is no flash.
   - The manifest is fetched without cookies, so it uses `Accept-Language`.
   - The offline page is cached at the service-worker locale until the next refresh, which the switcher triggers.
   - An installed iOS PWA can have its own cookie jar, so it falls back to the device language and the user switches again inside the app.
   - One cookie per browser, so a PT and a client sharing a device share the language.
7. **Caches.**
   - React Query holds server text: invalidate on switch.
   - Never put localized text into `unstable_cache` without the locale in the key. Today the config, client index and digest only hold data or snapshots.
8. **Number input.** Base UI NumberField with `en-GB` may read "2,5" as 25. Test `stepper.tsx` and `set-row.tsx`. `parseDecimal` already accepts both separators.
9. **Clinical copy.** The English for screening, constraints, conditions and exercise filters (~550 strings) needs review by a qualified person. TR→EN medical terms must not be guessed.
10. **Related default.** `defaultConfig.timeZone` is `'Europe/Istanbul'` (`schemas/config.ts`), which non-Turkish PTs need to change.

### Critical Files for Implementation
- src/app/layout.tsx
- src/lib/format.ts
- src/lib/schemas/exercise.ts
- src/lib/exercises.ts
- src/components/providers.tsx