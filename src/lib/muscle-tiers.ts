import { DEFAULT_LOCALE, type Locale } from '../i18n/locale.ts';
import { catalogMessages } from '../i18n/messages/catalog/index.ts';
import { lower } from '../i18n/text.ts';
import { getFormat } from './format.ts';
import { BODY_MUSCLES, isBodyMuscle, roleLabels, summarizeMuscles, type BodyMuscle, type MuscleRole } from './muscles.ts';
import { muscleLabels, type Exercise, type Muscle } from './schemas/exercise.ts';

/**
 * Kas haritasının desen dili (tasarım `docs/plans/2026-11-03-ortak-liste-ve-kas-haritasi-design.md` §B): her harita aynı dört
 * kademeyle çizilir, dolu = çok, çizgili = orta, noktalı = az, boş = yok. Kademe kullanıma göre seçilir: harekette rol, tek
 * antrenmanda ve haftada set yükü, gelişimde karar. Açıklama kutusu aynı kademelere bölünmüş tek listedir. Saf.
 */

export type MuscleTier = 'filled' | 'striped' | 'dotted';
/** Haritadaki işaret: üç kademe ya da gelişim haritasındaki gerileme. */
export type MuscleMark = MuscleTier | 'declined';
export type MuscleMarks = Partial<Record<BodyMuscle, MuscleMark>>;
/** Yükün ölçeği: tek antrenman (şablon, program günü, özet) ya da hafta (program sayfası, İlerleme). */
export type LoadScale = 'session' | 'weekly';

export const TIER_ORDER: readonly MuscleTier[] = ['filled', 'striped', 'dotted'];

/**
 * Kademelerin alt sınırı (set). Tek antrenmanda 3 setlik tek hareketin rolleri birebir kademe olur (hedef 3, yardımcı 1,5,
 * dengeleyici 0,75); haftada 10 set SPEC §7.4'teki "yeterli"nin alt sınırıdır.
 */
export const LOAD_TIER_MIN: Record<LoadScale, { filled: number; striped: number }> = {
  session: { filled: 3, striped: 1.5 },
  weekly: { filled: 10, striped: 5 },
};

export function loadTierTitles(locale: Locale = DEFAULT_LOCALE): Record<LoadScale, Record<MuscleTier, string>> {
  return catalogMessages(locale).muscleMap.loadTiers;
}

/** Yük haritalarının (şablon, program günü) açıklaması. */
export function loadDescription(locale: Locale = DEFAULT_LOCALE): string {
  return catalogMessages(locale).muscleMap.loadDescription;
}

/** Türkçe metinler (eski çağrılar); arayüz `loadTierTitles(locale)` / `loadDescription(locale)` kullanır. */
export const LOAD_TIER_TITLES: Record<LoadScale, Record<MuscleTier, string>> = loadTierTitles('tr');
export const LOAD_DESCRIPTION = loadDescription('tr');

export function loadTier(sets: number, scale: LoadScale): MuscleTier | null {
  if (!(sets > 0)) return null;
  const min = LOAD_TIER_MIN[scale];
  if (sets >= min.filled) return 'filled';
  if (sets >= min.striped) return 'striped';
  return 'dotted';
}

export const ROLE_TIER: Record<MuscleRole, MuscleTier> = { primary: 'filled', secondary: 'striped', stabilizer: 'dotted' };

type Worked = Pick<Exercise, 'primaryMuscles' | 'secondaryMuscles'> & { stabilizerMuscles?: readonly Muscle[] };

function roleLists(exercise: Worked): [MuscleRole, readonly Muscle[]][] {
  return [
    ['primary', exercise.primaryMuscles],
    ['secondary', exercise.secondaryMuscles],
    ['stabilizer', exercise.stabilizerMuscles ?? []],
  ];
}

/** Hareketin kasları rol kademesiyle; bir kas iki listedeyse üst rol kazanır. Kardiyo haritada yok. */
export function roleMarks(exercise: Worked): MuscleMarks {
  const marks: MuscleMarks = {};
  for (const [role, muscles] of roleLists(exercise).reverse()) {
    for (const muscle of muscles) if (isBodyMuscle(muscle)) marks[muscle] = ROLE_TIER[role];
  }
  return marks;
}

export function loadMarks(load: Partial<Record<Muscle, number>>, scale: LoadScale): MuscleMarks {
  const marks: MuscleMarks = {};
  for (const muscle of BODY_MUSCLES) {
    const tier = loadTier(load[muscle] ?? 0, scale);
    if (tier) marks[muscle] = tier;
  }
  return marks;
}

/** Gelişimin kararı (İlerleme → Gelişim). */
export type MuscleStatusTone = 'strong' | 'improved' | 'stable' | 'declined';

export const STATUS_MARK: Record<MuscleStatusTone, MuscleMark> = {
  strong: 'filled',
  improved: 'striped',
  stable: 'dotted',
  declined: 'declined',
};

export function statusMarks(statuses: Partial<Record<BodyMuscle, MuscleStatusTone>>): MuscleMarks {
  const marks: MuscleMarks = {};
  for (const muscle of BODY_MUSCLES) {
    const tone = statuses[muscle];
    if (tone) marks[muscle] = STATUS_MARK[tone];
  }
  return marks;
}


/** Açıklamanın bir satırı: kas ve varsa set değeri, not ("az / yeterli / fazla") ve uyarı. */
export type LegendRow = { key: string; label: string; sets?: number; note?: string; warn?: boolean };
/** Bir kademenin başlığı ve kasları. `empty` yalnız gelişimde: "Veri az". */
export type LegendGroup = { mark: MuscleMark | 'empty'; title: string; rows: LegendRow[] };
export type MuscleLegendData = { groups: LegendGroup[]; cardioSets?: number };

type LoadRow = { key: string; label: string; sets: number; note?: string; warn?: boolean };

/** Yük satırları kademeye göre gruplu, her grupta setler büyükten küçüğe; boş grup ve sıfır satır yazılmaz. */
export function loadLegend(rows: readonly LoadRow[], scale: LoadScale, cardioSets?: number, locale: Locale = DEFAULT_LOCALE): MuscleLegendData {
  const sorted = rows.filter((row) => row.sets > 0).sort((a, b) => b.sets - a.sets);
  const titles = loadTierTitles(locale)[scale];
  const groups = TIER_ORDER.map((tier) => ({
    mark: tier,
    title: titles[tier],
    rows: sorted.filter((row) => loadTier(row.sets, scale) === tier),
  })).filter((group) => group.rows.length > 0);
  return cardioSets !== undefined && cardioSets > 0 ? { groups, cardioSets } : { groups };
}

/** Kas başına yükün açıklaması; kardiyo kas değildir, ayrı satıra gider. */
export function muscleLoadLegend(load: Partial<Record<Muscle, number>>, scale: LoadScale, locale: Locale = DEFAULT_LOCALE): MuscleLegendData {
  const labels = muscleLabels(locale);
  const rows = BODY_MUSCLES.map((muscle) => ({ key: muscle, label: labels[muscle], sets: load[muscle] ?? 0 }));
  return loadLegend(rows, scale, load.cardio, locale);
}

/** Hareketin açıklaması: Hedef / Yardımcı / Dengeleyici, kas kas; set değeri yok. */
export function roleLegend(exercise: Worked, locale: Locale = DEFAULT_LOCALE): MuscleLegendData {
  const marks = roleMarks(exercise);
  const roles = roleLabels(locale);
  const labels = muscleLabels(locale);
  const groups = roleLists(exercise)
    .map(([role, muscles]) => ({
      mark: ROLE_TIER[role] as MuscleMark,
      title: roles[role],
      rows: muscles
        .filter((muscle): muscle is BodyMuscle => isBodyMuscle(muscle) && marks[muscle] === ROLE_TIER[role])
        .map((muscle) => ({ key: muscle, label: labels[muscle] })),
    }))
    .filter((group) => group.rows.length > 0);
  return { groups };
}

/** Gelişimin açıklaması: dört karar hep yazılır (kası olmasa da), sonda "Veri az". */
export function statusLegend(statuses: Partial<Record<BodyMuscle, MuscleStatusTone>>, locale: Locale = DEFAULT_LOCALE): MuscleLegendData {
  const t = catalogMessages(locale).muscleMap;
  const labels = muscleLabels(locale);
  const tones: MuscleStatusTone[] = ['strong', 'improved', 'stable', 'declined'];
  const groups: LegendGroup[] = tones.map((tone) => ({
    mark: STATUS_MARK[tone],
    title: t.statuses[tone],
    rows: BODY_MUSCLES.filter((muscle) => statuses[muscle] === tone).map((muscle) => ({ key: muscle, label: labels[muscle] })),
  }));
  return { groups: [...groups, { mark: 'empty', title: t.noData, rows: [] }] };
}

/**
 * Yük haritasının ortak propları (`MuscleMap`'e yayılır): işaret, açıklama ve ekran okuyucu adı ("{önek}: en çok çalışan 6
 * kas"). Yalnız veri: sunucu bileşeninden de geçer; üstüne gelince yazıyı harita açıklamadan kurar (`legendText`). `rows`
 * verilirse açıklama onlardan kurulur (antrenman özetinin aile satırları); `legend: false` küçük kart içindir.
 */
export function loadMapProps(
  load: Partial<Record<Muscle, number>>,
  scale: LoadScale,
  prefix: string,
  options: { legend?: boolean; rows?: readonly LoadRow[] } = {},
  locale: Locale = DEFAULT_LOCALE,
): { marks: MuscleMarks; legend?: MuscleLegendData; label: string } {
  const t = catalogMessages(locale).muscleMap;
  const worked = BODY_MUSCLES.filter((muscle) => (load[muscle] ?? 0) > 0).sort((a, b) => (load[b] ?? 0) - (load[a] ?? 0));
  const label = worked.length > 0 ? t.loadLabel(prefix, summarizeMuscles(worked.slice(0, 6), locale).join(', ')) : t.noLoad(prefix);
  const marks = loadMarks(load, scale);
  if (options.legend === false) return { marks, label };
  const legend = options.rows ? loadLegend(options.rows, scale, load.cardio, locale) : muscleLoadLegend(load, scale, locale);
  return { marks, legend, label };
}

/** Hareket haritasının ortak propları: işaret, açıklama ve ekran okuyucu adı ("Çalışan kaslar: …"). */
export function roleMapProps(exercise: Worked, locale: Locale = DEFAULT_LOCALE): { marks: MuscleMarks; legend: MuscleLegendData; label: string } {
  const t = catalogMessages(locale).muscleMap;
  const marks = roleMarks(exercise);
  // Rol sırasıyla: önce hedef, sonra yardımcı, sonra dengeleyici.
  const legend = roleLegend(exercise, locale);
  const worked = legend.groups.flatMap((group) => group.rows.map((row) => row.key as BodyMuscle));
  const label = worked.length > 0 ? t.worked(summarizeMuscles(worked, locale).join(', ')) : t.noneMarked;
  return { marks, legend, label };
}

/** Kasın açıklamadaki kısa yazısı (haritada üstüne gelince): "Ön bacak · 6 set" ya da "Ön bacak · hedef"; yoksa `null`. */
export function legendText(legend: MuscleLegendData, key: string, locale: Locale = DEFAULT_LOCALE): string | null {
  const t = catalogMessages(locale).muscleMap;
  for (const group of legend.groups) {
    const row = group.rows.find((item) => item.key === key);
    if (row) return `${row.label} · ${row.sets !== undefined ? t.sets(row.sets, getFormat(locale).number(row.sets)) : lower(locale, group.title)}`;
  }
  return null;
}
