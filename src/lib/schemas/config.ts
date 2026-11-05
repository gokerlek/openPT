import * as v from 'valibot';
import { setupMessages } from '../../i18n/messages/setup/index.ts';
import { msg } from '../../i18n/valibot.ts';
import { paletteSchema } from '../theme-palette.ts';

/**
 * Uygulama ayarı şeması — sunucu ve istemci ORTAK kullanır.
 *
 * Bilerek saf: `server-only` bağımlılığı yok. Okuma/yazma işi `@/lib/config`
 * içinde (yalnız sunucu); şema burada durur ki formlar da aynı kuralı uygulasın.
 */

export const CONFIG_PATH = 'pulsecoach.config.json';

/**
 * Köşe yuvarlaklığı seçenekleri. Tema tek bir `--radius` değişkeni kullanır;
 * bütün bileşenlerin köşeleri bundan türer (sm = ×0.6, xl = ×1.4 ...). `label` Türkçe (eski çağrılar); arayüz
 * adı `setupMessages(locale).radius[key]`'den alır.
 */
export const RADIUS_OPTIONS = {
  sharp: { label: setupMessages('tr').radius.sharp, value: '0rem' },
  subtle: { label: setupMessages('tr').radius.subtle, value: '0.45rem' },
  round: { label: setupMessages('tr').radius.round, value: '0.75rem' },
  soft: { label: setupMessages('tr').radius.soft, value: '1rem' },
} as const;

export type RadiusKey = keyof typeof RADIUS_OPTIONS;
const RADIUS_KEYS = Object.keys(RADIUS_OPTIONS) as [RadiusKey, ...RadiusKey[]];

export const appConfigSchema = v.object({
  /** Kurulum sihirbazında PT'nin verdiği ad; sekmede, giriş ekranında, PWA kısayolunda görünür. */
  appName: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, msg((l) => setupMessages(l).validation.appNameRequired)),
    v.maxLength(40, msg((l) => setupMessages(l).validation.appNameMax)),
  ),
  /** Uygulama repo'sundaki logo yolu; yoksa harf işareti kullanılır. */
  logo: v.nullable(v.string()),
  /** Vurgu rengi; null ise tokenlardaki volt kalır. */
  accent: v.nullable(v.pipe(v.string(), v.regex(/^#[0-9a-fA-F]{6}$/, msg((l) => setupMessages(l).colors.hexInvalid)))),
  theme: v.picklist(['dark', 'light', 'system']),
  /** Eski kurulumlarda yok: varsayılan temanınki (hafif). */
  radius: v.optional(v.picklist(RADIUS_KEYS, msg((l) => setupMessages(l).validation.radius)), 'subtle'),
  palette: v.optional(v.nullable(paletteSchema)),
  timeZone: v.pipe(v.string(), v.minLength(1)),
  setupCompleted: v.boolean(),
});

export type AppConfig = v.InferOutput<typeof appConfigSchema>;

export const defaultConfig: AppConfig = {
  appName: 'openPT',
  logo: null,
  accent: null,
  theme: 'dark',
  radius: 'subtle',
  timeZone: 'Europe/Istanbul',
  setupCompleted: false,
};
