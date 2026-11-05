/**
 * Ortak sözcükler: her alanın düğmeleri, durumları, genel hata mesajları, zaman ve birim kısaltmaları. Bir alana
 * özgü metin kendi sözlüğüne girer; buraya yalnız birden çok alanın aynı anlamda kullandığı sözcük.
 */
const tr = {
  actions: {
    save: 'Kaydet',
    saving: 'Kaydediliyor…',
    saved: 'Kaydedildi',
    cancel: 'Vazgeç',
    delete: 'Sil',
    deleting: 'Siliniyor…',
    edit: 'Düzenle',
    add: 'Ekle',
    create: 'Oluştur',
    close: 'Kapat',
    back: 'Geri',
    next: 'İleri',
    continue: 'Devam',
    done: 'Tamam',
    retry: 'Tekrar dene',
    undo: 'Geri al',
    search: 'Ara',
    clear: 'Temizle',
    select: 'Seç',
    remove: 'Kaldır',
    copy: 'Kopyala',
    copied: 'Kopyalandı',
    share: 'Paylaş',
    resetToDefault: 'Varsayılana dön',
    showAll: 'Tümünü göster',
    showLess: 'Daha az göster',
    more: 'Daha fazla',
  },
  states: {
    loading: 'Yükleniyor…',
    noResults: 'Sonuç yok',
    notSpecified: 'Belirtilmedi',
    none: 'Yok',
    optional: 'İsteğe bağlı',
    yes: 'Evet',
    no: 'Hayır',
    on: 'Açık',
    off: 'Kapalı',
    all: 'Tümü',
    new: 'Yeni',
  },
  errors: {
    unexpected: 'Beklenmeyen bir hata oldu.',
    network: 'Bağlantı kurulamadı. İnternetini kontrol et.',
    saveFailed: 'Kaydedilemedi',
    submitFailed: 'Form gönderilemedi',
    readFailed: 'Kayıt okunamadı',
    /** `fetchJson`'ın sunucu mesajı yokken kullandığı mesajlar (`lib/query/errors.ts`). */
    status: {
      401: 'Oturumun düşmüş. Yeniden giriş yap.',
      403: 'Bu işlem için yetkin yok.',
      404: 'Aradığın kayıt bulunamadı.',
      409: 'Bu kayıt sen çalışırken değişti. Tekrar dene.',
      429: 'Çok fazla istek gönderildi. Biraz bekle.',
    },
  },
  /** Yakın an (`getFormat(locale).recent`): "az önce", "5 dakika önce", "bugün 14:05", "dün 14:05". */
  time: {
    justNow: 'az önce',
    minutesAgo: (minutes: number) => `${minutes} dakika önce`,
    todayAt: (time: string) => `bugün ${time}`,
    yesterdayAt: (time: string) => `dün ${time}`,
    today: 'Bugün',
    yesterday: 'Dün',
    tomorrow: 'Yarın',
  },
  /** Ekranda yazılan birim kısaltmaları (kayıttaki birim kodu değil). */
  units: {
    kg: 'kg',
    cm: 'cm',
    seconds: 'sn',
    minutes: 'dk',
    hours: 'sa',
    bpm: 'atım/dk',
    kcal: 'kcal',
  },
};

export default tr;
