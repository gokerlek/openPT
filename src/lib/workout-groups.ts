import { DEFAULT_LOCALE, type Locale } from '../i18n/locale.ts';
import { clientWorkoutMessages } from '../i18n/messages/client-workout/index.ts';
import { getFormat } from './format.ts';
import type { SessionDoc } from './schemas/session.ts';
import { blockKindLabels, type BlockKind } from './template-plan.ts';
import type { CursorUnit } from './workout-cursor.ts';
import type { WorkoutDay } from './workout-plan.ts';
import { cursorOf, lastSetOf, memberAfter, setViews, type NextSet } from './workout-session.ts';

/**
 * Gruplar (süperset, devre, kompleks; tasarım §2.4 "Gruplar") — saf. Set sırası imlecin `setSlots`
 * düzenidir (`workout-cursor.ts`): her turda üyeler sırayla, seti biten üye sonraki turlarda atlanır,
 * geçilen üye grubu bozmaz. Bu modül grubun kartını anlatır:
 *
 * ```
 * Süperset · Tur 2/3
 * A  Bench Press   62,5 × 8–10   ✓
 * B  Barbell Row   50 × 8–10     ▶   ← şu anki üye
 * ```
 * ve "Set bitti → B" düğmesinin harfini verir (turun sıradaki üyesi; dinlenme yok).
 */

/** Üye harfleri: planın sırasıyla (devre en çok 8 hareket). */
const LETTERS = 'ABCDEFGH';

export function memberLetter(index: number): string {
  return LETTERS[index] ?? String(index + 1);
}

export type GroupMemberStatus =
  /** Bu turun seti yapıldı. */
  | 'done'
  /** Şu anki set bu üyenin. */
  | 'current'
  /** Bu turda sırası gelecek. */
  | 'pending'
  /** Setleri bitti: bu turda yok ("sonraki turlarda atlanır"). */
  | 'finished'
  /** Atlandı (`status: skipped`); grup kalanlarla sürer. */
  | 'skipped';

export type GroupMember = {
  rowId: string;
  letter: string;
  title: string;
  status: GroupMemberStatus;
  /** Bu turun reçetesi ya da kaydı: "62,5 × 8–10", "62,5 × 9", "12 tekrar", "30–45 sn". */
  text: string;
};

export type GroupView = {
  kind: Exclude<BlockKind, 'single'>;
  /** "Süperset", "Devre", "Kompleks". */
  label: string;
  /** Şu anki tur (0'dan) ve tur sayısı. */
  round: number;
  rounds: number;
  members: GroupMember[];
};

function range(min: number, max: number, locale: Locale): string {
  const f = getFormat(locale);
  return min === max ? f.number(min) : `${f.number(min)}–${f.number(max)}`;
}

function unitOf(day: WorkoutDay, doc: Pick<SessionDoc, 'entries' | 'order'>, unitKey: string): CursorUnit | undefined {
  return cursorOf(day, doc).units.find((unit) => unit.key === unitKey);
}

/**
 * Grubun kartı: `focus` gösterilen settir (sıradaki ya da az önce kaydedilen): tur onun turu, üyesi
 * "current". Fazladan turlar ("+ Tur ekle") planın turlarının arkasından sayılır ("Tur 4/4"). Grup değilse
 * (tek hareket) null.
 */
export function groupView(
  day: WorkoutDay,
  doc: Pick<SessionDoc, 'entries' | 'order'>,
  unitKey: string,
  focus: Pick<NextSet, 'rowId' | 'position' | 'kg' | 'round' | 'extra'> | null,
  locale: Locale = DEFAULT_LOCALE,
): GroupView | null {
  const f = getFormat(locale);
  const units = clientWorkoutMessages(locale).units;
  const unit = unitOf(day, doc, unitKey);
  if (!unit || unit.kind === 'single') return null;
  const planned = Math.max(0, ...unit.members.map((member) => member.planned));
  const rounds = Math.max(1, planned, ...unit.slots.map((slot) => slot.round + 1));
  const inUnit = focus && unit.members.some((member) => member.rowId === focus.rowId);
  const round = inUnit ? (focus.extra ? focus.round : focus.position) : rounds - 1;
  const members = unit.members.flatMap((member, index): GroupMember[] => {
    const row = member.rowId ? day.rows[member.rowId] : undefined;
    if (!row) return [];
    const views = setViews(day, doc, row.rowId);
    const view = round < planned ? views.filter((item) => !item.extra)[round] : views.filter((item) => item.extra)[round - planned];
    const logged = view?.logged;
    const current = inUnit && focus.rowId === row.rowId;
    const status: GroupMemberStatus = member.skipped
      ? 'skipped'
      : !view
        ? 'finished'
        : logged
          ? 'done'
          : current
            ? 'current'
            : 'pending';
    let text = '';
    if (view) {
      const weighted = row.trackingType === 'weight_reps';
      const value = logged ? (logged.reps ?? logged.seconds ?? 0) : undefined;
      const target = view.target.amrap ? `${f.number(view.target.min)}+` : range(view.target.min, view.target.max, locale);
      const kg = logged ? logged.kg : current ? focus.kg : (lastSetOf(row, view.setIndex)?.kg ?? view.plannedKg);
      const count = value ?? view.target.max;
      if (weighted) text = `${kg !== undefined ? f.number(kg) : '—'} × ${value !== undefined ? f.number(value) : target}`;
      else if (row.trackingType === 'duration') text = `${value !== undefined ? f.number(value) : target} ${units.seconds(count)}`;
      else text = `${value !== undefined ? f.number(value) : target} ${units.reps(count)}`;
    }
    return [{ rowId: row.rowId, letter: memberLetter(index), title: row.title, status, text }];
  });
  return { kind: unit.kind, label: blockKindLabels(locale)[unit.kind], round, rounds, members };
}

/**
 * "Set bitti → B": sıradaki setten sonra aynı turda başka bir üye geliyorsa onun harfi (dinlenme yok);
 * tur bitiyorsa ya da grup değilse null. `focus`: sıradaki set odaktaki birimden (`cursorOf`). `shown`: paneldeki set
 * (tablodan seçilen, imlecinkinden başka olabilir); verilmezse imlecin seti.
 */
export function nextMemberLetter(
  day: WorkoutDay,
  doc: Pick<SessionDoc, 'entries' | 'order'>,
  focus?: string | null,
  shown?: Pick<NextSet, 'rowId' | 'round'> | null,
): string | null {
  const cursor = cursorOf(day, doc, focus);
  const next = cursor.next;
  const unit = next ? cursor.units[next.unit] : undefined;
  if (!next || !unit) return null;
  const member = shown ? unit.members.findIndex((item) => item.rowId === shown.rowId) : next.member;
  const following = memberAfter(unit, member, shown ? shown.round : next.round);
  return following === null ? null : memberLetter(following);
}
