/**
 * PT kabuğu: gezinme (dock, kullanıcı menüsü, Kütüphane ve Ayarlar sekmeleri), Genel bakış (dikkat gerektirenler,
 * bildirimler, canlı antrenman, sayı kartları) ve bu kartları besleyen metin üreticileri (`lib/attention.ts`,
 * `lib/notices.ts`, `lib/live-text.ts`). Sayılar çağıranda `getFormat(locale).number` ile yazılmış gelir (`n: string`);
 * çoğul gerektiren yerde sayı da (`count: number`) verilir. Gün adları, program ve danışan adları PT'nin yazdığıdır.
 */
const tr = {
  /** Alt gezinme (`dashboard/nav.tsx`). */
  nav: {
    ariaLabel: 'Ana menü',
    overview: 'Genel bakış',
    overviewShort: 'Genel',
    clients: 'Danışanlar',
    library: 'Kütüphane',
  },
  /** Kütüphane sekmeleri (`dashboard/training-tabs.tsx`). */
  library: {
    ariaLabel: 'Kütüphane',
    templates: 'Şablonlar',
    exercises: 'Egzersizler',
    devices: 'Cihazlar',
    attachments: 'Aparatlar',
  },
  /** Kullanıcı menüsü (`dashboard/user-menu.tsx`). */
  userMenu: {
    ariaLabel: 'Hesap menüsü',
    role: (appName: string) => `${appName} · antrenör`,
    coach: 'AI koç',
    settings: 'Ayarlar',
    signOut: 'Çıkış yap',
  },
  /** Ayarlar sayfaları. Sekme adları `shell.settingsSections`'ta. */
  settings: {
    ariaLabel: 'Ayarlar',
    appearance: {
      title: 'Görünüm',
      description: 'Danışanların göreceği ad, logo, renk, köşeler ve tema.',
    },
    app: {
      title: 'Uygulama',
      description: 'Panel ve danışan uygulaması telefona yüklenir; simge ve ad Görünüm ayarlarından gelir.',
      clientAppTitle: 'Danışan uygulaması',
      /** Bağlantı metni araya girer: önce + bağlantı + sonra. */
      clientAppBody: {
        before:
          'Danışan davet kare kodunu telefon kamerasıyla okutur, şifresini belirler ve ekrandaki adımlarla uygulamayı ana ekrana ekler. Panelden ayrı bir simgedir; ikisi aynı telefonda da durabilir. Sıra her danışanın ',
        link: 'davet ekranında',
        after: ' da yazar.',
      },
    },
    updates: {
      title: 'Sürüm',
      description: 'Kurulu sürümü görüntüle, yeni sürümleri kontrol et ve uygulamanı güncelle.',
    },
  },
  /** Genel bakış (`dashboard/page.tsx`). */
  home: {
    title: 'Genel bakış',
    description: 'Önce bakılacaklar: dikkat isteyen danışanlar ve bildirimler.',
    clientsLabel: 'Danışan',
    clientsHint: 'Danışan listesini aç',
    exercisesLabel: 'Egzersiz',
    exercisesHint: (custom: string) => `${custom} tanesi senin · kütüphaneyi aç`,
    loadingRecords: 'Danışanların kayıtları okunuyor…',
  },
  /** Sayfa geçişi iskeleti (`dashboard/route-skeleton.tsx`). */
  skeleton: {
    loading: 'Sayfa yükleniyor…',
  },
  /** Okunamayan kayıtlar uyarısı (`dashboard/unreadable-records-alert.tsx`); yol `<code>` ile araya girer. */
  unreadable: {
    title: (count: number) => ({ before: `${count} kayıt okunamadı (`, after: ')' }),
    description:
      "Şemaya uymayan ya da aynı kimlikle ikinci kez yazılmış kayıtlar düzeltilene kadar listede görünmez ve o kimliklerle kayıt yapılamaz; dosyada olduğu gibi korunurlar. GitHub'da düzeltebilirsin.",
  },
  /** "Dikkat gerektirenler" kartı ve maddeleri. */
  attention: {
    title: 'Dikkat gerektirenler',
    clientsSr: (_count: number) => ' danışan',
    description: 'En acil danışan üstte; kırmızı ünlem sağlık güvenliği.',
    failedRecords: (_count: number, n: string) => `${n} danışanın kaydı okunamadı.`,
    emptyTitle: 'Şu an dikkat gerektiren bir şey yok',
    emptyBody: 'Danışan antrenman gününü kaçırdığında, bir hareket ilerlemediğinde ya da bir karar beklediğinde burada görünür.',
    urgent: 'Acil',
    askAi: "AI'ya sor",
    moreItems: (_count: number, n: string) => `+${n} madde daha`,
    moreClients: (_count: number, n: string) => `+${n} danışan daha`,
    labels: {
      constraint: 'Kısıt',
      missed: 'Kaçan gün',
      screening: 'Hareket testi',
      stalled: 'İlerleme',
      phase: 'Evre',
      proposals: 'Öneri',
      measurement: 'Ölçüm',
      invite: 'Davet',
    },
    /** Danışanın bildirdiği şiddet (`Severity`). */
    severity: { mild: 'hafif', moderate: 'orta', severe: 'şiddetli' },
    invite: {
      none: 'Henüz davet edilmedi: kare kod üretilmedi',
      /** `expires`: son kullanma günü (kısa); yoksa null. */
      pending: (expires: string | null) => (expires ? `Davet kullanılmadı · son kullanma ${expires}` : 'Davet kullanılmadı'),
      expired: 'Davetin süresi doldu: yeni kare kod gerekli',
      locked: 'Davet kilitlendi (çok sayıda yanlış kod): yeni kare kod gerekli',
    },
    stalled: {
      deloaded: (title: string) => `${title} hafifletildi (üst üste tıkandı)`,
      declining: (title: string, _count: number, n: string) => `${title} geriliyor (${n} antrenmandır hedefin altında)`,
      same: (title: string, _count: number, n: string) => `${title} ${n} antrenmandır aynı ağırlıkta`,
      more: (_count: number, n: string) => `+${n} hareket`,
    },
    measurement: {
      decline: (parts: string) => `4 haftalık eğilimde gerileme: ${parts}`,
    },
    missed: {
      many: (lookback: string, _count: number, n: string, days: string) => `Son ${lookback} günde ${n} antrenman günü kaçtı: ${days}`,
      one: (day: string) => `Antrenman günü kaçtı: ${day}`,
    },
    phase: {
      own: (own: string, name: string) => `Danışan ${own} ile çalışıyor · '${name}' evresinin süresi doldu`,
      due: (name: string, next: string) => `'${name}' evresinin süresi doldu; sıradaki evre '${next}'`,
    },
    proposals: {
      one: (text: string) => `Öneri onay bekliyor: ${text}`,
      many: (_count: number, n: string) => `${n} öneri onay bekliyor`,
    },
    constraints: {
      /** `emergency`: acil durum metni (sonundaki nokta atılır), `label`: bölge. */
      urgent: (emergency: string, label: string) => `${emergency.replace(/\.$/, '')} (${label})`,
      refer: (list: string) => `Sağlık profesyoneline yönlendir: ${list}`,
      betterAfterSevere: (label: string) => `${label} · önce şiddetli, şimdi düzeldi dedi (inceleme bekliyor)`,
      worseToSevere: (label: string, from: string | null) => (from ? `${label} ${from} → şiddetli` : `${label} · şiddetli`),
      worse: (list: string) => `Kısıt kötüleşti: ${list}`,
      reportedSevere: (label: string) => `${label} (şiddetli)`,
      reported: (list: string) => `Danışan kısıt bildirdi: ${list}`,
      reportedWith: (label: string, severity: string) => `${label} (${severity})`,
      conflictNext: (list: string) => `Sıradaki günde kısıtla çelişen hareket: ${list}`,
      conflictRow: (dayName: string, title: string) => `${dayName} · ${title}`,
      conflictOne: (row: string) => `Programda kısıtla çelişen hareket: ${row}`,
      conflictMany: (_count: number, n: string) => `Programda kısıtla çelişen ${n} hareket`,
      better: (label: string, wasSevere: boolean) => `${label} · düzeldi dedi${wasSevere ? ' (önce şiddetli demişti)' : ''}`,
      changed: (label: string, from: string, to: string) => `${label} ${from} → ${to}`,
      changedWorse: (label: string) => `${label} · kötüleşti`,
      changeWorse: (list: string) => `Kısıt kötüleşti: ${list}`,
      changeUpdated: (list: string) => `Kısıt güncellendi: ${list}`,
      waitingRow: (label: string, _count: number, n: string) => `${label} · ${n} gün`,
      waiting: (list: string) => `Profesyonel görüşü bekleniyor · ${list}`,
    },
    screening: {
      pain: (list: string) => `Hareket testinde ağrı: ${list}`,
      asymmetry: (name: string) => `Hareket testinde büyük asimetri: ${name}`,
    },
    /** `+n` sonekli kısa liste: ilk adlar, sonra kaç tane daha. */
    listMore: (n: string) => `+${n}`,
  },
  /** Danışan kartının alt satırı (`lib/client-card-extras.ts`). */
  cardExtras: {
    lastWorkout: (day: string) => `Son antrenman ${day}`,
    noWorkout: (_count: number, n: string) => `Son ${n} günde antrenman yok`,
  },
  /** Bildirimler kartı ve maddeleri. */
  notices: {
    title: 'Bildirimler',
    newBadge: (n: string) => `${n} yeni`,
    description: (days: string) => `Son ${days} gün ve bekleyen öneriler: danışanların antrenmanlarından ve program değişikliklerinden.`,
    emptyTitle: 'Bildirim yok',
    emptyBody: 'Danışan bugünün programı yerine başka birini yaptığında ya da antrenmanı yarım bıraktığında burada görünür.',
    unreadSr: 'okunmadı',
    markAllRead: 'Tümünü okundu say',
    markFailed: (count: number) => `${count} danışanda yazılamadı; biraz sonra tekrar dene.`,
    labels: {
      other_day: 'Başka program',
      unfinished: 'Yarım',
      overload: 'Aşırı yük',
      lighter: 'Hafifletildi',
      pain: 'Ağrı',
      program: 'Program',
      proposal: 'Bekleyen öneri',
      own_program: 'Kendi programı',
      constraint: 'Kısıt',
    },
    /** Antrenmanın adı yoksa. */
    defaultDay: 'Antrenman',
    adjustReason: { readiness: 'hazır oluşluk', pain: 'ağrı' },
    otherDayPlanned: (planned: string, day: string) => `${planned} yerine ${day} yapıldı`,
    otherDay: (day: string) => `Başka program seçildi: ${day}`,
    unfinished: (day: string, progress: { done: string; planned: string } | null) =>
      `${day} yarım bırakıldı${progress ? ` (${progress.done}/${progress.planned} set)` : ''}`,
    overloadNone: (day: string) => `${day}: hedefin çok üzerinde set onaylandı`,
    overloadRow: (title: string, kg: string, planned: string | null) => `${title} ${kg}${planned !== null ? ` (hedef ${planned})` : ''}`,
    lighter: (day: string, reason: string | null) => `${day} hafifletildi${reason ? ` (${reason})` : ''}`,
    painSkips: (day: string, _count: number, n: string) => `${day}: ağrı nedeniyle ${n} hareket geçildi`,
    ownActive: (name: string) => `Bugün'ün programı: ${name}`,
    ownDefaultName: 'kendi programı',
    ownBack: 'Antrenörün programına döndü',
    ownShared: (name: string) => `Paylaştı: ${name}`,
    ownEdited: (name: string, text: string) => `${name} · ${text}`,
    ownDeleted: (name: string) => `Sildi: ${name}`,
    ownUnshared: (name: string) => `Paylaşımı kapattı: ${name}`,
    proposalOne: (text: string) => `Öneri: ${text}`,
    proposalMany: (_count: number, n: string) => `${n} değişiklik önerisi bekliyor`,
  },
  /** `api/live` ve `api/notices` yanıtları. */
  api: {
    invalidRequest: 'İstek geçersiz.',
    liveFailed: 'Canlı durum okunamadı.',
    seenFailed: 'Okundu bilgisi yazılamadı. Biraz sonra tekrar dene.',
  },
  /** Canlı antrenman (`lib/live-text.ts`, `dashboard/live-now.tsx`). */
  live: {
    title: 'Şu an antrenmanda',
    reading: 'Danışanların antrenmanları okunuyor…',
    nobody: 'Şu an antrenman yapan yok. Danışan set kaydettikçe burada canlı görünür.',
    failed: (_count: number, n: string) => `${n} danışanın durumu okunamadı.`,
    justNow: 'az önce',
    ago: (text: string) => `${text} önce`,
    sets: (_done: number, doneText: string, plannedText: string | null) => (plannedText !== null ? `${doneText}/${plannedText} set` : `${doneText} set`),
    lastSet: (ago: string) => `son set ${ago}`,
    started: (ago: string) => `başladı ${ago}`,
    line: (detail: string) => `Şu an antrenmanda · ${detail}`,
    defaultClient: 'Danışan',
  },
};

export default tr;
