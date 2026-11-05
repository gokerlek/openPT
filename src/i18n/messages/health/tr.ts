import type { Irritability, RedFlagCheck, SymptomDirection, ToleranceMode } from '../../../lib/check-in.ts';
import type {
  AvoidTagId,
  ClearanceBasis,
  ConstraintRegion,
  ConstraintSide,
  ConstraintType,
  DiagnosisSource,
  Graft,
  OnsetChoice,
  Severity,
  Stage,
  Trigger,
} from '../../../lib/constraints.ts';
import type { Stage as ExposureStage } from '../../../lib/exposure.ts';
import type { HealthLock } from '../../../lib/measurement-log.ts';
import type { HealthField } from '../../../lib/schemas/client.ts';

/**
 * Sağlık: kısıtlar, kısıt süzgecinin gerekçeleri, danışanın hareket kartındaki not, ağrı yoklaması, hareket deneyimi
 * aşamaları, sağlık kaydının kilitleri ve şema mesajları. Klinik metin (bölgeler, kaçınmalar, şiddet, kırmızı bayrak,
 * acil yönlendirme) için İngilizce bir uzmanın gözünden geçmeli (plan §8.9).
 *
 * Kısıt kaydının satırları (`constraintLog`) saklanır: yazanın dilinde kalır.
 */

/** Bölge ve taraf: "Sol diz", "Bel". */
type Where = { region: ConstraintRegion; side?: ConstraintSide | undefined };

const regions = {
  neck: 'Boyun',
  shoulder: 'Omuz',
  elbow: 'Dirsek',
  wrist_hand: 'El bileği',
  upper_back: 'Sırt',
  lower_back: 'Bel',
  hip: 'Kalça',
  knee: 'Diz',
  ankle_foot: 'Ayak bileği',
  other: 'Başka bir yer',
} satisfies Record<ConstraintRegion, string>;

const SIDE_PREFIX: Record<ConstraintSide, string> = { left: 'Sol', right: 'Sağ', both: 'İki' };

/** Danışana ikinci tekil: "sol dizin" (için), "sol dizini" (düşünerek), "sol dizine" (uygun). */
const REGION_FORMS: Record<ConstraintRegion, { gen: string; acc: string; dat: string }> = {
  neck: { gen: 'boynun', acc: 'boynunu', dat: 'boynuna' },
  shoulder: { gen: 'omzun', acc: 'omzunu', dat: 'omzuna' },
  elbow: { gen: 'dirseğin', acc: 'dirseğini', dat: 'dirseğine' },
  wrist_hand: { gen: 'el bileğin', acc: 'el bileğini', dat: 'el bileğine' },
  upper_back: { gen: 'sırtın', acc: 'sırtını', dat: 'sırtına' },
  lower_back: { gen: 'belin', acc: 'belini', dat: 'beline' },
  hip: { gen: 'kalçan', acc: 'kalçanı', dat: 'kalçana' },
  knee: { gen: 'dizin', acc: 'dizini', dat: 'dizine' },
  ankle_foot: { gen: 'ayak bileğin', acc: 'ayak bileğini', dat: 'ayak bileğine' },
  other: { gen: 'bu bölgen', acc: 'bu bölgeni', dat: 'bu bölgene' },
};

/** "sol dizin": taraf yalnız verildiyse (çift bölge denetimini çağıran yapar). */
function yourRegion(where: Where, form: 'gen' | 'acc' | 'dat'): string {
  const word = REGION_FORMS[where.region][form];
  if (!where.side) return word;
  const prefix = where.side === 'left' ? 'sol' : where.side === 'right' ? 'sağ' : 'iki';
  return `${prefix} ${word}`;
}

const lower = (text: string) => text.toLocaleLowerCase('tr');

const tr = {
  constraints: {
    regions,
    /** Çift bölgede taraflı ad: "Sol diz", "İki omuz". */
    regionWithSide: (side: ConstraintSide, region: ConstraintRegion) => `${SIDE_PREFIX[side]} ${lower(regions[region])}`,
    /** Danışana ikinci tekil ("sol dizin"); taraf yalnız çift bölgede gelir. */
    yourRegion,
    sides: { left: 'Sol', right: 'Sağ', both: 'İki taraf' } satisfies Record<ConstraintSide, string>,
    types: {
      injury: 'Sakatlık',
      condition: 'Rahatsızlık',
      post_op: 'Ameliyat sonrası',
      limitation: 'Hareket kısıtı',
    } satisfies Record<ConstraintType, string>,
    /** Danışanın bildirim sheet'indeki cevaplar. */
    typeClient: {
      injury: 'Yeni bir sakatlık',
      condition: 'Eskiden beri süren bir sorun',
      post_op: 'Ameliyat oldum',
      limitation: 'Doktorum bir şeyden kaçınmamı söyledi',
    } satisfies Record<ConstraintType, string>,
    severities: { mild: 'Hafif', moderate: 'Orta', severe: 'Şiddetli' } satisfies Record<Severity, string>,
    severityDescriptions: {
      mild: 'Antrenmanı etkilemiyor',
      moderate: 'Bazı hareketlerde zorluyor',
      severe: 'Günlük hayatı etkiliyor',
    } satisfies Record<Severity, string>,
    diagnosisSources: {
      clinician: 'Hekim ya da fizyoterapist',
      client: 'Danışanın beyanı',
    } satisfies Record<DiagnosisSource, string>,
    clearanceBases: {
      client_report: 'Danışanın beyanı',
      written_report: 'Yazılı rapor',
    } satisfies Record<ClearanceBasis, string>,
    grafts: { hamstring: 'Hamstring', patellar_tendon: 'Patellar tendon', other: 'Başka' } satisfies Record<Graft, string>,
    stages: {
      1: '1 · izometrik',
      2: '2 · izotonik',
      3: '3 · enerji depolama',
      4: '4 · spora dönüş',
    } satisfies Record<Stage, string>,
    /** Danışanın "Neler zorluyor?" cevapları. */
    triggers: {
      squat: 'Çömelmek',
      overhead: 'Kolu başın üstüne kaldırmak',
      bend: 'Öne eğilmek',
      jump: 'Zıplamak',
      lean_back: 'Geriye eğilmek',
    } satisfies Record<Trigger, string>,
    onsetChoices: { week: 'Bu hafta', month: 'Bu ay', months: '1–6 ay', longer: 'Daha uzun' } satisfies Record<OnsetChoice, string>,
    /** Kaçınılacak hareketler (PT'ye: "Kaçın: derin diz bükme"). */
    avoid: {
      deep_knee_flexion: 'Derin diz bükme (90° üstü)',
      knee_end_extension_open: 'Açık zincirde son aralık diz açma',
      deep_hip_flexion: 'Derin kalça bükme (90° üstü)',
      overhead: 'Kol baş üstünde (90° üstü)',
      abduction_external_rotation: '90° kol açma + son aralık dış rotasyon',
      behind_body: 'Dirsek gövdenin arkasında',
      ir_under_load: 'Yük altında iç rotasyon',
      loaded_horizontal_adduction: 'Dirençle göğüste kapanma',
      loaded_spinal_flexion: 'Yüklü öne bükülme',
      spinal_flexion_rotation: 'Öne bükülme + dönme',
      loaded_spinal_extension: 'Yüklü geriye bükülme',
      high_axial_load: 'Yüksek eksenel yük (bar sırtta)',
      high_shear: 'Yüksek kesme kuvveti',
      ballistic: 'Sıçrama / balistik',
      forward_bend: 'Öne eğilme / yerden kaldırma',
    } satisfies Record<AvoidTagId, string>,
    /** Etiket listesi cümlenin içinde: "derin diz bükme (90° üstü), sıçrama / balistik". */
    inlineList: (labels: readonly string[]) => labels.map(lower).join(', '),
    /** Başlangıç yaklaşıksa. */
    approxOnset: (text: string) => `yaklaşık ${text}`,
    /** Kartın ikinci satırı: "Rahatsızlık · orta · başlangıç Ağu 2026". */
    meta: (type: string, severity: string | null, onset: string | null) =>
      [type, severity ? lower(severity) : null, onset ? `başlangıç ${onset}` : null].filter(Boolean).join(' · '),
    /** Kısıt adı yokken (silinmiş kısıtın izni). */
    fallbackName: 'Kısıt',
    /** Kauda ekina seçilince ve Dikkat maddesinde (yoklamanın "Bugün yük yok" diliyle aynı). */
    emergency: 'Acil: danışanı bugün acil servise yönlendir.',
    /** Bildirim sheet'inin iki kademeli güvenlik metni (§2.4; Finucane 2020, Stiell 1992, Stiell 1995). */
    reportSafety: {
      urgent: 'İdrar ya da dışkılamada yeni değişiklik, kasıkta uyuşma ya da yeni güç kaybı varsa beklemeden acil servise başvur.',
      other:
        'Geceleri uyandıran ağrı, düşme ya da darbeden sonra üstüne basamama, hızla şişen ya da kilitlenen eklem varsa antrenmandan önce bir sağlık profesyoneline görün.',
    },
    /** Bildirimden sonraki metin (§2.4). */
    afterReport: {
      serious:
        'Antrenörüne iletildi. Antrenörün bakana kadar bu bölgeyi zorlayan hareketleri yapma; ağrı günlük hayatını etkiliyorsa bir sağlık profesyoneline görün.',
      other:
        'Antrenörüne iletildi. Antrenörün bakana kadar zorlayan hareketlerde dikkatli ol; ağrı yaparsa antrenmanda ⋯ menüsünden hareketi atla ya da muadil seç.',
    },
    errors: {
      notFound: 'Kısıt bulunamadı; silinmiş olabilir.',
      changed: 'Bu kısıt o arada değişti. Sayfayı yenileyip yeniden bak.',
      side: 'Taraf seç.',
      diagnosisUnknown: 'Tanı sözlükte yok.',
      diagnosisSource: 'Tanının kaynağını seç.',
      findingUnknown: 'Gözlem sözlükte yok.',
      tooMany: (max: number) => `En fazla ${max} kısıt tutulur; kapananlardan silebilirsin.`,
      tooManyActive: (max: number) => `En fazla ${max} etkin kısıt olabilir; birini kapat.`,
      idConflict: 'Kimlik çakıştı; yeniden dene.',
      decided: 'Bu bildirim zaten karara bağlanmış.',
      referRedFlagOnly: 'Yönlendirme yalnız kırmızı bayraklı tanıda kaydedilir.',
      clearRedFlagOnly: 'Görüş yalnız kırmızı bayraklı tanıda kaydedilir.',
      overrideInactive: 'İzin yalnız etkin kısıta verilir.',
      overrideEmergency: 'Bu kısıtta izin verilemez.',
      overrideAwaiting: 'Sağlık profesyonelinin görüşü kaydedilene kadar izin verilemez.',
      tooManyOverrides: (max: number) => `En fazla ${max} izin tutulur.`,
      overrideNotFound: 'İzin bulunamadı; kaldırılmış olabilir.',
      reportSide: 'Hangi taraf olduğunu seç.',
      tooManyReports: (max: number) => `Antrenörünün bakmadığı ${max} bildirimin var; önce onları beklemelisin.`,
      reviewed: 'Antrenörün bu bildirime baktı; artık "Kötüleşti" ya da "Düzeldi" diyebilirsin.',
      inactive: 'Bu kısıt artık etkin değil.',
      severityNotHigher: 'Şiddet şimdikinden yüksek olmalı.',
    },
    /** Kısıt kaydının satırları (saklanır; yazanın dilinde). */
    log: {
      avoidSuffix: (list: string) => ` · kaçın: ${list}`,
      added: (region: string, avoidSuffix: string) => `${region} eklendi${avoidSuffix}`,
      confirmed: (region: string, avoidSuffix: string) => `${region} onaylandı${avoidSuffix}`,
      seenUnfiltered: (region: string) => `${region} görüldü (süzgeçsiz)`,
      edited: (region: string, changes: readonly string[]) => `${region}: ${changes.join(', ')}`,
      declined: (region: string) => `${region} bildirimi kısıt olarak alınmadı`,
      resolved: (region: string) => `${region} kapandı`,
      resolvedByClient: (region: string) => `${region} kapandı (danışan düzeldi dedi)`,
      reopened: (region: string) => `${region} yeniden açıldı`,
      referred: (region: string) => `${region}: sağlık profesyoneline yönlendirildi`,
      cleared: (region: string, basis: string) => `${region}: görüş alındı (${lower(basis)})`,
      removed: (region: string) => `${region} silindi`,
      overrideAdded: (region: string, title: string) => `${region}: izin verildi · ${title}`,
      overrideRemoved: (region: string, title: string) => `${region}: izin kaldırıldı · ${title}`,
      reported: (region: string, severity: string | null) => `${region} bildirildi${severity ? ` (${lower(severity)})` : ''}`,
      reportEdited: (region: string) => `${region} bildirimi düzeltildi`,
      withdrawn: (region: string) => `Bildirim geri çekildi: ${region}`,
      worsened: (region: string, from: string | null, to: string) => `${region}: ${from ? `${lower(from)} → ` : ''}${lower(to)} (danışan)`,
      improved: (region: string) => `${region}: düzeldi dedi (danışan)`,
      /** Düzenlemenin parçaları. */
      changes: {
        region: (region: string) => `bölge ${lower(region)}`,
        type: (type: string) => `tür ${lower(type)}`,
        severity: (from: string | null, to: string | null) => `${from ? lower(from) : 'şiddet yok'} → ${to ? lower(to) : 'şiddet yok'}`,
        diagnosisChanged: 'tanı değişti',
        diagnosisRemoved: 'tanı kaldırıldı',
        findingChanged: 'gözlem değişti',
        findingRemoved: 'gözlem kaldırıldı',
        avoid: (list: string) => `kaçın: ${list}`,
        noAvoid: 'kaçınma yok',
        clientNote: 'danışana not',
        note: 'not',
        details: 'ayrıntılar',
        onset: 'başlangıç',
      },
    },
  },
  /** Kısıt süzgecinin gerekçeleri (PT'ye) ve danışanın hareket kartındaki not. */
  care: {
    reasons: {
      avoid: (label: string, avoid: string) => `${label}: ${lower(avoid)}`,
      fallback: (label: string, avoid: string) => `${label}: etiket eksik; ${lower(avoid)} olabilir`,
      referral: (label: string) => `${label}: sağlık profesyonelinin görüşü bekleniyor`,
      severe: (label: string) => `${label}: danışan şiddetli kötüleşti dedi; sen bakana kadar dikkat`,
      reportTrigger: (label: string, trigger: string) => `Danışan bildirdi (karar bekliyor): ${label} · ${lower(trigger)}`,
      reportSevere: (label: string) => `Danışan bildirdi (karar bekliyor): ${label} · şiddetli; bölgeyi çalıştırıyor`,
    },
    /** Kartın sheet'i (danışana, telaşsız; "yasak", "risk", tanı adı yok). */
    row: {
      title: (label: string) => `${label} için not`,
      avoidOwn: (where: Where) => `Bu hareket şu an ${yourRegion(where, 'gen')} için önerilmiyor. Bugün geç ya da antrenörüne sor.`,
      avoid: (where: Where) => `Antrenörün bu hareketi ${yourRegion(where, 'gen')} için değiştirecek. Bugün 'Değiştir'den bir muadil seç.`,
      referral: 'Antrenörün bu bölge için sağlık profesyonelinin görüşünü bekliyor. Ağrı yaparsa hareketi geç.',
      report: (label: string) => `Bildirdiğin ${lower(label)} için zorlayabilir; ağrı yaparsa geç.`,
      severe: (label: string) =>
        `Kötüleştiğini bildirdiğin ${lower(label)} için zorlayabilir. Antrenörün bakana kadar ağrı yaparsa geç ya da Değiştir'e dokun.`,
      noteOwn: (where: Where) => {
        const yours = yourRegion(where, 'gen');
        return `${yours.charAt(0).toLocaleUpperCase('tr')}${yours.slice(1)} için dikkatli ol; ağrısız aralıkta kal, ağrı artarsa hareketi geç.`;
      },
      note: (where: Where) =>
        `Antrenörün bu hareketi ${yourRegion(where, 'acc')} düşünerek planladı. Ağrısız aralıkta kal; ağrı artarsa hareketi geç ya da Değiştir'e dokun.`,
    },
    /** Bugün önizlemesinde hareketin kısıt satırı: "Sol diz için dikkat: Back Squat". */
    line: {
      caution: (label: string, title: string) => `${label} için dikkat: ${title}`,
      swap: (label: string, title: string) => `${label} için değiştir: ${title}`,
      notRecommended: (label: string, title: string) => `${label} için önerilmiyor: ${title}`,
    },
    /** "Değiştir"deki kısa satır. */
    option: {
      caution: (label: string) => `${label} için dikkatli`,
      reported: (label: string) => `Bildirdiğin ${lower(label)} için dikkatli`,
    },
    /** Danışana yasaklı hareketin metni (antrenmanda "Hareket ekle" ve kendi programın kaydı aynı cümle). */
    blocked: 'Bu hareket şu an sana önerilmiyor; antrenörüne sor.',
    noConsent: 'Kısıtlar kullanılamıyor: danışanın sağlık onayı yok.',
  },
  /** Seans yoklaması ve yük toleransı. */
  checkIn: {
    symptomDirections: {
      centralizing: 'Merkeze çekiliyor',
      stable: 'Değişmedi',
      peripheralizing: 'Aşağı yayılıyor',
    } satisfies Record<SymptomDirection, string>,
    irritability: {
      low: 'Düşük (ara ara, kolay tetiklenmiyor)',
      moderate: 'Orta',
      high: 'Yüksek (sürekli, kolay tetikleniyor)',
    } satisfies Record<Irritability, string>,
    redFlags: {
      none: 'Yok',
      new_neuro_deficit: 'Yeni uyuşma / güç kaybı',
      bladder_bowel_change: 'İdrar ya da dışkılama değişikliği',
      night_pain: 'Geceleri uyandıran ağrı',
      new_trauma: 'Yeni düşme ya da darbe',
    } satisfies Record<RedFlagCheck, string>,
    toleranceModes: {
      pain_free: 'Ağrısız (en fazla 3/10)',
      pain_monitoring: 'Ağrı izleme (en fazla 5/10, tendinopati)',
    } satisfies Record<ToleranceMode, string>,
    reasons: {
      redFlag: (flag: string) => `Yeni kırmızı bayrak (${lower(flag)}): tıbbi değerlendirme olmadan yük verilmez.`,
      peripheralizing: 'Semptom aşağı yayılıyor: yükleme durur, önce merkezileşme sağlanır.',
      notBackToBaseline: 'Önceki seansın ağrısı ertesi sabah başlangıç düzeyine dönmedi: yük %15 azaltılır.',
      peakOverCeiling: (peak: number, ceiling: number) => `Seans içi ağrı ${peak}/10, tavan ${ceiling}/10: yük azaltılır.`,
      painRisingWeekly: (before: string, after: string) => `Ağrı haftadan haftaya arttı (${before} → ${after}): artırma yok.`,
      highIrritability: 'İrritabilite yüksek: yükü artırma; izometrik ve ağrısız aralıkta çalış.',
    },
  },
  /** Hareket deneyiminin aşamaları. */
  exposureStages: {
    intro: 'Tanışma',
    novice: 'Başlangıç',
    intermediate: 'Orta',
    advanced: 'İleri',
  } satisfies Record<ExposureStage, string>,
  /** Sağlık kaydının kilitleri ve yazım hataları. */
  record: {
    /** Kilit metinlerinde parçanın adı: belirtme hâli ("“Kısıtlar”ı seç"), kaydın adı ve açılınca ne olur. */
    lock: (field: HealthField, lock: HealthLock, label: string): { title: string; description: string } => {
      const words = PART_WORDS[field];
      switch (lock) {
        case 'off':
          return {
            title: 'Sağlık modülü kapalı',
            description: `${label} sağlık verisidir; modül kapalıyken kayıt tutulmaz. Danışanın düzenleme sayfasında sağlık modülünü açıp ${words.accusative} seç; danışan bir sonraki girişinde onaylayınca ${words.entry}.`,
          };
        case 'not_selected':
          return {
            title: `${label} seçili değil`,
            description: `Sağlık modülü açık ama “${label}” parçası seçili değil. Danışanın düzenleme sayfasında seç; danışan bir sonraki girişinde yeni kapsamı onaylayınca ${words.entry}.`,
          };
        case 'pending':
          return {
            title: 'Danışanın onayı bekleniyor',
            description: `Danışan ilk girişinde neyin tutulacağını görüp onaylayacak. Onaylayana kadar ${words.record} kaydedilmez ve eski kayıtlar gösterilmez.`,
          };
        case 'declined':
          return {
            title: 'Danışan onay vermedi',
            description: `Danışan sağlık verisi tutulmasına onay vermedi; ${words.record} kaydedilmez ve eski kayıtlar gösterilmez. Fikrini değiştirirse kendi ekranından onay verebilir.`,
          };
        case 'outdated':
          return {
            title: 'Onay yenilenecek',
            description: `Danışanın onayı bu parçanın güncel kapsamını ya da metnini kapsamıyor; bir sonraki girişinde yeniden sorulacak. O zamana kadar ${words.record} kaydedilmez ve eski kayıtlar gösterilmez.`,
          };
      }
    },
    /** Kilitliyken yazım: "Kaydedilemez: sağlık modülü kapalı." */
    cannotSave: (lockTitle: string) => `Kaydedilemez: ${lower(lockTitle)}.`,
    malformed: (path: string) => `${path} beklenen biçimde değil.`,
    clientNotFound: 'Danışan bulunamadı.',
    measurementMissing: 'Bu tarihte ölçüm yok; silinmiş olabilir.',
    measurementAlreadyDeleted: 'Bu tarihte ölçüm yok; zaten silinmiş olabilir.',
  },
  /** Uçların ortak yanıtları. */
  api: {
    forbidden: 'Bu işlem için yetkin yok.',
    notFound: 'Bulunamadı.',
    invalid: 'Bilgileri kontrol et.',
  },
  /** "Sağlık" sekmesinin parçaları ve ortak parçalar. */
  parts: {
    labels: { conditions: 'Kısıtlar', measurements: 'Ölçümler', screening: 'Hareket' } satisfies Record<'conditions' | 'measurements' | 'screening', string>,
    nav: 'Sağlık bölümleri',
    notSelected: 'seçili değil',
    pending: '(bekleyen var)',
    lockEdit: 'Danışanın düzenleme sayfasına git',
    lockBack: 'Danışanın sayfasına dön',
  },
  /** Kısıtlar sayfası. */
  constraintsPage: {
    title: 'Kısıtlar',
    description: 'Sakatlık, rahatsızlık ve kaçınılacak hareketler. Program düzenleyicisi ve antrenmandaki “Değiştir” bunlara göre süzer.',
    add: 'Kısıt ekle',
    clientUnreadable: 'Danışan kaydı okunamadı',
    recordUnreadable: 'Sağlık kaydı okunamadı',
    brokenDetail: 'Kayıt uygulama dışında değiştirilmiş olabilir; düzeltilene kadar kısıt yazılmaz.',
    /** "Lomber disk hernisi · hekim ya da fizyoterapist". */
    diagnosisLine: (condition: string, source: string | null) => `${condition} · ${source ? lower(source) : 'kaynak yok'}`,
    findingLine: (condition: string) => `Gözlem: ${condition}`,
    edit: 'Düzenle',
    urgentPrefix: 'Acil: ',
    changeBetter: (wasSevere: boolean) => `Danışan düzeldi dedi${wasSevere ? ' (önce şiddetli demişti)' : ''}.`,
    changeWorse: (from: string | null, to: string | null) => `Danışan güncelledi · ${from ? `${lower(from)} → ` : ''}${to ? lower(to) : 'kötüleşti'} dedi`,
    severeNote: 'Sen karar verene kadar bu bölgeyi çalıştıran hareketler dikkat alır, danışan kartta not görür.',
    refer: 'Kırmızı bayrak: sağlık profesyoneline yönlendir.',
    referred: (date: string) => `Yönlendirildi · ${date} · görüş bekleniyor`,
    redFlagNote: 'Görüş alınana kadar bu bölgeyi çalıştıran hareketler dikkat alır, bu kısıtın yasaklarına izin verilemez; danışan kartta not görür.',
    cleared: (date: string, basis: string, scope: string | null) => `Görüş alındı · ${date} · ${lower(basis)}${scope ? ` · “${scope}”` : ''}`,
    avoid: (list: string) => `Kaçın: ${list}`,
    noAvoid: 'Kaçınılacak hareket seçilmedi.',
    inProgram: 'Programda:',
    programClear: 'sorun yok',
    programCounts: (blocked: number, warned: number) => [blocked ? `${blocked} yaptırma` : null, warned ? `${warned} dikkat` : null].filter(Boolean).join(' · '),
    toClient: (note: string) => `Danışana: “${note}”`,
    yourNote: (note: string) => `Notun: ${note}`,
    emptyTitle: 'Kayıtlı kısıt yok',
    emptyDescription: 'Sakatlık, rahatsızlık ya da hekimin kaçınmasını söylediği bir hareket varsa ekle; danışan da kendi ekranından bildirebilir.',
    pendingTitle: 'Karar bekliyor',
    reportedAt: (date: string) => `Danışan bildirdi · ${date}`,
    triggers: (list: string) => `Zorlayanlar: ${list} (şimdiden dikkat olarak işliyor)`,
    severeReport: 'Şiddetli: karar verene kadar bu bölgeyi çalıştıran hareketler de dikkat alır.',
    asIsAvoids: (list: string) => `Olduğu gibi onaylarsan kaçınılır: ${list}.`,
    noTriggers: 'Zorlayan seçilmedi: olduğu gibi kaydedersen hiçbir hareket değişmez.',
    active: (count: number) => `Etkin (${count})`,
    noActive: 'Etkin kısıt yok.',
    overrides: (count: number) => `İzin verilen hareketler (${count})`,
    deletedExercise: 'Silinmiş egzersiz',
    overrideInactive: ' · kısıt kapalı, etkisiz',
    closed: (count: number) => `Kapananlar (${count})`,
    declinedBadge: 'Kısıt olarak alınmadı',
    closedBadge: 'Kapandı',
    open: 'Aç',
    log: 'Değişiklik kaydı',
    byClient: 'danışan',
  },
  /** Kısıt formu. */
  constraintForm: {
    newTitle: 'Kısıt ekle',
    newDescription: 'Bölge, tür ve kaçınılacak hareketler; tanı ve notlar isteğe bağlı.',
    editTitle: (label: string) => `${label} · kısıt`,
    confirmTitle: (label: string) => `${label} · bildirimi onayla`,
    editDescription: 'Değiştir; değişiklik kısıtın kaydına yazılır.',
    confirmDescription: 'Danışanın cevapları ve zorlayanlardan gelen öneri dolu; kaydedince onaylanır.',
    fallbackTitle: 'Kısıt',
    reportTitle: 'Danışanın bildirimi',
    reportTriggers: (list: string) => `Zorlayanlar: ${list}`,
    noReportTriggers: 'Zorlayan seçmedi.',
    back: 'Kısıtlar',
    noDiagnosis: 'Tanı yok',
    noFinding: 'Gözlem yok',
    saved: 'Kısıt kaydedildi.',
    confirmed: 'Bildirim onaylandı.',
    updated: 'Kısıt güncellendi.',
    confirmSave: 'Onayla ve kaydet',
    whereTitle: 'Nerede',
    whereHint: 'Çift bölgede taraf zorunlu. Egzersiz etiketleri taraf ayırmaz: tek bacak hareketinde kısıt iki taraf için geçerlidir.',
    region: 'Bölge',
    side: 'Taraf',
    whatTitle: 'Ne',
    whatHint: 'Tanıyı sen koyma; danışanın doktorundan ya da fizyoterapistinden öğrendiğini seç. Seçilirse kütüphanenin kanıta dayalı kuralları da çalışır.',
    type: 'Tür',
    diagnosis: 'Sağlık profesyonelinin koyduğu tanı (varsa)',
    diagnosisHint: 'Bölgeye göre süzülür. Danışan yalnız hekim ya da fizyoterapist kaynaklı tanının adını görür.',
    diagnosisSource: 'Tanının kaynağı',
    emergencyDetail: 'Bu tanıda egzersiz yazılmaz; görüş alınsa da izin verilemez.',
    redFlagTitle: 'Kırmızı bayrak: sağlık profesyoneline yönlendir',
    redFlagDetail:
      'Kaydedince Kısıtlar’da iki adım çıkar: “Sağlık profesyoneline yönlendirdim” ve “Görüş alındı”. Görüş alınana kadar bu bölgeyi çalıştıran hareketler dikkat alır, bu kısıtın yasaklarına izin verilemez ve danışan kartta not görür.',
    surgery: 'Ameliyat tarihi',
    surgeryHint: 'Haftaya bağlı kurallar (açık zincir diz açma) buna göre.',
    graft: 'Greft',
    unknown: 'Bilinmiyor',
    stage: 'Tendinopati evresi',
    finding: 'Gözlem (yalnız sen görürsün)',
    findingHint: 'Postür ya da hareket gözlemi; danışana hiç gösterilmez.',
    severityTitle: 'Şiddet ve başlangıç',
    severityHint: 'Şiddet gösterim ve “kötüleşti” içindir; süzgeci değiştirmez. Yalnız danışanın “şiddetli” demesi, sen bakana kadar bölgeyi çalıştıran hareketlere dikkat ekler.',
    severity: 'Şiddet',
    severityAll: 'Hafif: antrenmanı etkilemiyor · Orta: bazı hareketlerde zorluyor · Şiddetli: günlük hayatı etkiliyor.',
    onset: 'Başlangıç',
    onsetHint: 'Bildiğin kesinlikte: yıl (2024), ay (2026-08) ya da gün (2026-08-12).',
    notesTitle: 'Notlar',
    notesHint: 'Danışana not antrenmandaki hareket kartında ve Sağlık sayfasında görünür.',
    note: 'Senin notun (danışan görmez)',
    clientNote: 'Danışana not',
    clientNotePlaceholder: 'Ağrısız aralıkta kal, derine inme.',
    clientNoteHint: (max: number) => `En fazla ${max} karakter. Tanı adı yazma.`,
    avoidTitle: 'Kaçınılacak hareketler',
    avoidHint: 'Program düzenleyicisi ve antrenmandaki “Değiştir” bunlara uymayan hareketi yaptırmaz (“öne eğilme” yalnız dikkat). Etiketi eksik hareket “uygun” sayılmaz.',
    avoidWarn: (label: string) => `${label} (dikkat)`,
    preview: (blocked: number, warned: number, unassessed: number, untagged: number) =>
      `Önizleme: kütüphanede ${blocked} yaptırma · ${warned} dikkat · ${unassessed} eksik bilgi · ${untagged} kontrol edilmedi (etiketsiz).`,
    previewEmpty: 'Kaçınma ya da tanı seçince kütüphanedeki etkisi burada görünür.',
    previewLink: 'Kayıtlı kısıtlarla listede gör',
    saveFailed: 'Kaydedilemedi',
    leave: 'Çıkarsan kısıttaki değişiklikler kaydedilmez.',
  },
  /** Kısıt kartlarının eylemleri. */
  constraintActions: {
    reportConfirmed: 'Bildirim onaylandı.',
    reportSaved: 'Bildirim kaydedildi.',
    reportDeclined: 'Bildirim kapatıldı.',
    confirmEdit: 'Onayla ve düzenle',
    confirmAsIs: 'Olduğu gibi onayla',
    saveUnfiltered: 'Kaydet (süzgeçsiz)',
    decline: 'Kaydetmeden kapat',
    declineTitle: 'Bildirim kısıt olmadan kapansın mı?',
    declineBody: 'Hiçbir hareket değişmez; danışanın bildirdiği zorlayanların dikkati de kalkar. İstersen danışana kısa bir not bırak.',
    declineNote: 'Danışana not (isteğe bağlı)',
    declinePlaceholder: 'Kas ağrısı; yoklamada söylemen yeter.',
    seenMarked: 'Gördün olarak işaretlendi.',
    saved: 'Kaydedildi.',
    seen: 'Gördüm',
    close: 'Kapat',
    keepActive: 'Etkin kalsın',
    referSaved: 'Yönlendirme kaydedildi.',
    opinionSaved: 'Görüş kaydedildi.',
    referDate: 'Yönlendirme günü',
    referred: 'Sağlık profesyoneline yönlendirdim',
    opinionDate: 'Görüş günü',
    basis: 'Dayanak',
    scope: 'Kapsam (isteğe bağlı)',
    scopePlaceholder: 'Tam yük; derin squat 6 hafta yok',
    opinionReceived: 'Görüş alındı',
    overrideRemoved: 'İzin kaldırıldı.',
    removeOverride: (title: string) => `${title} iznini kaldır`,
    remove: 'Kaldır',
    reopened: 'Kısıt yeniden açıldı.',
    closed: 'Kısıt kapatıldı.',
    deleted: 'Kısıt silindi.',
    reopen: 'Yeniden aç',
    deleteTitle: (label: string) => `${label} silinsin mi?`,
    deleteBody: 'Yanlış kayıt içindir; geçmişi kalsın istiyorsan “Kapat”. Bu kısıta verilen izinler de silinir. Danışanın kaydının değişiklik geçmişinde bir kopyası kalır.',
  },
  /** Kısıt uçlarının hata mesajları. */
  constraintApi: {
    notFound: 'Kısıt bulunamadı.',
    saveFailed: 'Kısıt kaydedilemedi.',
    deleteFailed: 'Kısıt silinemedi.',
    exerciseMissing: 'Bu hareket kütüphanede yok.',
    overrideSaveFailed: 'İzin kaydedilemedi.',
    overrideNotFound: 'İzin bulunamadı.',
    overrideRemoveFailed: 'İzin kaldırılamadı.',
    deletedExercise: 'Silinmiş egzersiz',
  },
  /** Şema mesajları (kısıt, tarama, ölçüm, yoklama). */
  validation: {
    isoDate: 'Tarih YYYY-AA-GG olmalı.',
    calendarDate: 'Takvimde olmayan tarih.',
    number: 'Sayı gir.',
    integer: 'Tam sayı gir.',
    min: (min: number) => `En az ${min}.`,
    max: (max: number) => `En fazla ${max}.`,
    nonNegative: 'Negatif olamaz.',
    maxMinutes: (max: number) => `En fazla ${max} dakika.`,
    minMinutes: (min: number) => `En az ${min} dakika.`,
    maxSeconds: (max: number) => `En fazla ${max} sn.`,
    minCm: (min: number) => `En az ${min} cm.`,
    maxCm: (max: number) => `En fazla ${max} cm.`,
    maxChars: (max: number) => `En fazla ${max} karakter.`,
    unknownCondition: 'Bilinmeyen kısıt kimliği.',
    unknownConditionRef: 'Sözlükte olmayan kimlik.',
    symptomDirection: 'Semptom yönünü seç.',
    irritability: 'İrritabiliteyi seç.',
    redFlag: 'Kırmızı bayrak sorusunu cevapla.',
    nothingToSave: 'Kaydedilecek cevap yok.',
    unknownMeasurement: 'Bilinmeyen ölçüm.',
    constraintIdInvalid: 'Kısıt kimliği geçersiz.',
    exerciseIdInvalid: 'Egzersiz kimliği geçersiz.',
    constraintNotFound: 'Kısıt bulunamadı.',
    exerciseNotFound: 'Egzersiz bulunamadı.',
    severity: 'Şiddeti seç.',
    onset: 'Başlangıç YYYY, YYYY-AA ya da YYYY-AA-GG olmalı.',
    region: 'Bölgeyi seç.',
    side: 'Tarafı seç.',
    type: 'Türü seç.',
    diagnosisSource: 'Tanının kaynağını seç.',
    basis: 'Dayanağı seç.',
    tooManyConditions: (max: number) => `En fazla ${max} kısıt.`,
    /** Danışanın bildirimi. */
    report: {
      region: 'Nerede olduğunu seç.',
      side: 'Hangi taraf olduğunu seç.',
      type: 'Ne olduğunu seç.',
      severity: 'Ne kadar etkilediğini seç.',
    },
  },
};

/** Kilit metinlerinde parçanın adı: belirtme hâli ("“Kısıtlar”ı"), kaydın adı ve açılınca ne olur. */
const PART_WORDS: Record<HealthField, { accusative: string; record: string; entry: string }> = {
  conditions: { accusative: '“Kısıtlar”ı', record: 'kısıt', entry: 'kısıt girebilirsin' },
  readiness: { accusative: '“Hazır oluşluk”u', record: 'hazır oluşluk', entry: 'hazır oluşluk sorulur' },
  check_in: { accusative: '“Ağrı takibi”ni', record: 'ağrı kaydı', entry: 'ağrı soruları sorulur' },
  measurements: { accusative: '“Ölçümler”i', record: 'ölçüm', entry: 'ölçüm girebilirsin' },
  screening: { accusative: '“Hareket taraması”nı', record: 'kamera ölçümü ve hareket testi', entry: 'kamera ölçümü alıp hareket testi girebilirsin' },
};

export default tr;
