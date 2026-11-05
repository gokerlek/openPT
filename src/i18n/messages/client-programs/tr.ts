/**
 * Danışanın Programlar sekmesi ve kendi programları (`lib/own-program*`, `lib/own-programs`,
 * `me/(sekmeler)/programlar/**`, `api/me/programs/**`). Varsayılan adlar (`Programım`) veriye yazılır: yazanın
 * dilinde; ad denetimi her dilin ayrılmış adını tanır.
 */
const tr = {
  /** PT'nin programının danışandaki adı: kendi programa verilemez. */
  ptProgramName: 'Antrenörünün programı',
  defaultName: 'Programım',
  /** Programın satırı: "2 antrenman · haftada 2 · Sal, Per · son: 22 Eyl". */
  line: {
    workouts: (count: string, _n: number) => `${count} antrenman`,
    perWeek: (count: string) => `haftada ${count}`,
    noDays: 'gün atanmadı',
    last: (day: string) => `son: ${day}`,
  },
  /** Geçmiş kaydının etiketi, görene göre. */
  log: {
    created: 'Oluşturuldu',
    clientCreated: 'Danışan oluşturdu',
    ptEdited: 'Antrenörün düzenledi',
    youEdited: 'Düzenledin',
    clientEdited: 'Danışan düzenledi',
    fromWorkout: 'Antrenmandan',
    clientUpdated: 'Danışan güncelledi',
    share: 'Paylaşım',
    phase: 'Evre geçişi',
  },
  name: {
    empty: 'Ad gir.',
    tooLong: (max: number) => `En fazla ${max} karakter.`,
    reserved: (name: string) => `"${name}" ad olarak kullanılamaz.`,
    taken: 'Bu adda bir programın var.',
  },
  /** Program geçmişinin cümleleri (yazanın dilinde). */
  changes: {
    fromPt: (days: number) => `antrenörünün programından ${days} gün`,
    fromTemplates: (names: readonly string[]) =>
      `${names.map((name) => `'${name}'`).join(', ')} ${names.length === 1 ? 'şablonundan' : 'şablonlarından'}`,
    created: (parts: readonly string[]) => (parts.length > 0 ? `Program oluşturuldu: ${parts.join(', ')}` : 'Program oluşturuldu'),
    renamed: (from: string, to: string) => `Ad: '${from}' → '${to}'`,
    shared: 'Antrenörle paylaşıldı',
    unshared: 'Paylaşım kapatıldı',
    removed: (title: string) => `${title} çıkarıldı`,
    added: (title: string) => `${title} eklendi`,
  },
  /** Kendi programın commit mesajları (yazanın dilinde). */
  commits: {
    own: (name: string) => `Kendi programı (${name}): `,
    created: 'Program oluşturuldu',
    updated: 'Program güncellendi',
    shared: (shared: boolean) => (shared ? 'antrenörle paylaşıldı' : 'paylaşım kapatıldı'),
    deleted: 'Kendi programı silindi',
    active: (name: string | null) => (name ? `Bugün'ün programı: ${name}` : "Bugün'ün programı: antrenörün programı"),
  },
  /** Kendi program uçlarının mesajları. */
  errors: {
    missing: 'Program bulunamadı.',
    badRequest: 'İstek geçersiz.',
    check: 'Bilgileri kontrol et.',
    deleted: 'Program silindi.',
    staleForPt: 'Bu program sen düzenlerken değişti. Değişikliklerin kaybolmasın diye kaydetmedim.',
    stale: 'Bu program sen düzenlerken değişti (antrenörün ya da başka bir cihazın kaydetti).',
    exists: 'Bu program başka bir yerde oluşturuldu.',
    limit: (max: number) => `En fazla ${max} program; yenisi için birini sil.`,
    unshared: 'Danışan bu programın paylaşımını kapattı.',
    activeSession: 'Yarım antrenmanın bu programdan; önce bitir ya da sil.',
    unavailable: 'Program şu an açılamıyor.',
  },
};

export default tr;
