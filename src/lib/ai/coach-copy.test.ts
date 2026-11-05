import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROGRAM_COPY, programCopy, sensitiveNotice } from './coach-copy.ts';

/** Danışana "sen" diye yazılmış, PT'yi üçüncü kişi sayan ifadeler: PT'nin metninde geçmez. */
const CLIENT_PHRASES = [/PT['’]den/, /antrenörüne/i, /antrenörünle/i, /(^|\s)seni\s/i];
const INTENTS = ['support', 'health_question'] as const;

test('PT copy never contains phrases written to the client', () => {
  const texts = [...Object.values(PROGRAM_COPY.pt), ...INTENTS.map((intent) => sensitiveNotice(intent, 'pt'))];
  for (const text of texts) {
    for (const phrase of CLIENT_PHRASES) assert.ok(!phrase.test(text), `${phrase} → ${text}`);
  }
});

test('the client gets the coach’s own answer, which the check above would catch', () => {
  // Kontrol örneği: danışanın notları bu ifadeleri gerçekten içeriyor; yukarıdaki süzgeç boşa çalışmıyor.
  for (const intent of INTENTS) {
    const text = sensitiveNotice(intent, 'client');
    assert.ok(CLIENT_PHRASES.some((phrase) => phrase.test(text)), text);
    assert.notEqual(text, sensitiveNotice(intent, 'pt'));
  }
});

test('both roles have the same program-tab fields', () => {
  assert.deepEqual(Object.keys(PROGRAM_COPY.pt).sort(), Object.keys(PROGRAM_COPY.client).sort());
});

/** Türkçe metinler dil desteğinden önceki koddan (openpt 98f852e) harfi harfine; sözlük sabitlerine karşı değil, düz metne karşı. */
test('Türkçe program sekmesi metni harfi harfine eski metin', () => {
  assert.deepEqual(PROGRAM_COPY, {
  client: { title: 'Programını hazırlayalım', goal: 'Ne yapmak istiyorsun?', manual: 'Kendim seçeyim', muscles: 'Çalıştırmak istediğin kasları seç', unclear: 'Hedef netleşmedi. Aşağıdan hedef ve kaslarını seçebilirsin.' },
  pt: { title: 'Danışan için program taslağı', goal: 'Danışanın hedefi ne?', manual: 'Koşulları ben seçeyim', muscles: 'Çalışılacak kasları seç', unclear: 'Hedef netleşmedi. Danışanın hedefini ve çalışılacak kasları aşağıdan seçebilirsin.' },
  });
  assert.deepEqual(programCopy('tr'), PROGRAM_COPY);
});

test('Türkçe hassas hedef notları harfi harfine eski metin', () => {
  assert.equal(sensitiveNotice('support', 'pt'), 'Metin ceza, telafi ya da yeme kaygısı içeriyor; AI bunu program hedefine çevirmez. Koşulları elle seçerek devam edebilirsin.');
  assert.equal(sensitiveNotice('health_question', 'pt'), 'Metin ağrı, tanı ya da tedavi içeriyor; AI bundan hedef çıkarmaz, tanı ya da tedavi önermez. Koşulları elle seçerek devam edebilirsin.');
  assert.equal(sensitiveNotice('support', 'client'), 'Bu süreçte seni yargılamıyorum. Egzersiz bir ceza veya yediklerini telafi etme aracı değil. Bugünkü koşullarını birlikte netleştirebilir, antrenörünle paylaşmak istediğin değişiklikleri taslak haline getirebiliriz.');
  assert.equal(sensitiveNotice('health_question', 'client'), 'Kayıtlardaki bulguları özetleyebilirim; bunlardan tanı veya tedavi çıkaramam. Ağrı ya da yeni bir belirti varsa bunu antrenörüne bildir; antrenörün gerekirse uygun sağlık uzmanına yönlendirir. Kamera açısı tek başına bir bozukluk veya düzeltici egzersiz gereksinimi göstermez.');
});
