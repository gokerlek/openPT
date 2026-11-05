/**
 * Uygulamanın kabuğu: kök düzen ve manifest açıklamaları, hata ve "sayfa yok" ekranları, ağ yok sayfası, kurulum
 * bekleyen uçların mesajı (`proxy.ts`), Ayarlar sekmeleri ve dil seçici.
 */
const tr = {
  /** Kök düzenin açıklaması ve danışan manifest'i. Uygulama adı PT'nin markası, çevrilmez. */
  appDescription: (appName: string) => `${appName} — antrenman takibi`,
  /** Panel manifest'i. */
  panelDescription: (appName: string) => `${appName} — antrenör paneli`,
  error: {
    title: 'Sayfa yüklenemedi',
    description: 'Veriler şu an okunamadı. Biraz sonra tekrar dene.',
    retry: 'Tekrar dene',
  },
  notFound: {
    title: 'Böyle bir sayfa yok',
    description: 'Adres yanlış yazılmış ya da kayıt silinmiş olabilir.',
  },
  /** "Sayfa yok" ekranının dönüş bağlantısı (`notFoundBackLink`). */
  backTo: {
    templates: 'Şablonlara dön',
    exercises: 'Egzersizlere dön',
    devices: 'Cihazlara dön',
    attachments: 'Aparatlara dön',
    clients: 'Danışanlara dön',
    overview: 'Genel bakışa dön',
    home: 'Ana sayfaya dön',
  },
  /** Kurulum bitmeden `/api` isteği (`proxy.ts`, 503). */
  setupRequired: 'Kurulum tamamlanmalı.',
  /** `/offline` (`lib/offline-page.ts`). */
  offline: {
    title: 'Bağlantı yok',
    body: 'Sayfa internete bağlanınca açılır. Antrenmanda girilen setler telefonda durur, bağlantı gelince gönderilir.',
    retry: 'Yeniden dene',
  },
  /** Ayarlar bölümünün sekmeleri (`settingsSections`). */
  settingsSections: {
    appearance: 'Görünüm',
    ai: 'Yapay zekâ',
    updates: 'Sürüm',
    app: 'Uygulama',
  },
  /** Dil seçici (`i18n/locale-switch.tsx`); dillerin adları çevrilmez (`LOCALE_NAMES`). */
  language: {
    label: 'Dil',
    hint: 'Uygulamanın bu tarayıcıdaki dili. Programlar, notlar ve adlar yazıldığı dilde kalır.',
  },
};

export default tr;
