import { formatNumber } from './format.ts';
import { BODY_MUSCLES, ROLE_LABELS, isBodyMuscle, summarizeMuscles, type BodyMuscle, type MuscleRole } from './muscles.ts';
import { MUSCLE_LABELS, type Exercise, type Muscle } from './schemas/exercise.ts';

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

export const LOAD_TIER_TITLES: Record<LoadScale, Record<MuscleTier, string>> = {
  session: { filled: '3 set ve üstü', striped: '1,5–2,75 set', dotted: '1,5 setten az' },
  weekly: { filled: '10 set ve üstü', striped: '5–9,75 set', dotted: '5 setten az' },
};

/** Yük haritalarının (şablon, program günü) açıklaması. */
export const LOAD_DESCRIPTION =
  'Kas başına çalışma seti: hedef 1, yardımcı 0,5, dengeleyici 0,25 sayılır; ısınma ve soğuma hareketleri sayılmaz.';

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

const STATUS_TITLES: Record<MuscleStatusTone, string> = {
  strong: 'Belirgin gelişme (%5 ve üstü)',
  improved: 'Gelişme',
  stable: 'Sabit',
  declined: 'Gerileme',
};

/** Açıklamanın bir satırı: kas ve varsa set değeri, not ("az / yeterli / fazla") ve uyarı. */
export type LegendRow = { key: string; label: string; sets?: number; note?: string; warn?: boolean };
/** Bir kademenin başlığı ve kasları. `empty` yalnız gelişimde: "Veri az". */
export type LegendGroup = { mark: MuscleMark | 'empty'; title: string; rows: LegendRow[] };
export type MuscleLegendData = { groups: LegendGroup[]; cardioSets?: number };

type LoadRow = { key: string; label: string; sets: number; note?: string; warn?: boolean };

/** Yük satırları kademeye göre gruplu, her grupta setler büyükten küçüğe; boş grup ve sıfır satır yazılmaz. */
export function loadLegend(rows: readonly LoadRow[], scale: LoadScale, cardioSets?: number): MuscleLegendData {
  const sorted = rows.filter((row) => row.sets > 0).sort((a, b) => b.sets - a.sets);
  const groups = TIER_ORDER.map((tier) => ({
    mark: tier,
    title: LOAD_TIER_TITLES[scale][tier],
    rows: sorted.filter((row) => loadTier(row.sets, scale) === tier),
  })).filter((group) => group.rows.length > 0);
  return cardioSets !== undefined && cardioSets > 0 ? { groups, cardioSets } : { groups };
}

/** Kas başına yükün açıklaması; kardiyo kas değildir, ayrı satıra gider. */
export function muscleLoadLegend(load: Partial<Record<Muscle, number>>, scale: LoadScale): MuscleLegendData {
  const rows = BODY_MUSCLES.map((muscle) => ({ key: muscle, label: MUSCLE_LABELS[muscle], sets: load[muscle] ?? 0 }));
  return loadLegend(rows, scale, load.cardio);
}

/** Hareketin açıklaması: Hedef / Yardımcı / Dengeleyici, kas kas; set değeri yok. */
export function roleLegend(exercise: Worked): MuscleLegendData {
  const marks = roleMarks(exercise);
  const groups = roleLists(exercise)
    .map(([role, muscles]) => ({
      mark: ROLE_TIER[role] as MuscleMark,
      title: ROLE_LABELS[role],
      rows: muscles
        .filter((muscle): muscle is BodyMuscle => isBodyMuscle(muscle) && marks[muscle] === ROLE_TIER[role])
        .map((muscle) => ({ key: muscle, label: MUSCLE_LABELS[muscle] })),
    }))
    .filter((group) => group.rows.length > 0);
  return { groups };
}

/** Gelişimin açıklaması: dört karar hep yazılır (kası olmasa da), sonda "Veri az". */
export function statusLegend(statuses: Partial<Record<BodyMuscle, MuscleStatusTone>>): MuscleLegendData {
  const tones: MuscleStatusTone[] = ['strong', 'improved', 'stable', 'declined'];
  const groups: LegendGroup[] = tones.map((tone) => ({
    mark: STATUS_MARK[tone],
    title: STATUS_TITLES[tone],
    rows: BODY_MUSCLES.filter((muscle) => statuses[muscle] === tone).map((muscle) => ({ key: muscle, label: MUSCLE_LABELS[muscle] })),
  }));
  return { groups: [...groups, { mark: 'empty', title: 'Veri az ya da çalışılmadı', rows: [] }] };
}

/**
 * Yük haritasının ortak propları (`MuscleMap`'e yayılır): işaret, açıklama, ekran okuyucu adı ("{önek}: en çok çalışan 6
 * kas") ve üstüne gelince yazı ("Ön bacak · 6 set"). `rows` verilirse açıklama onlardan kurulur (antrenman özetinin aile
 * satırları); `legend: false` küçük kart içindir.
 */
export function loadMapProps(
  load: Partial<Record<Muscle, number>>,
  scale: LoadScale,
  prefix: string,
  options: { legend?: boolean; rows?: readonly LoadRow[] } = {},
): { marks: MuscleMarks; legend?: MuscleLegendData; label: string; describe: (muscle: BodyMuscle) => string } {
  const worked = BODY_MUSCLES.filter((muscle) => (load[muscle] ?? 0) > 0).sort((a, b) => (load[b] ?? 0) - (load[a] ?? 0));
  const label = worked.length > 0 ? `${prefix}: ${summarizeMuscles(worked.slice(0, 6)).join(', ')}` : `${prefix}: kas yükü yok`;
  const describe = (muscle: BodyMuscle) => `${MUSCLE_LABELS[muscle]} · ${formatNumber(load[muscle] ?? 0)} set`;
  const marks = loadMarks(load, scale);
  if (options.legend === false) return { marks, label, describe };
  const legend = options.rows ? loadLegend(options.rows, scale, load.cardio) : muscleLoadLegend(load, scale);
  return { marks, legend, label, describe };
}
