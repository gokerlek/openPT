import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tracksSwipe } from './swipe-intent.ts';

const base = { enabled: true, onGrabber: false, isPrimary: true, pointerType: 'touch', button: 0, inTextField: false } as const;

test('fareyle metin alanında başlayan basış kaydırma değil (metin seçimi); dokunmatikte kaydırır', () => {
  assert.equal(tracksSwipe({ ...base, pointerType: 'mouse', inTextField: true }), false);
  assert.equal(tracksSwipe({ ...base, pointerType: 'pen', inTextField: true }), false);
  assert.equal(tracksSwipe({ ...base, pointerType: 'touch', inTextField: true }), true);
  assert.equal(tracksSwipe({ ...base, pointerType: 'mouse' }), true);
});

test('kapalıyken, tutamaçta, ikincil parmakta ve farenin öbür tuşlarında izlenmez', () => {
  assert.equal(tracksSwipe({ ...base, enabled: false }), false);
  assert.equal(tracksSwipe({ ...base, onGrabber: true }), false);
  assert.equal(tracksSwipe({ ...base, isPrimary: false }), false);
  assert.equal(tracksSwipe({ ...base, pointerType: 'mouse', button: 2 }), false);
});
