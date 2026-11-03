import {
  cleanWeekdays,
  dayOnWeekday,
  hasAssignments,
  phaseWeekdays,
  WEEKDAY_NAMES,
  WEEKDAY_SHORT,
  WEEKDAYS,
  weekAssignments,
  type AssignableDay,
  type Weekday,
} from './day-assignments.ts';
import { mondayOf, type ClientSchedule, type ProgramSchedule } from './program-plan.ts';

/**
 * Antrenman günleri (tasarım §2.11; Faz 3: güne atanmış programlar) — saf. Haftanın günleri, takvim değil.
 *
 * - Günleri yalnız PT belirler: şu anki evrenin her programı (günü) hafta günlerine atanır (`day-assignments.ts`,
 *   ISO: 1 = Pazartesi … 7 = Pazar). Geçerli günler atamaların birleşimi (`effectiveSchedule`); `schedule.weekdays`
 *   her yazımda bundan türer. Kendi programda yazar danışandır: atamalar programın formunda.
 * - Danışanın eski gün katmanı (`clientSchedule`) okunur ama yok sayılır; kayıtta durdukça kaçan gün penceresi bugünden
 *   başlar (`scheduleSince`). PT'nin ilk kaydı ya da evre geçişi katmanı siler.
 * - Bugün, bugüne atanmış programı gösterir (`todayAssigned`, `upcomingAssigned`); bu yalnız kolaylıktır, danışan her
 *   gün istediği programı yapar. Programlar sırayla dönmez: pazartesi yapılan program salının atamasını kaydırmaz.
 * - "Bu hafta x/y": y atanmış gün sayısı, atama yoksa evrenin haftalık sıklığı (`phaseFrequency`); hafta pazartesi
 *   başlar, uygulamanın saat diliminde (`weekOf`).
 *
 * Tarihler takvim günüdür ("2026-09-26"): UTC'de hesaplanır, saat dilimine çevrilmez.
 */

// Hafta günü sabitleri ve metinleri `day-assignments.ts`'te: `program-plan.ts` de okur, bu dosyayı içe aktarsa
// döngü olurdu. Çağıranların importları değişmesin diye buradan da dışa aktarılır.
export {
  isWeekday,
  sameWeekdays,
  WEEKDAY_NAMES,
  WEEKDAY_SHORT,
  WEEKDAYS,
  weekdaysChangeText,
  weekdaysText,
  type Weekday,
} from './day-assignments.ts';

const DAY_MS = 86_400_000;

/** Geçerli günler, her biri bir kez, pazartesiden pazara (`cleanWeekdays` yalnız 1–7 bırakır). */
export function normalizeWeekdays(list: readonly unknown[]): Weekday[] {
  return cleanWeekdays(list) as Weekday[];
}

type AssignedPhase = { id: string; daysPerWeek?: number | undefined; days: readonly AssignableDay[] };
type Assigned = { phases?: readonly AssignedPhase[] | undefined; current?: { phaseId: string } | undefined };
type Scheduled = { schedule?: ProgramSchedule | undefined; clientSchedule?: ClientSchedule | undefined } & Assigned;

/** Şu anki evre (`currentPhaseOf` gibi: kimlik bulunamazsa ilk evre); evre yoksa null. */
function currentPhase<P extends { id: string }>(program: { phases?: readonly P[] | undefined; current?: { phaseId: string } | undefined }): P | null {
  const phases = program.phases ?? [];
  return phases.find((phase) => phase.id === program.current?.phaseId) ?? phases[0] ?? null;
}

export type EffectiveSchedule = {
  /** Geçerli günler (Faz 3: yalnız PT'nin); boşsa atanmamış. */
  weekdays: Weekday[];
  /** PT'nin günleri (`weekdays`'in aynısı). */
  pt: Weekday[];
  /** Geçerli günlerin kaynağı; hiç gün yoksa null. Danışanın katmanı yok sayıldığından hep PT. */
  source: 'pt' | null;
};

/**
 * Geçerli günler (Faz 3): yalnız PT'nin. Atamalı programda şu anki evrenin birleşimi, atamasızda `schedule.weekdays`
 * (eski dosyada türetme yüzünden pratikte boş). Danışanın eski katmanı (`clientSchedule`) okunur ama yok sayılır.
 */
export function effectiveSchedule(program: Scheduled): EffectiveSchedule {
  const days = currentPhase(program)?.days ?? [];
  const pt = hasAssignments(days) ? normalizeWeekdays(phaseWeekdays(days)) : normalizeWeekdays(program.schedule?.weekdays ?? []);
  return { weekdays: pt, pt: [...pt], source: pt.length > 0 ? 'pt' : null };
}

function latestIso(values: readonly (string | undefined)[]): string | undefined {
  let best: { at: number; iso: string } | undefined;
  for (const iso of values) {
    const at = iso ? Date.parse(iso) : Number.NaN;
    if (iso && !Number.isNaN(at) && (!best || at > best.at)) best = { at, iso };
  }
  return best?.iso;
}

/**
 * Kaçan gün penceresinin başladığı an (§2.11): programın kurulduğu, geçerli günlerin son değiştiği (PT'nin
 * değişikliği ya da danışan katmanının kalkması), danışanın ilk girişi ve durumunun son değiştiği (duraklatılıp
 * yeniden açılma) anların en yenisi. O günün kendisi ve öncesi kaçmış sayılmaz: danışan yetişemeyebilirdi. Genel
 * bakış'ın "Kaçan gün"ü (`attention.ts`) ve Bugün'ün gün şeridi (`weekStrip`) aynı kuralla; hiçbiri bilinmiyorsa
 * undefined.
 *
 * Kayıtta danışanın eski gün katmanı (ham `clientSchedule`) durdukça pencere şimdiden (`now`) başlar (Faz 3, Karar 3,
 * 4): `effectiveSchedule` katmanı artık yok sayar ve PT'nin günlerini gösterir, ama danışan yayına kadar kendi
 * günlerini izliyordu; katmanın anından başlasa aradaki bütün PT günleri "kaçtı" olurdu. İlk PT kaydı ya da evre
 * geçişi katmanı düşürür ve `schedule.at`'i o ana alır (`settleSchedule`): pencere oradan sürer, iki hâl aynı yere varır.
 */
export function scheduleSince(
  program: Scheduled & { createdAt?: string | undefined },
  client: { access: { joinedAt?: string | undefined; lastJoinAt?: string | undefined }; statusChangedAt?: string | undefined },
  now: Date,
): string | undefined {
  return latestIso([
    program.createdAt,
    program.schedule?.at,
    program.clientSchedule ? now.toISOString() : undefined,
    client.access.joinedAt ?? client.access.lastJoinAt,
    client.statusChangedAt,
  ]);
}

/** "Bu hafta x/y"nin y'si: seçili gün sayısı, yoksa haftalık sıklık, o da yoksa null. */
export function weekTarget(weekdays: readonly number[], daysPerWeek?: number): number | null {
  const count = normalizeWeekdays(weekdays).length;
  return count > 0 ? count : (daysPerWeek ?? null);
}

/** Evrenin haftalık sıklığı: atanmış gün sayısı, atama yoksa `daysPerWeek` (ekranlardaki "haftada 3"). */
export function phaseFrequency(phase: { daysPerWeek?: number | undefined; days: readonly AssignableDay[] }): number | undefined {
  const assigned = phaseWeekdays(phase.days).length;
  return assigned > 0 ? assigned : phase.daysPerWeek;
}

/**
 * "Bu hafta x/y"nin y'si programdan: şu anki evrenin `phaseFrequency`'si (Bugün, İlerleme, hedeflerin
 * dondurulması). Dondurma (`writeProgramFile`) bunu kullanır: eski programın ilk PT kaydı atamalı evrede
 * `daysPerWeek`'i düşürür, yalnız sıklığa bakan dondurma sonraki yazımda hedefi kalıcı olarak 1 yapardı. Evre ya da
 * sıklık yoksa undefined.
 */
export function programWeekTarget(program: Scheduled & { phases: readonly AssignedPhase[]; current: { phaseId: string } }): number | undefined {
  const phase = currentPhase(program);
  return phase ? phaseFrequency(phase) : undefined;
}

/** Bugüne atanmış program (Bugün kartı, `plannedDayId`); yoksa null. */
export function todayAssigned<D extends AssignableDay>(days: readonly D[], today: string): D | null {
  return dayOnWeekday(days, isoWeekdayOf(today));
}

/**
 * Bugünün ya da sıradaki atanmış program (Faz 3, `nextDayId`'nin yerine): şu anki evrede bugüne atanmış program,
 * yoksa bugünden sonraki ilk atanmış gün (en çok 6 gün ileri). Atama yoksa null. Dün yapılan program sırayı
 * kaydırmaz (kullanıcı kararı 4).
 */
export function upcomingAssigned(
  program: { phases: readonly { id: string; days: readonly AssignableDay[] }[]; current: { phaseId: string } },
  today: string,
): { dayId: string; date: string } | null {
  const days = currentPhase(program)?.days ?? [];
  for (let offset = 0; offset < WEEKDAYS.length; offset += 1) {
    const date = addDays(today, offset);
    const day = dayOnWeekday(days, isoWeekdayOf(date));
    if (day) return { dayId: day.id, date };
  }
  return null;
}

/** "Sal · Alt vücut, Per · Üst vücut"; atama yoksa boş. */
export function assignmentsText(days: readonly AssignableDay[]): string {
  return weekAssignments(days)
    .map(({ weekday, day }) => `${WEEKDAY_SHORT[weekday as Weekday]} · ${day.name}`)
    .join(', ');
}

/** "Salı, Perşembe" (PT'nin program kartı, sheet satırı); pazartesiden sıralı. */
export function weekdayNamesText(list: readonly number[]): string {
  return normalizeWeekdays(list)
    .map((weekday) => WEEKDAY_NAMES[weekday])
    .join(', ');
}

/* --- takvim --- */

function dayIndex(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Math.floor(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / DAY_MS);
}

/** Takvim gününe gün ekler: ("2026-09-26", 2) → "2026-09-28". */
export function addDays(day: string, days: number): string {
  return new Date((dayIndex(day) + days) * DAY_MS).toISOString().slice(0, 10);
}

/** Takvim gününün ISO hafta günü (1 = Pazartesi). */
export function isoWeekdayOf(day: string): Weekday {
  // 1970-01-01 perşembe (4).
  return (((((dayIndex(day) + 3) % 7) + 7) % 7) + 1) as Weekday;
}

/** Günün haftası: pazartesiden pazara yedi takvim günü. */
export function weekDates(day: string): string[] {
  const monday = mondayOf(day);
  return WEEKDAYS.map((_, index) => addDays(monday, index));
}

export type StripDay = {
  date: string;
  weekday: Weekday;
  /** Antrenman günü (geçerli günlerden). */
  selected: boolean;
  /** O gün antrenman yapıldı (seçili olmasa da). */
  done: boolean;
  /** Seçili gün geçti ve o gün antrenman yok; pencereden (`since`) önceki gün kaçmış sayılmaz. */
  missed: boolean;
  today: boolean;
};

/**
 * Bugün kartının 7 günlük şeridi (pazartesi başlar): seçili günler halkalı, yapılanlar dolu, kaçanlar
 * soluk. `doneDays`: bu hafta antrenman yapılan günler (`weekOf().days`). `since`: kaçan gün penceresinin
 * başladığı takvim günü (`scheduleSince`, uygulamanın saat diliminde); o gün ve öncesi kaçmış sayılmaz
 * (pazar kurulan programda o haftanın pazartesisi "kaçırıldı" olmaz).
 */
export function weekStrip(input: { today: string; weekdays: readonly number[]; doneDays: Iterable<string>; since?: string | null | undefined }): StripDay[] {
  const selected = new Set(normalizeWeekdays(input.weekdays));
  const done = new Set(input.doneDays);
  return weekDates(input.today).map((date) => {
    const weekday = isoWeekdayOf(date);
    const isSelected = selected.has(weekday);
    const isDone = done.has(date);
    const counted = !input.since || date > input.since;
    return { date, weekday, selected: isSelected, done: isDone, missed: isSelected && !isDone && date < input.today && counted, today: date === input.today };
  });
}

export type WeekDayState = 'done' | 'missed' | 'planned' | 'rest';
export type WeekDay = StripDay & { state: WeekDayState; label: string | null };

/**
 * Bugün'ün hafta şeridi (Faz 3): yapıldı (oturumun adı; aynı gün birden çoksa sonuncusu) · kaçtı (seçili gün geçti,
 * antrenman yok; pencereden önce değil; ad atamadan) · planlı (bugün ve ilerideki seçili gün; ad atamadan) ·
 * dinlenme. `weekdays`: geçerli günler (`effectiveSchedule`); `names`: şu anki evrenin atamaları (`weekdayNames`).
 * Dönüş tahmini yok: her günün adı o güne atanmış program.
 */
export function assignedWeek(input: {
  today: string;
  weekdays: readonly number[];
  names: Readonly<Partial<Record<number, string>>>;
  /** Yapılan günler (`week.days`); adlar `sessions`'tan. Ad yoksa gün yine "yapıldı". */
  doneDays?: Iterable<string>;
  sessions: readonly { date: string; dayName: string }[];
  since?: string | null | undefined;
}): WeekDay[] {
  const done = new Map(input.sessions.map((session) => [session.date, session.dayName]));
  const doneDays = new Set([...(input.doneDays ?? []), ...done.keys()]);
  const strip = weekStrip({ today: input.today, weekdays: input.weekdays, doneDays, since: input.since });
  return strip.map((day): WeekDay => {
    if (day.done) return { ...day, state: 'done', label: done.get(day.date) ?? null };
    if (day.missed) return { ...day, state: 'missed', label: input.names[day.weekday] ?? null };
    if (day.selected && day.date >= input.today) return { ...day, state: 'planned', label: input.names[day.weekday] ?? null };
    return { ...day, state: 'rest', label: null };
  });
}

/**
 * Şeritteki kısa ad: varsayılan önekle ("Program", Faz 3; saklanan eski adlarda "Gün") başlayanda ardından gelen her
 * şey ("Program A" → "A", "Gün B" → "B"; uygulamanın kopyaladığı "Program A 2" → "A 2", ikisi şeritte ayırt edilsin);
 * öteki adlarda ilk sözcük ("Üst vücut" → "Üst", "Programım" → "Programım").
 */
export function dayShortName(name: string): string {
  const trimmed = name.trim();
  const rest = trimmed.match(/^(?:gün|program)\s+(.+)$/iu)?.[1];
  return rest ?? trimmed.split(/\s+/u)[0] ?? trimmed;
}
