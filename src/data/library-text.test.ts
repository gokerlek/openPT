import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ATTACHMENT_LIBRARY } from './attachment-library.ts';
import { DEVICE_LIBRARY } from './device-library.ts';
import { EXERCISE_LIBRARY } from './exercise-library.ts';
import { EXERCISE_LIBRARY_EN } from './exercise-library.en.ts';
import { localizeAttachment, localizeDevice, localizeExercise, localizedLibraryTitle } from './library-text.ts';

/**
 * Temel davranış: Türkçe hiç değişmez, PT'nin içeriği çevrilmez, tabloda olmayan kimlik ya da alan Türkçe kalır.
 * İngilizce tabloların dolu olup olmadığından bağımsız (çeviriler ayrı görevde gelir).
 */
const exercise = EXERCISE_LIBRARY[0]!;
const device = DEVICE_LIBRARY[0]!;
const attachment = ATTACHMENT_LIBRARY[0]!;

describe('kütüphane metni', () => {
  test('Türkçede aynı nesne', () => {
    assert.equal(localizeExercise(exercise, 'tr'), exercise);
    assert.equal(localizeDevice(device, 'tr'), device);
    assert.equal(localizeAttachment(attachment, 'tr'), attachment);
  });

  test("PT'nin öğesi (aynı kimlikte değiştirdiği sürüm dahil) çevrilmez", () => {
    const custom = { ...exercise, source: 'custom' as const };
    assert.equal(localizeExercise(custom, 'en'), custom);
    const customDevice = { ...device, source: 'custom' as const };
    assert.equal(localizeDevice(customDevice, 'en'), customDevice);
    const customAttachment = { ...attachment, source: 'custom' as const };
    assert.equal(localizeAttachment(customAttachment, 'en'), customAttachment);
  });

  test('tabloda olmayan kimlik Türkçe kalır', () => {
    const unknown = { ...exercise, id: 'boyle-bir-hareket-yok' };
    assert.equal(localizeExercise(unknown, 'en'), unknown);
    assert.equal(localizeDevice({ ...device, id: 'boyle-bir-cihaz-yok' }, 'en').name, device.name);
    assert.equal(localizeAttachment({ ...attachment, id: 'boyle-bir-aparat-yok' }, 'en').name, attachment.name);
  });

  test('kütüphane öğesi İngilizcede tablodan, eksik alan Türkçeden; kodlar değişmez', () => {
    const localized = localizeExercise({ ...exercise, source: 'library' as const }, 'en');
    const text = EXERCISE_LIBRARY_EN[exercise.id];
    assert.equal(localized.title, text?.title || exercise.title);
    assert.equal(localized.description, text?.description ?? exercise.description);
    assert.deepEqual(localized.cues, text?.cues ? [...text.cues] : exercise.cues);
    assert.equal(localized.source, 'library');
    assert.deepEqual(localized.primaryMuscles, exercise.primaryMuscles);
    assert.equal(localized.id, exercise.id);
  });
});

describe('geçmişteki ad', () => {
  test('kütüphane adı Türkçede aynen kalır', () => {
    assert.equal(localizedLibraryTitle(exercise.id, exercise.title, 'tr'), exercise.title);
  });

  test('İngilizcede kütüphanenin İngilizce adı, yoksa Türkçesi', () => {
    assert.equal(localizedLibraryTitle(exercise.id, exercise.title, 'en'), EXERCISE_LIBRARY_EN[exercise.id]?.title ?? exercise.title);
  });

  test('İngilizce kaydedilmiş ad Türkçe okuyana Türkçe', () => {
    const en = EXERCISE_LIBRARY_EN[exercise.id]?.title;
    if (en) assert.equal(localizedLibraryTitle(exercise.id, en, 'tr'), exercise.title);
  });

  test("PT'nin verdiği ad, bilinmeyen ya da silinmiş egzersiz: kopya", () => {
    assert.equal(localizedLibraryTitle(exercise.id, 'Benim bench press’im', 'en'), 'Benim bench press’im');
    assert.equal(localizedLibraryTitle('silinmis-hareket', 'Eski ad', 'en'), 'Eski ad');
    assert.equal(localizedLibraryTitle('silinmis-hareket', 'Eski ad', 'tr'), 'Eski ad');
  });
});
