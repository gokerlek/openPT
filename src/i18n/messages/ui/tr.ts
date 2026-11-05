/**
 * Ortak bileşenler (arayüz kiti): `src/components` kökü, `ui`, `list`, `swipe`, `dock`, `muscle-map` ve ana ekrana ekleme
 * yardımcısı (`install`). Düğme ve durum sözcükleri (Sil, Vazgeç, Kapat…) `common` sözlüğünde; burada yalnız bu
 * bileşenlere özgü metin. Sayılar çağıranda `getFormat(locale)` ile yazılmış gelir.
 */
const tr = {
  /** `ConfirmDeleteDialog`: açılır "Ayrıntı" düğmesi. */
  confirm: { details: 'Ayrıntı' },
  /** Kaydedilmemiş değişiklik uyarısı (`unsaved-changes-guard.tsx`). */
  unsaved: {
    title: 'Kaydedilmemiş değişiklikler var',
    stay: 'Kal',
    leave: 'Kaydetmeden çık',
  },
  /** "Geri al" bildirimi (`undo-toast.ts`). */
  undo: {
    action: 'Geri al',
    conflict: 'Sonrasında başka değişiklik yapıldı; geri alınamadı.',
  },
  /** Tarih seçici (`date-picker.tsx`). */
  datePicker: {
    pick: 'Tarih seç',
    month: 'Ay',
    year: 'Yıl',
    nextMonth: 'Sonraki ay',
    previousMonth: 'Önceki ay',
    clear: 'Tarihi temizle',
  },
  /** Haftanın günleri seçicisi (`weekday-toggle.tsx`). */
  weekdays: {
    label: 'Antrenman günleri',
    /** Alınmış gün: günün adı ve onu kullanan programın adı (PT'nin yazdığı). */
    taken: (day: string, owner: string) => `${day}, ${owner} programında`,
  },
  /** Alt gezinme (`dock/dock.tsx`). */
  dock: { soon: (label: string) => `${label} · yakında` },
  /** Taşıma düğmeleri ve tutamaç (`list/move-buttons.tsx`, `exercise-card.tsx`). */
  move: {
    group: (name: string) => `${name}: taşı`,
    up: 'Yukarı taşı',
    down: 'Aşağı taşı',
    drag: 'Sürükleyerek taşı',
  },
  /** Sayfa geçişi çubuğu (`global-loading.tsx`). */
  loading: { page: 'Sayfa yükleniyor', generic: 'Yükleniyor' },
  /**
   * shadcn kitinin ekran okuyucu adları (`components/ui`). `close` ve `spinner` Türkçede de İngilizce kaldı (kitin
   * varsayılanı): Türkçe çıktı değişmesin diye aynen taşındı.
   */
  kit: {
    breadcrumb: 'Sayfa yolu',
    more: 'Daha fazla',
    previousCard: 'Önceki kart',
    nextCard: 'Sonraki kart',
    dialogClose: 'Close',
    spinner: 'Loading',
    decrease: 'Azalt',
    increase: 'Artır',
  },
  /** Kısıt seçici (`condition-picker.tsx`). */
  conditions: {
    regions: {
      spine: 'Omurga',
      neck: 'Boyun',
      shoulder: 'Omuz',
      elbow: 'Dirsek',
      wrist: 'El bileği',
      hip: 'Kalça',
      knee: 'Diz',
      ankle: 'Ayak bileği',
      systemic: 'Genel',
    },
    selected: 'Seçili kısıtlar',
    remove: (name: string) => `${name} kısıtını kaldır`,
    withQualifier: (label: string, qualifier: string) => `${label} (${qualifier})`,
  },
  /** Görsel alanı (`image-field.tsx`). */
  image: {
    label: 'Görsel',
    preview: 'Görsel önizlemesi',
    change: 'Değiştir',
    choose: 'Görsel seç',
    remove: 'Kaldır',
    undo: 'Geri al',
    /** Seçilen dosya kurala uymuyor (`lib/image.ts` → `imageProblem`). `mb`: dosyanın boyutu, okuyanın sayı biçiminde. */
    typeUnsupported: 'Yalnız PNG, JPG ya da WebP seçebilirsin.',
    tooBig: (mb: string) => `Görsel ${mb} MB; en fazla 1 MB olabilir. Daha küçük bir görsel seç.`,
  },
  /** Kas haritası (`muscle-map/*`). */
  muscleMap: {
    sides: { front: 'Ön', back: 'Arka' },
    view: 'Görünüm',
    selectedOther: '(seçili kas var)',
    exercisesCount: (_count: number, name: string, n: string) => `${name} · ${n} egzersiz`,
    exercisesCountLabel: (_count: number, name: string, n: string) => `${name}, ${n} egzersiz`,
    legend: 'Harita açıklaması',
    removeMuscle: (label: string) => `${label} kasını kaldır`,
    sets: (_count: number, n: string) => `${n} set`,
    cardio: 'Kardiyo',
    deepTitle: 'Derin kaslar',
    deepNote: 'Derin kaslar kademe almaz, hacme sayılmaz.',
    deepMax: (max: string) => `En çok ${max} derin kas seçilir.`,
  },
  /** Grafikler (`progress-chart.tsx`, `progress-bars.tsx`). */
  charts: {
    value: 'Değer',
    date: 'Tarih',
    period: 'Dönem',
    total: 'Toplam',
    inProgress: 'Sürüyor',
    inProgressShort: '(sürüyor)',
    forecast: 'Tahmin',
    forecastShort: '(tahmin)',
    forecastBand: 'Tahmin ve olası aralık',
    showTable: 'Değerleri tablo olarak göster',
    /** Noktaların adı, sayıya göre (`countLine`); Türkçede sayıdan sonra hep tekil. */
    defaultNoun: { one: 'ölçüm günü', other: 'ölçüm günü' },
    /** Ekran okuyucu özeti: "Başlık: 12 ölçüm günü." ve çubuk grafikte son dönem ile ortalama. */
    countLine: (title: string, _count: number, n: string, noun: { one: string; other: string }) => `${title}: ${n} ${noun.one}.`,
    barLast: (label: string, value: string, partial: boolean) => `Son: ${label} ${value}${partial ? ' (sürüyor)' : ''}.`,
    barAverage: (value: string) => `Ortalama ${value}.`,
    /** Çizgi grafikte son değer (`series`: iki seride serinin adı) ve tahmin. */
    lineLatest: (series: string | null, value: string, date: string) => `${series ? `${series} son değer` : 'Son değer'} ${value}, ${date}`,
    lineForecast: (date: string, value: string, band: string) => `Tahmin ${date}: ${value}${band}.`,
    /** Olası aralık: "(82,1–86,3 cm)", yüzdede "(%8–%12)". */
    band: (from: string, to: string, unit: string) => (unit === '%' ? ` (%${from}–%${to})` : ` (${from}–${to} ${unit})`),
  },
  /** Ana ekrana ekleme yardımcısı (`install/install-helper.tsx`). */
  installHelper: {
    client: {
      title: 'Uygulamayı ana ekrana ekle',
      description: 'Antrenmanın tek dokunuşla, tarayıcı çubuğu olmadan tam ekran açılır.',
      installed: 'Uygulama bu telefonda ana ekrandan açık.',
    },
    pt: {
      title: 'Panel uygulaması',
      description: 'Panel telefonda ya da bilgisayarda ayrı simgeyle, tarayıcı çubuğu olmadan açılır.',
      installed: 'Panel bu cihazda uygulama olarak açık.',
    },
    notNow: 'Şimdi değil',
    installedBadge: 'Yüklü',
    install: 'Uygulamayı yükle',
    stepsLabel: 'Ana ekrana ekleme adımları',
    /** Safari adımları; paylaş simgesi ve üç nokta ikonu cümlenin içinde. */
    iosShare: { before: '', bold: 'Paylaş', after: ' simgesi (kare ve yukarı ok)' },
    iosHidden: { before: 'Görünmüyorsa önce ', icon: 'üç nokta', after: ' menüsü' },
    iosAdd: 'Ana Ekrana Ekle',
    iosAddHint: 'Listede yoksa aşağı kaydırınca çıkar',
    iosConfirm: 'Ekle',
    iosTopRight: { before: 'Sağ üstte ', bold: 'Ekle' },
    macSafari: { before: 'Safari’nin menü çubuğunda ', file: 'Dosya', arrow: ' → ', dock: 'Dock’a Ekle', after: '.' },
    menu: { before: 'Tarayıcının menüsünden ', add: 'Ana ekrana ekle', or: ' ya da ', install: 'Uygulamayı yükle', after: ' seçilir.' },
    copied: 'Bağlantı kopyalandı.',
    copyFailed: 'Kopyalanamadı. Aşağıdaki bağlantı elle seçilebilir.',
    needSafari: "Ana ekrana ekleme Safari'den yapılır; bu sayfa Safari'de açılmalı.",
    needChrome: "Sayfa bir uygulamanın içinde açık; yükleme Chrome'dan yapılır.",
    openSafari: "Safari'de aç",
    openChrome: "Chrome'da aç",
    copyLink: 'Bağlantıyı kopyala',
  },
};

export default tr;
