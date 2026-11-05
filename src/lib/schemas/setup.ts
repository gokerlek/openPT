import * as v from 'valibot';
import { setupMessages } from '../../i18n/messages/setup/index.ts';
import { msg } from '../../i18n/valibot.ts';
import { appConfigSchema } from './config.ts';

/**
 * Kurulum sihirbazı formu — şema hem formda hem sunucuda kullanılır.
 *
 * `setupCompleted` ve `logo` formda yok: ilki sunucuda işaretlenir, logo ayrı yükleme ucundan gelir.
 */
export const setupFormSchema = v.object({
  appName: appConfigSchema.entries.appName,
  /** null = temanın kendi ana rengi (koyu ve açık mod için ayrı ayarlı); hiçbir şey ezilmez. */
  accent: v.nullable(v.pipe(v.string(), v.regex(/^#[0-9a-fA-F]{6}$/, msg((l) => setupMessages(l).colors.hexInvalid)))),
  theme: appConfigSchema.entries.theme,
  radius: appConfigSchema.entries.radius,
  palette: appConfigSchema.entries.palette,
  /**
   * Sihirbazda tarayıcının saat dilimi, Ayarlar'da seçilen. Yoksa kayıtlı değer kalır. IANA adı olup olmadığına
   * `saveAppearance` bakar (`isTimeZone`): geçersizse hata vermez, kayıtlı (ilk kurulumda varsayılan) değer kalır.
   */
  timeZone: v.optional(v.string()),
});

export type SetupForm = v.InferOutput<typeof setupFormSchema>;

/**
 * Hazır palet. İlk seçenek (`null`) temanın kendi rengidir; diğerleri onu ezer.
 * Üstündeki yazı rengi ve yüzey üstü tonları her seçimde kontrasta göre hesaplanır (src/lib/color.ts).
 *
 * Grafit, eski "Kireç"in (#E5E5E5) yerine: açık temada `bg-primary` düğmesi beyazdan 1,26:1'le
 * seçilmiyordu. #71717A iki temada da bütün yüzeylerden ≥3:1 ayrılır, üstündeki yazı ≥4,5:1.
 * Kireç'i kaydetmiş kurulum bozulmaz: `accent` listeye değil #RRGGBB biçimine bağlıdır, renk
 * aynen uygulanır ve türevleri yine okunur; ayarlarda hiçbir kutu seçili görünmez, PT yenisini seçer.
 */
export const ACCENT_PRESETS: readonly { value: string | null; label: string }[] = [
  { value: null, label: 'Tema' },
  { value: '#7DF9C7', label: 'Nane' },
  { value: '#38BDF8', label: 'Gökyüzü' },
  { value: '#A78BFA', label: 'Lavanta' },
  { value: '#FB7185', label: 'Gül' },
  { value: '#FBBF24', label: 'Kehribar' },
  { value: '#F97316', label: 'Turuncu' },
  { value: '#71717A', label: 'Grafit' },
];
