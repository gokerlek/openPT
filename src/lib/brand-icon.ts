/**
 * Marka simgesinin (`/api/brand/app-icon`) ölçüleri; iki manifest (danışan `app/manifest.ts`, panel
 * `app/panel.webmanifest/route.ts`) ve iPhone ana ekran simgesi (`apple-touch-icon`, kök düzen) aynı simgeyi
 * kullanır.
 *
 * Android maskelenebilir (maskable) simgeyi daire, damla ya da yuvarlak kare biçiminde kırpar; yalnız merkezdeki
 * yarıçapı simgenin %40'ı olan daire her biçimde görünür. İşaret bu dairenin içinde kalır (`brand-icon.test.ts`
 * denetler): logo %56'lık kareye sığdırılır (köşesi merkezden %39,6), nabız çizgisi %70 genişlikte (ucu %35,6).
 */
export const MASKABLE_SAFE_RADIUS = 0.4;

/** Logonun sığdırıldığı kare, simge kenarına oranla. */
export const LOGO_SCALE = 0.56;

/** Logo yokken çizilen nabız çizgisinin genişliği ve kutusunun yüksekliği, simge kenarına oranla. */
export const PULSE_SCALE = 0.7;
export const PULSE_BOX_HEIGHT = 0.4;

/** Nabız çizgisinin `viewBox` genişliği ve çizgi kalınlığı (aynı birimde). */
export const PULSE_VIEWBOX_WIDTH = 240;
export const PULSE_STROKE_WIDTH = 4;

/** Çizgi kalınlığı, simge kenarına oranla (yuvarlak uç çizgiyi yarım kalınlık kadar uzatır). */
export const PULSE_STROKE = (PULSE_STROKE_WIDTH / PULSE_VIEWBOX_WIDTH) * PULSE_SCALE;

/** Sunulan boylar: 180 iPhone ana ekranı, 192 ve 512 Android ve masaüstü kurulumu. */
const SIZES = [180, 192, 512] as const;
const MANIFEST_SIZES = [192, 512] as const;

/** `?size=` değeri bilinen bir boy mu; değilse null. */
export function appIconSize(param: string | null): number | null {
  const size = SIZES.find((value) => String(value) === param);
  return size ?? null;
}

/** Manifest'in `icons` listesi: her boy hem "any" hem "maskable" (aynı görüntü, işaret güvenli alanda). */
export function manifestIcons(): { src: string; sizes: string; type: string; purpose: 'any' | 'maskable' }[] {
  return MANIFEST_SIZES.flatMap((size) =>
    (['any', 'maskable'] as const).map((purpose) => ({
      src: `/api/brand/app-icon?size=${size}`,
      sizes: `${size}x${size}`,
      type: 'image/png',
      purpose,
    })),
  );
}
