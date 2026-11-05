import { DEFAULT_LOCALE, type Locale } from '../i18n/locale.ts';
import { ptClientsMessages } from '../i18n/messages/pt-clients/index.ts';
import { STAGES, stageLabels, type Stage } from './exposure.ts';
import { getFormat } from './format.ts';
import type { HealthCheckIn } from './schemas/health.ts';
import type { SessionDoc } from './schemas/session.ts';
import { sessionDetail, type DetailExercise, type DetailSet, type SessionDetail } from './session-history.ts';
import type { ChangeLine, ChangeState } from './workout-summary.ts';

/**
 * PT'nin danışan sayfasındaki antrenman detayı (SPEC §6, tasarım §8 satır 12) — saf, yalnız okuma. Danışanın
 * geçmiş detayıyla aynı hesap (`sessionDetail`: hareketler yapılış sırasıyla, setler zorluklarıyla, ısınma
 * ayrı, geçme nedeni, ayar notu); üstüne PT'nin görmesi gerekenler:
 * - antrenmanın işaretleri: başka program seçildi (o gün planlanan hangi programın yerine), yarım bırakıldı (yapılan/planlanan set),
 *   hafifletilmiş gün (nötr: nedeni yalnız onay sürdükçe `health.json`'da), seans zorluğu;
 * - hareketin notları: muadille değiştirildi (programdaki hangi hareketin yerine), plan dışı eklendi, o günkü
 *   plan (üst ağırlık, aşama), bir defalık ve hafif; ağrı nedeniyle geçildi yalnız onay sürdükçe (çağıran
 *   onayı denetleyip satırları verir);
 * - setlerde onaylanmış aşırı yük;
 * - bu antrenmanın program değişiklikleri PT'nin diliyle (`PT_CHANGE_LABELS`).
 */

/** Program değişikliklerinin durumu, PT'ye (danışanın metni "antrenörünün onayında" der). */
export function ptChangeLabels(locale: Locale = DEFAULT_LOCALE): Record<ChangeState, string> {
  return ptClientsMessages(locale).sessions.changeLabels;
}

/** Türkçe etiketler (eski çağrılar ve testler); arayüz `ptChangeLabels(locale)` kullanır. */
export const PT_CHANGE_LABELS: Record<ChangeState, string> = ptChangeLabels('tr');

export type PtDetailSet = DetailSet & { overload: boolean };
export type PtDetailExercise = Omit<DetailExercise, 'sets'> & { sets: PtDetailSet[]; notes: string[] };
export type PtSessionDetail = Omit<SessionDetail, 'exercises'> & { exercises: PtDetailExercise[]; flags: string[] };

function isStage(value: string | undefined): value is Stage {
  return value !== undefined && (STAGES as readonly string[]).includes(value);
}

/** Onaylı ağrı ayrıntısı: bu antrenmanda ağrı nedeniyle geçilen satırlar (`health.json` → `checkIns[]`). */
export function painSkippedRows(checkIns: readonly Pick<HealthCheckIn, 'sessionId' | 'skippedRows'>[], sessionId: string): Set<string> {
  return new Set(
    checkIns
      .filter((item) => item.sessionId === sessionId)
      .flatMap((item) => (item.skippedRows ?? []).filter((row) => row.reason === 'pain').map((row) => row.rowId)),
  );
}

export function ptSessionDetail(
  doc: SessionDoc,
  input: {
    timeZone: string;
    /** Programdaki satırın hareketinin adı (muadilin yerini aldığı); bulunamazsa null. */
    rowTitle?: (rowId: string) => string | null;
    /** Ağrı nedeniyle geçilen satırlar (yalnız onay sürdükçe). */
    painRows?: ReadonlySet<string>;
    /** Seansın günündeki kilo (yalnız ölçüm onayı sürdükçe): yürüyüş/koşu setinde kalori. */
    bodyMassKg?: number | undefined;
    /** Metinlerin dili; yoksa Türkçe. */
    locale?: Locale;
  },
): PtSessionDetail {
  const locale = input.locale ?? DEFAULT_LOCALE;
  const t = ptClientsMessages(locale).sessions;
  const format = getFormat(locale);
  const base = sessionDetail(doc, input.timeZone, input.bodyMassKg, locale);
  const entries = new Map(doc.entries.map((entry) => [entry.id, entry]));
  const overloads = new Set(doc.entries.flatMap((entry) => entry.sets.filter((set) => set.overload).map((set) => set.id)));

  const exercises = base.exercises.map((exercise): PtDetailExercise => {
    const entry = entries.get(exercise.entryId);
    const notes: string[] = [];
    if (entry?.swappedFrom) {
      const from = input.rowTitle?.(entry.swappedFrom) ?? null;
      notes.push(from ? t.notes.insteadOf(from) : t.notes.swapped);
    }
    if (entry?.added) notes.push(t.notes.added);
    if (entry?.status === 'skipped' && entry.rowId && input.painRows?.has(entry.rowId)) notes.push(t.notes.painSkipped);
    const plan = entry?.plan;
    const planParts = [
      ...(plan?.topWeightKg !== undefined && plan.topWeightKg > 0 ? [format.kg(plan.topWeightKg)] : []),
      ...(isStage(plan?.stage) ? [stageLabels(locale)[plan.stage]] : []),
    ];
    if (planParts.length > 0) notes.push(t.notes.plan(planParts.join(' · ')));
    return { ...exercise, notes, sets: exercise.sets.map((set) => ({ ...set, overload: overloads.has(set.id) })) };
  });

  const flags: string[] = [];
  // Danışanın kendi programından (kendi-program.md §4); adı başlıkta ("Evde · Gün A", anlık görüntü).
  if (doc.program?.programId) flags.push(t.flags.ownProgram);
  if (base.otherDay) flags.push(doc.program?.plannedDayName ? t.flags.insteadOf(doc.program.plannedDayName) : t.flags.otherDay);
  const unfinished = doc.notices.find((notice) => notice.kind === 'unfinished');
  if (unfinished) {
    flags.push(
      t.flags.unfinished(
        unfinished.done !== undefined && unfinished.planned !== undefined
          ? { done: format.number(unfinished.done), planned: format.number(unfinished.planned) }
          : null,
      ),
    );
  }
  if (doc.adjust === 'lighter') flags.push(t.flags.lighter);
  if (base.effort) flags.push(base.effort);

  return { ...base, exercises, flags };
}

/** Program değişikliklerinin satırları, PT'nin etiketleriyle. */
export function ptChangeLines(changes: readonly ChangeLine[], locale: Locale = DEFAULT_LOCALE): { text: string; label: string; note?: string }[] {
  const labels = ptChangeLabels(locale);
  return changes.map((change) => ({ text: change.text, label: labels[change.state], ...(change.note ? { note: change.note } : {}) }));
}
