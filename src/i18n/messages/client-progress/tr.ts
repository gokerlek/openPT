/**
 * Danışanın İlerleme ve Geçmiş sekmeleri (`lib/progress-text.ts`, `components/progress`, `me/(sekmeler)/ilerleme`,
 * `me/(sekmeler)/gecmis`). İlerleme metinleri PT'nin danışan sayfasında da kullanılır: kime yazıldığı `pt`
 * (danışana ikinci tekil, PT'ye danışanın adıyla ya da yansız). Sayılar çağıranda biçimlenir (`getFormat`).
 */
const tr = {
  /** Hareket grafiğinin değerleri (`METRICS`); `short` 375 px'te yan yana üç düğmeye sığar. */
  metrics: {
    top: { label: 'En ağır set', short: 'En ağır', unit: 'kg' },
    e1rm: { label: 'Tahmini maksimum', short: 'Maksimum', unit: 'kg' },
    volume: { label: 'Toplam ağırlık', short: 'Toplam', unit: 'kg' },
    reps: { label: 'En çok tekrar', short: 'En çok', unit: 'tekrar' },
    total_reps: { label: 'Toplam tekrar', short: 'Toplam', unit: 'tekrar' },
    seconds: { label: 'En uzun set', short: 'En uzun', unit: 'sn' },
    total_seconds: { label: 'Toplam süre', short: 'Toplam', unit: 'sn' },
  },
  /** "45 sn", "1 dk 30 sn", "2 dk". */
  duration: (minutes: string, seconds: string, parts: 'seconds' | 'minutes' | 'both') =>
    parts === 'seconds' ? `${seconds} sn` : parts === 'minutes' ? `${minutes} dk` : `${minutes} dk ${seconds} sn`,
  trend: {
    tooFewPoints: 'Tahmin için en az 4 antrenman gerekir.',
    tooShortSpan: 'Tahmin için kayıtların en az 3 haftaya yayılması gerekir.',
    stale: (days: number) => `Son kayıt ${days} gün önce; tahmin bir sonraki antrenmanla güncellenir.`,
    slope: (slope: string) => `Eğilim haftada ${slope}.`,
    range: (low: string, high: string) => `; olası aralık ${low}–${high}`,
    forecast: (trend: string, weeks: number, date: string, value: string, range: string) =>
      `${trend} Böyle giderse ${weeks} hafta sonra (${date}) ≈ ${value}${range}. Tahmin eğilimin süreceğini varsayar.`,
  },
  highRepDays: (count: number, max: number, pt: boolean) => {
    const days = count === 1 ? 'Son antrenman gününde' : `Son ${count} antrenman gününde`;
    const where = pt ? "Ağırlık “En ağır”da, güç gelişimi Gelişim'de görünür." : "Ağırlığın “En ağır”da, güç gelişimin Gelişim'de görünür.";
    return `${days} bütün setler ${max}'den çok tekrarlı; tahmini maksimum o günler için hesaplanmaz. ${where}`;
  },
  e1rmNote: (max: number, pt: boolean) => {
    const lead = pt
      ? 'Tek tekrarda kaldırabileceği en ağır yükün tahmini; kaldırması gereken bir hedef değil, gidişatı gösterir.'
      : 'Tek tekrarda kaldırabileceğin en ağır yükün tahmini; kaldırman gereken bir hedef değil, gidişatı gösterir.';
    return `${lead} Epley formülüyle hesaplanır: ağırlık × (1 + tekrar ÷ 30). Yalnız 1–${max} tekrarlı setlerden: tekrar arttıkça tahmin şaşar, en isabetlisi az tekrarlı setlerdir.`;
  },
  records: {
    heaviest: 'En ağır set',
    heaviestAdded: 'En ağır ek yük',
    e1rm: 'Tahmini maksimum',
    repsAtWeight: 'Aynı ağırlıkta en çok tekrar',
    mostReps: 'En çok tekrar',
    longest: 'En uzun süre',
    reps: (reps: number | string) => `${reps} tekrar`,
    previousEstimate: (value: string) => `önceki ≈ ${value}`,
    previousBest: (value: string) => `önceki en iyi ${value}`,
  },
  achievements: {
    titles: {
      first_workout: 'İlk antrenman',
      workouts_10: '10 antrenman',
      workouts_25: '25 antrenman',
      workouts_50: '50 antrenman',
      streak_4: '4 hafta üst üste',
      streak_12: '12 hafta üst üste',
      first_record: 'İlk rekor',
    },
    firstWorkout: (pt: boolean) => (pt ? 'İlk antrenmanını bitirince.' : 'İlk antrenmanını bitir.'),
    firstRecord: (pt: boolean) => (pt ? 'Bir harekette en iyisini geçince.' : 'Bir harekette en iyini geç.'),
    streak: (weeklyTarget: number, current: number, target: number) => `Her hafta en az ${weeklyTarget} gün antrenman · ${current}/${target} hafta`,
    workouts: (current: number, target: number) => `${current}/${target} antrenman`,
  },
  streak: {
    week: (done: number, target: number) => `Bu hafta ${done}/${target} gün`,
    /** Seri yokken bu haftanın arkasına. */
    bestStreak: (best: number) => ` · en uzun seri ${best} hafta`,
    best: (best: number) => ` · en uzun ${best} hafta`,
    current: (current: number, best: string, week: string) => `${current} hafta üst üste${best} · ${week.toLocaleLowerCase('tr')}`,
  },
  strengthStatus: {
    improved: 'Gelişti',
    stable: 'Sabit',
    declined: 'Geriledi',
    insufficient: 'Veri az',
  },
  strength: {
    shortSpan: (weeks: number, days: number) => `Kayıtların en az ${weeks} haftaya yayılması gerekir; bu dönemde ${days} güne sığıyor.`,
    fewPoints: (points: number, count: number) => `Karar için bu dönemde en az ${points} antrenman günü gerekir; şimdilik ${count}.`,
    detail: (start: string, end: string, pct: string, range: string) => `≈ ${start} → ${end}${pct} · olası değişim ${range}`,
    methodFirst: (max: number, pt: boolean) =>
      pt
        ? `Her hareket için seçilen dönemdeki antrenman günlerinin en iyisi alınır: ağırlıklı harekette tahmini maksimum, vücut ağırlığıyla yapılanda en çok tekrar, süreli harekette en uzun set. Bütün setleri ${max}'den çok tekrarlı gün de sayılır: tahmini maksimum o gün en ağır setten hesaplanır.`
        : `Her hareket için seçtiğin dönemdeki antrenman günlerinin en iyisi alınır: ağırlıklı harekette tahmini maksimum, vücut ağırlığıyla yaptığında en çok tekrar, süreli harekette en uzun set. Bütün setlerini ${max}'den çok tekrarla yaptığın gün de sayılır: tahmini maksimum o gün en ağır setinden hesaplanır.`,
    methodRest: (points: number, weeks: number) => [
      'Bu değerlerden tek bir kötü güne kapılmayan bir eğilim çizgisi çizilir (Theil–Sen). Çizginin değişiminin olası aralığı (≈%80) tamamen artıdaysa “gelişti”, tamamen eksideyse “geriledi”, sıfırı kapsıyorsa “sabit” denir.',
      `Karar için dönemde en az ${points} antrenman günü ve ${weeks} hafta gerekir.`,
      'Kas, onu çalıştıran hareketlerden hesaplanır: hedef kas tam, yardımcı kas yarım, dengeleyici kas çeyrek sayılır; yalnız dengeleyici olarak çalıştığı hareketler kasa karar vermez.',
      'Bu güç gelişimidir: kasın büyüdüğünü tek başına göstermez, beceri ve sinir sistemi de gücü artırır.',
    ],
  },
  circumference: {
    left: 'sol',
    right: 'sağ',
    label: (label: string, side: string) => `${label}${side ? `, ${side}` : ''}`,
    noise: ' · ölçüm hatası payı içinde',
  },
  adherence: (weeks: number, done: number, planned: number, pct: number) =>
    `${weeks === 1 ? 'Geçen hafta' : `Son ${weeks} tamamlanan haftada`} ${done}/${planned} gün (%${pct}).`,
  /** Gelişim pencereleri (`STRENGTH_WINDOWS`): düğme adı, dönem ve "dönemde". */
  windows: {
    '4h': { label: '4 hafta', period: 'Son 4 hafta', periodIn: 'Son 4 haftada' },
    '8h': { label: '8 hafta', period: 'Son 8 hafta', periodIn: 'Son 8 haftada' },
    '12h': { label: '12 hafta', period: 'Son 12 hafta', periodIn: 'Son 12 haftada' },
    tumu: { label: 'Tümü', period: 'Tüm kayıtlar', periodIn: 'Tüm kayıtlarda' },
  },
  /** Grafik süzgecinin hazır aralıkları (`RANGE_PRESETS`). */
  ranges: {
    '4h': 'Son 4 hafta',
    '3a': 'Son 3 ay',
    '6a': 'Son 6 ay',
    '1y': 'Son 1 yıl',
    tumu: 'Tümü',
  },
  /** Aşama rozeti: "Başlangıç · 5. hafta". */
  stage: (stage: string, week: number) => `${stage} · ${week}. hafta`,
  loadError: 'İlerlemen şu an açılamıyor. Biraz sonra yeniden dene; sürerse antrenörüne haber ver.',
  /** Geçmiş listesi ve antrenmanın detayı (`session-history.ts`). */
  history: {
    ownProgram: 'Kendi programı',
    lastDays: (days: number) => `Son ${days} gün`,
    workouts: (count: string, _n: number) => `${count} antrenman`,
    records: (count: string, _n: number) => `${count} rekor`,
    sets: (count: string, _n: number) => `${count} set`,
    setsOf: (done: string, planned: string, _n: number) => `${done}/${planned} set`,
    skipped: 'geçildi',
    skippedFor: (reason: string) => `geçildi · ${reason}`,
    oneOff: 'bir defalık',
    lighter: 'hafif',
    warmup: 'Isınma',
    effort: (value: string) => `Zorluk ${value}/10`,
    subject: (title: string, sets: string, _n: number) => `${title} · ${sets} set ve özeti`,
    deleteBody: 'Uygulamadan kalkar, geri getirilemez. Antrenörünün veri deposunun geçmişinde kalır.',
    deleteDetail:
      'Deponun eski sürümlerinde ve kayıt notlarında kalır. Programındaki değişiklik kaydı (ör. "Bench Press 60 → 65 kg") silinmez. Rekorların ve önerilerin kalan kayıtlara göre yeniden hesaplanır. Tamamen silinmesi için antrenörüne yaz.',
    deleteSession: 'Bu antrenman silinsin mi?',
    deleteEntry: 'Bu hareket silinsin mi?',
    deleteSet: 'Bu set silinsin mi?',
    set: (label: string) => `Set ${label}`,
  },
  /** İlerleme kartları (`components/progress`): kime göre değişmeyen metinler. */
  cards: {
    achievements: 'Başarılar',
    achievementsSummary: (streak: string, earned: number, total: number) => `${streak}. ${earned}/${total} başarı.`,
    earned: 'Kazanıldı: ',
    notYet: 'Henüz yok: ',
    skipped: (count: number) => `${count} antrenmanın kaydı şu an okunamadı; grafikler ve rekorlar onlarsız.`,
    truncated: (max: number) => `Grafikler ve rekorlar son ${max} antrenmandan.`,
    statWorkouts: (_n: number) => 'antrenman',
    statStreak: (_n: number) => 'haftalık seri',
    statRecords: (_n: number) => 'rekor',
    records: 'Rekorlar',
    recordsTotal: (total: number, shown: number) => `Toplam ${total} rekor; son ${shown} tanesi.`,
    recordsFirst: 'Bir hareketin ilk kaydı başlangıç noktasıdır, rekor sayılmaz.',
    recordsAlso: 'Ayrıca:',
    screening: 'Hareket testi',
    screeningUp: 'bir önceki hareket testine göre iyileşti',
    screeningDown: 'bir önceki hareket testine göre geriledi',
    screeningFocus: 'Odak:',
    screeningPt: 'Sonuç gözlenen noktalardan; toplam ve puan yok.',
    screeningClient: 'Antrenörün temel hareketlerine baktı. Not değil; nereden başlayacağınızın haritası.',
    screeningNone: 'Henüz hareket testi yok.',
    screeningResults: (pt: boolean) => (pt ? 'Hareket testi sonuçları' : 'Hareket testi sonuçların'),
    screeningPrevious: (date: string) => `↑ ↓: bir önceki hareket testine göre (${date}).`,
    screeningPage: 'Hareket sayfası',
    screeningStart: 'Hareket testi yap',
    healthPage: 'Sağlık sayfan',
    muscles: 'Kaslar',
    previousWeek: 'Önceki hafta',
    nextWeek: 'Sonraki hafta',
    thisWeek: 'Bu hafta',
    weekLine: (sessions: number, sets: number) => `${sessions} antrenman · ${sets} set`,
    noWorkoutThisWeek: 'Bu hafta henüz antrenman yok.',
    noWorkoutThatWeek: 'Bu hafta antrenman yok.',
    musclesNote:
      'Bir set hedef kasa 1, yardımcı kasa 0,5, dengeleyici kasa 0,25 sayılır; ısınma hareketleri sayılmaz. Kas başına haftada 10–20 set yeterli aralıktır: altı az, üstü fazla.',
    bands: { low: 'az', enough: 'yeterli', high: 'fazla' },
    muscleSets: (muscle: string, sets: string, _n: number, band: string | null) => `${muscle} · ${sets} set${band ? ` · ${band}` : ''}`,
  },
  /** İlerleme ve Geçmiş sayfaları (`me/(sekmeler)/ilerleme`, `me/(sekmeler)/gecmis`). */
  pages: {
    progress: 'İlerleme',
    records: 'Rekorlar',
    history: 'Geçmiş',
    workout: 'Antrenman',
    sections: 'İlerleme bölümleri',
    loadFailed: 'İlerleme açılamadı',
    aiReview: 'AI değerlendirmesi',
    historyUnavailable: 'Geçmişin şu an açılamıyor',
    workoutUnavailable: 'Antrenman şu an açılamıyor',
    connectionProblem: 'Bağlantında ya da kayıt deposunda bir sorun var. Biraz sonra yeniden dene.',
    historyEmpty: 'Henüz antrenman yok',
    historyEmptyText:
      'Bitirdiğin antrenmanlar burada tarih sırasıyla görünür: süresi, set sayısı, kaldırdığın toplam ağırlık ve rekorların. Birine dokunup setlerini açabilir, istemediğin kaydı silebilirsin.',
    deleted: 'Bu antrenman silinmiş',
    notFound: 'Antrenman bulunamadı',
    deletedText: 'Silinen antrenman uygulamada görünmez.',
    notFoundText: 'Adres yanlış olabilir ya da antrenman silinmiş olabilir.',
    backToHistory: 'Geçmişe dön',
    showMore: (count: string) => `Daha fazla göster (${count})`,
    recordCount: (count: string, _n: number) => `${count} rekor`,
    otherProgram: 'başka program',
    unfinished: 'yarım',
  },
  /** Geçmişteki antrenmanın detayı (`gecmis/[id]/history-detail.tsx`). */
  detail: {
    deletedToast: 'Antrenman silindi',
    deletedToastText: 'Rekorların ve "bu hafta" kalan kayıtlara göre yeniden hesaplandı.',
    waterLess: 'Bir bardak su azalt',
    waterMore: 'Bir bardak su ekle',
    water: (count: string, _n: number) => `${count} su`,
    openSummary: 'Özeti aç',
    done: 'Bitti',
    edit: 'Düzenle',
    delete: 'Sil',
    noSets: 'Bu antrenmanda kayıtlı set kalmadı.',
    program: 'Program',
    setupNote: 'Ayar notun:',
    deleteExercise: (title: string) => `${title} hareketini sil`,
    deleteWarmup: (title: string) => `${title} ısınma setini sil`,
    deleteSet: (title: string, label: string) => `${title} ${label}. seti sil`,
    extra: 'fazladan',
  },
  /** Antrenman takvimi (`components/workout/workout-calendar.tsx`). */
  calendar: {
    title: 'Antrenman takvimi',
    subtitle: 'Kaydedilen günler · Güne dokunarak ayrıntıyı aç.',
    thisMonth: 'Bu ay',
    previousMonth: 'Önceki ay',
    nextMonth: 'Sonraki ay',
    monthDays: 'Ayın günleri',
    day: (date: string, count: number, today: boolean) => `${date} · ${count ? `${count} antrenman` : 'kayıt yok'}${today ? ' · bugün' : ''}`,
    summary: (days: number, sessions: number) => `Bu ay ${days} gün · ${sessions} antrenman. Dinlenme günleri de sürecin bir parçası.`,
    endedEarly: ' · erken bitirildi',
    records: (count: number) => `${count} rekor`,
    noWorkout: 'Bu gün için kaydedilmiş antrenman yok.',
    pickDay: 'İşaretli bir günü seçerek antrenmanlarını görebilirsin.',
  },
  /** Gelişim kartı (`strength-progress.tsx`). */
  strengthCard: {
    title: 'Gelişim',
    period: 'Dönem',
    statsLabel: (period: string) => `${period}: kaslar`,
    statImproved: 'gelişen kas',
    statStable: 'sabit',
    statDeclined: 'geriyen',
    verdictStable: (label: string) => `${label} · belirgin değişim yok`,
    untrained: (muscle: string) => `${muscle} · bu dönemde çalışılmadı`,
    muscleButton: (muscle: string, verdict: string | null) => `${muscle}: ${verdict ?? 'çalışılmadı'}. Hareketleri aç.`,
    mapLabel: (periodIn: string, improved: string | null) => `${periodIn} güç gelişimi: ${improved ? `gelişen ${improved}` : 'gelişen kas yok'}`,
    upTitle: 'En çok gelişen kaslar',
    upEmpty: (periodIn: string) => `${periodIn} belirgin gelişen kas yok. Gelişme, eğilimin olası aralığı tamamen artıda olunca yazılır.`,
    flatTitle: 'Durağan / geriyen',
    flatEmpty: (periodIn: string) => `${periodIn} durağan ya da geriyen kas yok.`,
    unknown: (muscles: string) =>
      `Veri az: ${muscles}. Kasa karar için onu hedef ya da yardımcı olarak çalıştıran bir harekette dönemde en az 4 antrenman günü ve 3 hafta gerekir.`,
    strong: 'Belirgin',
    showAll: (count: number) => `Tümünü göster (${count})`,
    sheetDescription: (period: string, verdict: string, strong: boolean) => `${period}: ${verdict}${strong ? ' (belirgin)' : ''}. Güç gelişimi, hareketlerinden.`,
    circumference: 'Çevre ölçümü',
    noCircumference: 'Bu dönemde bu kasa yakın çevre ölçümünden iki kayıt yok.',
    circumferenceNote: 'Dönemin ilk ve son ölçümü arası. Çevre kas kadar yağla da değişir.',
    workoutDayNoun: 'antrenman günü',
    method: 'Nasıl hesaplanır?',
  },
  /** Hareket başına ilerleme (`exercise-progress.tsx`). */
  exercise: {
    ranges: { '3a': '3 ay', '6a': '6 ay', '1y': '1 yıl', tumu: 'Tümü' },
    workouts: (count: number) => `${count} antrenman`,
    last: (day: string) => `son ${day}`,
    notInLibrary: 'kütüphanede yok',
    title: 'Hareketler',
    change: ', hareketi değiştir',
    chartPick: 'Grafikte ne gösterilsin',
    range: 'Tarih aralığı',
    workoutDayNoun: 'antrenman günü',
    first: 'İlk kayıt:',
    firstTail: (date: string) => `· ${date}. Grafik ikinci antrenman gününden sonra çizilir.`,
    noE1rm: 'Bu dönemde 1–12 tekrarlı set yok; tahmini maksimum hesaplanamıyor.',
    noValue: 'Bu dönemde bu değer için kayıt yok.',
    volumeNote: 'Toplam ağırlık: ısınma hariç her setin ağırlığı × tekrarı, gün başına.',
    firstIsStart: 'İlk kayıt başlangıç noktası',
    pick: 'Hareket seç',
    search: 'Hareket ara',
    noResults: 'Sonuç yok',
    tryAnother: 'Başka bir ad dene.',
    selected: 'seçili',
  },
  /** Grafik kartları (`insight-charts.tsx`). */
  charts: {
    totalWeight: 'Toplam ağırlık',
    workingSets: 'Çalışma seti',
    weeklyLoad: 'Haftalık yük',
    chartPick: 'Grafikte ne gösterilsin',
    firstWeek: (sessions: number, sets: number, kg: string) =>
      `Bu hafta ${sessions} antrenman · ${sets} set${kg ? ` · ${kg}` : ''}. Grafik ikinci haftadan sonra çizilir.`,
    noWeighted: 'Henüz ağırlıklı set yok; vücut ağırlığı ve süreli setler bu toplama girmez. Çalışma setine bakabilirsin.',
    weekly: (label: string) => `Haftalık ${label.toLocaleLowerCase('tr')}`,
    setUnit: 'set',
    weekNoun: 'hafta',
    volumeNote: 'Toplam ağırlık: her çalışma setinin ağırlığı × tekrarı. Set sayısıyla da artar; güç gelişimini Gelişim bölümü gösterir.',
    partialWeek: 'Bu hafta sürüyor: soluk sütun.',
    plan: (days: number) => `Plan: haftada ${days} gün`,
    adherence: 'Antrenman düzeni',
    firstAdherence: (days: number, planned: number | null) =>
      `Bu hafta ${days} gün${planned ? ` (plan ${planned})` : ''}. Grafik ikinci haftadan sonra çizilir.`,
    daysPerWeek: 'Haftada antrenman günü',
    dayUnit: 'gün',
    days: (value: string, _n: number) => `${value} gün`,
    readiness: 'Hazır oluşluk',
    readinessIntro: 'Antrenman başındaki dört sorudan (uyku, enerji, kas ağrısı, stres) puan: 20 en düşük, 100 en iyi.',
    readinessEmpty: (first: string) => `Grafik iki cevaptan sonra çizilir${first ? `; ${first}` : ''}.`,
    averageLead: 'Son 4 haftada ortalama',
    answers: (count: number) => `(${count} cevap).`,
    readinessScore: 'Hazır oluşluk puanı',
    pointsUnit: 'puan',
    workoutDayNoun: 'antrenman günü',
    lowLimit: (low: number) => `Düşük gün sınırı ${low}: altında o günün antrenmanını hafifletmek önerilir.`,
    painBefore: 'Antrenman öncesi',
    painPeak: 'Antrenmanda en yüksek',
    pain: 'Ağrı',
    painEmpty: 'Ağrı soruları antrenman başında ve sonunda sorulur; grafik iki cevaptan sonra çizilir.',
    effort: 'Antrenman zorluğu',
    effortIntro: 'Antrenmandan yaklaşık 10 dakika sonra sorulan zorluk: 0 dinlenme, 10 en zor.',
    effortTail: (count: number) => `/ 10 (${count} antrenman).`,
    effortLabel: 'Zorluk',
    water: 'Su',
    glasses: (value: string, _n: number) => `${value} bardak`,
    glassUnit: 'bardak',
    dailyWater: 'Günlük su',
    dayNoun: 'gün',
  },
  /** `progressCopy`: kime göre değişen metinler. `who`: danışanın adı (PT'de; boşsa `client`). */
  client: 'Danışan',
  copy: (pt: boolean, who: string, minPoints: number, minWeeks: number) => ({
    /* sayfa */
    emptyTitle: pt ? 'Henüz bitmiş antrenman yok' : 'İlerlemen burada görünecek',
    emptyText: pt
      ? `${who} ilk antrenmanını bitirince her hareketin ağırlık grafiği, hangi kasların ne kadar çalıştığı, rekorlar ve başarılar burada birikmeye başlar.`
      : 'İlk antrenmanını bitirdiğinde her hareket için kaldırdığın ağırlığın grafiği, hangi kasları ne kadar çalıştırdığın, rekorların ve başarıların burada birikmeye başlar.',
    firstWorkout: (day: string) => (pt ? `İlk antrenman ${day}` : `İlk antrenmanın ${day}`),

    /* Gelişim */
    strengthIntro: pt
      ? `${who} hangi kasında güç kazandı: hareketlerindeki en iyi setlerin gidişatı.`
      : 'Hangi kasında güç kazandın: hareketlerindeki en iyi setlerin gidişatı.',
    strengthNoData: (periodIn: string) =>
      `${periodIn} karar verecek kadar veri yok. Bir hareketin kararı için dönemde en az ${minPoints} antrenman günü ve ${minWeeks} hafta gerekir; ${pt ? 'daha uzun bir dönem seç.' : 'daha uzun bir dönem seç ya da antrenmanlarına devam et.'}`,
    strengthHint: pt ? 'Bir kas seç: hareketleri ve grafikleri' : 'Bir kasa dokun: hareketleri ve grafikleri',
    strengthFootnote: `Bu güç gelişimidir; kasın büyüdüğünü tek başına göstermez. ${pt ? 'Bir kas seçilince' : 'Bir kasa dokununca'} hareketleri, grafikleri ve hesabın nasıl yapıldığı açılır.`,
    measurementsUnavailable: pt ? 'Ölçümler şu an okunamadı.' : 'Ölçümlerin şu an okunamadı.',

    /* Hareketler */
    exerciseIntro: pt ? 'Bir hareket seç: ağırlık, tekrar ve rekorların gidişatı.' : 'Bir hareket seç: ağırlığının, tekrarlarının ve rekorlarının gidişatı.',
    stageNote: pt ? 'bu hareketteki deneyimi' : 'bu hareketteki deneyimin',
    bestTitle: pt ? 'En iyileri' : 'En iyilerin',
    recordSessions: (count: number, countText: string) => `${countText} antrenmanda rekor ${pt ? 'kırdı' : 'kırdın'}`,
    pickerDescription: pt ? 'Yapılan hareketler, en son yapılan önce.' : 'Yaptığın hareketler, en son yaptığın önce.',
    pickerList: pt ? 'Yapılan hareketler' : 'Yaptığın hareketler',

    /* grafikler */
    unavailable: (what: string) => `${what} şu an okunamadı. ${pt ? 'Biraz sonra sayfayı yenile.' : 'Biraz sonra yeniden dene; sürerse antrenörüne haber ver.'}`,
    weeklyLoadIntro: pt
      ? 'Hafta başına kaldırılan toplam ağırlık ya da yapılan çalışma seti; ısınma setleri hariç.'
      : 'Hafta başına kaldırdığın toplam ağırlık ya da yaptığın çalışma seti; ısınma setleri hariç.',
    workingSetsNote: `Çalışma seti: ısınma hariç ${pt ? 'yapılan' : 'yaptığın'} bütün setler (fazladan setler dahil).`,
    adherenceIntro: pt ? 'Haftada kaç gün antrenman yapıldığı ve plan.' : 'Haftada kaç gün antrenman yaptığın ve planın.',
    adherenceNoPlan: pt
      ? 'Programda haftalık gün sayısı yok; yalnız yapılan günler gösteriliyor.'
      : 'Programında haftalık gün sayısı yok; yalnız yaptığın günler gösteriliyor.',
    adherencePlanNote: `Plan bugünkü ${pt ? 'plandır' : 'planındır'}, geçmiş haftalara da uygulanır. Aynı gün iki antrenman bir gün sayılır.`,
    adherenceWeeksNote: `Bu hafta sürüyor; ${pt ? 'ilk hafta' : 'ilk haftan'} (başlangıç) özete girmez.`,
    readinessWhat: pt ? 'Hazır oluşluk cevapları' : 'Hazır oluşluk cevapların',
    readinessFirst: (score: string) => `${pt ? 'ilk puan' : 'ilk puanın'} ${score}`,
    painIntro: `0 ağrı yok, 10 dayanılmaz. Antrenman öncesi: son 24 saatteki ${pt ? 'ağrı' : 'ağrın'}; antrenmanda: en yüksek ${pt ? 'ağrı' : 'ağrın'}.`,
    painWhat: pt ? 'Ağrı cevapları' : 'Ağrı cevapların',
    painFootnote: pt ? `Ağrı artıyor ya da geçmiyorsa ${who} ile konuş; programı ona göre düzenle.` : 'Ağrın artıyorsa ya da geçmiyorsa antrenörüne söyle.',
    effortEmpty: `${pt ? `${who} antrenman` : 'Antrenman'} sonrası “Nasıl geçti?” sorusunu cevapladıkça burada birikir; grafik iki cevaptan sonra çizilir.`,
    waterIntro: pt
      ? 'Son 30 günde günde kaç bardak su içildiği: Bugün ekranındaki bardaklar ve antrenmandakiler.'
      : "Son 30 günde günde kaç bardak içtiğin: Bugün'deki bardaklar ve antrenmandakiler.",
    waterWhat: pt ? 'Su kaydı' : 'Su kaydın',
    waterEmpty: pt
      ? `${who} Bugün ekranındaki su düğmesiyle ya da antrenmanda bardak ekledikçe burada günlük birikir.`
      : 'Bugün ekranındaki su düğmesiyle ya da antrenmanda eklediğin bardaklar burada günlük birikir.',
    waterDays: (days: number, daysText: string) => `Su ${pt ? 'girilen' : 'girdiğin'} ${daysText} günde ortalama`,
    musclesIntro: pt ? 'Haftada hangi kasın kaç set çalıştığı.' : 'Haftada hangi kası kaç set çalıştırdığın.',
    musclesHint: pt ? 'Bir kas seç: set sayısı' : 'Bir kasa dokun: set sayısı',

    /* rekorlar */
    recordsIntro: pt ? 'Bir hareketteki en iyisinin geçildiği antrenmanlar.' : 'Bir hareketteki en iyini geçtiğin antrenmanlar.',
    recordsEmpty: pt
      ? `Henüz rekor yok. ${who} bir harekette daha ağır kaldırınca ya da aynı ağırlıkta daha çok tekrar yapınca burada görünür.`
      : 'Henüz rekor yok. Bir harekette daha ağır kaldırdığında ya da aynı ağırlıkta daha çok tekrar yaptığında burada görünür.',
  }),
};

export default tr;
