import { DEFAULT_LOCALE, type Locale } from '../i18n/locale.ts';
import { ptShellMessages } from '../i18n/messages/pt-shell/index.ts';
import { compareText, lower } from '../i18n/text.ts';
import { accessState, type AccessState } from './client-status.ts';
import type { Conflict } from './constraint-filter.ts';
import {
  constraintsOf,
  constraintTitle,
  emergencyText,
  isActive,
  isEmergency,
  isPendingReport,
  isRedFlag,
  regionText,
  type Severity,
} from './constraints.ts';
import { cellTitle, constraintSuppress, majorAsymmetry, newestFirst, painHistory, SCREENING_ALERT_DAYS, testName } from './screening.ts';
import { getFormat, todayIn } from './format.ts';
import { sideLabels } from './measurement-log.ts';
import { measurementAlerts, type LineKey } from './measurement-trends.ts';
import { measurementDef, measurementUnitLabels, type MeasurementId } from './measurements.ts';
import { activeItem, type OwnIndex } from './own-program-index.ts';
import { currentPhaseOf, phaseStatus } from './program-plan.ts';
import { parseProposals, pendingProposals } from './proposals.ts';
import { stallCounts } from './recommend.ts';
import type { Client, Invite } from './schemas/client.ts';
import type { HealthRecord, MeasurementEntry } from './schemas/health.ts';
import type { Program } from './schemas/program.ts';
import type { SessionIndex } from './schemas/session.ts';
import { addDays, effectiveSchedule, isoWeekdayOf, normalizeWeekdays, scheduleSince } from './training-days.ts';
import { shortDayText } from './workout-summary.ts';

/**
 * Genel bakış'ın "Dikkat gerektirenler"i (tasarım §2.11, §8 satır 12; SPEC §6) — saf. Danışan başına, PT'nin
 * bir şey yapması gerekebilecek durumlar, aciliyete göre:
 * - **kaçan antrenman günü:** seçili gün geçti, o gün antrenman yok (§2.11; son 7 gün, bugün hariç);
 * - **ilerlemeyen hareket:** öneri motoru üst üste en az 2 antrenman ağırlığı artırmadı (bir önceki antrenman
 *   hedefin altında kaldı: planın gerekçesi `hold` ya da `decrease`) ya da son 2 haftada tıkanma hafifletmesi
 *   (`deload`: üst üste 3 tıkanma) oldu **[sentez]**: motor 3 tıkanmada hafifletir (`DELOAD_AFTER_FAILED`),
 *   2'de PT'nin bir şey değiştirmek için hâlâ vakti vardır. Tıkanma sayılmayanlar motorla aynı (`stallCounts`:
 *   Tanışma ve ayar seansı); eksik, hafif ve yoklamayla hafifletilmiş antrenman seriyi ne artırır ne keser;
 *   "bir defalık" hareket sayılmaz. Hareket son 3 haftada yapılmadıysa (programdan kalkmış olabilir) sayılmaz;
 * - **evre geçişi:** şu anki evrenin süresi doldu, sonraki evre var (`phaseStatus` → `due`);
 * - **bekleyen öneriler** (`proposals.json`);
 * - **ölçümde gerileme:** 4 haftalık eğilim (`measurementAlerts`), yalnız onay sürdükçe (çağıran onayı denetler);
 * - **davet:** danışan henüz giriş yapmadı (davet yok, bekliyor, süresi doldu, kilitlendi).
 *
 * İki adım: `attentionFactsOf` danışanın dosyalarından küçük bir özet çıkarır (Genel bakış'ın danışan başına
 * önbelleğinde durur, bildirimlerle aynı yazımlarda düşer: `notices-store.ts`); zamana bağlı kararlar (kaçan
 * gün, evrenin bitişi, davetin süresi, pencereler) sayfa her açıldığında `attentionItems` ile verilir. Önbellek
 * bayat sunulsa da bugünün kararı bugüne göredir. Yalnız aktif danışanlar; arşivdeki ve duraklatılmış danışanda
 * madde yok.
 */

export const ATTENTION_TUNING = {
  /** Kaçan antrenman günleri: bugünden bu kadar gün geriye (bugün hariç). */
  missedLookbackDays: 7,
  /** "İlerlemiyor": üst üste bu kadar antrenman ağırlık artmadı **[sentez]**. */
  stallStreak: 2,
  /** Tıkanma hafifletmesi bu kadar gün içindeyse **[sentez]**. */
  deloadDays: 14,
  /** Serinin son antrenmanı bundan eskiyse (hareket artık yapılmıyor) sayılmaz **[sentez]**. */
  stallRecentDays: 21,
  /** Ölçüm eğiliminin son ölçümü bundan eskiyse sayılmaz (`measurementAlerts`'in 4 haftası). */
  measurementDays: 28,
  /** Özette tutulan antrenman günleri (kaçan gün penceresinden geniş). */
  sessionDaysKept: 35,
} as const;

export const ATTENTION_KINDS = ['constraint', 'missed', 'screening', 'stalled', 'phase', 'proposals', 'measurement', 'invite'] as const;
export type AttentionKind = (typeof ATTENTION_KINDS)[number];

export function attentionLabels(locale: Locale = DEFAULT_LOCALE): Record<AttentionKind, string> {
  return ptShellMessages(locale).attention.labels;
}

/** Türkçe etiketler (eski çağrılar ve testler); arayüz `attentionLabels(locale)` kullanır. */
export const ATTENTION_LABELS: Record<AttentionKind, string> = attentionLabels('tr');

/**
 * Aciliyet (büyük önce) **[sentez]**: birden çok kaçan antrenman günü danışanın koptuğunu gösterebilir; bekleyen
 * öneri danışanı PT'nin kararına bekletir; hafifletmeye düşen ya da gerileyen hareket ve süresi dolan evre
 * programda bir karar ister; tek kaçan gün, ilerlemeyen hareket ve ölçüm eğilimi izlenir; davet PT'nin işidir
 * ama acil değildir (kilitli ya da süresi dolmuş davet danışanı dışarıda bırakır).
 *
 * **Kırmızı ünlemli** (`tone: 'danger'`) maddeler sağlık güvenliğidir ve hepsi ötekilerin üstündedir (en küçüğü 92 >
 * kaçan günler 90): liste kırmızıları hiçbir zaman sıradan bir maddeyle bölmez.
 */
export const ATTENTION_URGENCY = {
  /** Kırmızı bayrak, yönlendirme yok (kauda ekinada acil metin) — tasarım `kisit-tarama.md` §3.6. */
  redFlag: 95,
  /**
   * Danışan "şiddetli" dedi (onaylı kısıtta kötüleşti ya da şiddetli bildirim), PT bakmadı: günlük hayatı etkileyen
   * bir değişiklik her antrenmanı ilgilendirir (sıradaki programdaki tek çelişkiden, 85, geniş); yönlendirme
   * beklemeyen bir sağlık profesyoneli kararının (95) altında, kaçan günlerin (90) üstünde.
   */
  constraintSevere: 92,
  missedMany: 90,
  /** Kısıtla çelişen satır danışanın sıradaki programında (bugüne ya da haftada sıradaki güne atanmış, `upcomingAssigned`). */
  conflictNext: 85,
  /** Danışan kısıt bildirdi, karar bekliyor. */
  report: 80,
  /** Taramada ağrı, gözden geçirilmedi. */
  screeningPain: 78,
  proposals: 75,
  /** Danışan kötüleşti (şiddetli değil) ya da düzeldi dedi. */
  constraintChange: 72,
  deload: 70,
  declining: 65,
  phase: 65,
  /** Programda kısıtla çelişen hareket (sıradaki programda değil). */
  conflict: 66,
  missedOne: 60,
  inviteBlocked: 55,
  stalled: 50,
  measurement: 45,
  /** Yönlendirildi, sağlık profesyonelinin görüşü bekleniyor. */
  referralWaiting: 40,
  /** Taramada büyük asimetri (tarama başına tek madde). */
  asymmetry: 38,
  inviteNone: 35,
  invitePending: 25,
} as const;

/** Bir hareketin tıkanma serisi (index'ten). */
export type StallFact = {
  exerciseId: string;
  /** Üst üste "aynı ağırlık" ya da "azalt" planı: o kadar antrenmandır ağırlık artmadı. */
  streak: number;
  /** Serideki planlardan biri azaltma (`decrease`: bir önceki antrenmanda bütün setler kaçtı). */
  declining: boolean;
  /** Serinin (yoksa hareketin) son antrenmanının günü. */
  lastDate: string;
  /** Son tıkanma hafifletmesinin günü. */
  deloadDate?: string;
};

export type MeasurementDecline = { id: MeasurementId; key: LineKey; change: number; lastDate: string };

/**
 * Kısıtların özeti (tasarım `kisit-tarama.md` §3.6), yalnız `conditions` onayı sürdükçe: kırmızı bayrakta
 * yönlendirme ve görüş, danışanın bildirimleri ve güncellemeleri, programdaki izinsiz yasaklar.
 */
export type ConstraintFacts = {
  /** Kauda ekina şüphesi, yönlendirme yok: acil metin. */
  urgent: { id: string; label: string }[];
  /** Kırmızı bayrak, yönlendirme yok ("Sol diz (ACL erken dönem)"). */
  refer: { id: string; title: string }[];
  /** Yönlendirildi, görüş yok. */
  waiting: { id: string; label: string; referredAt: string }[];
  /** Danışanın karar bekleyen bildirimleri. */
  reports: { id: string; label: string; severity?: Severity }[];
  /**
   * Onaylı kısıtta danışanın bekleyen güncellemesi. `wasSevere`: "düzeldi" demeden önce PT'nin bakmadığı "şiddetli"
   * vardı (süzgeçteki dikkati PT'nin kararına kadar sürer).
   */
  changes: { id: string; label: string; kind: 'worse' | 'better'; from?: Severity; to?: Severity; wasSevere?: true }[];
  /** İzinsiz yasaklar (şu anki evre); `next`: danışanın sıradaki programında. */
  conflicts: { dayName: string; title: string; next: boolean }[];
};

/** Son taramanın özeti, yalnız `screening` onayı sürdükçe. */
export type ScreeningFacts = {
  date: string;
  /** Gözden geçirilmemiş ağrılar ("Kol kaldırma (sağ)"). */
  pain: string[];
  /** Tarama başına tek büyük asimetri (ağrılı, yapılmamış ve etkin kısıtlı taraf hariç). */
  asymmetry: string | null;
};

/**
 * Kayıttan kısıt özeti; çelişkiler çağırandan (program ve kütüphane gerekir). Özetteki bölge adları `locale`
 * dilinde yazılır: özet önbelleği dile göre ayrı tutulur (`notices-store.ts`).
 */
export function constraintFactsOf(
  record: Pick<HealthRecord, 'constraints' | 'conditions' | 'surgeryDate'>,
  conflicts: readonly Conflict[],
  locale: Locale = DEFAULT_LOCALE,
): ConstraintFacts {
  const list = constraintsOf(record);
  const active = list.filter(isActive);
  return {
    urgent: active.filter((item) => isEmergency(item) && !item.referredAt).map((item) => ({ id: item.id, label: regionText(item, locale) })),
    refer: active
      .filter((item) => isRedFlag(item) && !isEmergency(item) && !item.referredAt && !item.clearance)
      .map((item) => ({ id: item.id, title: constraintTitle(item, locale) })),
    waiting: active
      .filter((item) => isRedFlag(item) && item.referredAt && !item.clearance)
      .map((item) => ({ id: item.id, label: regionText(item, locale), referredAt: item.referredAt as string })),
    reports: list
      .filter(isPendingReport)
      .map((item) => ({ id: item.id, label: regionText(item, locale), ...(item.severity ? { severity: item.severity } : {}) })),
    changes: active.flatMap((item) => {
      const change = item.clientChange;
      if (!change) return [];
      return [
        change.resolved
          ? { id: item.id, label: regionText(item, locale), kind: 'better' as const, ...(change.severity === 'severe' ? { wasSevere: true as const } : {}) }
          : {
              id: item.id,
              label: regionText(item, locale),
              kind: 'worse' as const,
              ...(change.previousSeverity ? { from: change.previousSeverity } : {}),
              ...(change.severity ? { to: change.severity } : {}),
            },
      ];
    }),
    conflicts: conflicts.map((item) => ({ dayName: item.dayName, title: item.title, next: item.next })),
  };
}

/**
 * Taramanın özeti: açık ağrılar (`painHistory`: gözden geçirilmemiş ve sonradan ağrısız test edilmemiş; yeni tarama
 * o testi yapmadıysa eski taramanın ağrısı da) ve son taramada tek büyük asimetri (etkin kısıtlı taraf bastırılır).
 */
export function screeningFactsOf(
  record: Pick<HealthRecord, 'screenings' | 'constraints' | 'conditions' | 'surgeryDate'>,
  locale: Locale = DEFAULT_LOCALE,
): ScreeningFacts | null {
  const latest = newestFirst(record.screenings ?? [])[0];
  if (!latest) return null;
  const asymmetry = majorAsymmetry(latest, constraintSuppress(constraintsOf(record)));
  return {
    date: latest.date,
    pain: painHistory(record.screenings ?? []).open.map((cell) => cellTitle(cell.testId, cell.side, false, locale)),
    asymmetry: asymmetry ? testName(asymmetry.testId, locale) : null,
  };
}

/** Danışanın özeti (önbellekte): kararlar sayfa açılınca `attentionItems`'ta. */
export type AttentionFacts = {
  active: boolean;
  access: AccessState;
  /** Kullanılmamış davetin son kullanma anı. */
  inviteExpiresAt?: string;
  /**
   * Geçerli antrenman günleri ve sayılmaya başladığı an: programın kurulduğu, günlerin son değiştiği (PT'nin
   * değişikliği, danışanın katmanı ya da katmanın kalkması), danışanın ilk girişi ve durumunun son değiştiği
   * (duraklatılıp yeniden açılma) anların en yenisi.
   */
  schedule: { weekdays: number[]; since: string } | null;
  /** Antrenman yapılan günler (bitmiş, yarım ya da hiç bitirilmemiş), yakın geçmiş. */
  sessionDays: string[];
  stalls: StallFact[];
  /**
   * Evre sürüyor ve sonrası var: bitiş anı gelince geçiş önerilir. `own`: danışan o sırada kendi programıyla
   * çalışıyor (adı; `docs/design/kendi-program.md` §4): madde bunu söyler.
   */
  phase: { name: string; next: string; endsAt: string; own?: string } | null;
  proposals: { count: number; at: string; text?: string } | null;
  measurements: MeasurementDecline[];
  /** Kısıtlar (onay yoksa yok). */
  constraints?: ConstraintFacts | null;
  /** Son tarama (onay yoksa yok). */
  screening?: ScreeningFacts | null;
};

/* --- özet --- */

const STALL_REASONS = new Set(['hold', 'decrease']);
/** Seriyi ne artıran ne kesen gerekçeler: eksik, hafif ilk kez, yoklamayla hafifletilmiş, ağrı kuralı, ara. */
const NEUTRAL_REASONS = new Set(['incomplete', 'lighter_retry', 'lighten', 'pain_hold', 'pain_reduce', 'pain_reduce_unavailable', 'paused']);

function rowTime(row: { startedAt?: string | undefined; date: string }): number {
  const at = Date.parse(row.startedAt ?? `${row.date}T00:00:00.000Z`);
  return Number.isNaN(at) ? 0 : at;
}

/**
 * Hareketlerin tıkanma serileri: bitmiş antrenmanlar eskiden yeniye, satır (yoksa hareket) başına. Aynı hareket
 * iki satırda yapılıyorsa en kötüsü. `rowIds` verilirse yalnız o satırlar (programda hâlâ duranlar).
 */
export function exerciseStalls(index: Pick<SessionIndex, 'items'>, options: { rowIds?: ReadonlySet<string> } = {}): StallFact[] {
  const rows = index.items.filter((row) => row.finishedAt).sort((a, b) => rowTime(a) - rowTime(b));
  const groups = new Map<string, { exerciseId: string; items: { date: string; reason?: string | undefined; stage?: string | undefined; skip: boolean }[] }>();
  for (const row of rows) {
    for (const item of row.exercises) {
      if (options.rowIds && (!item.rowId || !options.rowIds.has(item.rowId))) continue;
      const key = `${item.exerciseId}|${item.rowId ?? ''}`;
      const group = groups.get(key) ?? { exerciseId: item.exerciseId, items: [] };
      group.items.push({ date: row.date, reason: item.reason, stage: item.stage, skip: Boolean(item.oneOff || item.lighter) });
      groups.set(key, group);
    }
  }
  const byExercise = new Map<string, StallFact>();
  for (const { exerciseId, items } of groups.values()) {
    let streak = 0;
    let declining = false;
    let lastDate: string | undefined;
    for (let position = items.length - 1; position >= 0; position -= 1) {
      const item = items[position]!;
      if (item.skip || !item.reason || !stallCounts(item) || NEUTRAL_REASONS.has(item.reason)) continue;
      if (!STALL_REASONS.has(item.reason)) break;
      streak += 1;
      lastDate ??= item.date;
      if (item.reason === 'decrease') declining = true;
    }
    const deload = [...items].reverse().find((item) => !item.skip && item.reason === 'deload' && stallCounts(item));
    const fact: StallFact = {
      exerciseId,
      streak,
      declining,
      lastDate: lastDate ?? items.at(-1)?.date ?? '',
      ...(deload ? { deloadDate: deload.date } : {}),
    };
    const previous = byExercise.get(exerciseId);
    if (!previous || stallRank(fact) > stallRank(previous)) byExercise.set(exerciseId, fact);
  }
  return [...byExercise.values()].filter((fact) => fact.streak >= ATTENTION_TUNING.stallStreak || fact.deloadDate);
}

function stallRank(fact: StallFact): number {
  return (fact.deloadDate ? 1000 : 0) + (fact.declining ? 100 : 0) + fact.streak;
}

/** Ölçümdeki gerilemeler (4 haftalık eğilim) ve her çizginin son ölçüm günü. */
export function measurementDeclines(entries: readonly MeasurementEntry[]): MeasurementDecline[] {
  const latest = entries.reduce((max, entry) => (entry.date > max ? entry.date : max), '');
  if (!latest) return [];
  return measurementAlerts(entries, latest)
    .filter((alert) => alert.kind === 'declining')
    .map((alert) => ({
      id: alert.id,
      key: alert.key,
      change: alert.change,
      lastDate: entries
        .filter((entry) => entry.id === alert.id && (entry.side ?? 'value') === alert.key)
        .reduce((max, entry) => (entry.date > max ? entry.date : max), ''),
    }));
}

/** İki andan yenisi (biri yoksa öteki). */
function later(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(b) > Date.parse(a) ? b : a;
}

/**
 * Danışanın dosyalarından özet. `index` onarılmış index (`readIndex`: başlanıp hiç bitirilmemiş antrenmanlar da
 * satırdır, o gün kaçan sayılmaz), `proposals` ham dosya, `measurements` yalnız ölçüm onayı sürüyorsa (yoksa
 * null). `now` davetin durumu, evre ve pencereler için. `own`: kendi programların index'i (seçim): kalıcı seçim
 * kendi programsa günler onun (index satırından), pencere seçimin anından da sonra başlar (`docs/design/kendi-program.md`
 * §3.2, §4); PT'nin programına dönüşün anı da pencereyi açar.
 */
export function attentionFactsOf(input: {
  client: Pick<Client, 'status' | 'access' | 'statusChangedAt'>;
  invite: Invite | null;
  index: Pick<SessionIndex, 'items'> | null;
  program: Program | null;
  proposals: unknown;
  measurements: readonly MeasurementEntry[] | null;
  constraints?: ConstraintFacts | null;
  screening?: ScreeningFacts | null;
  now: Date;
  own?: OwnIndex | null | undefined;
}): AttentionFacts {
  const { client, program, now } = input;
  const access = accessState(client.access, input.invite, now);
  const invite = input.invite && !input.invite.used ? input.invite : null;
  const selected = activeItem(input.own);
  const activeAt = input.own?.active?.at;

  let schedule: AttentionFacts['schedule'] = null;
  if (selected) {
    // Kendi program: günleri index satırında; pencere programın kurulduğu, günlerin değiştiği ve seçildiği andan sonra.
    const since = later(scheduleSince({ createdAt: selected.createdAt, schedule: { weekdays: selected.weekdays, at: selected.weekdaysAt } }, client, now), activeAt);
    if (selected.weekdays.length > 0 && since) schedule = { weekdays: normalizeWeekdays(selected.weekdays), since };
  } else if (program) {
    const days = effectiveSchedule(program);
    // Günler programdan, günlerin son değişmesinden, ilk girişten, duraklatmadan dönüşten ve PT'nin programına dönüşten önce sayılmaz
    // (Bugün'ün şeridiyle aynı kural); kayıtta danışanın eski katmanı durdukça bugünden.
    const since = later(scheduleSince(program, client, now), activeAt);
    if (days.weekdays.length > 0 && since) schedule = { weekdays: days.weekdays, since };
  }

  const keepFrom = new Date(now.getTime() - ATTENTION_TUNING.sessionDaysKept * 86_400_000).toISOString().slice(0, 10);
  const sessionDays = [...new Set((input.index?.items ?? []).map((row) => row.date).filter((date) => date >= keepFrom))].sort();

  let phase: AttentionFacts['phase'] = null;
  const current = program?.phased ? currentPhaseOf(program) : null;
  const next = current ? program?.phases[current.index + 1] : undefined;
  if (program && current && next) {
    const status = phaseStatus(program, now);
    if (status.kind === 'running' || status.kind === 'due') {
      phase = { name: current.phase.name, next: next.name, endsAt: status.endsAt, ...(selected ? { own: selected.name } : {}) };
    }
  }

  const pending = pendingProposals(parseProposals(input.proposals));
  const newest = pending.reduce<(typeof pending)[number] | undefined>((best, item) => (!best || Date.parse(item.at) > Date.parse(best.at) ? item : best), undefined);
  const proposals = newest ? { count: pending.length, at: newest.at, ...(pending.length === 1 ? { text: newest.text } : {}) } : null;

  const rowIds = program ? new Set(program.phases.flatMap((item) => item.days.flatMap((day) => day.blocks.flatMap((block) => block.rows.map((row) => row.id))))) : undefined;

  return {
    active: client.status === 'active',
    access,
    ...(invite ? { inviteExpiresAt: invite.expiresAt } : {}),
    schedule,
    sessionDays,
    stalls: input.index ? exerciseStalls(input.index, rowIds ? { rowIds } : {}) : [],
    phase,
    proposals,
    measurements: input.measurements ? measurementDeclines(input.measurements) : [],
    ...(input.constraints ? { constraints: input.constraints } : {}),
    ...(input.screening ? { screening: input.screening } : {}),
  };
}

/* --- kararlar --- */

export type AttentionTarget = 'client' | 'sessions' | 'program' | 'measurements' | 'constraints' | 'screening' | 'invite';
/**
 * `tone: 'danger'`: sağlık güvenliği (kırmızı bayrak, kauda ekina, danışanın bakılmamış "şiddetli"si); satırın başında
 * kırmızı ünlem ve ekran okuyucuya "Acil".
 */
export type AttentionTone = 'danger';
export type AttentionItem = { key: string; kind: AttentionKind; urgency: number; text: string; target: AttentionTarget; tone?: AttentionTone };

/**
 * Kaçan antrenman günleri (§2.11): son `lookbackDays` gün (bugün hariç), seçili hafta günü, o gün antrenman
 * yok. `since` günü ve öncesi sayılmaz: program (ya da danışanın ilk girişi) o gün olduysa danışan yetişemeyebilirdi.
 */
export function missedTrainingDays(input: {
  weekdays: readonly number[];
  sessionDays: Iterable<string>;
  today: string;
  since?: string | undefined;
  lookbackDays?: number;
}): string[] {
  const selected = new Set(normalizeWeekdays(input.weekdays));
  const done = new Set(input.sessionDays);
  const missed: string[] = [];
  for (let offset = input.lookbackDays ?? ATTENTION_TUNING.missedLookbackDays; offset >= 1; offset -= 1) {
    const day = addDays(input.today, -offset);
    if (input.since && day <= input.since) continue;
    if (selected.has(isoWeekdayOf(day)) && !done.has(day)) missed.push(day);
  }
  return missed;
}

/** Davetin durumu şimdi: bekleyen davetin süresi özetten sonra dolmuş olabilir. */
function accessNow(facts: Pick<AttentionFacts, 'access' | 'inviteExpiresAt'>, now: Date): AccessState {
  if (facts.access === 'pending' && facts.inviteExpiresAt && Date.parse(facts.inviteExpiresAt) <= now.getTime()) return 'expired';
  return facts.access;
}

function inviteItem(access: AccessState, expiresAt: string | undefined, timeZone: string, locale: Locale): AttentionItem | null {
  const t = ptShellMessages(locale).attention.invite;
  const item = (urgency: number, text: string): AttentionItem => ({ key: `invite:${access}`, kind: 'invite', urgency, text, target: 'invite' });
  switch (access) {
    case 'none':
      return item(ATTENTION_URGENCY.inviteNone, t.none);
    case 'pending':
      return item(
        ATTENTION_URGENCY.invitePending,
        t.pending(expiresAt ? getFormat(locale).dayShort(todayIn(timeZone, new Date(expiresAt))) : null),
      );
    case 'expired':
      return item(ATTENTION_URGENCY.inviteBlocked, t.expired);
    case 'locked':
      return item(ATTENTION_URGENCY.inviteBlocked, t.locked);
    default:
      return null;
  }
}

/** En çok bu kadar hareket adı yazılır, gerisi "+n hareket". */
const STALL_NAMES = 3;

function stallItem(
  stalls: readonly StallFact[],
  today: string,
  titleOf: (exerciseId: string) => string,
  locale: Locale,
): AttentionItem | null {
  const t = ptShellMessages(locale).attention.stalled;
  const { number } = getFormat(locale);
  const deloadFrom = addDays(today, -ATTENTION_TUNING.deloadDays);
  const recentFrom = addDays(today, -ATTENTION_TUNING.stallRecentDays);
  const phrases: { urgency: number; text: string }[] = [];
  for (const fact of stalls) {
    const title = titleOf(fact.exerciseId);
    if (fact.deloadDate && fact.deloadDate >= deloadFrom) {
      phrases.push({ urgency: ATTENTION_URGENCY.deload, text: t.deloaded(title) });
    } else if (fact.streak >= ATTENTION_TUNING.stallStreak && fact.lastDate >= recentFrom) {
      phrases.push(
        fact.declining
          ? { urgency: ATTENTION_URGENCY.declining, text: t.declining(title, fact.streak, number(fact.streak)) }
          : { urgency: ATTENTION_URGENCY.stalled, text: t.same(title, fact.streak, number(fact.streak)) },
      );
    }
  }
  if (phrases.length === 0) return null;
  const compare = compareText(locale);
  phrases.sort((a, b) => b.urgency - a.urgency || compare(a.text, b.text));
  const more = phrases.length - STALL_NAMES;
  const text = phrases.slice(0, STALL_NAMES).map((phrase) => phrase.text).join(' · ') + (more > 0 ? ` · ${t.more(more, number(more))}` : '');
  return { key: 'stalled', kind: 'stalled', urgency: phrases[0]!.urgency, text, target: 'sessions' };
}

function measurementItem(declines: readonly MeasurementDecline[], today: string, locale: Locale): AttentionItem | null {
  const from = addDays(today, -ATTENTION_TUNING.measurementDays);
  const parts = declines
    .filter((decline) => decline.lastDate >= from)
    .map((decline) => {
      const def = measurementDef(decline.id, locale);
      const side = decline.key === 'value' ? '' : ` (${lower(locale, sideLabels(locale)[decline.key])})`;
      return `${def.label}${side} ${getFormat(locale).signedWithUnit(Math.round(decline.change * 10) / 10, measurementUnitLabels(locale)[def.unit])}`;
    });
  if (parts.length === 0) return null;
  return {
    key: 'measurement',
    kind: 'measurement',
    urgency: ATTENTION_URGENCY.measurement,
    text: ptShellMessages(locale).attention.measurement.decline(parts.join(' · ')),
    target: 'measurements',
  };
}

/** Danışanın maddeleri, şimdiye göre; aciliyet sırasıyla. `titleOf`: egzersizin kütüphanedeki adı. */
export function attentionItems(
  facts: AttentionFacts,
  ctx: { now: Date; timeZone: string; titleOf: (exerciseId: string) => string; locale?: Locale },
): AttentionItem[] {
  if (!facts.active) return [];
  const locale = ctx.locale ?? DEFAULT_LOCALE;
  const t = ptShellMessages(locale).attention;
  const { number } = getFormat(locale);
  const today = todayIn(ctx.timeZone, ctx.now);
  const items: AttentionItem[] = [];

  const access = accessNow(facts, ctx.now);
  const invite = inviteItem(access, facts.inviteExpiresAt, ctx.timeZone, locale);
  if (invite) items.push(invite);
  const joined = access === 'joined' || access === 'used';

  if (joined && facts.schedule) {
    const missed = missedTrainingDays({
      weekdays: facts.schedule.weekdays,
      sessionDays: facts.sessionDays,
      today,
      since: todayIn(ctx.timeZone, new Date(facts.schedule.since)),
    });
    if (missed.length > 0) {
      const days = missed.map((day) => shortDayText(day, locale)).join(', ');
      items.push({
        key: 'missed',
        kind: 'missed',
        urgency: missed.length > 1 ? ATTENTION_URGENCY.missedMany : ATTENTION_URGENCY.missedOne,
        text:
          missed.length > 1
            ? t.missed.many(number(ATTENTION_TUNING.missedLookbackDays), missed.length, number(missed.length), days)
            : t.missed.one(days),
        target: 'sessions',
      });
    }
  }

  const stalls = stallItem(facts.stalls, today, ctx.titleOf, locale);
  if (stalls) items.push(stalls);

  if (facts.phase && Date.parse(facts.phase.endsAt) <= ctx.now.getTime()) {
    items.push({
      key: 'phase',
      kind: 'phase',
      urgency: ATTENTION_URGENCY.phase,
      text: facts.phase.own ? t.phase.own(facts.phase.own, facts.phase.name) : t.phase.due(facts.phase.name, facts.phase.next),
      target: 'program',
    });
  }

  if (facts.proposals) {
    items.push({
      key: 'proposals',
      kind: 'proposals',
      urgency: ATTENTION_URGENCY.proposals,
      text: facts.proposals.text ? t.proposals.one(facts.proposals.text) : t.proposals.many(facts.proposals.count, number(facts.proposals.count)),
      target: 'program',
    });
  }

  const measurement = measurementItem(facts.measurements, today, locale);
  if (measurement) items.push(measurement);

  if (facts.constraints) items.push(...constraintItems(facts.constraints, today, locale));
  if (facts.screening) items.push(...screeningItems(facts.screening, today, locale));

  return items.sort((a, b) => b.urgency - a.urgency || ATTENTION_KINDS.indexOf(a.kind) - ATTENTION_KINDS.indexOf(b.kind));
}

/** En çok bu kadar ad yazılır, gerisi "+n". */
const LIST_NAMES = 2;

function listText(parts: readonly string[], locale: Locale): string {
  const more = parts.length - LIST_NAMES;
  return parts.slice(0, LIST_NAMES).join(' · ') + (more > 0 ? ` · ${ptShellMessages(locale).attention.listMore(getFormat(locale).number(more))}` : '');
}

function daysBetween(from: string, to: string): number {
  return Math.max(0, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000));
}

/**
 * Kısıt maddeleri (tasarım `kisit-tarama.md` §3.6). Kırmızı ünlem (`danger`): kırmızı bayrak, kauda ekina ve
 * danışanın PT'nin bakmadığı "şiddetli"si (onaylı kısıtta kötüleşme ya da şiddetli bildirim; 92). Şiddetli olmayan
 * kötüleşme ve "düzeldi dedi" 72'de, tonsuz kalır.
 */
export function constraintItems(facts: ConstraintFacts, today: string, locale: Locale = DEFAULT_LOCALE): AttentionItem[] {
  const t = ptShellMessages(locale).attention;
  const c = t.constraints;
  const { number } = getFormat(locale);
  const items: AttentionItem[] = [];
  const item = (key: string, urgency: number, text: string, target: AttentionTarget = 'constraints', tone?: AttentionTone): AttentionItem => ({
    key: `constraint:${key}`,
    kind: 'constraint',
    urgency,
    text,
    target,
    ...(tone ? { tone } : {}),
  });
  for (const urgent of facts.urgent) {
    items.push(item(`urgent:${urgent.id}`, ATTENTION_URGENCY.redFlag, c.urgent(emergencyText(locale), urgent.label), 'constraints', 'danger'));
  }
  if (facts.refer.length > 0) {
    items.push(item('refer', ATTENTION_URGENCY.redFlag, c.refer(listText(facts.refer.map((entry) => entry.title), locale)), 'constraints', 'danger'));
  }
  const severeChanges = facts.changes.filter((change) => change.kind === 'worse' ? change.to === 'severe' : change.wasSevere);
  if (severeChanges.length > 0) {
    const parts = severeChanges.map((change) => change.kind === 'better'
      ? c.betterAfterSevere(change.label)
      : c.worseToSevere(change.label, change.from ? t.severity[change.from] : null));
    items.push(item('severe', ATTENTION_URGENCY.constraintSevere, c.worse(listText(parts, locale)), 'constraints', 'danger'));
  }
  const severeReports = facts.reports.filter((report) => report.severity === 'severe');
  if (severeReports.length > 0) {
    items.push(
      item(
        'report-severe',
        ATTENTION_URGENCY.constraintSevere,
        c.reported(listText(severeReports.map((report) => c.reportedSevere(report.label)), locale)),
        'constraints',
        'danger',
      ),
    );
  }
  const next = facts.conflicts.filter((conflict) => conflict.next);
  if (next.length > 0) {
    items.push(
      item('conflict', ATTENTION_URGENCY.conflictNext, c.conflictNext(listText(next.map((conflict) => c.conflictRow(conflict.dayName, conflict.title)), locale)), 'program'),
    );
  } else if (facts.conflicts.length > 0) {
    items.push(
      item(
        'conflict',
        ATTENTION_URGENCY.conflict,
        facts.conflicts.length === 1
          ? c.conflictOne(c.conflictRow(facts.conflicts[0]!.dayName, facts.conflicts[0]!.title))
          : c.conflictMany(facts.conflicts.length, number(facts.conflicts.length)),
        'program',
      ),
    );
  }
  const reports = facts.reports.filter((report) => report.severity !== 'severe');
  if (reports.length > 0) {
    const parts = reports.map((report) => (report.severity ? c.reportedWith(report.label, t.severity[report.severity]) : report.label));
    items.push(item('report', ATTENTION_URGENCY.report, c.reported(listText(parts, locale))));
  }
  const changes = facts.changes.filter((change) => !severeChanges.includes(change));
  if (changes.length > 0) {
    const parts = changes.map((change) =>
      change.kind === 'better'
        ? c.better(change.label, Boolean(change.wasSevere))
        : change.from && change.to
          ? c.changed(change.label, t.severity[change.from], t.severity[change.to])
          : c.changedWorse(change.label),
    );
    const worse = changes.some((change) => change.kind === 'worse');
    items.push(item('change', ATTENTION_URGENCY.constraintChange, (worse ? c.changeWorse : c.changeUpdated)(listText(parts, locale))));
  }
  if (facts.waiting.length > 0) {
    const parts = facts.waiting.map((entry) => {
      const days = daysBetween(entry.referredAt, today);
      return c.waitingRow(entry.label, days, number(days));
    });
    items.push(item('waiting', ATTENTION_URGENCY.referralWaiting, c.waiting(listText(parts, locale))));
  }
  return items;
}

/** Tarama maddeleri: gözden geçirilmemiş ağrı; son 28 gündeki taramada tek büyük asimetri. */
export function screeningItems(facts: ScreeningFacts, today: string, locale: Locale = DEFAULT_LOCALE): AttentionItem[] {
  const t = ptShellMessages(locale).attention.screening;
  const items: AttentionItem[] = [];
  if (facts.pain.length > 0) {
    items.push({ key: 'screening:pain', kind: 'screening', urgency: ATTENTION_URGENCY.screeningPain, text: t.pain(listText(facts.pain, locale)), target: 'screening' });
  }
  if (facts.asymmetry && facts.date >= addDays(today, -SCREENING_ALERT_DAYS)) {
    items.push({
      key: 'screening:asymmetry',
      kind: 'screening',
      urgency: ATTENTION_URGENCY.asymmetry,
      text: t.asymmetry(facts.asymmetry),
      target: 'screening',
    });
  }
  return items;
}

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
  ctx: { now: Date; timeZone: string; titleOf: (exerciseId: string) => string; locale?: Locale },
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
