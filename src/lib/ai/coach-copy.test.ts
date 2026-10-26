import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROGRAM_COPY, sensitiveNotice } from './coach-copy.ts';

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
