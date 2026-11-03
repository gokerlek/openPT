import { SettingsTabs } from './settings-tabs';

/**
 * Ayarlar tek bölüm: üstte sekmeler (Görünüm · Yapay zekâ · Sürüm), altta seçili sayfa. Sekmeler
 * sayfanın ilk satırıdır ve kullanıcı menüsüne yer bırakır. Sayfalar başlığını (`PageHeader`) ve
 * yetki denetimini (`requirePt`) yine kendileri yapar: layout kardeş sayfanın çalışmasını durdurmaz.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-5">
      <SettingsTabs />
      {children}
    </div>
  );
}
