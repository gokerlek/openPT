import { localizedLibraryTitle } from '../data/library-titles.ts';
import { DEFAULT_LOCALE, intlLocale, type Locale } from '../i18n/locale.ts';
import { clientProgressMessages } from '../i18n/messages/client-progress/index.ts';
import { upper } from '../i18n/text.ts';
import { getFormat, todayIn } from './format.ts';
import { sessionDayText } from './own-program-text.ts';
import { effortLabels } from './progression.ts';
import type { SessionDoc, SessionIndex, SessionIndexRow, SkipReason } from './schemas/session.ts';
import { sessionEnd, volumeOf, waterOf, workingSetCount } from './session-index.ts';
import { addDays } from './training-days.ts';
import { finishReasonLabels } from './workout-flow.ts';
import { setValueText } from './workout-session.ts';
import { clockOf, entriesInOrder, minutesText } from './workout-summary.ts';

/**
 * Danışanın Geçmiş'i (tasarım §2.10, §4.5) — saf. Liste index'ten (tek okuma), detay antrenmanın dosyasından.
 *
 * - **Liste:** bitmiş antrenmanlar en yeniden eskiye, aylara bölünmüş ("EYLÜL 2026"); satırda gün, haftanın
 *   günü, programın adı ve süre, set · toplam ağırlık; rekor, "başka program" ve "yarım" rozetleri. Üstte son 30 gün.
 * - **Detay:** hareketler yapılış sırasıyla, setler zorluklarıyla; ısınma ayrı satır; geçilen hareketin nedeni,
 *   danışanın ayar notu. Düzenle kipinde set, hareket ve antrenmanın tamamı onaylı silinir; su ±1 (açık soru 6:
 *   geçmişte set düzeltme yok, yalnız silme ve su).
 * - **Silme metni dürüsttür** (§4.5): uygulamadan kalkar ama antrenörün veri deposunun geçmişinde kalır
 *   ("kalabilir" değil, kalır); "Ayrıntı" neyin silinmediğini söyler.
 */

/** Listenin ilk sayfası; "Daha fazla göster (n)" sonrakileri açar. */
export const HISTORY_PAGE = 20;
/** Liste başındaki özetin penceresi. */
export const HISTORY_RECENT_DAYS = 30;

export type HistoryRow = {
  id: string;
  /** Takvim günü: "26", "Eyl" ve "Cmt". */
  dayOfMonth: string;
  month: string;
  weekday: string;
  /** "Gün A · 52 dk". */
  title: string;
  /** "17 set · 4.215 kg" (rekor sayısı rozette). */
  meta: string;
  otherDay: boolean;
  unfinished: boolean;
  prs: number;
  /** Kendi programdan antrenman: programın o günkü adı (`docs/design/kendi-program.md` §3.7, §4); PT'ninkinde yok. */
  program?: string;
};
export type HistoryMonth = { key: string; label: string; rows: HistoryRow[] };
export type HistoryList = { recent: string | null; months: HistoryMonth[]; count: number };

type DateFormats = { weekday: Intl.DateTimeFormat; monthShort: Intl.DateTimeFormat; month: Intl.DateTimeFormat };
const dateFormats = new Map<Locale, DateFormats>();

function formatsOf(locale: Locale): DateFormats {
  let formats = dateFormats.get(locale);
  if (!formats) {
    const intl = intlLocale(locale);
    formats = {
      weekday: new Intl.DateTimeFormat(intl, { weekday: 'short', timeZone: 'UTC' }),
      monthShort: new Intl.DateTimeFormat(intl, { month: 'short', timeZone: 'UTC' }),
      month: new Intl.DateTimeFormat(intl, { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    };
    dateFormats.set(locale, formats);
  }
  return formats;
}

/** Yarım antrenmanın süresi eski index satırlarında ya da setsizse (bitiş son sete göre kısılamaz) şişik olabilir; bundan uzunu gösterilmez. */
const UNFINISHED_MAX_MIN = 180;

function shownMinutes(row: Pick<SessionIndexRow, 'durationMin' | 'unfinished'>): number | undefined {
  if (row.durationMin === undefined) return undefined;
  return row.unfinished && row.durationMin > UNFINISHED_MAX_MIN ? undefined : row.durationMin;
}

function time(iso: string | undefined): number {
  const at = iso ? Date.parse(iso) : Number.NaN;
  return Number.isNaN(at) ? 0 : at;
}

function rowOf(row: SessionIndexRow, locale: Locale): HistoryRow {
  const f = getFormat(locale);
  const t = clientProgressMessages(locale).history;
  const formats = formatsOf(locale);
  const date = new Date(`${row.date}T00:00:00Z`);
  const prs = row.prs ?? 0;
  // Kendi programdan antrenman programın adıyla ("Evde · Gün A"): program silinse de anlık görüntü kalır.
  const day = sessionDayText(row, undefined, locale);
  const minutes = shownMinutes(row);
  const title = [day, ...(minutes !== undefined ? [minutesText(minutes, locale)] : [])].join(' · ');
  const meta = `${t.sets(f.number(row.sets), row.sets)} · ${f.kg(row.volumeKg)}`;
  return {
    id: row.id,
    dayOfMonth: String(date.getUTCDate()),
    month: formats.monthShort.format(date),
    weekday: formats.weekday.format(date),
    title,
    meta,
    otherDay: row.otherDay,
    unfinished: row.unfinished,
    prs,
    ...(row.programId ? { program: row.programName ?? t.ownProgram } : {}),
  };
}

/** Geçmiş listesi: yalnız bitmiş antrenmanlar (yarım kalan etkin antrenman Bugün'dedir). */
export function historyList(index: SessionIndex, now: Date, timeZone: string, locale: Locale = DEFAULT_LOCALE): HistoryList {
  const f = getFormat(locale);
  const t = clientProgressMessages(locale).history;
  const rows = index.items.filter((row) => row.finishedAt).sort((a, b) => time(b.startedAt ?? b.date) - time(a.startedAt ?? a.date));
  const months: HistoryMonth[] = [];
  for (const row of rows) {
    const key = row.date.slice(0, 7);
    let month = months.at(-1);
    if (!month || month.key !== key) {
      month = { key, label: upper(locale, formatsOf(locale).month.format(new Date(`${key}-01T00:00:00Z`))), rows: [] };
      months.push(month);
    }
    month.rows.push(rowOf(row, locale));
  }
  const since = addDays(todayIn(timeZone, now), -(HISTORY_RECENT_DAYS - 1));
  const recent = rows.filter((row) => row.date >= since);
  const minutes = recent.reduce((sum, row) => sum + (shownMinutes(row) ?? 0), 0);
  const prs = recent.reduce((sum, row) => sum + (row.prs ?? 0), 0);
  const summary =
    recent.length > 0
      ? [
          t.lastDays(HISTORY_RECENT_DAYS),
          t.workouts(f.number(recent.length), recent.length),
          minutesText(minutes, locale),
          ...(prs > 0 ? [t.records(f.number(prs), prs)] : []),
        ].join(' · ')
      : null;
  return { recent: summary, months, count: rows.length };
}

/** "Son antrenman": programın (null = PT'nin) bitmişlerinin en yenisi, yarım dahil; own-program-text.ts'teki program başına "son" ile aynı. */
export function lastWorkout(index: SessionIndex | null, programId: string | null = null): SessionIndexRow | null {
  const rows = (index?.items ?? []).filter((row) => row.finishedAt && (row.programId ?? null) === programId);
  return rows.sort((a, b) => time(b.startedAt ?? b.date) - time(a.startedAt ?? a.date))[0] ?? null;
}

/**
 * "Daha fazla göster": ayların satırları ilk `count` satıra kadar (boş kalan ay düşer). Danışanın Geçmiş'i ve
 * PT'nin Antrenmanlar sekmesi ortak.
 */
export function firstHistoryRows(months: readonly HistoryMonth[], count: number): HistoryMonth[] {
  const shown: HistoryMonth[] = [];
  let left = count;
  for (const month of months) {
    if (left <= 0) break;
    shown.push({ ...month, rows: month.rows.slice(0, left) });
    left -= month.rows.length;
  }
  return shown;
}

/* --- detay --- */

export type DetailSet = {
  id: string;
  /** "1", "2"; ısınmada "Isınma". */
  label: string;
  /** "62,5 kg × 10", "10 tekrar", "45 sn". */
  text: string;
  effort: string | null;
  warmup: boolean;
  /** Plandan fazla ("+ Set ekle"). */
  extra: boolean;
};
export type DetailExercise = {
  entryId: string;
  title: string;
  /** "3 set", "2/3 set · bir defalık", "geçildi · Alet dolu". */
  note: string;
  setupNote?: string;
  sets: DetailSet[];
};
export type SessionDetail = {
  id: string;
  /** "Gün A · 26 Eylül 2026". */
  title: string;
  /** "18:05–18:57 · 17 set · 4.215 kg". */
  meta: string;
  water: number;
  /** Seans zorluğu (bitişten sonra sorulan CR-10): "Zorluk 6/10". */
  effort: string | null;
  otherDay: boolean;
  unfinished: boolean;
  exercises: DetailExercise[];
  /** Silme onayındaki antrenman satırı: "Gün A · 26 Eylül 2026 · 17 set ve özeti". */
  subject: string;
};

function skipText(reason: SkipReason | undefined, locale: Locale): string {
  const t = clientProgressMessages(locale).history;
  return reason ? t.skippedFor(finishReasonLabels(locale)[reason]) : t.skipped;
}

/**
 * Antrenmanın detayı: setleri olan ya da geçilen hareketler, yapılış sırasıyla. `bodyMassKg` (ölçüm onayıyla, seansın
 * günündeki kilo) verilirse yürüyüş/koşu setinin metninde kalori de (`cardio.ts`).
 */
export function sessionDetail(doc: SessionDoc, timeZone: string, bodyMassKg?: number, locale: Locale = DEFAULT_LOCALE): SessionDetail {
  const f = getFormat(locale);
  const t = clientProgressMessages(locale).history;
  const efforts = effortLabels(locale);
  const exercises: DetailExercise[] = [];
  for (const entry of entriesInOrder(doc)) {
    const working = entry.sets.filter((set) => set.type === 'working');
    const warmups = entry.sets.filter((set) => set.type === 'warmup');
    if (entry.sets.length === 0 && entry.status !== 'skipped') continue;
    const planned = Math.max(0, ...working.map((set) => set.plannedSetCount ?? 0), entry.plannedSets ?? 0);
    const count =
      working.length === 0
        ? skipText(entry.skip?.reason, locale)
        : planned > working.length
          ? t.setsOf(f.number(working.length), f.number(planned), planned)
          : t.sets(f.number(working.length), working.length);
    const note = [count, ...(entry.oneOff ? [t.oneOff] : []), ...(entry.lighter ? [t.lighter] : [])].join(' · ');
    const sets: DetailSet[] = [
      ...warmups.map((set) => ({ id: set.id, label: t.warmup, text: setValueText(set, undefined, locale), effort: null, warmup: true, extra: false })),
      ...working.map((set, position) => ({
        id: set.id,
        label: f.number(position + 1),
        text: setValueText(set, bodyMassKg, locale),
        effort: set.effort ? efforts[set.effort] : null,
        warmup: false,
        extra: Boolean(set.extra),
      })),
    ];
    // Kütüphane adının anlık görüntüsü okuyanın dilinde; PT'nin adı ve silinmiş hareket olduğu gibi.
    const title = localizedLibraryTitle(entry.exerciseId, entry.title, locale);
    exercises.push({ entryId: entry.id, title, note, ...(entry.setupNote ? { setupNote: entry.setupNote } : {}), sets });
  }
  const sets = workingSetCount(doc);
  // Yarım bırakılan antrenmanın saat aralığı son setten en çok 10 dk sonra biter (`sessionEnd`).
  const end = sessionEnd(doc) ?? doc.startedAt;
  const dayName = sessionDayText(doc.program, undefined, locale);
  const title = `${dayName} · ${f.day(doc.date)}`;
  return {
    id: doc.id,
    title,
    meta: [`${clockOf(doc.startedAt, timeZone)}–${clockOf(end, timeZone)}`, t.sets(f.number(sets), sets), f.kg(volumeOf(doc))].join(' · '),
    water: waterOf(doc),
    effort: doc.effort?.sessionRpe !== undefined ? t.effort(f.number(doc.effort.sessionRpe)) : null,
    otherDay: !doc.program?.programId && Boolean(doc.program?.plannedDayId && doc.program.plannedDayId !== doc.program.dayId),
    unfinished: doc.notices.some((notice) => notice.kind === 'unfinished'),
    exercises,
    subject: t.subject(title, f.number(sets), sets),
  };
}

/* --- silme --- */

/**
 * Onay metni (§2.10): aynı iki cümle; veri depoda gerçekten kalır, bu yüzden "kalır". `detail`: "Ayrıntı" açılınca,
 * neyin silinmediği ve tam temizlik için kime yazılacağı.
 */
export function deleteText(locale: Locale = DEFAULT_LOCALE): { body: string; detail: string } {
  const t = clientProgressMessages(locale).history;
  return { body: t.deleteBody, detail: t.deleteDetail };
}

/* Türkçe metinler (eski çağrılar); arayüz `deleteText(locale)` kullanır. */
export const DELETE_BODY = deleteText('tr').body;
export const DELETE_DETAIL = deleteText('tr').detail;

export type DeleteTarget =
  | { kind: 'set'; entryId: string; setId: string }
  | { kind: 'entry'; entryId: string }
  | { kind: 'session' };

/** Onayın başlığı ve konusu ("Bench Press · Set 2 · 60 kg × 9"); hedef belgede yoksa null. */
export function deleteCopy(detail: SessionDetail, target: DeleteTarget, locale: Locale = DEFAULT_LOCALE): { title: string; subject: string } | null {
  const t = clientProgressMessages(locale).history;
  if (target.kind === 'session') return { title: t.deleteSession, subject: detail.subject };
  const exercise = detail.exercises.find((item) => item.entryId === target.entryId);
  if (!exercise) return null;
  if (target.kind === 'entry') {
    const count = exercise.sets.filter((set) => !set.warmup).length;
    return { title: t.deleteEntry, subject: `${exercise.title} · ${count > 0 ? t.sets(getFormat(locale).number(count), count) : exercise.note}` };
  }
  const set = exercise.sets.find((item) => item.id === target.setId);
  if (!set) return null;
  return { title: t.deleteSet, subject: `${exercise.title} · ${set.warmup ? t.warmup : t.set(set.label)} · ${set.text}` };
}

/**
 * Silmenin isteği (`PATCH /api/me/sessions/[id]`): set ya da hareketin kimliği. Hareketin son seti
 * silinirse hareket de gider (boş kalan hareket geçmişte satır olarak durmasın).
 */
export function deletePatch(doc: Pick<SessionDoc, 'entries'>, target: Exclude<DeleteTarget, { kind: 'session' }>): { deleteSetIds?: string[]; deleteEntryIds?: string[] } {
  if (target.kind === 'entry') return { deleteEntryIds: [target.entryId] };
  const entry = doc.entries.find((item) => item.id === target.entryId);
  const last = entry !== undefined && entry.sets.length === 1 && entry.sets[0]?.id === target.setId && entry.status !== 'skipped';
  return last ? { deleteEntryIds: [target.entryId] } : { deleteSetIds: [target.setId] };
}
