import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { loadLegend, loadMarks, loadTier, muscleLoadLegend, roleLegend, roleMarks, statusLegend } from './muscle-tiers.ts';
import { MUSCLE_LABELS } from './schemas/exercise.ts';

describe('loadTier', () => {
  test('tek antrenman: 3 ve üstü dolu, 1,5–2,75 çizgili, 1,5 altı noktalı', () => {
    assert.equal(loadTier(6, 'session'), 'filled');
    assert.equal(loadTier(3, 'session'), 'filled');
    assert.equal(loadTier(2.75, 'session'), 'striped');
    assert.equal(loadTier(1.5, 'session'), 'striped');
    assert.equal(loadTier(1.25, 'session'), 'dotted');
    assert.equal(loadTier(0.25, 'session'), 'dotted');
    assert.equal(loadTier(0, 'session'), null);
  });

  test('haftalık: 10 ve üstü dolu, 5–9,75 çizgili, 5 altı noktalı', () => {
    assert.equal(loadTier(25, 'weekly'), 'filled');
    assert.equal(loadTier(10, 'weekly'), 'filled');
    assert.equal(loadTier(9.75, 'weekly'), 'striped');
    assert.equal(loadTier(5, 'weekly'), 'striped');
    assert.equal(loadTier(4.75, 'weekly'), 'dotted');
    assert.equal(loadTier(0, 'weekly'), null);
    assert.equal(loadTier(-1, 'weekly'), null);
  });
});

test('roleMarks: üst rol kazanır, kardiyo yok', () => {
  assert.deepEqual(
    roleMarks({ primaryMuscles: ['quadriceps', 'cardio'], secondaryMuscles: ['glutes', 'quadriceps'], stabilizerMuscles: ['abs_upper', 'glutes'] }),
    { quadriceps: 'filled', glutes: 'striped', abs_upper: 'dotted' },
  );
});

test('loadMarks: kademe, kardiyo ve sıfır dışarıda', () => {
  assert.deepEqual(loadMarks({ quadriceps: 6, glutes: 1.5, soleus: 0.5, biceps: 0, cardio: 3 }, 'session'), {
    quadriceps: 'filled',
    glutes: 'striped',
    soleus: 'dotted',
  });
});

describe('açıklama', () => {
  test('kademeye göre gruplu, setler büyükten küçüğe, boş grup ve sıfır satır yok', () => {
    const legend = muscleLoadLegend({ glutes: 4.5, quadriceps: 6, soleus: 0.5, biceps: 0, cardio: 3 }, 'session');
    assert.deepEqual(
      legend.groups.map((group) => [group.mark, group.title]),
      [
        ['filled', '3 set ve üstü'],
        ['dotted', '1,5 setten az'],
      ],
    );
    assert.deepEqual(
      legend.groups[0]?.rows.map((row) => [row.key, row.sets]),
      [
        ['quadriceps', 6],
        ['glutes', 4.5],
      ],
    );
    assert.equal(legend.groups[0]?.rows[0]?.label, MUSCLE_LABELS.quadriceps);
    assert.equal(legend.cardioSets, 3);
  });

  test('yalnız kardiyo: grup yok, kardiyo satırı var', () => {
    assert.deepEqual(muscleLoadLegend({ cardio: 3 }, 'session'), { groups: [], cardioSets: 3 });
  });

  test('kardiyo 0 ise kardiyo satırı yok', () => {
    assert.equal(muscleLoadLegend({ quadriceps: 3 }, 'weekly').cardioSets, undefined);
  });

  test('not ve uyarı satıra geçer', () => {
    const legend = loadLegend([{ key: 'quadriceps', label: 'Ön bacak', sets: 22, note: 'fazla', warn: true }], 'weekly');
    assert.deepEqual(legend.groups[0]?.rows[0], { key: 'quadriceps', label: 'Ön bacak', sets: 22, note: 'fazla', warn: true });
  });

  test('rol açıklaması: Hedef / Yardımcı / Dengeleyici, kas kas, boş rol yok', () => {
    const legend = roleLegend({ primaryMuscles: ['quadriceps'], secondaryMuscles: [], stabilizerMuscles: ['abs_upper', 'abs_lower'] });
    assert.deepEqual(
      legend.groups.map((group) => [group.mark, group.title, group.rows.map((row) => row.key)]),
      [
        ['filled', 'Hedef', ['quadriceps']],
        ['dotted', 'Dengeleyici', ['abs_upper', 'abs_lower']],
      ],
    );
  });

  test('gelişim açıklaması: dört karar ve hep "Veri az" grubu', () => {
    const legend = statusLegend({ quadriceps: 'declined', glutes: 'strong' });
    assert.deepEqual(
      legend.groups.map((group) => group.mark),
      ['filled', 'striped', 'dotted', 'declined', 'empty'],
    );
    assert.deepEqual(legend.groups[3]?.rows.map((row) => row.key), ['quadriceps']);
    assert.deepEqual(legend.groups[4], { mark: 'empty', title: 'Veri az ya da çalışılmadı', rows: [] });
  });
});
