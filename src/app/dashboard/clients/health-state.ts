import type { HealthConsentState } from '@/lib/client-status';
import { DEFAULT_LOCALE, type Locale } from '@/i18n/locale';
import { ptClientsMessages } from '@/i18n/messages/pt-clients';

/** Sağlık modülünün danışan açısından durumu: PT ekranlarında aynı adla. */
export function healthStateLabels(locale: Locale = DEFAULT_LOCALE): Record<HealthConsentState, string> {
  return ptClientsMessages(locale).healthState.labels;
}

export function healthStateDetails(locale: Locale = DEFAULT_LOCALE): Record<HealthConsentState, string> {
  return ptClientsMessages(locale).healthState.details;
}

/** Türkçe metinler (eski çağrılar); arayüz `healthStateLabels(locale)` ve `healthStateDetails(locale)` kullanır. */
export const HEALTH_STATE_LABELS: Record<HealthConsentState, string> = healthStateLabels('tr');

export const HEALTH_STATE_DETAILS: Record<HealthConsentState, string> = healthStateDetails('tr');
