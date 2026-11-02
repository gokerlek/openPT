import { cardioParts, cardioText, minutesOf, walkKcal, type CardioKind } from './cardio.ts';
import { formatKg, formatNumber } from './format.ts';
import { isFullLoad, isOverload, nextSetInPlan, type Effort, type SetTarget, type TrackingType } from './progression.ts';
import { SESSION_ID_LENGTHS, SESSION_LIMITS, type SessionDoc, type SessionEntry, type SessionSet } from './schemas/session.ts';
import { volumeOf, waterOf, workingSetCount } from './session-index.ts';
import { normalizeSession, withDeletions } from './session-merge.ts';
import { toSetResults } from './session-results.ts';
import { randomId, ROW_ID_PATTERN, type TemplateRow } from './template-plan.ts';
import {
  completionOf,
  entryForRow,
  entryStatusOf,
  prefillSet,
  remaining,
  rowKeyOf,
  slotDone,
  workoutCursor,
  type CursorUnit,
  type PlanOverrides,
  type PreviousSet,
  type Stamp,
  type WorkoutCursor,
} from './workout-cursor.ts';
import { dayBody, entryPlanOf, type WorkoutDay, type WorkoutRow } from './workout-plan.ts';

/**
 * Antrenman ekranının telefondaki işleri (tasarım §2.4, §2.5, §4.2) — saf: yeni belge, sıradaki set ve
 * önceden dolu değerleri, "Set bitti", setin düzenlenmesi, silinmesi ve "Geri al"la geri gelmesi, su, bitiş özeti, ekran metinleri.
 * Belge değişiklikleri `session-merge.ts`'in kanonik biçimine döner; imleç `workout-cursor.ts`'ten.
 *
 * - Hareket kaydı (entry) ilk setle oluşur; set o günkü hedefi (`target`), planın üst ağırlığını ve set
 *   sayısını taşır: motor kaydı o günkü plana göre değerlendirir.
 * - Setin satırdaki yeri (`setIndex`) planın setlerinden gelir; ortadaki bir set silinse de sıradaki
 *   set, planda henüz yapılmamış ilk settir (aynı `setIndex` iki kez yazılmaz).
 * - Önceden dolu ağırlık: kaydedilmemiş taslak → bu seansın önceki setlerinden öneri
 *   (`nextSetInPlan`: aynı yüzdede önceki setin ağırlığı, basamakta son tam yük setinden; danışan
 *   önceki basamağı plandan farklı yaptıysa onun ağırlığı) → plan.
 *   Tekrar/süre: taslak → geçen seferki aynı sıradaki setin aynı ağırlıktaki değeri → aralığın altı
 *   (`prefillSet`; tepe hiçbir zaman önceden dolmaz).
 * - Set türleri (§2.4): ısınma setleri satırdaki ✓ ile yazılır (`type: warmup`, `setIndex` ısınmanın
 *   sırası), imleci ve hacmi etkilemez; aşırı yük (`isOverload`) hareket başına bir kez onaylanır, sonra
 *   setler `overload` işaretiyle yazılır ve PT'ye bildirim gider.
 * - Zorluk hareket başına bir kez (§2.5): hareketin (grupta bütün üyelerin) son setinden sonra;
 *   cevap AMRAP olmayan bütün çalışma setlerine yazılır. AMRAP'ta sorulmaz: tam yükte AMRAP olmayan
 *   set yoksa soru da yok. Ara setlerde "Kolaydı · sonraki set X kg" kısayolu yalnız o sete `easy`
 *   yazar; artışı `nextSetInPlan`'in "kolay ve tepede" kuralı verir.
 * - "+ Set ekle" (§2.4, §6.1): birime fazladan tur istenir (günün etkin hâlinde `extraRounds`); fazladan
 *   set planın son setini tekrarlar (hedefi, yüzdesi; AMRAP'sız), ağırlığı bu hareketin son setinden,
 *   tekrarı aralığın altından. `extra: true` yazılır: motora ve plan sayısına girmez, bitişte set sayısı
 *   önerisinin girdisidir (`program-feedback.ts`, 2-for-2).
 */

type Random = (n: number) => Uint8Array;

/** Belgede kullanılmış bütün kimlikler (silinenler dahil): yeni kimlik bunlarla çakışmaz. */
function takenIds(doc: SessionDoc): Set<string> {
  const ids = new Set<string>([...doc.deletedSetIds, ...doc.deletedEntryIds, ...doc.waterTaps.map((tap) => tap.id)]);
  for (const entry of doc.entries) {
    ids.add(entry.id);
    for (const set of entry.sets) ids.add(set.id);
  }
  return ids;
}

/** Yeni hareket kaydı kimliği (belgedeki ve silinmiş kimliklerle çakışmaz): "Hareket ekle". */
export function newEntryId(doc: SessionDoc, random?: Random): string {
  return randomId('e', SESSION_ID_LENGTHS.e, takenIds(doc), random);
}

/**
 * Plan satırının kaydının kimliği: iki cihaz aynı satıra aynı kimliği verir (birleşimde tek kayıt,
 * setler birleşir). Kimlik alınmışsa (silinmiş kayıt) rastgele.
 */
export function rowEntryId(rowId: string, taken: Set<string>, random?: Random): string {
  const id = `e_${rowId.slice(2)}`;
  return ROW_ID_PATTERN.test(rowId) && !taken.has(id) ? id : randomId('e', SESSION_ID_LENGTHS.e, taken, random);
}

/** Plan satırının yeni kaydının kimliği (`rowEntryId`, belgedeki kimliklerle): "Değiştir". */
export function newRowEntryId(doc: SessionDoc, rowId: string, random?: Random): string {
  return rowEntryId(rowId, takenIds(doc), random);
}

/** Yeni antrenman (telefonda; dosya ilk setle oluşur, tasarım §4.3). `today`: uygulamanın saat dilimindeki gün. */
export function newSessionDoc(day: WorkoutDay, input: { today: string; now: Date; writer: string; random?: Random }): SessionDoc {
  return {
    version: 1,
    id: randomId('s', SESSION_ID_LENGTHS.s, new Set(), input.random),
    status: 'active',
    date: input.today,
    startedAt: input.now.toISOString(),
    program: {
      revision: day.revision,
      phaseId: day.phaseId,
      dayId: day.dayId,
      dayName: day.dayName,
      ...(day.plannedDayId ? { plannedDayId: day.plannedDayId } : {}),
      ...(day.plannedDayId && day.plannedDayId !== day.dayId && day.plannedDayName ? { plannedDayName: day.plannedDayName } : {}),
      // Kendi program: sunucu günü, bitişin kipini ve geçmişin rozetini buradan bilir (yoksa PT'nin programı sanılır).
      ...(day.source === 'own' && day.programId ? { programId: day.programId, ...(day.programName ? { programName: day.programName } : {}) } : {}),
    },
    writer: input.writer,
    entries: [],
    deletedSetIds: [],
    deletedEntryIds: [],
    waterTaps: [],
    notices: [],
  };
}

/** Bugünkü planın satır başına çalışma seti (hafifletmede daha az): imlecin planı. */
export function plannedSetCounts(day: Pick<WorkoutDay, 'rows'>): Map<string, number> {
  return new Map(Object.values(day.rows).map((row) => [row.rowId, row.plan.sets.length]));
}

/** İmlecin günün planından aldıkları: satır başına planlanan set ve istenen fazladan turlar. */
export function cursorOverrides(day: Pick<WorkoutDay, 'rows' | 'extraRounds'>): PlanOverrides {
  const extras = Object.entries(day.extraRounds ?? {}).filter(([, rounds]) => rounds > 0);
  return {
    plannedSets: plannedSetCounts(day),
    ...(extras.length > 0 ? { extraRounds: new Map(extras) } : {}),
  };
}

/** Günün imleci; `focus` (birim anahtarı) verilince sıradaki set yalnız o birimde aranır (`workoutCursor`). */
export function cursorOf(day: WorkoutDay, doc: Pick<SessionDoc, 'entries' | 'order'>, focus?: string | null): WorkoutCursor {
  return workoutCursor(dayBody(day), doc, cursorOverrides(day), focus);
}

export function templateRowOf(day: WorkoutDay, rowId: string): TemplateRow | undefined {
  for (const block of day.blocks) {
    const row = block.rows.find((item) => item.id === rowId);
    if (row) return row;
  }
  return undefined;
}

/** Satırın birimi (blok; eklenen harekette kaydın kimliği): fazladan turlar bununla istenir. */
export function unitKeyOfRow(day: Pick<WorkoutDay, 'blocks'>, rowId: string): string | undefined {
  return day.blocks.find((block) => block.rows.some((row) => row.id === rowId))?.id;
}

function workingOf(entry: SessionEntry | undefined): SessionSet[] {
  return entry ? entry.sets.filter((set) => set.type === 'working' && !set.extra) : [];
}

function extrasOf(entry: SessionEntry | undefined): SessionSet[] {
  return entry ? entry.sets.filter((set) => set.type === 'working' && set.extra) : [];
}

/**
 * Fazladan setin planı: planın son seti (hafifletilen günde de) tekrarlanır; hedefi ve yüzdesi onunki,
 * AMRAP değil. Ağırlık o setin planlanan ağırlığı.
 */
function extraPlanOf(row: WorkoutRow, template: TemplateRow): { target: SetTarget; plannedKg: number; cap: number | undefined } {
  const last = row.plan.sets.at(-1);
  const spec = (last ? template.sets[last.setIndex] : template.sets.at(-1)) ?? { min: last?.target ?? 1, max: last?.target ?? 1 };
  const { amrap: _amrap, ...target } = spec;
  return { target, plannedKg: last?.weightKg ?? row.plan.topWeightKg, cap: last?.target };
}

/** Tablonun bir satırı: planın bir seti ya da fazladan set ve (yapıldıysa) kaydı. */
export type SetView = {
  /** Satırın setleri içindeki sıra (0'dan): "Set 2/3"; fazladan setler planınkilerin arkasından. */
  position: number;
  /** Satırdaki yeri (`row.sets`); fazladan sette planın arkasından. */
  setIndex: number;
  target: SetTarget;
  plannedKg: number;
  previous: PreviousSet | undefined;
  logged: SessionSet | undefined;
  /** "+ Set ekle": yapılmış ya da bekleyen fazladan set. */
  extra?: true;
};

/**
 * Satırın setleri, planın sırasıyla; ardından fazladan setler (yapılanlar, sonra bekleyenler). Bekleyen
 * fazladan set birimin istenen turundan (`extraRounds`); hareket geçildiyse beklemez.
 */
export function setViews(day: WorkoutDay, doc: Pick<SessionDoc, 'entries'>, rowId: string): SetView[] {
  const row = day.rows[rowId];
  const template = templateRowOf(day, rowId);
  if (!row || !template) return [];
  const entry = entryForRow(doc.entries, rowId);
  const logged = new Map(workingOf(entry).map((set, position) => [set.setIndex ?? position, set]));
  const planned: SetView[] = row.plan.sets.map((item, position) => ({
    position,
    setIndex: item.setIndex,
    target: template.sets[item.setIndex] ?? { min: item.target, max: item.target },
    plannedKg: item.weightKg,
    previous: row.lastTime.find((last) => last.setIndex === item.setIndex),
    logged: logged.get(item.setIndex),
  }));
  const done = extrasOf(entry);
  const key = unitKeyOfRow(day, rowId);
  const requested = key ? (day.extraRounds?.[key] ?? 0) : 0;
  const pending = entry?.status === 'skipped' ? 0 : Math.max(0, requested - done.length);
  if (done.length === 0 && pending === 0) return planned;
  const plan = extraPlanOf(row, template);
  const after = Math.max(template.sets.length, ...done.map((set) => (set.setIndex ?? 0) + 1));
  const extras: SetView[] = [
    ...done.map((set, index): SetView => ({
      position: planned.length + index,
      setIndex: set.setIndex ?? template.sets.length + index,
      target: set.target ?? plan.target,
      plannedKg: set.plannedKg ?? plan.plannedKg,
      previous: undefined,
      logged: set,
      extra: true,
    })),
    ...Array.from({ length: pending }, (_, index): SetView => ({
      position: planned.length + done.length + index,
      setIndex: after + index,
      target: plan.target,
      plannedKg: plan.plannedKg,
      previous: undefined,
      logged: undefined,
      extra: true,
    })),
  ];
  return [...planned, ...extras];
}

/** Setin girilen değerleri: ağırlık, tekrar ya da süre (`value`), kardiyoda mesafe ve eğim (`cardio.ts`). */
export type SetValues = {
  kg?: number | undefined;
  value?: number | undefined;
  distanceM?: number | undefined;
  inclinePct?: number | undefined;
};

/** Kaydedilmemiş taslak: danışanın stepper'la değiştirdiği değerler (yalnız o set için). */
export type SetDraft = { rowId: string; setIndex: number } & SetValues;

/**
 * Seçili setin dışındaki setlere yazılanlar: danışan bir satıra yazıp ✓'lamadan başka sete geçince değerler o satırda
 * kalır (set ✓'lanmadıkça yapılmış sayılmaz). Aynı setin eskisinin yerine yazılır.
 */
export function keepTyped(typed: readonly SetDraft[], draft: SetDraft): SetDraft[] {
  return [...withoutTyped(typed, draft.rowId, draft.setIndex), draft];
}

/** Setin yazılanı listeden düşer; listede yoksa aynı liste. */
export function withoutTyped(typed: readonly SetDraft[], rowId: string, setIndex: number): readonly SetDraft[] {
  const rest = typed.filter((item) => item.rowId !== rowId || item.setIndex !== setIndex);
  return rest.length === typed.length ? typed : rest;
}

/** Yalnız hâlâ bekleyen setlerin yazılanları (yapılan, artık günde olmayan set düşer); değişmediyse aynı liste. */
export function pendingTyped(day: WorkoutDay, doc: Pick<SessionDoc, 'entries'>, typed: readonly SetDraft[]): readonly SetDraft[] {
  const rest = typed.filter((item) => setViews(day, doc, item.rowId).some((view) => view.setIndex === item.setIndex && !view.logged));
  return rest.length === typed.length ? typed : rest;
}

export type NextSet = {
  /** İmlecin birimi (blok): hareket kartının kimliği. */
  unitKey: string;
  rowId: string;
  position: number;
  /** Satırın set sayısı (istenen fazladan setler dahil): "Set 2/3". */
  total: number;
  setIndex: number;
  target: SetTarget;
  plannedKg: number;
  /** Bu setten sonra dinlenme; antrenmanın son setinde 0. */
  restAfterSeconds: number;
  /** Önceden dolu ağırlık (ağırlıksız harekette yok) ve tekrar/süre. */
  kg: number | undefined;
  value: number;
  /** Kardiyoda önceden dolu mesafe, yürüyüş/koşuda eğim (`cardioPrefill`); yoksa boş. */
  distanceM?: number;
  inclinePct?: number;
  /** Birimin turu (0'dan; fazladan turda planın turlarının arkasından): grubun "Tur 2/3"ü. */
  round: number;
  /** "+ Set ekle" ile istenen fazladan set. */
  extra?: true;
  /** Danışan tablodan seçti (imlecin sırası dışında): dinlenme bu setin ardındaki, grupta üye geçişi sayılmaz (`afterLog`). */
  chosen?: true;
};

/**
 * Sıradaki set ve önceden dolu değerleri; hepsi yapıldıysa null. `focus`: yalnız o birimin sıradaki seti
 * (birimde set kalmadıysa null). Odakta taslak aynı zamanda seçimdir: danışan tablodan bekleyen başka bir seti seçtiyse
 * (kutusuna dokundu, yazdı) sıradaki set odur; setler istenen sırayla yapılabilir (`chosenSet`).
 */
export function nextSet(
  day: WorkoutDay,
  doc: Pick<SessionDoc, 'entries' | 'order'>,
  draft?: SetDraft | null,
  focus?: string | null,
  typed?: readonly SetDraft[] | null,
): NextSet | null {
  const cursor = cursorOf(day, doc, focus);
  const chosen = draft && focus != null ? chosenSet(day, doc, cursor, draft, focus, typed) : null;
  if (chosen) return chosen;
  const position = cursor.next;
  if (!position?.rowId) return null;
  const unit = cursor.units[position.unit];
  const all = setViews(day, doc, position.rowId);
  const view = all.find((item) => (position.extra === undefined ? !item.extra : item.extra) && !item.logged);
  if (!unit || !view) return null;
  return setAt(day, doc, { unit, rowId: position.rowId, all, view, round: position.round, restAfterSeconds: position.restAfterSeconds }, draft, typed);
}

/**
 * Taslağın seti odaktaki birimde henüz yapılmadıysa sıradaki set odur. İmlecin kendi seti seçiliyse ya da seçim geçersizse
 * (set yapıldı, üye geçildi, başka birimin seti) null: imleç karar verir. Bekleyen fazladan setler birbirinin aynısı: hangisi
 * seçilirse seçilsin ilki yapılır. Dinlenme o setin ardındaki; antrenmanda başka set kalmadıysa yok.
 */
function chosenSet(
  day: WorkoutDay,
  doc: Pick<SessionDoc, 'entries' | 'order'>,
  cursor: WorkoutCursor,
  draft: SetDraft,
  focus: string,
  typed: readonly SetDraft[] | null | undefined,
): NextSet | null {
  const unitIndex = cursor.units.findIndex((item) => item.key === focus);
  const unit = cursor.units[unitIndex];
  const member = unit ? unit.members.findIndex((item) => item.rowId === draft.rowId) : -1;
  if (!unit || member < 0) return null;
  const all = setViews(day, doc, draft.rowId);
  const picked = all.find((item) => item.setIndex === draft.setIndex && !item.logged);
  const view = picked?.extra ? all.find((item) => item.extra && !item.logged) : picked;
  if (!view) return null;
  const extra = view.extra === true;
  const slot = unit.slots.find((item) => item.member === member && (item.extra !== undefined) === extra && !slotDone(unit, item));
  if (!slot) return null;
  const first = all.find((item) => Boolean(item.extra) === extra && !item.logged);
  const next = cursor.next;
  if (next && next.unit === unitIndex && next.member === member && (next.extra !== undefined) === extra && first === view) return null;
  const left = cursor.units.reduce((sum, item) => sum + item.slots.filter((candidate) => !slotDone(item, candidate)).length, 0);
  const set = setAt(day, doc, { unit, rowId: draft.rowId, all, view, round: slot.round, restAfterSeconds: left > 1 ? slot.restAfterSeconds : 0 }, draft, typed);
  return set && { ...set, chosen: true };
}

/**
 * Kardiyo setinin önceden dolu mesafesi ve eğimi (kuvvet setlerindeki gibi): taslak → o sete yazılan → hedef → geçen
 * seferin aynı seti; hiçbiri yoksa boş. Eğim yalnız yürüyüş/koşuda; kardiyo olmayan satırda ikisi de yok.
 */
function cardioPrefill(row: WorkoutRow, target: SetTarget, setIndex: number, own: readonly (SetDraft | undefined)[]): Pick<NextSet, 'distanceM' | 'inclinePct'> {
  if (!row.cardio) return {};
  const last = row.lastTime.find((item) => item.setIndex === setIndex);
  const pick = (key: 'distanceM' | 'inclinePct') => own.map((item) => item?.[key]).find((value) => value !== undefined) ?? target[key] ?? last?.[key];
  const distanceM = pick('distanceM');
  const inclinePct = row.cardio === 'walk' ? pick('inclinePct') : undefined;
  return { ...(distanceM !== undefined ? { distanceM } : {}), ...(inclinePct !== undefined ? { inclinePct } : {}) };
}

/** Satırın bekleyen bir seti (`view`) ve önceden dolu değerleri: taslağınki, yoksa o sete yazılan (`typed`), yoksa öneri. */
function setAt(
  day: WorkoutDay,
  doc: Pick<SessionDoc, 'entries'>,
  at: { unit: CursorUnit; rowId: string; all: SetView[]; view: SetView; round: number; restAfterSeconds: number },
  draft: SetDraft | null | undefined,
  typed: readonly SetDraft[] | null | undefined,
): NextSet | null {
  const { view, all } = at;
  const row = day.rows[at.rowId];
  const template = templateRowOf(day, at.rowId);
  if (!row || !template) return null;

  const entry = entryForRow(doc.entries, at.rowId);
  const mine = (item: SetDraft | null | undefined): item is SetDraft => item != null && item.rowId === at.rowId && item.setIndex === view.setIndex;
  const drafted = mine(draft) ? draft : undefined;
  const saved = typed?.find(mine);
  const own = { kg: drafted?.kg ?? saved?.kg, value: drafted?.value ?? saved?.value };
  const common = {
    unitKey: at.unit.key,
    rowId: at.rowId,
    position: view.position,
    total: all.length,
    setIndex: view.setIndex,
    target: view.target,
    plannedKg: view.plannedKg,
    restAfterSeconds: at.restAfterSeconds,
    round: at.round,
    ...cardioPrefill(row, view.target, view.setIndex, [drafted, saved]),
  };
  if (view.extra) {
    // Fazladan set: ağırlık bu hareketin son setinden (danışanın bugünkü ağırlığı), tekrar aralığın altı.
    const lastKg = entry?.sets.filter((set) => set.type === 'working' && set.kg !== undefined).at(-1)?.kg;
    const kg = row.trackingType === 'weight_reps' ? (own.kg ?? lastKg ?? view.plannedKg) : undefined;
    const cap = row.adjusted ? extraPlanOf(row, template).cap : undefined;
    const value = own.value ?? prefillSet({ target: view.target, setIndex: view.setIndex, plannedKg: kg, lastTime: row.lastTime, cap }).value;
    return { ...common, kg, value, extra: true };
  }

  const views = all.filter((item) => !item.extra);
  const before = views.slice(0, view.position).flatMap((item) => (item.logged ? [item.logged] : []));
  // Bugünün setleri hafifletilen günde de sayılır: planın gerekçesi (`lighten`) yalnız sonraki antrenmanın
  // süzgecidir (`toSetResults`); burada kalsa önceki setin ağırlığı ve inişi sıradaki sete geçmezdi.
  const done = entry ? toSetResults({ ...entry, plan: undefined, sets: before }) : [];
  // Önündeki bir set yapılmadıysa (sırası dışında seçildi) motorun önerisi bu setin değil: planın ağırlığı.
  const suggestion =
    before.length === view.position ? nextSetInPlan({ spec: row.spec, rule: row.rule, sets: template.sets, plan: row.plan, done, raise: !row.adjusted }) : { weightKg: view.plannedKg };
  // Basamak değişirken (piramit, back-off) motor planın üst ağırlığından hesaplar; danışan önceki seti
  // plandan farklı yaptıysa onun ağırlığı kalır (aynı yüzdede motor zaten önceki setin ağırlığını verir).
  const previous = views[view.position - 1];
  const changed =
    previous?.logged?.kg !== undefined && Math.abs(previous.logged.kg - previous.plannedKg) > 0.001 && (previous.target.loadPct ?? 100) !== (view.target.loadPct ?? 100);
  const kg = row.trackingType === 'weight_reps' ? (own.kg ?? (changed ? previous?.logged?.kg : undefined) ?? suggestion.weightKg) : undefined;
  // Yoklamanın indirdiği gün: önceden dolu tekrar/süre planın bu setteki hedefini aşmaz (`prefillSet`).
  const cap = row.adjusted ? row.plan.sets.find((item) => item.setIndex === view.setIndex)?.target : undefined;
  const value = own.value ?? prefillSet({ target: view.target, setIndex: view.setIndex, plannedKg: kg, lastTime: row.lastTime, cap }).value;
  return { ...common, kg, value };
}

/* --- belge değişiklikleri --- */

function withStatus(entry: SessionEntry, planned: number, stamp: Stamp): SessionEntry {
  const status = entryStatusOf({ planned, done: workingOf(entry).length, skipped: entry.status === 'skipped' });
  return status === entry.status ? entry : { ...entry, status, updatedAt: stamp.at, by: stamp.by };
}

/**
 * Satırın hareket kaydı; yoksa yenisi (henüz belgede değil). Kayıt ilk setle, ilk ısınmayla ya da ayar
 * notuyla açılır; geçen seferki ayar notu kayda taşınır (dokunulmayan not sonraki seferde de sürer).
 * Planın o gün satırdan az set verdiği günde (hafifletme) planlanan set kayda da yazılır: seti olmayan
 * (geçilen, yapılmadan kalan) harekette sunucunun bitiş sayısı telefonunkiyle aynı olsun (`completionOf`).
 */
function entryFor(day: WorkoutDay, doc: SessionDoc, rowId: string, stamp: Stamp, taken: Set<string>, random?: Random): SessionEntry {
  const row = day.rows[rowId];
  if (!row) throw new Error('Satır bu günün planında yok.');
  const existing = entryForRow(doc.entries, rowId);
  if (existing) return existing;
  // Eklenen hareketin kaydı eklenirken açılır; satırı kayıtsız kalamaz (plan satırı değildir).
  if (!ROW_ID_PATTERN.test(rowId)) throw new Error('Eklenen hareketin kaydı yok.');
  const id = rowEntryId(rowId, taken, random);
  taken.add(id);
  const planned = row.plan.sets.length;
  const fewer = planned > 0 && planned !== (templateRowOf(day, rowId)?.sets.length ?? planned);
  return {
    id,
    rowId: row.rowId,
    blockId: row.blockId,
    exerciseId: row.exerciseId,
    title: row.title,
    ...(row.deviceId ? { deviceId: row.deviceId } : {}),
    status: 'pending',
    ...(fewer ? { plannedSets: planned } : {}),
    plan: entryPlanOf(row),
    ...(row.setupNote ? { setupNote: row.setupNote } : {}),
    updatedAt: stamp.at,
    by: stamp.by,
    sets: [],
  };
}

/**
 * Günün her satırının kaydı (henüz yoksa boş, `pending`; geçen seferki ayar notu taşınır). Yapılış sırası
 * (`order`) hareket kimlikleriyle yazıldığı için "atla", "sırayı değiştir" ve "hareket ekle" önce bunu ister:
 * kaydı olmayan hareket sırada yer tutamaz. Hepsi varsa aynı belge.
 */
export function ensureEntries(day: WorkoutDay, doc: SessionDoc, stamp: Stamp, random?: Random): SessionDoc {
  const taken = takenIds(doc);
  const created: SessionEntry[] = [];
  const known = { ...doc, entries: doc.entries };
  for (const block of day.blocks) {
    for (const row of block.rows) {
      if (!day.rows[row.id] || entryForRow(known.entries, row.id)) continue;
      const entry = entryFor(day, known, row.id, stamp, taken, random);
      created.push(entry);
      known.entries = [...known.entries, entry];
    }
  }
  return created.length === 0 ? doc : normalizeSession(known);
}

/** Kaydı belgeye yazar (yeniyse ekler) ve belgeyi kanonik biçime döndürür. */
function putEntry(doc: SessionDoc, entry: SessionEntry, extra: Partial<Pick<SessionDoc, 'notices'>> = {}): SessionDoc {
  const known = doc.entries.some((item) => item.id === entry.id);
  const entries = known ? doc.entries.map((item) => (item.id === entry.id ? entry : item)) : [...doc.entries, entry];
  return normalizeSession({ ...doc, ...extra, entries });
}

/**
 * "Set bitti": hareketin kaydı yoksa oluşur; set o günkü hedefi ve planı taşır. Ağırlık yalnız
 * ağırlıklı harekette; süreli harekette değer saniyedir. `overload`: aşırı yük onaylandı (ya da bu
 * harekette zaten onaylanmıştı); hareketin ilk aşırı yük setinde PT'ye bildirim (`notices`). `extra`:
 * "+ Set ekle" ile istenen fazladan set (`setIndex` planın arkasından; hedefi ve planı planın son setinin). Kardiyoda
 * mesafe, yürüyüş/koşuda eğim de yazılır.
 */
export function logSet(
  day: WorkoutDay,
  doc: SessionDoc,
  input: {
    rowId: string;
    setIndex: number;
    kg?: number | undefined;
    value: number;
    distanceM?: number | undefined;
    inclinePct?: number | undefined;
    overload?: boolean;
    extra?: boolean;
    stamp: Stamp;
    random?: Random;
  },
): { doc: SessionDoc; setId: string } {
  const row = day.rows[input.rowId];
  const template = templateRowOf(day, input.rowId);
  if (!row || !template) throw new Error('Satır bu günün planında yok.');
  const taken = takenIds(doc);
  const entry = entryFor(day, doc, input.rowId, input.stamp, taken, input.random);
  const extra = input.extra ? extraPlanOf(row, template) : null;
  const planned = extra ? null : row.plan.sets.find((item) => item.setIndex === input.setIndex);
  const weighted = row.trackingType === 'weight_reps';
  const setId = randomId('st', SESSION_ID_LENGTHS.st, taken, input.random);
  const target = extra ? extra.target : template.sets[input.setIndex];
  const plannedKg = extra ? extra.plannedKg : planned?.weightKg;
  const overload = Boolean(input.overload && weighted);
  const set: SessionSet = {
    id: setId,
    type: 'working',
    setIndex: input.setIndex,
    ...(weighted && input.kg !== undefined ? { kg: input.kg } : {}),
    ...(row.trackingType === 'duration' ? { seconds: input.value } : { reps: input.value }),
    // Kardiyoda mesafe; yürüyüş/koşuda eğim hep (girilmediyse 0): kalori yalnız eğimi olan sette (`cardio.ts`).
    ...(row.cardio && input.distanceM !== undefined ? { distanceM: input.distanceM } : {}),
    ...(row.cardio === 'walk' ? { inclinePct: input.inclinePct ?? 0 } : {}),
    ...(target ? { target } : {}),
    ...(weighted ? { topWeightKg: row.plan.topWeightKg } : {}),
    plannedSetCount: row.plan.sets.length,
    ...(weighted && plannedKg !== undefined ? { plannedKg } : {}),
    ...(overload ? { overload: true } : {}),
    ...(extra ? { extra: true } : {}),
    at: input.stamp.at,
    by: input.stamp.by,
  };
  const first = overload && !entry.sets.some((item) => item.type === 'working' && item.overload);
  const updated = withStatus({ ...entry, sets: [...entry.sets, set] }, row.plan.sets.length, input.stamp);
  const notices = first ? { notices: [...doc.notices, { kind: 'overload' as const, at: input.stamp.at }] } : {};
  return { doc: putEntry(doc, updated, notices), setId };
}

/**
 * Aşırı yük (tasarım §2.4, v1 K14): girilen ağırlık planın çok üstünde mi (`isOverload`). Hareket
 * başına bir kez sorulur (`ask`: "Hedefin çok üzerindesin"); onaylandıktan sonra (`confirmed`) sorulmaz,
 * setler yine işaretlenir ve satırda görünür. Ağırlıksız harekette ya da sınırın altında `none`.
 */
export type OverloadState = 'none' | 'ask' | 'confirmed';

export function overloadState(day: WorkoutDay, doc: Pick<SessionDoc, 'entries'>, next: Pick<NextSet, 'rowId' | 'plannedKg'>, kg: number | undefined): OverloadState {
  const row = day.rows[next.rowId];
  if (!row || row.trackingType !== 'weight_reps' || kg === undefined || !isOverload(next.plannedKg, kg)) return 'none';
  const entry = entryForRow(doc.entries, next.rowId);
  return entry?.sets.some((set) => set.type === 'working' && set.overload) ? 'confirmed' : 'ask';
}

export function findSet(doc: Pick<SessionDoc, 'entries'>, setId: string): { entry: SessionEntry; set: SessionSet } | null {
  for (const entry of doc.entries) {
    const set = entry.sets.find((item) => item.id === setId);
    if (set) return { entry, set };
  }
  return null;
}

/** Setin düzenlenmesi (alttaki panelin "Kaydet"i): değerler değişir, yapıldığı an (`at`) değişmez; birleştirme `editedAt`'le. */
export function editSet(
  doc: SessionDoc,
  setId: string,
  values: { kg?: number | undefined; value: number; distanceM?: number | undefined; inclinePct?: number | undefined },
  stamp: Stamp,
): SessionDoc {
  const found = findSet(doc, setId);
  if (!found) return doc;
  const { set } = found;
  const next: SessionSet = {
    ...set,
    ...(set.kg !== undefined || values.kg !== undefined ? { kg: values.kg ?? set.kg } : {}),
    ...(set.seconds !== undefined ? { seconds: values.value } : { reps: values.value }),
    // Kardiyo: verilen alan değişir, verilmeyen kalır.
    ...(values.distanceM !== undefined ? { distanceM: values.distanceM } : {}),
    ...(values.inclinePct !== undefined ? { inclinePct: values.inclinePct } : {}),
    editedAt: stamp.at,
    by: stamp.by,
  };
  const entries = doc.entries.map((entry) => (entry === found.entry ? { ...entry, sets: entry.sets.map((item) => (item.id === setId ? next : item)) } : entry));
  return normalizeSession({ ...doc, entries });
}

/** Setin zorluğu (setin düzenlenmesi, "Kolaydı" kısayolu); `undefined` zorluğu kaldırır (motor `good` sayar). */
export function setSetEffort(doc: SessionDoc, setId: string, effort: Effort | undefined, stamp: Stamp): SessionDoc {
  const found = findSet(doc, setId);
  if (!found || found.set.type !== 'working' || found.set.effort === effort) return doc;
  const { effort: _old, ...rest } = found.set;
  const next: SessionSet = { ...rest, ...(effort ? { effort } : {}), editedAt: stamp.at, by: stamp.by };
  const entries = doc.entries.map((entry) => (entry === found.entry ? { ...entry, sets: entry.sets.map((item) => (item.id === setId ? next : item)) } : entry));
  return normalizeSession({ ...doc, entries });
}

/** Kaydın durumunu hesaplayan planlı set sayısı (silme ve geri getirme aynı kuralla). */
function plannedOf(day: WorkoutDay, entry: SessionEntry): number {
  return entry.rowId ? (day.rows[entry.rowId]?.plan.sets.length ?? 0) : (entry.plannedSets ?? 0);
}

/**
 * Seti siler (etkin antrenmanda: ✓'u kaldırmak, sola kaydırıp "Sil", panelin "Seti sil"i): kimlik kalıcı iz listesine girer,
 * hareketin durumu yeniden hesaplanır.
 */
export function deleteSet(day: WorkoutDay, doc: SessionDoc, setId: string, stamp: Stamp): SessionDoc {
  const found = findSet(doc, setId);
  if (!found) return doc;
  const removed = withDeletions(doc, { setIds: [setId] });
  const planned = plannedOf(day, found.entry);
  return normalizeSession({
    ...removed,
    entries: removed.entries.map((entry) => (entry.id === found.entry.id ? withStatus(entry, planned, stamp) : entry)),
  });
}

/**
 * Silinen setin toast'taki "Geri al"ı: set aynı kayda **yeni kimlikle** döner (eski kimlik kalıcı iz listesinde, `deleteSet`;
 * birleşim onu her kopyadan siler). Değerleri, zorluğu, yeri (`setIndex`) ve yapıldığı an (`at`) aynı: "şu an" ve sıralama
 * bozulmaz; hareketin durumu yeniden hesaplanır. Olmazsa null: kayıt yok ya da hareketi değişti (o arada muadil seçildi), ya
 * da o yerde yine bir set var (o arada yeniden yapıldı; iki set aynı yeri tutmaz), ya da fazladan set geri gelemez
 * (`extraRestorable`). `removedAt`: silmenin anı (yoksa yalnız sayı denetlenir). `day`: geri getirmeden sonraki istenen
 * turlarla (silmenin bıraktığı tur da geri gelecekse onunla).
 */
export function restoreSet(
  day: WorkoutDay,
  doc: SessionDoc,
  removed: { entry: Pick<SessionEntry, 'id' | 'exerciseId'>; set: SessionSet; removedAt?: string | undefined },
  stamp: Stamp,
  random?: Random,
): { doc: SessionDoc; setId: string } | null {
  const entry = doc.entries.find((item) => item.id === removed.entry.id);
  const { set } = removed;
  if (!entry || entry.exerciseId !== removed.entry.exerciseId) return null;
  if (entry.sets.some((item) => item.type === set.type && item.setIndex === set.setIndex && Boolean(item.extra) === Boolean(set.extra))) return null;
  if (set.extra && !extraRestorable(day, entry, removed.removedAt)) return null;
  const setId = randomId('st', SESSION_ID_LENGTHS.st, takenIds(doc), random);
  const back: SessionSet = { ...set, id: setId, by: stamp.by };
  return { doc: putEntry(doc, withStatus({ ...entry, sets: [...entry.sets, back] }, plannedOf(day, entry), stamp)), setId };
}

/**
 * Silinen fazladan set geri gelebilir mi. Fazladan setlerin yeri sabit değil (bekleyen set yapılanların arkasından
 * sayılır): ✓'u kaldırılan setin bıraktığı bekleyen set başka bir yerde yeniden yapılabilir, aynı yer denetimi bunu
 * görmez ve geri gelen set istenmeyen bir tur olurdu. Bu yüzden hayır: silmeden sonra aynı kayda fazladan set yapıldıysa
 * ya da yapılan fazladan setler birimin istenen turunu (`day.extraRounds`) zaten dolduruyorsa. Bu telefonda istek yoksa
 * (fazladan setler başka cihazda yapıldı, istek yalnız telefonda tutulur) sayı denetlenmez: geri almak bozulmasın.
 */
function extraRestorable(day: WorkoutDay, entry: SessionEntry, removedAt: string | undefined): boolean {
  const extras = extrasOf(entry);
  const since = removedAt ? Date.parse(removedAt) : Number.NaN;
  if (!Number.isNaN(since) && extras.some((item) => Date.parse(item.at) > since)) return false;
  const rowKey = rowKeyOf(entry);
  const unitKey = rowKey ? unitKeyOfRow(day, rowKey) : undefined;
  const requested = unitKey ? (day.extraRounds?.[unitKey] ?? 0) : 0;
  return requested === 0 || extras.length < requested;
}

/** "Su içtim" (+1) ya da "Geri al" (−1 dokunuşu, kalıcı). */
export function addWaterTap(doc: SessionDoc, d: 1 | -1, stamp: Stamp, random?: Random): { doc: SessionDoc; tapId: string } {
  const tapId = randomId('wt', SESSION_ID_LENGTHS.wt, takenIds(doc), random);
  return { doc: normalizeSession({ ...doc, waterTaps: [...doc.waterTaps, { id: tapId, d, at: stamp.at }] }), tapId };
}

/* --- "Set bitti"den sonra ne olur --- */

/**
 * Grupta üyenin o turdaki setinin ardından aynı turda gelen (yapılmamış) başka üye: "Set bitti → B" ve dinlenmesiz geçiş.
 * Tur bitiyorsa ya da grup değilse null.
 */
export function memberAfter(unit: CursorUnit, member: number, round: number): number | null {
  if (unit.kind === 'single') return null;
  const at = unit.slots.findIndex((slot) => slot.member === member && slot.round === round);
  if (at < 0) return null;
  const following = unit.slots.slice(at + 1).find((slot) => !slotDone(unit, slot));
  return following && following.round === round && following.member !== member ? following.member : null;
}

export type AfterLog =
  /** Aynı harekette sıradaki set: dinlenme (0 ise doğrudan giriş paneli). */
  | { kind: 'same'; restSeconds: number }
  /** Grupta aynı turun sıradaki üyesi: dinlenme yok; devrede istasyon geçişi sayar. */
  | { kind: 'member'; transitionSeconds: number }
  /** Hareket bitti: sıradaki birim gelir (ekran `nextUnitAfter` ile seçer), dinlenme onun üstünde açılır. */
  | { kind: 'next'; restSeconds: number }
  /** Hiçbir yerde yapılacak set kalmadı (istenen fazladan setler dahil): dinlenme yok, bitirme sorusu. */
  | { kind: 'done' };

/**
 * `before`: set kaydedilmeden önceki belge; dinlenme o setin ardındaki (`restAfterSeconds`). Grupta
 * tur sürerken (aynı birim, aynı tur, başka üye) dinlenme yok: süperset ve komplekste 0, devrede
 * istasyon geçişi; tur sonunda blok dinlenmesi. `focus`: setin seçildiği odak (`nextSet(…, focus)` ile
 * aynı); set o birimde sayılır (liste + odak). Birim bitince başka bir yerde set kaldıysa `next`, kalmadıysa `done`.
 * `logged`: kaydedilen set; tablodan sırası dışında seçildiyse (`chosen`) dinlenme onun ardındaki, üye geçişi yok.
 */
export function afterLog(
  day: WorkoutDay,
  before: Pick<SessionDoc, 'entries' | 'order'>,
  after: Pick<SessionDoc, 'entries' | 'order'>,
  focus?: string | null,
  logged?: Pick<NextSet, 'rowId' | 'round' | 'restAfterSeconds' | 'chosen'> | null,
): AfterLog {
  const was = cursorOf(day, before, focus);
  const now = cursorOf(day, after, focus);
  const overall = focus == null ? now : cursorOf(day, after);
  if (!overall.next) return { kind: 'done' };
  const chosen = logged?.chosen === true;
  const restSeconds = chosen ? logged.restAfterSeconds : (was.next?.restAfterSeconds ?? 0);
  const oldUnit = was.next ? was.units[was.next.unit]?.key : undefined;
  const newUnit = now.next ? now.units[now.next.unit]?.key : undefined;
  if (!now.next || oldUnit !== newUnit) return { kind: 'next', restSeconds };
  if (chosen) {
    // Seçilen setin ardından aynı turda başka üye geliyorsa (grupta tur sürüyor) dinlenme yok, devrede istasyon geçişi.
    const unit = was.units.find((item) => item.members.some((member) => member.rowId === logged.rowId));
    const member = unit ? unit.members.findIndex((item) => item.rowId === logged.rowId) : -1;
    return unit && memberAfter(unit, member, logged.round) !== null ? { kind: 'member', transitionSeconds: restSeconds } : { kind: 'same', restSeconds };
  }
  if (was.next && now.next.round === was.next.round && now.next.member !== was.next.member) return { kind: 'member', transitionSeconds: restSeconds };
  return { kind: 'same', restSeconds };
}

/* --- ısınma --- */

export type WarmupView = { index: number; kg: number; reps: number; logged: SessionSet | undefined };

/** Satırın ısınma setleri ve (yapıldıysa) kayıtları; `setIndex` ısınmanın sırası. */
export function warmupViews(day: WorkoutDay, doc: Pick<SessionDoc, 'entries'>, rowId: string): WarmupView[] {
  const warmups = day.rows[rowId]?.warmups ?? [];
  if (warmups.length === 0) return [];
  const sets = (entryForRow(doc.entries, rowId)?.sets ?? []).filter((set) => set.type === 'warmup');
  const logged = new Map(sets.map((set, position) => [set.setIndex ?? position, set]));
  return warmups.map((warmup, index) => ({ index, kg: warmup.kg, reps: warmup.reps, logged: logged.get(index) }));
}

/** Isınma seti yapıldı (satırdaki ✓): hacme ve rekora girmez, imleci ilerletmez. Zaten yapıldıysa aynı belge. */
export function logWarmup(day: WorkoutDay, doc: SessionDoc, input: { rowId: string; index: number; stamp: Stamp; random?: Random }): SessionDoc {
  const view = warmupViews(day, doc, input.rowId)[input.index];
  if (!view || view.logged) return doc;
  const taken = takenIds(doc);
  const entry = entryFor(day, doc, input.rowId, input.stamp, taken, input.random);
  const set: SessionSet = {
    id: randomId('st', SESSION_ID_LENGTHS.st, taken, input.random),
    type: 'warmup',
    setIndex: input.index,
    kg: view.kg,
    reps: view.reps,
    at: input.stamp.at,
    by: input.stamp.by,
  };
  return putEntry(doc, { ...entry, sets: [...entry.sets, set] });
}

/** Isınma ✓'u geri alındı: set silinir (kimliği iz listesine girer). */
export function unlogWarmup(day: WorkoutDay, doc: SessionDoc, input: { rowId: string; index: number; stamp: Stamp }): SessionDoc {
  const logged = warmupViews(day, doc, input.rowId)[input.index]?.logged;
  return logged ? deleteSet(day, doc, logged.id, input.stamp) : doc;
}

/* --- ayar notu --- */

/** Hareketin ayar notu: bu antrenmandaki kayıt (danışan değiştirdiyse ya da sildiyse) → geçen seferki. */
export function setupNoteOf(day: WorkoutDay, doc: Pick<SessionDoc, 'entries'>, rowId: string): string | undefined {
  const entry = entryForRow(doc.entries, rowId);
  return entry ? entry.setupNote : day.rows[rowId]?.setupNote;
}

/** Ayar notunu yazar (boş metin siler); kayıt yoksa açılır. Kendi başına gönderilmez, sonraki sete biner. */
export function setSetupNote(day: WorkoutDay, doc: SessionDoc, input: { rowId: string; note: string; stamp: Stamp; random?: Random }): SessionDoc {
  const text = input.note.trim().replace(/\s+/g, ' ').slice(0, SESSION_LIMITS.setupNote);
  if (!day.rows[input.rowId] || (setupNoteOf(day, doc, input.rowId) ?? '') === text) return doc;
  const entry = entryFor(day, doc, input.rowId, input.stamp, takenIds(doc), input.random);
  const { setupNote: _old, ...rest } = entry;
  return putEntry(doc, { ...rest, ...(text ? { setupNote: text } : {}), updatedAt: input.stamp.at, by: input.stamp.by });
}

/* --- zorluk (hareket başına bir kez) ve "Kolaydı" --- */

/** Zorluk seçenekleri (danışana): "Başaramadım" yok; tekrar alt sınırın altındaysa bu zaten kaçırmadır. */
export const EFFORT_CHOICES = ['easy', 'good', 'hard'] as const satisfies readonly Effort[];
export type EffortChoice = (typeof EFFORT_CHOICES)[number];

/** Zorluğu sorulan setler: AMRAP olmayan, plandaki çalışma setleri. */
function rated(entry: SessionEntry): SessionSet[] {
  return entry.sets.filter((set) => set.type === 'working' && !set.extra && !set.target?.amrap);
}

/** Soru sorulur mu: tam yükte AMRAP olmayan bir set var (motorun zorluğa baktığı setler). */
function asksEffort(entry: SessionEntry): boolean {
  return rated(entry).some((set) => isFullLoad(set.target ?? {}));
}

/** Cevap: tam yükteki son setin zorluğu ("Kolaydı" kısayolu son sete yazılmaz). */
function answerOf(entry: SessionEntry): Effort | undefined {
  const last = rated(entry)
    .filter((set) => isFullLoad(set.target ?? {}))
    .reduce<SessionSet | undefined>((best, set) => (!best || (set.setIndex ?? 0) >= (best.setIndex ?? 0) ? set : best), undefined);
  return last?.effort;
}

export type EffortQuestion = { entryId: string; rowId: string; title: string; answer: Effort | undefined };

/**
 * "<Hareket> nasıldı?" (§2.5): set, birimin (tek hareket ya da grubun) planlı son setiyse birimin zorluğu
 * sorulan hareketleri; birimin planı bitmediyse boş. Grupta üyeler sırayla sorulur. Ardından istenen
 * fazladan set soruyu ertelemez (zorluk planın setlerine yazılır).
 */
export function effortQuestions(day: WorkoutDay, doc: Pick<SessionDoc, 'entries' | 'order'>, setId: string): EffortQuestion[] {
  const found = findSet(doc, setId);
  if (!found || found.set.type !== 'working') return [];
  const unit = cursorOf(day, doc).units.find((item) => item.members.some((member) => member.entryId === found.entry.id));
  if (!unit || remaining(unit)) return [];
  return unit.members.flatMap((member) => {
    const entry = doc.entries.find((item) => item.id === member.entryId);
    if (!entry || !member.rowId || !asksEffort(entry)) return [];
    return [{ entryId: entry.id, rowId: member.rowId, title: entry.title, answer: answerOf(entry) }];
  });
}

/** Cevap hareketin AMRAP olmayan bütün çalışma setlerine yazılır (set başına ayrım setin düzenlenmesinde). */
export function setEntryEffort(doc: SessionDoc, entryId: string, effort: Effort, stamp: Stamp): SessionDoc {
  const entry = doc.entries.find((item) => item.id === entryId);
  if (!entry) return doc;
  const sets = entry.sets.map((set) =>
    set.type === 'working' && !set.target?.amrap && set.effort !== effort ? { ...set, effort, editedAt: stamp.at, by: stamp.by } : set,
  );
  return normalizeSession({ ...doc, entries: doc.entries.map((item) => (item.id === entryId ? { ...item, sets } : item)) });
}

/**
 * "Kolaydı · sonraki set X kg" (§2.5): az önce kaydedilen set aralığın tepesindeyse ve sıradaki set
 * aynı hareketin aynı yükteki setiyse, o sete `easy` yazmak sonraki seti bir adım artırır
 * (`nextSetInPlan`). Artmıyorsa (cihazın en ağır ayarı, başka yüzde, AMRAP) null. `taken`: dokunuldu.
 * `focus`: sıradaki set odaktaki birimden (`nextSet`).
 */
export function easyShortcut(day: WorkoutDay, doc: SessionDoc, setId: string, focus?: string | null): { kg: number; taken: boolean } | null {
  const found = findSet(doc, setId);
  const set = found?.set;
  if (!found || !set || set.type !== 'working' || set.extra || !set.target || set.target.amrap || (set.reps ?? 0) < set.target.max) return null;
  const next = nextSet(day, doc, null, focus);
  if (!next || next.kg === undefined || next.rowId !== found.entry.rowId) return null;
  if (set.effort === 'easy') return next.kg > (set.kg ?? 0) ? { kg: next.kg, taken: true } : null;
  const raised = nextSet(day, setSetEffort(doc, setId, 'easy', { at: set.editedAt ?? set.at, by: set.by ?? doc.writer }), null, focus);
  return raised?.kg !== undefined && raised.kg > next.kg ? { kg: raised.kg, taken: false } : null;
}

/* --- bitiş özeti --- */

export type WorkoutSummary = {
  /** En az bir çalışma seti olan hareket. */
  exercises: number;
  sets: number;
  volumeKg: number;
  minutes: number;
  water: number;
  /**
   * Erken bitişin "12/17 set yapıldı"sı (`completionOf`): planın bütün setleri, geçilen hareketinkiler dahil;
   * PT'nin "yarım bırakıldı (12/17 set)" bildirimiyle aynı sayı.
   */
  doneSets: number;
  plannedSets: number;
  /** Geçilmemiş her hareketin planlı setleri yapıldı ("Antrenman tamamlandı, bitirelim mi?"). */
  allDone: boolean;
  /** Yapılmayanlar: planlanan seti tamamlanmamış hareketler; atlananlar işaretli. */
  remaining: { rowId: string; title: string; done: number; planned: number; skipped: boolean }[];
};

export function workoutSummary(day: WorkoutDay, doc: SessionDoc, now: Date): WorkoutSummary {
  const cursor = cursorOf(day, doc);
  const remaining = cursor.units.flatMap((unit) =>
    unit.members.flatMap((member) =>
      member.rowId && member.done < member.planned
        ? [{ rowId: member.rowId, title: day.rows[member.rowId]?.title ?? '', done: member.done, planned: member.planned, skipped: member.skipped }]
        : [],
    ),
  );
  const completion = completionOf(cursor.units);
  return {
    allDone: cursor.allDone,
    exercises: doc.entries.filter((entry) => entry.sets.some((set) => set.type === 'working')).length,
    sets: workingSetCount(doc),
    volumeKg: volumeOf(doc),
    minutes: Math.max(1, Math.round((now.getTime() - Date.parse(doc.startedAt)) / 60_000)),
    water: waterOf(doc),
    doneSets: completion.done,
    plannedSets: completion.planned,
    remaining,
  };
}

/* --- "+ Set ekle" --- */

/** Bir birime istenebilecek en çok fazladan tur. */
export const EXTRA_ROUNDS_MAX = 10;

/**
 * "+ Set ekle" (tek harekette set, grupta tur): birimin istenen fazladan turu bir artar; yapılmış fazladan
 * setler (başka cihazda, isteği kaldırılmış) sayılır. Birim yoksa, geçildiyse ya da sınırdaysa aynı kayıt.
 * Dönen kayıt telefondaki antrenmanın (`LocalWorkout.extraRounds`); günün etkin hâline `withExtraRounds` koyar.
 */
export function addExtraRound(day: WorkoutDay, doc: Pick<SessionDoc, 'entries' | 'order'>, unitKey: string): Record<string, number> {
  const rounds = day.extraRounds ?? {};
  const unit = cursorOf(day, doc).units.find((item) => item.key === unitKey);
  if (!unit || unit.members.every((member) => member.skipped)) return rounds;
  const current = Math.max(rounds[unitKey] ?? 0, ...unit.members.map((member) => member.extra));
  if (current >= EXTRA_ROUNDS_MAX) return rounds;
  return { ...rounds, [unitKey]: current + 1 };
}

/** Bekleyen fazladan turu bırakır ("Kaldır"; tek harekette fazladan seti silmek): istenen tur bir azalır, yapılmış fazladan setler kalır. */
export function dropExtraRound(day: Pick<WorkoutDay, 'extraRounds'>, unitKey: string): Record<string, number> {
  const rounds = day.extraRounds ?? {};
  const current = rounds[unitKey] ?? 0;
  if (current <= 0) return rounds;
  const { [unitKey]: _dropped, ...rest } = rounds;
  return current > 1 ? { ...rest, [unitKey]: current - 1 } : rest;
}

/** Birimin bekleyen fazladan seti var mı (panelin "Kaldır"ı, tablodaki bekleyen satır). */
export function pendingExtra(day: WorkoutDay, doc: Pick<SessionDoc, 'entries' | 'order'>, unitKey: string): boolean {
  const unit = cursorOf(day, doc).units.find((item) => item.key === unitKey);
  return unit ? unit.slots.some((slot) => slot.extra !== undefined && !slotDone(unit, slot)) : false;
}

/* --- ekran metinleri --- */

const unitOf = (trackingType: TrackingType, cardio: CardioKind | null = null) =>
  cardio === 'walk' ? 'dk' : trackingType === 'duration' ? 'sn' : 'tekrar';

function range(target: Pick<SetTarget, 'min' | 'max'>): string {
  return target.min === target.max ? formatNumber(target.min) : `${formatNumber(target.min)}–${formatNumber(target.max)}`;
}

/** Yürüyüş/koşuda hedef dakikayla anlatılır. */
function timed(target: SetTarget, cardio: CardioKind | null): SetTarget {
  return cardio === 'walk' ? { ...target, min: minutesOf(target.min), max: minutesOf(target.max) } : target;
}

/** Tablodaki "Hedef" sütunu: "12", "10–12", AMRAP'ta "8+", süreli harekette "30 sn", yürüyüş/koşuda "30 dk". */
export function targetCell(target: SetTarget, trackingType: TrackingType, cardio: CardioKind | null = null): string {
  const shown = timed(target, cardio);
  const text = shown.amrap ? `${formatNumber(shown.min)}+` : range(shown);
  return trackingType === 'duration' ? `${text} ${unitOf(trackingType, cardio)}` : text;
}

/** Paneldeki hedef: "Hedef 8–10", AMRAP'ta "En az 8, yapabildiğin kadar", süreli "Hedef 30–45 sn"; kardiyoda mesafe ve eğim de. */
export function targetText(target: SetTarget, trackingType: TrackingType, cardio: CardioKind | null = null): string {
  const shown = timed(target, cardio);
  const unit = trackingType === 'duration' ? ` ${unitOf(trackingType, cardio)}` : '';
  const extra = cardio ? cardioParts(target).map((part) => ` · ${part}`).join('') : '';
  if (shown.amrap) return `En az ${formatNumber(shown.min)}${unit}, yapabildiğin kadar${extra}`;
  return `Hedef ${range(shown)}${unit}${extra}`;
}

/**
 * Kaydın metni: "62,5 kg × 10", "10 tekrar", "45 sn"; kardiyoda "30:00 · 3 km · %5", yürüyüş/koşuda kilo verilirse
 * "· ≈ 253 kcal" de (`cardio.ts`).
 */
export function setValueText(set: Pick<SessionSet, 'kg' | 'reps' | 'seconds' | 'distanceM' | 'inclinePct'>, bodyMassKg?: number): string {
  if (set.seconds !== undefined && (set.distanceM !== undefined || set.inclinePct !== undefined)) {
    return cardioText(set, walkKcal(set, bodyMassKg));
  }
  const load = set.kg !== undefined && set.kg > 0 ? formatKg(set.kg) : null;
  if (set.seconds !== undefined) return load ? `${load} × ${set.seconds} sn` : `${set.seconds} sn`;
  return load ? `${load} × ${set.reps ?? 0}` : `${set.reps ?? 0} tekrar`;
}

/** "Önceki" sütunu: "60 × 10", ağırlıksızda "10", süreli "45 sn", yürüyüş/koşuda "30:00 · 3 km · %5"; yoksa "—". */
export function previousText(previous: PreviousSet | undefined, trackingType: TrackingType, cardio: CardioKind | null = null): string {
  if (!previous) return '—';
  if (cardio === 'walk') return cardioText({ seconds: previous.value, distanceM: previous.distanceM, inclinePct: previous.inclinePct });
  if (trackingType === 'duration') return [`${formatNumber(previous.value)} sn`, ...(cardio ? cardioParts(previous) : [])].join(' · ');
  return previous.kg !== undefined && previous.kg > 0 && trackingType === 'weight_reps'
    ? `${formatNumber(previous.kg)} × ${formatNumber(previous.value)}`
    : formatNumber(previous.value);
}

/** Dinlenmedeki "Sıradaki": "Set 3 · 62,5 kg × 8–10"; başka harekette adıyla. */
export function nextText(
  next: Pick<NextSet, 'position' | 'target' | 'kg'>,
  row: Pick<WorkoutRow, 'title' | 'trackingType' | 'cardio'>,
  withName: boolean,
): string {
  const cardio = row.cardio ?? null;
  const shown = timed(next.target, cardio);
  const target = shown.amrap ? `${formatNumber(shown.min)}+` : range(shown);
  const body =
    next.kg !== undefined ? `${formatKg(next.kg)} × ${target}` : `${target} ${unitOf(row.trackingType, cardio)}`;
  return `${withName ? `${row.title} · ` : ''}Set ${next.position + 1} · ${body}`;
}

/** Sayaç: 72 → "1:12", 5 → "0:05". */
export function clockText(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Üst çubuktaki süre: "24:18", bir saati geçince "1:04:18". */
export function elapsedText(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const rest = clockText(seconds % 3600);
  return hours > 0 ? `${hours}:${rest.padStart(5, '0')}` : rest;
}
