import { DEFAULT_LOCALE, type Locale } from '../i18n/locale.ts';
import { screeningMessages } from '../i18n/messages/screening/index.ts';
import type { MovementPattern } from './alternatives.ts';
import { awaitsOpinion, ConstraintError, isActive, isPaired, type AvoidTagId, type ConstraintRegion } from './constraints.ts';
import type { Constraint, HealthRecord, Screening, ScreeningSide, ScreeningTests } from './schemas/health.ts';

/**
 * Hareket taraması, protokol 1 (tasarım `docs/design/kisit-tarama.md` §4) — saf.
 *
 * Sekiz temel hareket; PT her testte (iki taraflıda her tarafta) önce ağrıyı, sonra yapılan sürümü, sonra kaçan
 * noktaları işaretler. Sonuç **sözcüktür** ve noktalardan hesaplanır (Temiz · Telafiyle · Kolaylaştırılmış ·
 * Yapılamadı · Ağrılı · Bu taramada yapılmadı); ağrı testi durdurur ve sonuç üretmez; puan sayısı, toplam ve risk
 * yüzdesi yok. İç sıra (3 → 0) yalnız asimetri ve karşılaştırma için, ekrana çıkmaz.
 *
 * Neye benzediği: puan yapısı Cook 2006'nın sıralı ölçeğine benzer; testler, noktalar ve kurallar bizim; bu
 * protokolün güvenilirlik ya da geçerlik verisi yok **[sentez]**. Tescilli bir testin adı, yönergesi, puanlama
 * tablosu ya da düzeltici hiyerarşisi yoktur.
 */

export const SCREENING_PROTOCOL = 1;

export const SCREENING_TEST_IDS = [
  'squat',
  'hinge',
  'split_squat',
  'single_leg_balance',
  'push',
  'pull',
  'anti_rotation',
  'shoulder_flexion',
] as const;
export type ScreeningTestId = (typeof SCREENING_TEST_IDS)[number];

export type ScreeningPoint = {
  id: string;
  /** Giriş ekranındaki düğme: gözlenen kaçış ("Topuk kalktı"). */
  label: string;
  /** PT'nin ipucu ("Telafiyle" sonucunda). */
  hint: string;
  /** Danışanın "odak" satırı ("topukların yerde kalsın"). */
  focus: string;
};

export type ScreeningTest = {
  id: ScreeningTestId;
  /** PT'ye tam ad. */
  title: string;
  /** Şeritte ve danışana kısa ad. */
  short: string;
  sided: boolean;
  /** İki taraflıda hangi tarafın test edildiği. */
  sideNote?: string;
  setup: string;
  points: readonly ScreeningPoint[];
  easier: string;
  /** İpucunun "Kütüphanende aynı kalıptan"ı ve düzenleyicinin tarama rozeti (geniş eşleşme). */
  patterns: readonly MovementPattern[];
  /**
   * Gözden geçirilmemiş ağrıda düzenleyicide dikkat alan kalıplar (§4.6, faz 6) **[sentez]**: testin yüklediği
   * kalıbın kendisi, `patterns`'tan dar (menteşe ağrısı kalça itişini, ters kürek ağrısı dikey çekişi dikkatli yapmaz).
   */
  painPatterns: readonly MovementPattern[];
  /** Etkin kısıt bu bölgelerdeyse: görüşü alınmamış kırmızı bayrakta "Yapılmadı (kısıt)" hazır gelir, asimetri bastırılır. */
  regions: readonly ConstraintRegion[];
  /** "Kısıt olarak ekle": önerilen bölge ve kaçınma. */
  constraintRegion: ConstraintRegion;
  avoid?: AvoidTagId;
  /** Paketteki kütüphanenin kimlikleri (`libraries.test.ts` varlıklarını denetler). */
  regress: readonly string[];
  progress: readonly string[];
  source: string;
};

/** Testin metin dışı kuralları; metinler (`title`, `setup`, noktaların adı, ipucu ve odağı) sözlükte. */
type TestRules = Omit<ScreeningTest, 'id' | 'title' | 'short' | 'sideNote' | 'setup' | 'points' | 'easier' | 'source'> & {
  /** Noktaların sırası (giriş ekranı ve danışanın odağı bu sırayla). */
  points: readonly string[];
};

export const TEST_RULES: Record<ScreeningTestId, TestRules> = {
  squat: {
    sided: false,
    points: ['heels', 'knees', 'depth', 'torso', 'spine'],
    patterns: ['squat'],
    painPatterns: ['squat'],
    regions: ['knee', 'hip', 'ankle_foot'],
    constraintRegion: 'knee',
    avoid: 'deep_knee_flexion',
    regress: ['destekli-sandalye-squat', 'goblet-box-squat'],
    progress: ['goblet-squat', 'halter-back-squat'],
  },
  hinge: {
    sided: false,
    points: ['contact', 'hips', 'range', 'return'],
    patterns: ['hinge', 'hip_extension'],
    painPatterns: ['hinge'],
    regions: ['lower_back'],
    constraintRegion: 'lower_back',
    avoid: 'forward_bend',
    regress: ['glute-bridge', 'halter-hip-thrust'],
    progress: ['romanian-deadlift', 'deadlift'],
  },
  split_squat: {
    sided: true,
    points: ['knee', 'pelvis', 'torso', 'depth', 'balance'],
    patterns: ['lunge'],
    painPatterns: ['lunge'],
    regions: ['knee', 'hip', 'ankle_foot'],
    constraintRegion: 'knee',
    avoid: 'deep_knee_flexion',
    regress: ['goblet-box-squat', 'glute-bridge'],
    progress: ['dambil-lunge', 'bulgarian-split-squat'],
  },
  single_leg_balance: {
    sided: true,
    points: ['time', 'hip', 'foot', 'arms'],
    patterns: ['lunge'],
    painPatterns: ['lunge'],
    regions: ['knee', 'hip', 'ankle_foot'],
    constraintRegion: 'knee',
    regress: ['makine-kalca-acma', 'glute-bridge'],
    progress: ['dambil-lunge', 'bulgarian-split-squat'],
  },
  push: {
    sided: false,
    points: ['plank', 'scapula', 'elbows', 'depth'],
    patterns: ['horizontal_push'],
    painPatterns: ['horizontal_push'],
    regions: ['shoulder'],
    constraintRegion: 'shoulder',
    avoid: 'behind_body',
    regress: ['notr-tutus-floor-press', 'makine-chest-press'],
    progress: ['sinav', 'halter-bench-press'],
  },
  pull: {
    sided: false,
    points: ['plank', 'shoulders', 'range', 'control'],
    patterns: ['horizontal_pull', 'vertical_pull'],
    painPatterns: ['horizontal_pull'],
    regions: ['shoulder'],
    constraintRegion: 'shoulder',
    regress: ['gogus-destekli-row', 'oturarak-kablo-row'],
    progress: ['tek-kol-dambil-row', 'barfiks'],
  },
  anti_rotation: {
    sided: true,
    points: ['trunk', 'pelvis', 'arms', 'breath'],
    patterns: ['anti_rotation', 'core_stability'],
    painPatterns: ['anti_rotation'],
    regions: [],
    constraintRegion: 'lower_back',
    regress: ['dead-bug', 'bird-dog'],
    progress: ['pallof-press', 'tek-el-tasima'],
  },
  shoulder_flexion: {
    sided: true,
    points: ['wall', 'ribs', 'elbow', 'shrug'],
    patterns: ['vertical_push'],
    painPatterns: ['vertical_push', 'vertical_pull'],
    regions: ['shoulder'],
    constraintRegion: 'shoulder',
    avoid: 'overhead',
    regress: ['landmine-press', 'band-pull-apart'],
    progress: ['oturarak-dambil-omuz-press', 'lat-pulldown'],
  },
};

/** Sözlükteki test metni (noktalar kimlikle). */
type TestCopy = { title: string; short: string; sideNote?: string; setup: string; points: Record<string, Omit<ScreeningPoint, 'id'>>; easier: string; source: string };

/** Tarama metinleri okuyanın dilinde. */
function text(locale: Locale) {
  return screeningMessages(locale);
}

/** Bir test, metinleri okuyanın dilinde. */
export function screeningTest(testId: ScreeningTestId, locale: Locale = DEFAULT_LOCALE): ScreeningTest {
  const { points, ...rules } = TEST_RULES[testId];
  const copy = text(locale).tests[testId] as TestCopy;
  return {
    id: testId,
    title: copy.title,
    short: copy.short,
    ...rules,
    ...(copy.sideNote !== undefined ? { sideNote: copy.sideNote } : {}),
    setup: copy.setup,
    points: points.map((id) => {
      const point = copy.points[id]!;
      return { id, label: point.label, hint: point.hint, focus: point.focus };
    }),
    easier: copy.easier,
    source: copy.source,
  };
}

/** Bütün testler okuyanın dilinde. */
export function screeningTests(locale: Locale = DEFAULT_LOCALE): Record<ScreeningTestId, ScreeningTest> {
  return Object.fromEntries(SCREENING_TEST_IDS.map((testId) => [testId, screeningTest(testId, locale)])) as Record<ScreeningTestId, ScreeningTest>;
}

/** Türkçe testler (eski çağrılar ve metin dışı kurallar); arayüz `screeningTests(locale)` kullanır. */
export const SCREENING_TESTS: Record<ScreeningTestId, ScreeningTest> = screeningTests('tr');

/** Tek ayak dengede `time` noktası süreden hesaplanır (< 30 sn → kaçtı) **[sentez]**. */
export const BALANCE_SECONDS = 30;
/** Ön uzanmada 4 cm’yi aşan ham fark büyük asimetridir (Plisky 2006); tam 4 cm ve yüzde farkı bu eşik değildir. */
export const REACH_ASYMMETRY_CM = 4;
/** Bacak boyunun kabul edilen aralığı (cm; ASIS → iç ayak bileği kemiği, yetişkin ve genç). */
export const LEG_LENGTH_CM = { min: 30, max: 150 } as const;
/** Asimetri Dikkat maddesi son tarama bu kadar günden eskiyse düşer. */
export const SCREENING_ALERT_DAYS = 28;
/** Kayıtta en çok tarama günü (en eskisi yalnız git'te kalır). */
export const SCREENING_LIMIT = 60;

/* --- sonuç --- */

export type Outcome = 'clean' | 'compensated' | 'easier' | 'unable' | 'pain' | 'not_tested';

/** Türkçe sözcükler (eski çağrılar); arayüz `outcomeLabels(locale)` kullanır. */
export const OUTCOME_LABELS: Record<Outcome, string> = text('tr').outcomes;

export const OUTCOME_CLIENT_LABELS: Record<Outcome, string> = text('tr').outcomesClient;

/** PT'nin sözcükleri ("Telafiyle") okuyanın dilinde. */
export function outcomeLabels(locale: Locale = DEFAULT_LOCALE): Record<Outcome, string> {
  return text(locale).outcomes;
}

/** Danışanın sözcükleri ("Kolaylaştırılmış sürümle") okuyanın dilinde. */
export function outcomeClientLabels(locale: Locale = DEFAULT_LOCALE): Record<Outcome, string> {
  return text(locale).outcomesClient;
}

export const RESULT_CHOICES = ['standard', 'easier', 'unable', 'not_tested'] as const;
export type ResultChoice = (typeof RESULT_CHOICES)[number];
export const RESULT_CHOICE_LABELS: Record<ResultChoice, string> = text('tr').resultChoices;

export function resultChoiceLabels(locale: Locale = DEFAULT_LOCALE): Record<ResultChoice, string> {
  return text(locale).resultChoices;
}

export const NOT_TESTED_REASONS = ['constraint', 'other'] as const;
export type NotTestedReason = (typeof NOT_TESTED_REASONS)[number];
export const NOT_TESTED_REASON_LABELS: Record<NotTestedReason, string> = text('tr').notTestedReasons;

export function notTestedReasonLabels(locale: Locale = DEFAULT_LOCALE): Record<NotTestedReason, string> {
  return text(locale).notTestedReasons;
}

const RANK: Partial<Record<Outcome, number>> = { clean: 3, compensated: 2, easier: 1, unable: 0 };

/** İç sıra (yalnız asimetri ve karşılaştırma): ağrılı ve yapılmamış sırasızdır. */
export function rankOf(outcome: Outcome | null): number | null {
  return outcome === null ? null : (RANK[outcome] ?? null);
}

/** Kaçan noktalar; dengede süre girildiyse `time` süreden hesaplanır. */
export function effectiveMissed(testId: ScreeningTestId, entry: ScreeningSide): string[] {
  const known = new Set(SCREENING_TESTS[testId].points.map((point) => point.id));
  const missed = (entry.missed ?? []).filter((id) => known.has(id));
  if (testId !== 'single_leg_balance' || entry.seconds === undefined) return missed;
  const rest = missed.filter((id) => id !== 'time');
  return entry.seconds < BALANCE_SECONDS ? ['time', ...rest] : rest;
}

/**
 * Sonuç (§4.2): ağrı → Ağrılı; yapılmadı; yapılamadı; kolaylaştırılmış; standartta kaçan nokta 0 → Temiz,
 * 1–2 → Telafiyle, 3+ → Kolaylaştırılmış. Sürüm seçilmemişse sonuç yok.
 */
export function outcomeOf(testId: ScreeningTestId, entry: ScreeningSide | undefined): Outcome | null {
  if (!entry) return null;
  if (entry.pain) return 'pain';
  switch (entry.result) {
    case 'not_tested':
      return 'not_tested';
    case 'unable':
      return 'unable';
    case 'easier':
      return 'easier';
    case 'standard': {
      const count = effectiveMissed(testId, entry).length;
      return count === 0 ? 'clean' : count <= 2 ? 'compensated' : 'easier';
    }
    default:
      return null;
  }
}

/* --- kayıt anahtarları --- */

export type SideKey = 'center' | 'left' | 'right';
export const SIDE_KEY_LABELS: Record<SideKey, string> = text('tr').sides;

export function sideKeyLabels(locale: Locale = DEFAULT_LOCALE): Record<SideKey, string> {
  return text(locale).sides;
}

export function sidesOf(testId: ScreeningTestId): SideKey[] {
  return SCREENING_TESTS[testId].sided ? ['left', 'right'] : ['center'];
}

/** "squat", "split_squat.left" (ağrının gözden geçirilmesi bununla). */
export function screeningKey(testId: ScreeningTestId, side: SideKey): string {
  return side === 'center' ? testId : `${testId}.${side}`;
}

export function parseScreeningKey(key: string): { testId: ScreeningTestId; side: SideKey } | null {
  const [test, side] = key.split('.');
  if (!test || !(SCREENING_TEST_IDS as readonly string[]).includes(test)) return null;
  const testId = test as ScreeningTestId;
  if (SCREENING_TESTS[testId].sided) return side === 'left' || side === 'right' ? { testId, side } : null;
  return side === undefined ? { testId, side: 'center' } : null;
}

/** Testin bir tarafı (tek taraflıda kaydın kendisi). */
export function sideEntry(tests: ScreeningTests, testId: ScreeningTestId, side: SideKey): ScreeningSide | undefined {
  const test = tests[testId] as (ScreeningSide & { left?: ScreeningSide; right?: ScreeningSide }) | undefined;
  if (!test) return undefined;
  if (side === 'center') return SCREENING_TESTS[testId].sided ? undefined : test;
  return test[side];
}

export type ScreeningCell = { testId: ScreeningTestId; side: SideKey; key: string; entry: ScreeningSide; outcome: Outcome };

/** Taramanın doldurulmuş hücreleri, test sırasıyla. */
export function cellsOf(screening: Pick<Screening, 'tests'>): ScreeningCell[] {
  return SCREENING_TEST_IDS.flatMap((testId) =>
    sidesOf(testId).flatMap((side) => {
      const entry = sideEntry(screening.tests, testId, side);
      const outcome = outcomeOf(testId, entry);
      return entry && outcome ? [{ testId, side, key: screeningKey(testId, side), entry, outcome }] : [];
    }),
  );
}

/** "8 test · 1 ağrı": yapılan test sayısı (yapılmayan hariç) ve ağrılı hücreler. */
export function screeningSummary(screening: Pick<Screening, 'tests'>): { tests: number; pain: number } {
  const cells = cellsOf(screening);
  const tested = new Set(cells.filter((cell) => cell.outcome !== 'not_tested').map((cell) => cell.testId));
  return { tests: tested.size, pain: cells.filter((cell) => cell.outcome === 'pain').length };
}

/* --- girişin temizlenmesi --- */

function cleanText(value: string | undefined, max: number): string | undefined {
  const text = value?.trim();
  return text ? text.slice(0, max) : undefined;
}

/**
 * Formdan gelen tarafı kayda çevirir: ağrıda yalnız ağrı ve notu (sürüm, noktalar, süre düşer); yapılmadıda
 * neden; yapılamadıda noktasız; bilinmeyen noktalar düşer; dengede süre, uzanma ve bacak boyu yalnız o testte.
 * Boşsa undefined.
 */
export function normalizeSide(testId: ScreeningTestId, entry: ScreeningSide | undefined): ScreeningSide | undefined {
  if (!entry) return undefined;
  if (entry.pain) {
    const note = cleanText(entry.painNote, 140);
    return { pain: true, ...(note ? { painNote: note } : {}) };
  }
  if (!entry.result) return undefined;
  if (entry.result === 'not_tested') return { result: 'not_tested', ...(entry.reason ? { reason: entry.reason } : {}) };
  if (entry.result === 'unable') return { result: 'unable' };
  const balance = testId === 'single_leg_balance';
  const seconds = balance && entry.seconds !== undefined ? Math.min(Math.max(Math.round(entry.seconds), 0), 300) : undefined;
  const reachCm = balance && entry.reachCm !== undefined ? Math.min(Math.max(Math.round(entry.reachCm * 10) / 10, 0), 250) : undefined;
  const legCm =
    balance && entry.legCm !== undefined
      ? Math.min(Math.max(Math.round(entry.legCm * 10) / 10, LEG_LENGTH_CM.min), LEG_LENGTH_CM.max)
      : undefined;
  const measures = { ...(seconds !== undefined ? { seconds } : {}), ...(reachCm !== undefined ? { reachCm } : {}), ...(legCm !== undefined ? { legCm } : {}) };
  const missed = [...new Set(effectiveMissed(testId, { ...entry, ...measures }))];
  return { result: entry.result, missed, ...measures };
}

/** Bütün testleri temizler; boş testler kayda girmez. */
export function normalizeTests(tests: ScreeningTests): ScreeningTests {
  const out: Record<string, unknown> = {};
  for (const testId of SCREENING_TEST_IDS) {
    const raw = tests[testId] as (ScreeningSide & { left?: ScreeningSide; right?: ScreeningSide; note?: string; heelSupportHelps?: boolean }) | undefined;
    if (!raw) continue;
    const note = cleanText(raw.note, 140);
    if (SCREENING_TESTS[testId].sided) {
      const left = normalizeSide(testId, raw.left);
      const right = normalizeSide(testId, raw.right);
      if (!left && !right) continue;
      out[testId] = { ...(left ? { left } : {}), ...(right ? { right } : {}), ...(note ? { note } : {}) };
    } else {
      const side = normalizeSide(testId, raw);
      if (!side) continue;
      const heel = testId === 'squat' && raw.heelSupportHelps !== undefined && !side.pain ? { heelSupportHelps: raw.heelSupportHelps } : {};
      out[testId] = { ...side, ...heel, ...(note ? { note } : {}) };
    }
  }
  return out as ScreeningTests;
}

/** Aynı gün varsa yerine geçer; tarih sırası, en çok 60 gün (en eskisi düşer). */
export function upsertScreening(list: readonly Screening[], screening: Screening): Screening[] {
  const next = [...list.filter((item) => item.date !== screening.date), screening].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return next.slice(Math.max(0, next.length - SCREENING_LIMIT));
}

/** En yeni tarama önce. */
export function newestFirst(list: readonly Screening[]): Screening[] {
  return [...list].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/* --- kayıt eylemleri --- */

/** Sözlükteki hata, durum koduyla (kısıt uçlarıyla aynı `ConstraintError`). */
function failure(pick: (errors: ReturnType<typeof text>['errors']) => string, status: number): ConstraintError {
  return new ConstraintError((locale) => pick(text(locale).errors), status);
}

/**
 * Günü yazar (aynı gün varsa yerine geçer). Hâlâ ağrılı olan hücrelerin gözden geçirme anı korunur; ağrısı
 * geçen hücrenin anı düşer. `replace`: yalnız var olan gün (düzenleme; yoksa 404). Boş tarama 400.
 */
export function withScreening(
  record: HealthRecord,
  input: { date: string; tests: ScreeningTests; note?: string | undefined },
  options: { replace?: boolean } = {},
): HealthRecord {
  const list = record.screenings ?? [];
  const existing = list.find((item) => item.date === input.date);
  if (options.replace && !existing) throw failure((e) => e.missing, 404);
  const tests = normalizeTests(input.tests);
  if (Object.keys(tests).length === 0) throw failure((e) => e.empty, 400);
  const next: Screening = { date: input.date, protocol: SCREENING_PROTOCOL, tests };
  const painful = new Set(painCells(next).map((cell) => cell.key));
  const reviewed = Object.entries(existing?.painReviewedAt ?? {}).filter(([key]) => painful.has(key));
  if (reviewed.length > 0) next.painReviewedAt = Object.fromEntries(reviewed);
  const note = input.note?.trim();
  if (note) next.note = note.slice(0, 500);
  return { ...record, screenings: upsertScreening(list, next) };
}

export function withoutScreening(record: HealthRecord, date: string): HealthRecord {
  const list = record.screenings ?? [];
  if (!list.some((item) => item.date === date)) throw failure((e) => e.alreadyDeleted, 404);
  return { ...record, screenings: list.filter((item) => item.date !== date) };
}

/** Ağrının gözden geçirildiği an ("Gördüm", "Kısıt olarak ekle"); ağrılı olmayan hücre 409. */
export function withPainReviewed(record: HealthRecord, date: string, key: string, now: string): HealthRecord {
  const list = record.screenings ?? [];
  const day = list.find((item) => item.date === date);
  if (!day) throw failure((e) => e.missing, 404);
  if (!painCells(day).some((cell) => cell.key === key)) throw failure((e) => e.noPain, 409);
  if (day.painReviewedAt?.[key]) return record;
  const next: Screening = { ...day, painReviewedAt: { ...day.painReviewedAt, [key]: now } };
  return { ...record, screenings: list.map((item) => (item.date === date ? next : item)) };
}

/* --- kısıtlar --- */

export type SideSuppress = (testId: ScreeningTestId, side: SideKey) => boolean;

function constraintTouches(constraint: Constraint, testId: ScreeningTestId, side: SideKey): boolean {
  const test = SCREENING_TESTS[testId];
  if (!test.regions.includes(constraint.region)) return false;
  if (side === 'center' || !isPaired(constraint.region) || !constraint.side || constraint.side === 'both') return true;
  return constraint.side === side;
}

/**
 * Girişin ön-seçimi (§4.5): görüşü alınmamış kırmızı bayrak bölgesine değen testler "Yapılmadı (kısıt)" hazır
 * gelir; PT değiştirebilir. Anahtar → true.
 */
export function presetFromConstraints(constraints: readonly Constraint[]): Record<string, true> {
  const preset: Record<string, true> = {};
  const waiting = constraints.filter(awaitsOpinion);
  for (const testId of SCREENING_TEST_IDS) {
    for (const side of sidesOf(testId)) {
      if (waiting.some((constraint) => constraintTouches(constraint, testId, side))) preset[screeningKey(testId, side)] = true;
    }
  }
  return preset;
}

/** Etkin kısıtlı taraf asimetriye girmez (§4.4). */
export function constraintSuppress(constraints: readonly Constraint[]): SideSuppress {
  const active = constraints.filter(isActive);
  return (testId, side) => active.some((constraint) => constraintTouches(constraint, testId, side));
}

/* --- ön uzanma ve bacak boyu --- */

/**
 * Tarafın bacak boyu (cm): kendi ölçümü, yoksa öbür tarafınki **[sentez]**: bacak boyu çoğu zaman bir kez ölçülür
 * ve iki bacak arasındaki fark ön uzanmanın yüzdesini ancak ondalıkta oynatır; belirgin fark varsa PT iki tarafı
 * ayrı girer.
 */
export function legLengthOf(tests: Pick<ScreeningTests, 'single_leg_balance'>, side: 'left' | 'right'): number | undefined {
  const test = tests.single_leg_balance;
  const other = side === 'left' ? 'right' : 'left';
  return test?.[side]?.legCm ?? test?.[other]?.legCm;
}

/**
 * Ön uzanmanın bacak boyuna oranı (%, bir ondalık): Plisky 2006 uzanmayı ASIS → iç ayak bileği kemiği boyuna böler
 * (boylu danışan kısa danışandan doğal olarak uzağa uzanır). Yalnız gösterim ve karşılaştırma içindir: kaynaklı eşik
 * yok (Plisky'nin %94'ü üç yönün bileşiğidir, bu protokolde yalnız ön yön var); büyük asimetri ham farkla (> 4 cm).
 */
export function reachPercent(reachCm: number | undefined, legCm: number | undefined): number | undefined {
  if (reachCm === undefined || legCm === undefined || legCm <= 0) return undefined;
  return Math.round((reachCm / legCm) * 1000) / 10;
}

/** Tarafın ön uzanması: ham cm ve (bacak boyu varsa) yüzdesi. */
export function reachOf(tests: Pick<ScreeningTests, 'single_leg_balance'>, side: 'left' | 'right'): { cm: number; percent?: number } | null {
  const cm = tests.single_leg_balance?.[side]?.reachCm;
  if (cm === undefined || outcomeOf('single_leg_balance', tests.single_leg_balance?.[side]) === 'pain') return null;
  const percent = reachPercent(cm, legLengthOf(tests, side));
  return { cm, ...(percent !== undefined ? { percent } : {}) };
}

/* --- asimetri, ağrı, karşılaştırma --- */

export type Asymmetry = {
  testId: ScreeningTestId;
  kind: 'minor' | 'major';
  /** İç sıra farkı (sonuçla); yoksa 0. */
  gap: number;
  left: Outcome;
  right: Outcome;
  /** Ön uzanma farkı (cm), yalnız dengede ve ikisi de girildiyse. */
  reachDiff?: number;
  /** Ön uzanma farkı, bacak boyunun yüzdesi olarak (bilgi; eşik değil). */
  reachPercentDiff?: number;
  /** Zayıf taraf (sıraya, eşitse uzanmaya göre). */
  weaker: 'left' | 'right';
};

/**
 * İki taraflı testlerde asimetri (§4.4): iç sıra farkı 1 → asimetri, ≥ 2 → büyük asimetri **[sentez]**; ön uzanma
 * farkı > 4 cm → büyük (Plisky 2006). Ağrılı, yapılmamış ya da bastırılan taraf girmez.
 */
export function asymmetries(screening: Pick<Screening, 'tests'>, suppress: SideSuppress = () => false): Asymmetry[] {
  const list: Asymmetry[] = [];
  for (const testId of SCREENING_TEST_IDS) {
    if (!SCREENING_TESTS[testId].sided) continue;
    const left = sideEntry(screening.tests, testId, 'left');
    const right = sideEntry(screening.tests, testId, 'right');
    const lo = outcomeOf(testId, left);
    const ro = outcomeOf(testId, right);
    const lr = rankOf(lo);
    const rr = rankOf(ro);
    if (lr === null || rr === null || !lo || !ro || suppress(testId, 'left') || suppress(testId, 'right')) continue;
    const gap = Math.abs(lr - rr);
    const reachDiff = left?.reachCm !== undefined && right?.reachCm !== undefined ? Math.round(Math.abs(left.reachCm - right.reachCm) * 10) / 10 : undefined;
    const major = gap >= 2 || (reachDiff !== undefined && reachDiff > REACH_ASYMMETRY_CM);
    if (gap === 0 && !major) continue;
    const weaker = lr !== rr ? (lr < rr ? 'left' : 'right') : (left?.reachCm ?? 0) < (right?.reachCm ?? 0) ? 'left' : 'right';
    const lp = testId === 'single_leg_balance' ? reachOf(screening.tests, 'left')?.percent : undefined;
    const rp = testId === 'single_leg_balance' ? reachOf(screening.tests, 'right')?.percent : undefined;
    const reachPercentDiff = lp !== undefined && rp !== undefined ? Math.round(Math.abs(lp - rp) * 10) / 10 : undefined;
    list.push({
      testId,
      kind: major ? 'major' : 'minor',
      gap,
      left: lo,
      right: ro,
      ...(reachDiff !== undefined ? { reachDiff } : {}),
      ...(reachPercentDiff !== undefined ? { reachPercentDiff } : {}),
      weaker,
    });
  }
  return list;
}

/** Tarama başına tek büyük asimetri (Dikkat maddesi): en büyük fark. */
export function majorAsymmetry(screening: Pick<Screening, 'tests'>, suppress?: SideSuppress): Asymmetry | null {
  const majors = asymmetries(screening, suppress).filter((item) => item.kind === 'major');
  majors.sort((a, b) => b.gap - a.gap || (b.reachDiff ?? 0) - (a.reachDiff ?? 0));
  return majors[0] ?? null;
}

export type PainCell = { key: string; testId: ScreeningTestId; side: SideKey; note?: string; reviewed: boolean };

export function painCells(screening: Pick<Screening, 'tests' | 'painReviewedAt'>): PainCell[] {
  return cellsOf(screening)
    .filter((cell) => cell.outcome === 'pain')
    .map((cell) => ({
      key: cell.key,
      testId: cell.testId,
      side: cell.side,
      ...(cell.entry.painNote ? { note: cell.entry.painNote } : {}),
      reviewed: Boolean(screening.painReviewedAt?.[cell.key]),
    }));
}

export type DatedPain = PainCell & { date: string };
export type PainState = 'open' | 'reviewed' | 'resolved' | 'superseded';
export type PainRow = DatedPain & { state: PainState; /** Ağrısız ya da yeniden ağrılı test edildiği sonraki tarama. */ laterDate?: string };

/**
 * Ağrı bayrağı taramalar boyunca (§4.4) **[sentez]**. Bir ağrının durumunu aynı testi ve tarafı **sonradan test eden
 * ilk** tarama verir ("Yapılmadı" ve girilmemiş test sayılmaz):
 * - sonra test edilmediyse ağrı "Gördüm"e kadar **açıktır** (Dikkat, uyarılar, düzenleyicide dikkat): yeni tarama
 *   o testi yapmadıysa ağrıyı hiç sormamıştır;
 * - sonraki test ağrısızsa gözden geçirilmemiş ağrı kendiliğinden kapanır: **ağrı geçti** (`resolved`);
 * - sonraki test de ağrılıysa yenisi geçer (`superseded`: aynı ağrı iki kez sayılmaz, yeninin "Gördüm"ü eskiyi de
 *   kapatır).
 * `rows` bütün ağrılı hücreler (en yeni tarama önce), `open` yalnız açıklar. Farklı protokoller karşılaştırılmaz.
 */
export function painHistory(screenings: readonly Screening[]): { rows: PainRow[]; open: PainRow[] } {
  const list = newestFirst(screenings).filter((item) => item.protocol === SCREENING_PROTOCOL);
  const rows: PainRow[] = [];
  /** Anahtar → daha yeni taramalardan onu test eden en eskisi (yürüyüş yeniden eskiye). */
  const later = new Map<string, { date: string; pain: boolean }>();
  for (const screening of list) {
    const pains = new Map(painCells(screening).map((cell) => [cell.key, cell]));
    for (const [key, cell] of pains) {
      const next = later.get(key);
      const state: PainState = next ? (next.pain ? 'superseded' : 'resolved') : cell.reviewed ? 'reviewed' : 'open';
      rows.push({ ...cell, date: screening.date, state, ...(next ? { laterDate: next.date } : {}) });
    }
    for (const cell of cellsOf(screening)) {
      if (cell.outcome !== 'not_tested') later.set(cell.key, { date: screening.date, pain: cell.outcome === 'pain' });
    }
  }
  return { rows, open: rows.filter((row) => row.state === 'open') };
}

/** Testin yalın adı ("Kalça menteşesi"; kurulum ekinin öncesi). */
export function testName(testId: ScreeningTestId, locale: Locale = DEFAULT_LOCALE): string {
  const t = text(locale);
  return t.plainName(t.tests[testId].title);
}

/** "Kol kaldırma (sağ)". */
export function cellTitle(testId: ScreeningTestId, side: SideKey, short = false, locale: Locale = DEFAULT_LOCALE): string {
  const t = text(locale);
  return t.cellTitle(short ? t.tests[testId].short : testName(testId, locale), side);
}

export type Change = 'up' | 'down' | 'same' | 'new' | 'pain_new' | 'pain_gone';

/**
 * Önceki taramaya göre (§4.5): aynı protokolde, iç sıraya göre ↑ ↓ =; ağrının başlaması ve geçmesi ayrı; önceki
 * yoksa ya da yapılmadıysa "yeni". Yapılmayan karşılaştırılmaz. Belirgin: ≥ 2 basamak ya da ağrı değişimi **[sentez]**.
 */
export function compareCell(current: Outcome | null, previous: Outcome | null): { change: Change; significant: boolean } | null {
  if (current === null || current === 'not_tested') return null;
  if (current === 'pain') return previous === 'pain' ? { change: 'same', significant: false } : { change: 'pain_new', significant: true };
  if (previous === 'pain') return { change: 'pain_gone', significant: true };
  const now = rankOf(current);
  const before = rankOf(previous);
  if (now === null) return null;
  if (before === null) return { change: 'new', significant: false };
  if (now === before) return { change: 'same', significant: false };
  return { change: now > before ? 'up' : 'down', significant: Math.abs(now - before) >= 2 };
}

/** Önceki taramanın hücresi (aynı protokolde). */
export function previousOutcome(previous: Screening | null | undefined, testId: ScreeningTestId, side: SideKey): Outcome | null {
  if (!previous || previous.protocol !== SCREENING_PROTOCOL) return null;
  return outcomeOf(testId, sideEntry(previous.tests, testId, side));
}

/* --- ipuçları (yalnız PT) --- */

export type Hint = { key: string; testId: ScreeningTestId; text: string; outcome: Outcome; ids: string[] };

function listTitles(ids: readonly string[], titleOf: (id: string) => string | undefined): { titles: string[]; ids: string[] } {
  const found = ids.flatMap((id) => {
    const title = titleOf(id);
    return title ? [{ id, title }] : [];
  });
  return { titles: found.map((item) => item.title), ids: found.map((item) => item.id) };
}

/**
 * Programa ipuçları (§4.6, **[sentez]**): ağrılı → öneri yok; Yapılamadı → destekli ve kısa aralık; Kolaylaştırılmış
 * → testin gerileme listesi; Telafiyle → kaçan noktanın ipucu; Temiz → ilerleme listesi; büyük asimetride zayıf
 * taraftan başla. Sıra: ağrı → en düşük sonuç → asimetri; eşitlikte test sırası. Hedefi PT bilir.
 */
export function screeningHints(
  screening: Pick<Screening, 'tests'>,
  titleOf: (id: string) => string | undefined,
  suppress?: SideSuppress,
  locale: Locale = DEFAULT_LOCALE,
): Hint[] {
  const major = new Map(asymmetries(screening, suppress).filter((item) => item.kind === 'major').map((item) => [item.testId, item]));
  const t = text(locale).hints;
  type Draft = Hint & { order: [number, number, number, number] };
  const drafts: Draft[] = [];
  for (const testId of SCREENING_TEST_IDS) {
    const test = screeningTest(testId, locale);
    const cells = cellsOf(screening).filter((cell) => cell.testId === testId && cell.outcome !== 'not_tested');
    // İki taraf aynı sonuç ve aynı noktalarla: tek satır.
    const same =
      cells.length === 2 &&
      cells[0]!.outcome === cells[1]!.outcome &&
      effectiveMissed(testId, cells[0]!.entry).join() === effectiveMissed(testId, cells[1]!.entry).join();
    const groups = same
      ? [{ cells, side: test.sided ? ('both' as const) : ('center' as const) }]
      : cells.map((cell) => ({ cells: [cell], side: cell.side }));
    for (const group of groups) {
      const cell = group.cells[0]!;
      const name = t.name(testName(testId, locale), group.side);
      const asym = major.get(testId);
      const weakSide = asym && group.cells.some((item) => item.side === asym.weaker);
      const missed = effectiveMissed(testId, cell.entry);
      const missedLabels = missed.map((id) => test.points.find((point) => point.id === id)?.label ?? id);
      let line: string;
      let ids: string[] = [];
      switch (cell.outcome) {
        case 'pain':
          line = t.pain(name);
          break;
        case 'unable': {
          const list = listTitles(test.regress, titleOf);
          ids = list.ids;
          line = t.unable(name, t.list(list.titles));
          break;
        }
        case 'easier': {
          const list = listTitles(test.regress, titleOf);
          ids = list.ids;
          line = t.easier(name, t.list(list.titles));
          break;
        }
        case 'compensated': {
          const first = test.points.find((point) => point.id === missed[0]);
          line = t.compensated(name, missedLabels, first?.hint ?? null);
          break;
        }
        default: {
          const list = listTitles(test.progress, titleOf);
          ids = list.ids;
          line = t.clean(name, t.list(list.titles));
        }
      }
      if (testId === 'squat' && (screening.tests.squat as { heelSupportHelps?: boolean } | undefined)?.heelSupportHelps && cell.outcome !== 'pain') {
        line += t.heelSupport;
      }
      if (weakSide && cell.outcome !== 'pain') line += t.weakSide;
      const rank = rankOf(cell.outcome) ?? 4;
      drafts.push({
        key: group.cells.map((item) => item.key).join('+'),
        testId,
        text: line,
        outcome: cell.outcome,
        ids,
        order: [cell.outcome === 'pain' ? 0 : 1, rank, weakSide ? 0 : 1, SCREENING_TEST_IDS.indexOf(testId)],
      });
    }
  }
  drafts.sort((a, b) => a.order[0] - b.order[0] || a.order[1] - b.order[1] || a.order[2] - b.order[2] || a.order[3] - b.order[3]);
  return drafts.map(({ order: _order, ...hint }) => hint);
}

/* --- danışanın görünümü --- */

export type ClientScreeningRow = {
  testId: ScreeningTestId;
  title: string;
  sides: { side: SideKey; label: string; text: string; outcome: Outcome; change: 'up' | 'down' | null }[];
  focus?: string;
};

/**
 * Danışanın Sağlık sayfasındaki tarama (§5.2): sözcük, taraf, önceki taramaya göre ok ve en çok bir odak (kaçan
 * ilk noktanın danışan dilindeki karşılığı). Sayı ve toplam yok. `labels`: PT'nin İlerleme kartında tarama sayfasının
 * sözcükleri (`OUTCOME_LABELS`).
 */
export function clientScreeningRows(
  screening: Pick<Screening, 'tests'>,
  previous: Screening | null,
  labels?: Record<Outcome, string>,
  locale: Locale = DEFAULT_LOCALE,
): ClientScreeningRow[] {
  // Etiket verilmezse danışanın sözcükleri okuyanın dilinde (Türkçede `OUTCOME_CLIENT_LABELS`).
  const outcomeText = labels ?? outcomeClientLabels(locale);
  const rows: ClientScreeningRow[] = [];
  const sides = sideKeyLabels(locale);
  for (const testId of SCREENING_TEST_IDS) {
    const test = screeningTest(testId, locale);
    const cells = cellsOf(screening).filter((cell) => cell.testId === testId);
    if (cells.length === 0) continue;
    const sideRows = cells.map((cell) => {
      const compared = compareCell(cell.outcome, previousOutcome(previous, testId, cell.side));
      const change: 'up' | 'down' | null =
        compared?.change === 'up' || compared?.change === 'pain_gone' ? 'up' : compared?.change === 'down' ? 'down' : null;
      return { side: cell.side, label: sides[cell.side], text: outcomeText[cell.outcome], outcome: cell.outcome, change };
    });
    const focusCell = cells.find((cell) => cell.outcome === 'compensated' || cell.outcome === 'easier');
    const focusId = focusCell ? effectiveMissed(testId, focusCell.entry)[0] : undefined;
    const focus = focusId ? test.points.find((point) => point.id === focusId)?.focus : undefined;
    rows.push({ testId, title: testName(testId, locale), sides: sideRows, ...(focus ? { focus } : {}) });
  }
  return rows;
}

/* --- İlerleme'de tarama kartı (faz 6) --- */

export type ProgressScreening = {
  date: string;
  /** Okların karşılaştırıldığı önceki tarama (aynı protokol); yoksa null. */
  previousDate: string | null;
  rows: ClientScreeningRow[];
};

/**
 * İlerleme'deki tarama kartı (§6, faz 6): en yeni tarama sözcükle, önceki taramaya göre ↑ ↓ ve odak; puan, sayı ve
 * toplam yok. Danışana Sağlık sayfasındaki metinler (`OUTCOME_CLIENT_LABELS`), PT'ye tarama sayfasının sözcükleri
 * (`OUTCOME_LABELS`). Eski biçimdeki tarama (başka protokol) sayılmaz; tarama yoksa null.
 */
export function progressScreening(
  screenings: readonly Screening[] | undefined,
  viewer: 'client' | 'pt',
  locale: Locale = DEFAULT_LOCALE,
): ProgressScreening | null {
  const list = newestFirst(screenings ?? []).filter((item) => item.protocol === SCREENING_PROTOCOL);
  const latest = list[0];
  if (!latest) return null;
  const previous = list[1] ?? null;
  const labels = viewer === 'pt' ? outcomeLabels(locale) : outcomeClientLabels(locale);
  return { date: latest.date, previousDate: previous?.date ?? null, rows: clientScreeningRows(latest, previous, labels, locale) };
}
