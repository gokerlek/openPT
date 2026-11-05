import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ATTACHMENT_LIBRARY } from '../data/attachment-library.ts';
import { DEVICE_LIBRARY } from '../data/device-library.ts';
import { EXERCISE_LIBRARY } from '../data/exercise-library.ts';
import { ATTACHMENT_LIBRARY_EN } from '../data/attachment-library.en.ts';
import { DEVICE_LIBRARY_EN } from '../data/device-library.en.ts';
import { EXERCISE_LIBRARY_EN } from '../data/exercise-library.en.ts';
import { mergeAttachments, mergeDevices, mergeExercises } from './library-lists.ts';

/** `listExercises` / `listDevices` / `listAttachments`'in birleştirme ve çeviri adımı (okuma sunucuda, bu saf). */
const exercise = EXERCISE_LIBRARY[0]!;
const device = DEVICE_LIBRARY.find((item) => item.notes !== undefined) ?? DEVICE_LIBRARY[0]!;
const attachment = ATTACHMENT_LIBRARY[0]!;

describe('egzersiz listesi', () => {
  test('Türkçede hazır kütüphane olduğu gibi, Türkçe sırayla', () => {
    const list = mergeExercises([], EXERCISE_LIBRARY, 'tr');
    assert.equal(list.length, EXERCISE_LIBRARY.length);
    const found = list.find((item) => item.id === exercise.id)!;
    assert.deepEqual(found, { ...exercise, source: 'library' });
    assert.deepEqual(list.map((item) => item.title), EXERCISE_LIBRARY.map((item) => item.title).sort((a, b) => a.localeCompare(b, 'tr')));
  });

  test('İngilizcede hazır kütüphane çevrilir: ad, açıklama, ipuçları; kodlar değişmez', () => {
    const list = mergeExercises([], EXERCISE_LIBRARY, 'en');
    const found = list.find((item) => item.id === exercise.id)!;
    const text = EXERCISE_LIBRARY_EN[exercise.id]!;
    assert.equal(found.title, text.title);
    assert.equal(found.description, text.description ?? exercise.description);
    assert.deepEqual(found.cues, text.cues ? [...text.cues] : exercise.cues);
    assert.equal(found.source, 'library');
    assert.deepEqual(found.primaryMuscles, exercise.primaryMuscles);
    assert.notEqual(found.title, exercise.title);
  });

  test('İngilizcede sıra İngilizce adlara göre', () => {
    const titles = mergeExercises([], EXERCISE_LIBRARY, 'en').map((item) => item.title);
    assert.deepEqual(titles, [...titles].sort((a, b) => a.localeCompare(b, 'en')));
  });

  test("PT'nin kendi ve hazır bir egzersizi ezen sürümü hiçbir dilde çevrilmez; ezilen hazır sürüm listede yok", () => {
    const own = { ...exercise, title: 'Benim bench pressim', description: 'Benim açıklamam', cues: ['Benim ipucum'] };
    const mine = { ...EXERCISE_LIBRARY[1]!, id: 'benim-hareketim', title: 'Benim hareketim' };
    for (const locale of ['tr', 'en'] as const) {
      const list = mergeExercises([own, mine], EXERCISE_LIBRARY, locale);
      assert.deepEqual(list.find((item) => item.id === exercise.id), { ...own, source: 'custom' });
      assert.deepEqual(list.find((item) => item.id === 'benim-hareketim'), { ...mine, source: 'custom' });
      assert.equal(list.filter((item) => item.id === exercise.id).length, 1);
    }
  });

  test('girdi nesneleri değişmez (çevrilmiş kopya PT dosyasına sızmaz)', () => {
    const before = structuredClone(EXERCISE_LIBRARY[0]);
    mergeExercises([], EXERCISE_LIBRARY, 'en');
    assert.deepEqual(EXERCISE_LIBRARY[0], before);
  });
});

describe('dil verilmezse çeviri yok (istek dışı bağlamlar: unstable_cache içindeki bildirim özeti)', () => {
  test('egzersiz, cihaz ve aparat öğeleri olduğu gibi ve Türkçe sırayla', () => {
    assert.deepEqual(mergeExercises([], EXERCISE_LIBRARY), mergeExercises([], EXERCISE_LIBRARY, 'tr'));
    assert.deepEqual(mergeDevices([], DEVICE_LIBRARY), mergeDevices([], DEVICE_LIBRARY, 'tr'));
    assert.deepEqual(mergeAttachments([], ATTACHMENT_LIBRARY), mergeAttachments([], ATTACHMENT_LIBRARY, 'tr'));
    const found = mergeExercises([], EXERCISE_LIBRARY).find((item) => item.id === exercise.id)!;
    assert.deepEqual(found, { ...exercise, source: 'library' });
    assert.equal(mergeDevices([], DEVICE_LIBRARY).find((item) => item.id === device.id)!.name, device.name);
    assert.equal(mergeAttachments([], ATTACHMENT_LIBRARY).find((item) => item.id === attachment.id)!.name, attachment.name);
  });
});

describe('cihaz ve aparat listeleri', () => {
  test('Türkçe aynen, İngilizce çevrilmiş, PT sürümü dokunulmamış', () => {
    assert.deepEqual(mergeDevices([], DEVICE_LIBRARY, 'tr').find((item) => item.id === device.id), { ...device, source: 'library' });
    const english = mergeDevices([], DEVICE_LIBRARY, 'en').find((item) => item.id === device.id)!;
    assert.equal(english.name, DEVICE_LIBRARY_EN[device.id]!.name);
    assert.equal(english.kind, device.kind);
    const own = { ...device, name: 'Benim cihazım' };
    assert.deepEqual(mergeDevices([own], DEVICE_LIBRARY, 'en').find((item) => item.id === device.id), { ...own, source: 'custom' });

    assert.deepEqual(mergeAttachments([], ATTACHMENT_LIBRARY, 'tr').find((item) => item.id === attachment.id), { ...attachment, source: 'library' });
    assert.equal(mergeAttachments([], ATTACHMENT_LIBRARY, 'en').find((item) => item.id === attachment.id)!.name, ATTACHMENT_LIBRARY_EN[attachment.id]!.name);
    const ownAttachment = { ...attachment, name: 'Benim aparatım' };
    assert.deepEqual(mergeAttachments([ownAttachment], ATTACHMENT_LIBRARY, 'en').find((item) => item.id === attachment.id), { ...ownAttachment, source: 'custom' });
  });

  test('sıra dilin alfabesine göre', () => {
    for (const locale of ['tr', 'en'] as const) {
      const devices = mergeDevices([], DEVICE_LIBRARY, locale).map((item) => item.name);
      assert.deepEqual(devices, [...devices].sort((a, b) => a.localeCompare(b, locale)));
      const attachments = mergeAttachments([], ATTACHMENT_LIBRARY, locale).map((item) => item.name);
      assert.deepEqual(attachments, [...attachments].sort((a, b) => a.localeCompare(b, locale)));
    }
  });
});
