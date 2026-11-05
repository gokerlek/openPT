import type { ClientStatus, HealthField, TrainingExperience } from '../../../lib/schemas/client.ts';
import type { Category, Equipment, Muscle } from '../../../lib/schemas/exercise.ts';
import type { MovementPattern } from '../../../lib/alternatives.ts';
import type { ConditionId, ConditionQualifier } from '../../../lib/conditions.ts';
import type { Weekday } from '../../../lib/day-assignments.ts';
import type { DeepMuscle, DeepMuscleRegion, PosturalPatternId } from '../../../lib/deep-muscles.ts';
import type { DeviceKind } from '../../../lib/device-loads.ts';
import type { Grip, GripWidth } from '../../../lib/grips.ts';
import type { MuscleRole } from '../../../lib/muscles.ts';
import type { LoadScale, MuscleStatusTone, MuscleTier } from '../../../lib/muscle-tiers.ts';
import type { LogKind } from '../../../lib/program-plan.ts';
import type { Effort, ProgressionScheme, SuggestionReason } from '../../../lib/progression.ts';
import type { BlockKind } from '../../../lib/template-plan.ts';

/**
 * Hazır sözlük (katalog): kodla saklanan her şeyin adı — ekipman, tür, kas, derin kas, tutuş, hareket kalıbı, cihaz
 * türü, hafta günü, ilerleme, blok, set düzeni, kardiyo, program, kısıt sözlüğü, danışan durumu. Kodlar kayıtta
 * kalır; ad okuyanın dilinde. Türkçe takma adlar (`MUSCLE_LABELS` …) kendi modüllerinde bu sözlükten türer.
 * Klinik metin (kısıtlar, derin kaslar, postür) için İngilizce bir uzmanın gözünden geçmeli (plan §8.9).
 */
const tr = {
  equipment: {
    barbell: 'Halter',
    dumbbell: 'Dambıl',
    machine: 'Makine',
    cable: 'Kablo',
    band: 'Direnç bandı',
    kettlebell: 'Kettlebell',
    bodyweight: 'Vücut ağırlığı',
    cardio_machine: 'Kardiyo aleti',
  } satisfies Record<Equipment, string>,
  categories: {
    compound: 'Bileşik',
    isolation: 'İzolasyon',
    conditioning: 'Kondisyon',
    warmup: 'Isınma',
    cooldown: 'Soğuma',
  } satisfies Record<Category, string>,
  muscles: {
    chest_upper: 'Üst göğüs',
    chest_lower: 'Alt göğüs',
    delt_front: 'Ön omuz',
    delt_side: 'Yan omuz',
    delt_rear: 'Arka omuz',
    traps_upper: 'Üst trapez',
    traps_mid: 'Orta trapez',
    traps_lower: 'Alt trapez',
    lats_upper: 'Üst kanat',
    lats_mid: 'Orta kanat',
    lats_lower: 'Alt kanat',
    erectors: 'Bel dikleştiricileri',
    quadratus: 'Kuadratus (QL)',
    biceps: 'Biceps',
    triceps_long: 'Triceps uzun baş',
    triceps_lateral: 'Triceps dış baş',
    forearm_flexors: 'Ön kol bükücüleri',
    forearm_extensors: 'Ön kol açıcıları',
    abs_upper: 'Üst karın',
    abs_lower: 'Alt karın',
    obliques: 'Yan karın',
    serratus: 'Serratus',
    glutes: 'Kalça',
    glute_medius: 'Yan kalça',
    hip_flexors: 'Kalça fleksörü',
    quadriceps: 'Ön bacak',
    adductors: 'İç bacak',
    hamstrings_medial: 'Arka bacak (iç)',
    hamstrings_lateral: 'Arka bacak (dış)',
    gastroc_medial: 'Baldır (iç)',
    gastroc_lateral: 'Baldır (dış)',
    soleus: 'Soleus',
    tibialis: 'Kaval',
    neck: 'Boyun ön yüzü (SCM)',
    nape: 'Ense (üst trapez/levator)',
    cardio: 'Kardiyo',
  } satisfies Record<Muscle, string>,
  /** Kas bölgeleri (`MUSCLE_GROUPS`). */
  muscleGroups: {
    chest: 'Göğüs',
    shoulders: 'Omuz',
    back: 'Sırt',
    arms: 'Kol',
    core: 'Karın',
    legs: 'Kalça ve bacak',
    neck: 'Boyun',
    other: 'Diğer',
  },
  /** Birden çok parçalı kaslar (`MUSCLE_FAMILIES`). */
  muscleFamilies: {
    chest: 'Göğüs',
    shoulders: 'Omuz',
    traps: 'Trapez',
    lats: 'Kanat',
    lowerBack: 'Bel',
    triceps: 'Triceps',
    forearms: 'Ön kol',
    abs: 'Karın',
    hamstrings: 'Arka bacak',
    calves: 'Baldır',
    neck: 'Boyun',
  },
  muscleRoles: {
    primary: 'Hedef',
    secondary: 'Yardımcı',
    stabilizer: 'Dengeleyici',
  } satisfies Record<MuscleRole, string>,
  /** Kas haritasının açıklaması (`muscle-tiers.ts`). */
  muscleMap: {
    loadTiers: {
      session: { filled: '3 set ve üstü', striped: '1,5–2,75 set', dotted: '1,5 setten az' },
      weekly: { filled: '10 set ve üstü', striped: '5–9,75 set', dotted: '5 setten az' },
    } satisfies Record<LoadScale, Record<MuscleTier, string>>,
    loadDescription: 'Kas başına çalışma seti: hedef 1, yardımcı 0,5, dengeleyici 0,25 sayılır; ısınma ve soğuma hareketleri sayılmaz.',
    statuses: {
      strong: 'Belirgin gelişme (%5 ve üstü)',
      improved: 'Gelişme',
      stable: 'Sabit',
      declined: 'Gerileme',
    } satisfies Record<MuscleStatusTone, string>,
    noData: 'Veri az ya da çalışılmadı',
    /** Ekran okuyucu adı: "{önek}: en çok çalışan kaslar". */
    loadLabel: (prefix: string, muscles: string) => `${prefix}: ${muscles}`,
    noLoad: (prefix: string) => `${prefix}: kas yükü yok`,
    worked: (muscles: string) => `Çalışan kaslar: ${muscles}`,
    noneMarked: 'Belirli bir kas grubu işaretlenmedi',
    /** Açıklamada kasın set değeri ("6 set", "2,5 set"); `text` biçimlenmiş sayı. */
    sets: (_count: number, text: string) => `${text} set`,
  },
  deepMuscles: {
    rotator_cuff_supraspinatus: 'Supraspinatus',
    rotator_cuff_external: 'Dış rotatorlar (infraspinatus, teres minor)',
    rotator_cuff_subscapularis: 'Subscapularis',
    rhomboids: 'Romboidler',
    pec_minor: 'Pektoralis minor',
    levator_scapulae: 'Levator skapula',
    deep_neck_flexors: 'Derin boyun fleksörleri',
    multifidus: 'Multifidus',
    transversus_abdominis: 'Transversus abdominis',
    pelvic_floor: 'Pelvik taban',
    diaphragm: 'Diyafram',
    tfl: 'TFL (tensor fascia latae)',
    deep_hip_rotators: 'Derin kalça rotatorları (piriformis vb.)',
    tibialis_posterior: 'Tibialis posterior',
    peroneals: 'Peroneal kaslar',
  } satisfies Record<DeepMuscle, string>,
  deepMuscleRegions: {
    shoulder: 'Omuz ve kürek',
    neck: 'Boyun',
    trunk: 'Gövde',
    hip: 'Kalça',
    ankle: 'Ayak bileği',
  } satisfies Record<DeepMuscleRegion, string>,
  deepMuscleNotes: {
    transversus_abdominis:
      'Tanımlamak için var, izole çalıştırmak için değil: hollowing yerine bracing desteklenir (bracing stabiliteyi %32 artırıyor, TrA’nın tek başına katkısı %0,14).',
    multifidus: 'Bel ağrısında atrofiye uğrar; bird dog gibi nötr omurgalı işlerde hedeflenir.',
    rotator_cuff_external: 'Sıkışmada asıl çalıştırılacak grup budur; deltoid değil.',
    pec_minor: 'Üst çapraz paterninde kısalır, omzu öne-aşağı çeker.',
    tfl: 'Diz valgusunda aşırı aktif olduğu EMG ile desteklenen az sayıdaki bulgudan biri.',
    pelvic_floor: 'Doğum sonrası ve intraabdominal basınç çalışmalarında diyaframla birlikte ele alınır.',
    diaphragm: 'Nefes paterni: bracing ve IAP’nin temeli.',
  } satisfies Partial<Record<DeepMuscle, string>>,
  posturalPatterns: {
    upper_crossed: {
      label: 'Üst çapraz patern (öne baş, yuvarlak omuz)',
      note: 'Janda’nın tanımı klinikte yaygın; nedensellik (gergin kas zayıfı inhibe eder) doğrulanmadı. Bulgu olarak kullan, yasak gerekçesi yapma.',
    },
    lower_crossed: {
      label: 'Alt çapraz patern (anterior pelvik tilt)',
      note: 'Tek postür fotoğrafına dayanıyorsa karar verdirme; en az üç doğrulayıcı bulgu iste.',
    },
    dynamic_knee_valgus: {
      label: 'Dinamik diz valgusu (diz içeri kaçıyor)',
      note: 'EMG adduktor ve kuadriseps artışını doğruluyor; gluteus medius zayıflığının neden mi sonuç mu olduğu belirsiz.',
    },
    scapular_dyskinesis: {
      label: 'Skapular diskinezi (kürek kontrolü bozuk)',
      note: 'Ağrısız diskinezi tek başına yasak gerekçesi değildir; baş üstü işte kontrol kurulana kadar uyarı üretir.',
    },
    foot_pronation: {
      label: 'Ayak içe basma (pronasyon)',
      note: 'Ayak bileği dorsifleksiyon kısıtıyla birlikte değerlendirilir; squat’ta topuk yükseltmek ilk denenecek çözümdür.',
    },
  } satisfies Record<PosturalPatternId, { label: string; note: string }>,
  grips: {
    pronated: 'Pronasyon (avuç aşağı)',
    supinated: 'Supinasyon (avuç yukarı)',
    neutral: 'Nötr (avuçlar içe)',
    mixed: 'Karışık (bir avuç aşağı, biri yukarı)',
  } satisfies Record<Grip, string>,
  gripWidths: {
    narrow: 'Dar',
    shoulder: 'Omuz genişliği',
    wide: 'Geniş',
  } satisfies Record<GripWidth, string>,
  /** Tutuş ve genişlik birlikte: "Geniş pronasyon (avuç aşağı)". */
  gripWithWidth: (width: string, grip: string) => `${width} ${grip.toLocaleLowerCase('tr')}`,
  patterns: {
    horizontal_push: 'Yatay itiş',
    vertical_push: 'Dikey itiş',
    chest_fly: 'Göğüs açma',
    horizontal_pull: 'Yatay çekiş',
    vertical_pull: 'Dikey çekiş',
    lateral_raise: 'Omuz kaldırma',
    rear_delt: 'Arka omuz açma',
    shrug: 'Trapez kaldırma',
    squat: 'Squat',
    hinge: 'Kalça menteşesi',
    lunge: 'Tek bacak',
    hip_extension: 'Kalça itişi',
    hip_abduction: 'Kalça açma',
    hip_adduction: 'Kalça kapama',
    knee_extension: 'Diz açma',
    knee_flexion: 'Diz bükme',
    calf_raise: 'Baldır kaldırma',
    elbow_flexion: 'Dirsek bükme',
    elbow_extension: 'Dirsek açma',
    carry: 'Taşıma',
    core_flexion: 'Karın bükme',
    core_stability: 'Karın sabitleme',
    core_rotation: 'Gövde döndürme',
    anti_extension: 'Anti-ekstansiyon (belin çökmesine direnç)',
    anti_rotation: 'Anti-rotasyon (dönmeye direnç)',
    anti_lateral_flexion: 'Anti-lateral fleksiyon (yana eğilmeye direnç)',
    cardio: 'Kardiyo',
    mobility: 'Mobilite ve esneme',
    other: 'Diğer',
  } satisfies Record<MovementPattern, string>,
  deviceKinds: {
    selectorized: 'Ağırlık bloklu makine',
    cable: 'Kablo',
    plate_loaded: 'Plaka yüklemeli makine',
    barbell: 'Bar',
    dumbbell: 'Dambıl seti',
    kettlebell: 'Kettlebell seti',
    bodyweight: 'Ekipmansız istasyon',
    band: 'Direnç bandı',
    cardio: 'Kardiyo aleti',
  } satisfies Record<DeviceKind, string>,
  /** Cihazın ağırlık ayarının anlatımı (`describeDeviceLoads`); ağırlıklar biçimlenmiş gelir ("5 kg"). */
  deviceLoads: {
    addOns: (list: string) => ` · ara ağırlık ${list}`,
    stack: (base: string, max: string, step: string, addOns: string) => `Blok ${base}–${max}, ${step} adım${addOns}`,
    singlePulley: 'tek makara (1:1)',
    pulley: (ratio: number) => `${ratio}:1 makara — kolda ${ratio === 2 ? 'yarısı' : `1/${ratio}'i`} hissedilir`,
    cable: (stack: string, pulley: string) => `${stack} · ${pulley}`,
    plateLoaded: (sled: string, step: string, max: string | null) => `Kızak ${sled}, en küçük artış ${step}${max ? `, en çok ${max}` : ''}`,
    barbell: (bar: string, step: string) => `Bar ${bar}, en küçük artış ${step}`,
    noWeights: 'Ağırlık listesi boş',
    weights: (count: number, min: string, max: string) => `${count} ağırlık: ${min}–${max}`,
    noSettings: 'Ağırlık ayarı yok',
  },
  weekdays: {
    short: { 1: 'Pzt', 2: 'Sal', 3: 'Çar', 4: 'Per', 5: 'Cum', 6: 'Cmt', 7: 'Paz' } satisfies Record<Weekday, string>,
    long: {
      1: 'Pazartesi',
      2: 'Salı',
      3: 'Çarşamba',
      4: 'Perşembe',
      5: 'Cuma',
      6: 'Cumartesi',
      7: 'Pazar',
    } satisfies Record<Weekday, string>,
    /** Program geçmişinin cümlesi (`weekdaysChangeText`): "Antrenman günleri: Pzt, Çar → Sal, Per". */
    set: (to: string) => `Antrenman günleri: ${to}`,
    removed: (from: string) => `Antrenman günleri kaldırıldı (önce ${from})`,
    changed: (from: string, to: string) => `Antrenman günleri: ${from} → ${to}`,
  },
  progression: {
    efforts: {
      easy: 'Kolay',
      good: 'İyi',
      hard: 'Zor',
      fail: 'Başaramadım',
      unknown: 'Belirtilmedi',
    } satisfies Record<Effort, string>,
    schemes: {
      double: 'Çift ilerleme',
      linear: 'Doğrusal',
      none: 'İlerleme yok',
    } satisfies Record<ProgressionScheme, string>,
    rir: {
      0: 'Tükenişe kadar',
      1: '1 tekrar yedekte',
      2: '2 tekrar yedekte',
      3: '3 tekrar yedekte',
      4: '4 tekrar yedekte',
    },
    reasons: {
      first_time: 'İlk kez: rahat bir ağırlıkla başla.',
      range_increase: 'Tekrar aralığı değişti: ağırlık son antrenmandan çevrildi, en çok iki adım artıyor.',
      increase: 'Hedefe ulaşıldı: ağırlık artıyor.',
      add_rep: 'Aynı ağırlık, bir tekrar daha.',
      add_time: 'Aynı hareket, biraz daha uzun.',
      hold: 'Hedefin altında kaldı: aynı ağırlıkla tekrar dene.',
      incomplete: 'Antrenman tamamlanmadı: artış yok, aynı ağırlıkla tekrar dene.',
      decrease: 'Çok zorladı: ağırlık biraz azalıyor.',
      deload: 'Üst üste tıkandı: hafif bir antrenman.',
      harder_variant: 'Aralığın tepesine ulaşıldı: ağırlık ekle ya da zor bir varyasyona geç.',
      device_max: 'Cihazın en ağır ayarındasın: tekrarları artır ya da zor bir varyasyona geç.',
      no_progression: 'Bu hareket için ilerleme yok.',
      confirm_increase: 'Tepeye ulaştın; bir kez daha yap, sonra artır.',
      calibrate: 'Aradan sonra ilk antrenman: son ağırlığın biraz altında ayar.',
      reps_first: 'Sonraki ağırlık büyük bir sıçrama: önce tekrar ekle.',
      lighter_retry: 'Geçen sefer plandan hafifti: planı bir kez daha dene.',
      lighten: 'Bugün hafif: ağırlık yaklaşık %15 az, 3 ve üstü setli harekette bir set eksik.',
      pain_hold: 'Ağrı ya da irritabilite yükselmiş: artırma yok, aynı yükte kal.',
      pain_reduce: 'Ağrı eşiği aşıldı ya da 24 saatte geçmedi: yük %15 azaldı.',
      pain_reduce_unavailable:
        'Ağrı eşiği aşıldı ya da 24 saatte geçmedi; yük azaltılamadı (zaten en hafif ayarda): tekrar ya da set sayısını azalt.',
      paused: 'Bugün yük verilmiyor: önce değerlendirme gerekli.',
    } satisfies Record<SuggestionReason, string>,
    /** Set düzeninin kuralları (`describeSetRules`). */
    percentSets: 'Yüzdeli setler tam yükteki setin ağırlığını izler; ağırlık artışına yalnız tam yükteki setler karar verir.',
    amrapSets: (weighted: string) => `AMRAP sette zorluk düğmesi tıkanma sayılmaz; alt sınırın altında kalınırsa tıkanma sayılır.${weighted}`,
    amrapWeighted: (extraReps: number) => ` Aralığın ${extraReps}+ tekrar üstüne çıkılırsa ağırlık iki adım artar.`,
    /** Kuralın anlatımı (`describeRule`). `range`: "8–12 tekrar", "30 sn". */
    range: (min: number, max: number, duration: boolean) => {
      const unit = duration ? 'sn' : 'tekrar';
      return min === max ? `${min} ${unit}` : `${min}–${max} ${unit}`;
    },
    noProgression: (range: string) => `Hedef ${range}. İlerleme yok: her antrenmanda aynı hedef.`,
    toFailure: ' Setler tükenişe kadar yapılır.',
    inReserve: (rir: number) => ` Set sonunda ~${rir} tekrar yedekte kalsın.`,
    nextDeviceWeight: 'cihazdaki bir sonraki ağırlığa çıkar',
    stepUp: (kg: string) => `${kg} artar`,
    linearGrowth: (amount: string) => `Her başarılı antrenmanda ağırlık ${amount}.`,
    doubleGrowth: (max: number, amount: string, min: number) =>
      `Bütün setlerde ${max} tekrara ulaşınca ağırlık ${amount} ve tekrar hedefi yeniden ${min} olur; ulaşılmadıysa aynı ağırlıkla bir tekrar daha.`,
    weighted: (range: string, growth: string, stalls: number, deloadPct: number, effort: string) =>
      `Hedef ${range}. ${growth} Hedefin altında kalınırsa ağırlık korunur; ${stalls} antrenman üst üste tıkanırsa %${deloadPct} hafifletilir.${effort}`,
    durationGrowth: (step: number, max: number) => `Her antrenmanda ${step} sn eklenir; ${max} sn'ye ulaşınca zor bir varyasyona geç.`,
    repsGrowth: (max: number) => `Her antrenmanda bir tekrar eklenir; ${max} tekrara ulaşınca ağırlık ekle ya da zor bir varyasyona geç.`,
    plain: (range: string, growth: string, effort: string) => `Hedef ${range}. ${growth}${effort}`,
  },
  blocks: {
    kinds: {
      single: 'Tek hareket',
      superset: 'Süperset',
      circuit: 'Devre',
      complex: 'Kompleks',
    } satisfies Record<BlockKind, string>,
    hints: {
      superset: 'İki hareket arka arkaya; dinlenme turun sonunda.',
      circuit: 'İstasyonlar arasında kısa geçiş; dinlenme turun sonunda.',
      complex: 'Aynı ağırlıkla ara vermeden; dinlenme turun sonunda.',
    } satisfies Record<Exclude<BlockKind, 'single'>, string>,
    shapeProblems: {
      single: 'Tek hareketlik blokta bir hareket olur.',
      superset: 'Süperset iki hareketten oluşur.',
      circuit: 'Devre 3 ile 8 hareket arasında olur.',
      complex: 'Kompleks 2 ile 6 hareket arasında olur.',
    } satisfies Record<BlockKind, string>,
    /** Grupta seti erken biten hareketler: "Leg Curl 3 sette biter; sonraki turlarda atlanır." */
    skipItem: (title: string, _count: number, text: string) => `${title} ${text}`,
    skipNote: (items: string) => `${items} sette biter; sonraki turlarda atlanır.`,
    /** Bloğun anlatımı (`describeBlock`); sayılar biçimlenmiş gelir. */
    sets: (_count: number, text: string) => `${text} set`,
    rounds: (_count: number, text: string) => `${text} tur`,
    rest: (rest: string | null, afterRound: boolean) => `${afterRound ? 'tur sonunda ' : ''}${rest === null ? 'dinlenme yok' : `${rest} dinlenme`}`,
    betweenStations: (rest: string | null) => (rest === null ? 'istasyon arası ara yok' : `istasyon arası ${rest}`),
    complexNote: 'ara vermeden, aynı ağırlıkla',
    /** Kayıtta denetim (`normalizeTemplate`). */
    missingExercise: 'Bu egzersiz kütüphanede yok; kartı sil, yerine yenisini ekle.',
    repsMax: (max: number) => `Tekrar hedefi en fazla ${max}.`,
    missingDevice: 'Bu cihaz artık yok.',
  },
  /** Süre ve hedef: "Ara yok", "45 sn", "1 dk 30 sn"; "8–12 tekrar". */
  time: {
    noRest: 'Ara yok',
    seconds: (text: string) => `${text} sn`,
    minutes: (text: string) => `${text} dk`,
    minutesSeconds: (minutes: string, seconds: string) => `${minutes} dk ${seconds} sn`,
    /** Birim kısaltması: hedefte sayının ardından ("8–12 tekrar", "30 sn", "30 dk"). */
    reps: (_count: number) => 'tekrar',
    secondsUnit: 'sn',
    minutesUnit: 'dk',
  },
  percent: (text: string) => `%${text}`,
  /** Setlerin anlatımı (`set-plan.ts`). `positions`: 1'den sayılan set sıraları. */
  setPlan: {
    asManyAsYouCan: 'yapabildiğin kadar',
    lastSetAsMany: 'son sette yapabildiğin kadar',
    everySetAsMany: 'her sette yapabildiğin kadar',
    someSetsAsMany: (positions: readonly number[]) => `${positions.map((position) => `${position}.`).join(', ')} sette yapabildiğin kadar`,
    lastSetAmrap: 'son set AMRAP',
    allAmrap: 'hepsi AMRAP',
    someAmrap: (positions: readonly number[]) => `AMRAP: ${positions.map((position) => `${position}.`).join(', ')} set`,
    pyramid: (from: string, to: string) => `piramit ${from} → ${to}`,
    pyramidList: (list: string) => `piramit ${list}`,
    backoff: (pct: string) => `back-off ${pct}`,
    load: (list: string) => `yük ${list}`,
  },
  cardio: {
    needsTime: 'Mesafe için süre de girilmeli.',
    tooFast: (distance: string, walk: boolean, maxKmh: number) =>
      `${distance} bu sürede olmaz: ${walk ? 'yürüyüş ve koşuda' : 'kardiyoda'} hız en fazla ${maxKmh} km/sa.`,
  },
  program: {
    logKinds: {
      create: 'Oluşturuldu',
      edit: 'Düzenlendi',
      phase: 'Evre geçişi',
      client: 'Danışan güncelledi',
      share: 'Paylaşım',
    } satisfies Record<LogKind, string>,
    /** Varsayılan adlar (veriye yazılır, yazanın dilinde): "Evre 1", "Program A". */
    phaseName: (n: number) => `Evre ${n}`,
    dayName: (letter: string) => `Program ${letter}`,
    copyName: (name: string) => `${name} kopyası`,
    created: 'Program oluşturuldu',
    createdFrom: (quoted: string, count: number, more: number) =>
      `Program oluşturuldu: ${quoted} ${count === 1 ? 'şablonundan' : 'şablonlarından'}${more > 0 ? ` … ve ${more} şablon daha` : ''}`,
    droppedDevices: (count: number, unsaved: boolean) =>
      `${count} satırın cihazı silinmiş; egzersizin kendi cihazına döndü.${unsaved ? ' Kaydedince kalıcı olur.' : ''}`,
    phaseOpen: (week: number) => `${week}. hafta · süresiz`,
    phaseRunning: (week: number, weeks: number) => `${week}. hafta / ${weeks}`,
    phaseEnded: (weeks: number) => `Süresi doldu (${weeks} hafta)`,
    frequency: (days: number) => `Haftada ${days} gün`,
    currentPhase: (from: string, to: string) => `Şu anki evre: '${from}' → '${to}'`,
    moreChanges: (count: number) => `… ve ${count} değişiklik daha`,
    clientDaysRemoved: (days: string) => `Danışanın günleri kaldırıldı (${days})`,
  },
  conditions: {
    lumbar_disc_herniation: {
      label: 'Lomber disk hernisi',
      note: 'Yüklü fleksiyon ve fleksiyon+rotasyon birleşimi disk hasarını ilerletir.',
    },
    lumbar_disc_herniation_with_radiculopathy: {
      label: 'Radikülopatili disk hernisi (bacağa yayılan ağrı)',
      note: 'Semptom periferikleşiyorsa (aşağı yayılıyorsa) program durur.',
    },
    flexion_intolerant_back: {
      label: 'Fleksiyon intoleranslı bel',
      note: 'Provokasyon testiyle doğrulanmış olmalı; genel fleksiyon yasağı herkese uygulanmaz.',
    },
    lumbar_spondylolisthesis: {
      label: 'Spondilolistezis / kesme kuvvetine duyarlı omurga',
      note: 'Yüksek shear ve yüklü ekstansiyon kaçınılır.',
    },
    lumbar_stenosis: { label: 'Lomber stenoz', note: 'Ekstansiyon intoleransı tipiktir; fleksiyon genelde rahatlatır.' },
    chronic_nonspecific_low_back_pain: {
      label: 'Kronik non-spesifik bel ağrısı',
      note: 'Yürüyüş bileşeni nüksü azaltır (WalkBack RKÇ).',
    },
    si_joint_pain: { label: 'Sakroiliak eklem ağrısı' },
    cauda_equina_or_progressive_neuro_deficit: {
      label: 'Kauda ekina şüphesi / ilerleyici nörolojik defisit',
      note: 'Egzersiz yok; acil tıbbi değerlendirme.',
    },
    cervical_pain: { label: 'Boyun ağrısı' },
    cervical_radiculopathy: { label: 'Servikal radikülopati' },
    upper_crossed_pattern: {
      label: 'Üst çapraz patern (öne baş, yuvarlak omuz)',
      note: 'Bulgu; yasak değil. Skapular kontrol kurulana kadar baş üstü itişte uyarı.',
    },
    thoracic_extension_deficit: {
      label: 'Torasik ekstansiyon kısıtı',
      note: 'Baş üstü hareketlerde açığı bel hiperekstansiyonu kapatır.',
    },
    subacromial_pain_syndrome: {
      label: 'Subakromiyal ağrı sendromu (sıkışma)',
      note: 'Ense arkası hareketler ve dar tutuş upright row kategorik olarak dışarıda.',
    },
    rotator_cuff_tendinopathy: { label: 'Rotator manşet tendinopatisi' },
    anterior_shoulder_instability: {
      label: 'Anterior omuz instabilitesi',
      note: '90° abduksiyon + son aralık dış rotasyon (apprehension) pozisyonu yasak.',
    },
    multidirectional_shoulder_instability: { label: 'Multidireksiyonel omuz instabilitesi' },
    ac_joint_injury: { label: 'AC eklem sorunu' },
    scapular_dyskinesis: { label: 'Skapular diskinezi', note: 'Tek başına bulgu; ağrısızsa yasak gerekçesi değildir.' },
    lateral_epicondylitis: { label: 'Lateral epikondilit (tenisçi dirseği)' },
    wrist_pain: { label: 'El bileği ağrısı' },
    lower_crossed_pattern: {
      label: 'Alt çapraz patern (anterior pelvik tilt)',
      note: 'Bulgu; tek postür fotoğrafına dayanıyorsa karar verdirmez.',
    },
    hip_impingement_fai: { label: 'Kalça sıkışması (FAI)', note: 'Derin kalça fleksiyonunda semptom verir.' },
    patellofemoral_pain: { label: 'Patellofemoral ağrı (ön diz ağrısı)' },
    patellar_tendinopathy: { label: 'Patellar tendinopati' },
    acl_reconstruction_early: {
      label: 'ACL rekonstrüksiyonu erken dönem (0–12 hafta)',
      note: 'Açık zincir diz ekstansiyonu haftaya ve ROM penceresine bağlı.',
    },
    knee_osteoarthritis: { label: 'Diz osteoartriti' },
    degenerative_meniscal_tear: { label: 'Dejeneratif menisküs yırtığı (kilitlenme yok)' },
    acute_meniscus_tear: { label: 'Akut menisküs yırtığı', note: 'Kilitlenme/blokaj varsa egzersiz yok.' },
    meniscus_repair_postop: { label: 'Menisküs onarımı sonrası' },
    acute_knee_effusion: { label: 'Dizde akut şişlik (efüzyon)', note: 'Efüzyon kuadriseps inhibisyonu yapar; yük artırılmaz.' },
    dynamic_knee_valgus: { label: 'Dinamik diz valgusu', note: 'Bulgu; nöromüsküler çalışmayla düzeltilir.' },
    ankle_dorsiflexion_restriction: {
      label: 'Ayak bileği dorsifleksiyon kısıtı',
      note: 'Derin squat’ta topuk yükseltilmezse açık belden kapanır.',
    },
    hypertension: { label: 'Hipertansiyon', note: 'Valsalva ile ağır eksenel yük kan basıncını ani yükseltir.' },
    pregnancy_second_third_trimester: { label: 'Gebelik (2. ve 3. trimester)' },
    movement_screen_pain_flag: { label: 'Hareket testinde ağrı', note: 'Hareket testinde ağrı: önce değerlendirme.' },
  } satisfies Record<ConditionId, { label: string; note?: string }>,
  conditionQualifiers: {
    acute: 'akut',
    reactive: 'reaktif',
    severe: 'şiddetli',
    stable: 'sakin dönem',
    controlled: 'kontrollü',
    uncontrolled: 'kontrolsüz',
    postop: 'ameliyat sonrası',
  } satisfies Record<ConditionQualifier, string>,
  /** Kısıt adı ve niteleyicisi: "Diz osteoartriti (şiddetli)". */
  conditionWithQualifier: (label: string, qualifier: string) => `${label} (${qualifier})`,
  clientStatuses: {
    active: 'Aktif',
    paused: 'Duraklatıldı',
    archived: 'Arşivde',
  } satisfies Record<ClientStatus, string>,
  /** Sağlık modülünün parçaları; açıklamalar danışanın onay metni (sürümü `HEALTH_FIELD_VERSIONS`). */
  healthFields: {
    conditions: {
      label: 'Kısıtlar',
      description: 'Sakatlık, rahatsızlık ve kaçınılacak hareketler; antrenörün programı bunlara göre yazar, sen de bildirebilirsin.',
    },
    readiness: {
      label: 'Hazır oluşluk',
      description: 'Antrenman öncesi uyku, enerji, kas ağrısı ve stres (1–5); kötü günde yük önerisi hafifler.',
    },
    check_in: {
      label: 'Ağrı takibi',
      description: 'Ağrı seviyesi, belirtilerin yönü ve kırmızı bayrak soruları; ağrı artarsa yük durur.',
    },
    measurements: { label: 'Ölçümler', description: 'Beden çevreleri, performans testleri ve anket skorları.' },
    screening: {
      label: 'Hareket taraması',
      description: 'Temel hareketlerin sonucu, sağ-sol farkı ve ağrı notu; antrenörün nereden başlayacağını buna göre seçer.',
    },
  } satisfies Record<HealthField, { label: string; description: string }>,
  trainingExperiences: {
    new: 'Yeni başlıyor',
    six_months: '6 ay ve üstü',
    one_year: '1 yıl ve üstü',
  } satisfies Record<TrainingExperience, string>,
};

export default tr;
