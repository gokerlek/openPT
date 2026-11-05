import { DEFAULT_LOCALE, type Locale } from '../i18n/locale.ts';
import { clientWorkoutMessages } from '../i18n/messages/client-workout/index.ts';
import { getFormat } from './format.ts';
import type { SessionDoc, SessionEntry, SessionSet } from './schemas/session.ts';
import { workingSetCount } from './session-index.ts';
import { canonicalJson } from './session-merge.ts';

/**
 * Antrenman commit mesajları (SPEC §7, tasarım §4.3, §4.5, §4.7) — saf. Danışan repo'sunun commit
 * geçmişi antrenman günlüğüdür: `Set 3/3 · Bench Press · 62,5 kg × 10`. Sağlık bilgisi (ağrı nedeni,
 * hazır oluşluk) hiçbir mesaja girmez. Silme mesajı geneldir ("Kayıt silindi"): hareket adı, tarih ve
 * değer yok (silinenin eski sürümleri git geçmişinde kalır; metin bunu dürüstçe söyler). Mesajlar yazanın (danışanın)
 * dilinde; varsayılan Türkçe.
 */

/** Silmenin genel mesajı yazanın dilinde. */
export function deleteMessage(locale: Locale = DEFAULT_LOCALE): string {
  return clientWorkoutMessages(locale).commits.deleted;
}

/** Türkçe mesaj (eski çağrılar). */
export const DELETE_MESSAGE = deleteMessage('tr');

function valueText(set: Pick<SessionSet, 'kg' | 'reps' | 'seconds'>, locale: Locale): string {
  const units = clientWorkoutMessages(locale).units;
  const load = set.kg !== undefined && set.kg > 0 ? getFormat(locale).kg(set.kg) : null;
  if (set.seconds !== undefined) return load ? `${load} × ${set.seconds} ${units.seconds(set.seconds)}` : `${set.seconds} ${units.seconds(set.seconds)}`;
  return load ? `${load} × ${set.reps ?? 0}` : `${set.reps ?? 0} ${units.reps(set.reps ?? 0)}`;
}

/** "Set 3/3 · Bench Press · 62,5 kg × 10"; ısınmada "Isınma · …", fazladan sette "Set 4 (fazladan) · …". */
export function setText(entry: Pick<SessionEntry, 'title' | 'sets' | 'plannedSets'>, set: SessionSet, locale: Locale = DEFAULT_LOCALE): string {
  const t = clientWorkoutMessages(locale).commits;
  if (set.type === 'warmup') return t.warmup(entry.title, valueText(set, locale));
  const position = entry.sets.filter((item) => item.type === 'working').findIndex((item) => item.id === set.id);
  const number = (set.setIndex ?? Math.max(0, position)) + 1;
  const total = set.plannedSetCount ?? entry.plannedSets;
  const label = set.extra ? t.setExtra(number) : total ? t.setOf(number, total) : t.set(number);
  return `${label} · ${entry.title} · ${valueText(set, locale)}`;
}

type Located = { entry: SessionEntry; set: SessionSet };

function setsOf(doc: SessionDoc | null): Map<string, Located> {
  const map = new Map<string, Located>();
  for (const entry of doc?.entries ?? []) for (const set of entry.sets) map.set(set.id, { entry, set });
  return map;
}

function latestOf(items: readonly Located[]): Located | undefined {
  return items.reduce<Located | undefined>((best, item) => (!best || Date.parse(item.set.at) >= Date.parse(best.set.at) ? item : best), undefined);
}

/**
 * Etkin antrenmanın yazımı. Yeni set varsa en sonuncusu (birden çoksa `(+n set)`: süperset turu ya da
 * çevrimdışı birikim tek yazmada birleşti); yalnız düzeltme varsa "… düzeltildi"; silme varsa değer
 * vermeden "kayıt silindi"; başka bir şey değiştiyse genel mesaj.
 */
export function putMessage(before: SessionDoc | null, after: SessionDoc, locale: Locale = DEFAULT_LOCALE): string {
  const t = clientWorkoutMessages(locale).commits;
  const old = setsOf(before);
  const now = setsOf(after);
  const added = [...now.values()].filter((item) => !old.has(item.set.id));
  const edited = [...now.values()].filter((item) => {
    const previous = old.get(item.set.id);
    return previous !== undefined && canonicalJson(previous.set) !== canonicalJson(item.set);
  });
  const deletions =
    after.deletedSetIds.length + after.deletedEntryIds.length > (before?.deletedSetIds.length ?? 0) + (before?.deletedEntryIds.length ?? 0);

  let text: string | null = null;
  const newest = latestOf(added);
  const changed = latestOf(edited);
  if (newest) text = `${setText(newest.entry, newest.set, locale)}${added.length > 1 ? t.more(added.length - 1) : ''}`;
  else if (changed) text = t.edited(setText(changed.entry, changed.set, locale));
  if (text) return deletions ? t.withDeletion(text) : text;
  if (deletions) return t.deleted;
  if (!before) return t.started(after.program ? after.program.dayName : null);
  return t.updated;
}

/** Bitiş: "Antrenman bitti · Gün A · 17 set". */
export function finishMessage(doc: SessionDoc, locale: Locale = DEFAULT_LOCALE): string {
  return clientWorkoutMessages(locale).commits.finished(doc.program ? doc.program.dayName : null, workingSetCount(doc));
}

/** Bitmiş antrenmanın düzeltmesi: silme genel mesajla; set ekleme, zorluk, su kendi adıyla. */
export function patchMessage(before: SessionDoc, after: SessionDoc, locale: Locale = DEFAULT_LOCALE): string {
  const t = clientWorkoutMessages(locale).commits;
  const deletions =
    after.deletedSetIds.length + after.deletedEntryIds.length > before.deletedSetIds.length + before.deletedEntryIds.length;
  if (deletions) return t.deleted;
  const added = workingSetCount(after) - workingSetCount(before);
  if (added > 0) return t.setsAdded(added);
  if (canonicalJson(before.effort ?? null) !== canonicalJson(after.effort ?? null)) return t.effortSaved;
  if (canonicalJson(before.waterTaps) !== canonicalJson(after.waterTaps)) return t.waterUpdated;
  return t.updated;
}
