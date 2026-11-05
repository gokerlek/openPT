import type { Change, NotTestedReason, Outcome, ResultChoice, ScreeningTestId, SideKey } from '../../../lib/screening.ts';

/**
 * Hareket taraması (protokol 1): testlerin adı, kurulumu, kaçan noktaları ve danışana odak cümleleri; sonuç sözcükleri;
 * PT'ye ipuçları; tarama sayfası, girişi ve eylemleri. Test adları ve klinik metin için İngilizce bir uzmanın gözünden
 * geçmeli (plan §8.9).
 */

type Point = { label: string; hint: string; focus: string };
type TestText = {
  title: string;
  short: string;
  sideNote?: string;
  setup: string;
  points: Record<string, Point>;
  easier: string;
  source: string;
};

const lower = (text: string) => text.toLocaleLowerCase('tr');

const sides = { center: '', left: 'Sol', right: 'Sağ' } satisfies Record<SideKey, string>;

const tr = {
  tests: {
    squat: {
      title: 'Squat, kollar önde',
      short: 'Squat',
      setup: 'Ayaklar kalça-omuz genişliğinde, kollar öne uzanık; 3 tekrar.',
      points: {
        heels: { label: 'Topuk kalktı', hint: 'topuklar yerde; düzelmiyorsa topuk desteği', focus: 'topukların yerde kalsın' },
        knees: { label: 'Diz içe kaçtı', hint: 'dizler ayak yönünde', focus: 'dizlerin ayak uçlarının yönünde' },
        depth: { label: 'Derinlik yetmedi', hint: 'derinliği kutuyla ayarla', focus: 'rahat indiğin derinlikte kal' },
        torso: { label: 'Gövde öne düştü', hint: 'göğüs yukarı, ağırlık önde (goblet)', focus: 'göğsün yukarıda kalsın' },
        spine: { label: 'Altta bel yuvarlandı', hint: 'derinliği belin nötr kaldığı yerde kes', focus: 'belinin düz kaldığı yere kadar in' },
      },
      easier: 'Diz hizasındaki kutuya otur-kalk, kollar önde.',
      source: 'Kritz 2009 (vücut ağırlığıyla squat taraması)',
    },
    hinge: {
      title: 'Kalça menteşesi, çubukla',
      short: 'Menteşe',
      setup: 'Çubuk sırtta baş, sırt ve sağrıya değer; dizler hafif bükük; kalçadan öne eğil; 3 tekrar.',
      points: {
        contact: { label: 'Çubuk ayrıldı', hint: 'sırt nötr, çubuk üç noktada', focus: 'sırtın düz kalsın' },
        hips: { label: 'Kalçadan başlamadı', hint: 'önce kalça geri', focus: 'hareketi kalçanı geri iterek başlat' },
        range: { label: 'Aralık yetmedi', hint: 'kısa aralıkla başla, arka bacak esnekliği', focus: 'rahat eğildiğin kadar in' },
        return: { label: 'Dönüşte bel açıldı', hint: 'tepede kalçayı sık, bel geri açılmasın', focus: 'yukarıda kalçanı sık, belini geriye bükme' },
      },
      easier: 'Kalçayla arkadaki duvara dokunma (duvar 15–20 cm geride).',
      source: 'sentez; noktalar "hareket kalçadan gelsin" diye yazıldı (Saraceni 2020)',
    },
    split_squat: {
      title: 'Split squat',
      short: 'Split squat',
      sideNote: 'Öndeki bacak test edilen taraftır.',
      setup: 'Bir adım boyu açıklık, arka topuk kalkık, eller belde; arka diz yere yaklaşana dek in; 3 tekrar.',
      points: {
        knee: { label: 'Ön diz içe kaçtı', hint: 'ön diz ayak yönünde', focus: 'ön dizin ayağının yönünde' },
        pelvis: { label: 'Kalça düştü ya da döndü', hint: 'kalça yatay; yan kalça çalış', focus: 'kalçan düz kalsın' },
        torso: { label: 'Gövde öne düştü', hint: 'gövde dik', focus: 'gövden dik kalsın' },
        depth: { label: 'Kontrollü inemedi', hint: 'aralığı kısalt, yavaş in', focus: 'yavaş ve kontrollü in' },
        balance: { label: 'Denge kaybı', hint: 'destekle başla', focus: 'gerekirse bir yere tutun' },
      },
      easier: 'Bir elle duvara ya da çubuğa tutunarak.',
      source: 'sentez; squat noktalarının tek bacağa uyarlanması (Kritz 2009)',
    },
    single_leg_balance: {
      title: 'Tek ayak denge',
      short: 'Denge',
      sideNote: 'Duran bacak test edilen taraftır.',
      setup: 'Göz açık, eller belde, öbür ayak yerden ~5 cm; en çok 30 sn; süre 3 denemenin en iyisi.',
      points: {
        time: { label: '30 sn dolmadı', hint: 'kısa sürelerle sık tekrar', focus: 'biraz daha uzun durmayı dene' },
        hip: { label: 'Kalça düştü ya da kaydı', hint: 'yan kalça (kalça açma) çalış', focus: 'kalçan düz kalsın' },
        foot: { label: 'Destek ayağı kaydı', hint: 'ayak tabanı yere tam bassın', focus: 'ayağın yere sağlam bassın' },
        arms: { label: 'Eller belden ayrıldı', hint: 'gerekirse parmak ucuyla destek', focus: 'ellerin belinde kalsın' },
      },
      easier: 'Parmak ucuyla duvara hafifçe dokunarak.',
      source: 'Springer 2007 (tek ayak duruş süresi); 30 sn sentez',
    },
    push: {
      title: 'Şınav, 5 tekrar',
      short: 'Şınav',
      setup: 'Eller omuz genişliğinde, vücut düz; göğüs yere bir avuç kalana dek.',
      points: {
        plank: { label: 'Gövde bozuldu', hint: 'gövdeyi sık; gerekirse eğimli', focus: 'vücudun tek parça kalsın' },
        scapula: { label: 'Kürek kanatlandı', hint: 'tepede kürekleri ayır (serratus)', focus: 'kürek kemiklerin sırtına yapışık kalsın' },
        elbows: { label: 'Dirsekler açıldı', hint: 'dirsekler gövdeye 45°', focus: 'dirseklerin gövdene yakın' },
        depth: { label: 'Aralık eksik', hint: 'eğimle tam aralık', focus: 'göğsünü yere yaklaştır' },
      },
      easier: 'Eller sehpada (kalça hizasında).',
      source: 'sentez',
    },
    pull: {
      title: 'Ters kürek, 5 tekrar',
      short: 'Kürek',
      setup: 'Halka ya da askı bandı; gövde yere ~45°, topuklar yerde, kollar düz.',
      points: {
        plank: { label: 'Gövde bozuldu', hint: 'gövde tek parça', focus: 'vücudun tek parça kalsın' },
        shoulders: { label: 'Omuz kulağa kalktı', hint: 'omuzlar aşağıda', focus: 'omuzların kulaklarından uzak' },
        range: { label: 'Dirsek gövdeyi geçmedi', hint: 'daha dik açıyla tam aralık', focus: 'dirseklerini gövdenin arkasına kadar çek' },
        control: { label: 'İniş kontrolsüz', hint: 'inişi 2–3 sn', focus: 'yavaş in' },
      },
      easier: 'Daha dik açı (gövde ~70°).',
      source: 'sentez',
    },
    anti_rotation: {
      title: 'Dönmeye direnç, tutuş',
      short: 'Dönme',
      sideNote: 'Taraf: direncin geldiği yan.',
      setup: 'Yarım diz çökme, bant ya da kablo yandan, kollar göğüsten ileri uzanık; 10 sn.',
      points: {
        trunk: { label: 'Gövde döndü', hint: 'direnci azalt, gövdeyi sabitle', focus: 'gövden dönmesin' },
        pelvis: { label: 'Kalça kaydı', hint: 'kalçayı sık', focus: 'kalçan sabit kalsın' },
        arms: { label: 'Kollar kaydı', hint: 'kollar orta hatta', focus: 'kolların göğsünün ortasında kalsın' },
        breath: { label: 'Nefes tuttu', hint: 'nefes vererek tut', focus: 'nefesini tutma' },
      },
      easier: 'Ayakta geniş duruş, daha hafif direnç.',
      source: 'sentez',
    },
    shoulder_flexion: {
      title: 'Kol kaldırma, sırt duvarda',
      short: 'Kol kaldırma',
      sideNote: 'Kaldırılan kol test edilen taraftır.',
      setup: 'Topuk, kalça, sırt ve baş duvarda, dizler hafif bükük; dirsek düz, başparmak yukarı, kolu önden yukarı kaldır.',
      points: {
        wall: { label: 'Duvara ulaşmadı', hint: 'açılı itişle başla (landmine)', focus: 'kolunu rahat kaldırabildiğin kadar kaldır' },
        ribs: { label: 'Bel duvardan ayrıldı', hint: 'kaburgayı aşağıda tut', focus: 'belin duvara yakın kalsın' },
        elbow: { label: 'Dirsek büküldü', hint: 'dirsek düz', focus: 'dirseğin düz kalsın' },
        shrug: { label: 'Omuz kulağa kalktı', hint: 'omuz aşağıda', focus: 'omzun kulağından uzak' },
      },
      easier: 'Sırtüstü yatarak (bel yerde).',
      source: 'sentez',
    },
  } satisfies Record<ScreeningTestId, TestText>,
  outcomes: {
    clean: 'Temiz',
    compensated: 'Telafiyle',
    easier: 'Kolaylaştırılmış',
    unable: 'Yapılamadı',
    pain: 'Ağrılı',
    not_tested: 'Bu hareket testinde yapılmadı',
  } satisfies Record<Outcome, string>,
  outcomesClient: {
    clean: 'Temiz',
    compensated: 'Telafiyle',
    easier: 'Kolaylaştırılmış sürümle',
    unable: 'Henüz yapılamıyor',
    pain: 'Ağrı not edildi. Antrenörün seninle konuşacak.',
    not_tested: 'Bu hareket testinde yapılmadı',
  } satisfies Record<Outcome, string>,
  resultChoices: {
    standard: 'Standart',
    easier: 'Kolaylaştırılmış',
    unable: 'Yapılamadı',
    not_tested: 'Yapılmadı',
  } satisfies Record<ResultChoice, string>,
  notTestedReasons: { constraint: 'kısıt', other: 'başka neden' } satisfies Record<NotTestedReason, string>,
  sides,
  /** "Kol kaldırma (sağ)". */
  cellTitle: (name: string, side: SideKey) => (side === 'center' ? name : `${name} (${lower(sides[side])})`),
  /** Yalın ad, kurulum ekinin öncesi ("Kalça menteşesi, çubukla" → "Kalça menteşesi"). */
  plainName: (title: string) => title.split(',')[0] ?? title,
  /** İpuçları (yalnız PT). */
  hints: {
    /** "Split squat (iki taraf)", "Split squat, sol". */
    name: (name: string, side: SideKey | 'both') => (side === 'both' ? `${name} (iki taraf)` : side === 'center' ? name : `${name}, ${lower(sides[side])}`),
    list: (titles: readonly string[]) => (titles.length > 0 ? ` — ${titles.join(', ')}` : ''),
    pain: (name: string) => `${name}: ağrılı; öneri yok. Değerlendirmeden sonra yeniden tara.`,
    unable: (name: string, list: string) => `${name} (Yapılamadı): kalıbı yükleme; destekli ve kısa aralıkla başla${list}.`,
    easier: (name: string, list: string) => `${name} (Kolaylaştırılmış): kolaylaştırılmış sürümle çalış${list}.`,
    compensated: (name: string, missed: readonly string[], hint: string | null) =>
      `${name} (Telafiyle · ${missed.map(lower).join(', ')}): yüklenebilir; ipucu: ${hint ?? 'kaçan noktaya dikkat'}.`,
    clean: (name: string, list: string) => `${name} (Temiz): ilerlet${list}.`,
    heelSupport: " Topuk desteğiyle düzeldi → ayak bileği: Ölçümler'de duvar lunge testini gir.",
    weakSide: ' Zayıf taraftan başla, iki tarafa eşit iş.',
  },
  errors: {
    missing: 'Bu tarihte hareket testi yok; silinmiş olabilir.',
    empty: 'En az bir test gir; boş testler kaydedilmez.',
    alreadyDeleted: 'Bu tarihte hareket testi yok; zaten silinmiş olabilir.',
    noPain: 'Bu testte ağrı kaydı yok.',
  },
  /** Taramanın program düzenleyicisindeki izi. */
  care: {
    pain: (cell: string) => `Hareket testinde ağrı: ${cell}`,
    /** "Split squat (sağ) · Kolaylaştırılmış". */
    summary: (short: string, side: SideKey | null, outcome: string) => `${short}${side && side !== 'center' ? ` (${lower(sides[side])})` : ''} · ${outcome}`,
    badge: (label: string, more: number) => `Hareket testi: ${label}${more > 0 ? ` · +${more}` : ''}`,
    detailFallback: (label: string) => `${label}.`,
  },
  /** Tarama sayfası. */
  page: {
    title: 'Hareket',
    description: 'Danışanın duruş ve hareket açıları kamerayla, temel hareketlerdeki ağrı ve kontrol hareket testiyle kaydedilir.',
    clientUnreadable: 'Danışan kaydı okunamadı',
    recordUnreadable: 'Sağlık kaydı okunamadı',
    brokenDetail: 'Kayıt uygulama dışında değiştirilmiş olabilir; düzeltilene kadar kamera ölçümü ve hareket testi yazılmaz.',
    newRecord: 'Yeni kayıt',
    camera: 'Kamerayla ölçüm al',
    cameraHint: 'Duruş ve hareket açılarını adım adım ölç.',
    screen: 'Hareket testi yap',
    screenHint: 'Sekiz temel hareketi gözle; ağrı ve kontrolü kaydet.',
    resultsTitle: 'Hareket testi sonuçları',
    resultsHint: 'Sonuç gözlenen noktalardan sözcükle yazılır; toplam ve puan yok.',
    legacy: (days: string, _count: number) => `Eski biçimde hareket testi kaydı (${days} gün); yeni protokolle karşılaştırılmaz.`,
    emptyTitle: 'Henüz hareket testi yok',
    emptyDescription: 'Başlangıçta ve 6–8 haftada bir önerilir. Sekiz test yaklaşık 15 dakika; yalnız doldurduğun testler kaydedilir.',
    latest: (date: string, weeksAgo: string | null, _weeks: number) =>
      `Son hareket testi ${date}${weeksAgo ? ` · ${weeksAgo} hafta önce` : ''}. Başlangıçta ve 6–8 haftada bir önerilir.`,
    warnings: 'Uyarılar',
    warningsHint:
      'Ağrılı test öneri üretmez: önce değerlendirme. Ağrı, o test sonra ağrısız yapılana ya da "Gördüm" diyene kadar açık kalır. Asimetri risk değil, öncelik içindir.',
    painTitle: (cell: string) => `⚑ Ağrı · ${cell}`,
    painCarried: (date: string) => ` · ${date} hareket testinden; sonra test edilmedi`,
    painOpen: ': önce değerlendirme.',
    reviewed: ' Gözden geçirildi.',
    painResolved: (date: string) => ` ${date} hareket testinde ağrı geçti.`,
    painSuperseded: (date: string) => ` ${date} hareket testinde de ağrılı; o günün uyarısına bak.`,
    goneTitle: (cell: string) => `✓ Ağrı geçti · ${cell}`,
    gone: (date: string) => `: ${date} hareket testinde ağrılıydı, bu kez ağrısız.`,
    asymmetryTitle: (name: string) => `◐ Büyük asimetri · ${name}`,
    asymmetry: (left: string, right: string, reachDiff: string | null, reachPercent: string | null) =>
      `: sol ${lower(left)} · sağ ${lower(right)}${reachDiff ? ` · ön uzanma farkı ${reachDiff} cm` : ''}${reachPercent ? ` (bacak boyuna göre ${reachPercent})` : ''}.`,
    /** "Kısıt olarak ekle"nin önerisi: "Sağ omuz · kaçın: kol baş üstünde". */
    suggestion: (region: string, avoid: string | null) => `${region}${avoid ? ` · kaçın: ${lower(avoid)}` : ''}`,
    protocol: (protocol: number) => `Protokol ${protocol}`,
    test: 'Test',
    comparedTo: (date: string) => `${date} tarihine göre`,
    change: 'Değişim',
    sideLine: (side: string) => `${side}: `,
    stepNote: 'Tek basamaklık değişim gözlem farkı olabilir.',
    hintsTitle: 'Programa ipuçları (yalnız sana)',
    hintsHint: 'Sıra: ağrı → en düşük sonuç → asimetri. Sonrası senin hedefine göre.',
    sameFamily: (titles: string) => ` Kütüphanende aynı kalıptan: ${titles}.`,
    days: 'Test günleri',
    daySummary: (tests: string, _testCount: number, pain: string | null) => ` · ${tests} test${pain ? ` · ${pain} ağrı` : ''}`,
    /** Hücre: "Yapılmadı (kısıt)", "⚑ Ağrılı", "12 sn", "bacak 88 cm". */
    notTestedConstraint: 'Yapılmadı (kısıt)',
    painCell: (label: string) => `⚑ ${label}`,
    missedList: (labels: readonly string[]) => labels.map(lower).join(', '),
    seconds: (value: string) => `${value} sn`,
    reach: (cm: string, percent: string | null) => `${cm} cm${percent ? ` (${percent})` : ''}`,
    leg: (cm: string) => `bacak ${cm} cm`,
    reachChange: (before: string, after: string, percent: { before: string; after: string } | null) =>
      `uzanma ${before} → ${after} cm${percent ? ` (${percent.before} → ${percent.after})` : ''}`,
    changes: { up: '↑', down: '↓', same: '=', new: 'yeni', pain_new: 'yeni ağrı', pain_gone: 'ağrı geçti' } satisfies Record<Change, string>,
    significant: ' (belirgin)',
    sideChange: (side: 'left' | 'right', text: string) => `${side === 'left' ? 'sol' : 'sağ'} ${text}`,
  },
  /** Karşılaştırma seçicisi. */
  compare: {
    label: 'Karşılaştır:',
    with: 'ile',
    none: 'Karşılaştırma yok',
  },
  /** Tarama girişi. */
  form: {
    title: 'Hareket testi',
    newDescription: 'Her testte önce ağrıyı, sonra yapılan sürümü ve kaçan noktaları işaretle; sonuç kendiliğinden yazılır.',
    editTitle: (date: string) => `${date} hareket testi`,
    editDescription: 'Değiştir; boşalttığın test o günden çıkar.',
    back: 'Hareket',
    pain: 'Ağrı',
    painStop: 'Ağrı olunca testi bırak.',
    painWhere: 'Nerede (isteğe bağlı)',
    version: 'Yapılan sürüm',
    reason: 'Neden',
    seconds: 'Süre (en iyisi)',
    secondsUnit: 'sn',
    reach: 'Ön uzanma',
    leg: 'Bacak boyu (isteğe bağlı)',
    legHint: (min: number, max: number) => `Leğen kemiğinin ön üst çıkıntısından iç ayak bileği kemiğine; ${min}–${max} cm.`,
    legPercent: (percent: string) => ` Ön uzanma: bacak boyunun %${percent} kadarı.`,
    legPercentHint: ' Ön uzanmayı bacak boyuna göre yüzde olarak gösterir.',
    missed: 'Kaçan noktalar',
    noVersion: 'Sürüm seçilmedi',
    saved: 'Hareket testi kaydedildi.',
    updated: 'Hareket testi güncellendi.',
    draftTitle: 'Kaydedilmemiş bir taslağın var',
    draftContinue: 'Taslağa devam et',
    draftDiscard: 'At',
    date: 'Test günü',
    dateTaken: (date: string) => `${date} tarihinde hareket testi var: kaydedersen o günün yerine geçer.`,
    tests: 'Testler',
    filled: 'dolu',
    partial: '(yarım)',
    cardTitle: (index: number, title: string) => `${index} · ${title}`,
    countBalance: 'Süre 3 denemenin en iyisi; bir nokta 3 denemenin en az 2’sinde görüldüyse kaçmış say.',
    count: 'Bir nokta 3 tekrarın en az 2’sinde görüldüyse kaçmış say.',
    easier: (text: string) => `Kolaylaştırılmış: ${text}`,
    source: (text: string) => `Dayanak: ${text}`,
    heelSupport: 'Topuk altına 2–5 cm destekle düzeldi mi? (isteğe bağlı)',
    note: 'Not',
    screeningNote: 'Hareket testinin notu',
    saveFailed: 'Kaydedilemedi',
    leaveDescription: 'Çıkarsan girdiğin hareket testi kaydedilmez; taslak bu sekme kapanana kadar durur.',
    /** Etkin kısıtlar başlıkta. */
    constraintsTitle: 'Etkin kısıtlar',
    awaitingOpinion: ' (görüş bekleniyor)',
    constraintsWaiting: 'Görüşü alınmamış bölgeye değen testler “Yapılmadı (kısıt)” olarak hazır; istersen değiştir.',
    constraintsNote: 'Kısıtlı bölgeye değen testlerde ağrı olursa testi bırak; kısıtlı taraf asimetriye girmez.',
  },
  /** Ağrının ve günün eylemleri. */
  actions: {
    reviewed: 'Gözden geçirildi.',
    constraintAdded: 'Kısıt eklendi.',
    seen: 'Gördüm',
    addConstraint: 'Kısıt olarak ekle',
    addTitle: (title: string) => `${title}: kısıt eklensin mi?`,
    addDescription: (suggestion: string | null) =>
      `${suggestion ?? 'Hareket kısıtı'} · tanısız, hareket testinden. Kaydedince kısıtın sayfası açılır; bölgeyi, tarafı ve kaçınmaları orada düzelt.`,
    deleted: 'Hareket testi silindi.',
    deleteTitle: (date: string) => `${date} hareket testi silinsin mi?`,
    deleteBody: 'O günün bütün testleri kayıttan çıkar. Danışanın kaydının değişiklik geçmişinde bir kopyası kalır.',
  },
  /** Uçların hata mesajları. */
  api: {
    notFound: 'Hareket testi bulunamadı.',
    futureDate: 'Gelecek bir güne hareket testi girilemez.',
    saveFailed: 'Hareket testi kaydedilemedi.',
    deleteFailed: 'Hareket testi silinemedi.',
    reviewFailed: 'Kaydedilemedi.',
  },
};

export default tr;
