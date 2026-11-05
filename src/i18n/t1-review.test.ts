import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exerciseFilterMessages } from './messages/exercise-filter/index.ts';
import { libraryValidationMessages } from './messages/library-validation/index.ts';
import { programEditorMessages } from './messages/program-editor/index.ts';
import { programLogMessages } from './messages/program-log/index.ts';
import { programValidationMessages } from './messages/program-validation/index.ts';
import { ptLibraryMessages } from './messages/pt-library/index.ts';
import { ptProgramMessages } from './messages/pt-program/index.ts';
import type { Locale } from './locale.ts';
import { DEVICE_LIBRARY } from '../data/device-library.ts';
import { EXERCISE_LIBRARY } from '../data/exercise-library.ts';
import { mergeDevices, mergeExercises } from '../lib/library-lists.ts';

/** Bağımsız incelemenin istediği düzeltmeler (T1). */
const ROOT = join(import.meta.dirname, '..', '..');
const source = (file: string) => readFileSync(join(ROOT, file), 'utf8');

describe('"Belirtilmemiş" Türkçede baytı baytına aynı kalır', () => {
  test('pt-library anahtarı: tr "Belirtilmemiş", en "Not specified" (ortak "Belirtilmedi" değil)', () => {
    for (const section of ['exerciseForm', 'medicalFields'] as const) {
      assert.equal(ptLibraryMessages('tr')[section].notSpecified, 'Belirtilmemiş', section);
      assert.equal(ptLibraryMessages('en')[section].notSpecified, 'Not specified', section);
    }
  });

  test('dört yer (egzersiz formunda üç, tıbbi alanlarda bir) ortak "Belirtilmedi"yi kullanmaz', () => {
    const exerciseForm = source('src/app/dashboard/exercises/exercise-form.tsx');
    const medicalFields = source('src/app/dashboard/exercises/medical-fields.tsx');
    assert.equal(exerciseForm.includes('common.states.notSpecified'), false);
    assert.equal(medicalFields.includes('common.states.notSpecified'), false);
    assert.equal(exerciseForm.match(/empty=\{t\.notSpecified\}/g)?.length, 3);
    assert.equal(medicalFields.match(/empty=\{t\.notSpecified\}/g)?.length, 1);
  });
});

/** T1 sözlüklerinin hepsi, bir dildeki bütün metinler (dize ve fonksiyon gövdesi) düz metin olarak. */
function allText(locale: Locale): string {
  const trees = [
    ptLibraryMessages(locale),
    ptProgramMessages(locale),
    programEditorMessages(locale),
    programLogMessages(locale),
    programValidationMessages(locale),
    libraryValidationMessages(locale),
    exerciseFilterMessages(locale),
  ];
  return JSON.stringify(trees, (_key, value) => (typeof value === 'function' ? String(value) : value));
}

describe('sözlük kaydı (terimler)', () => {
  test('"hareket testi" her yerde "movement test": "movement screening" kalmadı', () => {
    assert.equal(/movement screening/i.test(allText('en')), false);
    assert.match(programEditorMessages('en').exerciseSheet.painNote('squat'), /movement test/);
    assert.match(programEditorMessages('en').editorItems.screeningPain('squat'), /^Movement test:/);
  });

  test('yaptırma süzgeç durumu her yerde "blocked" (Avoid / banned değil), dikkat "caution"', () => {
    const text = allText('en');
    assert.equal(/\bbann(?:ed|ing)\b/i.test(text), false, 'banned/banning');
    assert.equal(exerciseFilterMessages('en').exerciseFilter.decisions.block, 'Blocked');
    assert.equal(exerciseFilterMessages('en').exerciseFilter.decisions.warn, 'Caution');
    assert.equal(ptLibraryMessages('en').medicalCard.avoidLabel, 'Blocked with these limitations');
    assert.equal(ptLibraryMessages('en').medicalFields.avoidLabel, 'Blocked');
    assert.equal(ptLibraryMessages('en').exerciseList.hideBlocked, 'Hide blocked');
  });

  test('"N. hafta / M" → "Week N of M" (Türkçe aynı)', () => {
    assert.equal(ptProgramMessages('en').programPage.weekOf(2, 6), 'Week 2 of 6');
    assert.equal(ptProgramMessages('tr').programPage.weekOf(2, 6), 'Hafta 2 / 6');
  });
});

describe('çoğul', () => {
  test('kas yükü: set sayısı tekil/çoğul; Türkçe değişmez', () => {
    const en = programEditorMessages('en').phaseLoad;
    assert.equal(en.versusPlanned('0', '1', 1), '0 / 1 set');
    assert.equal(en.versusPlanned('1', '4', 4), '1 / 4 sets');
    assert.equal(en.versusPlanned('1.5', '2.5', 2.5), '1.5 / 2.5 sets');
    assert.equal(en.versusUnplanned('1', 1), '1 set · not in the plan');
    assert.equal(en.versusUnplanned('3', 3), '3 sets · not in the plan');
    const tr = programEditorMessages('tr').phaseLoad;
    assert.equal(tr.versusPlanned('1', '4', 4), '1 / 4 set');
    assert.equal(tr.versusUnplanned('3', 3), '3 set · planda yok');
  });

  test('kas yükü: "haftada N kez" tekil/çoğul', () => {
    const en = programEditorMessages('en').phaseLoad;
    assert.match(en.weeklyByFrequency(3, 3, '1', 1), /each workout is done 1 time a week on average\.$/);
    assert.match(en.weeklyByFrequency(3, 2, '1.5', 1.5), /each workout is done 1\.5 times a week on average\.$/);
    assert.equal(
      programEditorMessages('tr').phaseLoad.weeklyByFrequency(3, 2, '1,5', 1.5),
      'Planlanan haftalık yük: haftada 3 gün, 2 antrenman → her antrenman ortalama haftada 1,5 kez.',
    );
  });

  test('yedek tekrar (RIR) yedeği: 1 rep, 2 reps; Türkçe aynı', () => {
    assert.equal(programLogMessages('en').diff.rirFallback(1), '1 rep in reserve');
    assert.equal(programLogMessages('en').diff.rirFallback(4), '4 reps in reserve');
    assert.equal(ptLibraryMessages('en').templateSequence.rirFallback(1), '1 rep in reserve');
    assert.equal(ptLibraryMessages('en').templateSequence.rirFallback(2), '2 reps in reserve');
    assert.equal(programLogMessages('tr').diff.rirFallback(1), '1 tekrar yedekte');
    assert.equal(ptLibraryMessages('tr').templateSequence.rirFallback(1), '1 tekrar yedekte');
  });
});

describe('kütüphane listeleri okuyanın dilinde; düzenleme sayfaları düzenlenen kaydı HAM okur', () => {
  test('GET uçları dili listeye verir (İngilizce istek İngilizce hazır öğe alır)', () => {
    assert.match(source('src/app/api/exercises/route.ts'), /listExercises\(undefined, locale\)/);
    assert.match(source('src/app/api/devices/route.ts'), /listDevices\(undefined, locale\)/);
    assert.match(source('src/app/api/attachments/route.ts'), /listAttachments\(undefined, locale\)/);
  });

  test('T5 işaretçileri kalmadı: sayfalar dili listeye verir', () => {
    const pages = [
      'src/app/dashboard/exercises/page.tsx',
      'src/app/dashboard/exercises/[id]/page.tsx',
      'src/app/dashboard/devices/page.tsx',
      'src/app/dashboard/devices/new/page.tsx',
      'src/app/dashboard/devices/[id]/page.tsx',
      'src/app/dashboard/attachments/page.tsx',
      'src/app/dashboard/attachments/[id]/page.tsx',
      'src/app/dashboard/templates/page.tsx',
      'src/app/dashboard/templates/[id]/page.tsx',
      'src/app/dashboard/templates/[id]/edit/page.tsx',
    ];
    for (const page of pages) assert.equal(source(page).includes('i18n-followup(T5)'), false, page);
  });

  test('düzenleme sayfaları: düzenlenen kayıt dil verilmeden (ham), gösterilen ad dille okunur', () => {
    const edits: [string, string, string][] = [
      ['src/app/dashboard/exercises/[id]/edit/page.tsx', 'listExercises', 'readCustomExercises'],
      ['src/app/dashboard/devices/[id]/edit/page.tsx', 'listDevices', 'readCustomDevices'],
      ['src/app/dashboard/attachments/[id]/edit/page.tsx', 'listAttachments', 'readCustomAttachments'],
    ];
    for (const [file, list, custom] of edits) {
      const text = source(file);
      assert.match(text, /HAM:/, `${file}: ham okuma açıklaması`);
      assert.match(text, new RegExp(`${list}\\(await loadCustom\\(\\)\\)`), `${file}: düzenlenen kayıt dil verilmeden`);
      assert.match(text, new RegExp(`${list}\\(await loadCustom\\(\\), locale\\)`), `${file}: gösterim listesi dille`);
      assert.match(text, new RegExp(`${custom}\\(\\)`), file);
      assert.match(text, /\.\.\.editable\s*\}\s*=\s*(?:exercise|device|attachment)\b/, `${file}: form ham kayıttan dolar`);
    }
  });

  test('sözleşme: dil verilmezse hazır öğe ham (Türkçe), dille çevrilir; PT\'nin kaydı olduğu gibi', () => {
    const exercise = EXERCISE_LIBRARY.find((item) => mergeExercises([], [item], 'en')[0]?.title !== item.title);
    assert.ok(exercise, 'İngilizcesi farklı bir hazır egzersiz var');
    assert.equal(mergeExercises([], [exercise])[0]?.title, exercise.title);
    assert.notEqual(mergeExercises([], [exercise], 'en')[0]?.title, exercise.title);
    const custom = { ...exercise, title: 'PT yazdı' };
    assert.equal(mergeExercises([custom], [exercise], 'en')[0]?.title, 'PT yazdı');
    const device = DEVICE_LIBRARY.find((item) => mergeDevices([], [item], 'en')[0]?.name !== item.name);
    assert.ok(device);
    assert.equal(mergeDevices([], [device])[0]?.name, device.name);
  });
});

describe('blok düzenleyici', () => {
  test('cihaz değiştirme bağlamı (`swapContext`) okuyanın dilini taşır', () => {
    const text = source('src/components/block-editor/block-items.tsx');
    assert.match(text, /const swapContext = useMemo\(\(\) => \(\{ exercises: exerciseList, devices, familyOf, locale \}\), \[exerciseList, devices, locale\]\);/);
  });
});
