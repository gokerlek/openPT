import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ATTACHMENT_LIBRARY } from '../data/attachment-library.ts';
import { DEVICE_LIBRARY } from '../data/device-library.ts';
import { EXERCISE_LIBRARY } from '../data/exercise-library.ts';
import { deleteExercise, pinAlternatives, saveAttachmentImage, saveDeviceImage, saveExercise } from '../lib/catalog-actions.ts';
import { fakeRepo } from '../lib/testing/fake-repo.ts';
import { LOCALES, type Locale } from './locale.ts';

/**
 * Örtük kayıtlar (sabitleme, görsel) hazır kütüphane kaydını PT'nin repo'suna kopyalar. Kopya HAM (Türkçe) kütüphane
 * kaydıdır, isteğin diline göre çevrilmiş değil: PT'nin repo'su dilden bağımsız kalır, okurken `localize*` çevirir.
 * PT'nin formda gördüğü ve bilerek kaydettiği değerler (`saveExercise`) ise olduğu gibi yazılır.
 */

const EX = 'data/exercises.json';
const DEV = 'data/devices.json';
const ATT = 'data/attachments.json';

const exercise = EXERCISE_LIBRARY.find((item) => item.id === 'halter-bench-press');
const device = DEVICE_LIBRARY.find((item) => item.id === 'kablo-istasyonu');
const attachment = ATTACHMENT_LIBRARY.find((item) => item.id === 'halat');
assert.ok(exercise && device && attachment, 'hazır kütüphanede örnek kayıtlar var');

const stored = (repo: ReturnType<typeof fakeRepo>, path: string, id: string) =>
  (repo.get(path) as { id: string }[] | undefined)?.find((item) => item.id === id);

describe('örtük override ham kütüphane kaydını yazar', () => {
  for (const locale of LOCALES) {
    test(`sabitleme (${locale})`, async () => {
      const repo = fakeRepo({ [EX]: [{ id: 'pt-a', ...rest(exercise, 'PT A') }] });
      const { status } = await pinAlternatives(repo.files, 'halter-bench-press', { alternatives: ['pt-a'] }, locale);
      assert.equal(status, 200);
      assert.deepEqual(stored(repo, EX, 'halter-bench-press'), JSON.parse(JSON.stringify({ ...exercise, alternatives: ['pt-a'] })));
    });

    test(`cihaz görseli (${locale})`, async () => {
      const repo = fakeRepo();
      const { status, body } = await saveDeviceImage(repo.files, 'kablo-istasyonu', new Uint8Array([1, 2, 3]), 'png', locale);
      assert.equal(status, 200);
      assert.deepEqual(stored(repo, DEV, 'kablo-istasyonu'), JSON.parse(JSON.stringify({ ...device, image: body.image })));
    });

    test(`aparat fotoğrafı (${locale})`, async () => {
      const repo = fakeRepo();
      const { status, body } = await saveAttachmentImage(repo.files, 'halat', new Uint8Array([1, 2, 3]), 'png', locale);
      assert.equal(status, 200);
      assert.deepEqual(stored(repo, ATT, 'halat'), JSON.parse(JSON.stringify({ ...attachment, image: body.image })));
    });
  }

  test('commit mesajı yazanın dilinde, kayıt içeriği değişmez', async () => {
    const tr = fakeRepo();
    const en = fakeRepo();
    await saveDeviceImage(tr.files, 'kablo-istasyonu', new Uint8Array([1, 2, 3]), 'png', 'tr');
    await saveDeviceImage(en.files, 'kablo-istasyonu', new Uint8Array([1, 2, 3]), 'png', 'en');
    assert.deepEqual(stored(tr, DEV, 'kablo-istasyonu'), stored(en, DEV, 'kablo-istasyonu'));
    const messages = (repo: ReturnType<typeof fakeRepo>) => repo.changes().map((entry) => entry.message);
    assert.match(String(messages(tr)[0]), /^Cihaz görseli: /);
    assert.match(String(messages(en)[0]), /^Equipment image: /);
  });
});

describe('uç yanıtları isteğin dilinde', () => {
  const localized = async (locale: Locale) => {
    const repo = fakeRepo();
    const invalid = await saveExercise(repo.files, { title: 'x' }, locale);
    const library = await deleteExercise(repo.files, 'halter-bench-press', locale);
    return { invalid, library };
  };

  test('varsayılan Türkçe, en İngilizce; alan hataları şemadan', async () => {
    const tr = await localized('tr');
    const en = await localized('en');
    assert.equal(tr.invalid.body.error, 'Bilgileri kontrol et.');
    assert.equal(en.invalid.body.error, 'Check the information.');
    assert.equal((en.invalid.body.fields as Record<string, string>).title, 'The exercise name is too short.');
    assert.equal((tr.invalid.body.fields as Record<string, string>).title, 'Egzersiz adı çok kısa.');
    assert.equal(tr.library.body.error, 'Bu egzersiz hazır kütüphaneden geliyor, silinemez.');
    assert.equal(en.library.body.error, 'This exercise comes from the built-in library; it can\'t be deleted.');
  });
});

/** Egzersizin kimliksiz gövdesi, başka başlıkla (PT egzersizi örneği). */
function rest(item: NonNullable<typeof exercise>, title: string) {
  const { id: _id, alternatives: _alternatives, ...body } = item;
  return { ...body, title };
}
