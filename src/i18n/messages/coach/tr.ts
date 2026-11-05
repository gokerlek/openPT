import type { GOALS } from '../../../lib/ai/assistant-contract.ts';
import type { COACH_PAGES } from '../../../lib/ai/coach-contract.ts';
import type { MEASUREMENT_UNIT_LABELS } from '../../../lib/measurements.ts';

/**
 * AI koç ve yapay zekâ ayarları: koçun yanıtları, program taslaklarının gerekçe ve dikkat notları (taslakla birlikte
 * SAKLANIR: yazanın dilinde kalır), kayıt özetleri, uç mesajları, panel, tercihler ve Gemini bağlantı ekranı. Yanıtları
 * uygulamanın kuralları yazar; Gemini yalnız niyeti ve katalog kimliklerini seçer (komut metni `lib/ai/prompt-language.ts`).
 */
const tr = {
  /** Hedefler (`GOALS`); hedefin adı oluşturulan programın evre adı da olur. */
  goals: {
    general_fitness: 'Daha fit olmak',
    strength: 'Güç kazanmak',
    hypertrophy: 'Kas gelişimi',
    weight_management: 'Kilo yönetimini desteklemek',
    mobility: 'Hareketlilik',
  } satisfies Record<(typeof GOALS)[number], string>,
  /** Panelin başlığındaki sayfa adı (`COACH_PAGES`). */
  pages: {
    overview: 'Genel bakış',
    program: 'Program',
    measurements: 'Ölçümler',
    workout: 'Antrenman',
    progress: 'İlerleme',
    settings: 'Ayarlar',
    library: 'Kütüphane',
    health: 'Sağlık',
  } satisfies Record<(typeof COACH_PAGES)[number], string>,
  /**
   * Program sekmesinin metni role göre: danışan kendi programını ister ("sen"), PT danışan için taslak hazırlar
   * (danışandan üçüncü kişi olarak söz edilir).
   */
  programCopy: {
    client: {
      title: 'Programını hazırlayalım',
      goal: 'Ne yapmak istiyorsun?',
      manual: 'Kendim seçeyim',
      muscles: 'Çalıştırmak istediğin kasları seç',
      unclear: 'Hedef netleşmedi. Aşağıdan hedef ve kaslarını seçebilirsin.',
    },
    pt: {
      title: 'Danışan için program taslağı',
      goal: 'Danışanın hedefi ne?',
      manual: 'Koşulları ben seçeyim',
      muscles: 'Çalışılacak kasları seç',
      unclear: 'Hedef netleşmedi. Danışanın hedefini ve çalışılacak kasları aşağıdan seçebilirsin.',
    },
  },
  /** Yorumlanmayan hassas hedefin PT'ye notu (danışana koçun kendi yanıtı gider: `engine.support`/`healthQuestion`). */
  sensitive: {
    support: 'Metin ceza, telafi ya da yeme kaygısı içeriyor; AI bunu program hedefine çevirmez. Koşulları elle seçerek devam edebilirsin.',
    healthQuestion:
      'Metin ağrı, tanı ya da tedavi içeriyor; AI bundan hedef çıkarmaz, tanı ya da tedavi önermez. Koşulları elle seçerek devam edebilirsin.',
  },
  /** Uç mesajlarında iki akışın ortak cümleleri. */
  guard: {
    disabled: 'Bu danışan için AI desteği kapalı.',
    requestChanged: 'İstek değişti. Yeniden dene.',
    draftNotFound: 'Taslak bulunamadı.',
  },
  /** Koçun yanıtları (`answerCoach`) ve sohbetten program taslağı (`draftCoachProgram`). */
  engine: {
    support:
      'Bu süreçte seni yargılamıyorum. Egzersiz bir ceza veya yediklerini telafi etme aracı değil. Bugünkü koşullarını birlikte netleştirebilir, antrenörünle paylaşmak istediğin değişiklikleri taslak haline getirebiliriz.',
    healthQuestion:
      'Kayıtlardaki bulguları özetleyebilirim; bunlardan tanı veya tedavi çıkaramam. Ağrı ya da yeni bir belirti varsa bunu antrenörüne bildir; antrenörün gerekirse uygun sağlık uzmanına yönlendirir. Kamera açısı tek başına bir bozukluk veya düzeltici egzersiz gereksinimi göstermez.',
    outOfScope:
      'Antrenman geçmişi, ilerleme, kayıtlı ölçümler ve koşullarına uygun program taslakları hakkında yardımcı olabilirim. Hangi hareketi veya kaydı incelememi istersin?',
    generalPlan: 'Program taslağı belirli bir danışan için hazırlanır. Danışanın sayfasını açıp buradan devam edebilirsin.',
    ambiguousClients: (names: readonly string[]) =>
      `Bu adla birden fazla danışan var: ${names.join(', ')}. Tam adını yazarak hangisini incelememi istediğini belirtebilirsin.`,
    scopeNote: (shown: number) =>
      `Bu yanıtta ${shown} kayıt özeti gösterildi. Kalan kayıtları incelemek için belirli bir danışanın adını sor veya danışan sayfasını aç.`,
    scopeSource: 'Yanıt kapsamı',
    introMeasurement:
      'Kayıtlı ölçümleri aşağıda özetliyorum. Farklı yöntem ve çekim koşullarını eşdeğer saymıyorum; tek açıdan neden veya tanı çıkarmıyorum.',
    introOverview:
      'Kayıtlarına göre durum şöyle. Verilerin göstermediği bir nedeni varsaymıyorum; sonuçlar seni değerlendiren bir puan değil.',
    noRecords:
      'Bu soruyu karşılayacak kayıt henüz yok. Hangi hareketi izlemek istediğini antrenörünle seçip başlangıç değerini kaydedebiliriz.',
    draft: {
      healthUnavailable: 'Onaylı kısıt kaydı okunamadı. Okunmadan program taslağı hazırlamıyorum.',
      mismatch: 'İstenen hareketlerin bir kısmı seçtiğin ekipman veya kayıtlı kısıtlarla uyuşmuyor. Antrenörünle alternatif seçebiliriz.',
      notEnough:
        'Bu koşullarda yeterli, değerlendirilebilir hareket bulunamadı. Ekipman seçimini kontrol edelim veya PT kütüphaneye uygun bir alternatif eklesin.',
      rules: 'Taslak program kurallarını karşılamadı; program değiştirilmedi.',
      /** Taslağın evre adı: programla birlikte saklanır. */
      phaseName: 'AI taslağı',
      rationale: (days: number, minutes: number) => [
        `${days} gün ve ${minutes} dakikalık zaman bütçen esas alındı. Süre bir planlama tahminidir.`,
        'Yalnız seçtiğin ekipman ve kısıt filtresinden geçen katalog hareketleri kullanıldı; mevcut programındaki hareketlere öncelik verildi.',
        'Başlangıç taslağında hareket başına iki çalışma seti var. Ağırlıkları mevcut antrenman öneri motoru geçmişe göre belirler; bu taslak ağırlık uydurmaz.',
        'Bu yeni program mevcut PT programının yerini alır. PT, sıklığı, toparlanmayı, setleri ve hareket seçimini inceleyip uygun bulursa yayımlar.',
      ],
    },
  },
  /** Koç sohbeti uçlarının (`coach-routes.ts`) mesajları. */
  chat: {
    forbidden: 'Bu danışanın koç kayıtlarına erişemezsin.',
    invalidMessage: 'Mesajı ve program koşullarını kontrol et.',
    requestIdReused: 'Bu istek kimliği başka bir mesajda kullanılmış.',
    inProgress: 'Bir yanıt hazırlanıyor. Biraz sonra yeniden dene.',
    publishing: 'PT programı yayımlıyor. İşlem bitince tekrar dene.',
    dailyLimit: 'Bugünkü 30 mesaj sınırına ulaştın.',
    noConnection: 'Gemini bağlantısı eklenmemiş. Önce AI bağlantısını ayarla.',
    needConditions:
      'Taslak için aşağıdan hangi günler, kaç dakika ve hangi ekipmanlarla çalışabileceğini seç. Koşullarını tahmin etmeyeceğim.',
    pendingLimit: 'Bekleyen taslakları PT değerlendirdikten sonra yenisini hazırlayabiliriz.',
    planReply: (rationale: readonly string[]) =>
      `Koşullarına göre taslak hazırladım. Henüz programına uygulanmadı; antrenörün hareketleri, yükü ve sıklığı değerlendirip onaylayabilir.\n\n${rationale.join('\n')}`,
    closedDuring: 'AI desteği işlem sırasında kapatıldı. Yanıt kaydedilmedi.',
    permissionsChanged: 'Veri izinleri değişti. Yanıt kaydedilmedi; güncel izinlerle yeniden sor.',
    onlyPt: 'Program taslağını yalnız PT değerlendirebilir.',
    invalidDecision: 'Taslak işlemi geçersiz.',
    replying: 'Koç yanıtı hazırlanıyor. Tamamlanınca taslağı değerlendir.',
    publishStarted: 'Başlamış yayımlama tamamlanmalı; program uygulanmış olabilir.',
    expired: 'Taslak üç günü geçti. Güncel kayıtlardan yeniden hazırla.',
    contextChanged: 'Program, izinler, ölçümler veya katalog değişti. Güncel kayıtlardan yeni taslak hazırla.',
    /** Veri reposundaki kaydın commit mesajı. */
    commit: 'AI koç kaydı güncellendi',
  },
  /** Program taslağı (`assistant-engine.ts`, `assistant-routes.ts`): gerekçe ve dikkat notları taslakla saklanır. */
  assistant: {
    selectionMessage: 'Bütün beden veya en az bir kas seç.',
    openClientPage: 'Program için bir danışanın sayfasını aç.',
    healthUnavailable: 'İzinli kısıt kayıtları okunamadı. Kayıtlar okunmadan program hazırlanmıyor.',
    noMobility: {
      pt: 'Bu koşullarda uygun ısınma/soğuma hareketi yok. Hareketlilik için kütüphaneye uygun ısınma/soğuma hareketleri ekle.',
      client: 'Bu koşullarda uygun ısınma/soğuma hareketi yok. Hareketlilik için PT uygun hareketleri kütüphaneye eklemeli.',
    },
    noMoves: {
      pt: 'Seçilen kaslar, ekipman ve kısıtlar için uygun katalog hareketi yok. Seçimleri değiştir ya da kütüphaneye uygun hareket ekle.',
      client: 'Seçtiğin kaslar, ekipman ve kısıtlar için uygun katalog hareketi yok. Seçimleri değiştir veya PT’den alternatif iste.',
    },
    rulesUnmet: 'Taslak program kurallarını karşılamadı. Mevcut program değişmedi.',
    rationale: (goal: string, days: number, minutes: number) => [
      `${goal} hedefi; ${days} gün, seans başına ${minutes} dakikalık planlama bütçesi. Gerçek süre dinlenmeye ve tempoya bağlıdır.`,
      'Ekipman ve izinli kısıtlara uygun hareketler; hareket geçmişi ve farklı örüntüler esas alındı.',
      'İki set başlangıç taslağı; yükler seanstaki mevcut öneri motorundan gelir. Oluşturucuda setleri ve bileşik blokları düzenleyebilirsin.',
    ],
    weightNote: 'Egzersiz kilo değişimini garanti etmez; program bir kalori telafisi veya görünüş puanı değildir.',
    mobilityNote: 'Bu bir katalogdaki ısınma/soğuma taslağıdır; tanı veya düzeltici tedavi programı değildir.',
    attention: {
      noHistory: 'Önceki hareket geçmişi yok; başlangıç yükünü ve tekniği birlikte belirleyin.',
      missingMuscles: (muscles: readonly string[]) => `Seçilen kaslardan programda karşılanamayanlar: ${muscles.join(', ')}.`,
      consecutive: 'Ardışık antrenman günleri var; ortak kasların yükünü ve toparlanmayı gözden geçirin.',
      limitedCoverage: 'Bazı programlarda tüm beden kapsamı sınırlı; programları ve hareketleri düzenleyicide kontrol et.',
    },
    /** Taslağın adı (danışanın kendi programı olarak kaydedilirken öneri adı): "AI · Antrenman 2026-10-05 ab12". */
    draftName: (kind: 'workout' | 'program', date: string, suffix: string) => `AI · ${kind === 'workout' ? 'Antrenman' : 'Program'} ${date} ${suffix}`,
    forbidden: 'Bu kayıtlara erişemezsin.',
    permissionsChanged: 'Veri izinleri değişti. Yeniden aç.',
    invalidRequest: 'Hedef, kas, gün, süre ve ekipman seçimlerini kontrol et.',
    requestIdReused: 'Bu istek kimliği başka bir işlemde kullanılmış.',
    inProgress: 'Bir öneri hazırlanıyor. Tamamlanınca yeniden dene.',
    dailyLimit: 'Bugünkü 30 öneri sınırına ulaştın.',
    pickClient: 'Hedef için belirli bir danışanı seç.',
    needsConnection: 'Hedef metnini yorumlamak için Gemini bağlantısı gerekiyor. Seçimleri elle de yapabilirsin.',
    /** Kayıt özeti: değerlendirme hazır değilken. */
    reviewFallback: {
      title: 'Kayıt özeti',
      noRecords: 'Karşılaştırılabilir kayıt henüz yok.',
      next: 'Bir sonraki seansı tekrar, yük ve eforla kaydet; gelişimi aynı hareket ve cihazda karşılaştıralım.',
    },
    permissionsRevoked: 'İzinler değişti. Sonuç kaydedilmedi.',
    saveForbidden: 'AI izni veya oturum uygun değil.',
    draftPermissionsChanged: 'İzinler değişti. Yeni taslak hazırla.',
    ownProgramInvalid: 'Yeni kendi programının alanlarını kontrol et.',
    programInvalid: 'Programın gün, hareket ve setlerini kontrol et.',
    saveStarted: 'Bu taslağın başka bir kaydı başladı. Kendi programından düzenle.',
    preparing: 'Öneri hazırlanıyor. İşlem bitince kaydet.',
    globalNoSave: 'Genel görünümden program kaydedilemez.',
    draftStale: 'Kayıtlar değişti veya taslak üç günü geçti. Yeni taslak hazırla.',
    exerciseMismatch: 'Bir hareket güncel kısıt veya katalogla uyuşmuyor. Alternatif seç.',
    savePermissionsChanged: 'İzinler değişti. Program kaydedilmedi.',
    /** Danışan taslağı düzenleyip kendi programı olarak kaydedince gerekçenin ilk satırı. */
    savedOwnRationale: (workouts: number) => `Düzenleyicide incelenip kaydedilen kendi programı: ${workouts} antrenman.`,
    deviceGone: 'Seçilen cihaz artık kütüphanede yok. Başka cihaz seç.',
    /** Veri reposundaki kaydın commit mesajı. */
    commit: 'AI önerileri güncellendi',
  },
  /** PT'nin bildirimi: danışan AI taslağını kendi programı olarak kaydetti (`assistantNotices`). */
  notices: {
    aiProgram: (name: string, attention: string) => `AI ile oluşturulan ${name}: ${attention}`,
  },
  /** Gelişim değerlendirmesi (`coach-review.ts`): aynı hareket ve cihazın tarihler arası karşılaştırması. */
  review: {
    metrics: { strength: 'Tahmini maksimum', seconds: 'Süre', reps: 'Tekrar' },
    units: { kg: 'kg', seconds: 'sn', reps: 'tekrar' },
    performance: {
      strength: (kg: number, reps: number) => `${kg} kg × ${reps} tekrar`,
      seconds: (seconds: number) => `${seconds} sn`,
      reps: (reps: number) => `${reps} tekrar`,
    },
    patternTitle: 'Antrenman düzeni',
    recent: (count: number) => `Son 28 günde ${count} tamamlanmış antrenman kaydı var.`,
    recentNext: 'Sonraki seansı mevcut programın sıradaki antrenmanından sürdür; gün ve süre sana uymuyorsa programı bu koşullara göre düzenle.',
    recentNextEmpty: 'Bir sonraki tamamlanan seansı kaydet; sıklık ve gelişim değerlendirmesini bu kayıtlarla başlatalım.',
    sessionSource: (date: string) => `${date} antrenman kaydı`,
    baseline: (date: string, performance: string) => `${date}: ${performance} başlangıç kaydı. Aynı cihazla önceki karşılaştırma yok.`,
    baselineNext: 'Sonraki seansı aynı hareket ve cihazla kaydet; yük artışına karar vermeden tekrar ve eforu karşılaştır.',
    exerciseSource: (date: string, title: string) => `${date} · ${title}`,
    change: (from: string, to: string, before: string, after: string, metric: string, direction: 'up' | 'down' | 'same', amount: string, unit: string) =>
      `${from} → ${to}: ${before} → ${after}. ${metric} ${amount} ${unit} ${{ up: 'arttı', down: 'azaldı', same: 'aynı kaldı' }[direction]}; bu iki seansın karşılaştırması.`,
    nextDown:
      'Sonraki seansta yükü artırmayı ertele; aynı cihazda tekrar ve eforu kaydet. Düşüş tekrarlanırsa set yükünü ve dinlenmeyi PT ile gözden geçir.',
    nextUp: 'İlerleme var. Sonraki seansta mevcut tekrar aralığını ve eforu kontrol et; uygulamadaki hareket önerisini esas al.',
    nextSame:
      'Hedef tekrar aralığı ve efor kaydını kontrol et. Hedef henüz tamamlanmadıysa aynı yükte tekrarları ilerlet; tamamlandıysa uygulamanın sonraki yük önerisini değerlendir.',
  },
  /** Danışana görünen otomatik mesajlar (`coachHighlights`); kaydedilen olaylar, beden puanı ya da kalori telafisi yok. */
  highlights: {
    celebrate: (dayName?: string) => `${dayName ?? 'Bugünkü'} antrenmanını kaydettin. Emeğine sağlık!`,
    comment: (date: string, sets: number) =>
      `${date} tarihinde ${sets} çalışma seti kaydedilmiş. Bu, yaptıklarının özeti; daha fazla yapmak zorunda değilsin.`,
    suggest:
      'Bir sonraki antrenmanda nasıl hissettiğini hazır oluşluk alanına gir; önerilen yük, izin verdiğin kayıtlarına göre ayarlanabilir. Bir hareket veya ekipman uygun değilse PT’nin değerlendirmesi için koça söyleyebilirsin.',
  },
  /** Koçun bağlamındaki kayıt özetleri (`coachContext`); her biri kaynağıyla gösterilir. */
  facts: {
    history: (count: number) => `Bitmiş ${count} antrenman kaydı var.`,
    historySource: 'Antrenman geçmişi',
    defaultDayName: 'Antrenman',
    session: (date: string, day: string, sets: number, volume: number) =>
      `${date}: ${day}, ${sets} çalışma seti, ${volume} kg toplam hacim. Hacim farklı hareketler arasında bir güç puanı değildir.`,
    sessionSource: (date: string) => `${date} antrenman kaydı`,
    difference: (kg: string) => `Aynı hareket ve cihazın önceki tahminine göre fark ${kg} kg. Tek seans farkı neden veya başarısızlık göstermez.`,
    noPrevious: 'Karşılaştırılabilecek önceki tahmin bulunamadı.',
    removedExercise: 'Kütüphaneden kaldırılmış hareket',
    exercise: (date: string, title: string, e1rm: string, kg: number, reps: number, difference: string) =>
      `${date}, ${title}: tahmini maksimum ${e1rm} kg (${kg} kg × ${reps} tekrar). ${difference} Bu bir gerçek maksimum testi değildir.`,
    exerciseSource: (date: string, title: string) => `${date} · ${title} kaydı`,
    program: (days: number) => `Mevcut PT programında ${days} antrenman günü tanımlı.`,
    programSource: 'PT programı',
    camera: (date: string, title: string, metrics: string) =>
      `${date}, ${title}: ${metrics}. Bu bir 2D kamera ölçümüdür; normal/anormal etiketi verilmedi.`,
    measurement: (date: string, label: string, side: 'left' | 'right' | undefined, value: number, unit: string) =>
      `${date}, ${label}${side ? (side === 'left' ? ' (sol)' : ' (sağ)') : ''}: ${value} ${unit}. Ölçüm yöntemini eşitlemeden farkı gelişim olarak yorumlamıyorum.`,
    /** Ölçüm kaynağı (kamera ve elle girilen ölçüm). */
    measurementSource: (date: string, title: string) => `Ölçüm ${date} · ${title}`,
    /** Ölçüm birimleri bu cümlelerde kayıttaki kodla yazılır (`s`, `puan`). */
    units: { kg: 'kg', cm: 'cm', s: 's', '%': '%', puan: 'puan' } satisfies Record<keyof typeof MEASUREMENT_UNIT_LABELS, string>,
  },
  /** Genel (tüm danışanlar) koç bağlamı (`coach-global.ts`). */
  general: {
    clientName: 'Tüm danışanlar',
    scope: (total: number, allowed: number) =>
      `${total} danışandan ${allowed} danışanın AI desteği açık. Sağlık kayıtları yalnız mevcut sağlık izninin kapsamına göre kullanılır. Diğerlerinin kişisel kayıtları bu değerlendirmede kullanılmaz.`,
    scopeSource: 'Danışan kapsamı',
    unreadable: (name: string) => `${name}: kayıt okunamadı; eksik bilgiden sonuç çıkarmıyorum.`,
    unreadableSource: 'Eksik kayıt',
    capped: 'Genel yanıtta en fazla 100 kayıt özeti gösterilir. Belirli bir danışanı incelemek için danışan sayfasından sor.',
    cappedSource: 'Yanıt kapsamı',
  },
  /** Gemini API anahtarı doğrulaması (istemci ve sunucu); girilen değer hiçbir mesaja girmez. */
  keyErrors: {
    incomplete: 'Girilen değer çok kısa. Google AI Studio’dan API anahtarının tamamını kopyala; anahtar adını değil.',
    long: 'Girilen değer API anahtarı için çok uzun. Yalnız anahtarın kendisini yapıştır.',
    masked: 'Bu kısaltılmış veya gizlenmiş bir anahtar. Google AI Studio’daki kopyalama düğmesiyle tam anahtarı al.',
    spaces: 'Anahtarın içinde boşluk veya satır sonu var. Google AI Studio’daki kopyalama düğmesiyle tam anahtarı al.',
    characters: 'Girilen değer API anahtarı biçiminde değil. Yalnız anahtarı yapıştır; adres, kod veya anahtar adı kullanma.',
    fallback: 'Gemini API anahtarını kontrol et.',
  },
  /** Kullanıcıya gösterilmeyen hatalar (günlük) ve veri reposundaki kayıtların commit mesajları. */
  internal: {
    gemini: {
      noConnection: 'Gemini bağlantısı yok. Seçimleri elle yapabilirsin.',
      interpretFailed: (status: number) => `Gemini hedefi yorumlayamadı (${status}). Seçimleri elle yapabilirsin.`,
      noResponse: (status: number) => `Gemini bağlantısı yanıt vermedi (${status}). Anahtarı ve model erişimini kontrol et.`,
      inventedExercise: 'AI katalogda olmayan bir hareket döndürdü. Program değiştirilmedi.',
    },
    keys: {
      invalidSecret: 'Geçersiz oturum anahtarı.',
      unreadable: 'Anahtar kaydı okunamadı.',
      clientRepo: 'Danışanın veri reposu özel ve bağımsız olmalı.',
      appRepo: 'Özel veri alanı hazır değil. Önce kurulum görünümünü kaydet.',
    },
    general: {
      privateRepo: 'PT sohbeti için özel ve bağımsız veri reposu gerekiyor.',
      invalidFile: 'Geçersiz koç dosyası.',
      readOnly: 'Genel sohbet seans/program dosyalarına yazamaz.',
      noConnection: 'PT Gemini bağlantısı kapalı.',
      noPublish: 'Genel sohbetten program yayımlanamaz.',
    },
    commits: {
      clientKey: 'Danışanın AI bağlantısı güncellendi',
      preferences: 'Danışanın koç bildirim tercihleri güncellendi',
      ptKey: 'Gemini bağlantı ayarı güncellendi',
    },
  },
  /** Bağlam okunurken kullanıcıya dönen hatalar (`GithubError` gibi durumla). */
  failures: {
    programUnreadable: 'Mevcut program okunamadı. Taslak hazırlanmadan önce programı düzelt.',
    connectionClosed: 'Gemini bağlantısı kapatılmış. Anahtarını kontrol et.',
    aiDisabled: 'AI desteği kapatıldı. Program yayımlanmadı.',
    recordsChanged: 'Kayıtlar veya izinler değişti. Taslağı yeniden hazırla.',
    catalogChanged: 'Program veya katalog değişti. Taslağı yeniden hazırla; mevcut programın korunuyor.',
  },
  /** Uç (route handler) mesajları. */
  api: {
    clientSessionRequired: 'Danışan oturumu gerekiyor.',
    ptOnly: 'Bu işlem yalnız PT’ye açık.',
    generalOpenFailed: 'Genel koç sohbeti açılamadı.',
    generalReplyFailed: 'Yanıt hazırlanamadı. Gemini bağlantısını kontrol et.',
    openFailed: 'AI koç şu an açılamadı.',
    replyFailed: 'AI yanıtı hazırlanamadı. Gemini bağlantısını kontrol et veya yeniden dene.',
    draftApplyFailed: 'Taslak uygulanamadı.',
    invalidDraft: 'Taslak kimliği veya program bilgileri geçersiz.',
    keyStatusUnreadable: 'Anahtar durumu okunamadı. Özel veri alanına erişimini kontrol et.',
    checkKey: 'Anahtarı kontrol et.',
    invalidKeyRequest: 'Anahtar isteği geçersiz.',
    keySaveFailed: 'Anahtar kaydedilemedi. Özel veri alanına erişimini kontrol edip tekrar dene.',
    connectionOpenFailed: 'AI bağlantısı açılamadı.',
    clientNotFound: 'Danışan bulunamadı.',
    ptMustEnable: 'Önce PT AI desteğini açmalı.',
    connectionSaveFailed: 'AI bağlantısı kaydedilemedi.',
    highlightsFailed: 'Koç yorumları şu an okunamadı.',
    preferencesReadFailed: 'Koç tercihleri okunamadı.',
    checkPreferences: 'Tercihleri kontrol et.',
    preferencesSaveFailed: 'Koç tercihleri kaydedilemedi.',
    programSaveFailed: 'Program kaydedilemedi. Yeniden dene.',
  },
  /** Panel (`CoachPanel`). */
  panel: {
    loading: 'AI önerileri açılıyor',
    loadFailed: 'Öneriler açılamadı',
    retry: 'Yeniden dene',
    actionFailed: 'İşlem tamamlanamadı. Yeniden dene.',
    interpreted: 'Yazdıkların seçimlere dönüştü. Belirtmediğin alanlar doldurulmadı; kontrol edip eksikleri tamamla.',
    disabledTitle: 'AI desteği kapalı',
    openClientSettings: 'Danışan ayarlarını aç',
    askTrainer: 'Antrenörün AI desteğini açabilir.',
    reviewTab: 'Gelişim',
    programTab: 'Program hazırla',
    reviewTitle: 'Gelişim değerlendirmesi',
    reviewEmpty: 'Önemli değişiklikler ve sonraki adım.',
    preparing: 'Hazırlanıyor…',
    reevaluate: 'Yeniden değerlendir',
    evaluate: 'Değerlendir',
    nextStep: 'Sonraki adım: ',
    legacyReview: 'Bu eski değerlendirme kayıt özetidir. Gelişim ve sonraki adımlar için yeniden değerlendir.',
    reviewPrompt: 'Kayıtları karşılaştırmak için Değerlendir’e bas.',
    sources: 'Dayanak kayıtları',
    programHint: 'Hedefi ve koşulları belirle; taslağı oluşturucuda düzenle.',
    goalPlaceholder: 'Bütün beden, haftada 2 gün, 45 dakika, dambıl.',
    interpret: 'Hedefi yorumla',
    conditionsTitle: 'Antrenman koşulları',
    goalLabel: 'Hedef',
    pickGoal: 'Hedef seç',
    fullBody: 'Bütün beden',
    weekdays: 'Antrenman günleri',
    minutes: 'Seans süresi (dakika)',
    minutesPlaceholder: '15–120',
    equipment: 'Ekipman',
    createProgram: 'Program oluştur',
    createWorkout: 'Tek antrenman oluştur',
    addConnection: 'Gemini bağlantısı ekle',
    dayCount: (days: number) => `${days} gün`,
    saved: 'Atandı / kaydedildi',
    draft: 'Taslak',
    attention: 'Gözden geçirilecekler',
    rationale: 'Seçim gerekçesi',
    editInBuilder: 'Oluşturucuda düzenle',
    approve: 'Onayla ve danışana ata',
    replacesProgram: 'Onaylandığında mevcut PT programının yerine geçer.',
    openProgram: 'Programı aç',
    editAndSave: 'Oluşturucuda düzenle ve kaydet',
  },
  /** Panel sayfası (`CoachLauncher`). */
  launcher: {
    title: 'AI koç',
    scopeClient: 'Yalnız kendi kayıtların · ',
    scopeSelected: 'Bu danışanın kayıtları · ',
    scopeAll: 'Tüm danışanlar · ',
    evaluateAll: 'Tüm danışanları değerlendir',
    backToClient: 'Bu danışanın önerilerine dön',
    preferencesLink: 'Kutlama ve öneri tercihleri',
    nudgeTitle: 'Koçtan mesaj',
    nudgeClose: 'Koç mesajını kapat',
    nudgeOpen: 'Önerileri aç',
  },
  /** Danışanın kendi Gemini bağlantısı (`CoachConnection`). */
  connection: {
    summary: (connected: boolean) => `Kendi Gemini bağlantım ${connected ? '· bağlı' : '· isteğe bağlı'}`,
    intro:
      'Kendi anahtarını eklersen yazdığın hedefi yorumlarken o kullanılır. PT kendi bağlantısını kullanır. Anahtarın şifreli saklanır ve tekrar gösterilmez.',
    disabled: 'Yeni bağlantı eklemek için PT AI desteğini açmalı. Mevcut bağlantını kaldırabilirsin.',
    getKey: 'Google AI Studio’dan anahtar al',
    keyLabel: 'Gemini API anahtarı',
    changePlaceholder: 'Bağlantıyı değiştirmek için yeni anahtar',
    newPlaceholder: 'Anahtarını yapıştır',
    save: 'Kendi bağlantımı kaydet',
    remove: 'Kendi bağlantımı kaldır',
  },
  /** Danışanın koç tercihleri (`CoachPreferenceForm`). */
  preferences: {
    title: 'AI koç tercihleri',
    // i18n-followup(T3): metin "AI değerlendirmesi" (İlerleme) ve "AI ile program öner" (Programlar) düğmelerini adıyla anar; T3 düğme etiketlerini aynı İngilizce adlarla çevirmeli.
    description:
      'Antrenörün AI desteğini açtıysa AI koça İlerleme\'deki “AI değerlendirmesi” ve Program\'daki “AI ile program öner” düğmelerinden ulaşırsın. Otomatik mesajlar da o zaman tercihlerine göre gösterilir. Sağlık kayıtları mevcut sağlık izninin kapsamıyla sınırlıdır; bu mesajlar için Gemini çağrısı yapılmaz.',
    loading: 'Tercihler açılıyor…',
    reload: 'Tercihleri yeniden aç',
    saveFailed: 'Tercih kaydedilemedi.',
    comments: { label: 'Antrenman yorumları', hint: 'Kaydettiğim antrenman hakkında kısa bir özet göster.' },
    celebrations: { label: 'Kutlama ve tebrikler', hint: 'Antrenmanımı tamamladığımda motive eden bir mesaj göster.' },
    suggestions: { label: 'Koç önerileri', hint: 'Kayıtlarıma dayanan sonraki adım önerilerini göster.' },
  },
  /** Ayarlar > Yapay zekâ (`settings/ai`). */
  settings: {
    title: 'Yapay zekâ',
    description: 'Gemini anahtarını kurulumdan sonra ekle veya değiştir.',
    heading: 'Gemini bağlantısı',
    unreadable: 'Anahtar durumu okunamadı. Özel veri alanına erişimini kontrol et veya anahtarı yeniden kaydet.',
    fromEnvironment: 'Anahtar kurulum sırasında Vercel’de tanımlanmış.',
    fromSettings: 'Anahtar bu panelden kaydedilmiş.',
    none: 'Henüz Gemini anahtarı eklenmedi.',
    create: 'Google AI Studio’da Gemini anahtarı oluştur',
    newKeyLabel: 'Yeni Gemini API anahtarı',
    keyLabel: 'Gemini API anahtarı',
    keyHint:
      'Kaydedilmiş anahtar tekrar gösterilmez. Google AI Studio’daki kopyalama düğmesiyle tam anahtarı al; anahtar adını veya gizlenmiş önizlemeyi yapıştırma. Boş bırakırsan mevcut anahtar değişmez.',
    saving: 'Kaydediliyor…',
    change: 'Anahtarı değiştir',
    save: 'Anahtarı kaydet',
    remove: 'Paneldeki anahtarı kaldır',
    note: 'Buradan eklediğin anahtar kendi özel veri alanında şifreli saklanır ve Vercel’deki anahtarın yerine kullanılır. Kaldırırsan varsa Vercel’deki anahtar tekrar kullanılır; Google’daki anahtar iptal olmaz.',
    removed: 'Paneldeki anahtar kaldırıldı.',
    saved: 'Gemini anahtarı kaydedildi. Yeniden yayınlamana gerek yok.',
    saveFailed: 'Anahtar kaydedilemedi.',
  },
  /** Taslak düzenleme sayfaları (PT: `clients/[id]/coach/drafts`, danışan: `programlar/ai`). */
  draftPages: {
    pt: {
      title: 'AI programını düzenle',
      description: 'Programları, hareketleri ve bileşik blokları düzenle; hazır olduğunda danışana ata.',
      back: 'Program',
      notice: 'Onayladığında mevcut PT programının yerine atanır. Bu ekranda yaptığın değişiklikler onaylayana kadar danışanı etkilemez.',
    },
    client: {
      title: 'AI taslağını düzenle',
      back: 'Program',
      notice:
        'Programları, günlerini, hareketleri ve setleri kontrol et. Kaydedince kendi programın olarak PT’ye görünür; PT gerektiğinde düzenleyebilir. Mevcut PT programın değişmez. Hedef veya kayıtların değiştiyse yeni taslak hazırla.',
    },
  },
};

export default tr;
