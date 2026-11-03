import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vibrate } from './haptics.ts';

test('vibrate navigator yokken atmaz', () => {
  assert.doesNotThrow(() => vibrate());
  assert.doesNotThrow(() => vibrate([10, 40, 10]));
});
