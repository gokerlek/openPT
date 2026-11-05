import { DEFAULT_LOCALE, type Locale } from '../../i18n/locale.ts';
import { measurementsMessages } from '../../i18n/messages/measurements/index.ts';
import {PROTOCOLS,type PoseTask} from './protocols.ts';
/** Hareket yönergeleri okuyanın dilinde. */
export function movementCues(locale:Locale=DEFAULT_LOCALE):Record<PoseTask,{start:string;away:string;back:string}>{return measurementsMessages(locale).camera.cues;}
/** Türkçe yönergeler (eski çağrılar); arayüz `movementCues(locale)` kullanır. */
export const MOVEMENT_CUES:Record<PoseTask,{start:string;away:string;back:string}>=movementCues('tr');
/** Açıların açıklaması okuyanın dilinde. */
export function metricExplanations(locale:Locale=DEFAULT_LOCALE):Record<string,string>{return measurementsMessages(locale).camera.explanations;}
export const METRIC_EXPLANATIONS:Record<string,string>=metricExplanations('tr');
export function measurementMeaning(task:PoseTask,locale:Locale=DEFAULT_LOCALE):string{
 const meaning=measurementsMessages(locale).camera.meaning;
 return PROTOCOLS[task].dynamic?meaning.dynamic:meaning.static;
}
