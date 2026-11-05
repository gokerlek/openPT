import { Badge } from '@/components/ui/badge';
import { accessState, hasNewDeviceCode, passwordState, type AccessState } from '@/lib/client-status';
import { DEFAULT_LOCALE, type Locale } from '@/i18n/locale';
import { ptClientsMessages } from '@/i18n/messages/pt-clients';
import { getFormat } from '@/lib/format';
import type { Client, Invite } from '@/lib/schemas/client';

/**
 * Danışanın giriş durumu: listede, detayda ve davet ekranında aynı adla. `password` verilirse
 * katılmış danışanda tek satırda şifre de söylenir ("Katıldı · şifre belirledi" / "Katıldı ·
 * şifresi yok" / "Katıldı · çok sayıda yanlış deneme"): şifresi olmayan ya da şifre girişi kapanan
 * danışan çıkış yaparsa yeniden girmek için yeni kare kod gerekir (SPEC §5). `locale`: rozetin dili
 * (sunucu sayfası `getLocale()`, istemci `useLocale()` verir); yoksa Türkçe.
 */
export function AccessBadge({
  state,
  password,
  locale = DEFAULT_LOCALE,
}: {
  state: AccessState;
  password?: ReturnType<typeof passwordState>;
  locale?: Locale;
}) {
  const t = ptClientsMessages(locale).access;
  const joined = state === 'joined' || state === 'used';
  const variant =
    joined && password === 'locked'
      ? 'destructive'
      : joined
        ? 'secondary'
        : state === 'pending' || state === 'none'
          ? 'outline'
          : 'destructive';
  const label = joined && password ? t.badge(t[state], t.password[password]) : t[state];
  return <Badge variant={variant}>{label}</Badge>;
}

export function accessOf(client: Client, invite: Invite | null, now = new Date()): AccessState {
  return accessState(client.access, invite, now);
}

/** Rozetin şifre bilgisi: kayıttaki anlardan (şifrenin kendisi değil). */
export function passwordOf(client: Client): ReturnType<typeof passwordState> {
  return passwordState(client.access);
}

export function accessDetail(client: Client, invite: Invite | null, timeZone: string, now = new Date(), locale: Locale = DEFAULT_LOCALE): string {
  const t = ptClientsMessages(locale).access;
  const { dateTime } = getFormat(locale);
  const { access } = client;
  const state = accessState(access, invite, now);
  switch (state) {
    case 'joined':
      return t.joinedDetail(
        passwordState(access),
        access.loginLockedAt ? dateTime(access.loginLockedAt, timeZone) : '',
        dateTime(access.joinedAt ?? access.lastJoinAt!, timeZone),
        hasNewDeviceCode(access, invite, now) ? dateTime(invite!.expiresAt, timeZone) : null,
      );
    case 'revoked':
      return t.revokedDetail(dateTime(access.revokedAt!, timeZone));
    case 'used':
      return t.usedDetail(invite?.usedAt ? dateTime(invite.usedAt, timeZone) : null);
    case 'none':
      return t.noneDetail;
    case 'pending':
      return t.pendingDetail(dateTime(invite!.expiresAt, timeZone));
    case 'expired':
      return t.expiredDetail;
    case 'locked':
      return t.lockedDetail;
  }
}
