import { DEFAULT_LOCALE, type Locale } from '../i18n/locale.ts';
import { clientProgramsMessages } from '../i18n/messages/client-programs/index.ts';
import { clientWorkoutMessages } from '../i18n/messages/client-workout/index.ts';
import { getFormat } from './format.ts';
import type { LogKind } from './program-plan.ts';
import type { SessionIndex } from './schemas/session.ts';
import { normalizeWeekdays, weekdaysText } from './training-days.ts';

/**
 * Kendi programların ekran metinleri (`docs/design/kendi-program.md` §2, §4, §7.3) — saf. Liste kartları ve PT'nin
 * kartı index satırından (program başına okuma yok), geçmiş etiketleri görene göre.
 */

/**
 * Antrenmanın gün adı: kendi programdan antrenmanda programın adıyla ("Evde · Gün A"; seansın anlık görüntüsü, program
 * silinse de kalır), PT'nin programında yalnız gün; gün adı yoksa `fallback`. Geçmiş, özet, antrenman sonrası kart ve
 * PT'nin ekranları aynı metni kullanır.
 */
export function sessionDayText(
  program: { dayName?: string | undefined; programName?: string | undefined } | undefined,
  fallback?: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const day = program?.dayName || (fallback ?? clientWorkoutMessages(locale).session.workout);
  return program?.programName ? `${program.programName} · ${day}` : day;
}

/**
 * Programın satırı: "2 antrenman · haftada 2 · Sal, Per · son: 22 Eyl" (Faz 3: sayım "antrenman", "gün" yalnız hafta
 * günleri); gün atanmamışsa sıklık ("haftada 3"), o da yoksa "gün atanmadı". Haftalık sayı atanmış gün sayısıdır,
 * yoksa sıklık (`weekTarget` gibi).
 */
export function programLine(
  input: { days: number; weekdays: readonly number[]; daysPerWeek?: number | undefined },
  lastDate?: string | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const f = getFormat(locale);
  const t = clientProgramsMessages(locale).line;
  const weekdays = weekdaysText(input.weekdays, locale);
  const perWeek = weekdays ? normalizeWeekdays(input.weekdays).length : input.daysPerWeek;
  return [
    t.workouts(f.number(input.days), input.days),
    ...(perWeek !== undefined ? [t.perWeek(f.number(perWeek))] : []),
    ...(weekdays ? [weekdays] : perWeek === undefined ? [t.noDays] : []),
    ...(lastDate ? [t.last(f.dayShort(lastDate))] : []),
  ].join(' · ');
}

/** Bitmiş antrenmanların programa göre son günü: kendi programın kimliği, PT'nin programı `pt`. */
export function lastDateByProgram(index: Pick<SessionIndex, 'items'>): Map<string, string> {
  const last = new Map<string, string>();
  for (const row of index.items) {
    if (!row.finishedAt) continue;
    const key = row.programId ?? 'pt';
    const known = last.get(key);
    if (!known || row.date > known) last.set(key, row.date);
  }
  return last;
}

/** Günlerin son yapıldığı gün (gün kimlikleri bütün programlarda benzersiz). */
export function lastDateByDay(index: Pick<SessionIndex, 'items'>): Map<string, string> {
  const last = new Map<string, string>();
  for (const row of index.items) {
    if (!row.finishedAt || !row.dayId) continue;
    const known = last.get(row.dayId);
    if (!known || row.date > known) last.set(row.dayId, row.date);
  }
  return last;
}

/**
 * PT'nin programı kalıcı seçimden sonra oluşturuldu ya da kaydedildi mi (Bugün'deki "Antrenörün yeni bir program
 * hazırladı" satırı, Program'daki "Güncellendi" rozeti, §2.6): yalnız kalıcı seçim kendi programken.
 */
export function ptUpdatedSince(program: { createdAt: string; updatedAt: string } | null | undefined, active: { programId: string | null; at: string } | null | undefined): boolean {
  if (!program || !active?.programId) return false;
  const at = Date.parse(active.at);
  return Date.parse(program.createdAt) > at || Date.parse(program.updatedAt) > at;
}

/** Geçmiş kaydının etiketi, görene göre (§7.3). */
export function ownLogLabel(entry: { kind: LogKind; by?: 'pt' | undefined }, viewer: 'client' | 'pt', locale: Locale = DEFAULT_LOCALE): string {
  const t = clientProgramsMessages(locale).log;
  switch (entry.kind) {
    case 'create':
      return viewer === 'client' ? t.created : t.clientCreated;
    case 'edit':
      if (entry.by === 'pt') return viewer === 'client' ? t.ptEdited : t.youEdited;
      return viewer === 'client' ? t.youEdited : t.clientEdited;
    case 'client':
      return viewer === 'client' ? t.fromWorkout : t.clientUpdated;
    case 'share':
      return t.share;
    case 'phase':
      return t.phase;
  }
}
