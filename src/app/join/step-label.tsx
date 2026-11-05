'use client';

import { useMessages } from '@/i18n/client';
import { authMessages } from '@/i18n/messages/auth';
import { useInstall } from '@/components/install/install-state';
import { joinStepTotal } from './join-steps';

/**
 * "Adım 1 / 3": toplam, yükleme adımı gösterilecek mi ona göre (`join-steps.ts`). Uygulama olarak açıksa
 * "/ 2"; cihaz bilinene kadar (sunucu, ilk çizim) "/ 3".
 */
export function JoinStepLabel({ step }: { step: number }) {
  const { state } = useInstall();
  const t = useMessages(authMessages).join;
  return t.stepLabel(step, joinStepTotal(state?.guide ?? null));
}
