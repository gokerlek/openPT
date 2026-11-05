# İngilizce klinik metinler: uzman incelemesi listesi

Türkçe metinler değişmedi. İngilizceleri çeviriyle yazıldı ve henüz bir fizyoterapist ya da hekim okumadı (SPEC §9 madde 10). İngilizce kullanılmadan önce aşağıdakiler okunmalı. Her dosyada Türkçe karşılığı aynı klasördeki `tr.ts`'tedir.

## Öncelik 1: güvenlik ve acil durum
- `src/i18n/messages/health/en.ts`
  - Acil bildirim satırı (`reportSafety.urgent`): idrar/dışkılama değişikliği, genital bölge/kalça/iç bacakta uyuşma, yeni bacak güçsüzlüğü → acile git. Türkçede "kasıkta uyuşma" yazıyor; İngilizce daha ayrıntılı. Türkçe de buna göre güncellensin mi?
  - `reportSafety.other`: gece uyandıran ağrı, düşme ya da darbe sonrası yük verememe, hızla şişen ya da kilitlenen eklem.
  - Acil yönlendirme (`emergencyText`), kırmızı bayrak soruları ve kısıt formundaki uyarılar.
- `src/i18n/messages/client-home/en.ts`: sağlık onayı metni, bildirim ve sağlık sayfası metinleri, "acile git" cümleleri.
- `src/i18n/messages/pt-library/en.ts` → `exerciseFilter.rules`, özellikle cauda equina: "Do not prescribe exercise: urgent medical evaluation is needed."

## Öncelik 2: klinik terimler
- **Kısıtlar** (`health/en.ts`):
  - bölge adları ("Wrist", "Ankle", "Upper back")
  - türler (Condition, Post-operative, Movement limitation)
  - tanı kaynağı ("Physician or physical therapist")
  - "opinion received"; "clearance" bilerek kullanılmadı
  - tendinopati evreleri
  - kaçınılacak 15 hareket ("Open-chain end-range knee extension", "90° abduction + end-range external rotation", "High shear force", "Forward bending / lifting from the floor" …)
- **Durumlar** (`catalog/en.ts` → conditions): etiketler ve notlar. Tek çalışmaya dayalı oran ya da nedensellik cümleleri var (Türkçede de aynı).
- **Hareket testi** (`screening/en.ts`): 8 testin adları, kurulumları, kaçan noktalar, ipuçları ve kaynakları. Bacak boyu ölçümü (ASIS → iç ayak bileği).
- **Ağrı yoklaması** (`client-workout/en.ts` check-in bölümü): merkezileşme/çevreselleşme, irritabilite, tolerans modları ve gerekçeleri.
- **Egzersiz filtresi** (`exercise-filter/en.ts`, `pt-library/en.ts`): "apprehension position", "centralization", "scapular plane", "terminal extension".
