import { DEFAULT_LOCALE, type Locale } from '../../i18n/locale.ts';
import { coachMessages } from '../../i18n/messages/coach/index.ts';
import { EMPTY_CARE } from '../constraint-filter.ts';
import { answerCoach } from './coach-engine.ts';

/**
 * Program sekmesinin metni role göre: danışan kendi programını ister ("sen"), PT danışan için taslak hazırlar
 * (danışandan üçüncü kişi olarak söz edilir). Aynı panel iki rolde de açılır (`components/coach/coach-panel.tsx`).
 */
export function programCopy(locale: Locale = DEFAULT_LOCALE) {
  return coachMessages(locale).programCopy;
}
/** Türkçe metin (eski çağrılar); arayüz `programCopy(locale)` kullanır. */
export const PROGRAM_COPY = programCopy(DEFAULT_LOCALE);

/**
 * Yorumlanmayan hassas hedefin notu. Danışana koçun kendi yanıtı (`answerCoach`: "antrenörüne bildir"); PT'ye
 * metnin neden hedefe çevrilmediği ve elle seçim yolu: danışana yazılmış yanıt PT'ye gösterilmez.
 */
export function sensitiveNotice(intent: 'support' | 'health_question', role: 'pt' | 'client', locale: Locale = DEFAULT_LOCALE): string {
  if (role === 'client') return answerCoach({ intent, exerciseIds: [] }, { facts: [], exercises: [], care: EMPTY_CARE, existingExerciseIds: [], healthUnavailable: false, today: '' }, '', locale).answer;
  const t = coachMessages(locale).sensitive;
  return intent === 'support' ? t.support : t.healthQuestion;
}
