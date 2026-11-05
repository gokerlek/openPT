import { DEFAULT_LOCALE, type Locale } from '../i18n/locale.ts';
import { clientWorkoutMessages } from '../i18n/messages/client-workout/index.ts';
import { getFormat } from './format.ts';
import type { EntryStatus, SessionDoc, SessionEntry, SkipReason } from './schemas/session.ts';
import { normalizeSession, withDeletions } from './session-merge.ts';
import { isStraight } from './set-plan.ts';
import { blockKindLabels, FALLBACK_REST_SECONDS, ROW_ID_PATTERN, type BlockKind, type TemplateBlock } from './template-plan.ts';
import { dropUnit, entryForRow, entryStatusOf, remaining, restoreUnit, type CursorUnit, type Stamp } from './workout-cursor.ts';
import type { LocalWorkout } from './workout-outbox.ts';
import { dayBody, entryPlanOf, extraKey, type ExtraRow, type ExtraRows, type WorkoutDay, type WorkoutRow } from './workout-plan.ts';
import { cursorOf, cursorOverrides, ensureEntries, newRowEntryId } from './workout-session.ts';

/**
 * Antrenmanın listesi ve atlama (tasarım §2.6) — saf: liste + odak ekranının listesi, taşıma,
 * "Bu hareketi atla" ve toast'taki "Geri al", atlananı geri alma, "Muadil seç" (muadil), "Hareket ekle" ve
 * bitişteki isteğe bağlı neden. Sıra değişiklikleri imlecin işleridir (`workout-cursor.ts`: birim tek hareket
 * ya da grubun tamamı); burası onları günün etkin planıyla çağırır.
 *
 * - Günün etkin planı (`effectiveDay`): başlangıçtaki gün + belgedeki muadiller (satır yerinde yeni
 *   hareketle) + eklenen hareketler (sonda, kendi kaydının kimliğiyle tek hareketlik blok). Planları
 *   sunucudan gelir (`ExtraRows`, kendi geçmişiyle); gelmediyse muadil asıl satırın düzeniyle sürer.
 * - Sıra (`order`) hareket kimlikleriyle yazılır: sırayı değiştiren her iş önce günün her satırına kayıt
 *   açar (`ensureEntries`); kaydı olmayan hareket sırada yer tutamazdı.
 * - "Değiştir" hareketin kaydını yerinde çevirir (kimlik aynı, sıra bozulmaz): `swappedFrom` yerini
 *   aldığı satır, başlık ve cihaz muadilinki; asıl harekete dönmek de aynı iştir. Çalışma seti
 *   kaydedilmiş harekette açılmaz ("Bu hareketi atla" var); eski hareketin ısınma setleri silinir.
 * - Neden antrenman ortasında sorulmaz; bitişte, yapılmayan her harekete bir kez. "Ağrı" yalnız sağlık
 *   onayı varken çıkar: seansa `other`, ayrıntı (`skippedRows`) `health.json`'a (SPEC §4).
 */

type Random = (n: number) => Uint8Array;

/* --- günün etkin planı --- */

/** Muadilin planı gelmediyse: asıl satırın düzeni ve ağırlıkları, muadilin adı ve cihazıyla ("Önceki" yok). */
function fallbackSwapRow(original: WorkoutRow, entry: SessionEntry): WorkoutRow {
  // Kardiyo türü asıl hareketin: muadil başka hareket olabilir, mesafe ve eğim sütunları taşınmaz.
  const { warmups: _warmups, setupNote: _setupNote, note: _note, deviceId: _deviceId, cardio: _cardio, ...rest } = original;
  return { ...rest, exerciseId: entry.exerciseId, title: entry.title, ...(entry.deviceId ? { deviceId: entry.deviceId } : {}), lastTime: [] };
}

/**
 * Günün etkin planı: muadiller satırın yerinde (plan `extras`'tan), eklenen hareketler sonda. Değişen bir
 * şey yoksa aynı gün (imleç ve ekran aynı nesneyle çalışır).
 */
export function effectiveDay(day: WorkoutDay, doc: Pick<SessionDoc, 'entries'>, extras: ExtraRows): WorkoutDay {
  const rows: Record<string, WorkoutRow> = { ...day.rows };
  let changed = false;
  const blocks = day.blocks.map((block): TemplateBlock => {
    let touched = false;
    const kept = block.rows.map((row) => {
      const entry = entryForRow(doc.entries, row.id);
      const original = day.rows[row.id];
      if (!entry || !original || entry.swappedFrom !== row.id || entry.exerciseId === row.exerciseId) return row;
      touched = true;
      const extra = extras[extraKey(row.id, entry.exerciseId)];
      if (extra) {
        rows[row.id] = { ...extra.row, rowId: row.id, blockId: block.id };
        return { ...extra.template, id: row.id };
      }
      rows[row.id] = fallbackSwapRow(original, entry);
      return { ...row, exerciseId: entry.exerciseId };
    });
    if (!touched) return block;
    changed = true;
    return { ...block, rows: kept };
  });
  const added: TemplateBlock[] = [];
  for (const entry of doc.entries) {
    if (!entry.added || entry.rowId || entry.swappedFrom) continue;
    const extra = extras[extraKey(entry.id, entry.exerciseId)];
    if (!extra) continue;
    rows[entry.id] = { ...extra.row, rowId: entry.id, blockId: entry.id };
    added.push({ id: entry.id, kind: 'single', restSeconds: extra.restSeconds ?? FALLBACK_REST_SECONDS, rows: [{ ...extra.template, id: entry.id }] });
  }
  if (!changed && added.length === 0) return day;
  return { ...day, blocks: [...blocks, ...added], rows };
}

/**
 * Günün etkin hâline "+ Set ekle"nin istenen fazladan turları (telefondaki antrenmandan, `LocalWorkout.extraRounds`).
 * Günde olmayan birimin ya da sıfır turun kaydı düşer; bir şey yoksa aynı gün.
 */
export function withExtraRounds(day: WorkoutDay, rounds: Readonly<Record<string, number>> | undefined): WorkoutDay {
  const keys = new Set(day.blocks.map((block) => block.id));
  const kept = Object.entries(rounds ?? {}).filter(([key, count]) => count > 0 && keys.has(key));
  if (kept.length === 0) {
    if (!day.extraRounds) return day;
    const { extraRounds: _dropped, ...rest } = day;
    return rest;
  }
  return { ...day, extraRounds: Object.fromEntries(kept) };
}

/**
 * Günün etkin hâlinden bugün silinen (yapılmamış) planlı setler (sola kaydırıp "Sil", `LocalWorkout.droppedSets`):
 * satırın planından düşer; satırlar, set sayısı, imleç ve kaydın durumu bu planla. Günde olmayan satırın ya da satırı
 * boşaltacak kaydın etkisi yok; bir şey yoksa aynı gün.
 */
export function withDroppedSets(day: WorkoutDay, dropped: Readonly<Record<string, readonly number[]>> | undefined): WorkoutDay {
  let rows: WorkoutDay['rows'] | null = null;
  for (const [rowId, indexes] of Object.entries(dropped ?? {})) {
    const row = day.rows[rowId];
    if (!row || indexes.length === 0) continue;
    const gone = new Set(indexes);
    const sets = row.plan.sets.filter((set) => !gone.has(set.setIndex));
    if (sets.length === 0 || sets.length === row.plan.sets.length) continue;
    rows = { ...(rows ?? day.rows), [rowId]: { ...row, plan: { ...row.plan, sets } } };
  }
  return rows ? { ...day, rows } : day;
}

/**
 * Telefondaki antrenmanın günün etkin hâli verilen belgeyle: başlangıçtaki gün + muadiller + eklenen hareketler
 * (`effectiveDay`) + "+ Set ekle"nin istenen turları (`withExtraRounds`) − bugün silinen setler (`withDroppedSets`).
 * Antrenman ekranı ve Bugün'ün "Devam et" kartı aynı planla çalışır.
 */
export function localWorkoutDay(local: Pick<LocalWorkout, 'plan' | 'extras' | 'extraRounds' | 'droppedSets'>, doc: Pick<SessionDoc, 'entries'>): WorkoutDay {
  return withDroppedSets(withExtraRounds(effectiveDay(local.plan, doc, local.extras), local.extraRounds), local.droppedSets);
}

/* --- liste (Faz 2: liste + odak) --- */

/** Birimin satırı, durumsuz: numaralar, adlar, set sayıları. `ListItem` durumu ve son ağırlığı ekler. */
export type FlowItem = {
  /** Birimin anahtarı (blok ya da eklenen hareketin kaydı). */
  key: string;
  kind: BlockKind;
  /** Grupta "Süperset", "Devre", "Kompleks" (okuyanın dilinde: `listView`'un `locale`'i). */
  kindLabel: string | null;
  /** Planın sırasıyla numara ("3", grupta "3a", "3b") ve ad. */
  members: { rowId: string; number: string; title: string }[];
  /** Yapılan ve planlanan çalışma setleri ("2/3"). */
  done: number;
  planned: number;
  /** Antrenmanda eklenen hareket (planda yok): seti yazılmamışsa silinebilir (`canRemoveAdded`). */
  added: boolean;
};

function isSkipped(unit: CursorUnit): boolean {
  return unit.members.length > 0 && unit.members.every((member) => member.skipped);
}

/** Planın bütün setleri yapıldı (bekleyen fazladan set birimi "şu an"da tutmaz). */
function isFinished(unit: CursorUnit): boolean {
  return !remaining(unit);
}

function entryIdsOf(unit: CursorUnit): string[] {
  return unit.members.flatMap((member) => (member.entryId ? [member.entryId] : []));
}

/** Birimin adı: tek harekette başlık, grupta "A + B". */
export function unitTitle(day: WorkoutDay, doc: Pick<SessionDoc, 'entries'>, unit: CursorUnit): string {
  return unit.members
    .map((member) => (member.rowId ? day.rows[member.rowId]?.title : undefined) ?? doc.entries.find((entry) => entry.id === member.entryId)?.title ?? '')
    .filter(Boolean)
    .join(' + ');
}

/** Listenin satırının adı: tek harekette başlık, grupta "A + B" (`unitTitle` gibi). */
export function itemName(item: { members: readonly { title: string }[] }): string {
  return item.members
    .map((member) => member.title)
    .filter(Boolean)
    .join(' + ');
}

/** Birimin satırı: numara planın sırasıyla (eklenen hareket planın arkasındaki numarayla), grupta "3a", "3b". */
function itemOf(day: WorkoutDay, doc: Pick<SessionDoc, 'entries'>, unit: CursorUnit, numbers: ReadonlyMap<string, number>, locale: Locale): FlowItem {
  const number = numbers.get(unit.key) ?? numbers.size + 1;
  const group = unit.kind !== 'single' && unit.members.length > 1;
  const members = unit.members.map((member, index) => ({
    rowId: member.rowId ?? member.entryId ?? unit.key,
    number: group ? `${number}${String.fromCharCode(97 + index)}` : String(number),
    title: (member.rowId ? day.rows[member.rowId]?.title : undefined) ?? doc.entries.find((entry) => entry.id === member.entryId)?.title ?? '',
  }));
  return {
    key: unit.key,
    kind: unit.kind,
    kindLabel: unit.kind === 'single' ? null : blockKindLabels(locale)[unit.kind],
    members,
    done: unit.members.reduce((sum, member) => sum + Math.min(member.done, member.planned), 0),
    planned: unit.members.reduce((sum, member) => sum + member.planned, 0),
    added: doc.entries.some((entry) => entry.id === unit.key && entry.added === true),
  };
}

export type ListState = 'done' | 'current' | 'pending' | 'skipped';

export type ListItem = FlowItem & {
  state: ListState;
  /** Satırdaki ağırlık: bugün kaydedilen son çalışma setinin kilosu, yoksa geçen antrenmanın son setininki. */
  lastKg: number | null;
  lastFrom: 'today' | 'last' | null;
};

export type ListView = {
  /** Yapılış sırasında (atlanan birim `dropAt` ile sıranın sonuna iner). */
  items: ListItem[];
  /**
   * Şu an: odak (açılabilen birim, `validFocus`); yoksa yarım bırakılan birim (son kaydedilen çalışma setininki);
   * yoksa planı bitmemiş ilk birim. Üçünde de yalnız açılabilen birim: plan dışı kayıt "şu an" olmaz (açılamaz;
   * "Devam et" ve açılış kuralı onu açmaya çalışmasın). Odaksız null: hepsi bittiyse (`allDone`) ya da kalan yalnız
   * plan dışı kayıtsa. Bekleyen "+ Set ekle" seti birimi "şu an" tutmaz.
   */
  current: string | null;
  doneSets: number;
  plannedSets: number;
  allDone: boolean;
};

/**
 * Antrenmanın listesi (tasarım Faz 2): durum (✓ bitti, ▶ şu an, ○ sırada, ⤼ atlandı), ad, yapılan/planlanan set
 * ve son ağırlık (grupta ağırlığı olan ilk üyenin). Danışan sırayı atlayıp başka bir hareketi yarım bıraktıysa
 * "şu an" odur: listeye dönünce "Devam et" onu gösterir. Biten birim odakta da "bitti" görünür; açılamayan birime
 * (günde yok, atlandı, plan dışı kayıt) odak yok sayılır. Plan dışı kayıt listede setleriyle durur.
 */
export function listView(day: WorkoutDay, doc: Pick<SessionDoc, 'entries' | 'order'>, focus?: string | null, locale: Locale = DEFAULT_LOCALE): ListView {
  const cursor = cursorOf(day, doc);
  const numbers = new Map(day.blocks.map((block, index) => [block.id, index + 1]));
  let latest: { entryId: string; at: string } | null = null;
  for (const entry of doc.entries) {
    for (const set of entry.sets) {
      // Eşit saat yalnız iki cihazda olur: kayıtların dizisinde sonra gelen kazanır (`order` varsa yapılış sırası,
      // yoksa kimlik sırası); ikisi de tutarlı bir "şu an" verir.
      if (set.type === 'working' && (!latest || set.at >= latest.at)) latest = { entryId: entry.id, at: set.at };
    }
  }
  const inProgress = latest ? cursor.units.find((unit) => unit.members.some((member) => member.entryId === latest?.entryId)) : undefined;
  const active = inProgress && openable(day, inProgress) && !isFinished(inProgress) ? inProgress.key : null;
  const firstOpen = cursor.units.find((unit) => openable(day, unit) && !isFinished(unit));
  const current = focusAmong(day, cursor.units, focus) ?? active ?? firstOpen?.key ?? null;
  const items = cursor.units.map((unit): ListItem => {
    const state: ListState = isSkipped(unit) ? 'skipped' : isFinished(unit) ? 'done' : unit.key === current ? 'current' : 'pending';
    return { ...itemOf(day, doc, unit, numbers, locale), state, ...lastWeightOf(day, doc, unit) };
  });
  return { items, current, doneSets: cursor.progress.doneSets, plannedSets: cursor.progress.plannedSets, allDone: cursor.allDone };
}

/**
 * Birimin günün planında satırı var mı. Plan bloklarının birimlerinde her üyenin satırı vardır (gün her blok satırını
 * `rows`'a yazar; muadil ve plan verisi gelen eklenen hareket de `effectiveDay`'de): biten, gruplu ya da şu anki üyesi
 * bitmiş birim de. Yoksa plan dışı kayıttır (`workoutUnits`: başka cihazda plan verisi gelmeden eklenen hareket, PT'nin
 * programdan kaldırdığı satırın kaydı): kartın gösterecek satırı yok.
 */
function hasPlanRow(day: WorkoutDay, unit: CursorUnit): boolean {
  return unit.members.some((member) => member.rowId !== null && day.rows[member.rowId] !== undefined);
}

/** Odakta açılabilir mi: atlanmamış ve planda satırı var. */
function openable(day: WorkoutDay, unit: CursorUnit): boolean {
  return !isSkipped(unit) && hasPlanRow(day, unit);
}

/** Odak geçerli mi: birim günde ve açılabilir; değilse null (`listView`'ın ve ekranın tek kuralı). */
function focusAmong(day: WorkoutDay, units: readonly CursorUnit[], focus: string | null | undefined): string | null {
  const unit = focus == null ? undefined : units.find((item) => item.key === focus);
  return unit && openable(day, unit) ? unit.key : null;
}

/**
 * Adresteki odak gösterilir mi (`listView`'ın kuralı): birim günde, atlanmamış ve planda satırı var. Değilse null:
 * antrenman ekranı listeyi çizer ve odağı adresten düşürür (başka cihazda silindi, adres elle değişti, birim atlandı,
 * plan dışı kayıt).
 */
export function validFocus(day: WorkoutDay, doc: Pick<SessionDoc, 'entries' | 'order'>, focus: string | null | undefined): string | null {
  return focus == null ? null : focusAmong(day, cursorOf(day, doc).units, focus);
}

/**
 * Açılacak sıradaki birim (odakta kendiliğinden geçiş, odaktaki hareketi geçme; "Sıradaki" satırı): listede `except`'in
 * ardından planı bitmemiş ilk açılabilen birim, sonda başa dönerek. Geri dönmez: önceki bitmemiş (yarım bırakılan da)
 * ancak sıra başa dönünce gelir. Odak yokken (`except` null) listenin "şu an"ı (`listView`: yarım bırakılan, yoksa
 * sırada ilk bitmemiş; "Devam et"). Atlamada belge atlamadan öncekidir: atlanan sona iner, sıradaki eski yerinin ardından.
 * Bekleyen "+ Set ekle" seti birimi sıraya sokmaz; plan dışı kayıt da açılmaz. Yoksa null.
 */
export function nextUnitAfter(day: WorkoutDay, doc: Pick<SessionDoc, 'entries' | 'order'>, except: string | null): string | null {
  if (except === null) return listView(day, doc).current;
  const units = cursorOf(day, doc).units;
  const index = units.findIndex((unit) => unit.key === except);
  const ahead = index === -1 ? units : [...units.slice(index + 1), ...units.slice(0, index)];
  return ahead.find((unit) => unit.key !== except && openable(day, unit) && !isFinished(unit))?.key ?? null;
}

/**
 * Odakta "‹ Önceki": listede `key`'in hemen önündeki açılabilen birim (biten, şu an ya da sırada; yapılış sırası, `listView`
 * gibi). Atlanan birim ve plan dışı kayıt açılamaz (`validFocus`), üstlerinden geçilir. `key` ilk açılabilen birimse ya da
 * günde yoksa null. `nextUnitAfter`'ın aksine sıradaki iş değil, listedeki komşu: biten bir hareketi düzeltmeye dönmek için.
 */
export function previousUnitBefore(day: WorkoutDay, doc: Pick<SessionDoc, 'entries' | 'order'>, key: string): string | null {
  const units = cursorOf(day, doc).units;
  const index = units.findIndex((unit) => unit.key === key);
  for (let at = index - 1; at >= 0; at -= 1) {
    const unit = units[at];
    if (unit && openable(day, unit)) return unit.key;
  }
  return null;
}

export type ListWindow<T> = {
  shown: T[];
  /** Pencerenin üstünde ve altında kalan hareketler (grupta her üye ayrı hareket): "Önceki n hareket", "+n hareket daha". */
  before: number;
  after: number;
};

/**
 * Kısa liste penceresi (Bugün'ün "Devam et" kartı): en çok `limit` birim, "şu an" hep içinde. Şu an ilk `limit`
 * birimdeyse baştan; değilse pencere kayar, şu anın üstünde bir birim bağlam kalır (`limit` 1 ise yalnız o) ve liste
 * sonuna yaslanınca sondaki `limit` birim. Şu an yoksa (hepsi bitti) ya da listede değilse baştan.
 */
export function listWindow<T extends { key: string; members: readonly unknown[] }>(items: readonly T[], current: string | null, limit: number): ListWindow<T> {
  const size = Math.max(1, Math.floor(limit));
  const index = current === null ? -1 : items.findIndex((item) => item.key === current);
  const start = index >= size ? Math.min(Math.max(index - 1, index - size + 1), items.length - size) : 0;
  const count = (list: readonly T[]) => list.reduce((sum, item) => sum + item.members.length, 0);
  return { shown: items.slice(start, start + size), before: count(items.slice(0, start)), after: count(items.slice(start + size)) };
}

/** Satırın ağırlığı: ağırlığı olan ilk üyenin bugünkü son çalışma seti, yoksa geçen antrenmanın son seti. */
function lastWeightOf(day: WorkoutDay, doc: Pick<SessionDoc, 'entries'>, unit: CursorUnit): Pick<ListItem, 'lastKg' | 'lastFrom'> {
  for (const member of unit.members) {
    const entry = doc.entries.find((item) => item.id === member.entryId);
    const today = entry?.sets.filter((set) => set.type === 'working' && set.kg !== undefined).at(-1)?.kg;
    if (today !== undefined) return { lastKg: today, lastFrom: 'today' };
    const last = (member.rowId ? day.rows[member.rowId]?.lastTime : undefined)?.filter((set) => set.kg !== undefined).at(-1)?.kg;
    if (last !== undefined) return { lastKg: last, lastFrom: 'last' };
  }
  return { lastKg: null, lastFrom: null };
}

/* --- geri al, atlananlar --- */

function overrides(day: WorkoutDay) {
  return cursorOverrides(day);
}

/** Birimin kaydı açılmış belge ve birimin bir kaydı (imlecin işleri kayıt kimliğiyle çalışır). */
function prepared(day: WorkoutDay, doc: SessionDoc, key: string, stamp: Stamp, random?: Random) {
  const ready = ensureEntries(day, doc, stamp, random);
  const units = cursorOf(day, ready).units;
  const unit = units.find((item) => item.key === key);
  const entryId = unit ? (entryIdsOf(unit)[0] ?? null) : null;
  return { ready, units, unit, entryId };
}

/** "Geri al" için atlamadan önceki hâl: sıra ve birimin kayıtlarının durumu. */
export type SkipUndo = { key: string; order: string[]; entries: { id: string; status: EntryStatus; skip?: SessionEntry['skip'] }[] };

/** Toast'taki "Geri al" (`dropWithUndo`): sıra ve birimin durumu atlamadan önceki hâline (arada yapılan setler kalır). */
export function undoSkip(day: WorkoutDay, doc: SessionDoc, undo: SkipUndo, stamp: Stamp): SessionDoc {
  const saved = new Map(undo.entries.map((entry) => [entry.id, entry]));
  const members = new Map(cursorOf(day, doc).units.flatMap((unit) => unit.members.flatMap((member) => (member.entryId ? [[member.entryId, member] as const] : []))));
  const entries = doc.entries.map((entry) => {
    const before = saved.get(entry.id);
    if (!before) return entry;
    const member = members.get(entry.id);
    const { skip: _skip, ...rest } = entry;
    const status = before.status === 'skipped' || !member ? before.status : entryStatusOf({ ...member, skipped: false });
    return { ...rest, status, ...(before.skip ? { skip: before.skip } : {}), updatedAt: stamp.at, by: stamp.by };
  });
  const present = new Set(doc.entries.map((entry) => entry.id));
  const order = undo.order.filter((id) => present.has(id));
  const known = new Set(order);
  for (const entry of doc.entries) if (!known.has(entry.id)) order.push(entry.id);
  return normalizeSession({ ...doc, entries, order: { value: order, updatedAt: stamp.at, by: stamp.by } });
}

/** Birim atlananlara: `dropWithUndo`'nun yazımı, "Geri al" bilgisi olmadan (demo geçmişi, `demo-history.ts`). */
export function dropAt(day: WorkoutDay, doc: SessionDoc, key: string, stamp: Stamp, random?: Random): SessionDoc {
  const { ready, entryId } = prepared(day, doc, key, stamp, random);
  return entryId ? normalizeSession(dropUnit(dayBody(day), ready, entryId, stamp, overrides(day))) : doc;
}

/**
 * Atlananı geri almak (listede "Geri al", atlanan satıra dokunmak): birim yeniden yapılacak, sonda kalır. "Bilerek
 * geçildi" işareti (`skip.moved`) kalır.
 */
export function restoreAt(day: WorkoutDay, doc: SessionDoc, key: string, stamp: Stamp, random?: Random): SessionDoc {
  const { ready, unit, entryId } = prepared(day, doc, key, stamp, random);
  if (!unit || !entryId) return doc;
  const ids = new Set(entryIdsOf(unit));
  const restored = restoreUnit(dayBody(day), ready, entryId, stamp, overrides(day));
  return normalizeSession({ ...restored, entries: restored.entries.map((entry) => (ids.has(entry.id) ? { ...entry, skip: { moved: true } } : entry)) });
}

/** Atlanan ilk birim (bitişte "Geçileni yap": geri alınıp açılır; plan dışı kayıt açılamaz, sayılmaz); yoksa null. */
export function firstSkippedKey(day: WorkoutDay, doc: Pick<SessionDoc, 'entries' | 'order'>): string | null {
  return cursorOf(day, doc).units.find((unit) => isSkipped(unit) && hasPlanRow(day, unit))?.key ?? null;
}

/* --- sıra ve atlama (Faz 2: liste + odak) --- */

/** Bitmemiş ve atlanmamış birimlerin yeni sırası; biten ve atlanan yerinde kalır. */
function reorderMovable(day: WorkoutDay, doc: SessionDoc, key: string, place: (movable: CursorUnit[], from: number) => CursorUnit[] | null, stamp: Stamp, random?: Random): SessionDoc {
  const { ready, units } = prepared(day, doc, key, stamp, random);
  const movable = units.filter((unit) => !isSkipped(unit) && !isFinished(unit));
  const from = movable.findIndex((unit) => unit.key === key);
  const placed = from < 0 ? null : place(movable, from);
  if (!placed) return doc;
  let index = 0;
  const ordered = units.map((unit) => (movable.includes(unit) ? (placed[index++] as CursorUnit) : unit));
  return normalizeSession({ ...ready, order: { value: ordered.flatMap(entryIdsOf), updatedAt: stamp.at, by: stamp.by } });
}

/** Klavyeyle taşıma (liste, Alt + ↑/↓): birim bir yukarı ya da aşağı. Taşınamıyorsa belge aynen döner. */
export function moveUnit(day: WorkoutDay, doc: SessionDoc, key: string, direction: -1 | 1, stamp: Stamp, random?: Random): SessionDoc {
  return reorderMovable(day, doc, key, (movable, from) => {
    const to = from + direction;
    if (to < 0 || to >= movable.length) return null;
    const next = [...movable];
    [next[from], next[to]] = [next[to] as CursorUnit, next[from] as CursorUnit];
    return next;
  }, stamp, random);
}

/** Sürükleme (listede tutamaçtan): birim bırakıldığı bitmemiş birimin yerine. Hedef biten ya da atlanan ise belge aynen döner. */
export function moveUnitTo(day: WorkoutDay, doc: SessionDoc, key: string, targetKey: string, stamp: Stamp, random?: Random): SessionDoc {
  return reorderMovable(day, doc, key, (movable, from) => {
    const to = movable.findIndex((unit) => unit.key === targetKey);
    if (to < 0 || to === from) return null;
    const next = [...movable];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved as CursorUnit);
    return next;
  }, stamp, random);
}

/** "Bu hareketi atla" (odakta ⋯): birim atlananlara; toast'taki "Geri al" (`undoSkip`) için önceki sıra ve durum. */
export function dropWithUndo(day: WorkoutDay, doc: SessionDoc, key: string, stamp: Stamp, random?: Random): { doc: SessionDoc; undo: SkipUndo } | null {
  const { ready, units, unit, entryId } = prepared(day, doc, key, stamp, random);
  // Biten birim atlanmaz: "bitti" yerine "atlandı" görünür ve sonraki antrenmanın set artışı bastırılırdı.
  if (!unit || !entryId || isSkipped(unit) || isFinished(unit)) return null;
  const ids = new Set(entryIdsOf(unit));
  const undo: SkipUndo = {
    key,
    order: units.flatMap(entryIdsOf),
    entries: ready.entries
      .filter((entry) => ids.has(entry.id))
      .map((entry) => ({ id: entry.id, status: entry.status, ...(entry.skip ? { skip: entry.skip } : {}) })),
  };
  return { doc: normalizeSession(dropUnit(dayBody(day), ready, entryId, stamp, overrides(day))), undo };
}

/* --- değiştir (muadil) --- */

/** "Değiştir" açık mı: programın satırı, çalışma seti kaydedilmemiş (kaydedildiyse "Bu hareketi atla" var). */
export function canSwap(day: WorkoutDay, doc: Pick<SessionDoc, 'entries'>, rowId: string): boolean {
  if (!ROW_ID_PATTERN.test(rowId) || !day.rows[rowId]) return false;
  return !entryForRow(doc.entries, rowId)?.sets.some((set) => set.type === 'working');
}

/**
 * "Değiştir": satırın hareketi muadiliyle (`extra`) ya da asıl hareketle (`null`) değişir. `day`
 * başlangıçtaki gün (asıl satır ondan). Kayıt varsa yerinde çevrilir (kimlik ve sıra aynı; eski
 * hareketin ısınmaları silinir), yoksa muadilin kaydı açılır. Olmazsa (set kaydedilmiş, aynı hareket)
 * aynı belge.
 */
export function swapRow(day: WorkoutDay, doc: SessionDoc, input: { rowId: string; extra: ExtraRow | null; stamp: Stamp; random?: Random }): SessionDoc {
  const original = day.rows[input.rowId];
  if (!original || !canSwap(day, doc, input.rowId)) return doc;
  const row = input.extra ? input.extra.row : original;
  const exerciseId = input.extra ? input.extra.exerciseId : original.exerciseId;
  const current = entryForRow(doc.entries, input.rowId);
  if ((current?.exerciseId ?? original.exerciseId) === exerciseId) return doc;
  const { stamp } = input;
  const entry: SessionEntry = {
    id: current?.id ?? newRowEntryId(doc, input.rowId, input.random),
    ...(input.extra ? { swappedFrom: input.rowId } : { rowId: input.rowId }),
    blockId: original.blockId,
    exerciseId,
    title: row.title,
    ...(row.deviceId ? { deviceId: row.deviceId } : {}),
    status: current?.status === 'skipped' ? 'skipped' : 'pending',
    ...(current?.skip ? { skip: current.skip } : {}),
    plan: entryPlanOf(row),
    ...(row.setupNote ? { setupNote: row.setupNote } : {}),
    updatedAt: stamp.at,
    by: stamp.by,
    sets: [],
  };
  if (!current) return normalizeSession({ ...doc, entries: [...doc.entries, entry] });
  const replaced = { ...doc, entries: doc.entries.map((item) => (item.id === current.id ? entry : item)) };
  const warmups = current.sets.filter((set) => set.type === 'warmup').map((set) => set.id);
  return warmups.length > 0 ? withDeletions(replaced, { setIds: warmups }) : normalizeSession(replaced);
}

/**
 * Muadil listesindeki satırın alt metni: "8–12 tekrar · 30 kg ile başla", "3 set · öneri 62,5 kg",
 * "30–60 sn". İlk kezse "ile başla", geçmişi varsa "öneri".
 */
export function optionText(extra: ExtraRow, locale: Locale = DEFAULT_LOCALE): string {
  const { row, template } = extra;
  const t = clientWorkoutMessages(locale);
  const f = getFormat(locale);
  const first = template.sets[0];
  const unit = (count: number) => (row.trackingType === 'duration' ? t.units.seconds(count) : t.units.reps(count));
  const target =
    first && isStraight(template.sets)
      ? `${first.min === first.max ? f.number(first.min) : `${f.number(first.min)}–${f.number(first.max)}`} ${unit(first.max)}`
      : `${template.sets.length} ${t.units.sets(template.sets.length)}`;
  if (row.trackingType !== 'weight_reps' || row.plan.topWeightKg <= 0) return target;
  const kg = f.kg(row.plan.topWeightKg);
  return `${target} · ${row.plan.reason === 'first_time' ? t.flow.startWith(kg) : t.flow.suggested(kg)}`;
}

/* --- hareket ekle --- */

/**
 * "Hareket ekle": yalnız bu antrenmana; kaydı hemen açılır (`added`, planlanan set sayısıyla) ve
 * yapılacakların sonuna (atlananların önüne) girer. `extra` bu kaydın kimliğiyle anahtarlanmış satır
 * (`rekeyExtra`); `day` günün etkin planı.
 */
export function addExercise(day: WorkoutDay, doc: SessionDoc, input: { entryId: string; extra: ExtraRow; stamp: Stamp; random?: Random }): SessionDoc {
  const { stamp, extra } = input;
  const ready = ensureEntries(day, doc, stamp, input.random);
  const entry: SessionEntry = {
    id: input.entryId,
    exerciseId: extra.exerciseId,
    title: extra.row.title,
    ...(extra.row.deviceId ? { deviceId: extra.row.deviceId } : {}),
    status: 'pending',
    added: true,
    plannedSets: Math.max(1, extra.template.sets.length),
    plan: entryPlanOf(extra.row),
    ...(extra.row.setupNote ? { setupNote: extra.row.setupNote } : {}),
    updatedAt: stamp.at,
    by: stamp.by,
    sets: [],
  };
  const units = cursorOf(day, ready).units;
  const order = [...units.filter((unit) => !isSkipped(unit)).flatMap(entryIdsOf), entry.id, ...units.filter(isSkipped).flatMap(entryIdsOf)];
  return normalizeSession({ ...ready, entries: [...ready.entries, entry], order: { value: order, updatedAt: stamp.at, by: stamp.by } });
}

/**
 * Antrenmanda eklenen hareket silinebilir mi: kaydı `added` ve henüz seti yok. Plandaki hareket silinmez ("Atla" ile
 * atlanır); seti yazılmış eklenen hareket de silinmez (önce setleri silinir ya da atlanır).
 */
export function canRemoveAdded(doc: Pick<SessionDoc, 'entries'>, key: string): boolean {
  const entry = doc.entries.find((item) => item.id === key);
  return entry?.added === true && entry.sets.length === 0;
}

/**
 * Eklenen hareketi siler: kimlik kalıcı iz listesine girer (`withDeletions`; başka cihazdaki kopyası da düşer). "Geri al"
 * hareketi yeni kimlikle yeniden ekler (`addExercise`). Silinemezse null.
 */
export function removeAdded(doc: SessionDoc, key: string): SessionDoc | null {
  return canRemoveAdded(doc, key) ? withDeletions(doc, { entryIds: [key] }) : null;
}

/* --- bitişte neden --- */

/** Bitişteki "Neden?" çipleri (isteğe bağlı, tek seçim); "Ağrı" yalnız sağlık onayı varken. */
export const FINISH_REASONS = ['no_time', 'tired', 'busy', 'no_equipment', 'other', 'pain'] as const;
export type FinishReason = (typeof FINISH_REASONS)[number];

/** Nedenlerin adları okuyanın dilinde. */
export function finishReasonLabels(locale: Locale = DEFAULT_LOCALE): Record<FinishReason, string> {
  return clientWorkoutMessages(locale).flow.finishReasons;
}

/** Türkçe adlar (eski çağrılar); arayüz `finishReasonLabels(locale)` kullanır. */
export const FINISH_REASON_LABELS: Record<FinishReason, string> = finishReasonLabels('tr');

/**
 * Bitişte seçilen neden yapılmayan (geçilen ya da eksik kalan) her harekete yazılır (`skip.reason`).
 * Ağrı seansa `other` olarak girer; ayrıntı yalnız programın satırları için `health.json`'a gider
 * (`skippedRows`; sunucu onayı yeniden denetler).
 */
export function withFinishReason(
  day: WorkoutDay,
  doc: SessionDoc,
  reason: FinishReason,
  stamp: Stamp,
  random?: Random,
): { doc: SessionDoc; skippedRows: { rowId: string; reason: 'pain' }[] } {
  const ready = ensureEntries(day, doc, stamp, random);
  const undone = cursorOf(day, ready).units.flatMap((unit) => unit.members.filter((member) => member.entryId && member.done < member.planned));
  const ids = new Set(undone.map((member) => member.entryId));
  const value: SkipReason = reason === 'pain' ? 'other' : reason;
  const entries = ready.entries.map((entry) =>
    ids.has(entry.id) ? { ...entry, skip: { reason: value, moved: entry.skip?.moved ?? false }, updatedAt: stamp.at, by: stamp.by } : entry,
  );
  const skippedRows =
    reason === 'pain' ? undone.flatMap((member) => (member.rowId && ROW_ID_PATTERN.test(member.rowId) ? [{ rowId: member.rowId, reason: 'pain' as const }] : [])) : [];
  return { doc: normalizeSession({ ...ready, entries }), skippedRows };
}

const sameSkip = (a: SessionEntry['skip'], b: SessionEntry['skip']) => a?.reason === b?.reason && a?.moved === b?.moved;

/**
 * "Antrenmanı değiştir"in bitişi olmadı, antrenman sürüyor: değiştirmenin hazırlığı (`ensureEntries` ve yapılmayanlara
 * "diğer" nedeni, `withFinishReason`) geri alınır; kalsaydı sonraki bitişte yapılmayanlar antrenöre "diğer" nedeniyle
 * bildirilirdi. `before` değiştirmeden önceki belge, `prepared` hazırlanmış (bitişe gönderilen) belge, `latest` istek
 * bittiğinde telefondaki belge.
 *
 * Belge istek sürerken değişmediyse (`latest === prepared`) önceki hâli döner. Değiştiyse (o arada set yazıldı) yalnız
 * hazırlığın yazdığı neden önceki hâline döner (önceki `skip`, örneğin "bilerek geçildi" işareti, geri gelir; yoksa kalkar),
 * sonradan yazılanlar kalır: o arada başka neden yazılmış kayda dokunulmaz. `ensureEntries`'in açtığı kayıtlar kalır
 * (setsiz, nedensiz; o arada sete de dönmüş olabilirler).
 */
export function undoSwitchPrep(latest: SessionDoc, before: SessionDoc, prepared: SessionDoc, stamp: Stamp): SessionDoc {
  if (latest === prepared) return before;
  const skipIn = (doc: SessionDoc, id: string) => doc.entries.find((entry) => entry.id === id)?.skip;
  const entries = latest.entries.map((entry) => {
    const written = skipIn(prepared, entry.id);
    const was = skipIn(before, entry.id);
    if (!written || sameSkip(written, was) || entry.skip?.reason !== written.reason) return entry;
    const { skip: _skip, ...rest } = entry;
    return { ...rest, ...(was ? { skip: was } : {}), updatedAt: stamp.at, by: stamp.by };
  });
  return normalizeSession({ ...latest, entries });
}
