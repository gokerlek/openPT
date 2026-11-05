/**
 * Danışan şemasının doğrulama mesajları (`lib/schemas/client.ts`). Ayrı küçük sözlük: şema danışanın telefonundaki
 * istemci modüllerine de girer, PT ekranlarının metni (`pt-clients`) oraya taşınmasın.
 */
const tr = {
  clientId: 'Danışan kimliği geçersiz.',
  number: 'Sayı olmalı.',
  integer: 'Tam sayı olmalı.',
  atLeast: (min: number) => `En az ${min} olmalı.`,
  atMost: (max: number) => `En fazla ${max} olmalı.`,
  nameRequired: 'Ad gir.',
  nameShort: 'Ad çok kısa.',
  maxChars: (max: number) => `En fazla ${max} karakter.`,
  pickExperience: 'Antrenman geçmişini seç.',
  digitsOnly: 'Yalnız rakam girilmeli.',
  heartPair: 'İkisi birlikte girilmeli ya da ikisi de boş bırakılmalı.',
  heartOrder: 'Toparlanma sınırı uyarı sınırından düşük olmalı.',
  pickStatus: 'Durumu seç.',
  pickHealthPart: 'Modül açıksa en az bir parça seç.',
};

export default tr;
