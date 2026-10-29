import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { focusOf, workoutHref } from './workout-nav.ts';

describe('antrenman adresi', () => {
  test('odak ve liste işareti eklenir/çıkar; program kalır, bitir düşer', () => {
    assert.equal(workoutHref('/me/antrenman', '?program=pt&bitir=1', { list: true }), '/me/antrenman?program=pt&liste=1');
    assert.equal(workoutHref('/me/antrenman', '?program=pt&liste=1', { focus: 'b_aaaaaa' }), '/me/antrenman?program=pt&liste=1&hareket=b_aaaaaa');
    assert.equal(workoutHref('/me/antrenman', '?liste=1&hareket=b_aaaaaa', { focus: null }), '/me/antrenman?liste=1');
    assert.equal(workoutHref('/me/antrenman', '?liste=1', { list: false }), '/me/antrenman');
  });

  test('odak yalnız birim anahtarı biçiminde: blok ya da eklenen hareketin kaydı', () => {
    assert.equal(focusOf(new URLSearchParams('hareket=b_k2m9x4')), 'b_k2m9x4');
    assert.equal(focusOf(new URLSearchParams('hareket=e_k2m9x4')), 'e_k2m9x4');
    assert.equal(focusOf(new URLSearchParams('hareket=../x')), null);
    assert.equal(focusOf(new URLSearchParams('')), null);
  });
});
