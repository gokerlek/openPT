import { EMPTY_CARE } from '../constraint-filter.ts';
import { answerCoach } from './coach-engine.ts';

/**
 * Program sekmesinin metni role göre: danışan kendi programını ister ("sen"), PT danışan için taslak hazırlar
 * (danışandan üçüncü kişi olarak söz edilir). Aynı panel iki rolde de açılır (`components/coach/coach-panel.tsx`).
 */
export const PROGRAM_COPY = {
  client: { title: 'Programını hazırlayalım', goal: 'Ne yapmak istiyorsun?', manual: 'Kendim seçeyim', muscles: 'Çalıştırmak istediğin kasları seç', unclear: 'Hedef netleşmedi. Aşağıdan hedef ve kaslarını seçebilirsin.' },
  pt: { title: 'Danışan için program taslağı', goal: 'Danışanın hedefi ne?', manual: 'Koşulları ben seçeyim', muscles: 'Çalışılacak kasları seç', unclear: 'Hedef netleşmedi. Danışanın hedefini ve çalışılacak kasları aşağıdan seçebilirsin.' },
} as const;

/**
 * Yorumlanmayan hassas hedefin notu. Danışana koçun kendi yanıtı (`answerCoach`: "antrenörüne bildir"); PT'ye
 * metnin neden hedefe çevrilmediği ve elle seçim yolu: danışana yazılmış yanıt PT'ye gösterilmez.
 */
export function sensitiveNotice(intent: 'support' | 'health_question', role: 'pt' | 'client'): string {
  if (role === 'client') return answerCoach({ intent, exerciseIds: [] }, { facts: [], exercises: [], care: EMPTY_CARE, existingExerciseIds: [], healthUnavailable: false, today: '' }).answer;
  return intent === 'support'
    ? 'Metin ceza, telafi ya da yeme kaygısı içeriyor; AI bunu program hedefine çevirmez. Koşulları elle seçerek devam edebilirsin.'
    : 'Metin ağrı, tanı ya da tedavi içeriyor; AI bundan hedef çıkarmaz, tanı ya da tedavi önermez. Koşulları elle seçerek devam edebilirsin.';
}
