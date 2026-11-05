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
