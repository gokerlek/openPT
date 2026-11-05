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
