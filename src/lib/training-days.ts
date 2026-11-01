import {
  cleanWeekdays,
  dayOnWeekday,
  hasAssignments,
  phaseWeekdays,
  WEEKDAY_NAMES,
  WEEKDAY_SHORT,
  WEEKDAYS,
  weekAssignments,
  weekdaysText,
  type AssignableDay,
  type Weekday,
} from './day-assignments.ts';
import { appendLog, mondayOf, type ClientSchedule, type ProgramLogEntry, type ProgramSchedule } from './program-plan.ts';

/**
 * Antrenman günleri (tasarım §2.11; Faz 3: güne atanmış programlar) — saf. Haftanın günleri, takvim değil.
 *
 * - Günleri yalnız PT belirler: şu anki evrenin her programı (günü) hafta günlerine atanır (`day-assignments.ts`,
 *   ISO: 1 = Pazartesi … 7 = Pazar). Geçerli günler atamaların birleşimi (`effectiveSchedule`); `schedule.weekdays`
 *   her yazımda bundan türer. Kendi programda yazar danışandır: atamalar programın formunda.
 * - Danışanın eski gün katmanı (`clientSchedule`) okunur ama yok sayılır; kayıtta durdukça kaçan gün penceresi bugünden
 *   başlar (`scheduleSince`). PT'nin ilk kaydı ya da evre geçişi katmanı siler.
 * - Bugün, bugüne atanmış programı gösterir (`todayAssigned`, `upcomingAssigned`); bu yalnız kolaylıktır, danışan her
 *   gün istediği programı yapar. Dönüş (A → B → C) yok: pazartesi yapılan program salının atamasını kaydırmaz.
 * - "Bu hafta x/y": y atanmış gün sayısı, atama yoksa evrenin haftalık sıklığı (`phaseFrequency`); hafta pazartesi
 *   başlar, uygulamanın saat diliminde (`weekOf`).
 * - Dönüşe dayanan Faz 2 işlevleri (`weekPlan`, `weekRotation`, `todayCardTitle`, `todayState`,
 *   `nextTrainingDate`, `relativeDayText`) ekranlar yenilerine geçene kadar kalır.
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
  /** Faz 3'te hep null: danışanın katmanı yok sayılır. Alan, tüketenleri kalkana kadar duruyor. */
  client: { weekdays: Weekday[]; at: string } | null;
  /** Geçerli günlerin kaynağı; hiç gün yoksa null (Faz 3'te hiç 'client' değil). */
  source: 'client' | 'pt' | null;
};

/**
 * Geçerli günler (Faz 3): yalnız PT'nin. Atamalı programda şu anki evrenin birleşimi, atamasızda `schedule.weekdays`
 * (eski dosyada türetme yüzünden pratikte boş). Danışanın katmanı (`clientSchedule`) okunur ama yok sayılır:
 * `client` hep null, `source` 'pt' ya da null.
 */
export function effectiveSchedule(program: Scheduled): EffectiveSchedule {
  const days = currentPhase(program)?.days ?? [];
  const pt = hasAssignments(days) ? normalizeWeekdays(phaseWeekdays(days)) : normalizeWeekdays(program.schedule?.weekdays ?? []);
  return { weekdays: pt, pt: [...pt], client: null, source: pt.length > 0 ? 'pt' : null };
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

/** Seçilen gün sayısı haftalık sıklıktan farklı mı (iki tarafta küçük uyarı; engel değil). */
export function frequencyMismatch(weekdays: readonly number[], daysPerWeek?: number): boolean {
  const count = normalizeWeekdays(weekdays).length;
  return count > 0 && daysPerWeek !== undefined && count !== daysPerWeek;
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

export type WeekPlanState = 'done' | 'missed' | 'next' | 'planned' | 'rest';
export type WeekPlanDay = StripDay & { state: WeekPlanState; label: string | null };

/** Hafta şeridinin dönüşü: günlerin adları ve sıranın başladığı yer (`weekPlan`, `weekRotation`). */
export type WeekRotation = {
  names: readonly string[];
  /** Programın sıradaki günü (`nextDayId`'nin sırası). */
  next: number;
  /**
   * Bugün başlamış yarım antrenmanın günü (`names`'teki sırası): dönüş yalnız bitişte ilerler, bugünkü antrenman o
   * günü yapar ("Başka gün seç"te sıradaki günden farklı). Bugün açık bir antrenman günüyse (seçili, bugün bitmiş
   * antrenman yok) bugün o gün "sırada"; değilse (dinlenme günü ya da bugün bir antrenman zaten bitti) sonraki seçili
   * günler onun arkasından sürer. Yoksa (null) `next`.
   *
   * Tahmin antrenmanın dönüşü ilerleterek ("advance") biteceğini varsayar. Bitişte "keep" seçilirse dönüş
   * `next`'te kalır; bu seçim belgeye yalnız bitişte yazılır (`session-finish.ts`), yarım antrenmanda bilinmez.
   */
  active?: number | null;
};

/** Yarım antrenmanın şeride giren bilgisi: günü ve başlangıç tarihi. */
export type ActiveDay = { dayId: string; date: string };

/**
 * Bugün'ün hafta şeridi (Faz 2): her gün yapıldı (oturumun adı; aynı gün birden çoksa sonuncusu) · kaçtı ·
 * sırada (bugün dahil ilk yapılmamış seçili gün) · planlı · dinlenme. Program modeli dönüş sırası olduğundan
 * sıradaki ve sonraki seçili günlerin adı dönüşten tahmindir (`rotation.next`'ten, bugün yarım antrenman varsa
 * `rotation.active`'ten başlayıp sarar; tam sayı değilse baştan, eksi ya da listeden büyükse listeye sarılarak:
 * bozuk sıra adları düşürmez); Faz 3'te gün ↔ antrenman eşlemesi gelince bu tahmin kalkar.
 */
export function weekPlan(input: {
  today: string;
  weekdays: readonly number[];
  /** Yapılan günler (`week.days`); adlar `sessions`'tan. Ad yoksa gün yine "yapıldı". */
  doneDays?: Iterable<string>;
  sessions: readonly { date: string; dayName: string }[];
  since?: string | null | undefined;
  rotation: WeekRotation;
}): WeekPlanDay[] {
  const done = new Map(input.sessions.map((session) => [session.date, session.dayName]));
  const doneDays = new Set([...(input.doneDays ?? []), ...done.keys()]);
  const strip = weekStrip({ today: input.today, weekdays: input.weekdays, doneDays, since: input.since });
  const { names, next, active } = input.rotation;
  const len = names.length;
  const wrap = (value: number) => ((value % len) + len) % len;
  // Yarım antrenman bugünü kaplar: bugün açık antrenman günü değilse sonraki seçili gün onun arkasındaki gün.
  const todayOpen = strip.some((day) => day.today && day.selected && !day.done);
  const base = !len
    ? 0
    : typeof active === 'number' && Number.isInteger(active)
      ? wrap(active + (todayOpen ? 0 : 1))
      : Number.isInteger(next)
        ? wrap(next)
        : 0;
  let step = 0;
  return strip.map((day): WeekPlanDay => {
    if (day.done) return { ...day, state: 'done', label: done.get(day.date) ?? null };
    if (day.missed) return { ...day, state: 'missed', label: null };
    if (!day.selected || day.date < input.today) return { ...day, state: 'rest', label: null };
    const label = len > 0 ? (names[(base + step) % len] ?? null) : null;
    const state: WeekPlanState = step === 0 ? 'next' : 'planned';
    step += 1;
    return { ...day, state, label };
  });
}

/**
 * Hafta şeridinin dönüşü programın günlerinden (`weekPlan`'ın `rotation`'ı): sıra `nextDayId`'nin yerinden
 * (bulunamazsa ilk gün, "Başka gün seç" gibi). Yarım antrenman bugün başladıysa ve günü bu günlerdeyse `active`
 * onun sırası: dönüş bitişte ilerlediği için şerit onun gününden sürer. Önceki günden kalan yarım antrenman tahmine
 * girmez (bugün sürdürülür mü, bitirilir mi bilinmez); başka evrenin ya da programın günü de.
 */
export function weekRotation(input: {
  days: readonly { id: string; name: string }[];
  nextDayId: string | null;
  today: string;
  active?: ActiveDay | null | undefined;
}): WeekRotation {
  const { days, active } = input;
  const next = Math.max(0, days.findIndex((day) => day.id === input.nextDayId));
  const counted = active && active.date === input.today;
  const activeIndex = counted ? days.findIndex((day) => day.id === active.dayId) : -1;
  return { names: days.map((day) => day.name), next, active: activeIndex >= 0 ? activeIndex : null };
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

/** Sıradaki antrenman günü: bugünden sonraki (ya da `includeToday` ise bugünden başlayan) ilk seçili gün. */
export function nextTrainingDate(today: string, weekdays: readonly number[], options: { includeToday?: boolean } = {}): string | null {
  const selected = new Set(normalizeWeekdays(weekdays));
  if (selected.size === 0) return null;
  for (let offset = options.includeToday ? 0 : 1; offset <= 7; offset += 1) {
    const date = addDays(today, offset);
    if (selected.has(isoWeekdayOf(date))) return date;
  }
  return null;
}

/** Bugünün durumu (Bugün kartında dinlenme ve yapıldı satırı). */
export type TodayState =
  /** Gün seçilmemiş. */
  | { kind: 'none' }
  /** Bugün seçili gün, henüz antrenman yok. */
  | { kind: 'training' }
  /** Bugün antrenman yapıldı. */
  | { kind: 'done'; next: string | null }
  /** Dinlenme günü; sıradaki seçili gün. */
  | { kind: 'rest'; next: string };

export function todayState(input: { today: string; weekdays: readonly number[]; doneToday: boolean }): TodayState {
  const next = nextTrainingDate(input.today, input.weekdays);
  if (normalizeWeekdays(input.weekdays).length === 0 || next === null) return { kind: 'none' };
  if (input.doneToday) return { kind: 'done', next };
  if (normalizeWeekdays(input.weekdays).includes(isoWeekdayOf(input.today))) return { kind: 'training' };
  return { kind: 'rest', next };
}

/** "yarın", "Çarşamba", bir hafta sonrası "gelecek Salı". */
export function relativeDayText(date: string, today: string): string {
  const offset = dayIndex(date) - dayIndex(today);
  if (offset === 1) return 'yarın';
  const name = WEEKDAY_NAMES[isoWeekdayOf(date)];
  return offset >= 7 ? `gelecek ${name}` : name;
}

/**
 * Bugün kartının başlığı (Faz 2): sıradaki antrenmanın günü ve adı ("Pazartesi · Gün A"); bugünkü antrenman
 * yapıldıysa bugünden sonraki ilk seçili gün. Gün seçilmemişse yalnız ad. Ad dönüş sırasından (`nextDayId`); Faz 3'e
 * (gün ↔ antrenman eşlemesi) kadar dinlenme gününde de sıradaki günü söyler.
 */
export function todayCardTitle(input: { today: string; weekdays: readonly number[]; doneToday: boolean; dayName: string }): string {
  const date = nextTrainingDate(input.today, input.weekdays, { includeToday: !input.doneToday });
  return date ? `${WEEKDAY_NAMES[isoWeekdayOf(date)]} · ${input.dayName}` : input.dayName;
}

/* --- değişiklikler --- */

type SchedulableProgram = Scheduled & { revision: number; log: ProgramLogEntry[] };

function withoutClientSchedule<P extends Scheduled>(program: P): P {
  const { clientSchedule: _dropped, ...rest } = program;
  return rest as P;
}

/**
 * PT: "PT'nin günlerine dön": danışanın katmanı silinir, geçmişe PT'nin kaydı olarak yazılır; revision
 * artmaz (açık düzenleyici 412 almaz). `schedule.at` şimdi olur (kaçan gün penceresi katmanın anından geri
 * gitmesin). Katman `effectiveSchedule`'da yok sayıldığı için kayıttaki ham alandan okunur; boşsa ya da yoksa null.
 */
export function resetClientSchedule<P extends SchedulableProgram>(program: P, now: Date): { program: P; text: string } | null {
  const layer = normalizeWeekdays(program.clientSchedule?.weekdays ?? []);
  if (layer.length === 0) return null;
  const pt = effectiveSchedule(program).pt;
  const at = now.toISOString();
  const text = pt.length > 0
    ? `Danışanın günleri kaldırıldı (${weekdaysText(layer)}); geçerli günler: ${weekdaysText(pt)}`
    : `Danışanın günleri kaldırıldı (${weekdaysText(layer)})`;
  return {
    program: {
      ...withoutClientSchedule(program),
      ...(program.schedule ? { schedule: { ...program.schedule, at } } : {}),
      log: appendLog(program.log, { at, revision: program.revision, kind: 'edit', changes: [{ text }] }),
    },
    text,
  };
}
