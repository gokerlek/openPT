import { DEFAULT_LOCALE, type Locale } from '../i18n/locale.ts';
import { ptShellMessages } from '../i18n/messages/pt-shell/index.ts';
import { getFormat } from './format.ts';
import { minutesText } from './workout-summary.ts';

/**
 * PT'nin canlı görünümünün metinleri ve sayaçları (tasarım §4.6, §8 satır 12; SPEC §7) — saf, tarayıcıda da
 * çalışır. Açık antrenmanın okunması `live-session.ts` (saf) ve `live-store.ts`'te (GitHub).
 */

/** Açık antrenman bu aralıkla tazelenir (SPEC §7: "10 sn'de bir"); sekme görünmezken durur. */
export const LIVE_POLL_MS = 10_000;
/** Kimse çalışmıyorken yeni başlayan antrenmanı yakalamak için daha seyrek **[sentez]**. */
export const LIVE_IDLE_POLL_MS = 60_000;
/** Genel bakış'ın "Şu an antrenmanda" listesi (bütün danışanlar): daha seyrek (SPEC §7) **[sentez]**. */
export const LIVE_OVERVIEW_POLL_MS = 60_000;

/** Açık antrenmanın özeti: PT'nin satırı "Şu an antrenmanda · Gün A · 7/17 set · son set 2 dk önce". */
export type LiveSession = {
  sessionId: string;
  dayName: string;
  /** Yapılan çalışma seti (planın satırlarında plandan fazlası sayılmaz). */
  done: number;
  /** Planlanan çalışma seti; gün programda bulunamazsa null. */
  planned: number | null;
  startedAt: string;
  /** Son setin yapıldığı an; henüz set yoksa null. */
  lastSetAt: string | null;
  /** Dosyanın son yazımı (commit). */
  updatedAt: string;
};

/** Genel bakış'ın "Şu an antrenmanda" satırı: danışanın kimliği ve adıyla. */
export type LiveClient = LiveSession & { clientId: string; name: string };

/** `GET /api/clients/[id]/live`: `checkedAt` sunucunun anı (göreli metin ona göre: sunucu ve tarayıcı aynı çizer). */
export type LiveResponse = { live: LiveSession | null; checkedAt: string };
/** `GET /api/live`: okunamayan danışanlar sayılır. */
export type LiveOverviewResponse = { items: LiveClient[]; failed: number; checkedAt: string };

/** "az önce", "2 dk önce", "1 sa 5 dk önce". Gelecekteki an (saat farkı) "az önce". */
export function agoText(iso: string, now: Date, locale: Locale = DEFAULT_LOCALE): string {
  const t = ptShellMessages(locale).live;
  const at = Date.parse(iso);
  const minutes = Number.isNaN(at) ? 0 : Math.max(0, Math.floor((now.getTime() - at) / 60_000));
  return minutes < 1 ? t.justNow : t.ago(minutesText(minutes, locale));
}

/** "7/17 set"; plan bilinmiyorsa "7 set". */
export function liveSetsText(live: Pick<LiveSession, 'done' | 'planned'>, locale: Locale = DEFAULT_LOCALE): string {
  const { number } = getFormat(locale);
  return ptShellMessages(locale).live.sets(live.done, number(live.done), live.planned !== null ? number(live.planned) : null);
}

/** "son set 2 dk önce"; henüz set yoksa "başladı 3 dk önce". */
export function liveLastText(live: Pick<LiveSession, 'lastSetAt' | 'startedAt'>, now: Date, locale: Locale = DEFAULT_LOCALE): string {
  const t = ptShellMessages(locale).live;
  return live.lastSetAt ? t.lastSet(agoText(live.lastSetAt, now, locale)) : t.started(agoText(live.startedAt, now, locale));
}

/** "Gün A · 7/17 set · son set 2 dk önce" (başlık "Şu an antrenmanda" ayrı yazılır). */
export function liveDetailText(live: LiveSession, now: Date, locale: Locale = DEFAULT_LOCALE): string {
  return [live.dayName, liveSetsText(live, locale), liveLastText(live, now, locale)].join(' · ');
}

/** Tek satır: "Şu an antrenmanda · Gün A · 7/17 set · son set 2 dk önce". */
export function liveText(live: LiveSession, now: Date, locale: Locale = DEFAULT_LOCALE): string {
  return ptShellMessages(locale).live.line(liveDetailText(live, now, locale));
}
