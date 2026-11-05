import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';
import { EXERCISE_LIBRARY } from '../data/exercise-library.ts';
import { describeRule, trendView } from '../app/dashboard/clients/[id]/measurements/measurement-text.ts';
import { cameraErrorMessage } from '../lib/camera-preview.ts';
import { assessTolerance, IRRITABILITY_LEVELS, RED_FLAG_CHECKS, SYMPTOM_DIRECTIONS, TOLERANCE_MODES } from '../lib/check-in.ts';
import { careInputOf, careLine, evaluateCare, optionCareText, rowCareText, type RowCare } from '../lib/constraint-filter.ts';
import {
  addConstraint,
  afterReportText,
  AVOID_TAG_IDS,
  CLEARANCE_BASES,
  constraintMeta,
  CONSTRAINT_REGIONS,
  CONSTRAINT_SIDES,
  CONSTRAINT_TYPES,
  ConstraintError,
  DIAGNOSIS_SOURCES,
  emergencyText,
  GRAFTS,
  ONSET_CHOICES,
  regionText,
  reportConstraint,
  reportSafety,
  resolveConstraint,
  SEVERITIES,
  STAGES,
  TRIGGERS,
} from '../lib/constraints.ts';
import { STAGES as EXPOSURE_STAGES } from '../lib/exposure.ts';
import { healthLockInfo, checkValues } from '../lib/measurement-log.ts';
import { measurementTrends } from '../lib/measurement-trends.ts';
import { MEASUREMENT_IDS, measurementDef, measurementUnitLabels } from '../lib/measurements.ts';
import { CaptureSession } from '../lib/pose/capture.ts';
import { metricLabels, POSE_TASKS, protocols } from '../lib/pose/protocols.ts';
import { reportSchema } from '../lib/schemas/constraint.ts';
import type { HealthRecord } from '../lib/schemas/health.ts';
import { measurementFormSchema } from '../lib/schemas/measurement.ts';
import {
  cellTitle,
  clientScreeningRows,
  outcomeClientLabels,
  outcomeLabels,
  RESULT_CHOICES,
  resultChoiceLabels,
  SCREENING_PROTOCOL,
  SCREENING_TEST_IDS,
  screeningHints,
  screeningTest,
  testName,
  withScreening,
} from '../lib/screening.ts';
import { screeningMarks } from '../lib/screening-care.ts';
import { healthMessages } from './messages/health/index.ts';
import { measurementsMessages } from './messages/measurements/index.ts';
import { screeningMessages } from './messages/screening/index.ts';
import { langConfig } from './valibot.ts';

/**
 * T4'ün İngilizce çıktısı: her klinik kodun İngilizce adı var (Türkçeden farklı, Türkçe harfsiz); kısıt gerekçeleri,
 * danışanın kart notu, kayıt satırları, yoklama gerekçeleri, tarama ipuçları ve ölçüm metinleri İngilizce; Türkçe
 * çıktı aynı kalır.
 */

const TURKISH = /[çğıİşÇĞŞöüÖÜ]/;
const NOW = '2026-09-27T10:00:00.000Z';
const TODAY = '2026-09-27';
const empty = (): HealthRecord => ({ version: 2, checkIns: [], measurements: [] });
const exercise = (id: string) => {
  const found = EXERCISE_LIBRARY.find((item) => item.id === id);
  if (!found) throw new Error(id);
  return found;
};

/** Her kodun İngilizce adı dolu, Türkçe harfsiz; adların en az biri Türkçeden farklı (çevrilmiş). */
function assertLabels<K extends string | number>(codes: readonly K[], tr: Record<K, string>, en: Record<K, string>, name: string) {
  for (const code of codes) {
    const label = en[code];
    assert.ok(typeof label === 'string' && label.trim().length > 0, `${name}.${code}: İngilizce ad yok`);
    assert.ok(!TURKISH.test(label), `${name}.${code}: İngilizcede Türkçe harf: ${label}`);
  }
  assert.ok(
    codes.some((code) => tr[code] !== en[code]),
    `${name}: İngilizce adlar Türkçeyle aynı`,
  );
}

describe('klinik kodların İngilizce adları', () => {
  const tr = healthMessages('tr');
  const en = healthMessages('en');

  test('kısıt: bölge, taraf, tür, şiddet, kaynak, dayanak, greft, evre, zorlayan, başlangıç, kaçınma', () => {
    assertLabels(CONSTRAINT_REGIONS, tr.constraints.regions, en.constraints.regions, 'regions');
    assertLabels(CONSTRAINT_SIDES, tr.constraints.sides, en.constraints.sides, 'sides');
    assertLabels(CONSTRAINT_TYPES, tr.constraints.types, en.constraints.types, 'types');
    assertLabels(CONSTRAINT_TYPES, tr.constraints.typeClient, en.constraints.typeClient, 'typeClient');
    assertLabels(SEVERITIES, tr.constraints.severities, en.constraints.severities, 'severities');
    assertLabels(SEVERITIES, tr.constraints.severityDescriptions, en.constraints.severityDescriptions, 'severityDescriptions');
    assertLabels(DIAGNOSIS_SOURCES, tr.constraints.diagnosisSources, en.constraints.diagnosisSources, 'diagnosisSources');
    assertLabels(CLEARANCE_BASES, tr.constraints.clearanceBases, en.constraints.clearanceBases, 'clearanceBases');
    assertLabels(GRAFTS, tr.constraints.grafts, en.constraints.grafts, 'grafts');
    assertLabels(STAGES, tr.constraints.stages, en.constraints.stages, 'stages');
    assertLabels(TRIGGERS, tr.constraints.triggers, en.constraints.triggers, 'triggers');
    assertLabels(ONSET_CHOICES, tr.constraints.onsetChoices, en.constraints.onsetChoices, 'onsetChoices');
    assertLabels(AVOID_TAG_IDS, tr.constraints.avoid, en.constraints.avoid, 'avoid');
  });

  test('yoklama ve hareket deneyimi', () => {
    assertLabels(SYMPTOM_DIRECTIONS, tr.checkIn.symptomDirections, en.checkIn.symptomDirections, 'symptomDirections');
    assertLabels(IRRITABILITY_LEVELS, tr.checkIn.irritability, en.checkIn.irritability, 'irritability');
    assertLabels(RED_FLAG_CHECKS, tr.checkIn.redFlags, en.checkIn.redFlags, 'redFlags');
    assertLabels(TOLERANCE_MODES, tr.checkIn.toleranceModes, en.checkIn.toleranceModes, 'toleranceModes');
    assertLabels(EXPOSURE_STAGES, tr.exposureStages, en.exposureStages, 'exposureStages');
  });

  test('tarama: her testin adı, kurulumu, kolaylaştırılmış sürümü, dayanağı ve her noktası', () => {
    for (const testId of SCREENING_TEST_IDS) {
      const trTest = screeningTest(testId, 'tr');
      const enTest = screeningTest(testId, 'en');
      for (const key of ['title', 'short', 'setup', 'easier', 'source'] as const) {
        assert.ok(enTest[key] && !TURKISH.test(enTest[key]), `${testId}.${key}: ${enTest[key]}`);
      }
      assert.notEqual(enTest.setup, trTest.setup, testId);
      assert.equal(Boolean(enTest.sideNote), Boolean(trTest.sideNote), `${testId}.sideNote`);
      assert.deepEqual(
        enTest.points.map((point) => point.id),
        trTest.points.map((point) => point.id),
        `${testId}: noktalar aynı sırada`,
      );
      for (const point of enTest.points) {
        for (const key of ['label', 'hint', 'focus'] as const) assert.ok(point[key] && !TURKISH.test(point[key]), `${testId}.${point.id}.${key}`);
      }
    }
    const outcomes = Object.keys(outcomeLabels('tr')) as (keyof ReturnType<typeof outcomeLabels>)[];
    assertLabels(outcomes, outcomeLabels('tr'), outcomeLabels('en'), 'outcomes');
    assertLabels(outcomes, outcomeClientLabels('tr'), outcomeClientLabels('en'), 'outcomesClient');
    assertLabels(RESULT_CHOICES, resultChoiceLabels('tr'), resultChoiceLabels('en'), 'resultChoices');
  });

  test('ölçümler: her ölçümün adı ve sıklığı, birimler (puan kayıtta kod kalır)', () => {
    for (const id of MEASUREMENT_IDS) {
      const def = measurementDef(id, 'en');
      assert.ok(def.label && !TURKISH.test(def.label), `${id}.label`);
      assert.ok(def.frequency && !TURKISH.test(def.frequency), `${id}.frequency`);
      assert.equal(def.unit, measurementDef(id, 'tr').unit, `${id}: birim kodu aynı`);
      assert.equal(Boolean(def.note), Boolean(measurementDef(id, 'tr').note), `${id}.note`);
    }
    assert.equal(measurementDef('visa_p', 'en').unit, 'puan');
    assert.deepEqual(measurementUnitLabels('en'), { kg: 'kg', cm: 'cm', s: 's', '%': '%', puan: 'points' });
    assert.equal(measurementUnitLabels('tr').s, 'sn');
  });

  test('kamera: her protokolün başlığı, alt başlığı, yönergeleri ve açılarının adı', () => {
    const en = protocols('en');
    const tr = protocols('tr');
    for (const task of POSE_TASKS) {
      assert.ok(en[task].title && !TURKISH.test(en[task].title), task);
      assert.ok(en[task].subtitle && !TURKISH.test(en[task].subtitle), task);
      assert.equal(en[task].instructions.length, tr[task].instructions.length, task);
      for (const line of en[task].instructions) assert.ok(!TURKISH.test(line), `${task}: ${line}`);
      assert.deepEqual({ ...en[task], title: '', subtitle: '', instructions: [] }, { ...tr[task], title: '', subtitle: '', instructions: [] }, task);
      for (const metric of en[task].metrics) assert.ok(metricLabels('en')[metric] && !TURKISH.test(metricLabels('en')[metric]!), metric);
    }
  });
});

describe('kısıt cümleleri İngilizce', () => {
  const kneeRecord = addConstraint(empty(), { region: 'knee', side: 'left', type: 'injury', avoid: ['deep_knee_flexion'] }, { id: 'k_000001', now: NOW });

  test('bölge ve kartın ikinci satırı', () => {
    assert.equal(regionText({ region: 'knee', side: 'left' }, 'en'), 'Left knee');
    assert.equal(regionText({ region: 'knee', side: 'both' }, 'en'), 'Both knees');
    assert.equal(regionText({ region: 'lower_back' }, 'en'), 'Lower back');
    assert.equal(regionText({ region: 'knee', side: 'left' }), 'Sol diz');
    assert.equal(constraintMeta({ type: 'condition', severity: 'moderate', onset: '2026-08' }, 'en'), 'Condition · moderate · onset Aug 2026');
    assert.equal(constraintMeta({ type: 'condition', severity: 'moderate', onset: '2026-08' }), 'Rahatsızlık · orta · başlangıç Ağu 2026');
  });

  test('süzgecin gerekçesi okuyanın dilinde', () => {
    const en = careInputOf(kneeRecord, { today: TODAY, painConsent: false, locale: 'en' });
    const tr = careInputOf(kneeRecord, { today: TODAY, painConsent: false });
    assert.equal(evaluateCare(exercise('hack-squat'), en).reasons[0]?.message, 'Left knee: deep knee flexion (over 90°)');
    assert.equal(evaluateCare(exercise('hack-squat'), tr).reasons[0]?.message, 'Sol diz: derin diz bükme (90° üstü)');
  });

  test('bekleyen bildirimin zorlayanı', () => {
    const reported = reportConstraint(
      empty(),
      { region: 'knee', side: 'right', type: 'injury', severity: 'mild', triggers: ['squat'] },
      { id: 'k_000002', now: NOW, today: TODAY, locale: 'en' },
    );
    const input = careInputOf(reported, { today: TODAY, painConsent: false, locale: 'en' });
    assert.equal(evaluateCare(exercise('hack-squat'), input).reasons[0]?.message, 'Client reported (decision pending): Right knee · squatting');
    assert.equal(reported.constraintLog?.[0]?.text, 'Right knee reported (mild)');
  });

  test('danışanın kart notu, Bugün satırı ve "Değiştir" satırı', () => {
    const blocked: RowCare = { kind: 'avoid', label: 'Left knee', region: 'knee', side: 'left' };
    assert.deepEqual(rowCareText(blocked, 'en'), {
      title: 'Note: Left knee',
      text: "Your trainer will change this exercise for your left knee. For today, pick an alternative from 'Swap'.",
    });
    assert.equal(
      rowCareText({ kind: 'note', label: 'Lower back', region: 'lower_back' }, 'en').text,
      'Your trainer planned this exercise with your lower back in mind. Stay in a pain-free range; if pain increases, skip the exercise or tap Swap.',
    );
    assert.equal(rowCareText({ kind: 'report', label: 'Right knee', region: 'knee', side: 'right' }, 'en').text, 'This may strain the right knee you reported; if it causes pain, skip it.');
    assert.equal(careLine(blocked, 'Back Squat', 'en'), 'Swap (left knee): Back Squat');
    assert.equal(careLine({ ...blocked, own: true }, 'Back Squat', 'en'), 'Not recommended (left knee): Back Squat');
    assert.equal(careLine({ ...blocked, kind: 'note' }, 'Back Squat', 'en'), 'Caution (left knee): Back Squat');
    const result = evaluateCare(exercise('hack-squat'), careInputOf(kneeRecord, { today: TODAY, painConsent: false, locale: 'en' }));
    assert.equal(optionCareText({ ...result, reasons: result.reasons.map((reason) => ({ ...reason, decision: 'warn' as const })) }, 'en'), 'Caution: left knee');
  });

  test('kayıt satırı yazanın dilinde; Türkçe aynı', () => {
    const en = addConstraint(empty(), { region: 'knee', side: 'left', type: 'injury', avoid: ['deep_knee_flexion'] }, { id: 'k_000003', now: NOW, locale: 'en' });
    assert.equal(en.constraintLog?.[0]?.text, 'Left knee added · avoid: deep knee flexion (over 90°)');
    assert.equal(kneeRecord.constraintLog?.[0]?.text, 'Sol diz eklendi · kaçın: derin diz bükme (90° üstü)');
    assert.equal(resolveConstraint(en, 'k_000003', { now: NOW, locale: 'en' }).constraintLog?.[0]?.text, 'Left knee closed');
  });

  test('kural hatası okuyanın dilinde; .message Türkçe', () => {
    try {
      resolveConstraint(empty(), 'k_missing', { now: NOW });
      assert.fail('hata bekleniyordu');
    } catch (error) {
      assert.ok(error instanceof ConstraintError);
      assert.equal(error.message, 'Kısıt bulunamadı; silinmiş olabilir.');
      assert.equal(error.localized('en'), 'Limitation not found; it may have been deleted.');
    }
  });

  test('güvenlik ve acil yönlendirme metinleri', () => {
    assert.equal(emergencyText('en'), 'Urgent: refer the client to the emergency department today.');
    assert.match(reportSafety('en').urgent, /emergency department without waiting\.$/);
    assert.match(reportSafety('en').other, /see a health professional before you train\.$/);
    assert.match(afterReportText({ severity: 'severe', type: 'injury' }, 'en'), /see a health professional\.$/);
  });

  test('şema mesajları isteğin dilinde', () => {
    const body = { region: 'nowhere', type: 'injury', severity: 'mild', triggers: [] };
    const parsed = v.safeParse(reportSchema, body, langConfig('en'));
    assert.deepEqual(!parsed.success && parsed.issues.map((issue) => issue.message), ['Choose where it is.']);
    const tr = v.safeParse(reportSchema, body);
    assert.deepEqual(!tr.success && tr.issues.map((issue) => issue.message), ['Nerede olduğunu seç.']);
  });
});

describe('yoklama gerekçeleri İngilizce', () => {
  test('kırmızı bayrak ve tavan', () => {
    const result = assessTolerance({ current: { date: TODAY, redFlag: 'night_pain', painPeak: 6 }, locale: 'en' });
    assert.deepEqual(
      result.reasons.map((reason) => reason.message),
      ['New red flag (pain that wakes you at night): no load without a medical assessment.', 'Pain during the session 6/10, ceiling 3/10: load is reduced.'],
    );
  });
});

describe('tarama metinleri İngilizce', () => {
  const screened = withScreening(empty(), {
    date: TODAY,
    tests: {
      squat: { result: 'standard', missed: ['heels'] },
      shoulder_flexion: { right: { pain: true } },
    },
  });
  const screening = screened.screenings![0]!;

  test('testin adı ve hücre başlığı', () => {
    assert.equal(testName('hinge', 'en'), 'Hip hinge');
    assert.equal(cellTitle('shoulder_flexion', 'right', false, 'en'), 'Arm raise (right)');
    assert.equal(cellTitle('shoulder_flexion', 'right'), 'Kol kaldırma (sağ)');
  });

  test('ipuçları ve danışanın satırları', () => {
    const hints = screeningHints(screening, () => undefined, undefined, 'en').map((hint) => hint.text);
    assert.deepEqual(hints, [
      'Arm raise, right: painful; no suggestion. Re-screen after an assessment.',
      "Squat (With compensation · heels lifted): can be loaded; cue: heels down; if that doesn't fix it, heel support.",
    ]);
    const rows = clientScreeningRows(screening, null, outcomeClientLabels('en'), 'en');
    assert.deepEqual(rows[0], {
      testId: 'squat',
      title: 'Squat',
      sides: [{ side: 'center', label: '', text: 'With compensation', outcome: 'compensated', change: null }],
      focus: 'keep your heels on the floor',
    });
    assert.equal(screening.protocol, SCREENING_PROTOCOL);
    // Sağlık sayfası etiket vermeden yalnız dili geçirir: sözcükler yine okuyanın dilinde.
    assert.equal(clientScreeningRows(screening, null, undefined, 'en')[0]?.sides[0]?.text, 'With compensation');
    assert.equal(clientScreeningRows(screening, null)[0]?.sides[0]?.text, 'Telafiyle');
  });

  test('düzenleyicinin tarama işaretleri', () => {
    const marks = screeningMarks(screened.screenings!, [{ id: 'press', pattern: 'vertical_push' }], { titleOf: () => undefined, locale: 'en' });
    assert.deepEqual(marks.press?.pain, ['Pain in movement test: Arm raise (right)']);
  });
});

describe('ölçüm metinleri İngilizce', () => {
  const entries = [
    { date: '2026-08-01', id: 'waist_girth' as const, value: 90 },
    { date: '2026-08-15', id: 'waist_girth' as const, value: 88 },
    { date: '2026-08-29', id: 'waist_girth' as const, value: 86 },
  ];

  test('hata payı kaynağı ve kuralın açıklaması', () => {
    const [trend] = measurementTrends(entries, {}, 'en');
    assert.equal(trend?.rule?.source, 'WHO: technical error of measurement for waist circumference ~1.3–1.6 cm');
    assert.equal(
      describeRule(trend!.rule!, 'cm', 'en'),
      'A change under 2 cm counts as measurement error (WHO: technical error of measurement for waist circumference ~1.3–1.6 cm). Lower is better.',
    );
    assert.equal(measurementTrends(entries)[0]?.rule?.source, 'WHO: bel çevresinde teknik ölçüm hatası ~1,3–1,6 cm');
  });

  test('eğilimin hükmü ve kartın uyarı sözcükleri', () => {
    const view = trendView({ kind: 'improving', change: -4, from: '2026-08-01', to: '2026-08-29', points: 3, beforeRange: 0, used: [] } as never, 'cm', 'en');
    assert.equal(view.text, '4-week trend: real improvement (−4 cm)');
    assert.equal(view.detail, 'From 3 measurements in 1 Aug–29 Aug.');
    assert.deepEqual(measurementsMessages('en').card.alerts, { declining: 'decline', plateau: 'plateau', improving: 'real improvement' });
    assert.equal(measurementsMessages('en').card.alertName('Calf circumference', 'Left'), 'Calf circumference (left)');
  });

  test('değer denetimi, şema ve kilit metinleri', () => {
    assert.deepEqual(checkValues([{ id: 'calf_girth', value: 30 }], 'en').errors, { 'calf_girth:left': 'Specify the left or right side.' });
    const parsed = v.safeParse(measurementFormSchema, { date: '2026-02-30', sex: 'unknown', values: {} }, langConfig('en'));
    assert.ok(!parsed.success && parsed.issues[0]?.message === 'Choose a valid date.');
    assert.equal(healthLockInfo('measurements', 'pending', 'en').title, "Waiting for the client's consent");
    assert.equal(healthLockInfo('measurements', 'pending').title, 'Danışanın onayı bekleniyor');
  });

  test('kamera hataları ve çekimin tamamlanamama nedeni', () => {
    assert.equal(cameraErrorMessage({ name: 'NotFoundError' }, 'en'), 'No camera found. You can use another device or measure manually.');
    const session = new CaptureSession('front', 0);
    const result = session.finish(100, 'en');
    assert.deepEqual(result, { ok: false, reason: "Couldn't get enough clear frames. Steady the camera, check the light and framing, and try again." });
  });

  test('sözlüklerde klinik metin İngilizcede Türkçe harf taşımaz', () => {
    assert.ok(!TURKISH.test(JSON.stringify(screeningMessages('en').tests)));
    assert.ok(!TURKISH.test(JSON.stringify(measurementsMessages('en').defs)));
  });
});

describe('inceleme düzeltmeleri', () => {
  test('kart notu bölgeyi cümlenin dilinde yeniden kurar (etiket başka dilde gelse de)', () => {
    const turkishLabel: RowCare = { kind: 'report', label: 'İki diz', region: 'knee', side: 'both' };
    assert.equal(rowCareText(turkishLabel, 'en').text, 'This may strain both knees you reported; if it causes pain, skip it.');
    assert.equal(rowCareText(turkishLabel, 'en').title, 'Note: Both knees');
    assert.equal(
      rowCareText({ kind: 'severe', label: 'Left knee', region: 'knee', side: 'left' }, 'tr').text,
      "Kötüleştiğini bildirdiğin sol diz için zorlayabilir. Antrenörün bakana kadar ağrı yaparsa geç ya da Değiştir'e dokun.",
    );
    assert.equal(rowCareText({ kind: 'report', label: 'Başka bir yer', region: 'other' }, 'en').text, 'This may strain the area you reported; if it causes pain, skip it.');
    assert.equal(careLine({ kind: 'note', label: 'Sol diz', region: 'knee', side: 'left' }, 'Back Squat', 'en'), 'Caution (left knee): Back Squat');
    const kneeRecord = addConstraint(empty(), { region: 'knee', side: 'left', type: 'injury', avoid: ['deep_knee_flexion'] }, { id: 'k_000009', now: NOW });
    const turkish = evaluateCare(exercise('hack-squat'), careInputOf(kneeRecord, { today: TODAY, painConsent: false }));
    const warned = { ...turkish, reasons: turkish.reasons.map((reason) => ({ ...reason, decision: 'warn' as const })) };
    assert.equal(optionCareText(warned, 'en'), 'Caution: left knee');
    assert.equal(optionCareText(warned), 'Sol diz için dikkatli');
  });

  test('güvenlik metinleri (klinik gözden geçirme bekliyor)', () => {
    assert.equal(
      reportSafety('en').other,
      "If pain wakes you at night, you can't put weight on the area after a fall or a blow, or a joint swells quickly or locks, see a health professional before you train.",
    );
    assert.equal(
      reportSafety('en').urgent,
      'If you have a new change in urination or bowel movements, numbness around your genitals, bottom or inner thighs, or new leg weakness, go to the emergency department without waiting.',
    );
  });

  test('zorlayanlar tarafsız, ABD İngilizcesi, çoğullar', () => {
    const en = healthMessages('en');
    assert.equal(en.constraints.triggers.overhead, 'Raising the arm overhead');
    assert.equal(en.constraints.diagnosisSources.clinician, 'Physician or physical therapist');
    assert.equal(en.constraintsPage.programCounts(1, 2), '1 blocked · 2 cautions');
    assert.equal(en.constraintsPage.programCounts(0, 1), '1 caution');
    assert.match(en.constraintForm.preview(0, 1, 0, 0), /· 1 caution ·/);
    assert.equal(en.validation.maxMinutes(1), 'At most 1 minute.');
  });

  test('ölçüm cümleleri', () => {
    const en = measurementsMessages('en');
    assert.equal(
      en.text.forecast.bound('Trend −1 cm per week.', true, '0 cm', 3, '1 Oct 2026'),
      'Trend −1 cm per week. At this rate it reaches the lower limit (0 cm) about 3 weeks after the last measurement (around 1 Oct 2026). The forecast assumes the trend continues.',
    );
    assert.equal(en.camera.wizard.position(1, 3), 'Analysis 1 of 3');
    assert.equal(
      en.camera.meaning.dynamic,
      "For each completed rep, the difference between its largest and smallest angle is taken; the value is the median of those differences. It isn't an instantaneous joint angle.",
    );
  });
});
