import { DEFAULT_LOCALE, intlLocale, type Locale } from '../i18n/locale.ts';
import { clientWorkoutMessages } from '../i18n/messages/client-workout/index.ts';
import type { TrackingType } from './progression.ts';
import type { CardioKind } from './cardio.ts';
import { cardioTargetParts, isFullLoad, setShape, timedSets, type SetSpec } from './set-plan.ts';
import { formatRest } from './template-plan.ts';

/**
 * Setlerin danışanın dilinde anlatımı (`/me`, SPEC §6: danışan yalnız telefondan). PT'nin kısa
 * yazımı ("12 / 10 / 8+ tekrar · piramit %80 → %100 · +: yapabildiğin kadar") danışana kısaltma
 * ve işaret okutuyordu; burada aynı plan cümleyle anlatılır:
 * "3 set: 12, 10 tekrar ve son sette yapabildiğin kadar (en az 8) · ağırlık her sette artar ·
 * 1 dk 30 sn dinlenme". Saf; PT'nin yazımı `set-plan.ts` `formatSets`'te kalır.
 */

function count(value: number, locale: Locale): string {
  return Number.isFinite(value) ? value.toLocaleString(intlLocale(locale)) : '?';
}

function range(set: Pick<SetSpec, 'min' | 'max'>, locale: Locale): string {
  return set.min === set.max ? count(set.min, locale) : `${count(set.min, locale)}–${count(set.max, locale)}`;
}

function pctOf(set: SetSpec): number {
  return isFullLoad(set) ? 100 : (set.loadPct as number);
}

/** Yüzde yalnız ağırlıklı harekette anlamlı (PT'nin yazımıyla aynı kural). */
function effective(sets: readonly SetSpec[], trackingType: TrackingType): SetSpec[] {
  return trackingType === 'weight_reps' ? [...sets] : sets.map(({ loadPct: _pct, ...rest }) => rest);
}

type Unit = 'reps' | 'seconds' | 'minutes';

/** Setlerin kendisi: sayı, tekrar (ya da saniye) ve "yapabildiğin kadar". */
function setsPhrase(list: readonly SetSpec[], unit: Unit, locale: Locale): string {
  const t = clientWorkoutMessages(locale);
  const text = t.setText;
  const unitOf = (value: number) => t.units[unit](value);
  const n = list.length;
  const first = list[0] as SetSpec;
  const shape = setShape(list);

  if (shape.kind === 'straight') {
    if (n === 1) return first.amrap ? text.oneAmrap(count(first.min, locale), unitOf(first.min)) : text.one(range(first, locale), unitOf(first.max));
    if (shape.amrap === 'all') return text.allAmrap(n, count(n, locale), count(first.min, locale), unitOf(first.min));
    const base = text.straight(n, count(n, locale), range(first, locale), unitOf(first.max));
    if (shape.amrap === 'last') return text.lastAmrap(base);
    if (shape.amrap === 'some') return text.someAmrap(base, list.flatMap((set, index) => (set.amrap ? [index + 1] : [])));
    return base;
  }

  // Setler farklı: tek tek sayılır; birim son düz setin arkasına bir kez yazılır.
  const lastPlain = list.reduce((last, set, index) => (set.amrap ? last : index), -1);
  const items = list.map((set, index) => {
    if (!set.amrap) return index === lastPlain ? `${range(set, locale)} ${unitOf(set.max)}` : range(set, locale);
    return text.amrapAt(index === n - 1 ? 'last' : index + 1, count(set.min, locale), lastPlain < 0 ? unitOf(set.min) : '');
  });
  return text.mixed(n, count(n, locale), items);
}

/** Yükün seyri, yüzdesiz: piramit, back-off ya da serbest yüzdeler. Düz sette yok. */
function loadPhrase(list: readonly SetSpec[], locale: Locale): string | null {
  const text = clientWorkoutMessages(locale).setText;
  const shape = setShape(list);
  const pcts = list.map(pctOf);
  if (shape.kind === 'pyramid') return text.pyramid;
  if (shape.kind === 'backoff') return text.backoff(count(100 - (pcts[1] as number), locale));
  if (pcts.some((pct) => pct < 100)) return text.percents(pcts.map((pct) => count(pct, locale)));
  return null;
}

/**
 * Bir satırın setleri danışana. `restSeconds` yalnız tek harekette verilir (setler arası); grupta
 * dinlenme grubun başlığında anlatılır. Kardiyoda mesafe ve eğim de ("1 set: 30 dk · 3 km · %5").
 */
export function clientSetText(
  sets: readonly SetSpec[],
  trackingType: TrackingType,
  restSeconds?: number,
  cardio: CardioKind | null = null,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const list = timedSets(effective(sets, trackingType), cardio);
  if (list.length === 0) return '';
  const unit: Unit = cardio === 'walk' ? 'minutes' : trackingType === 'duration' ? 'seconds' : 'reps';
  const text = clientWorkoutMessages(locale).setText;
  const rest = restSeconds === undefined ? null : restSeconds > 0 ? text.rest(formatRest(restSeconds, locale)) : text.noRest;
  return [setsPhrase(list, unit, locale), ...cardioTargetParts(list, locale), loadPhrase(list, locale), rest].filter(Boolean).join(' · ');
}
