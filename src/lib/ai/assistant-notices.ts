import { DEFAULT_LOCALE, type Locale } from '../../i18n/locale.ts';
import { coachMessages } from '../../i18n/messages/coach/index.ts';
import * as v from 'valibot';
import { assistantStoreSchema } from './assistant-contract.ts';
import type { OwnIndex } from '../own-program-index.ts';
import { NOTICE_WINDOW_DAYS, type PtNotice } from '../notices.ts';
// Dil yalnız parametreden gelir, çerez okunmaz: `notices-store.ts` bunu `unstable_cache` içindeki özette (`readClientDigest`,
// anahtarında `locale` var) özetin diliyle çağırır.
export function assistantNotices(raw: unknown, permissionHash: string, own: OwnIndex | null, now: Date, locale: Locale = DEFAULT_LOCALE): PtNotice[] {
  const parsed = v.safeParse(assistantStoreSchema, raw); if (!parsed.success) return [];
  return parsed.output.drafts.flatMap(draft => {
    const item = own?.items.find(i => i.id === draft.programId && i.shared);
    if (!item || (item.clientEditedAt && draft.savedAt && item.clientEditedAt > draft.savedAt) || (item.ptEditedAt && draft.savedAt && item.ptEditedAt > draft.savedAt) || draft.savedBy !== 'client' || draft.permissionHash !== permissionHash || !draft.savedAt || now.getTime() - Date.parse(draft.savedAt) > NOTICE_WINDOW_DAYS * 86400000) return [];
    return draft.attention.length ? [{ key: `ai:${draft.id}`, kind: 'own_program' as const, at: draft.savedAt, text: coachMessages(locale).notices.aiProgram(draft.name, draft.attention.join(' ')), target: 'program' as const }] : [];
  });
}
