/**
 * Danışanın Bugün sekmesi, kabuğu ve sağlık ekranları (`me/layout`, `me/(sekmeler)/page`, Bugün kartları, Ayarlar,
 * Sağlık, Ölçüm; `lib/client-tabs`, `check-in-routes`, `me-constraint-routes`, `water`, `pain-report`).
 */
const tr = {
  /** Dock'un sekmeleri (`CLIENT_TABS`, sırayla). */
  tabs: {
    today: 'Bugün',
    programs: 'Program',
    progress: 'İlerleme',
    health: 'Sağlık',
  },
  /** İlerleme şeridinin bölümleri (`PROGRESS_SECTIONS`, sırayla). */
  progressSections: {
    summary: 'Özet',
    history: 'Geçmiş',
    records: 'Rekorlar',
  },
  water: {
    /** Commit mesajının başı: "Su · +2". */
    commit: 'Su',
    noChange: 'Değişiklik yok.',
  },
  /** Ağrı kısayolunun hazır notu (bildirime yazılır; danışanın dilinde). */
  painReport: {
    exercise: (title: string, sessions: number) => `${title} (${sessions} antrenmanda)`,
    note: (items: readonly string[]) => `Ağrı yüzünden geçtiğim: ${items.join(', ')}.`,
  },
  /** Yoklama ve kısıt bildirimi uçları. */
  routes: {
    invalid: 'Kayıt geçersiz.',
    check: 'Bilgileri kontrol et.',
    noHealthConsent: 'Sağlık kaydı için onayın yok.',
    noConstraintConsent: 'Kısıt bildirmek için sağlık onayın yok.',
    healthBroken: 'Sağlık kaydın şu an açılamıyor. Antrenörüne haber ver.',
    constraintMissing: 'Kısıt bulunamadı.',
  },
  /** `health.json`'un commit mesajları (yazanın dilinde). */
  commits: {
    checkIn: 'Yoklama kaydedildi',
    reported: 'Kısıt bildirildi',
    reportEdited: 'Kısıt bildirimi düzeltildi',
    updated: 'Kısıt güncellendi',
    withdrawn: 'Kısıt bildirimi geri çekildi',
  },
};

export default tr;
