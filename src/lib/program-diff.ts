import { DEFAULT_LOCALE, type Locale } from '../i18n/locale.ts';
import { programLogMessages } from '../i18n/messages/program-log/index.ts';
import { lower } from '../i18n/text.ts';
import { getFormat } from './format.ts';
import {
  appendLog,
  capChanges,
  currentPhaseChange,
  keepHiddenPhase,
  settleSchedule,
  type LogKind,
  type ProgramBody,
  type ProgramChange,
  type ProgramDay,
  type ProgramPhase,
  type ProgramState,
} from './program-plan.ts';
import { cardioKind } from './cardio.ts';
import { ptTargetsEdit } from './client-targets.ts';
import { progressionLabels, rirLabels, type TrackingType } from './progression.ts';
import { sameWeekdays, weekdaysText } from './day-assignments.ts';
import { amrapIndexes, resizeSets, setShape, setsText, type SetSpec } from './set-plan.ts';
import {
  blockKindLabels,
  DEFAULT_TRANSITION_SECONDS,
  formatRest,
  roundsOf,
  type BlockKind,
  type TemplateBlock,
  type TemplateRow,
  type TemplateTarget,
} from './template-plan.ts';

/**
 * Program geçmişi (SPEC §7.4): PT'nin her kaydında eski ve yeni program karşılaştırılır,
 * okunur Türkçe cümleler çıkar ("Gün A: Goblet Squat 3×8–12 → 12/10/8 (piramit %80/%90/%100) · Leg
 * Press: son set AMRAP · Haftada 2 → 3 gün"). Gerekçe alanı yok. Cümleler
 * `program.json`'daki geçmişe (kırpılmış; tek kırpma noktası `appendLog`) ve commit mesajına (tamamı) girer.
 *
 * Satırlar satır kimliğiyle, bloklar blok kimliğiyle, günler ve evreler kendi
 * kimlikleriyle eşlenir: sıralama ya da gruplama "sil + ekle" diye yazılmaz. Setler
 * satırla taşındığı için gruplama ve gruptan çıkarma set cümlesi üretmez.
 *
 * Saf fonksiyonlar; yol takma adıyla çalışma zamanı içe aktarması yapmaz.
 */

export type DiffContext = {
  /** Geçmiş cümlelerinin dili (yazanın dili); yoksa Türkçe. */
  locale?: Locale;
  exercises: ReadonlyMap<string, { title: string; trackingType: TrackingType; pattern?: string | undefined; locomotion?: boolean | undefined }>;
  devices: ReadonlyMap<string, { name: string }>;
};

const NOTE_EXCERPT = 60;
const SUBJECT_MAX = 72;

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function count(value: number, locale: Locale): string {
  return getFormat(locale).number(value);
}

/** "8–12", "8", "30–60 sn", "45 sn". */
function targetShort(target: TemplateTarget, trackingType: TrackingType, locale: Locale): string {
  const range = target.min === target.max ? count(target.min, locale) : `${count(target.min, locale)}–${count(target.max, locale)}`;
  return trackingType === 'duration' ? programLogMessages(locale).diff.seconds(range) : range;
}

/** Reçete: "3×8–12", "5×5", "3×30–60 sn" (düz setler; set başına biçim `setsText`). */
export function prescriptionText(sets: number, target: TemplateTarget, trackingType: TrackingType, locale: Locale = DEFAULT_LOCALE): string {
  return `${count(sets, locale)}×${targetShort(target, trackingType, locale)}`;
}

function restText(seconds: number, locale: Locale): string {
  return seconds <= 0 ? programLogMessages(locale).diff.none : formatRest(seconds, locale);
}

function weeksText(weeks: number | undefined, locale: Locale): string {
  const t = programLogMessages(locale).diff;
  return weeks === undefined ? t.openEnded : t.weeks(weeks, count(weeks, locale));
}

function kindLower(kind: BlockKind, locale: Locale): string {
  return lower(locale, blockKindLabels(locale)[kind]);
}

type Located = { row: TemplateRow; block: TemplateBlock };

function flatten(blocks: readonly TemplateBlock[]): Map<string, Located> {
  return new Map(blocks.flatMap((block) => block.rows.map((row) => [row.id, { row, block }] as const)));
}

function sameRule(a: TemplateRow['rule'], b: TemplateRow['rule']): boolean {
  if (!a || !b) return !a && !b;
  return a.scheme === b.scheme && a.targetRir === b.targetRir;
}

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/** Bütün hareketlerin set sayısı aynı mı (tur değişimi grup cümlesiyle anlatılabilir). */
function uniformCount(block: TemplateBlock): boolean {
  const first = block.rows[0]?.sets.length;
  return block.rows.every((row) => row.sets.length === first);
}

/** Yalnız AMRAP işaretleri mi değişti (sayı, aralık, yüzde, mesafe, eğim aynı). */
function amrapOnly(a: readonly SetSpec[], b: readonly SetSpec[]): boolean {
  return (
    a.length === b.length &&
    a.every((set, index) => {
      const other = b[index];
      return (
        other !== undefined &&
        set.min === other.min &&
        set.max === other.max &&
        set.loadPct === other.loadPct &&
        set.distanceM === other.distanceM &&
        set.inclinePct === other.inclinePct
      );
    })
  );
}

/** AMRAP değişiminin cümlesi: "son set AMRAP", "AMRAP 2., 3. set", "AMRAP kaldırıldı"… */
function amrapChange(a: readonly SetSpec[], b: readonly SetSpec[], locale: Locale): string {
  const t = programLogMessages(locale).diff;
  const before = setShape(a).amrap;
  const after = setShape(b).amrap;
  const single = b.length === 1;
  if (after === 'none') return before === 'last' && !single ? t.amrapRemovedLast : t.amrapRemoved;
  if (after === 'last') return single ? t.amrapOne : t.amrapLast;
  if (after === 'all') return t.amrapAll;
  return t.amrapSome(amrapIndexes(b).map((index) => index + 1));
}

/** Bir günün değişiklikleri (kapsamsız cümleler). */
export function diffDay(before: Pick<ProgramDay, 'blocks'>, after: Pick<ProgramDay, 'blocks'>, ctx: DiffContext): string[] {
  const locale = ctx.locale ?? DEFAULT_LOCALE;
  const t = programLogMessages(locale).diff;
  const kindLabels = blockKindLabels(locale);
  const title = (row: TemplateRow) => ctx.exercises.get(row.exerciseId)?.title ?? row.exerciseId;
  const tt = (row: TemplateRow): TrackingType => ctx.exercises.get(row.exerciseId)?.trackingType ?? 'weight_reps';
  // Yürüyüş/koşuda süre dakikayla yazılır (`cardio.ts`).
  const cardioOf = (row: TemplateRow) => {
    const exercise = ctx.exercises.get(row.exerciseId);
    return exercise ? cardioKind(exercise) : null;
  };
  const names = (block: TemplateBlock) => block.rows.map(title).join(' + ');

  const beforeRows = flatten(before.blocks);
  const afterRows = flatten(after.blocks);
  const beforeBlocks = new Map(before.blocks.map((block) => [block.id, block]));
  const afterBlocks = new Map(after.blocks.map((block) => [block.id, block]));

  // Grup cümleleri önce hesaplanır (tur değişimi satırlarda tekrar yazılmasın), sonra yazılır.
  const groupLines: string[] = [];
  const roundsReported = new Set<string>();
  for (const block of after.blocks) {
    if (block.kind === 'single') continue;
    const old = beforeBlocks.get(block.id);
    const label = kindLabels[block.kind];
    if (!old || old.kind === 'single') {
      groupLines.push(t.newGroup(kindLower(block.kind, locale), names(block)));
    } else if (old.kind !== block.kind) {
      groupLines.push(t.groupKindChanged(kindLabels[old.kind], kindLower(block.kind, locale), names(block)));
    } else if (
      !sameOrder(
        old.rows.map((row) => row.id),
        block.rows.map((row) => row.id),
      ) &&
      block.rows.some((row) => {
        const previous = beforeRows.get(row.id);
        return previous !== undefined && previous.block.id !== block.id;
      })
    ) {
      groupLines.push(t.groupUpdated(label, names(block)));
    }
    if (old && old.kind !== 'single') {
      // Tur cümlesi yalnız hareketlerin set sayısı önce de sonra da eşitse; değilse satır cümleleri anlatır.
      const oldRounds = roundsOf(old);
      const newRounds = roundsOf(block);
      if (oldRounds !== newRounds && uniformCount(old) && uniformCount(block)) {
        groupLines.push(t.groupRounds(label, names(block), count(oldRounds, locale), count(newRounds, locale), newRounds));
        roundsReported.add(block.id);
      }
      if (old.restSeconds !== block.restSeconds) {
        groupLines.push(t.groupRest(label, names(block), restText(old.restSeconds, locale), restText(block.restSeconds, locale)));
      }
      const oldTransition = old.transitionSeconds ?? DEFAULT_TRANSITION_SECONDS;
      const newTransition = block.transitionSeconds ?? DEFAULT_TRANSITION_SECONDS;
      if (old.kind === 'circuit' && block.kind === 'circuit' && oldTransition !== newTransition) {
        groupLines.push(t.groupTransition(label, names(block), restText(oldTransition, locale), restText(newTransition, locale)));
      }
    }
  }
  for (const old of before.blocks) {
    if (old.kind === 'single') continue;
    const now = afterBlocks.get(old.id);
    if (now && now.kind !== 'single') continue;
    if (old.rows.some((row) => afterRows.has(row.id))) groupLines.push(t.groupDissolved(kindLabels[old.kind], names(old)));
  }

  const rowLines: string[] = [];
  for (const [rowId, next] of afterRows) {
    const previous = beforeRows.get(rowId);
    if (!previous) continue;
    const a = previous.row;
    const b = next.row;
    const name = title(b);
    if (a.exerciseId !== b.exerciseId) rowLines.push(`${title(a)} → ${name}`);

    // Gruptan çıkan satır (grup aynı türde sürdüğü için grup cümlesi yok): dağıtma değilse yazılır.
    const group = afterBlocks.get(previous.block.id);
    if (previous.block.kind !== 'single' && next.block.kind === 'single' && group && group.kind !== 'single') {
      rowLines.push(t.leftGroup(name, restText(next.block.restSeconds, locale)));
    }

    const textA = setsText(a.sets, tt(a), cardioOf(a), locale);
    const textB = setsText(b.sets, tt(b), cardioOf(b), locale);
    if (textA !== textB) {
      const roundsOnly =
        roundsReported.has(next.block.id) &&
        previous.block.id === next.block.id &&
        setsText(resizeSets(a.sets, b.sets.length), tt(a), cardioOf(a), locale) === textB;
      if (tt(a) === tt(b) && amrapOnly(a.sets, b.sets)) rowLines.push(`${name}: ${amrapChange(a.sets, b.sets, locale)}`);
      else if (!roundsOnly) rowLines.push(`${name} ${textA} → ${textB}`);
    }

    if (previous.block.kind === 'single' && next.block.kind === 'single' && previous.block.restSeconds !== next.block.restSeconds) {
      rowLines.push(t.rowRest(name, restText(previous.block.restSeconds, locale), restText(next.block.restSeconds, locale)));
    }

    if (!sameRule(a.rule, b.rule)) {
      rowLines.push(
        b.rule
          ? t.rowRule(name, progressionLabels(locale)[b.rule.scheme], rirLabels(locale)[b.rule.targetRir] ?? t.rirFallback(b.rule.targetRir))
          : t.rowRuleReset(name),
      );
    }

    if (a.deviceId !== b.deviceId) {
      rowLines.push(b.deviceId ? t.rowDevice(name, ctx.devices.get(b.deviceId)?.name ?? t.deletedDevice) : t.rowDeviceReset(name));
    }

    if ((a.note ?? '') !== (b.note ?? '')) {
      rowLines.push(b.note ? t.rowNote(name, clip(b.note, NOTE_EXCERPT)) : t.rowNoteRemoved(name));
    }
  }

  const removed = [...beforeRows.values()].filter(({ row }) => !afterRows.has(row.id)).map(({ row }) => t.removed(title(row)));
  const added = [...afterRows.values()].filter(({ row }) => !beforeRows.has(row.id)).map(({ row }) => t.added(title(row)));

  const keptAfter = [...afterRows.keys()].filter((id) => beforeRows.has(id));
  const keptBefore = [...beforeRows.keys()].filter((id) => afterRows.has(id));
  const order = sameOrder(keptBefore, keptAfter) ? [] : [t.orderChanged];

  return [...rowLines, ...groupLines, ...removed, ...added, ...order];
}

/** "haftada 3 gün". */
function perWeek(daysPerWeek: number, locale: Locale): string {
  return programLogMessages(locale).diff.perWeek(daysPerWeek, count(daysPerWeek, locale));
}

/** Evre özetinin parçaları: süre, sıklık, günler ("2 hafta · haftada 3 gün · Gün A, Gün B"). */
function phaseParts(phase: ProgramPhase, withDays: boolean, locale: Locale): string {
  return [
    phase.weeks !== undefined ? weeksText(phase.weeks, locale) : null,
    phase.daysPerWeek !== undefined ? perWeek(phase.daysPerWeek, locale) : null,
    withDays ? phase.days.map((day) => day.name).join(', ') : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ');
}

/** Sıklık değişimi: evresizde programın, evreli programda evrenin. */
function frequencyChange(before: number | undefined, after: number | undefined, phaseName: string | null, locale: Locale): string | null {
  if (before === after) return null;
  const t = programLogMessages(locale).diff;
  if (phaseName === null) {
    if (before === undefined) return t.frequency(perWeek(after as number, locale));
    if (after === undefined) return t.frequencyRemoved(perWeek(before, locale));
    return t.frequencyChanged(count(before, locale), count(after, locale), after);
  }
  if (before === undefined) return t.phaseFrequency(phaseName, perWeek(after as number, locale));
  if (after === undefined) return t.phaseFrequencyRemoved(phaseName, perWeek(before, locale));
  return t.phaseFrequencyChanged(phaseName, count(before, locale), count(after, locale), after);
}

/**
 * Programın değişiklikleri, sırayla: günlerin içi, günler (ad, ekleme, silme, sıra, evre
 * değişimi), evreler (bölme/kaldırma, ad, süre, sıklık, ekleme, silme, sıra), şu anki
 * evre. Evre birden çoksa kapsam "Evre · Gün", tek evrede yalnız gün adı. Evrelere
 * bölme ve evreleri kaldırma tek cümledir: o kayıtta evre adı, süre, ekleme ve günlerin
 * evre değiştirmesi ayrıca yazılmaz. Cümleler kırpılmaz: dosyanın sınırı (300/90) `appendLog`'da.
 */
export function diffProgram(before: ProgramBody, after: ProgramBody, ctx: DiffContext): ProgramChange[] {
  const locale = ctx.locale ?? DEFAULT_LOCALE;
  const t = programLogMessages(locale).diff;
  const changes: ProgramChange[] = [];
  const push = (text: string, scope?: string) => changes.push({ ...(scope ? { scope } : {}), text });

  const toggledOn = !before.phased && after.phased;
  const toggledOff = before.phased && !after.phased;
  const toggled = toggledOn || toggledOff;
  const multi = after.phases.length > 1;
  const dayScope = (phase: ProgramPhase, day: ProgramDay) => (multi ? `${phase.name} · ${day.name}` : day.name);
  const phaseScope = (phase: ProgramPhase) => (multi ? phase.name : undefined);

  const phaseOfDay = (phases: readonly ProgramPhase[]) =>
    new Map(phases.flatMap((phase) => phase.days.map((day) => [day.id, { phase, day }] as const)));
  const beforeDays = phaseOfDay(before.phases);
  const afterDays = phaseOfDay(after.phases);
  const beforePhases = new Map(before.phases.map((phase) => [phase.id, phase]));
  const afterPhases = new Map(after.phases.map((phase) => [phase.id, phase]));

  // 1. Günlerin içi.
  for (const phase of after.phases) {
    for (const day of phase.days) {
      const old = beforeDays.get(day.id)?.day;
      if (!old) continue;
      for (const text of diffDay(old, day, ctx)) push(text, dayScope(phase, day));
    }
  }

  // 2. Günler: ad ve atandığı günler (programın her yerinde); her iki sürümde de olan evrelerde ekleme,
  // silme, sıra (yeni evrenin günleri evreyle birlikte yazılır); evresi değişen gün. Yeni eklenen günün
  // atandığı günler yazılmaz ("… eklendi" yeter; birleşim değiştiyse antrenman günleri cümlesi söyler).
  for (const phase of after.phases) {
    const scope = phaseScope(phase);
    for (const day of phase.days) {
      const previous = beforeDays.get(day.id)?.day;
      if (previous && previous.name !== day.name) push(t.dayRenamed(previous.name, day.name), scope);
      if (previous && !sameWeekdays(previous.weekdays, day.weekdays)) {
        push(
          t.dayWeekdays(weekdaysText(previous.weekdays ?? [], locale) || t.none, weekdaysText(day.weekdays ?? [], locale) || t.none),
          dayScope(phase, day),
        );
      }
    }
    const old = beforePhases.get(phase.id);
    if (!old) continue;
    for (const day of phase.days) {
      if (beforeDays.has(day.id)) continue;
      push(day.source ? t.dayAddedFrom(day.name, day.source.templateName) : t.dayAdded(day.name), scope);
    }
    for (const day of old.days) {
      if (!afterDays.has(day.id)) push(t.dayDeleted(day.name), scope);
    }
    const oldIds = new Set(old.days.map((day) => day.id));
    const newIds = new Set(phase.days.map((day) => day.id));
    const keptBefore = old.days.filter((day) => newIds.has(day.id)).map((day) => day.id);
    const keptAfter = phase.days.filter((day) => oldIds.has(day.id)).map((day) => day.id);
    if (!sameOrder(keptBefore, keptAfter)) push(t.dayOrder(phase.days.map((day) => day.name).join(', ')), scope);
  }
  // Silinen evrenin günleri evreyle birlikte yazılır; evreler kaldırılırken silinen gün ayrıca.
  if (toggledOff) {
    for (const phase of before.phases) {
      if (afterPhases.has(phase.id)) continue;
      for (const day of phase.days) if (!afterDays.has(day.id)) push(t.dayDeleted(day.name));
    }
  }
  if (!toggled) {
    for (const phase of after.phases) {
      for (const day of phase.days) {
        const previous = beforeDays.get(day.id);
        if (previous && previous.phase.id !== phase.id) push(t.dayMoved(day.name, phase.name));
      }
    }
  }

  // 3. Evreler.
  if (toggledOn) {
    push(t.phased(after.phases.map((phase) => `'${phase.name}' (${phaseParts(phase, true, locale)})`).join(', ')));
  } else if (toggledOff) {
    push(t.unphased(after.phases.flatMap((phase) => phase.days.map((day) => day.name)).join(', ')));
  } else {
    for (const phase of after.phases) {
      const old = beforePhases.get(phase.id);
      if (!old) continue;
      if (old.name !== phase.name) push(t.phaseRenamed(old.name, phase.name));
      if (old.weeks !== phase.weeks) push(t.phaseDuration(phase.name, weeksText(old.weeks, locale), weeksText(phase.weeks, locale)));
    }
  }
  if (!toggledOn) {
    for (const phase of after.phases) {
      const old = beforePhases.get(phase.id);
      if (!old) continue;
      const text = frequencyChange(old.daysPerWeek, phase.daysPerWeek, after.phased ? phase.name : null, locale);
      if (text) push(text);
    }
  }
  if (!toggled) {
    for (const phase of after.phases) {
      if (beforePhases.has(phase.id)) continue;
      push(t.phaseAdded(phase.name, phaseParts(phase, false, locale)));
    }
    for (const phase of before.phases) {
      if (!afterPhases.has(phase.id)) push(t.phaseDeleted(phase.name));
    }
    const keptBefore = before.phases.filter((phase) => afterPhases.has(phase.id)).map((phase) => phase.id);
    const keptAfter = after.phases.filter((phase) => beforePhases.has(phase.id)).map((phase) => phase.id);
    if (!sameOrder(keptBefore, keptAfter)) push(t.phaseOrder(after.phases.map((phase) => phase.name).join(', ')));
  }

  // 4. Şu anki evre (evreler kaldırılırken yazılmaz: tek liste kalır).
  if (!toggledOff && before.currentPhaseId !== after.currentPhaseId) {
    const to = afterPhases.get(after.currentPhaseId)?.name ?? '';
    if (toggledOn) {
      push(t.currentPhase(to));
    } else {
      const from = beforePhases.get(before.currentPhaseId)?.name ?? '';
      push(currentPhaseChange(from, to, locale).text);
    }
  }

  return changes;
}

/** Aynı kapsamdaki ardışık değişiklikler tek grup. */
export function groupChanges(changes: readonly ProgramChange[]): { scope?: string; texts: string[] }[] {
  const groups: { scope?: string; texts: string[] }[] = [];
  for (const change of changes) {
    const last = groups.at(-1);
    if (last && last.scope === change.scope) last.texts.push(change.text);
    else groups.push({ ...(change.scope !== undefined ? { scope: change.scope } : {}), texts: [change.text] });
  }
  return groups;
}

/** Tek satırlık özet: "Gün A: … · … · Evre 'Güç' eklendi". */
export function formatChangeSummary(changes: readonly ProgramChange[]): string {
  return groupChanges(changes)
    .map((group) => (group.scope ? `${group.scope}: ${group.texts.join(' · ')}` : group.texts.join(' · ')))
    .join(' · ');
}

/**
 * Commit mesajı: konu satırı özet (en fazla 72 karakter), birden çok değişiklik varsa ya
 * da konu kırpıldıysa gövdede her değişiklik bir satır (kırpılmadan). Git geçmişi tam kayıttır.
 */
export function commitMessage(kind: LogKind, changes: readonly ProgramChange[], locale: Locale = DEFAULT_LOCALE): string {
  const t = programLogMessages(locale).diff;
  const summary = formatChangeSummary(changes);
  const full = summary ? (kind === 'create' ? summary : t.commitProgram(summary)) : kind === 'create' ? t.commitCreated : t.commitUpdated;
  const subject = clip(full, SUBJECT_MAX);
  if (changes.length <= 1 && subject === full) return subject;
  const lines = changes.map((change) => `- ${change.scope ? `${change.scope}: ` : ''}${change.text}`);
  return `${subject}\n\n${lines.join('\n')}`;
}

/**
 * PT'nin kaydı: farkı çıkarır, değişiklik yoksa `null` (hiçbir şey yazılmaz). Varsa
 * revision +1, geçmişe kayıt (en fazla 60 değişiklik), şu anki evre değiştiyse yeni evre
 * şimdi başlar. Eski dosyanın rotasyonu (Faz 3'te okunmaz) olduğu gibi taşınır; evre geçişinde son
 * gün düşer. Evrelere bölme/kaldırma "Düzenlendi" kaydıdır. Evresiz program evresiz kalırsa gizli
 * evre kayıttakidir (`keepHiddenPhase`): fark gün düzeyinde.
 * Antrenman günleri (Faz 3) gövdenin şu anki evresinin atamalarından yeniden yazılır, kayıttaki danışan
 * katmanı düşer (`settleSchedule`; eski programın ilk kaydı başka değişiklik olmasa da katmanı siler);
 * gövdenin program düzeyindeki `weekdays`'i okunmaz (eski gövde daha önce atanmıştır: `upgradeProgramBody`,
 * `bodyWithAssignments`, `keepStoredAssignments`). Danışanın satır hedefleri (`clientTargets`) rotasyon gibi
 * korunur; PT satırın setlerini ya da hareketini değiştirdiyse o satırın hedefi düşer ve kayda yazılır
 * (`ptTargetsEdit`: PT kazanır). `note`: kaydın sonuna eklenen cümleler (onaylanan danışan önerisi); fark
 * yoksa kayıt yine yazılmaz. Dönen `changes` kırpılmamıştır (commit mesajı için).
 */
export function applyProgramEdit(
  stored: ProgramState,
  input: ProgramBody,
  ctx: DiffContext,
  now: Date,
  note: readonly ProgramChange[] = [],
): { program: ProgramState; changes: ProgramChange[] } | null {
  const locale = ctx.locale ?? DEFAULT_LOCALE;
  const body = keepHiddenPhase(stored, input);
  const storedDays = new Map(stored.phases.flatMap((phase) => phase.days.map((day) => [day.id, day] as const)));
  // Düzenleyici kaynağı göndermediyse kayıttaki kaynak korunur.
  const phases = body.phases.map((phase) => ({
    ...phase,
    days: phase.days.map((day) => {
      const source = storedDays.get(day.id)?.source;
      return day.source || !source ? day : { ...day, source };
    }),
  }));

  const at = now.toISOString();
  // Antrenman günleri: gövdenin şu anki evresinin atamalarının birleşimi; danışanın eski katmanı düşer.
  const current = phases.find((phase) => phase.id === body.currentPhaseId) ?? phases[0];
  const schedule = settleSchedule(stored, current?.days ?? [], at, locale);
  const structural = diffProgram(
    { phased: stored.phased, currentPhaseId: stored.current.phaseId, phases: stored.phases },
    { phased: body.phased, currentPhaseId: body.currentPhaseId, phases },
    ctx,
  );
  const diff = [...structural, ...schedule.changes.map((text): ProgramChange => ({ text }))];
  if (diff.length === 0) return null;
  // Danışanın satır hedefleri: değişmeyen satırda kalır, PT'nin değiştirdiği satırda düşer (kayda yazılır).
  const targets = ptTargetsEdit(stored.phases, phases, stored.clientTargets, {
    titleOf: (exerciseId) => ctx.exercises.get(exerciseId)?.title ?? exerciseId,
    trackingOf: (exerciseId) => ctx.exercises.get(exerciseId)?.trackingType ?? 'weight_reps',
    multiPhase: phases.length > 1,
    locale,
  });
  const changes = [...diff, ...targets.changes, ...note];

  const revision = stored.revision + 1;
  const currentChanged = body.currentPhaseId !== stored.current.phaseId;
  const toggled = stored.phased !== body.phased;
  // Türü programın kendi farkı belirler: evre geçişi atamalı evreler arasında günlerin satırlarını da (birleşim,
  // danışanın katmanı) getirir; onlar "Evre geçişi"ni "Düzenlendi" yapmasın (`startPhase` de aynı kaydı yazar).
  const kind: LogKind = currentChanged && structural.length === 1 && !toggled ? 'phase' : 'edit';
  // Dönüş (rotasyon) Faz 3'te okunmaz (Karar 5); eski dosyanın alanı olduğu gibi taşınır, evre geçişinde son gün
  // `startPhase`'teki gibi düşer.
  const { lastDayId: _dropped, ...withoutDay } = stored.rotation;
  const { schedule: _schedule, clientSchedule: _clientSchedule, clientTargets: _clientTargets, ...rest } = stored;

  return {
    program: {
      ...rest,
      ...(schedule.schedule ? { schedule: schedule.schedule } : {}),
      ...(targets.clientTargets ? { clientTargets: targets.clientTargets } : {}),
      phased: body.phased,
      revision,
      updatedAt: at,
      phases,
      current: currentChanged ? { phaseId: body.currentPhaseId, startedAt: at } : stored.current,
      rotation: currentChanged ? withoutDay : stored.rotation,
      log: appendLog(stored.log, { at, revision, kind, changes: capChanges(changes, undefined, locale) }),
    },
    changes,
  };
}
