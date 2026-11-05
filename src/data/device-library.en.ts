/**
 * Hazır cihaz kataloğunun İngilizcesi, kimliğe göre (`device-library.ts`). Eksik kimlik ya da alan Türkçesiyle
 * gösterilir (`library-text.ts`). Boş yer tutucu: çeviriler ayrı görevde gelir.
 */
export type DeviceTextEn = { name: string; notes?: string };
export const DEVICE_LIBRARY_EN: Readonly<Record<string, DeviceTextEn>> = {};
