import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { moveItem, moveKey, moveTargetOf, moveTo } from './reorder.ts';

describe('moveKey', () => {
  const keys = Object.freeze(['a', 'b', 'c']);

  test('bir yukarı ve bir aşağı', () => {
    assert.deepEqual(moveKey(keys, 'b', 'up'), ['b', 'a', 'c']);
    assert.deepEqual(moveKey(keys, 'b', 'down'), ['a', 'c', 'b']);
  });

  test('başa ve sona', () => {
    assert.deepEqual(moveKey(keys, 'c', 'top'), ['c', 'a', 'b']);
    assert.deepEqual(moveKey(keys, 'a', 'end'), ['b', 'c', 'a']);
  });

  test('uçta, bilinmeyen anahtarda ve tek öğede aynı dizi döner', () => {
    assert.equal(moveKey(keys, 'a', 'up'), keys);
    assert.equal(moveKey(keys, 'a', 'top'), keys);
    assert.equal(moveKey(keys, 'c', 'down'), keys);
    assert.equal(moveKey(keys, 'c', 'end'), keys);
    assert.equal(moveKey(keys, 'x', 'up'), keys);
    const one = Object.freeze(['a']);
    assert.equal(moveKey(one, 'a', 'down'), one);
    assert.equal(moveKey(one, 'a', 'top'), one);
  });

  test('girdiyi değiştirmez', () => {
    const before = [...keys];
    moveKey(keys, 'b', 'up');
    moveKey(keys, 'a', 'end');
    assert.deepEqual(keys, before);
  });
});

test('moveTo: üzerine bırakılan öğenin sırasına', () => {
  assert.deepEqual(moveTo(['a', 'b', 'c', 'd'], 'a', 'c'), ['b', 'c', 'a', 'd']);
  assert.deepEqual(moveTo(['a', 'b', 'c', 'd'], 'd', 'b'), ['a', 'd', 'b', 'c']);
  assert.deepEqual(moveTo(['a', 'b'], 'a', 'a'), ['a', 'b']);
  assert.deepEqual(moveTo(['a', 'b'], 'a', 'x'), ['a', 'b']);
});

test('moveItem: adım ve bırakma, uçta aynı', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const ids = (list: { id: string }[]) => list.map((item) => item.id);
  assert.deepEqual(ids(moveItem(items, (item) => item.id, 'b', 'up')), ['b', 'a', 'c']);
  assert.deepEqual(ids(moveItem(items, (item) => item.id, 'a', 'up')), ['a', 'b', 'c']);
  assert.deepEqual(ids(moveItem(items, (item) => item.id, 'a', { over: 'c' })), ['b', 'c', 'a']);
});

test('moveTargetOf: yalnız Alt ile', () => {
  assert.equal(moveTargetOf({ altKey: true, key: 'ArrowUp' }), 'up');
  assert.equal(moveTargetOf({ altKey: true, key: 'ArrowDown' }), 'down');
  assert.equal(moveTargetOf({ altKey: true, key: 'Home' }), 'top');
  assert.equal(moveTargetOf({ altKey: true, key: 'End' }), 'end');
  assert.equal(moveTargetOf({ altKey: false, key: 'ArrowUp' }), null);
  assert.equal(moveTargetOf({ altKey: true, key: 'a' }), null);
});
