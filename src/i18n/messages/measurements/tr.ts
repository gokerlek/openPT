import type { MeasurementDef, MeasurementId } from '../../../lib/measurements.ts';
import type { MeasurementAlert, TrendVerdict } from '../../../lib/measurement-trends.ts';
import type { ChangeKind } from '../../../lib/measurement-trends.ts';
import type { PoseTask } from '../../../lib/pose/protocols.ts';
import type { Quality } from '../../../lib/pose/geometry.ts';

/**
 * Ölçümler: elle girilen ölçüm kataloğu (ad, sıklık, not), birimler, hata payı kaynakları, ölçüm ekranlarının
 * metinleri; kamera ölçümü (protokoller, açılar, yönergeler, sihirbaz, geçmiş). Klinik ve antropometrik terimler için
 * İngilizce bir uzmanın gözünden geçmeli (plan §8.9).
 */

type DefText = { label: string; frequency: string; note?: string };
type ProtocolText = { title: string; subtitle: string; instructions: readonly string[] };

const lower = (text: string) => text.toLocaleLowerCase('tr');
/** Türkçe sayı yazımında yüzde işareti başta: "%12". */
const percent = (text: string) => `%${text}`;

const camera = ['Telefonu düz ve sabit yerleştir; çekim boyunca oynatma.', 'Başın ve ayakların dahil vücudun görünür olsun.'];
const movement =
  'Başlangıç konumundan rahat ve ağrısız sınırında yavaşça hareket et, sonra başlangıca dön. Üç tam tekrar yap; istediğin an durabilirsin.';
const checks = ['Başım ve ayaklarım kadrajda.', 'Telefon düz ve sabit duruyor.', 'Işık yeterli; eklemlerim görünür.'];

const tr = {
  defs: {
    body_mass: { label: 'Vücut ağırlığı', frequency: 'Ayda bir, sabah aç karnına' },
    stature: { label: 'Boy', frequency: 'İlk görüşmede' },
    waist_girth: { label: 'Bel çevresi', frequency: 'Ayda bir', note: 'En dar yer; normal soluk verişin sonunda.' },
    hip_girth: { label: 'Kalça çevresi', frequency: 'Ayda bir', note: 'Kalçanın en geniş yeri.' },
    arm_relaxed_girth: { label: 'Kol çevresi (gevşek)', frequency: 'Ayda bir' },
    arm_flexed_girth: { label: 'Kol çevresi (kasılı)', frequency: 'Ayda bir' },
    mid_thigh_girth: { label: 'Uyluk çevresi (orta)', frequency: 'Ayda bir' },
    calf_girth: { label: 'Baldır çevresi', frequency: 'Ayda bir' },
    sit_to_stand_5x: {
      label: '5 tekrar otur-kalk',
      frequency: 'Üç ayda bir',
      note: 'Kollar göğüste çapraz. 2,3 sn altındaki değişim ölçüm hatasıdır.',
    },
    trunk_flexor_endurance: { label: 'Gövde fleksör dayanıklılığı', frequency: 'Üç ayda bir' },
    trunk_extensor_endurance: {
      label: 'Gövde ekstansör dayanıklılığı (Biering-Sørensen)',
      frequency: 'Üç ayda bir',
      note: 'Önce bir alıştırma seansı: güvenilirlik 0,82 → 0,96.',
    },
    side_bridge_endurance: { label: 'Yan köprü dayanıklılığı', frequency: 'Üç ayda bir' },
    weight_bearing_lunge: {
      label: 'Ayak bileği dorsifleksiyonu (duvar lunge testi)',
      frequency: 'Üç ayda bir',
      note: 'Topuk yerde, diz duvara değerken ayak başparmağının duvara uzaklığı.',
    },
    odi: { label: 'Oswestry (bel)', frequency: 'Dört haftada bir' },
    spadi: { label: 'SPADI (omuz)', frequency: 'Dört haftada bir' },
    visa_p: { label: 'VISA-P (patellar tendon)', frequency: 'Dört haftada bir' },
  } satisfies Record<MeasurementId, DefText>,
  /** Katalog birimi → ekranda görünen ("s" Türkçede "sn"); `puan` kayıtta koddur. */
  units: { kg: 'kg', cm: 'cm', s: 'sn', '%': '%', puan: 'puan' } satisfies Record<MeasurementDef['unit'], string>,
  groups: {
    anthropometry: {
      title: 'Antropometri',
      description: 'Ağırlık, boy ve çevre ölçüleri. Takip ölçümlerini mümkünse hep aynı kişi alır.',
    },
    performance: {
      title: 'Performans',
      description: 'Otur-kalk ve gövde dayanıklılık testleri, saniye olarak.',
    },
    mobility: {
      title: 'Hareketlilik',
      description: 'Ayak bileği dorsifleksiyonu; sağ ve sol ayrı ölçülür.',
    },
    questionnaire: {
      title: 'Anketler',
      description: 'Skoru sen girersin; anketlerin metni lisanslı olabildiği için uygulamada yok.',
    },
  } satisfies Record<MeasurementDef['group'], { title: string; description: string }>,
  sides: { left: 'Sol', right: 'Sağ' },
  sexes: { unknown: 'Belirtilmedi', female: 'Kadın', male: 'Erkek' },
  /** Ölçüm hatası eşiklerinin ekrandaki kaynağı. */
  noiseSources: {
    endurance: 'Gövde dayanıklılık testlerinde tipik hata %12–24',
    waist: 'WHO: bel çevresinde teknik ölçüm hatası ~1,3–1,6 cm',
    hip: 'WHO: kalça çevresinde teknik ölçüm hatası ~1,2–1,4 cm',
    sitToStand: '5 tekrar otur-kalk: en küçük saptanabilir ve anlamlı fark 2,3 sn',
  },
  /** Değer denetimi ve şema mesajları. */
  validation: {
    sideRequired: 'Sol ya da sağ taraf belirtilmeli.',
    noSide: 'Bu ölçüm tek değerdir; taraf yok.',
    duplicate: 'Aynı ölçüm iki kez girilmiş.',
    chooseDate: 'Tarih seç.',
    validDate: 'Geçerli bir tarih seç.',
    sex: 'Cinsiyeti seç.',
    side: 'Taraf sol ya da sağ olmalı.',
    atLeastOne: 'En az bir ölçüm gir.',
    tooMany: 'Çok fazla değer.',
    futureDate: 'Gelecek bir güne ölçüm girilemez.',
  },
  /** Ölçüm ekranlarının ortak cümleleri (`measurement-text.ts`). */
  text: {
    /** "Bel çevresi, sol". */
    slotName: (label: string, side: string | null) => (side ? `${label}, ${lower(side)}` : label),
    /** "81,5 kg", "%12". */
    slotValue: (name: string, text: string, unit: string) => `${name} ${unit === '%' ? percent(text) : `${text} ${unit}`}`,
    groupSummary: (shown: readonly string[], rest: number) => shown.join(' · ') + (rest > 0 ? ` ve ${rest} değer daha` : ''),
    changes: {
      improved: 'Gerçek gelişme',
      declined: 'Gerileme',
      increased: 'Gerçek artış',
      decreased: 'Gerçek azalma',
      no_real_change: 'Ölçüm hatası içinde',
    } satisfies Record<ChangeKind, string>,
    /** "2 cm altındaki değişim ölçüm hatası sayılır (…). Düşüş iyidir." */
    rule: (size: string, source: string, better: 'higher' | 'lower' | null) =>
      `${size} altındaki değişim ölçüm hatası sayılır (${source}).${
        better === 'lower' ? ' Düşüş iyidir.' : better === 'higher' ? ' Artış iyidir.' : ' İyi yön tanımlı değil; gerçek değişim artış ya da azalma diye gösterilir.'
      }`,
    percent,
    noRule: 'Bu ölçümün hata payı kaynaklarda yok: değişim gösterilir ama gelişme ya da gerileme diye yorumlanmaz.',
    waistHipNoSex: 'Bel-kalça oranının eşiği cinsiyete göre; oranı görmek için ölçüm girerken cinsiyeti seç.',
    waistHip: (ratio: string, date: string, elevated: boolean, sex: 'male' | 'female') =>
      `Bel-kalça oranı ${ratio} (${date}): ${elevated ? 'artmış metabolik risk eşiğinde ya da üstünde' : 'artmış metabolik risk eşiğinin altında'} (${
        sex === 'male' ? 'erkekte 0,90' : 'kadında 0,85'
      }, WHO).`,
    sitToStand: {
      recurrent_fall_risk: (value: string) => `Son ölçüm ${value}: 15 sn üstü, tekrarlayan düşme riski işareti. Değerlendirme önerilir.`,
      fall_risk_assessment: (value: string) => `Son ölçüm ${value}: 12 sn üstü, düşme riski değerlendirmesi önerilir.`,
      normal: (value: string) => `Son ölçüm ${value}: 12 sn ve altı, düşme riski işareti yok.`,
    },
    sideBridge: (difference: string, date: string, flagged: boolean) =>
      `Sağ-sol farkı ${percent(difference)} (${date}): ${
        flagged ? '%25 ölçüm hatası bandını aşıyor, asimetri var.' : '%25 ölçüm hatası bandında, asimetri sayılmaz.'
      }`,
    /** "(+%12)". */
    signedPercent: (negative: boolean, value: string) => ` (${negative ? '−' : '+'}%${value})`,
    latestLabel: 'Son iki ölçüm',
    latestText: (amount: string, verdict: string | null) => `Son iki ölçüm: ${amount}${verdict ? ` · ${verdict}` : ''}`,
    verdictInline: (verdict: string) => lower(verdict),
    previousBeforeRange: (days: string) => `${days} · önceki ölçüm seçili aralıktan önce`,
    trendWords: {
      improving: 'gerçek gelişme',
      declining: 'gerileme',
      plateau: 'durağan',
      increased: 'gerçek artış',
      decreased: 'gerçek azalma',
    } satisfies Record<TrendVerdict['kind'], string>,
    trendLabel: '4 haftalık eğilim',
    trendText: (verdict: string, amount: string) => `4 haftalık eğilim: ${verdict} (${amount})`,
    trendDetail: (range: string, points: number, beforeRange: number) =>
      `${range} arasındaki ${points} ölçümden${beforeRange > 0 ? ` (seçili aralıktan önceki ${beforeRange} ölçüm dahil)` : ''}.`,
    /** "%8–%12", "82,1–86,3 cm". */
    range: (low: string, high: string, unit: string) => (unit === '%' ? `${percent(low)}–${percent(high)}` : `${low}–${high} ${unit}`),
    forecast: {
      tooFewPoints: 'Tahmin için en az 4 ölçüm gerekir.',
      tooShort: 'Tahmin için ölçümler en az 3 haftaya yayılmalı.',
      slope: (slope: string) => `Eğilim haftada ${slope}.`,
      stale: (trend: string, days: number, end: string) =>
        `${trend} Son ölçüm ${days} gün önce: tahminin son günü (${end}) geçti, tahmin yeni ölçümle güncellenir.`,
      boundNow: (trend: string, down: boolean, bound: string) =>
        `${trend} Çizgi son ölçümde ${down ? 'alt' : 'üst'} sınıra (${bound}) ${down ? 'indi' : 'ulaştı'}; ileriye tahmin yazılmaz.`,
      bound: (trend: string, down: boolean, bound: string, weeks: number | null, date: string) =>
        `${trend} Böyle giderse son ölçümden ${weeks === null ? 'bir hafta içinde' : `yaklaşık ${weeks} haftada`} (${date} civarı) ${
          down ? 'alt' : 'üst'
        } sınıra (${bound}) ${down ? 'iner' : 'ulaşır'}. Tahmin eğilimin süreceğini varsayar.`,
      today: (date: string, value: string) => `bugün (${date}) ≈ ${value}, `,
      range: (range: string) => `; olası aralık ${range}`,
      ahead: (trend: string, now: string, weeks: number, date: string, value: string, range: string) =>
        `${trend} Böyle giderse ${now}son ölçümden ${weeks} hafta sonra (${date}) ≈ ${value}${range}. Tahmin eğilimin süreceğini varsayar.`,
    },
  },
  /** Ölçümler sayfası ve genel bakış. */
  page: {
    title: 'Ölçümler',
    description: 'Elle girilen vücut ölçüleri, performans ve hareketlilik testleri, anket skorları; her birinin seyri ve son değişimi.',
    add: 'Ölçüm gir',
    clientUnreadable: 'Danışan kaydı okunamadı',
    recordUnreadable: 'Sağlık kaydı okunamadı',
    broken: (problem: string) => `${problem} Kayıt uygulama dışında değiştirilmiş olabilir; düzeltilene kadar ölçüm yazılmaz.`,
    lockEdit: 'Danışanın düzenleme sayfasına git',
    lockBack: 'Danışanın sayfasına dön',
    emptyTitle: 'Henüz ölçüm yok',
    emptyDescription: 'Elle girilen vücut ölçüleri, performans ve hareketlilik testleri, anket skorları burada görünür; ilk ölçüm başlangıç değeri olur.',
    emptyRangeTitle: 'Bu aralıkta ölçüm yok',
    emptyRangeDescription: 'Tarih aralığını genişlet ya da “Tümü”nü seç.',
    daysTitle: 'Ölçüm günleri',
    daysDescription: 'Bir güne girip değerlerini düzeltebilir ya da o günü silebilirsin.',
    dayMore: (shown: string, more: number) => `${shown} ve ${more} ölçüm daha`,
    lineValue: 'Değer',
    lastMeasured: (date: string) => `Son ölçüm ${date}`,
    latestValue: 'Son değer',
    firstMeasurement: 'İlk ölçüm; karşılaştırma bir sonrakinde.',
    /** Tarih aralığı süzgeci. */
    range: {
      nav: 'Tarih aralığı',
      custom: 'Özel tarih aralığı',
      start: 'Başlangıç',
      startDate: 'Başlangıç tarihi',
      end: 'Bitiş',
      endDate: 'Bitiş tarihi',
      apply: 'Uygula',
    },
  },
  /** Ölçüm girişi ve günün düzenlenmesi. */
  form: {
    newTitle: 'Ölçüm gir',
    newDescription: 'Tarih dışında bütün alanlar isteğe bağlı; yalnız doldurduğun değerler kaydedilir.',
    editTitle: (date: string) => `${date} ölçümleri`,
    editDescription: 'Değerleri düzelt; boşalttığın alan o günden çıkar.',
    back: 'Ölçümler',
    recommended: 'Önerilen',
    /** Alan açıklaması: sıklık ve not. */
    describe: (frequency: string, note: string | undefined) => [`${frequency}.`, note].filter(Boolean).join(' '),
    values: (count: number) => `${count} değer`,
    filled: (count: number) => `${count} değer girildi`,
    noValues: 'Henüz değer yok',
    saved: 'Ölçüm kaydedildi.',
    updated: 'Ölçüm güncellendi.',
    emptyNew: 'En az bir ölçüm gir; boş alanlar kaydedilmez.',
    emptyEdit: 'Bütün değerleri boşalttın. Bu günü tamamen kaldırmak için başlıktaki “Sil”i kullan.',
    dayTitle: 'Ölçüm günü',
    sexTitle: 'Cinsiyet',
    dayDescription: 'Ölçümün alındığı gün; bugün varsayılan. Aynı gün birden çok kez girersen değerler o güne eklenir.',
    sexMissing: 'Kayıtta cinsiyet yok; bel-kalça oranının eşiği buna göre.',
    date: 'Tarih',
    required: 'zorunlu',
    optional: 'isteğe bağlı',
    dateTaken: (date: string) => `${date} tarihinde ölçüm var: aynı ölçümü girersen eskisinin yerine geçer, diğerleri kalır. Değerleri görmek için `,
    editDay: 'o günü düzenle',
    sex: 'Cinsiyet',
    sexHint: 'Bel-kalça oranı ve gövde dayanıklılığının başvuru değerleri cinsiyete göre. Bir kez girilir.',
    submitFailed: 'Form gönderilemedi',
    leave: 'Çıkarsan girdiğin ölçümler kaydedilmez.',
  },
  /** Günün silinmesi. */
  actions: {
    deleted: 'O günün ölçümleri silindi.',
    deleteTitle: (date: string) => `${date} ölçümleri silinsin mi?`,
    deleteBody:
      'O günün bütün değerleri kayıttan ve grafiklerden çıkar. Danışanın kaydının değişiklik geçmişinde bir kopyası kalır; tamamen gitmesi için danışanın kendisi silinmelidir.',
  },
  /** Danışan sayfasındaki özet kart. */
  card: {
    title: 'Ölçümler',
    unreadable: 'Ölçümler şu an okunamadı. Sayfayı yenile.',
    broken: (problem: string) => `Sağlık kaydı okunamadı: ${problem}`,
    details: 'Ayrıntı',
    summary: (days: number, last: string) => `${days} ölçüm günü · son ${last}`,
    empty: 'Henüz ölçüm yok. İlk ölçüm başlangıç değerleri olur.',
    trendNote: '4 haftalık eğilim, son ölçüme kadar; ölçüm hatası payının altındaki değişim durağan sayılır.',
    trends: '4 haftalık eğilimler',
    alerts: {
      declining: 'gerileme',
      plateau: 'durağan',
      improving: 'gerçek gelişme',
    } satisfies Record<MeasurementAlert['kind'], string>,
    /** "Bel çevresi (sol)". */
    alertName: (label: string, side: string | null) => (side ? `${label} (${lower(side)})` : label),
    charts: 'Grafikler',
    add: 'Ölçüm gir',
  },
  /** Uçların hata mesajları. */
  api: {
    notFound: 'Ölçüm bulunamadı.',
    saveFailed: 'Ölçüm kaydedilemedi.',
    deleteFailed: 'Ölçüm silinemedi.',
  },
  /** Kamera ölçümü. */
  camera: {
    title: 'Kamera ölçümü',
    pageDescription: 'Duruş ve hareket ölçümü, sayısal kayıt ve geçmiş karşılaştırması.',
    back: 'Hareket',
    backToMovement: 'Hareket sayfasına dön',
    errors: {
      denied: 'Kamera izni verilmedi. Tarayıcının site izinlerinden kamerayı açabilir veya manuel yolla devam edebilirsin.',
      notFound: 'Kamera bulunamadı. Başka bir cihaz veya manuel ölçüm kullanabilirsin.',
      busy: 'Kamera açılamadı. Kamerayı kullanan diğer uygulamayı kapatıp tekrar deneyebilirsin.',
      other: 'Kamera açılamadı. Tekrar deneyebilir veya manuel yolla devam edebilirsin.',
    },
    views: { front: 'Önden', side: 'Yandan' },
    protocols: {
      front: {
        title: 'Önden duruş',
        subtitle: 'Omuz, kalça ve gövde çizgileri',
        instructions: [...camera, 'Kameraya tam dön; kendini zorla düzeltmeden rahatça dur. Ölçüm boyunca sabit kal.'],
      },
      side: {
        title: 'Yandan duruş',
        subtitle: 'Gövdenin dikeye göre izdüşümü',
        instructions: [...camera, 'Kameraya tam yan dön; rahat dur, omuzlarını zorla geri çekme. Ölçüm boyunca sabit kal.'],
      },
      squat: {
        title: 'Kontrollü squat',
        subtitle: 'Diz hareket açıklığı ve gövde açısı',
        instructions: [...camera, 'Kameraya yan dön. Ayakta rahat başlangıç konumunu al.', movement],
      },
      knee: {
        title: 'Diz bükme ve açma',
        subtitle: 'Görünür bacağın hareket açıklığı',
        instructions: [...camera, 'Yan dön. PT ile seçtiğin güvenli konumda bacak açıkken başla; yalnız kameraya yakın bacağı ölç.', movement],
      },
      hinge: {
        title: 'Kalça menteşesi',
        subtitle: 'Gövde–kalça–diz izdüşüm açısı',
        instructions: [...camera, 'Yan dön. Ayakta başla; PT’nin gösterdiği kalçadan eğilme hareketini uygula.', movement],
      },
      shoulder_flexion: {
        title: 'Omuzu öne kaldırma',
        subtitle: 'Kolun gövdeye göre hareket açıklığı',
        instructions: [...camera, 'Yan dön. Kameraya yakın kol aşağıdayken başla; kolunu önünden kaldır. Elin kadrajda kalsın.', movement],
      },
      shoulder_abduction: {
        title: 'Omuzu yana kaldırma',
        subtitle: 'İki kolun gövdeye göre izdüşümü',
        instructions: [...camera, 'Öne dön. İki kol aşağıdayken başla; kollarını yanlardan kaldır. Ellerini kadrajda tut.', movement],
      },
      elbow: {
        title: 'Dirsek bükme ve açma',
        subtitle: 'Görünür dirseğin hareket açıklığı',
        instructions: [...camera, 'Yan dön. Kameraya yakın kol açıkken başla; üst kolunu rahat tutup dirseğini bük ve aç.', movement],
      },
      sit_stand: {
        title: 'Otur ve kalk',
        subtitle: 'Tamamlanan tekrarlar, süre ve diz açıklığı',
        instructions: [
          ...camera,
          'Sabit, güvenli sandalye kullan. Kameraya yan dön; ayakta başla, otur ve tekrar ayağa kalk. Sandalye ve yardım koşullarını koru.',
          movement,
        ],
      },
    } satisfies Record<PoseTask, ProtocolText>,
    /** Açıların kısa adları. */
    metrics: {
      shoulder_tilt: 'Omuz eğimi',
      hip_tilt: 'Kalça çizgisi',
      trunk_tilt: 'Gövde eğimi',
      near_knee: 'Diz',
      near_hip: 'Kalça',
      near_shoulder: 'Kol kaldırma',
      near_elbow: 'Dirsek',
      left_shoulder: 'Sol kol',
      right_shoulder: 'Sağ kol',
    } as Record<string, string>,
    /** Canlı analizde açının ayrıntılı adı. */
    metricDetails: {
      shoulder_tilt: 'Omuz çizgisi · yataya göre',
      hip_tilt: 'Kalça çizgisi · yataya göre',
      trunk_tilt: 'Gövde ekseni · dikeye göre',
      near_knee: 'Görünür diz · iç açı',
      near_hip: 'Kalça · gövde–bacak iç açısı',
      near_shoulder: 'Kol · gövdeye göre kaldırma',
      near_elbow: 'Dirsek · iç açı',
      left_shoulder: 'Sol kol · gövdeye göre kaldırma',
      right_shoulder: 'Sağ kol · gövdeye göre kaldırma',
    } as Record<string, string>,
    explanations: {
      shoulder_tilt: 'İki omuz noktasını birleştiren çizginin görüntünün yatayına göre eğimi.',
      hip_tilt: 'İki kalça noktasını birleştiren çizginin görüntünün yatayına göre eğimi.',
      trunk_tilt: 'Omuz–kalça ekseninin görüntünün dikeyine göre eğimi.',
      near_knee: 'Kalça, diz ve ayak bileği noktaları arasındaki diz iç açısı.',
      near_hip: 'Omuz, kalça ve diz noktaları arasındaki gövde–bacak iç açısı.',
      near_shoulder: 'Üst kolun gövdeye göre kaldırılma açısı; yalnız omuz eklemini izole etmez.',
      near_elbow: 'Omuz, dirsek ve el bileği noktaları arasındaki dirsek iç açısı.',
      left_shoulder: 'Sol üst kolun gövdeye göre kaldırılma açısı.',
      right_shoulder: 'Sağ üst kolun gövdeye göre kaldırılma açısı.',
    } as Record<string, string>,
    meaning: {
      dynamic: 'Değer, tamamlanan tekrarların her birindeki en büyük ve en küçük açı farklarının ortancasıdır. Anlık eklem açısı değildir.',
      static: 'Değer, sabit duruş boyunca alınan net örneklerin ortanca açısıdır.',
    },
    quality: {
      ready: 'Vücut algılandı. Telefonun düz olduğunu kontrol et.',
      no_person: 'Vücut bulunamadı. Işığı artır; kameradan biraz uzaklaş.',
      multiple: 'Kadrajda birden fazla kişi var. Tek kişi kalmalı.',
      cropped: 'Başın ve ayakların dahil tüm vücudun görünmeli; biraz uzaklaş.',
      uncertain: 'Noktalar yeterince net değil. Kamerayı sabitle; eklemlerini görünür tut.',
    } satisfies Record<Quality, string>,
    cues: {
      front: { start: 'Kameraya dön; rahat ve sabit dur.', away: 'Rahat duruşunu koru.', back: 'Rahat duruşunu koru.' },
      side: { start: 'Yan dön; rahat ve sabit dur.', away: 'Rahat duruşunu koru.', back: 'Rahat duruşunu koru.' },
      squat: { start: 'Yan dön; ayakta rahat başlangıç konumunu al.', away: 'Rahat sınırında yavaşça çömel.', back: 'Yavaşça başlangıç konumuna dön.' },
      knee: {
        start: 'Yan dön; kameraya yakın bacağını rahat başlangıç konumuna getir.',
        away: 'Kameraya yakın dizini yavaşça bük.',
        back: 'Bacağını rahat başlangıç konumuna geri getir.',
      },
      hinge: { start: 'Yan dön; ayakta başlangıç konumunu al.', away: 'PT’nin gösterdiği gibi kalçandan yavaşça eğil.', back: 'Yavaşça başlangıç konumuna dön.' },
      shoulder_flexion: {
        start: 'Yan dön; kameraya yakın kolunu aşağıda rahat tut.',
        away: 'Kolunu önden rahat sınırına doğru kaldır.',
        back: 'Kolunu yavaşça aşağı indir.',
      },
      shoulder_abduction: {
        start: 'Kameraya dön; iki kolunu aşağıda rahat tut.',
        away: 'Kollarını yanlardan rahat sınırına doğru kaldır.',
        back: 'Kollarını yavaşça aşağı indir.',
      },
      elbow: {
        start: 'Yan dön; kameraya yakın kolunu rahat başlangıç konumunda tut.',
        away: 'Dirseğini yavaşça bük; üst kolunu sabit tut.',
        back: 'Kolunu rahat başlangıç konumuna geri getir.',
      },
      sit_stand: { start: 'Sandalyenin önünde ayakta başla; kameraya yan dön.', away: 'Güvenli sandalyeye yavaşça otur.', back: 'Yavaşça ayağa kalkıp başlangıca dön.' },
    } satisfies Record<PoseTask, { start: string; away: string; back: string }>,
    /** Çekimin tamamlanamama nedenleri. */
    capture: {
      sourceChanged: 'Kamera yönü veya çözünürlüğü değişti. Telefonu aynı konumda sabitleyip yeniden başlat.',
      sideChanged: 'Ölçüm sırasında taraf değişti. Aynı taraf kameraya dönük kalmalı; yeniden dene.',
      tooFewFrames: 'Yeterli net görüntü alınamadı. Kamerayı sabitle, ışığı ve kadrajı kontrol edip yeniden dene.',
      tooFewReps: 'Üç tam tekrar algılanmadı. Başlangıç konumuna dönerek yavaşça üç tekrar yap; hareketi zorlamadan yeniden dene.',
      unsteady: 'Duruş örnekleri fazla değişti. Sabit ve rahat durarak yeniden dene.',
    },
    /** Kayıt ucunun yanıtları. */
    route: {
      saveForbidden: 'Bu ölçümü kaydetme yetkin yok.',
      changeForbidden: 'Bu ölçümü değiştirme yetkin yok.',
      clientNotFound: 'Danışan bulunamadı.',
      saveLocked: 'Hareket taraması modülü veya onayı kapalı. Ölçüm kaydedilmedi.',
      locked: 'Hareket taraması modülü veya onayı kapalı.',
      invalidSummary: 'Ölçüm özeti geçersiz veya eksik. Yeniden ölçüm yap.',
      invalidTime: 'Ölçüm zamanı geçersiz. Cihazının tarihini kontrol et ve yeniden ölç.',
      invalidAction: 'Ölçüm işlemi geçersiz.',
      idConflict: 'Bu ölçüm kimliği farklı bir kayıt için kullanılmış. Yeniden ölçüm yap.',
      limit: 'Kamera ölçümü kayıt sınırına ulaşıldı.',
      recordNotFound: 'Ölçüm bulunamadı. Sayfayı yenileyip tekrar dene.',
      saveFailed: 'Kamera ölçümü kaydedilemedi.',
      changeFailed: 'Ölçüm işlemi tamamlanamadı.',
    },
    schema: {
      inconsistent: 'Ölçüm özeti tutarsız.',
      fewSamples: 'Yeterli örnek yok.',
      mismatch: 'Görev ve ölçüm sonucu eşleşmiyor.',
    },
    /** Çekim paneli. */
    panel: {
      idle: 'Hazır olduğunda ölçümü başlat.',
      failed: 'Ölçüm tamamlanamadı. Aynı hareketi yeniden deneyebilirsin.',
      chairRange: 'Sandalye yüksekliği 20–100 cm arasında olmalı; bilmiyorsan boş bırak.',
      countdown: (seconds: number, cue: string) => `${seconds} · ${cue}`,
      holdStart: 'Başlangıç konumunda sabit kal; ölçüm hazırlanıyor.',
      notVisible: 'Vücut net görünmüyor. Kadrajı kontrol et.',
      noBaseline: 'Sabit başlangıç örnekleri alınamadı. Kadrajı ve ışığı kontrol edip yeniden dene.',
      started: 'Ölçüm başladı; başlangıç konumunu bir an koru.',
      lost: 'Görüntü kayboldu; bu sırada tekrar sayılmıyor.',
      repDone: (reps: number, cue: string) => `${reps} tekrar tamamlandı. ${cue}`,
      cancelled: 'Ölçüm iptal edildi. Yeniden başlatabilirsin.',
      controls: 'Ölçüm kontrolleri',
      progress: (seconds: number, reps: string | null) => `${seconds} sn${reps ? ` · ${reps}` : ''}`,
      finish: 'Ölçümü bitir',
      cancel: 'Hazırlığı iptal et',
      start: 'Ölçümü başlat',
      sound: 'Sesli rehber',
      dynamicHint: 'Üç tam döngü · En fazla 30 sn · Rahat sınırında hareket et.',
      staticHint: '6 sn rahat duruş · Görüntü saklanmaz.',
    },
    /** Çekim sihirbazı. */
    wizard: {
      manual: 'Ölçüm gir',
      needsHttps: 'Kamera için HTTPS veya localhost gerekir.',
      permissionWait: 'Kamera izni bekleniyor. Tarayıcının izin penceresini kontrol edip yeniden dene.',
      saveFailed: 'Ölçüm kaydedilemedi.',
      saveIncomplete: 'Kaydetme tamamlanamadı. Sonuç burada duruyor; yeniden deneyebilirsin.',
      defaultCamera: 'Varsayılan kamera',
      cameraN: (index: number) => `Kamera ${index}`,
      chooseCamera: 'Kamera seç',
      shot: (meaning: string, view: string, reps: number) =>
        `${meaning} ${view} çekim · ${reps ? `${reps} tamamlanan tekrar` : 'Rahat duruş'}.`,
      angleChange: ' · açı değişimi',
      deltaSameConditions: (delta: string) => `Önceki aynı koşuldaki kayda göre ${delta}°. Fark tek başına gelişim veya gerileme göstermez.`,
      purpose: 'Bu kayıt PT’nin hareketini ve önceki ölçümlerini birlikte incelemesine yardımcı olur. Doğru/yanlış hareket puanı veya klinik kabul sınırı değildir.',
      conditions: 'Ölçüm koşulları ve teknik bilgiler',
      sides: { both: 'İki taraf', left: 'Sol taraf', right: 'Sağ taraf' },
      technical: (side: string, seconds: string, valid: number, total: number, size: string, protocol: number) =>
        `${side} · ${seconds} sn · ${valid}/${total} net örnek · ${size} · Protokol ${protocol} · 2D tahmin. Kamera eğimi ve perspektif sonucu etkiler. Görüntü saklanmaz.`,
      position: (index: number, total: number) => `${index}/${total} analiz`,
      summaryTitle: 'Analiz oturumu özeti',
      backToList: 'Analiz listesine dön',
      closeCamera: 'Kamerayı kapat',
      backToPrepare: 'Hazırlığa dön',
      verifyPosition: 'Çekim konumunu doğrula',
      checks,
      preview: 'Canlı kamera önizlemesi',
      previewFailed: 'Önizleme açılamadı. Kamerayı yeniden aç.',
      cameraOff: 'Kamera kapalı. Yeniden açmak için hazırlığa dön.',
      detectionFailed: 'Algılama yüklenemedi. Kamerayı yeniden aç.',
      detectionLoading: 'Vücut algılama hazırlanıyor…',
      mirrored: (view: string) => `${view} · Aynalı önizleme`,
      liveAngles: 'Canlı açılar',
      howTitle: 'Nasıl yapacaksın?',
      repeatThree: 'Üç kez tekrarla. Hareketi zorlamadan, rahat sınırında yap.',
      holdSix: 'Altı saniye rahat ve sabit dur; kendini zorla düzeltme.',
      whatTitle: 'Neyi ölçeceğiz?',
      phone: (view: string) => `Telefonu düz ve sabit tut. ${view} çekim yap; başın ve ayakların kadrajda kalsın.`,
      consent: 'Görüntünün yalnız bu cihazda açı analizi için işlenmesine izin veriyorum. Görüntü saklanmaz.',
      consentRemembered: 'Cihazda işleme onayı hatırlandı.',
      withdrawConsent: 'Onayı geri çek',
      permissionNote: 'Tarayıcının kamera izni ilk açılışta ayrıca sorulabilir. Mikrofon açılmaz.',
      chairHeight: 'Sandalye yüksekliği · cm (isteğe bağlı)',
      armSupport: 'Kol desteği kullanıyorum',
      sessionSummary: (measured: number, skipped: number) =>
        `${measured} analiz ölçüldü · ${skipped} analiz atlandı. Kaydetmediğin sonuçlar bu sayfada korunur; sayfadan ayrılırsan kaybolur.`,
      saved: 'Kaydedildi',
      saving: 'Kaydediliyor…',
      saveMeasurement: 'Ölçümü kaydet',
      nothingMeasured: 'Ölçüm alınmadı. Analiz listesine dönüp tekrar başlayabilirsin.',
      list: 'Analiz listesi',
      skip: 'Bu analizi atla',
      waitingPermission: 'Kamera izni bekleniyor…',
      toCapture: 'Ölçüm alanına geç',
      openCamera: 'Kamerayı aç',
      measureAgain: 'Tekrar ölç',
      saveNext: 'Kaydet ve sonraki analiz',
      saveFinish: 'Kaydet ve oturumu bitir',
      continueUnsaved: 'Kaydetmeden devam et',
      leave: 'Kaydedilmemiş kamera sonuçları var. Analizler arasında geçişte korunur; bu sayfadan ayrılırsan kaybolur.',
      chooseTitle: 'Analizlerini seç',
      chooseHint: 'Bir veya birkaç analiz seç. Her hareketin örneğini görerek sırayla ilerleyeceksin.',
      measuredPerson: (name: string) => ` Ölçülecek kişi: ${name}.`,
      selection: 'Analiz seçimi',
      selected: (count: number, order: string | null) => `${count} analiz seçildi${order ? ` · Sıra: ${order}` : ''}`,
      resume: 'Oturuma devam et',
      newSession: 'Yeni oturum başlat',
      startSelected: 'Seçilen analizleri başlat',
      unsaved: (count: number) => `Kaydedilmemiş sonuçlar · ${count}`,
      privacy: 'Görüntü yalnız cihazında işlenir, saklanmaz. Açılar 2D tahmindir; sonuçlar hareket testini destekler. Program otomatik değişmez.',
    },
    /** Kamera ölçüm geçmişi. */
    history: {
      changeFailed: 'Ölçüm değiştirilemedi.',
      actionFailed: 'İşlem tamamlanamadı. Yeniden deneyebilirsin.',
      label: 'Kamera ölçüm geçmişi',
      trashTitle: 'Silinen kamera ölçümleri',
      title: 'Kamera ölçüm geçmişi',
      trashHint: 'Silinen kayıtları buradan geri alabilirsin.',
      hint: 'Aynı yöntem ve kayıtlı koşullardaki ölçümler karşılaştırılır. Fark tek başına gelişim veya gerileme değildir.',
      showHistory: 'Ölçüm geçmişi',
      showTrash: (count: number) => `Silinenler (${count})`,
      trashEmpty: 'Silinen ölçüm yok.',
      empty: 'Henüz kaydedilmiş kamera ölçümü yok. Kamerayla ölçüm al düğmesiyle başlayabilirsin.',
      reps: (count: number) => ` · ${count} tekrar`,
      angleChange: ' · açı değişimi',
      deltaPrevious: (delta: string) => `Öncekiye göre ${delta}°`,
      whatMeans: 'Bu sonuç ne anlama geliyor?',
      technical: (seconds: string, valid: number, total: number, size: string, protocol: number) =>
        `2D tahmin · ${seconds} sn · ${valid}/${total} net örnek · ${size} · Protokol ${protocol}. Telefon düzlüğü kullanıcı tarafından kontrol edildi.`,
      chair: (height: string | null, armSupport: boolean) =>
        ` Sandalye: ${height ? `${height} cm` : 'belirtilmedi'}; kol desteği ${armSupport ? 'var' : 'yok'}.`,
      ptNote: 'PT önceki kayıt ve antrenman koşullarıyla birlikte değerlendirir. Klinik kabul sınırı veya doğru/yanlış hareket puanı değildir.',
      noPrevious: 'Aynı kayıtlı koşullarda önceki ölçüm yok.',
      restoring: 'Geri alınıyor…',
      restore: 'Geri al',
      measureAgain: 'Tekrar ölç',
      deleting: 'Siliniyor…',
      delete: 'Sil · geri alınabilir',
      more: 'Daha fazla göster',
    },
    /** Hareketin örnek çizimi. */
    reference: {
      label: (title: string) => `${title}: başlangıç, hareket ve başlangıca dönüş örneği`,
      frames: 'Referans hareketin kareleri',
      start: 'Başlangıç',
      move: 'Hareket',
      play: 'Oynat',
      dynamic: 'Başla → hareket et → geri dön',
      static: 'Rahat ve sabit dur',
      note: 'Temsili çizim; ulaşman gereken açı veya derinlik değildir.',
    },
  },
};

export default tr;
