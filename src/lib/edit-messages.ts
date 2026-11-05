import { DEFAULT_LOCALE, type Locale } from '../i18n/locale.ts';
import { programEditorMessages } from '../i18n/messages/program-editor/index.ts';
import { lower } from '../i18n/text.ts';
import type { JoiningOutcome } from './drop-target.ts';
import type { AddToGroupOutcome, CombineOutcome, GroupCheck } from './template-edit.ts';
import { setsText, type SetSpec } from './set-plan.ts';
import { blockKindLabels, type TemplateBlock } from './template-plan.ts';
import type { CardioKind } from './cardio.ts';
import type { TrackingType } from './progression.ts';

export { dativeOf } from '../i18n/messages/program-editor/dative.ts';

/**
 * Düzenleyicinin duyuru ve toast cümleleri (canlı bölge, "Geri al" bildirimleri): taşıma,
 * üstüne bırakıp gruplama, klavyeyle taşımada uç, seçim modunun durum satırı ve toplu
 * işlemleri, cihaz değişimi, "Gruba hareket ekle" sheet'i; kartların meta satırları (şablon
 * detayı ve programın PT görünümüyle ortak). Saf; yol takma adıyla çalışma zamanı içe
 * aktarması yapmaz (testler Node'un kendi test aracıyla çalışır).
 */

/** Satırın adı (egzersizin adı ya da "Silinmiş egzersiz"). */
export type TitleOf = (exerciseId: string) => string;

/** Öğenin yeri: üst düzeyde sırası, ya da grubun içinde sırası. */
type Place = { level: 'top'; index: number } | { level: 'group'; block: TemplateBlock; blockIndex: number; index: number };

function placeOf(blocks: readonly TemplateBlock[], itemId: string): Place | null {
  for (const [blockIndex, block] of blocks.entries()) {
    if (block.id === itemId) return { level: 'top', index: blockIndex };
    const index = block.rows.findIndex((row) => row.id === itemId);
    if (index === -1) continue;
    return block.kind === 'single' ? { level: 'top', index: blockIndex } : { level: 'group', block, blockIndex, index };
  }
  return null;
}

/** Grubun adı: türü ve sırası ("Süperset 2"). */
function groupName(block: TemplateBlock, blockIndex: number, locale: Locale): string {
  return `${blockKindLabels(locale)[block.kind]} ${blockIndex + 1}`;
}

/** Taşınan grubun anlatımı: "Süperset (Bench Press + Cable Row)", uzun grupta ilk ikisi ve "…". */
function groupDescription(block: TemplateBlock, titleOf: TitleOf, locale: Locale): string {
  const titles = block.rows.map((row) => titleOf(row.exerciseId));
  return `${blockKindLabels(locale)[block.kind]} (${titles.slice(0, 2).join(' + ')}${titles.length > 2 ? ' + …' : ''})`;
}

/** Öğenin adı: satırda hareketin, grupta grubun adı. */
export function titleOfItem(blocks: readonly TemplateBlock[], itemId: string, titleOf: TitleOf, locale: Locale = DEFAULT_LOCALE): string {
  for (const [blockIndex, block] of blocks.entries()) {
    const only = block.rows[0];
    if (block.id === itemId) return block.kind === 'single' && only ? titleOf(only.exerciseId) : groupName(block, blockIndex, locale);
    const row = block.rows.find((item) => item.id === itemId);
    if (row) return titleOf(row.exerciseId);
  }
  return '';
}

/**
 * Taşımanın cümlesi (`before` → `after`): "Bench Press 3. sıraya taşındı", "Cable Row grupta
 * 1. sıraya taşındı", "Cable Row gruptan çıktı · 4. sırada", "Squat gruba katıldı (Devre 2)",
 * tür değiştiyse "Squat gruba katıldı · grup devre oldu".
 */
export function moveMessage(
  before: readonly TemplateBlock[],
  after: readonly TemplateBlock[],
  itemId: string,
  titleOf: TitleOf,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const t = programEditorMessages(locale).edit;
  const group = after.find((block) => block.id === itemId && block.kind !== 'single');
  const title = group ? groupDescription(group, titleOf, locale) : titleOfItem(after, itemId, titleOf, locale);
  const from = placeOf(before, itemId);
  const to = placeOf(after, itemId);
  if (!to) return '';
  if (to.level === 'top') {
    return from?.level === 'group' ? t.leftGroup(title, to.index + 1) : t.movedTo(title, to.index + 1);
  }
  if (from?.level === 'group' && from.block.id === to.block.id) return t.movedInGroup(title, to.index + 1);
  const previousKind = before.find((block) => block.id === to.block.id)?.kind;
  if (previousKind && previousKind !== to.block.kind) {
    return t.joinedAndBecame(title, lower(locale, blockKindLabels(locale)[to.block.kind]));
  }
  return t.joined(title, groupName(to.block, to.blockIndex, locale));
}

/**
 * Üstüne bırakıp gruplamanın cümlesi (toast ve duyuru; `before` → `after`): "Süperset yapıldı:
 * Squat + Bench Press", "Süperset devreye dönüştü", "Cable Row gruba eklendi (Devre 2)". Grubun
 * sırası birleşmeden sonraki listeden: üstündeki tek hareket gruba girince grup bir sıra yukarı kayar.
 */
export function combineMessage(
  before: readonly TemplateBlock[],
  after: readonly TemplateBlock[],
  sourceId: string,
  targetId: string,
  outcome: JoiningOutcome,
  titleOf: TitleOf,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const t = programEditorMessages(locale).edit;
  const source = titleOfItem(before, sourceId, titleOf, locale);
  if (outcome === 'superset') return t.madeSuperset(`${titleOfItem(before, targetId, titleOf, locale)} + ${source}`);
  const holdsTarget = (block: TemplateBlock) => block.id === targetId || block.rows.some((row) => row.id === targetId);
  const group = before.find(holdsTarget);
  if (!group) return '';
  if (outcome === 'becomes_circuit') return t.becameCircuit(blockKindLabels(locale)[group.kind]);
  const blockIndex = after.findIndex(holdsTarget);
  const joined = after[blockIndex];
  return joined ? t.addedToGroupAs(source, groupName(joined, blockIndex, locale)) : '';
}

/** Klavyeyle taşımada öğe zaten uçta: "Squat zaten ilk sırada", üyede "grupta zaten son sırada". */
export function edgeMessage(
  blocks: readonly TemplateBlock[],
  itemId: string,
  towardsStart: boolean,
  titleOf: TitleOf,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const t = programEditorMessages(locale).edit;
  const title = titleOfItem(blocks, itemId, titleOf, locale);
  const inGroup = placeOf(blocks, itemId)?.level === 'group';
  if (towardsStart) return inGroup ? t.firstAlreadyInGroup(title) : t.firstAlready(title);
  return inGroup ? t.lastAlreadyInGroup(title) : t.lastAlready(title);
}

/** Seçili blokların hareket sayısı (gruplardaki üyeler dahil; toast'lardaki sayı). */
export function selectedRowCount(blocks: readonly TemplateBlock[], blockIds: ReadonlySet<string>): number {
  return blocks.reduce((sum, block) => sum + (blockIds.has(block.id) ? block.rows.length : 0), 0);
}

/**
 * Seçim çubuğunun durum satırı: kaç kart seçili ve "Grupla" ne yapar ya da neden pasif;
 * kopya sığmıyorsa sonuna eklenir ("Kopyala" pasif). Pasif düğmenin nedeni burada yazar. Hiç
 * seçim yokken seçimin ne işe yaradığını da söyler ("2 hareket seç, süperset olsun").
 */
export function selectionStatus(
  count: number,
  check: GroupCheck,
  pointer: 'touch' | 'mouse' = 'touch',
  locale: Locale = DEFAULT_LOCALE,
): string {
  const t = programEditorMessages(locale).edit;
  if (count === 0) return pointer === 'touch' ? t.selectHintTouch : t.selectHintMouse;
  return check === 'superset'
    ? t.selectedSuperset(count)
    : check === 'circuit'
      ? t.selectedCircuit(count)
      : check === 'not_singles'
        ? t.selectedGroup
        : check === 'too_many'
          ? t.selectedTooMany(count)
          : t.selectedTooFew(count);
}

/** "Grupla" sonrası (toast ve duyuru): "Süperset yapıldı: Squat + Bench Press", "Devre yapıldı (4 hareket)". */
export function groupedMessage(
  blocks: readonly TemplateBlock[],
  blockIds: ReadonlySet<string>,
  kind: 'superset' | 'circuit',
  titleOf: TitleOf,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const t = programEditorMessages(locale).edit;
  const titles = blocks.filter((block) => blockIds.has(block.id)).flatMap((block) => block.rows.map((row) => titleOf(row.exerciseId)));
  return kind === 'superset' ? t.madeSuperset(titles.join(' + ')) : t.madeCircuit(titles.length);
}

/** Toplu kopya ve silmenin cümlesi: "3 hareket kopyalandı", "1 hareket silindi". */
export function bulkMessage(rows: number, action: 'copied' | 'removed', locale: Locale = DEFAULT_LOCALE): string {
  const t = programEditorMessages(locale).edit;
  return action === 'copied' ? t.bulkCopied(rows) : t.bulkRemoved(rows);
}

/** "Gruba hareket ekle" sheet'inin başlığı: "Süperset 2'ye ekle". */
export function addToGroupTitle(kind: TemplateBlock['kind'], blockIndex: number, locale: Locale = DEFAULT_LOCALE): string {
  return programEditorMessages(locale).edit.addToGroupTitle(blockKindLabels(locale)[kind], blockIndex + 1);
}

/**
 * Cihaz değişiminin cümlesi (toast ve duyuru; "Geri al"lı). Biçim cihaz seçicisinin seçenekleriyle
 * aynı ("Kablo istasyonu 2 → Seated Row"):
 * - hareket de değişti: "Kablo istasyonu 2 → Seated Row (Lat Pulldown yerine)"
 * - aynı hareket başka cihazda: "Bench Press · cihaz: Smith makinesi"
 * - egzersizin cihazına dönüldü: "Bench Press · egzersizin cihazı: Olimpik bar", cihazı yoksa "Bench Press · cihazsız"
 */
export type DeviceChange =
  | { kind: 'swapped'; device: string; from: string; to: string }
  | { kind: 'device'; device: string; title: string }
  | { kind: 'reset'; device: string | null; title: string };

export function deviceChangeMessage(change: DeviceChange, locale: Locale = DEFAULT_LOCALE): string {
  const t = programEditorMessages(locale).edit;
  switch (change.kind) {
    case 'swapped':
      return t.deviceSwapped(change.device, change.to, change.from);
    case 'device':
      return t.deviceSet(change.title, change.device);
    case 'reset':
      return change.device ? t.deviceReset(change.title, change.device) : t.deviceNone(change.title);
  }
}

/** "Üstüne bırak"ın sonuç hapı (hedefte ve sürüklenen kartın üstünde). */
export function dropOutcomeLabels(locale: Locale = DEFAULT_LOCALE): Record<Exclude<CombineOutcome, 'not_allowed'>, string> {
  return programEditorMessages(locale).edit.dropOutcomes;
}

/** Türkçe adlar (eski çağrılar ve testler); arayüz `dropOutcomeLabels(locale)` kullanır. */
export const DROP_OUTCOME_LABELS: Record<Exclude<CombineOutcome, 'not_allowed'>, string> = dropOutcomeLabels('tr');

/**
 * "Üstüne bırak" devredeyken sürüklenen kartın üstündeki etiket: sonuç ve hedef ("Süperset yap:
 * Squat", "Ekle · devre olur: Süperset 2", "Gruba ekle: Devre 3"). Hedef bir grubun üyesi ya da yüzüyse
 * grubun adı yazılır (bırakılan gruba katılır). Dolu grupta yalnız "Grup dolu (8)"; olmayan birleştirmede
 * ve bilinmeyen hedefte `null`.
 */
export function dropTargetLabel(
  blocks: readonly TemplateBlock[],
  targetId: string,
  outcome: CombineOutcome,
  titleOf: TitleOf,
  locale: Locale = DEFAULT_LOCALE,
): string | null {
  if (outcome === 'not_allowed') return null;
  const labels = dropOutcomeLabels(locale);
  if (outcome === 'full') return labels.full;
  for (const [blockIndex, block] of blocks.entries()) {
    const only = block.rows[0];
    if (block.kind === 'single' && only?.id === targetId) return `${labels[outcome]}: ${titleOf(only.exerciseId)}`;
    if (block.kind !== 'single' && (block.id === targetId || block.rows.some((row) => row.id === targetId))) {
      return `${labels[outcome]}: ${groupName(block, blockIndex, locale)}`;
    }
  }
  return null;
}

/** Dinlenme: saniyeyle (stepper'daki gibi), yoksa "dinlenme yok"; bozuk girdide "? sn". */
function restText(seconds: number, locale: Locale): string {
  const t = programEditorMessages(locale).edit;
  if (!Number.isFinite(seconds)) return t.restUnknown;
  return seconds > 0 ? t.restSeconds(seconds) : t.restNone;
}

/**
 * Hareketin setleri ve dinlenmesi, tek biçim (düzenleyicinin meta satırı, şablon detayı, programın PT
 * görünümü): `setsText` + dinlenme. "3×8–12 · 90 sn", "12/10/8+ (piramit %80/%90/%100) · 90 sn",
 * "3×30 sn · dinlenme yok"; grup üyesinde dinlenme grupta, yalnız setler (`restSeconds` verilmez).
 */
export function rowWorkText(
  sets: readonly SetSpec[],
  trackingType: TrackingType,
  restSeconds?: number,
  cardio: CardioKind | null = null,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const line = setsText(sets, trackingType, cardio, locale);
  return restSeconds === undefined ? line : `${line} · ${restText(restSeconds, locale)}`;
}

/**
 * Grubun özeti, tek biçim (düzenleyicide grubun yüzü, şablon detayı, programın PT görünümü):
 * "2 hareket · 3 tur · 90 sn tur sonu", devrede " · istasyon 15 sn".
 */
export function groupWorkText(
  block: Pick<TemplateBlock, 'kind' | 'restSeconds' | 'transitionSeconds'> & { rows: readonly unknown[] },
  rounds: number,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const t = programEditorMessages(locale).edit;
  const rest =
    Number.isFinite(block.restSeconds) && block.restSeconds <= 0 ? t.groupRestNone : t.groupRestAfter(restText(block.restSeconds, locale));
  const station =
    block.kind === 'circuit' && block.transitionSeconds !== undefined
      ? t.groupStation(Number.isFinite(block.transitionSeconds) ? t.restSeconds(block.transitionSeconds) : t.restUnknown)
      : '';
  return t.groupSummary(block.rows.length, rounds, rest, station);
}

/** Kütüphane sheet'i sona eklerken şablon dolu: liste pasif, neden durum satırında (`sheetStatus`). */
export function sheetFullMessage(locale: Locale = DEFAULT_LOCALE): string {
  return programEditorMessages(locale).edit.sheetFull;
}

/** Türkçe metin (eski çağrılar ve testler); arayüz `sheetFullMessage(locale)` kullanır. */
export const SHEET_FULL_MESSAGE = sheetFullMessage('tr');

/**
 * "Gruba hareket ekle" sheet'inin durum satırı, eklemeden önce: dolu grupta ve dolu
 * şablonda liste pasif, süpersette ya da 6'lı komplekste "Eklenirse devre olur".
 */
export function addToGroupHint(outcome: AddToGroupOutcome, locale: Locale = DEFAULT_LOCALE): { blocked: string | null; hint: string } {
  const t = programEditorMessages(locale).edit;
  if (outcome === 'full') return { blocked: t.groupFull, hint: '' };
  if (outcome === 'limit') return { blocked: t.templateFull, hint: '' };
  if (outcome === 'not_allowed') return { blocked: t.groupGone, hint: '' };
  return { blocked: null, hint: outcome === 'becomes_circuit' ? t.becomesCircuit : '' };
}

/** Gruba eklendikten sonra: "Cable Row eklendi", tür değiştiyse "Cable Row eklendi · grup devre oldu". */
export function addedToGroupMessage(
  title: string,
  before: TemplateBlock['kind'],
  after: TemplateBlock['kind'],
  locale: Locale = DEFAULT_LOCALE,
): string {
  const t = programEditorMessages(locale).edit;
  return before === after ? t.addedToGroup(title) : t.addedToGroupBecame(title, lower(locale, blockKindLabels(locale)[after]));
}

/**
 * Kütüphane sheet'inin durum satırı: eklenemiyorsa nedeni (liste pasif; neden yalnız burada
 * yazar, az önceki onayın arkasında), yoksa son onay ya da eklemeden önceki ipucu.
 */
export function sheetStatus(blocked: string | null, status: string, hint: string): string {
  if (blocked) return status ? `${status} · ${blocked}` : blocked;
  return status || hint;
}
