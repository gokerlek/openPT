/**
 * PT'nin danışan ekranları: liste, ekleme/düzenleme formu, danışanın sayfası (Genel, davet, antrenmanlar, ilerleme
 * sekmesi), giriş durumu rozetleri, sağlık onayı durumu ve danışan uçlarının/çekirdeklerinin hata mesajları. Danışan
 * adları, notlar ve program/gün adları PT'nin yazdığıdır, çevrilmez. Sayılar çağıranda `getFormat(locale).number` ile
 * yazılmış gelir (`n: string`); çoğul gerektiren yerde sayı da (`count: number`) verilir.
 */
const tr = {
  /** Danışan şemasının doğrulama mesajları (`lib/schemas/client.ts`). */
  validation: {
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
  },
  /** Danışan uçlarının ve çekirdeklerinin kullanıcıya giden mesajları (`api/clients/**`, `lib/clients*.ts`). */
  errors: {
    invalidRequest: 'İstek geçersiz.',
    checkInfo: 'Bilgileri kontrol et.',
    notFound: 'Danışan bulunamadı.',
    recordNotFound: 'Danışan kaydı bulunamadı.',
    repoOrRecordNotFound: "Danışanın repo'su ya da kaydı bulunamadı.",
    recordUnreadable: 'Kayıt okunamadı.',
    recordMalformed: (id: string) => `${id}: danışan kaydı beklenen biçimde değil.`,
    indexMalformed: (path: string) => `${path} beklenen biçimde değil.`,
    archivedInvite: 'Arşivdeki danışana davet üretilemez.',
    healthOff: 'Sağlık modülü kapalı.',
    consentChanged: 'Antrenörün sorulan bilgileri değiştirdi. Sayfayı yenileyip yeniden bak.',
    saveFailed: 'Danışan kaydedilemedi.',
    deleteFailed: 'Danışan silinemedi.',
    inviteFailed: 'Davet üretilemedi.',
    revokeFailed: 'Erişim kapatılamadı.',
    liveFailed: 'Canlı durum okunamadı.',
    confirmMismatch: 'Doğrulama tutmadı.',
    confirmName: 'Danışanın adını aynen yaz.',
    confirmId: 'Kimliği aynen yaz.',
  },
  /** Danışan listesi (`dashboard/clients/page.tsx`, `client-list.tsx`, `client-work.ts`). */
  list: {
    title: 'Danışanlar',
    newClient: 'Yeni danışan',
    emptyTitle: 'Henüz danışan yok',
    emptyBody: 'Danışanı ekle, sonra kare kodla davet et; programını ve ölçümlerini buradan yönetirsin.',
    addFirst: 'İlk danışanı ekle',
    search: 'Danışan ara',
    resultCount: (_count: number, n: string) => `${n} danışan`,
    noMatches: 'Eşleşen danışan yok',
    noMatchFor: (query: string) => `“${query}” ile eşleşen danışan yok`,
    attentionBadge: (_count: number, n: string) => `${n} dikkat`,
    urgentSr: 'Acil: ',
    /** Başlıktaki özet parçaları (" · " ile birleşir). */
    summary: {
      clients: (_count: number, n: string) => `${n} danışan`,
      active: (n: string) => `${n} aktif`,
      notSignedIn: (_count: number, n: string) => `${n} henüz giriş yapmadı`,
      consentWaiting: (n: string) => `${n} sağlık onayı bekliyor`,
    },
    /** Kaydı okunamayan danışan sayfası ve kartı. */
    unreadableTitle: 'Kayıt okunamadı',
    unreadableBody: (problem: string) => `${problem} Kimliği listeden çıkarmak için düzenleme sayfasından sil.`,
    healthWork: {
      pending: 'Sağlık onayı bekliyor',
      outdated: 'Sağlık onayı yenilenecek',
      declined: 'Sağlık onayı verilmedi',
    },
  },
  /** Giriş durumu rozeti ve açıklaması (`dashboard/clients/invite-state.tsx`). */
  access: {
    joined: 'Katıldı',
    revoked: 'Erişim kapalı',
    used: 'Katıldı',
    none: 'Davet yok',
    pending: 'Davet bekliyor',
    expired: 'Davetin süresi doldu',
    locked: 'Davet kilitlendi',
    password: {
      set: 'şifre belirledi',
      none: 'şifresi yok',
      locked: 'çok sayıda yanlış deneme',
    },
    /** Rozet: durum, katılmışsa şifre bilgisiyle. */
    badge: (state: string, password: string) => `${state} · ${password}`,
    /** `secret`: şifre durumu (`passwordState`); `lockedAt`: kilidin anı, `newCodeExpires`: yeni cihaz kodunun son kullanması. */
    joinedDetail: (secret: 'set' | 'locked' | 'none', lockedAt: string, first: string, newCodeExpires: string | null) =>
      `${
        secret === 'set'
          ? 'Şifreyle giriyor.'
          : secret === 'locked'
            ? `Şifresiyle çok sayıda yanlış deneme yapıldı (${lockedAt}); şifre girişi kapandı. Yeni kare kod üret, danışan yeni şifre belirlesin.`
            : 'Şifresi yok: çıkış yaparsa yeniden girmek için yeni kare kod gerekir.'
      } İlk giriş: ${first}.${newCodeExpires ? ` Yeni kare kod bekliyor (son kullanma ${newCodeExpires}); danışan onunla girip yeni şifre belirler.` : ''}`,
    revokedDetail: (at: string) => `Erişim ${at} tarihinde kapatıldı; eski şifresi de açmaz. Yeniden girmesi için yeni kare kod üret.`,
    usedDetail: (at: string | null) => (at ? `Danışan ${at} tarihinde kare kodla girdi.` : 'Danışan kare kodla girdi.'),
    noneDetail: 'Henüz kare kod üretilmedi.',
    pendingDetail: (expires: string) => `Kare kod henüz kullanılmadı. Son kullanma: ${expires}.`,
    expiredDetail: 'Kare kod kullanılmadan süresi doldu. Yenisini üret.',
    lockedDetail: 'Çok fazla yanlış kod denendi, kare kod kilitlendi. Yenisini üret.',
  },
  /** Sağlık modülünün danışan açısından durumu (`dashboard/clients/health-state.ts`). */
  healthState: {
    labels: {
      off: 'Sağlık modülü kapalı',
      pending: 'Sağlık onayı bekleniyor',
      granted: 'Sağlık takibi açık',
      declined: 'Sağlık onayı verilmedi',
      outdated: 'Sağlık onayı yenilenecek',
    },
    details: {
      off: 'Sağlık verisi tutulmuyor; danışan bu ekranları görmez.',
      pending: 'Danışan ilk girişinde neyin tutulacağını görüp onaylayacak. O zamana kadar kayıt tutulmaz.',
      granted: 'Danışan onay verdi; seçili parçalar kaydedilebilir. İstediği an geri çekebilir.',
      declined: 'Danışan onay vermedi; sağlık kaydı tutulmaz. Kendi ekranından sonra açabilir.',
      outdated:
        'Onay bazı parçaların güncel kapsamını ya da metnini karşılamıyor (modül yeniden açıldı, parça eklendi ya da parçanın metni değişti); o parçalar bir sonraki girişinde yeniden sorulacak, onayı süren parçaların kaydı devam eder.',
    },
  },
  /** Danışanın sayfası: çatı ve sekmeler. */
  shell: {
    breadcrumb: 'Danışanlar',
    fallbackName: 'Danışan',
    unreadableDescription: 'Kayıt okunamadı',
    tabsLabel: 'Danışan bölümleri',
    tabs: { general: 'Genel', program: 'Program', sessions: 'Antrenmanlar', progress: 'İlerleme', health: 'Sağlık' },
  },
  /** Danışan ekleme ve düzenleme (`new/page.tsx`, `edit/*`, `client-form.tsx`). */
  form: {
    newTitle: 'Yeni danışan',
    newDescription:
      'Kaydettiğinde danışanın verisi senin hesabında, yalnız ona ayrılmış gizli bir kayıtta tutulur; kaydın adında isim geçmez.',
    editTitle: 'Danışanı düzenle',
    editHeader: 'Kişisel bilgiler ve izinler',
    editDescription: 'Ad, not, durum ve sağlık modülü. Program ve ölçümler kendi sekmelerinde.',
    back: 'Genel',
    editUnreadable: (problem: string) =>
      `${problem} Repo'yu GitHub'da geri yüklediysen sayfayı yenile; yoksa “Sil” ile kimliği listeden çıkar.`,
    person: 'Kişi',
    personHint: 'Ad ve not yalnız bu danışana ayrılmış gizli kayıtta durur.',
    name: 'Ad soyad',
    namePlaceholder: 'Ör. Ayşe Demir',
    nameHint: 'Danışan kendi ekranında bu adla karşılanır.',
    status: 'Durum',
    statusHint: 'Arşivdeki danışan giriş yapamaz, verisi yerinde kalır.',
    experience: 'Antrenman geçmişi',
    experienceHint:
      'Ağırlık önerileri buna göre başlar: deneyimli danışan her yeni harekette tanışma adımlarını tek antrenmanda geçer.',
    note: 'Not',
    notePlaceholder: 'Hedefi, geçmişi, dikkat edilecekler…',
    noteHint: 'Senin için; danışan görmez.',
    ai: 'AI koç desteği',
    aiHint:
      'Danışan ve sen kayıtlar hakkında soru sorabilir, program taslağı isteyebilirsiniz. Taslaklar yalnız sen onaylayınca uygulanır. Danışanın ayrıca veri kullanımını onaylaması gerekir.',
    heartTitle: 'Nabız sınırları',
    heartHint: (recovery: number, alert: number) =>
      `Danışan antrenmanda nabız bandı bağlarsa kullanılır: dinlenme en çok 2 dakika uzayabilir, yüksek nabızda uyarı çıkar. İkisi de boş bırakılırsa otomatik: toparlanma ${recovery}, uyarı ${alert} bpm (genel değerler).`,
    heartRecovery: 'Toparlanma',
    heartRecoveryHint: 'Dinlenme, nabız buna inene kadar uzar.',
    heartAlert: 'Uyarı',
    heartAlertHint: 'Nabız 5 sn bunun üstünde kalırsa danışan uyarılır.',
    heartAuto: (value: number) => `Otomatik (${value})`,
    bpm: 'bpm',
    healthTitle: 'Sağlık modülü',
    healthHint:
      'Ağrı, ölçüm ve kısıtlar özel nitelikli veridir. Danışan ilk girişinde seçtiğin parçaları görür ve onaylar; onay vermezse hiçbiri tutulmaz.',
    healthParts: 'Tutulacak parçalar',
    reconsent:
      'Danışanın onayı bu kapsamdan önce verildi. Kaydedersen bir sonraki girişinde yeniden sorulur; o zamana kadar sağlık kaydı tutulmaz.',
    healthOff: 'Kapalı: sağlık ekranları danışana görünmez, hiçbir sağlık kaydı tutulmaz.',
    healthOffKept: ' Daha önce tutulanlar danışanın kaydında kalır; silmek için danışanı silmen gerekir.',
    cancel: 'Vazgeç',
    saved: 'Danışan güncellendi.',
    created: 'Danışan eklendi.',
    saving: 'Kaydediliyor…',
    adding: 'Ekleniyor…',
    save: 'Kaydet',
    add: 'Danışanı ekle',
  },
  /** Düzenleme sayfasının yıkıcı eylemleri (`edit/client-actions.tsx`). */
  actions: {
    revokeTrigger: 'Erişimi kapat',
    revokeTitle: (name: string) => `${name} için erişim kapatılsın mı?`,
    revokeBody:
      'Açık oturumları hemen düşer, kullanılmamış kare kod ve şifresi artık açmaz. Verisi yerinde kalır; yeni kare kodla girip yeni şifre belirler. Yalnız şifresini unuttuysa bunu yapma: davet ekranında yeni kare kod yeter.',
    cancel: 'Vazgeç',
    revoked: 'Erişim kapatıldı. Yeniden girmesi için yeni kare kod üret.',
    delete: 'Sil',
    deleteTitle: (label: string) => `${label} kalıcı olarak silinsin mi?`,
    deleteFallbackLabel: 'Bu danışan',
    deleteBody:
      "Danışanın repo'su ve içindeki her şey (kayıt, antrenmanlar, sağlık verisi) silinir. GitHub silinen repo'yu 90 gün boyunca yalnız hesap sahibine geri alma imkânı verir; sonra tamamen gider.",
    deleteConfirm: 'Kalıcı olarak sil',
    deleted: (name: string | null) => (name ? `${name} ve bütün verisi silindi.` : 'Danışan listeden çıkarıldı.'),
    typeName: 'Onaylamak için danışanın adını yaz',
    typeId: (id: string) => `Onaylamak için kimliği yaz: ${id}`,
    caseInsensitive: 'Büyük-küçük harf fark etmez.',
  },
  /** Genel sekmesi (`[id]/page.tsx`). */
  detail: {
    title: 'Genel',
    description: 'Profil, giriş, sağlık modülü ve özetler. Ayrıntılar kendi sekmelerinde.',
    askAi: "AI'ya sor",
    attention: {
      title: 'Dikkat',
      itemsSr: ' madde',
      redHint: 'Kırmızı ünlem sağlık güvenliği.',
      listLabel: 'Dikkat maddeleri',
      more: (_count: number, n: string) => `+${n} madde daha`,
      restLabel: 'Öteki dikkat maddeleri',
    },
    profile: {
      title: 'Profil',
      status: 'Durum',
      added: 'Eklendi',
      experience: 'Antrenman geçmişi',
      notEntered: 'Girilmedi',
      note: 'Not',
      technical: 'Teknik ayrıntılar',
      repo: 'Kaydın durduğu GitHub deposu: ',
      openOnGithub: "GitHub'da aç",
    },
    access: {
      title: 'Giriş',
      newCode: 'Yeni kare kod',
      invite: 'Davet et',
      inviteScreen: 'Davet ekranı',
    },
    health: {
      title: 'Sağlık modülü',
      withoutJoin: ' Danışan henüz hiç giriş yapmadı; bu onay kaydı uygulama dışında eklenmiş olabilir.',
      urgentSr: 'Acil: ',
      granted: 'onaylı',
      renewing: 'yeni onay bekleniyor',
      noConsent: 'onay yok',
      active: (n: string) => `${n} etkin`,
      severe: (n: string) => `${n} şiddetli (bakılmadı)`,
      pending: (_count: number, n: string) => `${n} bildirim bekliyor`,
      awaiting: (n: string) => `${n} görüş bekliyor`,
      noScreening: 'henüz hareket testi yok',
      lastScreening: (day: string, pain: string | null) => `son ${day}${pain ? ` · ${pain} ağrı` : ''}`,
    },
    program: {
      title: 'Program',
      unreadable: 'Program şu an okunamadı. Sayfayı yenile.',
      none: 'Henüz program yok. Bir şablondan başlayıp bu danışana göre düzenleyebilir ya da boş başlayabilirsin.',
      create: 'Program oluştur',
      broken: (problem: string) => `Program okunamadı: ${problem}`,
      open: 'Programı aç',
      workouts: (_count: number, n: string) => `${n} antrenman`,
      phaseDue: 'Evre süresi doldu',
      currentPhaseLabel: 'Şu anki evrenin programları',
      programsLabel: 'Programlar',
      noDays: 'Gün atanmadı',
      summary: (rows: string, sets: string, minutes: string) => `${rows} hareket · ${sets} set · ≈ ${minutes} dk`,
      today: 'Bugün',
      next: 'Sıradaki',
      lastChange: (date: string) => `Son değişiklik: ${date}`,
    },
    sessions: {
      title: 'Antrenmanlar',
      unreadable: 'Antrenmanlar şu an okunamadı. Sayfayı yenile.',
      subtitle: 'Danışanın bitirdiği antrenmanlar, en yenisi üstte.',
      emptyTitle: 'Henüz bitmiş antrenman yok',
      emptyBody: 'Danışan antrenmanı bitirince burada görünür; sürerken sayfanın başında canlı izlenir.',
      recentLabel: 'Son antrenmanlar',
      all: (n: string) => `Bütün antrenmanlar (${n})`,
    },
  },
  /** Davet ekranı (`[id]/invite/*`). */
  invite: {
    title: 'Davet',
    back: 'Genel',
    description: (name: string) =>
      `${name} telefon kamerasıyla kare kodu okutur, şifresini belirler ve uygulamayı ana ekrana ekler; sonra ana ekrandaki simgeden şifresiyle girer. GitHub hesabı gerekmez.`,
    archivedTitle: 'Danışan arşivde',
    archivedBody: 'Arşivdeki danışana davet üretilemez. Önce durumunu “Aktif” yap.',
    stateTitle: 'Giriş durumu',
    howTitle: 'Nasıl katılır',
    howSummary: 'Danışana söylenecek sıra: “Telefon kamerasıyla kodu okut → şifreni belirle → uygulamayı ana ekrana ekle.”',
    /** Adımlar; sonuncusunda "Erişimi kapat" rozeti araya girer. */
    steps: [
      'Danışan telefonunun kamerasıyla kare kodu okutur ya da bağlantıyı açar; kod hazır gelir, “Devam”a dokunur.',
      'Kendine şifre belirler.',
      'Ekran uygulamayı ana ekrana eklemeyi adım adım gösterir: Android’de “Uygulamayı yükle”, iPhone’da Safari’de Paylaş → Ana Ekrana Ekle → Ekle. Atlarsa Bugün ekranının üstünde yeniden görür.',
      'Sonraki girişleri ana ekrandaki simgeden, şifreyle. Oturumu 30 gün açık kalır; kod bir kez kullanılır.',
      'Şifresini unutursa PT’ye söyler, PT yeni kare kod üretir. Kod kullanılınca eski şifre geçersiz olur, danışan yeni şifre belirler.',
    ],
    lastStep: { before: 'Telefonunu kaybederse danışan düzenlenip ', badge: 'Erişimi kapat', after: ' denir (oturumları ve şifresi geçersiz olur), sonra yeni kare kod üretilir.' },
    panel: {
      generate: 'Kare kod üret',
      generateAgain: 'Yeni kare kod üret',
      passwordReset: 'Danışan şifresini unuttuysa yeni kare kodla girer ve yeni şifre belirler; kod kullanılınca eski şifre açmaz.',
      joinedTitle: (name: string) => `${name} zaten katıldı`,
      pendingTitle: 'Bekleyen bir kare kod var',
      noneTitle: 'Henüz kare kod yok',
      joinedBody:
        'Şifresiyle girer, yeni kare kod gerekmez. Yeni kod kullanılınca eski şifresi açmaz; açık oturumları kapanmaz. Telefonu kaybolduysa önce düzenleme sayfasından erişimi kapat.',
      pendingBody: 'Kodun kendisi saklanmadığı için yeniden gösterilemez. Yenisini üretirsen eskisi anında geçersiz olur.',
      noneBody: (name: string) => `${name} kare kodu okutur, şifresini belirler ve uygulamayı ana ekrana ekler. Kod tek kullanımlıktır.`,
      codeTitle: (name: string) => `${name} için kare kod`,
      expires: (at: string) => `Son kullanma: ${at}`,
      qrLabel: (name: string) => `${name} için davet kare kodu`,
      linkLabel: 'Davet bağlantısı',
      copyLabel: 'Bağlantıyı kopyala',
      copied: 'Bağlantı kopyalandı.',
      copyFailed: 'Kopyalanamadı. Bağlantıyı elle seç.',
      manualTitle: 'Bağlantı açılmıyorsa kodu elle gir',
      manualHint: 'Kare kodla açılan ekranda kod hazır gelir; gelmezse danışan bu kodu yazar.',
      once: (name: string) => `Bu kod bir daha gösterilmez. Bağlantıyı yalnız ${name} ile paylaş: kimde olursa o girer ve şifre belirler.`,
    },
  },
  /** Antrenmanlar sekmesi ve antrenman detayı (`[id]/sessions/**`, `lib/pt-sessions.ts`). */
  sessions: {
    title: 'Antrenmanlar',
    description: 'Danışanın bitirdiği antrenmanlar, en yenisi üstte. Yalnız görüntüleme: kayıtlarını danışan kendi telefonundan siler.',
    unreadableTitle: 'Antrenmanlar şu an okunamadı',
    unreadableBody: 'Danışanın kayıt deposuna ulaşılamadı. Biraz sonra sayfayı yenile.',
    emptyTitle: 'Henüz bitmiş antrenman yok',
    emptyBody: 'Danışan antrenmanı bitirince burada görünür: süresi, set sayısı, toplam ağırlık ve rekorları. Sürerken üstte canlı izlenir.',
    history: 'Geçmiş',
    showMore: (n: string) => `Daha fazla göster (${n})`,
    records: (_count: number, n: string) => `${n} rekor`,
    ownProgram: 'Kendi programı',
    otherDay: 'başka program',
    unfinished: 'yarım',
    detail: {
      metaTitle: 'Antrenman',
      unavailableTitle: 'Antrenman şu an açılamıyor',
      activeTitle: 'Antrenman sürüyor',
      activeBody: 'Bitince setleri ve program değişiklikleri burada görünür.',
      deletedTitle: 'Bu antrenman silinmiş',
      missingTitle: 'Antrenman bulunamadı',
      deletedBody: 'Danışan bu kaydı sildi: uygulamada görünmez, veri deposunun geçmişinde kalır.',
      missingBody: 'Adres yanlış olabilir ya da antrenman silinmiş olabilir.',
      water: (_count: number, n: string) => `${n} bardak su`,
      flagsLabel: 'Antrenmanın işaretleri',
      noSetsTitle: 'Kayıtlı set yok',
      noSetsBody: 'Bu antrenmanın setleri silinmiş.',
      exercisesLabel: 'Hareketler',
      changesTitle: 'Program değişiklikleri',
      changesBody: 'Bu antrenmanın bitişinde: danışanın programa yazdıkları ve onaya gönderdikleri.',
      setupNote: 'Ayar notu: ',
      set: 'Set',
      done: 'Yapılan',
      effort: 'Zorluk',
      extra: 'fazladan',
      overload: 'aşırı yük',
    },
    /** `ptSessionDetail`: antrenmanın işaretleri ve hareketin notları. */
    flags: {
      ownProgram: 'kendi programı',
      insteadOf: (planned: string) => `${planned} yerine seçildi`,
      otherDay: 'başka program seçildi',
      unfinished: (progress: { done: string; planned: string } | null) =>
        progress ? `yarım bırakıldı (${progress.done}/${progress.planned} set)` : 'yarım bırakıldı',
      lighter: 'hafifletilmiş gün',
    },
    notes: {
      insteadOf: (title: string) => `${title} yerine`,
      swapped: 'muadille değiştirildi',
      added: 'plan dışı eklendi',
      painSkipped: 'ağrı nedeniyle geçildi',
      plan: (parts: string) => `plan: ${parts}`,
    },
    /** Program değişikliklerinin durumu, PT'ye (danışanın metni "antrenörünün onayında" der). */
    changeLabels: {
      applied: 'programa yazıldı',
      pending: 'onay bekliyor',
      approved: 'onaylandı',
      declined: 'reddedildi',
      stale: 'uygulanamadı',
    },
  },
  /** İlerleme sekmesi (`[id]/ilerleme/page.tsx`). */
  progress: {
    title: 'İlerleme',
    description: 'Danışanın gidişatı: kas başına güç gelişimi, hareketlerin grafikleri, haftalık yük, antrenman düzeni, rekorlar ve başarılar.',
    unavailableTitle: 'İlerleme şu an açılamıyor',
    unavailableBody: 'Danışanın kayıt deposuna ulaşılamadı. Biraz sonra sayfayı yenile.',
    healthHidden: (state: string) => `${state}: hazır oluşluk, ağrı, çevre ölçümleri ve hareket testi burada gösterilmez.`,
  },
};

export default tr;
