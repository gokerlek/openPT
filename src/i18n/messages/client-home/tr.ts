/**
 * Danışanın Bugün sekmesi, kabuğu ve sağlık ekranları (`me/layout`, `me/(sekmeler)/page`, Bugün kartları, Ayarlar,
 * Sağlık, Ölçüm; `lib/client-tabs`, `check-in-routes`, `me-constraint-routes`, `water`, `pain-report`).
 */
const tr = {
  /** Sekme değişirken iskeletin ekran okuyucu metni. */
  pageLoading: 'Sayfa yükleniyor…',
  /** Ayarlar sayfası (`me/(sekmeler)/ayarlar`). */
  settings: {
    title: 'Ayarlar',
    healthTracking: 'Sağlık takibi',
    healthOff: 'Kapalı: antrenörün sağlık takibini açmadı, sağlık kaydı tutulmuyor.',
    password: 'Şifre',
    passwordSet: 'Şifren belirli. Unutursan ya da değiştirmek istersen antrenörüne söyle: yeni kare kodla girip yeni şifreni belirlersin.',
    passwordNone: 'Şifre belirlemek için antrenöründen yeni bir kare kod iste.',
  },
  /** Hesap menüsü ve çıkış (`client-menu.tsx`, `logout-dialog.tsx`). */
  menu: {
    account: 'Hesap menüsü',
    settings: 'Ayarlar',
    signOut: 'Çıkış yap',
    signOutQuestion: 'Çıkış yapılsın mı?',
    signOutWithPassword: 'Tekrar girmek için şifren gerekir; şifreni unuttuysan antrenörüne söyle.',
    signOutWithoutPassword:
      "Henüz şifre belirlemedin: tekrar girmek için antrenöründen yeni bir kare kod istemen gerekir. İstersen önce Ayarlar'dan şifre belirle.",
    cancel: 'Vazgeç',
  },
  /** Şifre kartı (`password-card.tsx`). */
  password: {
    resetTitle: 'Yeni şifreni belirle',
    title: 'Bir dahaki girişin için şifre belirle',
    resetText: 'Yeni kare kodla girdin; eski şifren artık açmaz. Yeni şifreni belirle.',
    text: 'Şifren olmazsa çıkış yapınca yeniden girmek için antrenöründen yeni kare kod istemen gerekir.',
    save: 'Şifreyi kaydet',
    saved: 'Şifren kaydedildi.',
    set: 'Şifre belirle',
  },
  /** Program önerilerinin sonuçları (`proposal-outcomes.tsx`). */
  proposals: {
    title: 'Program önerilerin',
    text: 'Antrenman bitişinde antrenörüne gönderdiğin değişiklikler.',
    pending: (count: string, _n: number) => `Antrenörünün onayında: ${count} öneri`,
  },
  /** Antrenman günleri kartı (`training-days-card.tsx`). */
  trainingDays: {
    title: 'Antrenman günleri',
    none: 'Henüz gün atanmadı.',
    byPt: 'Günleri antrenörün belirliyor.',
    edit: 'Düzenle',
  },
  /** Bugün sayfası. */
  home: {
    title: 'Bugün',
    greeting: (name: string) => `Merhaba, ${name}`,
    mainMenu: 'Ana menü',
    careNote: ', kısıt notu var',
  },
  /** Bugün'ün program kartı (`program-card.tsx`). */
  card: {
    todaysWorkout: 'Bugünün antrenmanı',
    unavailable: 'Programın şu an açılamıyor. Antrenörüne haber ver.',
    chosenUnavailable: (name: string | null) => `${name ?? 'Seçtiğin program'} şu an açılamıyor.`,
    yoursUnavailable: (name: string | null) => `${name ?? 'Programın'} şu an açılamıyor.`,
    showingPt: 'Antrenörünün programı gösteriliyor.',
    noProgram: 'Henüz program yok',
    noProgramText: 'Antrenörün programını hazırladığında sıradaki antrenmanın burada görünecek.',
    setUpOwn: 'Kendi programını kur',
    phaseWeek: (week: number, weeks: number) => `${week}. hafta / ${weeks}`,
    doneToday: 'Bugünkü antrenmanını yaptın',
    weekProgram: 'Haftanın programı',
    summary: (rows: number, minutes: number) => `${rows} hareket · ≈ ${minutes} dk`,
    today: 'bugün',
    unassigned: (names: string) => `Gün atanmamış: ${names}`,
    nothingToday: 'Bugün atanmış program yok',
    whichToday: 'Bugün hangi programı yapacaksın?',
    pick: 'Yapmak istediğin programı seç.',
    programs: 'Programlar',
    last: (day: string) => `son: ${day}`,
    notYet: 'henüz yapılmadı',
    rowsUnavailable: 'Bu programın hareketleri şu an açılamıyor.',
    rowsUnavailableTell: 'Bu programın hareketleri şu an açılamıyor. Antrenörüne haber ver.',
    startNamed: (day: string) => `Başla: ${day}`,
    start: 'Başla',
    exercisesUnit: (_n: number) => 'hareket',
    minutesUnit: 'dk',
    startWorkout: 'Antrenmana başla',
    moreNotes: (count: number) => `+${count} harekette daha not var`,
    showAll: (count: number) => `Tümünü gör (${count} hareket daha)`,
  },
  /** Program seçimi (`program-choice.tsx`). */
  choice: {
    activeOwn: (name: string) => `Bugün ${name} ile açılır`,
    activePt: 'Bugün antrenörünün programıyla açılır',
    selectFailed: 'Seçilemedi.',
    todayOnly: (name: string) => `Bugün: ${name}`,
    title: 'Hangi programla çalışacaksın?',
    text: 'Sıra ve günler her programda ayrı sürer.',
    lastWorkout: (day: string) => `son antrenman: ${day}`,
    noWorkout: 'henüz antrenman yok',
    onlyToday: 'Yalnız bugün',
    always: 'Bundan sonra hep bu',
    cancel: 'Vazgeç',
    newPt: 'Antrenörün yeni bir program hazırladı',
    later: 'Sonra',
    useIt: 'Onunla çalış',
    ptEdited: (name: string, date: string) => `Antrenörün ${name} programını düzenledi · ${date}`,
    see: 'Gör',
  },
  /** Yarım antrenman ve su kartı (`today-workout.tsx`). */
  today: {
    week: (count: string) => `Bu hafta ${count}`,
    unfinished: 'Yarım kalan antrenman',
    unfinishedDay: (day: string) => `Yarım kalan antrenman · ${day}`,
    setsDone: (_n: number) => 'set yapıldı',
    resumeText: (last: string) => `Kaldığın yerden sürer; kayıtların telefonunda saklı. Son kayıt ${last}.`,
    finish: 'Antrenmanı bitir',
    continueWith: (name: string) => `Devam et: ${name}`,
    continue: 'Kaldığın yerden devam et',
    before: (count: number) => `Önceki ${count} hareket`,
    exercises: 'Antrenmanın hareketleri',
    sets: (done: number, planned: number) => `${done}/${planned} set`,
    after: (count: number) => `+${count} hareket daha`,
    waterToday: 'Su · bugün',
    glasses: (_n: number) => 'bardak',
    undo: '+1 · Geri al',
    addWater: 'Bir bardak su ekle',
  },
  /** Hafta şeridi ve "Değiştir" (`training-week.tsx`). */
  week: {
    states: { done: 'yapıldı', missed: 'kaçtı', planned: 'antrenman günü', rest: 'dinlenme' },
    passed: 'antrenman günü, geçti',
    today: 'bugün',
    days: 'Bu haftanın günleri',
    change: 'Antrenmanı değiştir',
    changeShort: 'Değiştir',
    pickOther: 'Başka antrenman seç',
    plannedToday: (day: string) => `Bugün ${day} planlı; başka birini seçersen antrenörüne bildirilir.`,
    pickToday: 'Bugün için bir program seç.',
    last: (day: string) => `son: ${day}`,
    notYet: 'henüz yapılmadı',
    startThis: 'Bu antrenmanla başla',
  },
  /** Dock'un sekmeleri (`CLIENT_TABS`, sırayla). */
  tabs: {
    today: 'Bugün',
    programs: 'Program',
    progress: 'İlerleme',
    health: 'Sağlık',
  },
  /** İlerleme şeridinin bölümleri (`PROGRESS_SECTIONS`, sırayla). */
  progressSections: {
    summary: 'Özet',
    history: 'Geçmiş',
    records: 'Rekorlar',
  },
  water: {
    /** Commit mesajının başı: "Su · +2". */
    commit: 'Su',
    noChange: 'Değişiklik yok.',
  },
  /** Ağrı kısayolunun hazır notu (bildirime yazılır; danışanın dilinde). */
  painReport: {
    exercise: (title: string, sessions: number) => `${title} (${sessions} antrenmanda)`,
    note: (items: readonly string[]) => `Ağrı yüzünden geçtiğim: ${items.join(', ')}.`,
  },
  /** Yoklama ve kısıt bildirimi uçları. */
  routes: {
    invalid: 'Kayıt geçersiz.',
    check: 'Bilgileri kontrol et.',
    noHealthConsent: 'Sağlık kaydı için onayın yok.',
    noConstraintConsent: 'Kısıt bildirmek için sağlık onayın yok.',
    healthBroken: 'Sağlık kaydın şu an açılamıyor. Antrenörüne haber ver.',
    constraintMissing: 'Kısıt bulunamadı.',
  },
  /** Onay ucu (`api/me/consent`). */
  consentApi: {
    sessionRequired: 'Oturum gerekli.',
    badRequest: 'İstek geçersiz.',
    expired: 'Oturumun kapanmış. Yeniden giriş yap.',
    failed: 'Onay kaydedilemedi.',
  },
  /** `health.json`'un commit mesajları (yazanın dilinde). */
  commits: {
    checkIn: 'Yoklama kaydedildi',
    reported: 'Kısıt bildirildi',
    reportEdited: 'Kısıt bildirimi düzeltildi',
    updated: 'Kısıt güncellendi',
    withdrawn: 'Kısıt bildirimi geri çekildi',
  },
};

export default tr;
