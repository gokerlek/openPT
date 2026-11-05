import { DEFAULT_LOCALE, type Locale } from '../../i18n/locale.ts';
import { coachMessages } from '../../i18n/messages/coach/index.ts';
import type { CareInput } from '../constraint-filter.ts';
import { measurementDef } from '../measurements.ts';
import { metricLabels, protocols, type PoseTask } from '../pose/protocols.ts';
import type { MeasurementEntry } from '../schemas/health.ts';
import type { SessionIndexRow } from '../schemas/session.ts';
import { strongestOf } from '../session-records.ts';
import { hashableFacts, type CoachFact } from './coach-engine.ts';
import { progressReview, type CoachInsight } from './coach-review.ts';

/**
 * Koçun bağlamındaki kayıt özetleri ve taslak onayının değişiklik karması (saf: okuma `coach-service.ts`'te, burada
 * yalnız okunan kayıtlardan metin ve karma). Özetler isteğin dilinde yazılır; KARMA dilden bağımsız olmalı ki
 * İngilizce hazırlanan taslak Türkçe PT'de onaylanabilsin ve dil değişince taslak kaybolmasın. Bu yüzden karmaya giren
 * her şey Türkçe hâlinden alınır; Türkçe değer dil desteğinden önceki kodla baytı baytına aynıdır (`coach-facts.test.ts`
 * altın değerlerle denetler).
 */

type CatalogItem = { id: string; title: string };
type CameraEntry = { capturedAt: string; task: PoseTask; deletedAt?: string | undefined; metrics: readonly { id: string; median: number }[] };

export type CoachRecords = {
  today: string;
  /** Oturum dizini satırları (süzülmemiş). */
  items: readonly SessionIndexRow[];
  /** Mevcut PT programı (gün sayısı için); yoksa tanımsız. */
  program?: { phases: readonly { days: readonly unknown[] }[] } | null | undefined;
  /** İzinli kamera ölçümleri (izin yoksa boş). */
  camera: readonly CameraEntry[];
  /** İzinli elle girilen ölçümler (izin yoksa boş). */
  measurements: readonly MeasurementEntry[];
};

export type DescribedCoach = { facts: CoachFact[]; insights: CoachInsight[] };

/** Bitmiş ve bugüne kadarki oturumlar, en yenisi önce. */
export function finishedSessions(items: readonly SessionIndexRow[], today: string): SessionIndexRow[] {
  return items
    .filter((item) => item.finishedAt && item.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));
}

/** Kayıt özetleri ve gelişim değerlendirmesi `locale` dilinde; `exercises` o dildeki katalog (hareket adları için). */
export function describeCoach(records: CoachRecords, exercises: readonly CatalogItem[], locale: Locale): DescribedCoach {
  const t = coachMessages(locale).facts;
  const { today, program } = records;
  const finished = finishedSessions(records.items, today);
  const facts: CoachFact[] = [
    { text: t.history(finished.length), source: t.historySource },
    ...finished.slice(0, 3).map((item) => ({ text: t.session(item.date, item.dayName ?? t.defaultDayName, item.sets, item.volumeKg), source: t.sessionSource(item.date) })),
  ];
  const seenExercises = new Set<string>();
  for (let rowIndex = 0; rowIndex < Math.min(8, finished.length); rowIndex++) {
    const row = finished[rowIndex]!;
    for (const item of row.exercises) {
      const key = `${item.exerciseId}:${item.deviceId ?? ''}`;
      const best = strongestOf(item.best);
      if (!best || seenExercises.has(key)) continue;
      seenExercises.add(key);
      const before = finished
        .slice(rowIndex + 1)
        .flatMap((previous) => previous.exercises)
        .find((previous) => previous.exerciseId === item.exerciseId && previous.deviceId === item.deviceId && strongestOf(previous.best));
      const old = before ? strongestOf(before.best) : null;
      const difference = old ? t.difference((best.e1rm - old.e1rm).toFixed(1)) : t.noPrevious;
      const title = exercises.find((exercise) => exercise.id === item.exerciseId)?.title ?? t.removedExercise;
      facts.push({ text: t.exercise(row.date, title, best.e1rm.toFixed(1), best.kg, best.reps, difference), source: t.exerciseSource(row.date, title), exerciseId: item.exerciseId });
    }
  }
  if (program) facts.push({ text: t.program(program.phases.reduce((n, phase) => n + phase.days.length, 0)), source: t.programSource });
  for (const entry of records.camera.filter((item) => !item.deletedAt).slice(0, 3)) {
    const title = protocols(locale)[entry.task].title, date = entry.capturedAt.slice(0, 10);
    const metrics = entry.metrics.map((metric) => `${metricLabels(locale)[metric.id] ?? metric.id} ${metric.median.toFixed(1)}°`).join(', ');
    facts.push({ text: t.camera(date, title, metrics), source: t.measurementSource(date, title), measurement: true });
  }
  for (const entry of [...records.measurements].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6)) {
    const definition = measurementDef(entry.id, locale);
    facts.push({ text: t.measurement(entry.date, definition.label, entry.side, entry.value, t.units[definition.unit]), source: t.measurementSource(entry.date, definition.label), measurement: true });
  }
  return { facts, insights: progressReview(finished, today, new Map(exercises.map((exercise) => [exercise.id, exercise.title])), locale) };
}

/**
 * Gösterilecek özetler (`shown`, isteğin dilinde) ve karmaya girecek Türkçe hâli (`canonical`). Dil Türkçeyse ikisi
 * aynıdır; değilse Türkçe hâli Türkçe katalogla yeniden yazılır (okuma yok, yalnız metin).
 */
export function coachFactsFor(records: CoachRecords, catalogs: { shown: readonly CatalogItem[]; canonical: readonly CatalogItem[] }, locale: Locale) {
  const shown = describeCoach(records, catalogs.shown, locale);
  const canonical = locale === DEFAULT_LOCALE ? shown : describeCoach(records, catalogs.canonical, DEFAULT_LOCALE);
  return { shown, canonical };
}

/**
 * Taslağın değişiklik karması: danışanın izinleri, bakım girdisi, Türkçe özetler ve değerlendirme, Türkçe katalog ve
 * program. Alan sırası eski koddakiyle aynı (karma JSON'dan çıkar). Bakım girdisinin `locale` alanı (gerekçe metinlerinin
 * dili) karmaya girmez: girerse her Türkçe karma değişir, bekleyen taslaklar reddedilirdi.
 */
export function coachContextHash(
  hash: (value: unknown) => string,
  parts: { client: { modules: unknown; consents: unknown }; care: CareInput; canonical: DescribedCoach; catalog: readonly unknown[]; program: unknown },
): string {
  const { locale: _locale, ...care } = parts.care;
  return hash({ client: { modules: parts.client.modules, consents: parts.client.consents }, care, facts: hashableFacts(parts.canonical.facts), insights: parts.canonical.insights, catalog: parts.catalog, program: parts.program });
}

/** Genel koçta bir danışanın özetleri: okunamadıysa `null`. `shown` isteğin dilinde, `canonical` karma için Türkçe. */
export type GeneralSnapshot = { client: { name: string }; shown: readonly CoachFact[] | null; canonical: readonly CoachFact[] | null };

/** Genel (tüm danışanlar) bağlamın özetleri: kapsam notu, her danışandan en çok altı özet, en çok 100 özet. */
export function generalFacts(locale: Locale, snapshots: readonly GeneralSnapshot[], counts: { total: number; allowed: number }, pick: 'shown' | 'canonical'): CoachFact[] {
  const t = coachMessages(locale).general;
  const facts: CoachFact[] = [{ text: t.scope(counts.total, counts.allowed), source: t.scopeSource }];
  for (const snapshot of snapshots) {
    const own = snapshot[pick];
    if (!own) {
      facts.push({ text: t.unreadable(snapshot.client.name), clientName: snapshot.client.name, source: t.unreadableSource });
      continue;
    }
    const plain = own.filter((fact) => !fact.exerciseId && !fact.measurement).slice(0, 2);
    const chosen = [...plain, ...own.filter((fact) => fact.exerciseId).slice(0, 2), ...own.filter((fact) => fact.measurement).slice(0, 2)];
    facts.push(...chosen.map((fact) => ({ ...fact, text: `${snapshot.client.name}: ${fact.text}`, clientName: snapshot.client.name, source: `${fact.source} · ${snapshot.client.name}` })));
  }
  if (facts.length > 100) facts.push({ text: t.capped, source: t.cappedSource });
  return facts;
}

/** Genel bağlamın karması: Türkçe özetlerden, dilden bağımsız (saklı genel değerlendirmeler dil değişince kaybolmasın). */
export function generalHash(hash: (value: unknown) => string, snapshots: readonly GeneralSnapshot[], counts: { total: number; allowed: number }): string {
  return hash(hashableFacts(generalFacts(DEFAULT_LOCALE, snapshots, counts, 'canonical')));
}
