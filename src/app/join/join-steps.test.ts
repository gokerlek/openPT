import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { joinStepTotal } from './join-steps.ts';

describe('kare kodla katılımın adım sayısı', () => {
  test('uygulama olarak açıksa yükleme adımı yok: 2 adım', () => {
    assert.equal(joinStepTotal('installed'), 2);
  });

  test('diğer her durumda (ve cihaz henüz bilinmezken) 3 adım', () => {
    for (const guide of ['prompt', 'ios-safari', 'ios-other', 'android-in-app', 'mac-safari', 'menu', null] as const) {
      assert.equal(joinStepTotal(guide), 3, String(guide));
    }
  });
});
