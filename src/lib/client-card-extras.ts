import { DEFAULT_LOCALE, type Locale } from '../i18n/locale.ts';
import { ptShellMessages } from '../i18n/messages/pt-shell/index.ts';
import { ATTENTION_TUNING, attentionItems, type AttentionFacts } from './attention.ts';
import type { AccessState } from './client-status.ts';
import { getFormat } from './format.ts';
import type { ClientStatus } from './schemas/client.ts';

/**
 * Danışan listesindeki kartın alt satırı (`dashboard/clients/page.tsx`), saf: dikkat maddelerinin sayısı (biri
 * kırmızıysa `urgent`) ve son antrenman günü. Genel bakış'la aynı danışan özetlerinden gelir; özeti olmayan,
 * kaydı okunamayan ya da arşivdeki danışanda yok.
 */
export type CardExtras = { attention: { count: number; urgent: boolean }; lastWorkout: string | null };

/** Listedeki satırın gerekeni: `access` giriş durumu (kayıt okunamadıysa null). */
export type CardExtrasRow = { id: string; ok: boolean; status: ClientStatus; access: AccessState | null };

/**
 * Son antrenman günü (özetteki son 35 gün): "Son antrenman 23 Eki". O günlerde antrenman yoksa yalnız
 * `expected` iken söylenir: danışan aktif ve giriş yapmış (duraklatılmışta ya da daveti bekleyende antrenman
 * beklenmez).
 */
export function lastWorkoutText(facts: Pick<AttentionFacts, 'sessionDays'>, expected: boolean, locale: Locale = DEFAULT_LOCALE): string | null {
  const t = ptShellMessages(locale).cardExtras;
  const format = getFormat(locale);
  // Özet günleri sıralı tutar; yine de en büyüğü alınır.
  const last = facts.sessionDays.reduce<string | null>((latest, day) => (latest === null || day > latest ? day : latest), null);
  if (last) return t.lastWorkout(format.dayShort(last));
  return expected ? t.noWorkout(ATTENTION_TUNING.sessionDaysKept, format.number(ATTENTION_TUNING.sessionDaysKept)) : null;
}

/**
 * Kartların alt satırları, danışan kimliğine göre. Yalnız sayı gösterilir: maddelerin metnindeki hareket adı
 * gerekmez, kütüphane okunmaz. Giriş yapmış sayılır: `joined` ya da (eski kayıtta) kullanılmış davet.
 */
export function clientCardExtras(
  rows: readonly CardExtrasRow[],
  facts: ReadonlyMap<string, AttentionFacts>,
  ctx: { now: Date; timeZone: string; locale?: Locale },
): Record<string, CardExtras> {
  const locale = ctx.locale ?? DEFAULT_LOCALE;
  const itemCtx = { now: ctx.now, timeZone: ctx.timeZone, titleOf: (exerciseId: string) => exerciseId, locale };
  return Object.fromEntries(
    rows.flatMap((row): [string, CardExtras][] => {
      const attention = row.ok && row.status !== 'archived' ? facts.get(row.id) : undefined;
      if (!attention) return [];
      const items = attentionItems(attention, itemCtx);
      const joined = row.access === 'joined' || row.access === 'used';
      return [
        [
          row.id,
          {
            attention: { count: items.length, urgent: items.some((item) => item.tone === 'danger') },
            lastWorkout: lastWorkoutText(attention, row.status === 'active' && joined, locale),
          },
        ],
      ];
    }),
  );
}
