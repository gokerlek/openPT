# Çoklu dil — temel altyapı (F) raporu

> 2026-11-05. Temel altyapı ajanının raporu; alan ajanları (T1–T5) bu dondurulmuş arayüzleri kullanır. Commit'ler: F1 `8945404`, F2 `4893194`.

I ran no new commands after the earlier report, so this is the same report again in case only the last message reaches you. Both commits are on `openpt` (not pushed). Turkish output is unchanged, and tests, `tsc` and `eslint` are clean. I didn't run the dev server or the build, so nothing has been checked in a browser yet.

**Commits**
- F1 infrastructure: `8945404`
- F2 catalog + interface freeze: `4893194`

## Exported API

**`src/i18n/locale.ts`** (pure, relative imports only)
```ts
export const LOCALES = ['tr','en'] as const; export type Locale = 'tr'|'en';
export const DEFAULT_LOCALE: Locale /*'tr'*/; export const FALLBACK_LOCALE: Locale /*'en'*/;
export const LOCALE_COOKIE = 'locale'; export const LOCALE_COOKIE_MAX_AGE = 31_536_000;
export const LOCALE_NAMES: Record<Locale,string>; // Türkçe, English
export function isLocale(v: unknown): v is Locale;
export function negotiateLocale(acceptLanguage: string|null|undefined): Locale; // highest q of tr/en, tie → first listed, neither → en
export function resolveLocale(i: { cookie?: string|null; acceptLanguage?: string|null }): Locale;
export function localeFromRequest(request: Request): Locale;
export function intlLocale(locale: Locale): string; // 'tr-TR' | 'en-GB'
export function localeCookie(locale: Locale, secure: boolean): string; // extra, used by useSetLocale
```

**`src/i18n/define.ts`**
- `type Shape<T>`
- `interface Messages<T> { (locale: Locale): T; readonly dictionary: { tr: T; en: Shape<T> } }`
- `defineMessages<T>(d: { tr: T; en: Shape<T> }): Messages<T>`
- `plural(locale, n, forms: { one; other }): string`
- `listText(locale, items, type?: 'conjunction'|'disjunction'): string`

**`src/i18n/text.ts`**
- `lower`, `upper`, `upperFirst`, `lowerFirst` — all `(locale, s) => string`
- `compareText(locale): (a, b) => number`

**`src/i18n/errors.ts`**
- `type LocalizedText`, `interface Localizable`
- `class LocalizedError extends Error { readonly text; localized(l) }` — `.message` stays Turkish
- `messageOf(error, locale): string | null` — uses `localized` if present, else `error.message`; null if not an Error

**`src/i18n/valibot.ts`**
- `msg<I>(t: (l, issue) => string): (issue: I) => string` — falls back to tr when `lang` is missing or unknown
- `langConfig(locale): { lang: Locale }`

**`src/i18n/server.ts`** (`server-only`)
- `getLocale` — React `cache` over `cookies()` + `headers()`
- `getMessages<T>(m): Promise<T>`

**`src/i18n/client.tsx`** (`'use client'`)
- `LocaleProvider({ locale, children })`, `useLocale()`, `useMessages(m)`, `currentClientLocale()`
- `useSetLocale()` writes the cookie, sets `<html lang>`, sets valibot's global lang, calls `invalidateQueries()`, posts `refresh-offline` to the service worker, then `startTransition(router.refresh)`

**`src/i18n/locale-switch.tsx`**
- `LocaleSwitch({ variant?: 'inline'|'card'|'menu'; className?: string })`

**`src/i18n/audit.ts`**
- `type HardcodedText = { file; line; text }`
- `findHardcodedText(files, o?: { allow?: readonly RegExp[] }): HardcodedText[]` — flags Turkish strings, JSX text, and `aria-label`/`title`/`placeholder`/`alt` literals

**`src/lib/format.ts`**
- `type Format = { number(v); kg(v); withUnit(v,unit); signedWithUnit(v,unit); date(iso,tz); dateTime(iso,tz); day(d); dayShort(d,withYear?); recent(iso,tz,now?); time(iso,tz) }`
- `getFormat(locale): Format` (memoized)
- The old `formatX` exports are unchanged and delegate to `getFormat('tr')`.

**`src/data/library-text.ts`**
- `localizeExercise<T extends Exercise>(x, l): T`
- `localizeDevice<T extends Device>(x, l): T`
- `localizeAttachment<T extends Attachment>(x, l): T`
- `localizedLibraryTitle(exerciseId, snapshot, l): string`
- Any id or field missing from the `.en` tables falls back to the Turkish one.
- The three `*-library.en.ts` placeholders are empty, with exactly the exports you specified.

**Other F1 changes**
- `navigation.ts`: `notFoundBackLink(pathname, locale?)` and `settingsSections(locale?)`.
- `clientManifest({ appName, clientId, locale? })`, `panelManifest({ appName, locale? })`, `offlineHtml({ appName, accent, locale? })`.
- `Providers` now **requires** a `locale` prop.
- The manifest and `/offline` routes use `localeFromRequest` and send `Vary: Accept-Language, Cookie`.
- The proxy's 503 message is localized, and the root layout renders `<html lang={locale}>`.

## Namespaces (leaf keys)
- `common`: 62 — actions, states, errors incl. HTTP status messages, relative time, units
- `shell`: 24 — app/panel descriptions, error and not-found pages, back links, setup-required, offline page, settings tabs, language switch
- `catalog`: 387

## F2 catalog moves
Turkish aliases are still exported and now derive from the dictionary. `l` defaults to `'tr'`.
- **`schemas/exercise`**: `equipmentLabels`, `categoryLabels`, `muscleLabels`, `muscleGroups`, `muscleFamilies`
- **`muscles`**: `roleLabels`, `summarizeMuscles(m, l)`, `groupMuscles(m, l)`
- **`muscle-names`**: `muscleSearchNames(m, locales = ['tr'])` — the UI passes `LOCALES` so search matches both languages
- **`muscle-tiers`**: `loadTierTitles`, `loadDescription`; `l` added to `loadLegend`, `muscleLoadLegend`, `roleLegend`, `statusLegend`, `roleMapProps`, `legendText`; `loadMapProps(load, scale, prefix, options, l)`
- **`deep-muscles`**: `deepMuscleLabels`, `deepMuscleRegionLabels`, `deepMuscleNotes`, `deepMusclesByRegion(m, l)`, `posturalPattern(id, l)`
- **`grips`**: `gripLabels`, `gripWidthLabels`, `describeGrip(g?, w?, l)`
- **`alternatives`**: `patternLabels`
- **`device-loads`**: `deviceKindLabels`, `describeDeviceLoads(d, l)`
- **`day-assignments`** / **`training-days`**: `weekdayShortLabels`, `weekdayLabels`, `weekdaysText`, `weekdaysChangeText`, `assignmentsText`, `weekdayNamesText` (all take `l`)
- **`progression`**: `effortLabels`, `progressionLabels`, `rirLabels`, `reasonLabels`, `describeRule(r, s, l)`, `describeSetRules(s, spec, l)`
- **`template-plan`**: `blockKindLabels`, `blockKindHints`; `l` added to `blockShapeProblem`, `groupSkipNote`, `formatTarget`, `formatRest`, `describeBlock`; `normalizeTemplate(body, ctx, options, l)`
- **`set-plan`**: `formatSets(sets, tt, audience, cardio, l)`, `setsText(sets, tt, cardio, l)`, `cardioTargetParts(sets, l)`
- **`cardio`**: `l` added to `cardioSpeedIssue`, `distanceText`, `inclineText`, `cardioParts`, `cardioText`
- **`program-plan`**: `logKindLabels`, `defaultPhaseName`, plus `l` on every function that writes names or text: `nextDayName`, `nextPhaseName`, `blankProgramBody`, `blankPhase`, `blankDay`, `dayFromTemplate`, `dayFromTemplateForEditing`, `copyDay`, `copyPhase`, `creationChange`, `createProgramRecord`, `createProgramFromTemplate`, `mergePhases`, `droppedDeviceNotice`, `phaseStatusLabel`, `frequencyLabel`, `currentPhaseChange`, `capChanges`, `settleSchedule`, `startPhase`
- **`conditions`**: `conditionInfo(id, l)`, `conditionLabel(c, l)`, `conditionQualifierLabels`, `clientSafeLabel(id, l)`
- **`schemas/client`**: `clientStatusLabels`, `healthFieldInfo`, `trainingExperienceLabels`

## Frozen interfaces for T1–T5
Signatures only. Functions get an unused trailing `_locale: Locale = DEFAULT_LOCALE`; the owner renames it when implementing. Context, deps and input types get `locale?: Locale`. Constant accessors return the Turkish constant for now.

- **T1**
  - `program-diff`: `DiffContext.locale?`, `commitMessage(kind, changes, _locale)`
  - `programs`: `programDiffContext(ex, dev, _locale)`
  - `proposals`: `applyProposal(p, prop, ids, _locale)`, `outcomeLabels()`
  - `client-targets`: `targetLabel(sets, tt, _locale)`
  - `exercise-filter`: `FilterContext.locale?`
- **T2**
  - `client-auth-routes`: `originGuard(h, o, _locale)`, `postGuard(h, o, _locale)`, `setPasswordRoute` deps `.locale?`
- **T3**
  - `own-program-text`: `programLine(input, lastDate?, _locale)`, `ownLogLabel(e, viewer, _locale)`
  - `own-programs`: `ownNameProblem(n, others, _locale)`, `defaultOwnName(taken, _locale)`, `ptProgramName()`
  - `own-program-routes`: `saveResponse(r, by, _locale)`
  - `session-finish`: `FinishInput.locale?`, `applyPatch(s, b, now, _locale)`
  - `session-history`: `sessionDetail(doc, tz, bodyMassKg?, _locale)`
  - `history-store`: `loadHistory(id, tz, _locale)`, `loadDetail(id, sid, _locale)`
  - `session-check`: `adjustDay` input `.locale?`
  - `workout-summary`: `shortDayText(d, _locale)`, `minutesText(m, _locale)`
  - `progress-text`: `weekLabel(a, b, _locale)`
  - `progress-load`: `ProgressOptions.locale?`
  - `progress-data`: `loadProgress` options `.locale?` (both overloads)
  - `muscle-progress`: `strengthWindows()`
  - `trend`: `rangePresets()`
  - `recommend`: `setIncreaseCandidates` input `.locale?`
  - `session-routes`: `SessionRouteDeps.locale?`
- **T4**
  - `constraints`: `_locale` on `regionText`, `constraintTitle`, `clientConstraintView`, `afterReportText`; `ctx.locale?` on `reportConstraint`, `editReport`, `withdrawReport`, `reportWorse`, `reportBetter`; accessors `regionLabels`, `typeClientLabels`, `severityLabels`, `severityDescriptions`, `triggerLabels`, `onsetChoiceLabels`, `reportSafety`, `emergencyText`
  - `constraint-filter`: `CareInput.locale?`, `_locale` on `rowCareText`, `careLine`, `optionCareText`
  - `exercise-caution`: `blockedText()`
  - `exposure`: `stageLabels()`
  - `health-respond`: `failed(e, fb, _locale)`
  - `measurement-log`: `sideLabels()`
  - `measurement-trends`: `measurementAlerts(e, today, _locale)`, `measurementTrends(e, range, _locale)`
  - `measurements`: `measurementDef(id, _locale)`, `measurementDefs()`, `measurementUnitLabels()`
  - `pose/protocols`: `protocols()`, `metricLabels()`
  - `screening`: `_locale` on `testName`, `cellTitle`, `clientScreeningRows`, `progressScreening`
  - `check-in`: `assessTolerance` input `.locale?`
  - `client-care`: `loadCareInput(c, today, _locale)`, `loadTodayCare(c, today, _locale)`, `loadEditorCare` options `.locale?`
- **T5**
  - `ai/assistant-notices`: `assistantNotices(raw, hash, own, now, _locale)`
  - `ai/assistant-contract`: `goalLabels()`
  - `listExercises`, `listDevices`, `listAttachments` are unchanged; T5 calls `getLocale()` inside them.

**Warning for the parallel agents:** a function with a new trailing `_locale` can't be passed bare to `.map()`, because the index would land in `locale`. `tsc` catches it. I wrapped the three existing cases in lambdas:
- `src/lib/attention.ts:523` (T2's file)
- `src/app/me/(sekmeler)/saglik/page.tsx:34` (T3's file)
- three calls in `constraint-filter.ts` (T4's file)

## Where the switch appears
- **Card:** `dashboard/settings/app/page.tsx` and `me/(sekmeler)/ayarlar/page.tsx`
- **Menu:** `dashboard/user-menu.tsx` and `me/client-menu.tsx`, as radio items between separators
- **Inline:** under `giris`, `join` and `login`, and in the `/install` header

## Rulings
1. **`LocaleSwitch` has a third variant, `'menu'`.** Buttons don't work inside a dropdown menu, and this keeps one component for the switch.
2. **Two small additions beyond the plan:** `localeCookie()` in `locale.ts` (pure, tested), and `Format.time(iso, tz)` in `getFormat`.
3. **How the client knows the locale:** `currentClientLocale()` reads `<html lang>`. `LocaleProvider` sets valibot's global language during render, in the browser only.
4. **`messageOf` on plain errors:** it returns `error.message` for a plain `Error`, so existing throw sites keep working.
5. **Title map in `localizedLibraryTitle`:** it builds its id→{tr,en} map lazily from the full libraries, because I wasn't allowed other `src/data` files. If client bundles end up importing it, T5 can swap in a small generated titles module without changing the signature.
6. **PT overrides aren't localized:** `localize*` skips any item whose `source` isn't `'library'`, since PT overrides reuse library ids. An item with no `source` counts as a library item.
7. **`muscleSearchNames` takes a list of locales,** not one, because search has to match both languages.
8. **`familyOf` stays Turkish:** it's used as a comparison key, not shown on screen.
9. **Plan ownership overlaps:**
   - `progression.ts` matches T3's `progress*` glob, but F localized it completely (labels, reasons, `describeRule`, `describeSetRules`). T3 should leave it alone.
   - `session-core.ts` matches T3's `session-*` glob, but the plan names it under T2, so it's T2's.
10. **F's vocabulary modules are translated, not just frozen.** No other task owns them, so every text-producing export in them is done.
11. **Default names collide across languages:** `nextDayName`/`nextPhaseName` treat any language's default name, and legacy "Gün X", as taken.
12. **Import-graph rerun differs from the plan's freeze list:**
    - **Not frozen:** T2 `clients`, `client-record`, `notices`, `live-text`, `session-core`, `env`, `updates/core`; T3 `own-program-files`/`-index`, `session-files-core`, `session-merge`, `program-feedback`, `heart-rate`, `workout-flow`/`-session`, `water`, `weekly-goals`, `client-tabs`; T1 `proposals-store`, `templates`, `template-edit`, `catalog-store`; T4 `health`. Other tasks only use these for data or thrown errors, so no signatures changed.
    - **Added beyond the plan:** `history-store`, `progress-data`, `muscle-progress`, `trend`, and the `client-care` loaders.
13. **`turkish-imports.test.ts` has a `PENDING` list.** It allows the three current T3 importers of `turkish.ts`, and fails on stale entries so T3 removes them as it moves the calls.
14. **Offline cache name not bumped:** the Turkish page text and `sw.js` are unchanged.
15. **Glossary choices:** "Cihazlar" → "Equipment"; "ekipman" → "equipment type"; PT "panel" → "dashboard".

## Left undone
- **Clinical English needs review by a qualified person** (plan §8.9). That covers conditions, deep-muscle notes, postural patterns and the health-module consent descriptions.
- Validation messages in `schemas/exercise.ts` (T1) and `schemas/client.ts` (T2) are still Turkish, as the plan assigns them.
- `settings-tabs.tsx` still uses `SETTINGS_SECTIONS`; T2 should switch to `settingsSections(locale)`.
- The Turkish text on the entry pages around the switch is unchanged (T2).
- Not done here, because the plan assigns them to the task that owns each file: metadata → `generateMetadata`, the date-fns/NumberField/speech locale switches, and the per-task audit tests.

## Verification
- `npm test`: 2807 passed, 0 failed across 547 suites (baseline was 2713; F1 alone was 2775).
- `npx tsc --noEmit`: 0 errors.
- `npx eslint .`: 0 problems.
- A before/after snapshot of every catalog module's Turkish constants and sample text outputs is identical, key order included.

The new term table is at `docs/i18n-glossary.md`.